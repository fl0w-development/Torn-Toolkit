'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('persistent panel attaches directly to body instead of Torn containers',()=>{
 assert.match(script,/function host\(\)\{[\s\S]*?return document\.body\|\|document\.documentElement;/);
 assert.match(script,/if\(dest&&root\.parentElement!==dest\)dest\.append\(root\)/);
 assert.doesNotMatch(script,/document\.querySelectorAll\(selector\)/);
});
test('dock remains visible and usable when collapsed',()=>{
 assert.match(script,/#tc-root\.tc-docked\{position:fixed!important/);
 assert.match(script,/z-index:2147483000!important/);
 assert.match(script,/visibility:visible!important/);
 assert.match(script,/#tc-root\.tc-docked\.tc-collapsed\{/);
 assert.match(script,/class:'tc-docked'/);
 assert.match(script,/function toggleCollapsed\(\)/);
});
test('dock remains compact and supports both Torn hostnames',()=>{
 assert.match(script,/max-height:min\(406px,calc\(100vh - 145px\)\)/);
 assert.match(script,/@match\s+\*:\/\/www\.torn\.com\/\*/);
 assert.match(script,/@match\s+\*:\/\/torn\.com\/\*/);
});
