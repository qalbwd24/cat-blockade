'use strict';
const fs=require('node:fs'), path=require('node:path');
const R=require('../dist/rules.js'), P=require('./proof-search.cjs'), O=require('./reference.cjs');
for(let seed=0;seed<2000;seed++) {
  const sample=R.createGame(O.hex(2),55,`adaptive-${seed}`);
  const {game,state}=sample;
  const result=P.solve(game,state,{ms:1000,maxNodes:40000});
  if(result.status!=='blocker')continue;
  const fixed=O.fixedSequence(game,state);
  if(fixed.exists)continue;
  const oracle=O.exact(game,state), verification=P.verify(game,state,result.certificate);
  if(oracle.status!=='blocker'||!verification.valid)throw Error('Disagreement');
  const out={seed:sample.seed,map:{...game.map,fixed:[...state.blocked].map(i=>game.cells[i])},
    initial: {cat:state.cat,blocked:[...state.blocked],turn:state.turn},
    oracle,fixed,result,verification};
  fs.writeFileSync(path.join(__dirname,'adaptive-example.json'),JSON.stringify(out,null,2),'utf8');
  console.log(JSON.stringify({seed:sample.seed,oracle,fixed,verification,searchNodes:result.nodes}));
  process.exit(0);
}
throw Error('No example in tested set');
