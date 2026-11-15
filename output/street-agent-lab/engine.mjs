export const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const boxes=new WeakMap();
const box=p=>{if(!boxes.has(p))boxes.set(p,[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]);return boxes.get(p);};
const nearBox=(p,poly,r=0)=>{const b=box(poly);return p[0]>=b[0]-r&&p[0]<=b[2]+r&&p[1]>=b[1]-r&&p[1]<=b[3]+r;};
export function pointInPoly(p,poly){if(!nearBox(p,poly))return false;let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function project(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,t=q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)):0,pos=[a[0]+t*dx,a[1]+t*dy];return{pos,t,distance:dist(p,pos)};}
const polyDist=(p,poly,r=4)=>nearBox(p,poly,r)?Math.min(...poly.map((a,i)=>project(p,a,poly[(i+1)%poly.length]).distance)):Infinity;
export function shortestPath(net,start,end){
 if(start===end)return{distance:0,ids:[start],points:[net.nodes[start]]};
 const adj=net.nodes.map(()=>[]);for(const[a,b]of net.edges){const d=dist(net.nodes[a],net.nodes[b]);adj[a].push([b,d]);adj[b].push([a,d]);}
 const ds=net.nodes.map(()=>Infinity),prev=[],seen=new Set();ds[start]=0;
 for(let k=0;k<net.nodes.length;k++){let u=-1;for(let i=0;i<ds.length;i++)if(!seen.has(i)&&(u<0||ds[i]<ds[u]))u=i;if(u<0||!Number.isFinite(ds[u]))break;if(u===end)break;seen.add(u);for(const[v,w]of adj[u])if(ds[v]>ds[u]+w){ds[v]=ds[u]+w;prev[v]=u;}}
 if(!Number.isFinite(ds[end]))return null;const ids=[end];while(ids[0]!==start)ids.unshift(prev[ids[0]]);return{distance:ds[end],ids,points:ids.map(i=>net.nodes[i])};
}
export function makeNetwork(kind,site,count=6){
 const c=site.corridor||[0,4,site.bounds[2],26],ry=site.roadY||[12,18],rail=site.railY||[8,22],x0=c[0]+3,x1=c[2]-3,y0=rail[0],y1=rail[1],ym=(ry[0]+ry[1])/2;
 const xs=Array.from({length:count},(_,i)=>x0+(x1-x0)*i/Math.max(1,count-1)),nodes=[],edges=[],lookup=new Map();
 const node=(x,y)=>{let key=`${x.toFixed(4)},${y.toFixed(4)}`;if(!lookup.has(key)){lookup.set(key,nodes.length);nodes.push([x,y]);}return lookup.get(key);};
 const line=ps=>{let prev;for(const q of ps){const n=node(...q);if(prev!==undefined)edges.push([prev,n]);prev=n;}};
 if(kind==='serpentine'){line(xs.map((x,i)=>[x,i%2?y1:y0]));}
 else if(kind==='sides'){for(const y of[y0,y1])line(xs.map(x=>[x,y]));}
 else{for(const y of(kind==='ladder'?[ym]:[y0,ym,y1]))line(xs.map(x=>[x,y]));for(const x of xs)line([[x,y0],[x,ym],[x,y1]]);}
 return{kind,nodes,edges,length:edges.reduce((s,[a,b])=>s+dist(nodes[a],nodes[b]),0),anchors:kind==='sides'?4:kind==='serpentine'?count:count*2,stations:xs,railY:[y0,y1],crossings:kind==='sides'?0:kind==='serpentine'?count-1:count};
}
export function nearestRail(net,p){let best={distance:Infinity};net.edges.forEach(([a,b],i)=>{const q=project(p,net.nodes[a],net.nodes[b]);if(q.distance<best.distance)best={...q,edge:i,a,b};});return best;}
export function railRoute(net,from,to){const a=nearestRail(net,from),b=nearestRail(net,to);if(!Number.isFinite(a.distance)||!Number.isFinite(b.distance))return null;const nodes=[...net.nodes,a.pos,b.pos],edges=[...net.edges],s=nodes.length-2,t=s+1;edges.push([s,a.a],[s,a.b],[t,b.a],[t,b.b]);if(a.edge===b.edge)edges.push([s,t]);const r=shortestPath({nodes,edges},s,t);if(!r)return null;const points=[];for(const q of r.points){if(points.length&&dist(points.at(-1),q)<.0001)continue;while(points.length>=2){const u=points.at(-2),v=points.at(-1),ax=v[0]-u[0],ay=v[1]-u[1],bx=q[0]-v[0],by=q[1]-v[1];if(Math.abs(ax*by-ay*bx)<.0001&&ax*bx+ay*by>=0)points.pop();else break;}points.push(q);}return{...r,points};}
export function heatCapacity(power,efficiency,required,maxPeople){return Math.max(0,Math.min(maxPeople,Math.floor(Math.max(0,power)*Math.max(0,Math.min(1,efficiency))/Math.max(1,required))));}
export function allowedGround(site,p,mode='market',clearance=.55){
 const[x0,y0,x1,y1]=site.bounds;if(p[0]<x0+clearance||p[0]>x1-clearance||p[1]<y0+clearance||p[1]>y1-clearance)return false;
 if(![...site.walk,...(mode==='market'?site.road:[])].some(poly=>pointInPoly(p,poly)))return false;
 if((site.walkHoles||[]).some(poly=>pointInPoly(p,poly)||polyDist(p,poly)<clearance))return false;
 if(mode==='weekday'&&site.road.some(poly=>pointInPoly(p,poly)||polyDist(p,poly)<clearance))return false;
 if(site.buildings.some(poly=>pointInPoly(p,poly)||polyDist(p,poly)<clearance))return false;
 if(site.obstacles.some(poly=>pointInPoly(p,poly)||polyDist(p,poly)<clearance))return false;
 return !site.trees.some(t=>dist(p,t.pos)<(t.trunkRadius||.35)+clearance);
}
class Heap{constructor(){this.a=[];}push(v){let a=this.a,i=a.push(v)-1;while(i){let p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p;}a[i]=v;}pop(){let a=this.a;if(!a.length)return;let root=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=v[0])break;a[i]=a[c];i=c;}a[i]=v;}return root;}}
const gridCache=new WeakMap();
export function groundGrid(site,mode,clearance=.55,res=.6){let cache=gridCache.get(site);if(!cache){cache=new Map();gridCache.set(site,cache);}let key=`${mode}-${clearance}-${res}`;if(cache.has(key))return cache.get(key);const[x0,y0,x1,y1]=site.bounds,w=Math.ceil((x1-x0)/res),h=Math.ceil((y1-y0)/res),ok=new Uint8Array(w*h),point=i=>[x0+(i%w+.5)*res,y0+(Math.floor(i/w)+.5)*res];for(let i=0;i<ok.length;i++)ok[i]=allowedGround(site,point(i),mode,clearance)?1:0;let g={w,h,res,ok,point,x0,y0};cache.set(key,g);return g;}
export function planGroundPath(site,start,end,mode='market',clearance=.55){
 const{w,h,res,ok,point,x0,y0}=groundGrid(site,mode,clearance);
 const nearest=p=>{let bx=Math.round((p[0]-x0)/res-.5),by=Math.round((p[1]-y0)/res-.5),best=-1,dd=Infinity;for(let r=0;r<=5;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=bx+dx,y=by+dy;if(x<0||y<0||x>=w||y>=h)continue;let i=y*w+x;if(ok[i]&&dist(p,point(i))<dd){best=i;dd=dist(p,point(i));}}return best;};
 const s=nearest(start),t=nearest(end);if(s<0||t<0||dist(point(t),end)>2)return[];
 const ds=new Float64Array(w*h).fill(Infinity),prev=new Int32Array(w*h).fill(-1),closed=new Uint8Array(w*h),heap=new Heap();ds[s]=0;heap.push([dist(point(s),point(t)),s]);
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 while(heap.a.length){const[,u]=heap.pop();if(closed[u])continue;closed[u]=1;if(u===t)break;let ux=u%w,uy=Math.floor(u/w);for(const[dx,dy]of dirs){let x=ux+dx,y=uy+dy;if(x<0||x>=w||y<0||y>=h)continue;let v=y*w+x;if(!ok[v]||closed[v]||dx&&dy&&(!ok[uy*w+x]||!ok[y*w+ux]))continue;let nd=ds[u]+res*Math.hypot(dx,dy);if(nd<ds[v]){ds[v]=nd;prev[v]=u;heap.push([nd+dist(point(v),point(t)),v]);}}}
 if(!Number.isFinite(ds[t]))return[];let ids=[t];while(ids[0]!==s){ids.unshift(prev[ids[0]]);if(ids.length>ok.length)return[];}return ids.map(point);
}
export function assignDemand(agents,demands,cost){const free=new Set(agents),result=[];for(const d of [...demands].sort((a,b)=>b.priority-a.priority)){let chosen=null,cc=Infinity;for(const a of free){const c=cost(a,d);if(c<cc){chosen=a;cc=c;}}if(chosen&&Number.isFinite(cc)){free.delete(chosen);result.push({agent:chosen,demand:d,cost:cc});}}return result;}
export function moveAlong(pos,path,distance){let p=[...pos],q=path.map(p=>[...p]),used=0;while(q.length&&distance>0){let d=dist(p,q[0]);if(d<=distance){p=q.shift();distance-=d;used+=d;}else{let k=distance/d;p=[p[0]+k*(q[0][0]-p[0]),p[1]+k*(q[0][1]-p[1])];used+=distance;distance=0;}}return{pos:p,path:q,used};}
export function advanceRail(agent,dt,speed,transfer){const h={...agent,pos:[...agent.pos],path:agent.path.map(p=>[...p]),used:0};if(h.cornerWait>0){h.cornerWait=Math.max(0,h.cornerWait-dt);return h;}if(!h.path.length)return h;const limit=dist(h.pos,h.path[0]),m=moveAlong(h.pos,[h.path[0]],Math.min(limit,speed*dt));h.pos=m.pos;h.used=m.used;if(!m.path.length){h.path.shift();if(h.path.length)h.cornerWait=transfer;}return h;}
export function stepRobot(robot,dt,p){let r={...robot,pos:[...robot.pos],path:(robot.path||[]).map(x=>[...x])};if(r.occupied){r.state='serving';return r;}if(['traveling','returning'].includes(r.state)){const m=moveAlong(r.pos,r.path,p.speed*dt);r.pos=m.pos;r.path=m.path;if(!r.path.length){r.state=r.state==='returning'?'idle':'inflating';r.timer=0;}}else if(r.state==='inflating'){r.timer=(r.timer||0)+dt;r.progress=Math.min(1,r.timer/p.inflateTime);if(r.progress>=1)r.state='serving';}return r;}
export function demandsFromPeople(people,p){
 const eligible=people.filter(x=>x.rest||x.urgent||x.stay>=(x.triggerAfter??p.dwell)),seen=new Set(),groups=[];
 for(const person of eligible){if(seen.has(person.id))continue;let group=[person];seen.add(person.id);
  for(let i=0;i<group.length;i++)for(const q of eligible)if(!seen.has(q.id)&&dist(group[i].pos,q.pos)<=p.cluster){seen.add(q.id);group.push(q);}
  const pos=[0,1].map(k=>group.reduce((n,v)=>n+v.pos[k],0)/group.length),urgent=group.some(q=>q.rest||q.urgent);
  const social=group.reduce((n,v)=>n+(v.social??.5),0)/group.length;
  groups.push({id:group.map(q=>q.id).sort().join('|'),ids:group.map(q=>q.id),pos,count:group.length,urgent,social,
   priority:(urgent?100:0)+Math.max(...group.map(q=>q.needPriority||0))+group.length*3+Math.max(...group.map(q=>q.stay))/30+(p.socialPull??.6)*10*social});
 }
 return groups;
}
export function standbyPositions(net,count){const samples=[];for(const[a,b]of net.edges){const n=Math.max(1,Math.ceil(dist(net.nodes[a],net.nodes[b])/3));for(let j=0;j<=n;j++)samples.push([net.nodes[a][0]+(net.nodes[b][0]-net.nodes[a][0])*j/n,net.nodes[a][1]+(net.nodes[b][1]-net.nodes[a][1])*j/n]);}const picked=[];for(let i=0;i<count;i++){let best=samples[0],score=-Infinity;for(const q of samples){const d=picked.length?Math.min(...picked.map(v=>dist(q,v))):-Math.abs(q[0]-(net.stations[0]+net.stations.at(-1))/2);if(d>score){best=q;score=d;}}picked.push([...best]);}return picked;}
export function layoutMetrics(site,net,ringCount,radius,speed,mode='market',transfer=1){const bases=standbyPositions(net,ringCount),c=site.corridor||[0,4,site.bounds[2],26],samples=[],times=[];let hit=0,roadTotal=0,roadHit=0;for(let x=c[0]+1;x<c[2];x+=2)for(let y=c[1]+1;y<c[3];y+=2){const p=[x,y];if(!allowedGround(site,p,mode,.15))continue;const q=nearestRail(net,p),inRoad=site.road.some(poly=>pointInPoly(p,poly));let time=Infinity;if(q.distance<=radius){for(const b of bases){const r=railRoute(net,b,q.pos);if(r)time=Math.min(time,r.distance/Math.max(.05,speed)+Math.max(0,r.points.length-2)*transfer);}if(Number.isFinite(time)){hit++;if(inRoad)roadHit++;times.push(time);}}if(inRoad)roadTotal++;samples.push({pos:p,covered:Number.isFinite(time),time});}times.sort((a,b)=>a-b);return{length:net.length,anchors:net.anchors,coverage:samples.length?hit/samples.length:0,roadCoverage:roadTotal?roadHit/roadTotal:0,p95:times.length?times[Math.min(times.length-1,Math.floor(times.length*.95))]:null,samples,bases,sampleCount:samples.length};}
export const DEFAULTS={layout:'ladder',crossCount:7,ringCount:5,robotCount:3,heatRadius:4,ringSpeed:1.2,robotSpeed:.65,dwell:8,cluster:5,power:1800,efficiency:.35,need:100,maxPeople:8,inflateTime:6,deflateTime:4,transferTime:1,mode:'market',temperature:6,wind:2.5,windAngle:45,hold:8,socialPull:.6,socialRobotMin:.8};
