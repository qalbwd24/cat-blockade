'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const R=require('../dist/rules.js'),S=require('../dist/solver.js'),P=require('./proof-search.cjs'),O=require('./reference.cjs');
const rows=[];
const variants=[['hex2',()=>O.hex(2)],['hex3',()=>O.hex(3)],['hex5',()=>R.preset('hex','benchmark',5)],['island10',()=>R.preset('island','benchmark',10)]];
const budget=500;
for(const [shape,mapFn] of variants)for(const density of [18,35,55])for(let i=0;i<3;i++){
  const seed=`research-holdout-${i}`,{game,state,randomCount}=R.createGame(mapFn(),density,seed);
  const fixed=S.findPlan(game,state);
  const pns=P.solve(game,state,{ms:budget,maxNodes:30000});
  const verification=pns.certificate?P.verify(game,state,pns.certificate):null;
  if(verification&&!verification.valid)throw Error(JSON.stringify(verification));
  const old=S.solve(game,state,{ms:budget,maxDepth:30,maxNodes:30000});
  const hybrid=P.solve(game,state,{ms:budget,maxNodes:30000,usePlans:true});
  const hybridCheck=hybrid.certificate?P.verify(game,state,hybrid.certificate):null;
  if(hybridCheck&&!hybridCheck.valid)throw Error(JSON.stringify(hybridCheck));
  if(old.status!=='unknown'&&pns.status!=='unknown'&&old.status!==pns.status)throw Error('Solver disagreement');
  if(hybrid.status!=='unknown'&&[old,pns].some(r=>r.status!=='unknown'&&r.status!==hybrid.status))throw Error('Hybrid disagreement');
  const {certificate,...metrics}=pns;
  const {certificate:hybridCertificate,...hybridMetrics}=hybrid;
  rows.push({shape,cells:game.cells.length,density,seed,randomCount,distance:R.analyse(game,state).distance,
    staticPlanFound:!!fixed,pns:{...metrics,verification},hybrid:{...hybridMetrics,verification:hybridCheck},old:{status:old.status,nodes:old.nodes,ms:old.ms}});
  console.log(`${shape} ${density}% ${i}: PNS=${pns.status} (${pns.nodes}), old=${old.status}, hybrid=${hybrid.status}`);
}
const output={date:new Date().toISOString(),runtime:process.version,cpu:os.cpus()[0].model,
  settings:{ms:budget,maxNodes:30000,oldMaxDepth:30,generator:'R.createGame; no createCertified, no rejection sampling',seeds:3},rows};
fs.writeFileSync(path.join(__dirname,'benchmark-results.json'),JSON.stringify(output,null,2),'utf8');
for(const [shape] of variants){
  const group=rows.filter(r=>r.shape===shape);
  const counts=field=>Object.fromEntries(['blocker','cat','unknown'].map(s=>[s,group.filter(r=>r[field].status===s).length]));
  console.log(JSON.stringify({shape,pns:counts('pns'),old:counts('old'),hybrid:counts('hybrid'),staticFound:group.filter(r=>r.staticPlanFound).length}));
}
