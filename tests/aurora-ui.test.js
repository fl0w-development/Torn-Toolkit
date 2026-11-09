'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('aurora is scoped to the userscript panel and cannot intercept user input',()=>{
 assert.match(js,/#tc-root::before,#tc-root::after/);
 assert.match(js,/pointer-events:none/);
 assert.match(js,/isolation:isolate/);
 assert.match(js,/@keyframes tc-aurora-drift/);
 assert.match(js,/@keyframes tc-aurora-rise/);
 assert.match(js,/36s ease-in-out infinite alternate/);
 assert.match(js,/44s ease-in-out infinite alternate/);
});
test('respects reduced motion and supports persistent off switch',()=>{
 assert.match(js,/prefers-reduced-motion:reduce/);
 assert.match(js,/tc-no-aurora::before/);
 assert.match(js,/tc-no-aurora::after/);
 assert.match(js,/store\.set\('combatAurora',auroraToggle\.checked\)/);
 assert.match(js,/store\.get\('combatAurora',true\)===false/);
});
test('keeps the bounded layout and manual gameplay tools',()=>{
 assert.match(js,/max-width:660px/);
 assert.match(js,/max-height:min\(406px,55vh\)/);
 assert.match(js,/STATUS_PAGE_SIZE=5/);
 assert.match(js,/pageSlice\(rest,state\.chainPage,4\)/);
 assert.match(js,/btn\('Skip target'/);
 assert.match(js,/const attack=id=>h\('a'/);
});
