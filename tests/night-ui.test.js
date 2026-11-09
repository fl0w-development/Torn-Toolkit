'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');
const pkg=require('../package.json');

test('version is the same in the userscript header, the script and package.json',()=>{
 const header=js.match(/@version\s+(\S+)/)[1];
 const ver=js.match(/const VER='([^']+)'/)[1];
 assert.equal(header,ver);
 assert.equal(pkg.version,ver);
});
test('panel shows how to contact the author',()=>{
 assert.match(js,/const CONTACT=\{name:'fl0ww_',id:'4605130'\}/);
 assert.match(js,/profiles\.php\?XID='\+CONTACT\.id/);
 assert.match(js,/class:'tc-foot'/);
});
test('stars twinkle, turn off with the aurora switch and stay still for reduced motion',()=>{
 assert.match(js,/@keyframes tc-twinkle/);
 assert.match(js,/@keyframes tc-shoot/);
 assert.match(js,/#tc-root\.tc-no-aurora>\.tc-stars\{display:none\}/);
 const reduced=js.slice(js.indexOf('"@media(prefers-reduced-motion:reduce){"'));
 assert.match(reduced,/\.tc-stars,#tc-root>\.tc-stars::before\{animation:none\}/);
 assert.match(reduced,/\.tc-stars::after\{display:none\}/);
});
test('no generic panel leftovers: no logo tile or spaced capitals in the header',()=>{
 assert.match(js,/#tc-root \.tc-mark\{display:none\}/);
 assert.doesNotMatch(js,/COMBAT INTELLIGENCE/);
});
