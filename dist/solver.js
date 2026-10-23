(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rules.js'));
  else {root.CatSolverFactory=factory;root.CatSolver=factory(root.CatRules);}
})(typeof globalThis!=='undefined'?globalThis:this,function(R){
  'use strict';
  const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
  function distances(game,blocked,sources){
    const d=new Int16Array(game.cells.length).fill(-1),queue=[];
    for(const i of sources)if(!blocked.has(i)&&d[i]<0){d[i]=0;queue.push(i);}
    for(let p=0;p<queue.length;p++)for(const n of game.neighbors[queue[p]])if(d[n]<0&&!blocked.has(n)){d[n]=d[queue[p]]+1;queue.push(n);}
    return d;
  }
  // Independently verify a FIXED blocker strategy against every possible cat walk.
  // The frontier is the union of live cat branches after the same fixed obstacles.
  // Already trapped branches are victories and can be removed; an escaping branch
  // or an occupied placement invalidates the whole certificate.
  function verifyPlan(game,state,plan){
    if(!Array.isArray(plan))return {valid:false,reason:'missing-plan'};
    const blocked=new Set(state.blocked);let cats=new Set([state.cat]),maxFrontier=1,steps=0;
    if(game.exits.has(state.cat))return {valid:false,reason:'cat-already-escaped'};
    function prune(){const toExit=distances(game,blocked,game.exits);cats=new Set([...cats].filter(i=>toExit[i]>=0));}
    function advance(){
      const next=new Set();for(const cat of cats)for(const n of game.neighbors[cat])if(!blocked.has(n)){if(game.exits.has(n))return false;next.add(n);}
      cats=next;maxFrontier=Math.max(maxFrontier,cats.size);return true;
    }
    prune();if(!cats.size)return {valid:true,steps:0,maxFrontier};
    if(state.turn==='cat'&&!advance())return {valid:false,reason:'cat-escapes-before-block'};
    for(const at of plan){
      if(!Number.isInteger(at)||at<0||at>=game.cells.length||blocked.has(at)||cats.has(at))return {valid:false,reason:'illegal-in-some-branch'};
      blocked.add(at);steps++;prune();
      if(!cats.size)return {valid:true,steps,maxFrontier};
      if(!advance())return {valid:false,reason:'escaping-branch'};
    }
    return {valid:false,reason:'unfinished'};
  }
  function minCut(game,state,fromCat){
    // Vertex splitting, weighted to prefer more distant cuts of similar size.
    const count=game.cells.length,N=count*2+1,sink=N-1,source=state.cat*2+1,INF=1e8,graph=Array.from({length:N},()=>[]);
    function edge(a,b,cap){const x={to:b,cap,rev:graph[b].length},y={to:a,cap:0,rev:graph[a].length};graph[a].push(x);graph[b].push(y);}
    for(let i=0;i<count;i++)if(!state.blocked.has(i)){
      edge(i*2,i*2+1,i===state.cat?INF:1000+Math.floor(200/(Math.max(0,fromCat[i])+1)));
      for(const n of game.neighbors[i])if(!state.blocked.has(n))edge(i*2+1,n*2,INF);
      if(game.exits.has(i))edge(i*2+1,sink,INF);
    }
    let flow=0;
    for(;;){
      const level=new Int16Array(N).fill(-1),queue=[source];level[source]=0;
      for(let p=0;p<queue.length;p++)for(const e of graph[queue[p]])if(e.cap>0&&level[e.to]<0){level[e.to]=level[queue[p]]+1;queue.push(e.to);}
      if(level[sink]<0)break;
      const cursor=new Int32Array(N);
      function push(v,f){if(v===sink)return f;for(;cursor[v]<graph[v].length;cursor[v]++){const e=graph[v][cursor[v]];if(e.cap>0&&level[e.to]===level[v]+1){const sent=push(e.to,Math.min(f,e.cap));if(sent){e.cap-=sent;graph[e.to][e.rev].cap+=sent;return sent;}}}return 0;}
      let sent;while((sent=push(source,INF))>0){flow+=sent;if(flow>=INF)return [];}
    }
    const seen=new Set([source]),queue=[source];for(let p=0;p<queue.length;p++)for(const e of graph[queue[p]])if(e.cap>0&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}
    return game.cells.map((_,i)=>i).filter(i=>!state.blocked.has(i)&&i!==state.cat&&seen.has(i*2)&&!seen.has(i*2+1));
  }
  function findPlan(game,state,{useCut=true}={}){
    if(game.exits.has(state.cat))return null;
    const fromCat=distances(game,state.blocked,[state.cat]),a=R.analyse(game,state);
    if(a.distance===Infinity)return {plan:[],steps:0,maxFrontier:1,method:'already-trapped'};
    const candidates=[];
    // Graph-distance shells, and geometric shells around the original and current cat.
    for(let d=1;d<=a.distance;d++)candidates.push(game.cells.map((_,i)=>i).filter(i=>fromCat[i]===d));
    for(const centre of new Set([game.start,state.cat])){
      const rings=new Map();game.cells.forEach((id,i)=>{if(state.blocked.has(i)||i===state.cat)return;const d=R.hexDistance(id,game.cells[centre]);if(!rings.has(d))rings.set(d,[]);rings.get(d).push(i);});
      for(const [d,ring]of rings)if(d>0&&ring.length<=32)candidates.push(ring);
    }
    if(useCut)candidates.push(minCut(game,state,fromCat));
    const seen=new Set();candidates.sort((x,y)=>x.length-y.length);
    for(const cut of candidates){
      if(!cut.length||cut.length>32)continue;
      const plan=[...cut].sort((x,y)=>fromCat[x]-fromCat[y]||x-y),key=plan.join(',');if(seen.has(key))continue;seen.add(key);
      // A cheap sufficient timing filter; rejecting here means unknown, never a proof of loss.
      if(plan.some((at,i)=>fromCat[at]<i+1+(state.turn==='cat'?1:0)))continue;
      const checked=verifyPlan(game,state,plan);
      if(checked.valid)return {plan:plan.slice(0,checked.steps),...checked,method:'all-cat-paths'};
    }
    return null;
  }
  function createCertified(raw,density=18,seed='cat'){
    const map=R.validateMap(raw),game=R.compile(map),random=R.rng(seed),base={cat:game.start,blocked:new Set(game.fixed),turn:'blocker',ply:0,winner:null,last:null};
    if(!Number.isFinite(density)||density<0||density>100)throw Error('障碍比例应为 0～100。');
    const available=game.cells.map((_,i)=>i).filter(i=>i!==base.cat&&!base.blocked.has(i)),target=Math.round(available.length*density/100);
    const initial=R.createGame(map,density,seed),existing=findPlan(game,initial.state);
    if(existing){initial.proof={status:'blocker',...existing};return initial;}
    // Choose a random incomplete surrounding shell. Its remaining gates must be
    // closable before ANY cat path can pass. This uses the selected obstacle budget.
    const distance=R.analyse(game,base).distance,candidates=[];
    for(let radius=3;radius<distance;radius++){
      const ring=game.cells.map((_,i)=>i).filter(i=>R.hexDistance(game.cells[i],game.cells[base.cat])===radius&&!base.blocked.has(i));
      const gates=Math.min(radius,Math.max(3,Math.floor(radius*.8)));
      if(ring.length>gates&&ring.length-gates<=target)candidates.push({radius,ring,gates});
    }
    // Prefer larger enclosures so the game has room to develop.
    candidates.sort((a,b)=>b.radius-a.radius);
    for(const candidate of candidates)for(let attempt=0;attempt<6;attempt++){
      const ring=R.shuffled(candidate.ring,random),plan=ring.slice(0,candidate.gates),state={...base,blocked:new Set(base.blocked)};
      for(const at of ring.slice(candidate.gates))state.blocked.add(at);
      if(R.analyse(game,state).distance===Infinity||!verifyPlan(game,state,plan).valid)continue;
      const actualBefore=state.blocked.size-base.blocked.size;
      const spare=R.shuffled(available.filter(i=>!state.blocked.has(i)&&!plan.includes(i)),random);
      let added=actualBefore;
      for(const at of spare){if(added>=target)break;state.blocked.add(at);if(R.analyse(game,state).distance===Infinity){state.blocked.delete(at);continue;}added++;}
      const check=verifyPlan(game,state,plan);if(!check.valid)continue;
      return {game,state,seed:String(seed),randomCount:added,requestedCount:target,proof:{status:'blocker',plan:plan.slice(0,check.steps),...check,method:'all-cat-paths'}};
    }
    throw Error('这个地图与障碍比例下，未找到能证明围堵方有解的练习局。请提高障碍比例、增加地图纵深，或关闭“构造练习局”使用普通随机模式。');
  }
  function solve(game,state,{ms=1600,maxDepth=8,maxNodes=80000}={}){
    const started=clock(),deadline=started+ms;let nodes=0;const STOP={},memo=new Map();
    const key=s=>s.turn+'|'+s.cat+'|'+[...s.blocked].sort((a,b)=>a-b).join(',');
    function visit(s,depth){
      if(clock()>=deadline||nodes>=maxNodes)throw STOP;nodes++;
      const win=R.winner(game,s);if(win)return {status:win};
      const id=key(s),saved=memo.get(id);if(saved)return saved;
      // This is a proof-producing shortcut, not heuristic leaf evaluation.
      const cert=findPlan(game,s,{useCut:depth===maxDepth});
      if(cert){const result={status:'blocker',action:s.turn==='blocker'?cert.plan[0]:undefined,plan:cert.plan,method:cert.method};memo.set(id,result);return result;}
      if(depth===0)return {status:'unknown'};
      const legal=R.actions(game,s),own=s.turn,other=own==='cat'?'blocker':'cat';
      const rows=legal.map(action=>{const next=R.transition(game,s,action);const a=R.analyse(game,next);return {action,next,rank:next.winner===own?-1e6:(own==='cat'?a.distance:-a.distance)};}).sort((a,b)=>a.rank-b.rank);
      let unknown=false;
      for(const {action,next}of rows){const result=visit(next,depth-1);if(result.status===own){const answer={status:own,action,method:'exhaustive-and-or'};memo.set(id,answer);return answer;}if(result.status==='unknown')unknown=true;}
      // Only when EVERY legal action was disproved can the opponent be certified.
      if(!unknown){const answer={status:other,method:'exhaustive-and-or'};memo.set(id,answer);return answer;}
      return {status:'unknown'};
    }
    let result={status:'unknown'};
    try{result=visit(state,maxDepth);}catch(e){if(e!==STOP)throw e;}
    return {...result,nodes,ms:Math.round(clock()-started),maxDepth};
  }
  return {distances,verifyPlan,minCut,findPlan,createCertified,solve};
});
