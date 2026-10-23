(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rules.js'),require('./solver.js'),require('./proof.js'),require('./tactics.js'));
  else {root.CatAIFactory=factory;root.CatAI=factory(root.CatRules,root.CatSolver,root.CatProof,root.CatTactics);}
})(typeof globalThis!=='undefined'?globalThis:this,function(R,S,P,T){
  'use strict';
  const LEVELS={easy:{ms:80,depth:2,width:8},normal:{ms:300,depth:5,width:12},hard:{ms:1000,depth:8,width:18}};
  function choose(game,state,level='normal',overrides={}){
    const config={...(LEVELS[level]||LEVELS.normal),...overrides};
    const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
    const started=now(),deadline=started+config.ms;let nodes=0;
    if(state.winner)return {action:null,depth:0,nodes:0,ms:0};
    if(level==='easy'&&state.turn==='blocker'&&!overrides.forceProof){
      const a=R.analyse(game,state),cut=S.minCut(game,state,S.distances(game,state.blocked,[state.cat]));
      const choices=a.legal.filter(i=>a.distances[i]>=0).sort((x,y)=>a.distances[x]-a.distances[y]||x-y);
      // Beginner policy reacts to the nearest escape route, without a global winning strategy.
      const random=R.rng(`${state.cat}|${state.ply}|${[...state.blocked].sort((a,b)=>a-b).join(',')}`);
      const pick=Math.floor(random()*Math.min(3,choices.length));
      return {action:cut.length===1?cut[0]:choices[pick]??R.actions(game,state)[0],depth:1,nodes:1,ms:Math.round(now()-started),proven:false};
    }
    const useProof=level!=='easy'||overrides.forceProof;
    if(useProof&&P&&overrides.certificate&&P.verify(game,state,overrides.certificate).valid){
      const action=P.action(game,state,overrides.certificate);
      if(action!==null)return {action,proven:true,certificate:overrides.certificate,depth:0,nodes:0,ms:Math.round(now()-started)};
      const defence=P.resistance(game,state,overrides.certificate);
      if(defence.action!==null)return {action:defence.action,resisting:true,certificate:overrides.certificate,depth:0,nodes:0,ms:Math.round(now()-started)};
    }
    if(useProof&&state.turn==='blocker'&&!state.winner&&S){
      const supplied=Array.isArray(overrides.plan)?overrides.plan.filter(i=>!state.blocked.has(i)):null;
      const checked=supplied?S.verifyPlan(game,state,supplied):null;
      const certificate=checked?.valid?{plan:supplied.slice(0,checked.steps),...checked}:S.findPlan(game,state);
      if(certificate?.plan.length)return {action:certificate.plan[0],depth:0,nodes:0,ms:Math.round(now()-started),value:-100000,proven:true,remaining:certificate.steps,plan:certificate.plan};
    }
    if(useProof&&P&&config.ms>100){
      const proof=P.solve(game,state,{ms:Math.max(0,Math.min(config.ms*.4,deadline-now())),maxNodes:12000,usePlans:true});
      nodes+=proof.nodes;
      if(proof.status===state.turn&&P.verify(game,state,proof.certificate).valid){
        return {action:P.action(game,state,proof.certificate),proven:true,certificate:proof.certificate,depth:0,nodes,ms:Math.round(now()-started)};
      }
    }
    const result=T.choose(game,state,{ms:Math.max(0,deadline-now()),depth:config.depth,width:config.width});
    return {...result,nodes:result.nodes+nodes,ms:Math.round(now()-started)};
  }
  return {choose,LEVELS};
});
