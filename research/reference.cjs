'use strict';
const R = require('../dist/rules.js');
const signature = s => `${s.turn}:${s.cat}:${[...s.blocked].sort((a,b)=>a-b)}`;
// Exhaustive minimax oracle for small positions; no heuristic pruning or depth cutoff.
function exact(game, initial, maxNodes = 1000000) {
  const memo = new Map(); let nodes = 0;
  function visit(s) {
    const key = signature(s); if (memo.has(key)) return memo.get(key);
    if (++nodes > maxNodes) throw Error('Oracle budget exhausted');
    const terminal = R.winner(game,s); if (terminal) return terminal;
    const other = s.turn === 'cat' ? 'blocker' : 'cat'; let result = other;
    for (const a of R.actions(game,s)) if (visit(R.transition(game,s,a)) === s.turn) { result=s.turn; break; }
    memo.set(key,result); return result;
  }
  return {status:visit(initial), nodes};
}
// Exhaust all fixed sequences, not merely geometric rings or one heuristic's candidates.
// A fixed next obstacle must be legal for every still-live cat branch.
function fixedSequence(game, initial, maxNodes = 1000000) {
  const memo = new Map(); let nodes = 0;
  function visit(blocked, frontier, turn) {
    frontier = new Set([...frontier].filter(cat => R.winner(game,{cat,blocked}) !== 'blocker'));
    if (!frontier.size) return [];
    if ([...frontier].some(c => game.exits.has(c))) return null;
    const key = `${turn}:${[...blocked].sort((a,b)=>a-b)}:${[...frontier].sort((a,b)=>a-b)}`;
    if (memo.has(key)) return memo.get(key);
    if (++nodes > maxNodes) throw Error('Fixed-sequence budget exhausted');
    let result = null;
    if (turn === 'cat') {
      const next = new Set();
      for (const c of frontier) for (const n of game.neighbors[c]) if (!blocked.has(n)) next.add(n);
      result = visit(blocked,next,'blocker');
    } else {
      for (let a=0;a<game.cells.length;a++) {
        if (blocked.has(a) || frontier.has(a)) continue;
        const b = new Set(blocked); b.add(a);
        const suffix = visit(b,frontier,'cat');
        if (suffix !== null) {result=[a,...suffix];break;}
      }
    }
    memo.set(key,result); return result;
  }
  const plan=visit(initial.blocked,new Set([initial.cat]),initial.turn);
  return {exists:plan !== null, plan, nodes};
}
function hex(radius) {
  const cells=[];
  for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=radius)cells.push(`${q},${r}`);
  return R.validateMap({name:`研究六角地图 r=${radius}`,cells,start:'0,0',autoExits:true});
}
module.exports={exact,fixedSequence,hex};
