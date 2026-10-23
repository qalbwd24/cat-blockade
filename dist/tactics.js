(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rules.js'),require('./solver.js'));
  else {root.CatTacticsFactory=factory;root.CatTactics=factory(root.CatRules,root.CatSolver);}
})(typeof globalThis!=='undefined'?globalThis:this,function(R,S){
  'use strict';
  const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
  function choose(game,state,{ms=200,depth=5,width=12}={}){
    const start=clock(),deadline=start+ms,n=game.cells.length,blocked=new Uint8Array(n),exit=new Uint8Array(n),STOP={};
    for(const i of state.blocked)blocked[i]=1;for(const i of game.exits)exit[i]=1;
    let nodes=0,done=0;const check=()=>{if(clock()>=deadline)throw STOP;};
    function metrics(cat,ply){
      nodes++;
      if(exit[cat])return {value:100000-ply,terminal:true};
      const distance=new Int16Array(n).fill(-1),queue=new Int16Array(n);let count=0;
      for(const e of game.exits)if(!blocked[e]){queue[count++]=e;distance[e]=0;}
      for(let k=0;k<count;k++)for(const j of game.neighbors[queue[k]])if(!blocked[j]&&distance[j]<0){distance[j]=distance[queue[k]]+1;queue[count++]=j;}
      if(distance[cat]<0)return {value:-100000+ply,terminal:true};
      const visited=new Uint8Array(n);visited[cat]=1;queue[0]=cat;count=1;let exits=0;
      for(let k=0;k<count;k++){
        const at=queue[k];if(exit[at])exits++;
        for(const j of game.neighbors[at])if(!blocked[j]&&!visited[j]){visited[j]=1;queue[count++]=j;}
      }
      let mobility=0,forward=0,room=0;
      for(const j of game.neighbors[cat])if(!blocked[j]){
        mobility++;if(distance[j]<distance[cat])forward++;
        if(game.neighbors[j].filter(k=>!blocked[k]).length>=3)room++;
      }
      return {value:-distance[cat]*65+Math.min(exits,12)*12+mobility*22+forward*30+room*18+Math.log2(count+1)*7,terminal:false,distance};
    }
    function actions(cat,turn){
      return turn==='cat'?game.neighbors[cat].filter(i=>!blocked[i]):game.cells.map((_,i)=>i).filter(i=>i!==cat&&!blocked[i]);
    }
    function after(cat,turn,at,ply,fn){
      if(turn==='cat')return fn(at,'blocker',ply+1);
      blocked[at]=1;try{return fn(cat,'cat',ply+1);}finally{blocked[at]=0;}
    }
    function order(cat,turn,ply,root=false){
      const rows=[];
      for(const at of actions(cat,turn)){
        check();const m=after(cat,turn,at,ply,(c,t,p)=>metrics(c,p));let value=m.value;
        if(root&&turn==='cat'&&!m.terminal){
          const next={cat:at,blocked:new Set(state.blocked)},cut=S.minCut(game,next,S.distances(game,next.blocked,[at]));
          value=cut.length===1?-99900+ply:value+Math.min(cut.length,4)*110;
        }
        rows.push({at,value,terminal:m.terminal});
      }
      rows.sort((a,b)=>(turn==='cat'?b.value-a.value:a.value-b.value)||a.at-b.at);
      return turn==='blocker'?rows.slice(0,width):rows;
    }
    function search(cat,turn,ply,remaining,alpha,beta){
      check();const m=metrics(cat,ply);if(m.terminal||remaining===0)return m.value;
      const rows=order(cat,turn,ply);let value=turn==='cat'?-Infinity:Infinity;
      for(const row of rows){
        const v=after(cat,turn,row.at,ply,(c,t,p)=>search(c,t,p,remaining-1,alpha,beta));
        if(turn==='cat'){value=Math.max(value,v);alpha=Math.max(alpha,value);}else{value=Math.min(value,v);beta=Math.min(beta,value);}
        if(alpha>=beta)break;
      }
      return value;
    }
    const legal=R.actions(game,state);if(!legal.length)return {action:null,depth:0,nodes:0,ms:0};
    const initial=metrics(state.cat,state.ply);let best=legal[0],bestValue=initial.value;
    if(state.turn==='cat'&&initial.distance)best=legal.reduce((a,b)=>initial.distance[b]>=0&&(initial.distance[a]<0||initial.distance[b]<initial.distance[a])?b:a,best);
    try{
      let root=order(state.cat,state.turn,state.ply,true);best=root[0].at;bestValue=root[0].value;done=1;
      if(root[0].terminal)return {action:best,depth:done,nodes,ms:Math.round(clock()-start),value:bestValue};
      for(let d=2;d<=depth;d++){
        let alpha=-Infinity,beta=Infinity,chosen=root[0].at,value=state.turn==='cat'?-Infinity:Infinity;const completed=[];
        for(const row of root){
          const v=after(state.cat,state.turn,row.at,state.ply,(c,t,p)=>search(c,t,p,d-1,alpha,beta));
          completed.push({...row,value:v});
          if(state.turn==='cat'?v>value:v<value){value=v;chosen=row.at;}
          if(state.turn==='cat')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);
        }
        best=chosen;bestValue=value;done=d;root=completed.sort((a,b)=>state.turn==='cat'?b.value-a.value:a.value-b.value);
        if(Math.abs(value)>99000)break;
      }
    }catch(e){if(e!==STOP)throw e;}
    return {action:best,depth:done,nodes,ms:Math.round(clock()-start),value:bestValue};
  }
  return {choose};
});
