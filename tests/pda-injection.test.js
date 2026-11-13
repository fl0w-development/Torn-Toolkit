'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('PDA installs into document-end and accepts both Torn hostnames',()=>{
 assert.match(code,/@run-at\s+document-end/);
 assert.match(code,/@match\s+\*:\/\/www\.torn\.com\/\*/);
 assert.match(code,/@match\s+\*:\/\/torn\.com\/\*/);
});
test('PDA launcher appears at the top of its in-app browser, not under the bottom toolbar',()=>{
 assert.match(code,/#tc-root\.tc-docked\.tc-pda\{top:max\(72px,env\(safe-area-inset-top\)\)!important/);
 assert.match(code,/bottom:auto!important/);
 assert.match(code,/pdaRuntime\?' tc-pda':''/);
});
test('PDA lifecycle retries only until the document is available',()=>{
 assert.match(code,/function bootWhenReady\(\)/);
 assert.match(code,/if\(document\.body&&document\.head\)\{safeBoot\(\);return\}/);
 assert.match(code,/bootAttempts>=24/);
 assert.match(code,/document\.addEventListener\('DOMContentLoaded',bootWhenReady/);
});
test('native PDA HTTP responses are used for API calls without changing desktop fallback',()=>{
 assert.match(code,/typeof PDA_httpGet==='function'/);
 assert.match(code,/PDA_httpGet\(endpoint,headers\)/);
 assert.match(code,/response\.responseText/);
 assert.match(code,/fetch\(endpoint,\{headers\}\)/);
 assert.match(code,/tornGetJson\(API\+path\+'\?'\+q\.toString\(\),key\(\)\)/);
});
