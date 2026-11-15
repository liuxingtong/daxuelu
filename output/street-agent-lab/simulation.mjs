import {dist,makeNetwork,layoutMetrics,groundGrid,allowedGround,planGroundPath,moveAlong,demandsFromPeople,nearestRail,railRoute,assignDemand,stepRobot,heatCapacity,DEFAULTS,advanceRail} from './engine.mjs';
import {Environment,personResponse,feltTemperature} from './environment.mjs';
export class Simulation{
 constructor(site,params={}){this.site=site;this.p={...DEFAULTS,fieldHeight:1.1,...params};this.time=0;this.people=[];this.personSeq=0;this.log=[];this.environment=new Environment(site,this.p);this.resetAgents();}
 resetAgents(){
  this.net=makeNetwork(this.p.layout,this.site,this.p.crossCount);this.metrics=layoutMetrics(this.site,this.net,this.p.ringCount,this.p.heatRadius,this.p.ringSpeed,this.p.mode,this.p.transferTime);
  this.rings=this.metrics.bases.map((pos,i)=>({id:`H${String(i+1).padStart(2,'0')}`,pos:[...pos],home:[...pos],path:[],state:'standby',target:null,assigned:[],energy:0,lock:0,travel:0,served:0}));
  const g=groundGrid(this.site,this.p.mode),free=[];for(let i=0;i<g.ok.length;i++)if(g.ok[i])free.push(g.point(i));
  this.robots=Array.from({length:this.p.robotCount},(_,i)=>{const c=this.site.corridor||[0,4,this.site.bounds[2],26],desired=[c[0]+6+i*(c[2]-12)/Math.max(1,this.p.robotCount-1),i%2?c[1]+2:c[3]-2],pos=free.reduce((a,b)=>dist(b,desired)<dist(a,desired)?b:a,free[0]||desired);return{id:`R${String(i+1).padStart(2,'0')}`,pos:[...pos],home:[...pos],state:'idle',path:[],progress:0,occupied:false,assigned:[],target:null,energy:0,travel:0,timer:0,empty:0};});this.demands=[];this.scheduleAt=0;
 }
 addPerson(pos,rest=false){if(!allowedGround(this.site,pos,this.p.mode,.1))return null;const q={id:`P${++this.personSeq}`,pos:[...pos],target:null,path:[],stay:0,rest,created:this.time,servedAt:null,skinTemp:32,mental:'calm',walkSpeed:1.15,social:.5};this.people.push(q);return q;}
 movePerson(person,target){const path=planGroundPath(this.site,person.pos,target,this.p.mode,.15);if(!path.length)return false;person.path=path;person.target=target;person.stay=0;person.servedAt=null;return true;}
 initCrowd(seed=17){
  this.people=[];this.personSeq=0;this.seed=seed;this.auto=true;this.rand=()=>{this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;};
  const g=groundGrid(this.site,this.p.mode,.15,1.2);this.humanCells=[];for(let i=0;i<g.ok.length;i++)if(g.ok[i])this.humanCells.push(g.point(i));
  const pick=()=>this.humanCells[Math.floor(this.rand()*this.humanCells.length)];
  this.hotspots=Array.from({length:5},()=>pick());
  for(let i=0;i<18;i++){const q=this.addPerson(pick());if(q){q.auto=true;q.pauseUntil=0;q.skinTemp=29.5+this.rand()*4.5;q.walkSpeed=.7+this.rand()*.8;q.social=.15+this.rand()*.8;}}
  for(let k=0;k<2;k++){const base=pick(),target=pick();for(let j=0;j<3;j++){const desired=[base[0]+j*.9,base[1]+(j%2)*.8],pos=this.humanCells.reduce((a,b)=>dist(a,desired)<dist(b,desired)?a:b,base);const q=this.addPerson(pos);if(q){q.auto=true;q.group=`G${k+1}`;q.groupGoal=target;q.pauseUntil=0;q.social=.55+this.rand()*.4;}}}
  this.groupWait={};for(const q of this.people.filter(q=>!q.group))this.newDestination(q);for(const id of ['G1','G2'])this.dispatchGroup(this.people.filter(q=>q.group===id));this.event('初始化：18名独行者＋2组结伴行人；社交意愿影响相遇停留与装置吸引');
 }
 dispatchGroup(members){
  if(!members.length)return;
  for(let attempt=0;attempt<10;attempt++){const center=this.humanCells[Math.floor(this.rand()*this.humanCells.length)],plans=[];
   for(let i=0;i<members.length;i++){const desired=[center[0]+Math.cos(i*2*Math.PI/members.length)*1,center[1]+Math.sin(i*2*Math.PI/members.length)*1],goal=this.humanCells.reduce((a,b)=>dist(a,desired)<dist(b,desired)?a:b,center),path=planGroundPath(this.site,members[i].pos,goal,this.p.mode,.15);if(!path.length)break;plans.push({goal,path});}
   if(plans.length===members.length){members.forEach((q,i)=>{q.groupGoal=plans[i].goal;q.target=plans[i].goal;q.path=plans[i].path;q.stay=0;q.servedAt=null;});return;}
  }
 }
 newDestination(q){
  if(!this.humanCells?.length)return;
  for(let i=0;i<6;i++){const hotspotChance=.25+.5*(q.social??.5);let goal=q.groupGoal||((this.rand()<hotspotChance)?this.hotspots[Math.floor(this.rand()*this.hotspots.length)]:this.humanCells[Math.floor(this.rand()*this.humanCells.length)]);if(this.movePerson(q,goal)){q.pauseUntil=Infinity;return;}}
  q.pauseUntil=this.time+5;
 }
 event(text){this.log.unshift({time:this.time,text});this.log=this.log.slice(0,24);}
 findRobotSpot(d){for(const radius of[0,2.5,4,6,8])for(let k=0;k<(radius?12:1);k++){const a=k*Math.PI/6,q=[d.pos[0]+radius*Math.cos(a),d.pos[1]+radius*Math.sin(a)];if(!allowedGround(this.site,q,this.p.mode,2.65))continue;let clear=true;for(let j=0;j<20;j++){let b=j*2*Math.PI/20;if(!allowedGround(this.site,[q[0]+2.3*Math.cos(b),q[1]+2.3*Math.sin(b)],this.p.mode,.35)){clear=false;break;}}if(clear&&!this.robots.some(r=>['serving','inflating'].includes(r.state)&&dist(q,r.pos)<5))return q;}return null;}
 schedule(){
  const p=this.p;this.demands=demandsFromPeople(this.people,p);
  const ringReserve=Math.max(3.3,2*p.heatRadius);
  const releaseRing=h=>{h.target=null;h.assigned=[];h.state='standby';h.path=[];h.goal=null;h.served=0;};
  const keptZones=[];
  for(const h of this.rings){
   if(!h.target)continue;
   const d=this.demands.find(d=>d.id===h.target);
   if(!d){
    if(this.time>=h.lock)releaseRing(h);
    else keptZones.push(h.goal||h.pos);
    continue;
   }
   const q=nearestRail(this.net,d.pos);
   if(q.distance>p.heatRadius){releaseRing(h);continue;}
   const zone=h.goal||q.pos;
   if(keptZones.some(z=>dist(z,zone)<ringReserve)){releaseRing(h);continue;}
   h.assigned=d.ids;
   keptZones.push(zone);
   if(dist(q.pos,h.goal||h.pos)>1.5){const r=railRoute(this.net,h.pos,q.pos);if(r){h.path=r.points.slice(1);h.goal=q.pos;h.state=h.path.length?'transit':'heating';}}
  }
  const reservedZones=[...keptZones];
  const assignedDemands=new Set(this.rings.filter(h=>h.target).map(h=>h.target));
  const candidates=this.demands.filter(d=>!assignedDemands.has(d.id));
  const pairs=assignDemand(this.rings.filter(h=>!h.target),candidates,(h,d)=>{const q=nearestRail(this.net,d.pos);if(q.distance>p.heatRadius)return Infinity;const r=railRoute(this.net,h.pos,q.pos);if(!r)return Infinity;return r.distance/p.ringSpeed+Math.max(0,r.points.length-2)*p.transferTime;});
  const accepted=[];
  for(const pair of pairs){const q=nearestRail(this.net,pair.demand.pos);if(reservedZones.some(z=>dist(z,q.pos)<ringReserve))continue;accepted.push(pair);reservedZones.push(q.pos);}
  for(const{agent:h,demand:d}of accepted){const q=nearestRail(this.net,d.pos),r=railRoute(this.net,h.pos,q.pos);if(!r)continue;h.target=d.id;h.assigned=d.ids;h.goal=q.pos;h.path=r.points.slice(1);h.state=r.distance>.02?'transit':'heating';h.lock=this.time+p.hold;this.event(`${h.id} 最近派单 · 预计 ${(r.distance/p.ringSpeed).toFixed(0)}s · ${d.count}人 · S̄ ${d.social.toFixed(2)}`);}
  for(const r of this.robots){if(r.state==='traveling'&&!this.people.some(q=>r.assigned.includes(q.id)&&(q.rest||q.urgent||q.stay>=(q.triggerAfter??p.dwell)))){r.target=null;r.reservation=null;r.assigned=[];r.state='returning';r.path=planGroundPath(this.site,r.pos,r.home,p.mode,.55);this.event(`${r.id} 需求已散去，释放服务区`);}}
  const ra=new Set(this.robots.filter(r=>r.target).map(r=>r.target)),wanted=this.demands.filter(d=>(d.urgent||d.count>=3||((p.socialPull??0)>0&&d.social>=(p.socialRobotMin??.8)))&&!ra.has(d.id)),options=new Map();for(const d of wanted){const q=this.findRobotSpot(d);if(q)options.set(d.id,q);}
  const paths=new Map();const rp=assignDemand(this.robots.filter(r=>r.state==='idle'),wanted,(r,d)=>{const q=options.get(d.id);if(!q)return Infinity;const path=planGroundPath(this.site,r.pos,q,p.mode,.55);paths.set(r.id+d.id,path);return path.length?path.reduce((s,v,i)=>s+(i?dist(v,path[i-1]):0),0)/p.robotSpeed-(p.socialPull??0)*10*d.social:Infinity;});
  for(const{agent:r,demand:d}of rp){if(this.robots.some(o=>o!==r&&o.reservation&&dist(o.reservation,d.pos)<8))continue;r.path=paths.get(r.id+d.id);r.target=d.id;r.reservation=[...d.pos];r.assigned=d.ids;r.state='traveling';r.empty=0;this.event(`${r.id} 社交加权最近可达 · 预留8m → ${d.urgent?'休息请求':'停留点'} · ${d.count}人 · S̄ ${d.social.toFixed(2)}`);}
 }
 step(dt){
  dt=Math.min(dt,.3);this.time+=dt;const p=this.p;
  for(const person of this.people){person.env=this.environment.sample(person.pos,this);const response=personResponse(person,person.env,p);person.needPriority=response.priority;person.triggerAfter=response.threshold;person.urgent=response.urgent;person.cold=response.cold;person.felt=feltTemperature(person,person.env,p);person.speedNow=(person.walkSpeed??1.15)*response.speedFactor;if(response.urgent&&person.mental!=='calm'){person.path=[];person.auto=false;}const old=[...person.pos];if(person.path?.length){const m=moveAlong(person.pos,person.path,(person.walkSpeed??1.15)*response.speedFactor*dt);person.pos=m.pos;person.path=m.path;}person.stay=dist(old,person.pos)>.005?0:person.stay+dt;}
  if(this.auto){
   for(const q of this.people.filter(q=>q.auto&&!q.rest&&!q.group)){if(!q.path.length&&q.pauseUntil===Infinity)q.pauseUntil=this.time+15+this.rand()*20;if(!q.path.length&&this.time>q.pauseUntil)this.newDestination(q);}
   for(const id of new Set(this.people.filter(q=>q.group&&q.auto&&!q.rest).map(q=>q.group))){const members=this.people.filter(q=>q.group===id&&q.auto&&!q.rest);if(members.every(q=>!q.path.length)){if(!this.groupWait[id])this.groupWait[id]=this.time+20+this.rand()*20;if(this.time>this.groupWait[id]){this.dispatchGroup(members);delete this.groupWait[id];}}else delete this.groupWait[id];}
   for(let i=0;i<this.people.length;i++){const a=this.people[i];if(!a.auto||a.group||a.meetingUntil>this.time||a.rest)continue;for(let j=i+1;j<this.people.length;j++){const b=this.people[j];if(!b.auto||b.group||b.meetingUntil>this.time||b.rest)continue;if(dist(a.pos,b.pos)<2.5){const social=((a.social??.5)+(b.social??.5))/2;if(this.rand()<dt*.2*(.25+1.5*social)){const until=this.time+10+20*social+this.rand()*15;for(const q of[a,b]){q.path=[];q.pauseUntil=until;q.meetingUntil=until;}this.event(`${a.id} 与 ${b.id} 偶遇 · S̄ ${social.toFixed(2)} · 临时停留`);break;}}}}
  }
  if(this.time>=this.scheduleAt){this.schedule();this.scheduleAt=this.time+1.5;}
  for(const h of this.rings){if(h.path.length){const m=advanceRail(h,dt,p.ringSpeed,p.transferTime);const blocked=this.rings.some(o=>o!==h&&dist(m.pos,o.pos)<3.4&&dist(m.pos,o.pos)<dist(h.pos,o.pos));if(!blocked){h.pos=m.pos;h.path=m.path;h.cornerWait=m.cornerWait;h.travel+=m.used;}h.state=blocked?'yielding':h.cornerWait>0?'transfer':h.path.length?'transit':h.target?'heating':'standby';}const near=this.people.filter(q=>h.assigned.includes(q.id)&&dist(q.pos,h.pos)<=p.heatRadius);h.served=h.state==='heating'?Math.min(near.length,heatCapacity(p.power,p.efficiency,p.need,p.maxPeople)):0;h.energy+=(h.state==='heating'?p.power:30)*dt/3600;if(h.served)for(const q of near.slice(0,h.served))if(q.servedAt===null)q.servedAt=this.time;}
  for(let i=0;i<this.robots.length;i++){
   let r=this.robots[i];const near=this.people.filter(q=>r.assigned.includes(q.id)&&dist(q.pos,r.pos)<=6);r.occupied=r.state==='serving'&&near.length>0;
   const m=moveAlong(r.pos,r.path,p.robotSpeed*dt);const blocked=r.state==='traveling'&&this.people.some(q=>dist(q.pos,m.pos)<.9&&dist(q.pos,m.pos)<dist(q.pos,r.pos)&&dist(q.pos,r.path.at(-1)||r.pos)>2.5);if(blocked){r.paused=true;continue;}r.paused=false;
   const old=r.pos;r=this.robots[i]=stepRobot(r,dt,{speed:p.robotSpeed,inflateTime:p.inflateTime});r.travel+=dist(old,r.pos);
   if(r.state==='serving'){r.empty=near.length?0:r.empty+dt;if(r.empty>12){r.state='deflating';r.timer=0;r.occupied=false;this.event(`${r.id} 无人使用，开始收拢`);}}
   if(r.state==='deflating'){r.timer+=dt;r.progress=Math.max(0,1-r.timer/p.deflateTime);if(!r.progress){r.state='returning';r.path=planGroundPath(this.site,r.pos,r.home,p.mode,.55);r.target=null;r.reservation=null;r.assigned=[];}}
   r.energy+=(['traveling','returning'].includes(r.state)?90:r.state==='inflating'?140:12)*dt/3600;
  }
 }
 stats(){return{heated:this.rings.reduce((s,h)=>s+(h.served||0),0),waiting:this.people.filter(q=>(q.rest||q.urgent||q.stay>=(q.triggerAfter??this.p.dwell))&&q.servedAt===null).length,energy:this.rings.concat(this.robots).reduce((s,h)=>s+h.energy,0),active:this.rings.filter(h=>h.state==='heating').length,robotsServing:this.robots.filter(r=>r.state==='serving').length};}
}
