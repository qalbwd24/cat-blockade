const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'../dist');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('all local scripts and styles exist and all JavaScript parses',()=>{
  for(const [,asset] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g))assert(fs.existsSync(path.join(root,asset)),asset);
  for(const f of ['rules.js','solver.js','proof.js','openings.js','tactics.js','ai.js','app.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,f),'utf8')));
});
test('controller references existing unique HTML ids',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(id),'Missing element '+id);
});
test('browser factories can run in isolated worker context without CommonJS or imports',()=>{
  const browser=vm.createContext({});for(const f of ['rules.js','solver.js','proof.js','openings.js','tactics.js','ai.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),browser);
  const isolated=vm.createContext({});vm.runInContext(`const R=(${browser.CatRulesFactory.toString()})();const S=(${browser.CatSolverFactory.toString()})(R);const P=(${browser.CatProofFactory.toString()})(R,S);const O=(${browser.CatOpeningsFactory.toString()})(R,S,P);const T=(${browser.CatTacticsFactory.toString()})(R,S);const AI=(${browser.CatAIFactory.toString()})(R,S,P,T);const m=O.create(R.preset('hex'),35,'worker');const choice=AI.choose(m.game,m.state,'normal',{ms:40,certificate:m.proof.certificate});if(!choice.proven||!P.verify(m.game,m.state,m.proof.certificate).valid||!R.actions(m.game,m.state).includes(choice.action))throw Error('Illegal or unproven worker move');`,isolated);
});
