(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rules.js'),require('./solver.js'));
  else {root.CatProofFactory=factory;root.CatProof=factory(root.CatRules,root.CatSolver);}
})(typeof globalThis!=='undefined'?globalThis:this,function(R,S){
'use strict';
const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
const INF = Number.POSITIVE_INFINITY;
const add = (a,b) => a === INF || b === INF ? INF : Math.min(1e12,a+b);

function solve(game, initial, {ms = 1000, maxNodes = 30000, usePlans = false} = {}) {
  const started = clock(), deadline = started + ms;
  const bits = game.cells.map((_, i) => 1n << BigInt(i));
  const table = new Map(); let expanded = 0, reason = 'complete';
  const STOP = Symbol('budget');
  function check() { if (clock() >= deadline || table.size >= maxNodes) throw STOP; }
  function get(cat, blocked, turn) {
    const key = `${turn}:${cat}:${blocked.toString(16)}`;
    if (table.has(key)) return table.get(key);
    check();
    const d = new Int16Array(bits.length).fill(-1), queue = [];
    for (const e of game.exits) if (!(blocked & bits[e])) { d[e] = 0; queue.push(e); }
    for (let i = 0; i < queue.length; i++) for (const j of game.neighbors[queue[i]]) {
      if (d[j] < 0 && !(blocked & bits[j])) { d[j] = d[queue[i]] + 1; queue.push(j); }
    }
    const terminal = game.exits.has(cat) ? 'cat' : d[cat] < 0 ? 'blocker' : null;
    const node = {id: table.size, cat, blocked, turn, terminal, distance: d[cat],
      pn: terminal === 'blocker' ? 0 : terminal === 'cat' ? INF : 1,
      dn: terminal === 'cat' ? 0 : terminal === 'blocker' ? INF : 1,
      children: null, parents: new Set()};
    table.set(key, node); return node;
  }
  function update(node) {
    const pending = [node], queued = new Set(pending);
    for (let i = 0; i < pending.length; i++) {
      const n = pending[i]; queued.delete(n);
      if (!n.children) continue;
      let pn = n.turn === 'blocker' ? INF : 0;
      let dn = n.turn === 'blocker' ? 0 : INF;
      for (const {node: c} of n.children) {
        if (n.turn === 'blocker') { pn = Math.min(pn, c.pn); dn = add(dn,c.dn); }
        else { pn = add(pn,c.pn); dn = Math.min(dn, c.dn); }
      }
      if (pn === n.pn && dn === n.dn) continue;
      n.pn = pn; n.dn = dn;
      for (const p of n.parents) if (!queued.has(p)) { queued.add(p); pending.push(p); }
    }
  }
  let root;
  try {
    root = get(initial.cat, [...initial.blocked].reduce((m, i) => m | bits[i], 0n), initial.turn);
    while (root.pn && root.dn) {
      check(); let n = root;
      while (n.children) {
        const field = n.turn === 'blocker' ? 'pn' : 'dn';
        n = n.children.reduce((a, b) => b.node[field] < a.node[field] ? b : a).node;
      }
      if (usePlans) {
        const state={cat:n.cat,turn:n.turn,blocked:new Set(bits.map((_,i)=>i).filter(i=>n.blocked&bits[i])),ply:0,winner:null};
        const plan=S.findPlan(game,state,{useCut:n===root});
        if (plan) {
          n.plan=plan.plan; n.pn=0; n.dn=INF;
          for (const parent of n.parents) update(parent);
          continue;
        }
      }
      const actions = (n.turn === 'cat' ? game.neighbors[n.cat] : bits.map((_, i) => i))
        .filter(i => i !== n.cat && !(n.blocked & bits[i]));
      // Commit only complete expansions. Budget exhaustion cannot manufacture an AND proof.
      const children = actions.map(action => ({action, node: get(
        n.turn === 'cat' ? action : n.cat,
        n.turn === 'blocker' ? n.blocked | bits[action] : n.blocked,
        n.turn === 'cat' ? 'blocker' : 'cat')}));
      children.sort((a, b) => {
        const score = c => c.terminal === 'blocker' ? 100000 : c.terminal === 'cat' ? -100000 : c.distance;
        return (score(b.node) - score(a.node)) * (n.turn === 'blocker' ? 1 : -1) || a.action - b.action;
      });
      n.children = children;
      for (const c of children) c.node.parents.add(n);
      expanded++; update(n);
    }
  } catch (e) { if (e !== STOP) throw e; reason = table.size >= maxNodes ? 'nodes' : 'time'; }
  const status = root?.pn === 0 ? 'blocker' : root?.dn === 0 ? 'cat' : 'unknown';
  let certificate = null;
  if (status !== 'unknown') {
    const nodes = {}, seen = new Set();
    function visit(n) {
      if (seen.has(n.id)) return; seen.add(n.id);
      if (n.terminal) { nodes[n.id] = {terminal: n.terminal}; return; }
      if (n.plan) { nodes[n.id] = {plan:n.plan}; return; }
      const field = status === 'blocker' ? 'pn' : 'dn';
      const edges = n.turn === status ? [n.children.find(c => c.node[field] === 0)] : n.children;
      nodes[n.id] = {moves: edges.map(c => ({action: c.action, to: c.node.id}))};
      edges.forEach(c => visit(c.node));
    }
    visit(root); certificate = {version: 1, winner: status, root: root.id, nodes};
  }
  return {status, reason, nodes: table.size, expanded, ms: Math.round(clock() - started), certificate};
}

// This checker intentionally uses the original game rules, not the search's bitboard engine.
function verify(game, initial, certificate) {
  let checked = 0; const memo = new Map(), active = new Set();
  function fail(message) { throw Error(message); }
  try {
    if (!certificate || certificate.version !== 1 || !['cat', 'blocker'].includes(certificate.winner)) fail('Invalid header');
    const expected = certificate.winner;
    function walk(id, state) {
      const signature = `${state.turn}:${state.cat}:${[...state.blocked].sort((a,b)=>a-b).join(',')}`;
      if (active.has(id)) fail('Cyclic certificate');
      if (memo.has(id)) { if (memo.get(id) !== signature) fail('Shared node state mismatch'); return; }
      const entry = certificate.nodes[id]; if (!entry) fail('Missing node');
      checked++; active.add(id);
      const terminal = R.winner(game, state);
      if (terminal) {
        if (terminal !== expected || entry.terminal !== terminal || entry.moves) fail('Invalid terminal');
      } else if (entry.plan !== undefined) {
        if (expected !== 'blocker' || entry.moves || entry.terminal || !Array.isArray(entry.plan) || !S.verifyPlan(game,state,entry.plan).valid) fail('Invalid fixed-plan leaf');
      } else {
        if (entry.terminal || !Array.isArray(entry.moves)) fail('Unproved leaf');
        const legal = R.actions(game, {...state, winner:null});
        const moves = entry.moves.map(e => e.action);
        if (new Set(moves).size !== moves.length || moves.some(a => !legal.includes(a))) fail('Illegal or duplicated move');
        if (state.turn === expected) { if (moves.length !== 1) fail('Winner must supply one action'); }
        else if (moves.length !== legal.length || legal.some(a => !moves.includes(a))) fail('Missing opponent response');
        for (const e of entry.moves) walk(e.to, R.transition(game, {...state,winner:null}, e.action));
      }
      active.delete(id); memo.set(id, signature);
    }
    walk(certificate.root, initial); return {valid:true, winner:expected, checked};
  } catch (e) { return {valid:false, checked, reason:e.message}; }
}
function action(game,state,certificate){
  if(certificate?.winner!==state.turn)return null;
  const entry=certificate.nodes[certificate.root];
  return entry?.plan?entry.plan[0]:entry?.moves?.[0]?.action ?? null;
}
function advance(certificate,side,at){
  if(!certificate)return null;
  const entry=certificate.nodes[certificate.root];
  if(entry?.plan){
    if(side==='blocker'&&entry.plan[0]!==at)return null;
    return {...certificate,nodes:{[certificate.root]:{plan:side==='blocker'?entry.plan.slice(1):entry.plan}}};
  }
  const edge=entry?.moves?.find(e=>e.action===at);
  return edge?{...certificate,root:edge.to}:null;
}
function resistance(game,state,certificate){
  const memo=new Map();
  function length(id,s){
    if(memo.has(id))return memo.get(id);
    const entry=certificate.nodes[id];let value=0;
    if(entry.plan){const check=S.verifyPlan(game,s,entry.plan);value=check.valid?Math.max(0,check.steps*2-(s.turn==='blocker'?1:0)):0;}
    else if(entry.moves)value=1+Math.max(...entry.moves.map(e=>length(e.to,R.transition(game,s,e.action))));
    memo.set(id,value);return value;
  }
  const plies=length(certificate.root,state),entry=certificate.nodes[certificate.root];
  if(state.turn===certificate.winner||state.winner)return {plies,action:null};
  const legal=R.actions(game,state),rows=legal.map(at=>{
    const next=R.transition(game,state,at),advanced=advance(certificate,state.turn,at);
    let remaining=0;
    if(!next.winner&&advanced){
      if(entry.plan){const check=S.verifyPlan(game,next,advanced.nodes[advanced.root].plan);remaining=check.valid?Math.max(0,check.steps*2-(next.turn==='blocker'?1:0)):0;}
      else remaining=length(advanced.root,next);
    }
    return {at,remaining,distance:R.analyse(game,next).distance};
  }).sort((a,b)=>b.remaining-a.remaining||a.distance-b.distance||a.at-b.at);
  return {plies,action:rows[0]?.at??null};
}
return {solve, verify, action, advance, resistance};
});
