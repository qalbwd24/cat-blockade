(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rules.js'),require('./solver.js'),require('./proof.js'));
  else {root.CatOpeningsFactory=factory;root.CatOpenings=factory(root.CatRules,root.CatSolver,root.CatProof);}
})(typeof globalThis!=='undefined'?globalThis:this,function(R,S,P){
  'use strict';
  function quality(game,state){
    const a=R.analyse(game,state),cut=S.minCut(game,state,S.distances(game,state.blocked,[state.cat]));
    const empty=R.analyse(game,{cat:game.start,blocked:new Set(game.fixed)}).distance;
    return {distance:a.distance,routes:cut.length,area:a.area,exits:a.exitCount,neighbors:a.legal.length,
      acceptable:Number.isFinite(a.distance)&&a.distance>=Math.max(4,Math.min(8,empty))&&cut.length>=4&&a.legal.length>=4&&a.area>=Math.min(60,game.cells.length*.5)&&a.exitCount>=Math.min(8,game.exits.size)};
  }
  // Sample ordinary scattered obstacles; do not add/remove obstacles to manufacture a proof.
  // Node budgets are deterministic so a seed identifies the same accepted sample on every device.
  function create(raw,density=35,seed='cat',options={}){
    const map=R.validateMap(raw),attempts=options.attempts??64,seen=new Set();
    for(let attempt=0;attempt<attempts;attempt++){
      options.onProgress?.(attempt+1,attempts);
      const sampleSeed=`${seed}/sample-${attempt}`,m=R.createGame(map,density,sampleSeed),q=quality(m.game,m.state);
      const signature=[...m.state.blocked].sort((a,b)=>a-b).join(',');if(seen.has(signature))continue;seen.add(signature);
      if(!q.acceptable)continue;
      const proof=P.solve(m.game,m.state,{ms:Infinity,maxNodes:options.maxNodes??8000,usePlans:true});
      if(proof.status!=='blocker'||!P.verify(m.game,m.state,proof.certificate).valid)continue;
      q.resistancePlies=P.resistance(m.game,m.state,proof.certificate).plies;
      // Keep room for a resisting cat to develop the game; a blunder may still end it earlier.
      if(q.resistancePlies<11||q.resistancePlies>59)continue;
      return {...m,seed:String(seed),sampleSeed,quality:q,attempts:attempt+1,proof:{...proof,method:'branch-certificate'}};
    }
    throw Error('这组条件下尚未筛到有解且有多条出路的开局。请换种子、将障碍调至 32%～40%，或关闭“筛选有解对局”自由开局。');
  }
  return {create,quality};
});
