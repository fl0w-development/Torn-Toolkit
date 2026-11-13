'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('Node pure helpers still export when document is absent',()=>{
 const module={exports:{}};
 new Function('module',script)(module);
 assert.equal(typeof module.exports.encodeFactionOrder,'function');
});

test('browser with module.exports does not exit before UI setup',()=>{
 // Run the exact source in a browser-like environment and force a DOM
 // sentinel error. If browser execution reaches boot, it will be caught
 // by the diagnostic and surfaced as a visible banner.
 const inserted=[];
 const make=(tag)=>({
  tag,style:{},setAttribute(){},append(){},appendChild(){},
  addEventListener(){},classList:{add(){},toggle(){}},remove(){},
  set textContent(v){this.text=v},get textContent(){return this.text||''}
 });
 const doc={
  body:{appendChild:n=>inserted.push(n),append(){},prepend(){},querySelectorAll:()=>[]},
  documentElement:null,head:{append(){throw Error('Reached UI boot')}},
  readyState:'complete',getElementById:()=>null,
  createElement:make,createTextNode:t=>make('#text')
 };
 const module={exports:{}};
 new Function('document','module','GM_getValue','GM_setValue','localStorage',script)(
  doc,module,()=>false,()=>false,{getItem:()=>null}
 );
 assert.ok(inserted.some(el=>el.id==='tc-boot-error'&&String(el.textContent).includes('Reached UI boot')),
  'browser must reach boot even if a global module object exists');
});
