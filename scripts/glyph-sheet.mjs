import fs from 'node:fs'; import {Resvg} from '@resvg/resvg-js';
const dir='node_modules/@salesforce-ux/icons/dist/salesforce-lightning-design-system-icons/utility/';
const names=process.argv[3].split(',');
const cols=10, cell=110; let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${cols*cell}" height="${Math.ceil(names.length/cols)*cell}"><rect width="100%" height="100%" fill="#fff"/>`;
names.forEach((n,i)=>{const x=(i%cols)*cell, y=Math.floor(i/cols)*cell; let src; try{src=fs.readFileSync(dir+n+'.svg','utf8')}catch{return}
 const inner=src.slice(src.indexOf('<svg')).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
 out+=`<circle cx="${x+55}" cy="${y+42}" r="34" fill="#032D60"/><svg x="${x+38}" y="${y+25}" width="34" height="34" viewBox="0 0 520 520" fill="#fff">${inner}</svg><text x="${x+55}" y="${y+98}" font-size="10" text-anchor="middle" font-family="Arial">${n}</text>`});
out+='</svg>'; fs.writeFileSync(process.argv[2], new Resvg(out,{font:{loadSystemFonts:true}}).render().asPng());
