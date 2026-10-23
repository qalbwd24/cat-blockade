'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/rules'),P=require('../dist/proof'),O=require('../dist/openings'),AI=require('../dist/ai');
const example=require('../research/adaptive-example.json');

test('the game AI follows a genuinely adaptive proof against every cat response',()=>{
  const {game,state}=R.createGame(example.map,0);let branches=0;
  function visit(s,c){
    if(s.winner){assert.equal(s.winner,'blocker');return;}
    assert(P.verify(game,s,c).valid);
    const actions=s.turn==='cat'?R.actions(game,s):[AI.choose(game,s,'normal',{ms:0,certificate:c}).action];
    if(s.turn==='cat')branches+=actions.length;
    for(const at of actions)visit(R.transition(game,s,at),P.advance(c,s.turn,at));
  }
  visit(state,example.result.certificate);assert(branches>=4);
});

test('screening preserves an ordinary random sample and supports sustained resisting play',()=>{
  const map=R.preset('island','release-play-island-0',8),m=O.create(map,35,'release-play-island-0');
  const original=R.createGame(map,35,m.sampleSeed);
  assert.deepEqual([...m.state.blocked],[...original.state.blocked]);assert.equal(m.randomCount,m.requestedCount);
  assert(m.quality.routes>=4&&m.quality.neighbors>=4&&m.quality.resistancePlies>=11);
  let s=m.state,c=m.proof.certificate;
  while(!s.winner&&s.ply<100){
    const result=AI.choose(m.game,s,'normal',{ms:0,certificate:c});
    assert(R.actions(m.game,s).includes(result.action));
    c=P.advance(c,s.turn,result.action);s=R.transition(m.game,s,result.action);
  }
  assert.equal(s.winner,'blocker');assert.equal(s.ply,m.quality.resistancePlies);
});

test('screening exhaustion rejects the sample instead of adding a ring or claiming a proof',()=>{
  assert.throws(()=>O.create(R.preset('hex','reject',8),0,'reject',{attempts:2,maxNodes:0}),/尚未筛到/);
});
