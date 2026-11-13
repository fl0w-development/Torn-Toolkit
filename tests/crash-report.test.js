'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');
const block=js.slice(js.indexOf('// CRASH-REPORT-START'),js.indexOf('// CRASH-REPORT-END'));

function fakeDocument(){
 const added=[];
 const el=()=>({style:{},id:'',textContent:'',addEventListener(){},remove(){}});
 return {added,doc:{getElementById:id=>added.find(x=>x.id===id)||null,createElement:el,body:{append:x=>added.push(x)},documentElement:{append:x=>added.push(x)}}};
}

test('a startup error is shown on screen with the version, reason and contact',()=>{
 const {added,doc}=fakeDocument();
 const report=new Function('document','VER',block+';return tcReportCrash;')(doc,'0.8.2');
 report(new TypeError("Cannot read properties of null (reading 'own')"),'loading');
 assert.equal(added.length,1);
 assert.equal(added[0].id,'tc-crash');
 assert.match(added[0].textContent,/Torn Toolkit 0\.8\.2 hit an error \(loading\): Cannot read properties of null/);
 assert.match(added[0].textContent,/fl0ww_ \[4605130\]/);
 report(new Error('second'),'startup');
 assert.equal(added.length,1,'only one bar, never a pile of them');
});

test('the whole script and the boot step are wrapped',()=>{
 assert.match(js,/'use strict';\nconst VER='[^']+'.*\n\/\/ CRASH-REPORT-START/);
 assert.match(js,/function safeBoot\(\)\{try\{boot\(\)\}catch\(e\)\{tcReportCrash\(e,'startup'\)\}\}/);
 assert.match(js,/\}catch\(e\)\{\n const show=\(\)=>tcReportCrash\(e,'loading'\);/);
});

test('the panel only mounts into a visible container',()=>{
 assert.match(js,/found\.getClientRects\(\)\.length\)return found;/);
});
