const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=require('../dist/rules.js'),S=require('../dist/solver.js'),A=require('../dist/ai.js');
const presets=['island','crescent','ring','random','hex'];
const result={timestamp:new Date().toISOString(),definition:'围堵方存在对所有合法猫行动均获胜的策略。AI 对战胜率只作运行检查，不作可解性证明。',
  previousRun:{radius:5,density:12,AI:{ms:20,depth:2},seeds:'audit0 through audit9',rows:[
    {map:'island',maxCells:67,minimumEscapeSteps:2,blockerWins:0,games:10,averageActions:11.6},
    {map:'crescent',maxCells:75,minimumEscapeSteps:3,blockerWins:0,games:10,averageActions:10.8},
    {map:'ring',maxCells:84,minimumEscapeSteps:5,blockerWins:0,games:10,averageActions:11.8},
    {map:'random',maxCells:64,minimumEscapeSteps:2,blockerWins:0,games:10,averageActions:6.4},
    {map:'hex',maxCells:91,minimumEscapeSteps:5,blockerWins:0,games:10,averageActions:12.2}
  ],note:'Captured before this revision. This script does not recreate the old source.'},
  currentRun:{radius:10,density:18,mode:'certified',catAI:{ms:20,depth:2},blockerAI:'verified plan first',seeds:'audit0 through audit9',rows:[]},
  testEvidence:{command:'npm test',passed:42,smallStatesAgainstIndependentOracle:256,generatedCertificates:180,recursiveReferenceCertificates:15,note:'Recorded from the accompanying successful test run; these counts are not inferred from AI wins.'}};
for(const name of presets){
  let wins=0,moves=0,minDistance=Infinity,maxDistance=0,minCells=Infinity,maxCells=0,minPlan=Infinity,maxPlan=0,checked=0;
  for(let k=0;k<10;k++){
    const seed='audit'+k,m=S.createCertified(R.preset(name,seed,10),18,seed),distance=R.analyse(m.game,m.state).distance;
    assert(S.verifyPlan(m.game,m.state,m.proof.plan).valid);checked++;
    minDistance=Math.min(minDistance,distance);maxDistance=Math.max(maxDistance,distance);minCells=Math.min(minCells,m.game.cells.length);maxCells=Math.max(maxCells,m.game.cells.length);minPlan=Math.min(minPlan,m.proof.plan.length);maxPlan=Math.max(maxPlan,m.proof.plan.length);
    let s=m.state,plan=m.proof.plan;
    while(!s.winner&&s.ply<2*m.game.cells.length){
      const reply=A.choose(m.game,s,'easy',{ms:20,depth:2,plan:s.turn==='blocker'?plan:undefined});
      if(s.turn==='blocker'){assert(reply.proven);plan=reply.plan;}
      s=R.transition(m.game,s,reply.action);plan=plan.filter(i=>!s.blocked.has(i));
      if(!s.winner)assert(S.verifyPlan(m.game,s,plan).valid);
    }
    assert.equal(s.winner,'blocker');wins++;moves+=s.ply;
  }
  const row={map:name,cells:[minCells,maxCells],escapeDistance:[minDistance,maxDistance],provenBlockPlacements:[minPlan,maxPlan],individuallyVerified:checked,blockerWins:wins,games:10,averageActions:moves/10};
  result.currentRun.rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(__dirname,'../验证记录.json'),JSON.stringify(result,null,2)+'\n','utf8');
