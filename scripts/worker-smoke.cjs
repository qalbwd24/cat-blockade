'use strict';
// Exercise the exact browser worker source with real worker-thread message serialization.
// This verifies the worker protocol, not browser layout or pointer interaction.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{Worker}=require('node:worker_threads');
const R=require('../dist/rules'),P=require('../dist/proof');
const context=vm.createContext({});
for(const name of ['rules','solver','proof','openings','tactics','ai'])vm.runInContext(fs.readFileSync(path.join(__dirname,`../dist/${name}.js`),'utf8'),context);
const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const factory=app.match(/function workerCode\(\)\{return `[\s\S]*?`;\}/)[0];
const code=vm.runInContext(`(${factory})()`,context);
const worker=new Worker(`const {parentPort}=require('node:worker_threads');global.postMessage=data=>parentPort.postMessage(data);parentPort.on('message',data=>global.onmessage({data}));\n${code}`,{eval:true});
let match,certificate,progress=0,moves=0;
const timeout=setTimeout(()=>{console.error('Worker timeout');worker.terminate();process.exitCode=1;},30000);
worker.on('error',error=>{clearTimeout(timeout);console.error(error);process.exitCode=1;});
worker.on('message',data=>{
  try{
    if(data.error)throw Error(data.error);
    if(data.progress){progress++;return;}
    if(!match){const m=data.result;match={game:R.compile(m.map),state:{...m.state,blocked:new Set(m.state.blocked)}};certificate=m.proof.certificate;if(!P.verify(match.game,match.state,certificate).valid)throw Error('Bad opening');}
    else {const choice=data.result;if(!R.actions(match.game,match.state).includes(choice.action))throw Error('Illegal worker action');certificate=P.advance(certificate,match.state.turn,choice.action);match.state=R.transition(match.game,match.state,choice.action);moves++;}
    if(match.state.winner){
      if(match.state.winner!=='blocker'||moves<11||!progress)throw Error('Unexpected finished game');
      clearTimeout(timeout);worker.terminate();console.log(JSON.stringify({winner:match.state.winner,moves,progressMessages:progress,actualWorkerProtocol:true}));return;
    }
    worker.postMessage({map:match.game.map,state:{...match.state,blocked:[...match.state.blocked]},certificate,level:'normal'});
  }catch(error){clearTimeout(timeout);worker.terminate();console.error(error);process.exitCode=1;}
});
worker.postMessage({kind:'opening',map:R.preset('island','release-play-island-0',8),density:35,seed:'release-play-island-0'});
