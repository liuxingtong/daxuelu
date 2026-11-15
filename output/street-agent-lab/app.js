const $=s=>document.getElementById(s),site=window.SITE;
let sim=new Simulation(site),running=true,timeScale=4,tool='drag',selected=null,hover=null,seed=17,comparisons=[],searching=false,fieldCache=null,insetRect=null,cardFor=null;
window.lab={get sim(){return sim;},get view(){return view;},selectPerson(id){const q=sim.people.find(p=>p.id===id);if(!q)return null;selected=q;q.auto=false;q.path=[];ui();render();return q.id;},setField(mode){$('fieldMode').value=mode;$('fieldMode').dispatchEvent(new Event('change'));return mode;},setPreview(on){$('previewHeat').checked=!!on;fieldCache=null;render();return !!on;}};
const canvas=$('plan'),ctx=canvas.getContext('2d'),board=canvas.parentElement,personCard=$('personCard');let W=0,H=0,dpr=1,view={s:1,x:0,y:0},drag=null,last=performance.now(),uiAt=0;
const names={sides:'A 双侧纵轨',ladder:'B 中央纵轨＋横跨',mesh:'C 三纵轨横跨网',serpentine:'D 连续折线轨'};
const states={standby:'待机',transit:'沿轨前往',transfer:'转接等待',yielding:'让行',heating:'定点供热',idle:'压缩待机',traveling:'收拢态前往',inflating:'停稳展开',serving:'展开服务',deflating:'收拢',returning:'返回待机位'};
const mentalNames={calm:'平稳',anxious:'紧张',fatigued:'疲惫 · 想休息',impaired:'酒后 · 需照护'};
const socialName=s=>s>=.7?'高':s>=.4?'中':'低';
const FONT='-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
const FELT_STOPS=[[44,86,132],[52,148,166],[245,206,102],[236,139,44],[178,48,35]];
const FELT_MAP_STOPS=[[224,236,241],[150,195,202],[247,219,148],[239,152,68],[187,62,45]];
function feltRange(){return[sim.p.temperature-4,sim.p.temperature+5];}
function rampColor(v,range,stops){
 const t=Math.max(0,Math.min(1,(v-range[0])/Math.max(.001,range[1]-range[0]))),x=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),k=x-i;
 return`rgb(${stops[i].map((n,j)=>Math.round(n*(1-k)+stops[i+1][j]*k)).join(',')})`;
}
function feltColor(v,range=feltRange()){return rampColor(v,range,FELT_STOPS);}
function feltMapColor(v,range=feltRange()){return rampColor(v,range,FELT_MAP_STOPS);}
function personView(person){
 const preview=$('previewHeat').checked;
 if(!preview)return{env:person.env||sim.environment.sample(person.pos,sim),felt:person.felt??feltTemperature(person,person.env||sim.environment.sample(person.pos,sim),sim.p)};
 const env=sim.environment.sample(person.pos,{rings:sim.rings.map(h=>({...h,state:'heating'})),robots:sim.robots,people:sim.people});
 return{env,felt:feltTemperature(person,env,sim.p)};
}
function fieldRange(mode){
 const t=sim.p.temperature;
 if(mode==='air')return[t,t+1.6,'℃'];
 if(mode==='mrt')return[t,t+4.5,'℃'];
 if(mode==='felt')return[...feltRange(),'℃'];
 return[0,Math.max(1,sim.p.wind*1.2),'m/s'];
}
const paramGroups=[['controls1',[
 ['crossCount','横跨站点 / 折线节点',3,13,1,'个'],['ringCount','热光圈数量',1,10,1,'个'],['robotCount','毛毛虫数量',0,6,1,'台']
]],['controls2',[
 ['heatRadius','几何服务半径（假设）',2,7,.5,'m'],['ringSpeed','热圈移动速度',.3,2,.1,'m/s'],['robotSpeed','收拢态移动速度',.2,1,.05,'m/s'],['dwell','停留触发阈值',0,25,1,'s'],['cluster','群体识别邻距',2,8,.5,'m'],['socialPull','社交吸引权重 k_s',0,1,.1,'']
]],['controls3',[
 ['power','单圈输入功率',0,3000,100,'W'],['efficiency','有效供热比例 η',.1,.8,.05,''],['need','每人需求代理 q',50,200,10,'W/人'],['inflateTime','展开充气时长',2,15,1,'s']
]],['controlsEnv',[
 ['temperature','背景空气温度',-5,15,1,'℃'],['wind','背景风速',0,6,.5,'m/s'],['windAngle','来风方位 / 模型 +X',0,345,15,'°'],['fieldHeight','场图观察高度',.4,1.8,.1,'m']
]]];
for(const[id,defs]of paramGroups){$(id).innerHTML=defs.map(([k,n,min,max,step,unit])=>`<label class="range"><div class="row"><span>${n}</span><output id="val-${k}">${sim.p[k]} ${unit}</output></div><input aria-label="${n}" type="range" id="param-${k}" min="${min}" max="${max}" step="${step}" value="${sim.p[k]}"></label>`).join('');for(const[k,n,min,max,step,unit]of defs){$('param-'+k).oninput=e=>{$('val-'+k).textContent=`${e.target.value} ${unit}`;if(k==='socialPull'){sim.p[k]=+e.target.value;return;}if(id==='controlsEnv'){sim.p[k]=+e.target.value;fieldCache=null;render();}};$('param-'+k).onchange=e=>{sim.p[k]=+e.target.value;if(k==='socialPull'){message(`社交吸引权重 k_s=${sim.p.socialPull.toFixed(1)}：热圈与毛毛虫会更偏向高社交意愿群体。`);return;}if(id==='controlsEnv'){fieldCache=null;render();}else rebuild();};}}
function message(s){$('hint').textContent=s;}
function syncControls(){for(const[,defs]of paramGroups)for(const[k,n,min,max,step,unit]of defs){$('param-'+k).value=sim.p[k];$('val-'+k).textContent=`${sim.p[k]} ${unit}`;}$('layout').value=sim.p.layout;$('mode').value=sim.p.mode;}
function rebuild(){const params={...sim.p};sim=new Simulation(site,params);sim.initCrowd(seed);sim.auto=$('autoWalk').checked;selected=null;comparisons=[];fieldCache=null;ui();render();message('已按当前参数重置装置与同种子行人；尺寸和原模型坐标保持一致。');}
function nearestValid(p,clearance=.15){const g=groundGrid(site,sim.p.mode,clearance,1.2);let best=null,dd=Infinity;for(let i=0;i<g.ok.length;i++)if(g.ok[i]){const q=g.point(i),d=dist(q,p);if(d<dd){dd=d;best=q;}}return best;}
sim.initCrowd(seed);
$('play').onclick=()=>{running=!running;$('play').textContent=running?'Ⅱ 暂停':'▶ 运行';};
$('speed').onchange=e=>timeScale=+e.target.value;
$('reset').onclick=()=>{seed++;rebuild();};
$('mode').onchange=e=>{sim.p.mode=e.target.value;rebuild();};$('layout').onchange=e=>{sim.p.layout=e.target.value;rebuild();};
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>{tool=b.dataset.tool;for(const q of document.querySelectorAll('[data-tool]'))q.classList.toggle('on',q===b);message(({drag:'拖动人物改变停留位置；拖空白处平移。',add:'点击可行区域添加独行者。',rest:'点击可行区域添加主动休息请求，优先调度。',goal:'先选中人物，再点击一个可行目的地；会按避障路径行走。'})[tool]);};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const q of document.querySelectorAll('[data-tab]'))q.classList.toggle('active',q===b);for(const id of['process','compare','model','logic','source'])$('panel-'+id).hidden=id!==b.dataset.tab;if(b.dataset.tab==='compare'&&!comparisons.length)compareCurrent();};
for(const id of['showArea','showCover','showTrees','showRoutes','showDims'])$(id).onchange=()=>render();
$('autoWalk').onchange=e=>{sim.auto=e.target.checked;message(sim.auto?'已恢复概率行走与偶遇行为。':'自动行走已关闭；现有目的地仍会走完，可选中行人停止。');};
$('clearPeople').onclick=()=>{sim.people=[];selected=null;message('已清空行人；装置会按无需求规则恢复。');ui();};
$('gather').onclick=()=>{const ring=sim.rings.reduce((a,b)=>dist(b.pos,[80,27])<dist(a.pos,[80,27])?b:a),pos=nearestValid(ring.pos);if(!pos)return;for(let i=0;i<4;i++){const q=nearestValid([pos[0]+Math.cos(i*1.5)*1.3,pos[1]+Math.sin(i*1.5)*1.3]);const person=sim.addPerson(q);if(person)person.stay=sim.p.dwell;}message(`已在 ${ring.id} 附近添加4人停留群体：观察热圈供热、暖色行人点和毛毛虫响应。`);};
function fit(){view.s=Math.min((W-70)/170,(H-110)/66);view.x=(W-160*view.s)/2;view.y=(H+60*view.s)/2+10;render();}
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=window.devicePixelRatio||1;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);fit();}
new ResizeObserver(resize).observe(canvas);
$('fit').onclick=fit;$('zoomIn').onclick=()=>{zoom(1.25,W/2,H/2);};$('zoomOut').onclick=()=>{zoom(.8,W/2,H/2);};
function zoom(f,x,y){const s=Math.max(2,Math.min(40,view.s*f)),k=s/view.s;view.x=x+(view.x-x)*k;view.y=y+(view.y-y)*k;view.s=s;render();}
const world=e=>{const r=canvas.getBoundingClientRect();return[(e.clientX-r.left-view.x)/view.s,(view.y-(e.clientY-r.top))/view.s];};
const pick=p=>sim.people.reduce((best,q)=>dist(q.pos,p)<Math.max(.8,10/view.s)&&(!best||dist(q.pos,p)<dist(best.pos,p))?q:best,null);
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
canvas.onpointerdown=e=>{const cr=canvas.getBoundingClientRect(),cx=e.clientX-cr.left,cy=e.clientY-cr.top;if(insetRect&&cx>=insetRect.x&&cx<=insetRect.x+insetRect.w&&cy>=insetRect.y&&cy<=insetRect.y+insetRect.h){message('热场详图用于读图；取消“热场详图”后可操作该区域。');return;}canvas.setPointerCapture(e.pointerId);const p=world(e),person=pick(p);if(tool==='add'||tool==='rest'){const q=sim.addPerson(p,tool==='rest');if(q){selected=q;message(`${q.id} 已加入${q.rest?'，发送休息请求':''}`);}else message('该处为建筑、障碍或平日车行区，请选择有效铺装。');ui();return;}if(tool==='goal'&&selected){const ok=sim.movePerson(selected,p);selected.auto=false;message(ok?`${selected.id} 正沿避障路径前往目的地。`:'目的地不可达，原路径保持。');return;}if(person){selected=person;person.auto=false;person.path=[];drag={kind:'person',person};message(`已选中 ${person.id}：卡片显示体感温度、体表温度、精神状态与步行速度。`);ui();}else{drag={kind:'pan',x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};selected=null;ui();}};
canvas.onpointermove=e=>{const p=world(e);hover=p;const f=sim.environment.sample(p,sim);$('coords').textContent=`X ${p[0].toFixed(1)} / Y ${p[1].toFixed(1)} m · ${f.air.toFixed(1)}℃ / MRT ${f.mrt.toFixed(1)}℃ / ${f.wind.toFixed(1)}m/s`;if(drag?.kind==='person'){if(allowedGround(site,p,sim.p.mode,.15)){drag.person.pos=p;drag.person.stay=0;drag.person.servedAt=null;}}else if(drag?.kind==='pan'){view.x=drag.vx+e.clientX-drag.x;view.y=drag.vy+e.clientY-drag.y;}render();};
canvas.onpointerup=()=>{drag=null;};canvas.onpointercancel=()=>{drag=null;};
function poly(c,p,fill,stroke,width=.12){if(!p.length)return;c.beginPath();c.moveTo(...p[0]);for(const q of p.slice(1))c.lineTo(...q);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=.12,dash=[]){if(!points.length)return;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);}
function circle(c,p,r,stroke,fill,width=.15){c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function text(c,x,y,s,color='#607068',px=10,align='left'){c.save();c.translate(x,y);c.scale(1,-1);c.fillStyle=color;c.font=`${px/view.s}px -apple-system, sans-serif`;c.textAlign=align;c.fillText(s,0,0);c.restore();}
function dimension(c,a,b,label){line(c,[a,b],'#7e8b82',.09);const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,n=[-dy/len*.65,dx/len*.65];for(const q of[a,b])line(c,[[q[0]-n[0],q[1]-n[1]],[q[0]+n[0],q[1]+n[1]]],'#7e8b82',.1);text(c,(a[0]+b[0])/2,(a[1]+b[1])/2+.8,label,'#65746a',10,'center');}
const fieldColor=(t,wind=false)=>{t=Math.max(0,Math.min(1,t));const stops=wind?[[227,239,239],[129,187,184],[74,131,164],[157,132,174],[222,166,102]]:[[224,236,241],[248,222,158],[236,142,60],[176,55,40]];const x=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),k=x-i;return`rgb(${stops[i].map((v,j)=>Math.round(v*(1-k)+stops[i+1][j]*k)).join(',')})`;};
$('fieldMode').onchange=()=>{fieldCache=null;if($('fieldMode').value==='none')$('fieldLegend').textContent='技术平面 · 点色 = 体感温度代理；点击行人查看卡片。';render();};
$('previewHeat').onchange=()=>{fieldCache=null;render();};
$('showInset').onchange=()=>render();
function drawField(c){const mode=$('fieldMode').value;if(mode==='none')return;
 const preview=$('previewHeat').checked,[low,high,unit]=fieldRange(mode);
 const fieldSim=preview?{rings:sim.rings.map(h=>({...h,state:'heating'})),robots:sim.robots,people:sim.people}:sim;
 if(!fieldCache||fieldCache.mode!==mode||fieldCache.preview!==preview||Math.abs(sim.time-fieldCache.time)>.7){const cells=[];let peak=-Infinity;const g=groundGrid(site,sim.p.mode,.15,1.2);for(let i=0;i<g.ok.length;i++)if(g.ok[i]){const pos=g.point(i);if(pos[1]<8||pos[1]>44)continue;const f=sim.environment.sample(pos,fieldSim),value=mode==='mrt'?f.mrt:mode==='wind'?f.wind:mode==='felt'?feltTemperature({skinTemp:32,mental:'calm',walkSpeed:1.15},f,sim.p):f.air;const color=mode==='felt'?feltMapColor(value):fieldColor((value-low)/(high-low),mode==='wind');cells.push({pos,color});peak=Math.max(peak,value);}fieldCache={mode,preview,time:sim.time,cells,peak};}
 c.save();c.globalAlpha=.86;for(const q of fieldCache.cells){c.fillStyle=q.color;c.fillRect(q.pos[0]-.6,q.pos[1]-.6,1.2,1.2);}c.restore();
 const heating=sim.rings.filter(h=>h.state==='heating').length,peak=fieldCache.peak;
 const peakText=mode==='air'?`峰值 ${peak.toFixed(1)}℃（+${(peak-sim.p.temperature).toFixed(1)}）`:`峰值 ${peak.toFixed(1)} ${unit}`;
 const ringText=preview?`预演：${sim.rings.length}/${sim.rings.length} 圈供热`:`供热中 ${heating}/${sim.rings.length}`;
 const note=!preview&&heating===0?' · 当前无热圈供热，场图接近背景值':'';
 const ramp=mode==='felt'?`${feltMapColor(low)},${feltMapColor((low+high)/2)},${feltMapColor(high)}`:`${fieldColor(0,mode==='wind')},${fieldColor(.5,mode==='wind')},${fieldColor(1,mode==='wind')}`;
 $('fieldLegend').innerHTML=`<span style="display:inline-block;width:65px;height:8px;background:linear-gradient(90deg,${ramp})"></span> ${low.toFixed(1)}–${high.toFixed(1)} ${unit} · ${peakText} · ${ringText}${note} · ${mode==='mrt'?'MRT 代理':'简化场'} · 非CFD`;
}
function render(){
 if(!W)return;const c=ctx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#fafbf7';c.fillRect(0,0,W,H);c.save();c.translate(view.x,view.y);c.scale(view.s,-view.s);
 // The viewport boundary is the only crop; all underlying model coordinates remain unchanged.
 c.save();c.beginPath();c.rect(0,0,160,60);c.clip();c.fillStyle='#f0f1eb';c.fillRect(0,0,160,60);
 for(let x=0;x<=160;x+=5)line(c,[[x,0],[x,60]],'#e7ebe3',.035);for(let y=0;y<=60;y+=5)line(c,[[0,y],[160,y]],'#e7ebe3',.035);
 for(const p of site.walk)poly(c,p,'#fafbf6',null);for(const p of site.road)poly(c,p,sim.p.mode==='market'?'#f3f2eb':'#e4e7e2','#b7beb5',.09);
 if($('showArea').checked){const g=groundGrid(site,sim.p.mode,.55,1.2);c.fillStyle='#377f6520';for(let i=0;i<g.ok.length;i++)if(g.ok[i]){const p=g.point(i);c.fillRect(p[0]-.6,p[1]-.6,1.2,1.2);}}
 if($('showCover').checked&&$('fieldMode').value==='none'){c.fillStyle='#c9903524';for(const s of sim.metrics.samples)if(s.covered)c.fillRect(s.pos[0]-.75,s.pos[1]-.75,1.5,1.5);}drawField(c);
 for(const p of site.buildings)poly(c,p,'#dce0d8','#859084',.12);
 for(const p of site.canopies)poly(c,p,'#c6c0aa20','#c0bfae',.04);
 for(const p of site.spillout)poly(c,p,'#bd9e6c32','#b5a58a',.06);
 for(const p of site.furniture)poly(c,p,'#b8b9aa50','#9ca391',.045);
 for(const p of site.facilities)poly(c,p,'#9da9a157','#7e8b81',.065);
 for(const p of site.pits)poly(c,p,'#becdb64a','#9bad97',.045);
 for(const t of site.trees){if($('showTrees').checked){c.setLineDash([.4,.35]);circle(c,t.pos,t.r,'#91a28d99',null,.09);c.setLineDash([]);}circle(c,t.pos,.35,'#6e8268','#73856c',.1);}
 // Existing carriageway axis, not a proposed installation line.
 line(c,[[0,27.0835],[160,27.0835]],'#9aa597',.07,[1.7,1.7]);
 for(const[a,b]of sim.net.edges)line(c,[sim.net.nodes[a],sim.net.nodes[b]],'#bc7d30',.22);
 for(let i=0;i<sim.net.nodes.length;i++){const q=sim.net.nodes[i];circle(c,q,.32,'#b7792e','#fafbf7',.13);}
 for(const x of sim.net.stations){if(sim.p.layout==='sides'&&x!==sim.net.stations[0]&&x!==sim.net.stations.at(-1))continue;for(const y of[12,42]){line(c,[[x,y],[x,y<20?sim.net.railY[0]:sim.net.railY[1]]],'#bd985c',.09,[.3,.3]);poly(c,[[x-.45,y-.45],[x+.45,y-.45],[x+.45,y+.45],[x-.45,y+.45]],'#fafbf7','#a97836',.12);}}
 for(const d of sim.demands){circle(c,d.pos,Math.min(4,1.4+d.count*.4),d.urgent?'#b76654':'#789ca055',null,.12);text(c,d.pos[0]+1,d.pos[1]+3,`${d.count}人${d.urgent?' · 休息':''}`,'#526c66',10);}
 if($('previewHeat').checked){c.setLineDash([.35,.3]);for(const h of sim.rings)circle(c,h.pos,sim.p.heatRadius,'#b9792f66',null,.08);c.setLineDash([]);}
 for(const h of sim.rings){if($('showRoutes').checked&&h.path.length)line(c,[h.pos,...h.path],'#c78a3c',.14,[.5,.35]);if(h.state==='heating')circle(c,h.pos,sim.p.heatRadius,'#cf944f55','#edb46c2b',.1);circle(c,h.pos,1.5,'#ce8b36',h.state==='heating'?'#f8e3c2':'#fafbf7',.28);circle(c,h.pos,.45,null,'#cf944f44');if(sim.p.wind>1.5&&h.state==='heating'){const a=sim.p.windAngle*Math.PI/180;c.beginPath();c.arc(h.pos[0],h.pos[1],1.8,a-.8,a+.8);c.strokeStyle='#798d91';c.lineWidth=.35;c.stroke();}text(c,h.pos[0]+2,h.pos[1]+1.8,h.id,'#a26923',10);}
 for(const r of sim.robots){if($('showRoutes').checked&&r.path.length)line(c,[r.pos,...r.path],'#2f8775',.13,[.45,.3]);if(r.reservation&&$('showRoutes').checked){c.setLineDash([.2,.5]);circle(c,r.reservation,4,'#25816d44',null,.09);c.setLineDash([]);}if(r.progress>.01){c.beginPath();c.arc(r.pos[0],r.pos[1],.6+1.6*r.progress,.45,Math.PI*2-.45);c.strokeStyle=r.state==='serving'?'#1d7968':'#71a491';c.lineWidth=.5+.35*r.progress;c.lineCap='round';c.stroke();c.lineCap='butt';circle(c,[r.pos[0]+Math.cos(.45)*2.2,r.pos[1]+Math.sin(.45)*2.2],.3,null,'#177363');}else{c.save();c.translate(...r.pos);const target=r.path[0];if(target)c.rotate(Math.atan2(target[1]-r.pos[1],target[0]-r.pos[0]));c.fillStyle='#e9f1e9';c.strokeStyle='#177767';c.lineWidth=.2;c.beginPath();c.roundRect(-.8,-.45,1.6,.9,.4);c.fill();c.stroke();c.restore();}text(c,r.pos[0]+1.8,r.pos[1]-2,r.id,'#1b7563',10);}
 for(const person of sim.people){if($('showRoutes').checked&&selected===person&&person.path.length)line(c,[person.pos,...person.path],'#567a99',.1,[.4,.3]);const heated=sim.rings.some(h=>h.served&&h.assigned.includes(person.id)&&dist(h.pos,person.pos)<=sim.p.heatRadius);if(heated)circle(c,person.pos,.95,'#e8b06355',null,.1);const f=personView(person).felt;circle(c,person.pos,.5,'#fafbf7dd',feltColor(f),.13);if(person.group)circle(c,person.pos,.7,'#6c75a1',null,.08);if(person.rest)circle(c,person.pos,.82,'#ad6252',null,.11);if(selected===person)circle(c,person.pos,.63,'#0b6356',null,.22);const goal=person.path?.[0];if(goal){const a=Math.atan2(goal[1]-person.pos[1],goal[0]-person.pos[0]);line(c,[person.pos,[person.pos[0]+Math.cos(a)*.85,person.pos[1]+Math.sin(a)*.85]],'#3d5669',.16);}if(person.rest)text(c,person.pos[0],person.pos[1]+1.15,'!','#ad6252',12,'center');}
 c.restore();
 if($('showDims').checked){dimension(c,[0,55],[160,55],'160.00 m · 原模型截取范围');dimension(c,[163,site.roadY[0]],[163,site.roadY[1]],'12.413 m');const xs=sim.net.stations;for(let i=1;i<xs.length;i++)dimension(c,[xs[i-1],49],[xs[i],49],`${(xs[i]-xs[i-1]).toFixed(1)} m`);}
 text(c,3,45,'模型 +Y 侧 · 店铺与外摆','#829080',10);text(c,3,7,'模型 −Y 侧 · 店铺与外摆','#829080',10);text(c,80,28.1,sim.p.mode==='market'?'道路中央 / 步行化开放服务':'道路中央 / 平日机器人禁入','#758273',10,'center');
 // Scale and model axes are intentionally not a geographic north arrow.
 line(c,[[4,2],[24,2]],'#526354',.2);for(const x of[4,14,24])line(c,[[x,1.6],[x,2.4]],'#526354',.2);text(c,4,.3,'0',undefined,9);text(c,14,.3,'10',undefined,9);text(c,24,.3,'20 m',undefined,9);line(c,[[152,3],[157,3]],'#526354',.12);line(c,[[152,3],[152,7]],'#526354',.12);text(c,158,3,'+X',undefined,9);text(c,152,8,'+Y',undefined,9);c.restore();
 drawFieldInset(c);
 positionPersonCard();
}
function drawFieldInset(c){
 insetRect=null;const mode=$('fieldMode').value;if(mode==='none'||!$('showInset').checked||W<760)return;
 const preview=$('previewHeat').checked,candidates=preview?sim.rings:sim.rings.filter(h=>h.state==='heating');
 if(!candidates.length)return;
 const score=h=>sim.people.filter(q=>dist(q.pos,h.pos)<8).length*100-dist(h.pos,[80,27]);
 const focus=candidates.reduce((a,b)=>score(b)>score(a)?b:a);
 const worldW=24,worldH=14,w=Math.min(310,W*.3),h=w*worldH/worldW,x=W-w-14,y=14;
 const sx=view.x+(focus.pos[0]-worldW/2)*view.s,sy=view.y-(focus.pos[1]+worldH/2)*view.s,sw=worldW*view.s,sh=worldH*view.s;
 if(sx<0||sy<0||sx+sw>W||sy+sh>H)return;
 insetRect={x,y,w,h};
 c.save();
 c.shadowColor='rgba(30,50,40,.18)';c.shadowBlur=12;c.shadowOffsetY=4;c.fillStyle='#fafbf7';c.fillRect(x-1,y-1,w+2,h+2);
 c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
 c.drawImage(c.canvas,sx*dpr,sy*dpr,sw*dpr,sh*dpr,x,y,w,h);
 c.strokeStyle='#8fa79a';c.lineWidth=1;c.strokeRect(x,y,w,h);
 c.fillStyle='rgba(250,251,247,.94)';c.fillRect(x,y,w,20);
 c.fillStyle='#53665e';c.font=`10px ${FONT}`;c.textAlign='left';c.textBaseline='middle';c.fillText(`热场详图 · ${focus.id} · ${worldW}×${worldH} m · ${preview?'全圈预演':'瞬时供热'}`,x+8,y+10);
 c.restore();
}
function hidePersonCard(){personCard.hidden=true;cardFor=null;}
function personCardScreen(q){const cr=canvas.getBoundingClientRect(),br=board.getBoundingClientRect();return{cx:cr.left-br.left+view.x+q.pos[0]*view.s,cy:cr.top-br.top+view.y-q.pos[1]*view.s};}
function positionPersonCard(){
 const q=selected;if(!q||!sim.people.includes(q)||personCard.hidden)return;
 const p=personCardScreen(q),bw=board.clientWidth,bh=board.clientHeight,cw=personCard.offsetWidth||264,ch=personCard.offsetHeight||240;
 let x=p.cx+18,y=p.cy-ch-18;
 if(x+cw>bw-8)x=p.cx-cw-18;
 if(y<8)y=p.cy+18;
 x=Math.max(8,Math.min(bw-cw-8,x));y=Math.max(8,Math.min(bh-ch-8,y));
 personCard.style.left=x+'px';personCard.style.top=y+'px';
}
function buildPersonCard(q){
 cardFor=q.id;personCard.hidden=false;
 personCard.innerHTML=`<div class="pc-head"><b>${q.id}</b><span class="pc-type">${q.group?'结伴行人':'独行者'}</span><button class="pc-close" id="pcClose" aria-label="关闭">×</button></div>
 <div class="pc-live" id="pcLive">—</div>
 <label><div class="pc-row"><span>体表温度</span><span>℃</span></div><input id="pcSkin" type="number" min="26" max="36" step=".1" value="${q.skinTemp.toFixed(1)}"></label>
 <label><div class="pc-row"><span>精神状态</span></div><select id="pcMental"><option value="calm">平稳</option><option value="fatigued">疲惫，想休息</option><option value="impaired">酒后，需要同伴照顾</option><option value="anxious">紧张</option></select></label>
 <label><div class="pc-row"><span>步行速度</span><output id="pcSpeedOut">${q.walkSpeed.toFixed(2)} m/s</output></div><input id="pcSpeed" type="range" min=".2" max="2" step=".05" value="${q.walkSpeed}"></label>
 <label><div class="pc-row"><span>社交意愿 S</span><output id="pcSocialOut">${(q.social??.5).toFixed(2)} · ${socialName(q.social??.5)}</output></div><input id="pcSocial" type="range" min="0" max="1" step=".05" value="${q.social??.5}"></label>
 <div class="pc-actions"><button id="pcRest">${q.rest?'取消休息':'请求休息'}</button><button id="pcStop">停留</button><button id="pcResume">恢复行走</button><button id="pcRemove">移除</button></div>
 <div class="pc-note">状态为手动情景输入；点击空白关闭卡片。</div>`;
 $('pcMental').value=q.mental;
 $('pcClose').onclick=()=>{selected=null;ui();render();};
 $('pcSkin').oninput=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=26&&v<=36)q.skinTemp=v;};
 $('pcMental').onchange=e=>{q.mental=e.target.value;if(['fatigued','impaired'].includes(q.mental)){q.path=[];q.auto=false;}sim.event(`${q.id} 状态输入：${e.target.selectedOptions[0].text}`);};
 $('pcSpeed').oninput=e=>{q.walkSpeed=+e.target.value;$('pcSpeedOut').textContent=q.walkSpeed.toFixed(2)+' m/s';};
 $('pcSocial').oninput=e=>{q.social=+e.target.value;$('pcSocialOut').textContent=q.social.toFixed(2)+' · '+socialName(q.social);};
 $('pcRest').onclick=()=>{q.rest=!q.rest;q.path=[];q.auto=false;cardFor=null;ui();};
 $('pcStop').onclick=()=>{q.path=[];q.auto=false;};
 $('pcResume').onclick=()=>{q.rest=false;q.mental='calm';q.auto=true;sim.newDestination(q);cardFor=null;ui();};
 $('pcRemove').onclick=()=>{sim.people=sim.people.filter(p=>p!==q);selected=null;ui();};
 positionPersonCard();
}
function updatePersonCardLive(q){const pv=personView(q),e=pv.env,live=$('pcLive');if(live)live.textContent=`体感 ${pv.felt.toFixed(1)}℃ · 停留 ${q.stay.toFixed(0)}s / 触发 ${(q.triggerAfter??sim.p.dwell).toFixed(1)}s · 局部 ${e.air.toFixed(1)}℃ / MRT ${e.mrt.toFixed(1)}℃ / 风 ${e.wind.toFixed(1)}m/s`;}
function ui(){
 const st=sim.stats(),m=sim.metrics;$('kLength').textContent=m.length.toFixed(0);$('kCover').textContent=(m.coverage*100).toFixed(0)+'%';$('kRoad').textContent=sim.p.mode==='market'?(m.roadCoverage*100).toFixed(0)+'%':'禁入';$('kP95').textContent=m.p95?.toFixed(1)||'—';$('kService').textContent=`${st.heated} / ${st.waiting}`;$('energy').textContent=st.energy.toFixed(1)+' Wh（代理）';$('clock').textContent=`T+${String(Math.floor(sim.time/60)).padStart(2,'0')}:${String(Math.floor(sim.time%60)).padStart(2,'0')} · ${sim.people.length}人`;
 const fr=feltRange();$('feltLegend').innerHTML=`<i style="background:linear-gradient(90deg,${feltColor(fr[0],fr)},${feltColor((fr[0]+fr[1])/2,fr)},${feltColor(fr[1],fr)})"></i>行人点色 ${fr[0].toFixed(0)}–${fr[1].toFixed(0)}℃`;
 $('fleet').innerHTML=[...sim.rings,...sim.robots].map(a=>`<div class="agentline"><b>${a.id}</b><span>${a.served?`${a.served}人供热 · `:''}${a.paused?'避让行人':states[a.state]}</span><span class="badge">${a.travel.toFixed(0)} m</span></div>`).join('');
 if($('logicLive')){const maxSocial=sim.demands.length?Math.max(...sim.demands.map(d=>d.social)):0;$('logicLive').textContent=`当前：k_s ${sim.p.socialPull.toFixed(2)} · 最高 S̄ ${maxSocial.toFixed(2)} · 社交机器人阈值 ${sim.p.socialRobotMin.toFixed(2)} · 待响应 ${st.waiting} · 供热中 ${st.active}/${sim.rings.length} · 毛毛虫服务 ${st.robotsServing}/${sim.robots.length}`;}
 $('events').innerHTML=sim.log.map(e=>`<div><time>${Math.floor(e.time)}s</time>${e.text}</div>`).join('');
 renderPerson();
}
function renderPerson(){
 const q=selected;
 if(!q||!sim.people.includes(q)){hidePersonCard();const info=$('personInfo');if(info&&info.dataset.card!==''){info.dataset.card='';info.innerHTML='点击行人，在行人附近打开参数卡片；卡片内可编辑体表温度、精神状态、步行速度和社交意愿。';}return;}
 if(cardFor!==q.id||personCard.hidden)buildPersonCard(q);
 updatePersonCardLive(q);positionPersonCard();
 const info=$('personInfo');if(info&&info.dataset.card!==q.id){info.dataset.card=q.id;info.innerHTML=`<b>${q.id}</b> · 参数编辑在行人附近卡片中；点击空白关闭。`;}
}
function table(rows,action=false){return `<table><thead><tr><th>候选布局</th><th>站点</th><th>光圈</th><th>轨道 m</th><th>支点*</th><th>覆盖</th><th>道路</th><th>P95 s</th>${action?'<th></th>':''}</tr></thead><tbody>${rows.map((r,i)=>`<tr class="${r.layout===sim.p.layout&&r.n===sim.p.crossCount&&r.k===sim.p.ringCount?'selected-row':''}"><td>${names[r.layout]}</td><td>${r.n}</td><td>${r.k}</td><td class="num">${r.m.length.toFixed(1)}</td><td>${r.m.anchors}</td><td>${(r.m.coverage*100).toFixed(1)}%</td><td>${sim.p.mode==='market'?(r.m.roadCoverage*100).toFixed(1)+'%':'—'}</td><td class="num">${r.m.p95?.toFixed(1)||'—'}</td>${action?`<td><button data-apply="${i}">采用</button></td>`:''}</tr>`).join('')}</tbody></table><p class="tiny">* 支点为候选布局的端点支撑计数，不等于完整结构锚固数量。双侧纵轨的两个分离分量仅可由各自已有装置服务。</p>`;}
function compareCurrent(){comparisons=Object.keys(names).map(layout=>({layout,n:sim.p.crossCount,k:sim.p.ringCount,m:layoutMetrics(site,makeNetwork(layout,site,sim.p.crossCount),sim.p.ringCount,sim.p.heatRadius,sim.p.ringSpeed,sim.p.mode,sim.p.transferTime)}));$('compareTable').innerHTML=table(comparisons);}
$('searchLayouts').onclick=async()=>{if(searching)return;searching=true;const b=$('searchLayouts');b.textContent='计算候选…';const rows=[];for(const layout of Object.keys(names)){for(const n of[3,5,7,9,11]){const net=makeNetwork(layout,site,n);for(let k=3;k<=8;k++){rows.push({layout,n,k,m:layoutMetrics(site,net,k,sim.p.heatRadius,sim.p.ringSpeed,sim.p.mode,sim.p.transferTime)});}await new Promise(requestAnimationFrame);}}const goal=+$('coverageGoal').value,t=+$('timeGoal').value;let filtered=rows.filter(r=>r.m.coverage>=goal&&r.m.p95!==null&&r.m.p95<=t);const passed=filtered.length>0;if(!passed)filtered=rows.sort((a,b)=>b.m.coverage-a.m.coverage||a.m.length-b.m.length);else filtered.sort((a,b)=>a.m.length-b.m.length||a.k-b.k||a.m.p95-b.m.p95);comparisons=filtered.slice(0,10);$('compareTable').innerHTML=`<p class="${passed?'callout':'warning'}">${passed?`共 ${filtered.length} 组达到目标，以下优先选中心线较短、光圈较少的方案。`:'当前候选未同时满足目标，列出覆盖较高的方案；可调整目标、半径或速度。'}</p>`+table(comparisons,true);for(const q of document.querySelectorAll('[data-apply]'))q.onclick=()=>{const r=comparisons[+q.dataset.apply];sim.p.layout=r.layout;sim.p.crossCount=r.n;sim.p.ringCount=r.k;syncControls();rebuild();compareCurrent();};b.textContent='比较候选方案';searching=false;};
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('exportData').onclick=()=>download(new Blob([JSON.stringify({timestamp:new Date().toISOString(),source:site.metadata,params:sim.p,network:sim.net,staticMetrics:{...sim.metrics,samples:undefined},time:sim.time,people:sim.people,rings:sim.rings,robots:sim.robots,events:sim.log},null,2)],{type:'application/json'}),'大学路-推演快照.json');
$('exportPNG').onclick=()=>{render();const out=document.createElement('canvas');out.width=2400;out.height=Math.round(2400*H/W)+150;const q=out.getContext('2d');q.fillStyle='#fafbf7';q.fillRect(0,0,out.width,out.height);q.fillStyle='#243333';q.font='bold 31px sans-serif';q.fillText('大学路 / 街道智能体总平面',40,48);q.font='18px sans-serif';q.fillStyle='#64736a';q.fillText(`${names[sim.p.layout]} · ${sim.p.mode==='market'?'市集步行化':'平日车行'} · ${sim.p.ringCount} 热圈 / ${sim.p.robotCount} 机器人 · 单位 m`,40,80);q.drawImage(canvas,0,100,2400,Math.round(2400*H/W));q.font='16px sans-serif';q.fillText('橙：热圈轨道与几何服务范围   绿：机器人与可移动区域   灰：原模型场地   · 概念平面，结构及热舒适待验证',40,out.height-20);out.toBlob(blob=>download(blob,'大学路-智能体技术平面.png'),'image/png');};
$('sourceDetails').innerHTML=`<div class="twocol"><div><b>几何依据</b><p>${site.metadata.source}</p><table><tr><th>原文件单位</th><td>毫米 → 米（÷1000）</td></tr><tr><th>截取范围</th><td>X 2000–2160 m / Y 310–370 m</td></tr><tr><th>局部坐标原点</th><td>原模型 (2000000, 310000) mm</td></tr><tr><th>主车行道宽</th><td>12.413 m</td></tr><tr><th>方向</th><td>使用原模型 +X / +Y，未标地理北</td></tr></table></div><div><b>提取与简化</b>${site.metadata.notes.map(n=>`<p class="tiny">${n}</p>`).join('')}<p>提取后：${site.buildings.length} 个建筑轮廓、${site.walk.length} 个合并铺装面、${site.trees.length} 个树冠代理、${site.obstacles.length} 个障碍轮廓。</p><p class="warning">道路边界与主尺寸来源明确；树干中心、设施包围盒和部分建筑凸包是代理几何。候选轨道、服务半径、支点和装置性能为本次设计假设。</p></div></div>`;
function frame(now){let dt=Math.min(.1,(now-last)/1000);last=now;if(running){let total=dt*timeScale;while(total>0){let d=Math.min(.2,total);sim.step(d);total-=d;}}if(now>uiAt){ui();uiAt=now+450;}render();requestAnimationFrame(frame);}
syncControls();ui();requestAnimationFrame(frame);
