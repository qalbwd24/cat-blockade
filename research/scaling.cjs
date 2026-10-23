'use strict';
const fs=require('node:fs'),path=require('node:path');
const R=require('../dist/rules.js'),P=require('./proof-search.cjs'),O=require('./reference.cjs');
const rows=[];
for(const [shape,map,budget] of [['hex3',O.hex(3),5000],['island10',R.preset('island','benchmark',10),5000]])for(let i=0;i<3;i++){
  const seed=`research-holdout-${i}`,{game,state}=R.createGame(map,18,seed);
  const result=P.solve(game,state,{ms:budget,maxNodes:300000,usePlans:true});
  const verification=result.certificate?P.verify(game,state,result.certificate):null;
  if(verification&&!verification.valid)throw Error('Invalid proof');
  const {certificate,...metrics}=result;rows.push({shape,seed,density:18,budget,maxNodes:300000,...metrics,verification});
  console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(path.join(__dirname,'scaling-results.json'),JSON.stringify(rows,null,2),'utf8');
