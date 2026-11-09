'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('never uses native dialogs, which in-app browsers like Torn PDA may not show',()=>{
 assert.doesNotMatch(js,/(^|[^.\w])(confirm|alert|prompt)\(/m);
 assert.match(js,/function confirmBtn\(/);
 assert.match(js,/Tap again to confirm/);
});
test('touch sizes apply to every touch screen, not only narrow ones',()=>{
 const block=js.match(/"@media\(pointer:coarse\)\{",([\s\S]*?)"\}"/);
 assert.ok(block,'pointer:coarse block missing');
 assert.match(block[1],/\.tc-input\{min-height:42px;font-size:16px\}/); // 16px stops iOS zooming into inputs
 assert.match(block[1],/\.tc-btn\{min-height:40px\}/);
 assert.match(block[1],/\.tc-tab\{min-height:42px\}/);
});
test('copying a share code falls back when the clipboard API is blocked',()=>{
 assert.match(js,/setSelectionRange\(0,share\.value\.length\)/);
 assert.match(js,/document\.execCommand\('copy'\)/);
 assert.match(js,/long-press it and choose Copy/);
});
