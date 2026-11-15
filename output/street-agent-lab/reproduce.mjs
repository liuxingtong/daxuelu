import fs from 'node:fs';
import {makeNetwork,layoutMetrics,DEFAULTS} from './engine.mjs';
import {Simulation} from './simulation.mjs';
const site=JSON.parse(fs.readFileSync(new URL('./model.json',import.meta.url)));
const baseline=Object.keys({sides:1,ladder:1,mesh:1,serpentine:1}).map(kind=>{const m=layoutMetrics(site,makeNetwork(kind,site,7),5,4,1.2,'market');return{layout:kind,stations:7,rings:5,length:m.length,coverage:m.coverage,roadCoverage:m.roadCoverage,p95:m.p95,anchors:m.anchors};});
const candidates=[];
for(const layout of ['sides','ladder','mesh','serpentine'])for(const stations of[3,5,7,9,11])for(let rings=3;rings<=8;rings++){
 const m=layoutMetrics(site,makeNetwork(layout,site,stations),rings,4,1.2,'market');if(m.coverage>=.8&&m.p95<=30)candidates.push({layout,stations,rings,length:m.length,coverage:m.coverage,roadCoverage:m.roadCoverage,p95:m.p95,anchors:m.anchors});
}
candidates.sort((a,b)=>a.length-b.length||a.rings-b.rings||a.p95-b.p95);
const sim=new Simulation(site);sim.initCrowd(17);let peakHeat=0,peakRobots=0,meetings=0,previous=[];
for(let i=0;i<1800;i++){sim.step(.2);peakHeat=Math.max(peakHeat,sim.stats().heated);peakRobots=Math.max(peakRobots,sim.stats().robotsServing);}
const result={source:site.metadata,assumptions:DEFAULTS,sampling:'2m grid; obstacle excluded; static startup; no queue',baseline,feasible:candidates.slice(0,10),simulation:{seed:17,seconds:360,peakHeat,peakRobots,final:sim.stats(),lastEvents:sim.log}};
fs.writeFileSync(new URL('./comparison-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({baseline,top:candidates.slice(0,3),simulation:result.simulation},null,2));
