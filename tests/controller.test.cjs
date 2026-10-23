// Controller integration runs in Node with a minimal document adapter, not a browser.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function harness(screened=false,pending=false){
  const handlers=new Map(),registry=new Map(),tasks=new Map(),workers=[],storage=new Map();let counter=0;
  class Element{
    constructor(){this.children=[];this.dataset={};this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.textContent='';this.listeners={};this.classList={toggle(){}};}
    setAttribute(k,v){this[k]=v;}
    appendChild(x){this.children.push(x);return x;}
    replaceChildren(...a){this.children=a;}
    addEventListener(t,f){this.listeners[t]=f;}
    querySelector(){return new Element();}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    click(){this.onclick?.();}
  }
  const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
  const els=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const get=id=>els.get(id);for(const [id,value]of Object.entries({'cat-controller':'human','blocker-controller':'human',difficulty:'normal',speed:'650',preset:'island',density:'35','map-size':'10',seed:'controller-test'}))get(id).value=value;
  get('certified-mode').checked=screened;
  const brushes=['add','erase','cat','exit','wall'].map(brush=>{const e=new Element();e.dataset.brush=brush;return e;});
  const document={getElementById:get,createElementNS:()=>new Element(),createElement:()=>new Element(),querySelector:()=>new Element(),querySelectorAll:()=>brushes,addEventListener:(k,f)=>handlers.set(k,f),modelContext:{registerTool:tool=>registry.set(tool.name,tool)},hidden:false};
  class FakeWorker{constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage(p){this.payload=p;}}
  const sandbox={document,window:{addEventListener(){}},console,performance,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},AbortController,Worker:FakeWorker,
    setTimeout:f=>{const id=++counter;tasks.set(id,f);return id;},clearTimeout:id=>tasks.delete(id),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
  const context=vm.createContext(sandbox);for(const file of ['rules.js','solver.js','proof.js','openings.js','tactics.js','ai.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context,{filename:file});
  function read(){return registry.get('read_cat_game').execute();}
  function play(cell){return registry.get('play_cat_game_move').execute({cell});}
  function tick(){const entry=tasks.entries().next().value;assert(entry,'Expected scheduled action');tasks.delete(entry[0]);entry[1]();}
  function finishWorker(w=workers.at(-1)){
    if(w.payload.kind==='opening'){
      try{const p=w.payload,m=context.CatOpenings.create(p.map,p.density,p.seed);w.onmessage({data:{result:{...m,game:undefined,map:m.game.map,state:{...m.state,blocked:[...m.state.blocked]}}}});}catch(e){w.onmessage({data:{error:e.message}});}return;
    }
    const p=w.payload,g=context.CatRules.compile(p.map),s={...p.state,blocked:new Set(p.state.blocked)};
    const result=p.kind==='solve'?context.CatProof.solve(g,s,{ms:200,maxNodes:8000,usePlans:true}):context.CatAI.choose(g,s,p.level,{ms:30,plan:p.plan,certificate:p.certificate});w.onmessage({data:{result}});
  }
  if(screened&&!pending)finishWorker();
  return {get,read,play,tick,workers,finishWorker,brushes,context};
}
test('controller boots in two-human mode, rejects invalid actions, alternates and undoes',()=>{
  const h=harness();const initial=h.read();assert.equal(initial.turn,'blocker');assert(!initial.winner);
  assert.equal(h.get('certified-mode').checked,false);
  const R=h.context.CatRules,ordinary=R.createGame(R.preset('island','controller-test',10),35,'controller-test');
  assert.deepEqual(Array.from(initial.blocked).sort(),[...ordinary.state.blocked].map(i=>ordinary.game.cells[i]).sort());
  assert.throws(()=>h.play(initial.cat));assert.equal(h.read().blocked.length,initial.blocked.length);
  h.play(initial.legal[0]);assert.equal(h.read().turn,'cat');assert.equal(h.read().blocked.length,initial.blocked.length+1);
  h.play(h.read().legal[0]);assert.equal(h.read().turn,'blocker');
  h.get('undo').onclick();assert.equal(h.read().turn,'cat');assert.equal(h.get('pause').textContent,'继续 AI');
  h.get('restart').onclick();assert.equal(h.read().cat,initial.cat);assert.equal(h.read().blocked.length,initial.blocked.length);
});
test('switching controller invalidates an in-flight AI result',()=>{
  const h=harness();h.get('blocker-controller').value='ai';h.get('blocker-controller').onchange();h.tick();
  const worker=h.workers.at(-1);assert(worker.payload);const before=JSON.stringify(h.read());
  h.get('blocker-controller').value='human';h.get('blocker-controller').onchange();assert(worker.terminated);
  h.finishWorker(worker);assert.equal(JSON.stringify(h.read()),before);
});
test('human vs AI undo restores the human decision, and AI single-step stays paused',()=>{
  const h=harness(),initial=h.read();h.get('cat-controller').value='ai';h.get('cat-controller').onchange();
  h.play(initial.legal[0]);h.tick();h.finishWorker();assert.equal(h.read().turn,'blocker');
  h.get('undo').onclick();assert.equal(h.read().turn,'blocker');assert.equal(h.read().cat,initial.cat);assert.equal(h.read().blocked.length,initial.blocked.length);
  h.get('ai-step').onclick();h.finishWorker();assert.equal(h.read().turn,'cat');assert.equal(h.get('pause').textContent,'继续 AI');
});
test('editor draft is isolated; valid apply starts a new custom board and local save loads',()=>{
  const h=harness(),initial=h.read();h.get('edit-map').onclick();assert(h.read().editing);assert.throws(()=>h.play(initial.legal[0]));
  h.get('save-map').onclick();h.get('load-map').onclick();h.get('apply-map').onclick();
  assert.equal(h.read().editing,false);assert.equal(h.get('preset').value,'custom');assert.equal(h.read().cells.length,initial.cells.length);
  h.get('edit-map').onclick();h.get('cancel-edit').onclick();assert.equal(h.read().editing,false);
});
test('screened scattered opening carries a branching proof and manual verification is cancellable',()=>{
  const h=harness(true);assert(h.read().cells.length>300);assert.match(h.get('proof-status').textContent,/已证明围堵方/);
  h.get('verify-position').onclick();const old=h.workers.at(-1);assert.equal(old.payload.kind,'solve');
  h.get('restart').onclick();assert(old.terminated);h.finishWorker(old);assert.match(h.get('proof-status').textContent,/已证明围堵方/);
  h.get('verify-position').onclick();h.finishWorker();assert.match(h.get('proof-status').textContent,/已证明围堵方/);assert.equal(h.get('pause').textContent,'继续 AI');
});
test('failed screened generation preserves the current game and free mode remains available',()=>{
  const h=harness(true),before=JSON.stringify(h.read());h.get('density').value='0';h.get('new-game').onclick();h.finishWorker();assert.equal(JSON.stringify(h.read()),before);assert.match(h.get('toast').textContent,/尚未筛到/);
  h.get('certified-mode').checked=false;h.get('new-game').onclick();assert.equal(h.read().blocked.length,0);assert.match(h.get('proof-status').textContent,/尚未证实/);
});

test('opening generation can be cancelled and late results cannot replace the board',()=>{
  const h=harness(true,true),before=JSON.stringify(h.read()),w=h.workers.at(-1);
  w.onmessage({data:{progress:{attempt:3,total:64}}});assert.match(h.get('map-note').textContent,/3 \/ 64/);
  assert.equal(h.get('cancel-generation').hidden,false);assert.throws(()=>h.play(h.read().legal[0]));
  h.get('cancel-generation').onclick();assert(w.terminated);assert.equal(h.get('cancel-generation').hidden,true);
  h.finishWorker(w);assert.equal(JSON.stringify(h.read()),before);
});

test('undo restores the branch proof before an AI move',()=>{
  const h=harness(true),before=JSON.stringify(h.read());h.get('ai-step').onclick();h.finishWorker();
  assert.match(h.get('ai-status').textContent,/已验证/);h.get('undo').onclick();
  assert.equal(JSON.stringify(h.read()),before);assert.match(h.get('proof-status').textContent,/已证明围堵方/);
  h.get('blocker-controller').value='ai';h.get('cat-controller').value='human';h.get('swap-sides').onclick();
  assert.equal(h.get('blocker-controller').value,'human');assert.equal(h.get('cat-controller').value,'ai');
  assert.equal(JSON.stringify(h.read()),before);
});
