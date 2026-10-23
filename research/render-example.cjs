'use strict';
const fs=require('node:fs'),path=require('node:path');
const example=require('./adaptive-example.json');
const R=require('../dist/rules.js'),P=require('./proof-search.cjs');
const {game,state}=R.createGame(example.map,0);
if(!P.verify(game,state,example.result.certificate).valid)throw Error('Invalid example');
fs.writeFileSync(path.join(__dirname,'adaptive-example-map.json'),JSON.stringify(example.map,null,2),'utf8');
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="760" height="580" viewBox="0 0 760 580"><rect width="760" height="580" fill="#fafaf7"/><g font-family="Microsoft YaHei, sans-serif" text-anchor="middle"><text x="380" y="42" font-size="24" fill="#203329">同一开局，需要两种不同应对</text><text x="380" y="73" font-size="15" fill="#516259">19 格随机障碍样本 · 围堵先手 · 已穷举验证</text>';
for(const id of game.cells){
  const [q,r]=R.coords(id),x=380+Math.sqrt(3)*(q+r/2)*49,y=275+1.5*r*49;
  const blocked=example.map.fixed.includes(id),exit=example.map.exits.includes(id),cat=id==='0,0';
  const label=cat?'猫':id==='1,0'?'先封':blocked?'×':id;
  svg+=`<circle cx="${x}" cy="${y}" r="35" fill="${blocked?'#52656a':cat?'#edc96d':id==='1,0'?'#ee8a6a':'#e0edeb'}" stroke="${exit&&!blocked?'#36866d':'#fafaf7'}" stroke-width="4"/><text x="${x}" y="${y+5}" font-size="${blocked?25:15}" fill="${blocked?'#ffffff':'#203329'}">${label}</text>`;
}
svg+='<text x="380" y="469" font-size="15" fill="#34483c">猫走到 (-1,0) → 封 (-1,-1)；猫走到 (1,-1) → 封 (2,-2)</text><text x="380" y="502" font-size="15" fill="#34483c">随后猫只能退回中心，再封另一条通路即可。</text><text x="380" y="538" font-size="13" fill="#65756b">深色 ×：随机障碍　绿色边：尚未封闭的出口　坐标为轴向 q,r</text></g></svg>';
fs.writeFileSync(path.join(__dirname,'adaptive-example.svg'),svg,'utf8');
console.log('Verified example map and SVG generated.');
