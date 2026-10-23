const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../dist/rules.js');
const AI=require('../dist/ai.js');
const names=['island','crescent','ring','random','hex'];
const line=(fixed=[])=>R.validateMap({cells:Array.from({length:7},(_,i)=>`${i-3},0`),start:'0,0',autoExits:false,exits:['-3,0','3,0'],fixed});

test('six axial neighbors are distinct and reciprocal, including negative coordinates',()=>{
  for(const id of ['0,0','-5,3','4,-8']){const n=R.adjacent(id);assert.equal(new Set(n).size,6);for(const x of n){assert(R.adjacent(x).includes(id));assert.equal(R.hexDistance(id,x),1);}}
});
test('interior holes do not become automatic exits, but a channel to outside does',()=>{
  const hex=R.preset('hex','holes',5);const cells=hex.cells.filter(x=>x!=='0,0');const exits=new Set(R.outsideExits(cells));
  for(const id of R.adjacent('0,0'))assert(!exits.has(id));
  const channel=cells.filter(x=>!['1,0','2,0','3,0','4,0','5,0'].includes(x));
  assert(R.outsideExits(channel).includes('0,1'));
});
test('invalid maps are rejected before changing game state',()=>{
  const map=R.preset('hex');
  for(const bad of [null,{}, {...map,cells:[]},{...map,cells:[...map.cells,map.cells[0]]},{...map,start:map.exits[0]},{...map,start:'10,10'},{...map,cells:[...map.cells,'10,10']},{...map,cells:[...map.cells,'100,0']},{...map,autoExits:false,exits:[]},{...map,fixed:[map.start]},{...map,fixed:['9,9']},{...map,autoExits:false,exits:['7,7']}])assert.throws(()=>R.validateMap(bad));
  assert.throws(()=>line(['-1,0','1,0']));
});
for(const name of names)test(`preset ${name}: connected, interior start, deterministic random generation`,()=>{
  assert.deepEqual(R.preset(name,'same'),R.preset(name,'same'));
  const map=R.preset(name,'layout');
  for(let i=0;i<12;i++)for(const density of [0,12,32,100]){
    const a=R.createGame(map,density,`seed-${i}`),b=R.createGame(map,density,`seed-${i}`);
    assert.deepEqual([...a.state.blocked],[...b.state.blocked]);
    assert(!a.state.blocked.has(a.state.cat));assert.equal(R.winner(a.game,a.state),null);
    assert(R.analyse(a.game,a.state).distance>=2);
    assert.equal(a.state.turn,'blocker');
  }
});
test('same seed random island repeats and different seeds change terrain',()=>{
  assert.notDeepEqual(R.preset('random','a').cells,R.preset('random','b').cells);
});
test('fixed obstacles survive random setup and can include exits',()=>{
  const map=line(['-3,0']);const m=R.createGame(map,0,'x');assert(m.state.blocked.has(m.game.lookup.get('-3,0')));assert.equal(m.state.blocked.size,1);
});
test('blocker must place exactly one obstacle and cannot cover cat or blocked cells',()=>{
  const m=R.createGame(line(),0);const {game,state}=m,at=game.lookup.get('1,0');
  assert.throws(()=>R.transition(game,state,state.cat));assert.throws(()=>R.transition(game,state,100));
  const next=R.transition(game,state,at);assert.equal(next.blocked.size,1);assert.equal(state.blocked.size,0);assert.equal(next.turn,'cat');assert.equal(next.ply,1);
  assert.throws(()=>R.transition(game,{...next,turn:'blocker'},at));
});
test('cat moves one neighboring cell, cannot jump, stand still, or enter walls',()=>{
  const m=R.createGame(line(['-1,0']),0),s={...m.state,turn:'cat'};
  for(const id of ['0,0','-1,0','2,0'])assert.throws(()=>R.transition(m.game,s,m.game.lookup.get(id)));
  const next=R.transition(m.game,s,m.game.lookup.get('1,0'));assert.equal(next.turn,'blocker');assert.equal(next.cat,m.game.lookup.get('1,0'));
});
test('cat immediately wins on reaching an exit, and finished states reject moves',()=>{
  const m=R.createGame(line(),0),s={...m.state,turn:'cat',cat:m.game.lookup.get('2,0')};
  const next=R.transition(m.game,s,m.game.lookup.get('3,0'));assert.equal(next.winner,'cat');assert.deepEqual(R.actions(m.game,next),[]);assert.throws(()=>R.transition(m.game,next,0));
});
test('blocking all paths wins even while the cat still has neighboring empty cells',()=>{
  const m=R.createGame(line(['-2,0']),0);const next=R.transition(m.game,m.state,m.game.lookup.get('2,0'));
  assert.equal(next.winner,'blocker');assert.equal(R.analyse(m.game,next).legal.length,2);
});
test('manually specified interior exits are legal and obey ordinary win rules',()=>{
  const map=R.preset('hex');map.autoExits=false;map.exits=['1,0'];map.start='0,0';const m=R.createGame(map,0);
  const next=R.transition(m.game,{...m.state,turn:'cat'},m.game.lookup.get('1,0'));assert.equal(next.winner,'cat');
});
test('cat AI takes an immediate escape and blocker AI seals an immediate escape',()=>{
  const m=R.createGame(line(['1,0']),0),s={...m.state,cat:m.game.lookup.get('2,0')};
  for(const turn of ['cat','blocker']){const choice=AI.choose(m.game,{...s,turn},'normal');assert.equal(choice.action,m.game.lookup.get('3,0'));}
});
test('AI obeys legal actions even with an exhausted budget and never mutates input',()=>{
  const m=R.createGame(R.preset('island'),12,'stable');const before=JSON.stringify({...m.state,blocked:[...m.state.blocked]});
  for(const turn of ['cat','blocker'])for(const ms of [0,25]){const s={...m.state,turn};const result=AI.choose(m.game,s,'easy',{ms});assert(R.actions(m.game,s).includes(result.action));}
  assert.equal(before,JSON.stringify({...m.state,blocked:[...m.state.blocked]}));
});
for(const name of names)test(`AI vs AI ${name}: completes a legal finite game`,()=>{
  const m=R.createGame(R.preset(name,'duel'),12,'duel');let state=m.state;const max=2*m.game.cells.length+1;
  while(!state.winner&&state.ply<max){const result=AI.choose(m.game,state,'easy',{ms:25,depth:2});assert(R.actions(m.game,state).includes(result.action));state=R.transition(m.game,state,result.action);}
  assert(['cat','blocker'].includes(state.winner));assert(state.ply<max);
});
