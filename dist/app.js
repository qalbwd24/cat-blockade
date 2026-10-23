(() => {
  'use strict';
  const R=CatRules, S=CatSolver, P=CatProof, O=CatOpenings, $=id=>document.getElementById(id), svgNS='http://www.w3.org/2000/svg';
  let match,initial,history=[],proofHistory=[],generating=false,paused=false,editing=false,draft=null,custom=null,brush='add',timer=null,worker=null,job=0,busy=false,verifying=false,toastTimer=null,lastAI='',paint=false,painted=new Set(),audit={status:'unknown'};
  const controllers=()=>({cat:$('cat-controller').value,blocker:$('blocker-controller').value});
  const cloneState=s=>({...s,blocked:new Set(s.blocked),last:s.last?{...s.last}:null});
  const toast=message=>{$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);};
  function cancelAI(){job++;clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}busy=false;verifying=false;generating=false;}
  function refreshProof(){
    if(match.state.winner){audit={status:match.state.winner,method:'finished'};return;}
    if(audit.certificate&&P.verify(match.game,match.state,audit.certificate).valid)return;
    if(audit.plan){const plan=audit.plan.filter(i=>!match.state.blocked.has(i)),checked=S.verifyPlan(match.game,match.state,plan);if(checked.valid){audit={status:'blocker',plan:plan.slice(0,checked.steps),...checked,method:'all-cat-paths'};return;}}
    audit={status:'unknown'};
  }
  function workerCode(){return `const R=(${CatRulesFactory.toString()})();const S=(${CatSolverFactory.toString()})(R);const P=(${CatProofFactory.toString()})(R,S);const O=(${CatOpeningsFactory.toString()})(R,S,P);const T=(${CatTacticsFactory.toString()})(R,S);const AI=(${CatAIFactory.toString()})(R,S,P,T);onmessage=e=>{try{const p=e.data;if(p.kind==='opening'){const m=O.create(p.map,p.density,p.seed,{onProgress:(attempt,total)=>postMessage({progress:{attempt,total}})});postMessage({result:{...m,game:undefined,map:m.game.map,state:{...m.state,blocked:[...m.state.blocked]}}});return;}const g=R.compile(p.map),s={...p.state,blocked:new Set(p.state.blocked)};postMessage({result:p.kind==='solve'?P.solve(g,s,{ms:2000,maxNodes:40000,usePlans:true}):AI.choose(g,s,p.level,{plan:p.plan,certificate:p.certificate})});}catch(e){postMessage({error:e.message});}};`;}
  function launch(map,seed){
    const next=R.createGame(map,Number($('density').value),seed);
    if(!$('certified-mode').checked){install(next);return;}
    if(!match)install(next);
    cancelAI();paused=true;generating=true;busy=true;const token=job;render();
    function fail(message){if(token!==job)return;cancelAI();paused=true;render();toast(message+' 当前棋盘已保留。');}
    try{
      const url=URL.createObjectURL(new Blob([workerCode()],{type:'text/javascript'}));
      try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
      worker.onmessage=e=>{if(token!==job)return;if(e.data.progress){$('map-note').textContent='正在筛选第 '+e.data.progress.attempt+' / '+e.data.progress.total+' 个随机布局，可随时取消。';return;}if(e.data.error){fail(e.data.error);return;}const result=e.data.result;
        const ready={...result,game:R.compile(result.map),state:{...result.state,blocked:new Set(result.state.blocked)}};
        if(!P.verify(ready.game,ready.state,ready.proof?.certificate).valid){fail('开局核验未通过，请重新生成。');return;}
        install(ready);
      };
      worker.onerror=e=>{e.preventDefault();fail('后台筛选不可用，请关闭筛选后自由开局。');};
      worker.postMessage({kind:'opening',map:next.game.map,density:Number($('density').value),seed});
    }catch{fail('后台筛选不可用，请关闭筛选后自由开局。');}
  }
  function install(next){
    if(!next.proof){const cert=S.findPlan(next.game,next.state);next.proof=cert?{status:'blocker',...cert}:{status:'unknown'};}
    cancelAI();match=next;initial=cloneState(next.state);history=[];proofHistory=[];paused=false;lastAI='';editing=false;draft=null;
    audit={...next.proof};
    $('editor-panel').hidden=true;render();schedule();
    if(next.randomCount<next.requestedCount)toast(`为保留逃生通路，随机障碍减少为 ${next.randomCount} 个。`);
  }
  function newGame(){
    try{const seed=$('seed').value.trim()||String(Date.now().toString(36))+'-'+Math.random().toString(36).slice(2,5);
      const name=$('preset').value;launch(name==='custom'?custom:R.preset(name,seed,Number($('map-size').value)),seed);
    }catch(e){toast(e.message);}
  }
  function act(action){
    const next=R.transition(match.game,match.state,action);
    proofHistory.push(audit);
    if(audit.certificate){const certificate=P.advance(audit.certificate,match.state.turn,action);audit=certificate?{...audit,certificate}:{status:'unknown'};}
    history.push(cloneState(match.state));match.state=next;lastAI='';refreshProof();render();schedule();
  }
  function point(id){const[q,r]=R.coords(id);return{x:Math.sqrt(3)*(q+r/2),y:1.5*r};}
  function element(tag,attrs={},parent){const el=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(parent)parent.appendChild(el);return el;}
  function drawBoard(){
    const svg=$('board');svg.replaceChildren();
    const map=editing?draft:match.game.map,set=new Set(map.cells);
    let visible=[...map.cells];
    if(editing){
      // A stable drawing canvas prevents the board shifting under the pointer while painting.
      const candidates=new Set(visible);
      for(let q=-12;q<=12;q++)for(let r=-12;r<=12;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=12)candidates.add(R.key(q,r));
      for(const id of map.cells)if(R.hexDistance(id,'0,0')>11)for(const n of R.adjacent(id))if(R.coords(n).every(x=>Math.abs(x)<=16))candidates.add(n);
      visible=[...candidates];
    }
    const pts=visible.map(point),minX=Math.min(...pts.map(p=>p.x))-1.2,maxX=Math.max(...pts.map(p=>p.x))+1.2,minY=Math.min(...pts.map(p=>p.y))-1.2,maxY=Math.max(...pts.map(p=>p.y))+1.2;
    const scale=Math.min(700/(maxX-minX),625/(maxY-minY));const pos=id=>{const p=point(id);return{x:360+(p.x-(minX+maxX)/2)*scale,y:330+(p.y-(minY+maxY)/2)*scale};};
    const radius=scale*.73;
    const exits=new Set(editing?(map.autoExits?R.outsideExits(map.cells):map.exits):map.exits);
    const walls=editing?new Set(map.fixed):new Set([...match.state.blocked].map(i=>match.game.cells[i]));
    const cat=editing?map.start:match.game.cells[match.state.cat];
    const legal=new Set(!editing&&match.state.turn==='cat'?R.actions(match.game,match.state).map(i=>match.game.cells[i]):[]);
    const human=!editing&&!match.state.winner&&controllers()[match.state.turn]==='human';
    for(const id of visible){
      const p=pos(id),ghost=!set.has(id),isWall=walls.has(id),isCat=id===cat;
      const allowed=editing||human&&(match.state.turn==='cat'?legal.has(id):!isWall&&!isCat);
      const isLast=!editing&&match.state.last&&match.game.cells[match.state.last.at]===id;
      const group=element('g',{class:['cell',ghost?'ghost':'',exits.has(id)?'exit':'',isWall?'wall':'',legal.has(id)?'legal':'',isLast?'last':'',allowed?'actionable':''].join(' '),'data-cell':id,transform:`translate(${p.x} ${p.y})`,role:'button',tabindex:allowed?'0':'-1','aria-disabled':String(!allowed),'aria-label':`${id} ${isCat?'小猫':ghost?'添加地块':isWall?'障碍':exits.has(id)?'出口':'空地'}`},svg);
      element('circle',{class:'tile',r:radius},group);
      if(isWall)element('path',{class:'wall-mark',d:`M ${-radius*.42} ${-radius*.3} L ${radius*.42} ${-radius*.3} M ${-radius*.42} 0 L ${radius*.42} 0 M ${-radius*.42} ${radius*.3} L ${radius*.42} ${radius*.3}`},group);
      if(ghost){const t=element('text',{y:4},group);t.textContent='+';}
      const title=element('title',{},group);title.textContent=`坐标 ${id}${exits.has(id)?' · 出口':''}${isWall?' · 障碍':''}`;
    }
    if(set.has(cat)){
      const p=pos(cat),k=radius/24;
      const g=element('g',{class:'cat-piece',transform:`translate(${p.x} ${p.y}) scale(${k})`},svg);
      element('path',{d:'M-14 1 L-18-21 L-5-13 Q0-15 5-13 L18-21 L15 1 Q21 16 10 20 L-10 20 Q-22 15-14 1 Z'},g);
      element('ellipse',{class:'eye',cx:-7,cy:-2,rx:2,ry:3},g);element('ellipse',{class:'eye',cx:7,cy:-2,rx:2,ry:3},g);
      element('path',{d:'M-3 6 L0 8 L3 6',style:'fill:none;stroke:#78e5bf;stroke-width:1.5'},g);
    }
    $('edit-count').textContent=editing?`${map.cells.length} 地块`:'';
  }
  function render(){
    const s=match.state,side=s.turn==='cat'?'小猫方':'围堵方',isAI=controllers()[s.turn]==='ai';
    document.querySelector('.arena').classList.toggle('editing',editing);
    $('mode-label').textContent=editing?'地图工坊 / 自由绘制':`${match.game.map.name} / ${controllers().cat==='ai'&&controllers().blocker==='ai'?'AI 对战':controllers().cat==='human'&&controllers().blocker==='human'?'同屏双人':'人机对弈'}`;
    $('turn-title').textContent=editing?'画出你的小猫迷宫。':s.winner?(s.winner==='cat'?'小猫逃出去了。':'所有出路，都封住了。'):side+(isAI?'正在观察局势。':s.turn==='cat'?'，轮到你移动。':'，落下一道障碍。');
    $('turn-help').textContent=editing?'选择右侧工具，在棋盘上点击或拖动。':s.winner?'可以悔棋复盘，也可以重新挑战。':s.turn==='cat'?'小猫每次走一格；绿色高亮是相邻可走的位置。':'点击没有小猫的空地，设置一个永久障碍。';
    $('turn-chip').textContent=editing?'编辑地图':s.winner?'本局结束':`${side}回合`;
    if(generating){$('turn-title').textContent='正在准备新的对局。';$('turn-help').textContent='筛选有多条出路的随机开局，可以随时取消。';$('turn-chip').textContent='筛选中';}
    $('turn-chip').classList.toggle('cat',editing||s.turn==='cat');
    document.querySelector('.cat-player').classList.toggle('active',!editing&&!s.winner&&s.turn==='cat');
    document.querySelector('.blocker-player').classList.toggle('active',!editing&&!s.winner&&s.turn==='blocker');
    $('move-count').textContent=`第 ${Math.floor(s.ply/2)+1} 回合`;
    $('board-info').textContent=editing?'外部与空洞不可通行':`${match.game.cells.length} 地块 · ${s.blocked.size} 障碍 · ${[...match.game.exits].filter(i=>!s.blocked.has(i)).length} 出口`;
    $('result').hidden=editing||!s.winner;
    if(s.winner){$('result-title').textContent=s.winner==='cat'?'小猫方获胜！':'围堵方获胜！';$('result-detail').textContent=`共 ${s.ply} 次行动 · ${s.winner==='cat'?'抵达出口，成功逃脱':'所有通往出口的路径已被封锁'}`;}
    $('undo').disabled=editing||history.length===0;
    $('swap-sides').disabled=editing;
    $('pause').disabled=editing||!!s.winner;$('pause').textContent=paused?'继续 AI':'暂停 AI';
    $('ai-step').disabled=editing||!!s.winner||busy;$('ai-status').textContent=editing?'':generating?'正在筛选随机开局…':verifying?'正在验证所有应对…':busy?'AI 思考中…':lastAI||(paused?'AI 已暂停':'');
    $('cancel-generation').hidden=!generating;
    $('map-note').textContent=generating?'正在尝试随机布局并核验策略，可随时取消。':match.quality?`已筛选 · 最短逃生 ${match.quality.distance} 步 · 至少 ${Math.min(4,match.quality.routes)} 条独立出路 · 随机样本 ${match.attempts}`:'自由随机开局；地图设置在下次开局生效。';
    $('verify-position').disabled=editing||busy||!!s.winner;
    const distance=R.analyse(match.game,s).distance;
    $('escape-distance').textContent=Number.isFinite(distance)?`逃生最短 ${distance} 步`:'出口已封闭';
    $('initial-proof').textContent=`本局开局：${match.proof.status==='blocker'?'已证明围堵方有解':'尚未证实围堵方有解'}`;
    $('proof-status').textContent=verifying?'正在验证…':audit.status==='blocker'?'已证明围堵方可胜':audit.status==='cat'?'已证明小猫可逃':'当前局面尚未证实';
    $('proof-status').dataset.status=audit.status;
    $('proof-detail').textContent=verifying?'检查封锁策略；必要时搜索双方所有合法应对。':audit.method==='finished'?'本局已结束。':audit.status==='blocker'&&audit.plan?`已核验猫的所有可能走法，围堵方最多再落 ${audit.plan.length} 个障碍可获胜。`:audit.status!=='unknown'?'完整对抗分支已验证，结论以双方最优应对为前提。':audit.nodes!==undefined?`本次检查 ${audit.nodes} 个局面、用时 ${audit.ms} ms，预算内未能完成证明。`:'有逃生通路不等于围堵方有解。可以点击按钮继续验证。';
    $('seed-label').textContent=`种子 ${match.seed}`;$('seed-label').title=match.seed;
    $('history').replaceChildren();const events=[...history.slice(1),s].filter(x=>x.last).slice(-12).reverse();
    if(!events.length){const li=document.createElement('li');li.textContent='围堵方先手，每人每次行动一步。';$('history').appendChild(li);}
    for(const item of events){const li=document.createElement('li');li.textContent=`${String(item.ply).padStart(2,'0')} · ${item.last.side==='cat'?'小猫移动到':'围堵方封住'} (${match.game.cells[item.last.at]})`;$('history').appendChild(li);}
    for(const id of ['new-game','restart','preset','density','seed','map-size','certified-mode'])$(id).disabled=editing;
    if($('preset').value==='custom')$('map-size').disabled=true;
    $('edit-map').disabled=editing;drawBoard();
  }
  function schedule(){
    clearTimeout(timer);timer=null;
    if(editing||paused||match.state.winner||busy||controllers()[match.state.turn]!=='ai')return;
    timer=setTimeout(()=>runAI(false),Number($('speed').value));
  }
  function runAI(single){
    if(editing||match.state.winner||busy)return;
    if(single)paused=true;
    cancelAI();const token=job;busy=true;render();
    const payload={map:match.game.map,state:{...match.state,blocked:[...match.state.blocked]},level:$('difficulty').value,plan:audit.status==='blocker'?audit.plan:undefined,certificate:audit.certificate};
    function done(result){
      if(token!==job)return;
      if(worker){worker.terminate();worker=null;}busy=false;
      if(!R.actions(match.game,match.state).includes(result.action)){toast('AI 未返回合法行动，本回合已暂停。');paused=true;render();return;}
      if(result.proven&&result.plan&&S.verifyPlan(match.game,match.state,result.plan).valid)audit={status:'blocker',plan:result.plan,method:'all-cat-paths'};
      if(result.proven&&result.certificate&&P.verify(match.game,match.state,result.certificate).valid)audit={status:result.certificate.winner,certificate:result.certificate,method:'branch-certificate'};
      act(result.action);lastAI=result.proven?(result.certificate?'执行已验证的分支策略':`执行已验证策略 · 最多 ${result.remaining} 次封堵`):result.resisting?'选择更难封堵的应对':`已思考 ${result.ms} ms · ${result.depth} 层`;render();
    }
    function fallback(){
      if(token!==job)return;
      if(worker){worker.terminate();worker=null;}
      timer=setTimeout(()=>{if(token!==job)return;try{done(CatAI.choose(match.game,match.state,payload.level,{ms:70,plan:payload.plan,certificate:payload.certificate}));}catch(e){busy=false;paused=true;toast('AI 暂停：'+e.message);render();}},20);
    }
    try{
      const source=workerCode();
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
      worker.onmessage=e=>{if(token!==job)return;if(e.data.error){fallback();return;}done(e.data.result);};
      worker.onerror=e=>{e.preventDefault();fallback();};worker.postMessage(payload);
    }catch{fallback();}
  }
  function verifyPosition(){
    if(editing||busy||match.state.winner)return;
    cancelAI();paused=true;busy=true;verifying=true;const token=job;render();
    function done(result){if(token!==job)return;if(worker){worker.terminate();worker=null;}busy=false;verifying=false;
      // A fresh budget exhaustion must not erase an already checked proof for this position.
      const retained=result.status==='unknown'&&(audit.certificate?P.verify(match.game,match.state,audit.certificate).valid:audit.plan&&S.verifyPlan(match.game,match.state,audit.plan).valid);
      if(!retained)audit=result.certificate&&!P.verify(match.game,match.state,result.certificate).valid?{status:'unknown'}:result;
      render();}
    function fallback(){if(token!==job)return;if(worker){worker.terminate();worker=null;}timer=setTimeout(()=>{if(token!==job)return;try{done(S.solve(match.game,match.state,{ms:120,maxDepth:4,maxNodes:5000}));}catch(e){busy=false;verifying=false;toast('验证失败：'+e.message);render();}},20);}
    try{const url=URL.createObjectURL(new Blob([workerCode()],{type:'text/javascript'}));try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}worker.onmessage=e=>{if(token!==job)return;if(e.data.error){fallback();return;}done(e.data.result);};worker.onerror=e=>{e.preventDefault();fallback();};worker.postMessage({kind:'solve',map:match.game.map,state:{...match.state,blocked:[...match.state.blocked]}});}catch{fallback();}
  }
  function cellInput(id){
    if(editing){editCell(id);return;}
    if(busy||match.state.winner||controllers()[match.state.turn]!=='human')return;
    const at=match.game.lookup.get(id);if(R.actions(match.game,match.state).includes(at))act(at);
  }
  $('board').addEventListener('pointerdown',e=>{if(e.button!==0)return;const target=e.target.closest('[data-cell]');if(!target)return;e.preventDefault();if(editing){paint=true;painted.clear();}cellInput(target.dataset.cell);});
  $('board').addEventListener('pointermove',e=>{if(!editing||!paint)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');if(target)editCell(target.dataset.cell);});
  window.addEventListener('pointerup',()=>{paint=false;painted.clear();});window.addEventListener('pointercancel',()=>{paint=false;painted.clear();});
  $('board').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('[data-cell]');if(target){e.preventDefault();painted.clear();cellInput(target.dataset.cell);painted.clear();}}});
  function startEditor(){cancelAI();paused=true;editing=true;draft=JSON.parse(JSON.stringify(match.game.map));$('editor-panel').hidden=false;$('auto-exits').checked=draft.autoExits;render();$('editor-panel').scrollIntoView({behavior:'smooth',block:'nearest'});}
  function editCell(id){
    if(painted.has(id))return;painted.add(id);const cells=new Set(draft.cells),fixed=new Set(draft.fixed),exits=new Set(draft.exits);
    if(brush==='add'){if(cells.size>=625&&!cells.has(id)){toast('最多 625 个地块。');return;}cells.add(id);}
    if(brush==='erase'){cells.delete(id);fixed.delete(id);exits.delete(id);}
    if(brush==='cat'&&cells.has(id)){draft.start=id;fixed.delete(id);}
    if(brush==='wall'&&cells.has(id)&&id!==draft.start){if(fixed.has(id))fixed.delete(id);else fixed.add(id);}
    if(brush==='exit'&&cells.has(id)){
      if(draft.autoExits){draft.autoExits=false;$('auto-exits').checked=false;for(const e of R.outsideExits(draft.cells))exits.add(e);}
      if(exits.has(id))exits.delete(id);else exits.add(id);
    }
    draft.cells=[...cells];draft.fixed=[...fixed];draft.exits=draft.autoExits?R.outsideExits(draft.cells):[...exits];drawBoard();
  }
  function validateDraft(){return R.validateMap({...draft,name:'自定义地图'});}
  function useDraft(map){draft=map;$('auto-exits').checked=map.autoExits;drawBoard();}
  $('edit-map').onclick=startEditor;
  document.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>{brush=b.dataset.brush;painted.clear();document.querySelectorAll('[data-brush]').forEach(el=>el.classList.toggle('selected',el===b));});
  $('auto-exits').onchange=()=>{draft.autoExits=$('auto-exits').checked;if(draft.autoExits)draft.exits=R.outsideExits(draft.cells);drawBoard();};
  $('apply-map').onclick=()=>{try{custom=validateDraft();$('preset').querySelector('[value="custom"]').disabled=false;$('preset').value='custom';launch(custom,$('seed').value.trim()||Date.now().toString(36));toast('自定义地图已应用。');}catch(e){toast(e.message);}};
  $('cancel-edit').onclick=()=>{editing=false;draft=null;$('editor-panel').hidden=true;render();};
  $('save-map').onclick=()=>{try{localStorage.setItem('cat-trap-map-v1',JSON.stringify(validateDraft()));toast('地图已保存到本机浏览器。');}catch(e){toast('未能保存：'+e.message);}};
  $('load-map').onclick=()=>{try{const data=localStorage.getItem('cat-trap-map-v1');if(!data)throw Error('还没有保存过地图。');useDraft(R.validateMap(JSON.parse(data)));toast('已读取地图，可继续编辑。');}catch(e){toast(e.message);}};
  $('export-map').onclick=()=>{try{const map=validateDraft(),url=URL.createObjectURL(new Blob([JSON.stringify(map,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='围堵小猫-自定义地图.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message);}};
  $('import-map').onclick=()=>$('map-file').click();
  $('map-file').onchange=async()=>{const f=$('map-file').files[0];$('map-file').value='';if(!f)return;try{if(f.size>100000)throw Error('地图文件过大，应小于 100 KB。');useDraft(R.validateMap(JSON.parse((await f.text()).replace(/^\uFEFF/,''))));toast('导入成功，点击“应用并开局”开始对局。');}catch(e){toast('无法导入：'+e.message);}};
  $('new-game').onclick=newGame;$('result-replay').onclick=newGame;
  $('restart').onclick=()=>{cancelAI();match.state=cloneState(initial);history=[];proofHistory=[];paused=false;lastAI='';audit={...match.proof};render();schedule();};
  $('swap-sides').onclick=()=>{if(editing)return;const c=controllers();$('blocker-controller').value=c.cat;$('cat-controller').value=c.blocker;$('restart').onclick();toast('双方交换角色，使用完全相同的开局。');};
  $('cancel-generation').onclick=()=>{cancelAI();paused=true;render();toast('已取消筛选，保留当前棋盘。');};
  $('undo').onclick=()=>{
    if(!history.length||editing)return;cancelAI();paused=true;
    const c=controllers();let target=history.length-1;
    if(c.cat!==c.blocker){const human=c.cat==='human'?'cat':'blocker';for(let i=history.length-1;i>=0;i--)if(history[i].turn===human){target=i;break;}}
    match.state=cloneState(history[target]);history=history.slice(0,target);lastAI='';audit=proofHistory[target]||{status:'unknown'};proofHistory=proofHistory.slice(0,target);refreshProof();render();
  };
  $('pause').onclick=()=>{cancelAI();paused=!paused;render();schedule();};
  $('ai-step').onclick=()=>runAI(true);
  $('verify-position').onclick=verifyPosition;
  $('preset').onchange=()=>$('map-size').disabled=$('preset').value==='custom';
  for(const id of ['cat-controller','blocker-controller','difficulty','speed'])$(id).onchange=()=>{cancelAI();render();schedule();};
  $('density').oninput=()=>$('density-value').textContent=$('density').value+'%';
  $('rules-open').onclick=()=>$('rules-dialog').showModal();$('rules-close').onclick=()=>$('rules-dialog').close();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused&&controllers().cat==='ai'&&controllers().blocker==='ai'){cancelAI();paused=true;render();}});
  newGame();
  // Optional structured access uses precisely the same turn validation as the board.
  const context=document.modelContext;
  if(context?.registerTool){
    const lifecycle=new AbortController();
    for(const tool of [{name:'read_cat_game',description:'Read the current cat-trap board and legal actions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({turn:match.state.turn,winner:match.state.winner,cat:match.game.cells[match.state.cat],blocked:[...match.state.blocked].map(i=>match.game.cells[i]),exits:match.game.map.exits,cells:match.game.cells,legal:R.actions(match.game,match.state).map(i=>match.game.cells[i]),editing})},{name:'play_cat_game_move',description:'Make one legal move for the current human-controlled side.',inputSchema:{type:'object',properties:{cell:{type:'string'}},required:['cell'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input.cell!=='string'||editing||busy||controllers()[match.state.turn]!=='human')throw Error('当前不能为人类方行动。');const at=match.game.lookup.get(input.cell);act(at);return{turn:match.state.turn,winner:match.state.winner};}}]){
      try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
    }
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
