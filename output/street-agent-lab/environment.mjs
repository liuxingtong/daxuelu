// Reduced-order scenario field, not CFD, calibrated microclimate, or a human physiological model.
// Temperatures: C; speed: m/s; flux: W/m2; observation height: m.
export class Environment{
 constructor(site,params){this.site=site;this.p=params;this.cache=new Map();this.key='';this.blockers=[...(site.buildings||[]).map(poly=>({poly,strength:.65,reach:30})),...(site.obstacles||[]).map(poly=>({poly,strength:.32,reach:7}))].map(b=>{const xs=b.poly.map(p=>p[0]),ys=b.poly.map(p=>p[1]);return{...b,c:[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],hx:(Math.max(...xs)-Math.min(...xs))/2,hy:(Math.max(...ys)-Math.min(...ys))/2};});}
 background(pos){
  const p=this.p,key=[p.wind,p.windAngle,p.temperature,p.fieldHeight].join('|');if(key!==this.key){this.cache.clear();this.key=key;}
  const cell=pos.map(v=>Math.round(v*1.3)/1.3),id=cell.join(',');if(this.cache.has(id))return this.cache.get(id);
  const angle=(p.windAngle||0)*Math.PI/180,flow=[-Math.cos(angle),-Math.sin(angle)],side=[-flow[1],flow[0]];let shelter=0,edgeGain=0;
  for(const b of this.blockers){const dx=cell[0]-b.c[0],dy=cell[1]-b.c[1],along=dx*flow[0]+dy*flow[1]-(Math.abs(flow[0])*b.hx+Math.abs(flow[1])*b.hy),across=Math.abs(dx*side[0]+dy*side[1]),half=Math.abs(side[0])*b.hx+Math.abs(side[1])*b.hy;
   if(along>=0&&along<b.reach&&across<half+along*.24)shelter=Math.max(shelter,b.strength*Math.exp(-along/(b.reach*.55))*Math.max(.15,1-Math.max(0,across-half)/(along*.24+.01)));
   if(Math.abs(along)<2&&Math.abs(across-half)<1.5)edgeGain=Math.max(edgeGain,.12*(1-Math.abs(across-half)/1.5));
  }
  // Winter tree crowns are drawn but not assumed to be dense wind barriers.
  const value={air:p.temperature??6,wind:Math.max(0,(p.wind??2.5)*(1-shelter+edgeGain))};this.cache.set(id,value);return value;
 }
 sample(pos,sim={rings:[],robots:[],people:[]}){
  const b=this.background(pos),p=this.p,height=p.fieldHeight??1.1;let wind=b.wind,air=b.air,flux=0;
  for(const h of sim.rings||[]){if(h.state!=='heating')continue;const d2=(h.pos[0]-pos[0])**2+(h.pos[1]-pos[1])**2,dz=Math.max(1,3.2-height),r2=d2+dz*dz;flux+=(p.power||0)*(p.efficiency||.35)/(2*Math.PI*r2)*dz/Math.sqrt(r2);
   // Local buoyant mixing proxy. The old 0.08 coefficient produced only ~0.06 K at the ring centre,
   // so the air map could never use its own colour scale. The ring is still primarily radiant.
   air+=(p.power||0)/1800*2.4*Math.exp(-d2/5)/(1+.4*b.wind);
   if(p.wind>1.5)wind*=1-.45*Math.exp(-d2/18);}
  for(const r of sim.robots||[]){const d2=(r.pos[0]-pos[0])**2+(r.pos[1]-pos[1])**2;wind*=1-.5*(r.progress||0)*Math.max(0,1-height/1.3)*Math.exp(-d2/14);}
  // Small, explicit metabolic mixing proxy; no claimed heat recovery or generator.
  for(const q of sim.people||[])air+=.015*Math.exp(-((q.pos[0]-pos[0])**2+(q.pos[1]-pos[1])**2)/4);
  const mrt=Math.pow(Math.max(1,(b.air+273.15)**4+flux/(.95*5.670374419e-8)),.25)-273.15;
  return{air,wind:Math.max(0,wind),mrt,flux};
 }
}
export function personResponse(person,field,p){
 const mental=person.mental||'calm',skin=person.skinTemp??32,priority={calm:0,anxious:12,fatigued:60,impaired:100}[mental]||0;
 const cold=Math.max(0,Math.min(4,(32.5-skin)/4+Math.max(0,12-field.air)/16+field.wind/6-Math.max(0,field.mrt-field.air)/12));
 return{priority:priority+cold*8,threshold:Math.max(1,p.dwell/(1+.3*cold)),speedFactor:{calm:1,anxious:.95,fatigued:.7,impaired:.5}[mental]||1,urgent:!!person.rest||mental==='impaired'||mental==='fatigued',cold};
}
// Apparent-temperature proxy, not a physiological or UTCI calculation. It blends air and mean radiant
// temperature, subtracts a wind-cooling term, and adds small personal offsets for skin temperature,
// walking speed and the manually-entered activity state. Used only to colour individuals and to compare
// the same person before/after a ring arrives.
export function feltTemperature(person,field,p={}){
 const air=field?.air??p.temperature??6,mrt=field?.mrt??air,wind=Math.max(0,field?.wind??0);
 const speed=person?.walkSpeed??1.15,skin=person?.skinTemp??32,mental=person?.mental||'calm';
 const base=air+.42*(mrt-air);
 const windCool=1.15*Math.pow(wind,.8);
 const activity=.7*(speed-1.15);
 const skinOffset=.3*(skin-32.5);
 const mentalOffset={calm:0,anxious:-.25,fatigued:-.5,impaired:-.8}[mental]||0;
 return base-windCool+activity+skinOffset+mentalOffset;
}
