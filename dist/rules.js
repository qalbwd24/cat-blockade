(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.CatRulesFactory = factory; root.CatRules = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const key = (q,r) => `${q},${r}`;
  const coords = id => id.split(',').map(Number);
  const adjacent = id => { const [q,r] = coords(id); return DIRS.map(([a,b]) => key(q+a,r+b)); };
  const hexDistance = (a,b) => { const [q,r] = coords(a), [x,y] = coords(b); return Math.max(Math.abs(q-x),Math.abs(r-y),Math.abs(q+r-x-y)); };
  function rng(seed) {
    let a = 2166136261;
    for (const c of String(seed)) { a ^= c.charCodeAt(0); a = Math.imul(a,16777619); }
    return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15,1 | a); t ^= t + Math.imul(t ^ t >>> 7,61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffled(items, random) {
    const a = [...items];
    for (let i=a.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function outsideExits(cells) {
    const set = new Set(cells); if (!set.size) return [];
    const points = [...set].map(coords);
    const minQ = Math.min(...points.map(p=>p[0]))-1, maxQ = Math.max(...points.map(p=>p[0]))+1;
    const minR = Math.min(...points.map(p=>p[1]))-1, maxR = Math.max(...points.map(p=>p[1]))+1;
    const queue = [key(minQ,minR)], water = new Set(queue), exits = new Set();
    for (let i=0;i<queue.length;i++) for (const n of adjacent(queue[i])) {
      const [q,r] = coords(n);
      if (q<minQ || q>maxQ || r<minR || r>maxR) continue;
      if (set.has(n)) { exits.add(n); continue; }
      if (!water.has(n)) { water.add(n); queue.push(n); }
    }
    return [...exits];
  }
  function validateMap(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cells)) throw Error('地图必须包含 cells 地块列表。');
    if (raw.cells.length < 7 || raw.cells.length > 625) throw Error('地图需要 7～625 个地块。');
    const valid = id => typeof id === 'string' && /^-?\d{1,2},-?\d{1,2}$/.test(id) && coords(id).every(x=>Number.isInteger(x)&&Math.abs(x)<=16) && key(...coords(id))===id;
    if (!raw.cells.every(valid)) throw Error('地块坐标必须是 -16～16 范围内的整数 q,r。');
    const cells = [...new Set(raw.cells)], set = new Set(cells);
    if (cells.length !== raw.cells.length) throw Error('地图含有重复地块。');
    if (!set.has(raw.start)) throw Error('请把猫起点放在地图地块上。');
    const connected = new Set([cells[0]]), queue = [cells[0]];
    for(let i=0;i<queue.length;i++) for (const n of adjacent(queue[i])) if(set.has(n)&&!connected.has(n)){connected.add(n);queue.push(n);}
    if(connected.size!==cells.length) throw Error('地块必须连成一整片，请连接孤立地块。');
    const autoExits = raw.autoExits !== false;
    if (!autoExits && !Array.isArray(raw.exits)) throw Error('手动地图需要 exits 出口列表。');
    const exits = autoExits ? outsideExits(cells) : [...new Set(raw.exits)];
    if (!exits.length || !exits.every(x=>set.has(x))) throw Error('请设置至少一个位于地块上的出口。');
    if (exits.includes(raw.start)) throw Error('猫起点不能放在出口上。');
    if(raw.fixed !== undefined && !Array.isArray(raw.fixed)) throw Error('fixed 必须是固定障碍列表。');
    const fixed = [...new Set(raw.fixed || [])];
    if(fixed.some(x=>!set.has(x)||x===raw.start)) throw Error('固定障碍必须位于地块上，且不能覆盖猫起点。');
    const map = {version:1,name:String(raw.name||'自定义地图').slice(0,40),cells,start:raw.start,exits,autoExits,fixed};
    const game = compile(map);
    if (analyse(game, {cat:game.start,blocked:new Set(game.fixed)}).distance === Infinity) throw Error('猫起点与出口不连通，请留出通路。');
    return map;
  }
  function compile(map) {
    const cells=[...map.cells], lookup=new Map(cells.map((id,i)=>[id,i]));
    return {map,cells,lookup,start:lookup.get(map.start),exits:new Set(map.exits.map(x=>lookup.get(x))),fixed:map.fixed.map(x=>lookup.get(x)),neighbors:cells.map(id=>adjacent(id).filter(n=>lookup.has(n)).map(n=>lookup.get(n)))};
  }
  function analyse(game,state) {
    const distances=new Int16Array(game.cells.length).fill(-1), queue=[];
    for(const e of game.exits) if(!state.blocked.has(e)){distances[e]=0;queue.push(e);}
    for(let i=0;i<queue.length;i++) for(const n of game.neighbors[queue[i]]) if(distances[n]<0&&!state.blocked.has(n)){distances[n]=distances[queue[i]]+1;queue.push(n);}
    const legal=game.neighbors[state.cat].filter(n=>!state.blocked.has(n));
    const seen=new Set([state.cat]), reachable=[state.cat]; let exitCount=0;
    for(let i=0;i<reachable.length;i++) {const at=reachable[i];if(game.exits.has(at))exitCount++;for(const n of game.neighbors[at])if(!state.blocked.has(n)&&!seen.has(n)){seen.add(n);reachable.push(n);}}
    return {distances,distance:distances[state.cat]<0?Infinity:distances[state.cat],legal,area:seen.size,exitCount,reachable:seen};
  }
  function winner(game,state) {
    if(game.exits.has(state.cat))return 'cat';
    if(analyse(game,state).distance===Infinity)return 'blocker';
    return null;
  }
  function actions(game,state) {
    if(state.winner)return [];
    if(state.turn==='cat')return game.neighbors[state.cat].filter(n=>!state.blocked.has(n));
    return game.cells.map((_,i)=>i).filter(i=>i!==state.cat&&!state.blocked.has(i));
  }
  function transition(game,state,action) {
    if(state.winner)throw Error('这一局已经结束。');
    if(!Number.isInteger(action)||!actions(game,state).includes(action))throw Error('这一步不符合规则。');
    const next={cat:state.cat,blocked:new Set(state.blocked),turn:state.turn==='cat'?'blocker':'cat',ply:state.ply+1,winner:null,last:{side:state.turn,at:action}};
    if(state.turn==='cat')next.cat=action;else next.blocked.add(action);
    next.winner=winner(game,next);
    return next;
  }
  function createGame(raw, density=12, seed='cat') {
    const map=validateMap(raw), game=compile(map), random=rng(seed);
    if(!Number.isFinite(density)||density<0||density>100)throw Error('障碍比例应为 0～100。');
    const state={cat:game.start,blocked:new Set(game.fixed),turn:'blocker',ply:0,winner:null,last:null};
    const available=game.cells.map((_,i)=>i).filter(i=>i!==game.start&&!state.blocked.has(i));
    const target=Math.round(available.length*density/100); let added=0;
    for(const i of shuffled(available,random)) {
      if(added>=target)break;
      state.blocked.add(i);
      if(analyse(game,state).distance===Infinity){state.blocked.delete(i);continue;}
      added++;
    }
    return {game,state,seed:String(seed),randomCount:added,requestedCount:target};
  }
  function preset(name='island',seed='island',radius=10) {
    if(!Number.isInteger(radius)||radius<5||radius>12)throw Error('预设地图半径应为 5～12。');
    const random=rng(seed);let cells=[];
    for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=radius)cells.push(key(q,r));
    const names={island:'缺角岛屿',crescent:'月牙湾',ring:'环形庭院',random:'随机岛屿',hex:'六角原野'};
    const cut=radius-1;
    if(name==='island')cells=cells.filter(id=>{const[q,r]=coords(id);return !(q>=cut&&r<=-cut)&&!(q<=-cut&&r>=cut-1)&&!(q>=2&&r>=cut);});
    if(name==='crescent')cells=cells.filter(id=>hexDistance(id,key(radius,0))>Math.max(2,Math.floor(radius/3)));
    if(name==='ring')cells=cells.filter(id=>hexDistance(id,key(radius-3,-1))>1);
    if(name==='random'){
      for(let round=0;round<3;round++){
        for(const id of shuffled(outsideExits(cells),random)){
          if(hexDistance(id,'0,0')<radius-1||random()>.37)continue;
          const candidate=cells.filter(x=>x!==id);try{validateMap({cells:candidate,start:'0,0',autoExits:true});cells=candidate;}catch{}
        }
      }
    }
    // Put the cat in a deepest interior cell, preferring the original centre on ties.
    const exits=outsideExits(cells),exitSet=new Set(exits),distances=new Map(exits.map(x=>[x,0])),queue=[...exits],cellSet=new Set(cells);
    for(let i=0;i<queue.length;i++)for(const n of adjacent(queue[i]))if(cellSet.has(n)&&!distances.has(n)){distances.set(n,distances.get(queue[i])+1);queue.push(n);}
    const start=[...cells].filter(x=>!exitSet.has(x)).sort((a,b)=>distances.get(b)-distances.get(a)||hexDistance(a,'0,0')-hexDistance(b,'0,0'))[0];
    return validateMap({name:names[name]||'地图',cells,start,autoExits:true,fixed:[]});
  }
  return {DIRS,key,coords,adjacent,hexDistance,rng,shuffled,outsideExits,validateMap,compile,analyse,winner,actions,transition,createGame,preset};
});
