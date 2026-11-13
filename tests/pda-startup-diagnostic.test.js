'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('full script passes a JavaScript syntax parse',()=>{
 assert.doesNotThrow(()=>new Function(js));
});
test('diagnostic catches initialization and startup errors without touching stored user data',()=>{
 assert.match(js,/\/\/ BOOT-DIAGNOSTIC-START/);
 assert.match(js,/tcBootMarker\(\)/);
 assert.match(js,/function safeBoot\(\)/);
 assert.match(js,/tcBootError\(e,'boot'\)/);
 assert.match(js,/tcBootError\(e,'initialization'\)/);
 const block=js.slice(js.indexOf('// BOOT-DIAGNOSTIC-START'),js.indexOf('// BOOT-DIAGNOSTIC-END'));
 assert.doesNotMatch(block,/(?:GM_setValue|GM_deleteValue|localStorage\.|PDA_storage)/);
});
test('diagnostic creates an on-screen banner with the failing stage and reason',()=>{
 const block=js.slice(js.indexOf('// BOOT-DIAGNOSTIC-START'),js.indexOf('// BOOT-DIAGNOSTIC-END'));
 const nodes=[];
 const doc={
  body:{appendChild(node){nodes.push(node)}},documentElement:null,
  getElementById(id){return nodes.find(x=>x.id===id)||null},
  createElement(){return {id:'',style:{},setAttribute(k,v){this[k]=v},remove(){}}}
 };
 const {fail}=new Function('document','VER',block+'; return {fail:tcBootError};')(doc,'0.8.6');
 fail(new Error("visible diagnostic"),'boot');
 assert.equal(nodes.length,1);
 assert.equal(nodes[0].id,'tc-boot-error');
 assert.match(nodes[0].textContent,/0.8.6 startup error \(boot\): visible diagnostic/);
 assert.match(nodes[0].style.cssText,/position:fixed!important/);
});
