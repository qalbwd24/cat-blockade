'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const R=require('../dist/rules.js'), P=require('../research/proof-search.cjs'), O=require('../research/reference.cjs');
const example=require('../research/adaptive-example.json');
function exampleMatch(){return R.createGame(example.map,0);}

test('PNS agrees with exhaustive minimax on 256 small states, including both turns and terminal states',()=>{
  const maps=[O.hex(1),R.validateMap({cells:Array.from({length:7},(_,i)=>`${i-3},0`),start:'0,0',autoExits:false,exits:['-3,0','3,0']})];
  let count=0;
  for(const map of maps){const game=R.compile(map),free=game.cells.map((_,i)=>i).filter(i=>i!==game.start);
    for(let mask=0;mask<64;mask++)for(const turn of ['cat','blocker']){
      const state={cat:game.start,blocked:new Set(free.filter((_,i)=>mask&(1<<i))),turn,ply:0,winner:null};
      const expected=O.exact(game,state),actual=P.solve(game,state,{ms:1000,maxNodes:100000});
      assert.equal(actual.status,expected.status,`${map.name}/${mask}/${turn}`);
      assert(P.verify(game,state,actual.certificate).valid);count++;
    }
  }assert.equal(count,256);
});

test('PNS agrees with oracle on 60 denser random 19-cell positions',()=>{
  for(let seed=0;seed<30;seed++)for(const turn of ['cat','blocker']){
    const {game,state}=R.createGame(O.hex(2),60,`crosscheck-${seed}`);state.turn=turn;
    const expected=O.exact(game,state),actual=P.solve(game,state,{ms:2000,maxNodes:100000});
    assert.equal(actual.status,expected.status,`${seed}/${turn}`);
    assert(P.verify(game,state,actual.certificate).valid);
  }
});

test('a real adaptive win has no fixed winning sequence, exhaustively checked',()=>{
  const {game,state}=exampleMatch();
  assert.equal(O.exact(game,state).status,'blocker');
  assert.equal(O.fixedSequence(game,state).exists,false);
  assert(P.verify(game,state,example.result.certificate).valid);
  const answer=P.solve(game,state);assert.equal(answer.status,'blocker');
  assert(P.verify(game,state,answer.certificate).valid);
});

test('independent certificate checker rejects missing replies, invalid moves, false leaves and cycles',()=>{
  const {game,state}=exampleMatch();
  const fresh=()=>structuredClone(example.result.certificate);
  let c=fresh();c.nodes[5].moves.pop();assert.match(P.verify(game,state,c).reason,/Missing opponent/);
  c=fresh();c.nodes[0].moves[0].action=state.cat;assert(!P.verify(game,state,c).valid);
  c=fresh();c.nodes[0]={terminal:'blocker'};assert(!P.verify(game,state,c).valid);
  c=fresh();c.nodes[5].moves[0].to=0;assert.match(P.verify(game,state,c).reason,/Cyclic/);
  c=fresh();delete c.nodes[19];assert(!P.verify(game,state,c).valid);
  c=fresh();c.winner='cat';assert(!P.verify(game,state,c).valid);
});

test('time and node limits return unknown and never accept a partially expanded proof',()=>{
  const {game,state}=exampleMatch();
  for(const limits of [{ms:0},{ms:1000,maxNodes:1},{ms:1000,maxNodes:2},{ms:1000,maxNodes:10}]){
    const answer=P.solve(game,state,limits);assert.equal(answer.status,'unknown');assert.equal(answer.certificate,null);
  }
});

test('hybrid search retains branching strategies and checks every fixed-plan shortcut',()=>{
  for(let seed=0;seed<30;seed++)for(const turn of ['cat','blocker']){
    const {game,state}=R.createGame(O.hex(2),60,`hybrid-${seed}`);state.turn=turn;
    const expected=O.exact(game,state),actual=P.solve(game,state,{ms:2000,maxNodes:100000,usePlans:true});
    assert.equal(actual.status,expected.status);assert(P.verify(game,state,actual.certificate).valid);
  }
  const {game,state}=exampleMatch();const result=P.solve(game,state,{usePlans:true});
  assert.equal(result.status,'blocker');assert(P.verify(game,state,result.certificate).valid);
  assert(result.certificate.nodes[result.certificate.root].moves);
  const forged={version:1,winner:'blocker',root:0,nodes:{0:{plan:[]}}};
  assert(!P.verify(game,state,forged).valid);
});
