'use strict';
const fs=require('node:fs'),path=require('node:path');
const R=require('../dist/rules'),P=require('../dist/proof'),O=require('../dist/openings'),AI=require('../dist/ai');
const rows=[];
const saved=[];
const cached=process.argv.includes('--cached')?require('../research/release-openings.json'):[];
const previous=cached.length?require('../可玩性验证.json').rows:[];
for(const shape of ['island','crescent','ring','random','hex'])for(let i=0;i<3;i++){
  const radius=[8,10,12][i],seed=`release-play-${shape}-${i}`,start=performance.now();
  let m;
  try{const old=cached.find(x=>x.seed===seed);if(old){const game=R.compile(old.map);m={...old,game,state:{cat:game.start,blocked:new Set(old.blocked),turn:'blocker',ply:0,winner:null},attempts:previous.find(x=>x.seed===seed).attempts};}else m=O.create(R.preset(shape,seed,radius),35,seed);}catch(e){rows.push({shape,radius,seed,error:e.message});console.log(shape,radius,'GENERATION FAILED');continue;}
  const generationMs=cached.length?previous.find(x=>x.seed===seed).generationMs:Math.round(performance.now()-start);
  saved.push({seed,map:m.game.map,blocked:[...m.state.blocked],proof:m.proof,quality:m.quality});
  if(!P.verify(m.game,m.state,m.proof.certificate).valid)throw Error('Bad opening proof');
  const games=[];
  for(const [blocker,cat] of [['normal','normal'],['easy','easy'],['easy','normal']]){
    let state=m.state,certificate=m.proof.certificate,maxMs=0,proofMoves=0;
    while(!state.winner&&state.ply<150){
      const before=performance.now(),choice=AI.choose(m.game,state,state.turn==='blocker'?blocker:cat,{ms:80,certificate});
      maxMs=Math.max(maxMs,performance.now()-before);
      if(!R.actions(m.game,state).includes(choice.action))throw Error('Illegal AI action');
      if(choice.certificate)certificate=choice.certificate;
      if(choice.proven)proofMoves++;
      certificate=P.advance(certificate,state.turn,choice.action);
      state=R.transition(m.game,state,choice.action);
      if(certificate&&!state.winner&&!P.verify(m.game,state,certificate).valid)certificate=null;
    }
    if(!state.winner)throw Error('Game exceeded playability bound');
    if(blocker==='normal'&&state.winner!=='blocker')throw Error('Dropped a winning strategy');
    games.push({blocker,cat,winner:state.winner,plies:state.ply,maxMs:Math.round(maxMs),proofMoves});
  }
  const row={shape,radius,seed,cells:m.game.cells.length,quality:m.quality,attempts:m.attempts,generationMs,games};rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(__dirname,'../可玩性验证.json'),JSON.stringify({date:new Date().toISOString(),density:35,aiBudgetMs:80,rows},null,2),'utf8');
fs.writeFileSync(path.join(__dirname,'../research/release-openings.json'),JSON.stringify(saved),'utf8');
