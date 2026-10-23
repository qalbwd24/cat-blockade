const {test}=require('node:test');const assert=require('node:assert/strict');
const R=require('../dist/rules.js'),S=require('../dist/solver.js'),AI=require('../dist/ai.js');
const presets=['island','crescent','ring','random','hex'];
// Reference oracle: no heuristic, cut search, timing lemma or frontier verifier.
// Branch on each real move until a winner; increasing obstacles makes it finite.
function oracle(game,state,memo=new Map()){
  const winner=R.winner(game,state);if(winner)return winner;
  const key=state.turn+'|'+state.cat+'|'+[...state.blocked].sort((a,b)=>a-b).join(',');if(memo.has(key))return memo.get(key);
  const own=state.turn,other=own==='cat'?'blocker':'cat';
  for(const action of R.actions(game,state))if(oracle(game,R.transition(game,state,action),memo)===own){memo.set(key,own);return own;}
  memo.set(key,other);return other;
}
function branchCheck(game,state,plan,index=0,memo=new Map()){
  const winner=R.winner(game,state);if(winner)return winner==='blocker';
  const key=index+'|'+state.turn+'|'+state.cat;if(memo.has(key))return memo.get(key);
  let result;
  if(state.turn==='blocker'){result=index<plan.length&&R.actions(game,state).includes(plan[index])&&branchCheck(game,R.transition(game,state,plan[index]),plan,index+1,memo);}
  else result=R.actions(game,state).every(action=>branchCheck(game,R.transition(game,state,action),plan,index,memo));
  memo.set(key,result);return result;
}
test('a one-step-wide open rim is proven cat-winning, not labelled solvable',()=>{
  const map=R.validateMap({cells:['0,0',...R.adjacent('0,0')],start:'0,0',autoExits:true}),m=R.createGame(map,0);
  assert.equal(S.findPlan(m.game,m.state),null);assert.equal(S.solve(m.game,m.state,{ms:500}).status,'cat');
  assert.throws(()=>S.createCertified(map,0,'x'),/未找到/);
});
test('zero proof budget returns unknown, never a guessed winner',()=>{
  const m=R.createGame(R.preset('hex'),0);assert.equal(S.solve(m.game,m.state,{ms:0}).status,'unknown');
});
test('certificate checker rejects occupied actions, unfinished plans and a cat escape',()=>{
  const m=R.createGame(R.validateMap({cells:Array.from({length:7},(_,i)=>`${i-3},0`),start:'0,0',autoExits:false,exits:['-3,0','3,0']}),0),id=x=>m.game.lookup.get(x);
  assert(S.verifyPlan(m.game,m.state,[id('-2,0'),id('2,0')]).valid);
  for(const plan of [[m.state.cat],[],[id('-2,0')],[id('-1,0'),id('1,0')],[id('-3,0'),id('3,0')+99]])assert(!S.verifyPlan(m.game,m.state,plan).valid);
  assert(!S.verifyPlan(m.game,{...m.state,turn:'cat',cat:id('2,0')},[id('3,0')]).valid);
});
test('proof solver and every accepted certificate agree with independent exhaustive oracle on small states',()=>{
  const maps=[R.validateMap({cells:Array.from({length:7},(_,i)=>`${i-3},0`),start:'0,0',autoExits:false,exits:['-3,0','3,0']}),R.validateMap({cells:['0,0',...R.adjacent('0,0')],start:'0,0',autoExits:true})];
  let checked=0;
  for(const map of maps){const game=R.compile(map),free=game.cells.map((_,i)=>i).filter(i=>i!==game.start),memo=new Map();
    for(let mask=0;mask<(1<<free.length);mask++)for(const turn of ['cat','blocker']){
      const state={cat:game.start,turn,blocked:new Set(free.filter((_,i)=>mask&(1<<i))),ply:0,winner:null};
      const expected=oracle(game,state,memo),answer=S.solve(game,state,{ms:1000,maxDepth:14});assert.equal(answer.status,expected,`${turn}/${mask}`);
      const certificate=S.findPlan(game,state);if(certificate){assert.equal(expected,'blocker');assert(branchCheck(game,state,certificate.plan));}checked++;
    }
  }assert.equal(checked,256);
});
for(const name of presets)test(`${name}: larger certified random maps satisfy exact all-path certificate`,()=>{
  for(const radius of [8,10,12])for(let i=0;i<12;i++){
    const seed=`certificate-${i}`,map=R.preset(name,seed,radius),m=S.createCertified(map,18,seed);
    assert.equal(m.proof.status,'blocker');assert.equal(R.winner(m.game,m.state),null);
    assert(S.verifyPlan(m.game,m.state,m.proof.plan).valid);assert(R.analyse(m.game,m.state).distance>=radius-3);
    assert.equal(m.state.blocked.size,m.requestedCount);assert.equal(m.game.cells.length,map.cells.length);
    if(i===0){assert(branchCheck(m.game,m.state,m.proof.plan));const again=S.createCertified(map,18,seed);assert.deepEqual([...m.state.blocked],[...again.state.blocked]);assert.deepEqual(m.proof.plan,again.proof.plan);}
  }
});
test('blocker AI preserves a forced win against every cat reply on a certified board',()=>{
  const m=S.createCertified(R.preset('island','ai-proof'),18,'ai-proof'),memo=new Set();let nodes=0;
  function visit(state){if(state.winner){assert.equal(state.winner,'blocker');return;}
    const key=state.cat+'|'+state.turn+'|'+[...state.blocked].sort((a,b)=>a-b).join(',');if(memo.has(key))return;memo.add(key);nodes++;
    assert(state.ply<20);
    if(state.turn==='blocker'){const result=AI.choose(m.game,state,'normal',{ms:0});assert(result.proven);visit(R.transition(m.game,state,result.action));}
    else for(const action of R.actions(m.game,state))visit(R.transition(m.game,state,action));
  }visit(m.state);assert(nodes>10);
});
test('custom imports are independently revalidated; claimed proof data is ignored',()=>{
  const map=R.validateMap({cells:['0,0',...R.adjacent('0,0')],start:'0,0',autoExits:true,proof:{status:'blocker',plan:[]}});
  assert.equal(map.proof,undefined);const m=R.createGame(map,0);assert.equal(S.solve(m.game,m.state,{ms:500}).status,'cat');
});
