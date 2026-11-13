'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');
const block=js.slice(js.indexOf('// STORE-START'),js.indexOf('// STORE-END'));

// Build the script's real store against a given userscript-manager behaviour.
function makeStore(gm){
 const ls=new Map();
 const localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
 const factory=new Function('GM_getValue','GM_setValue','GM_deleteValue','localStorage',block+';return {store,hasGM};');
 return factory(gm.get,gm.set,gm.del,localStorage);
}
const memory=()=>{const m=new Map();return m};

test('Torn PDA style: unsaved keys come back as null, store still returns the default',()=>{
 const m=memory();
 const {store,hasGM}=makeStore({get:k=>m.has(k)?m.get(k):null,set:(k,v)=>m.set(k,v),del:k=>m.delete(k)});
 assert.equal(hasGM,true);
 assert.deepEqual(store.get('combatWarFactions',{}),{});   // 0.8.0 crashed here
 assert.equal(store.get('combatCollapsed',true),true);
 store.set('combatWarFactions',{enemy:'8076'});
 assert.equal(store.get('combatWarFactions',{}).enemy,'8076');
});

test('async storage (promises) is not trusted; the browser storage is used instead',()=>{
 const {store,hasGM}=makeStore({get:async()=>null,set:async()=>{},del:async()=>{}});
 assert.equal(hasGM,false);
 assert.deepEqual(store.get('combatWarFactions',{}),{});
 store.set('apiKey','AAAAAAAAAAAAAAAA');
 assert.equal(store.get('apiKey',''),'AAAAAAAAAAAAAAAA');
});

test('normal Tampermonkey behaviour still works',()=>{
 const m=memory();
 const {store,hasGM}=makeStore({get:(k,d)=>m.has(k)?m.get(k):d,set:(k,v)=>m.set(k,v),del:k=>m.delete(k)});
 assert.equal(hasGM,true);
 store.set('combatWatchlist',[{id:'1'}]);
 assert.deepEqual(store.get('combatWatchlist',[]),[{id:'1'}]);
 store.del('combatWatchlist');
 assert.deepEqual(store.get('combatWatchlist',[]),[]);
});

test('no userscript storage at all falls back to the browser',()=>{
 const {store,hasGM}=makeStore({get:undefined,set:undefined,del:undefined});
 assert.equal(hasGM,false);
 assert.equal(store.get('missing','x'),'x');
 store.set('k',{a:1});
 assert.deepEqual(store.get('k',null),{a:1});
});

test('a storage error never breaks the script',()=>{
 const {store}=makeStore({get:()=>{throw Error('boom')},set:()=>{throw Error('boom')},del:()=>{}});
 assert.equal(store.get('anything','fallback'),'fallback');
 assert.doesNotThrow(()=>store.set('anything',1));
});

test('startup never reads a property straight off a stored value',()=>{
 assert.doesNotMatch(js,/store\.get\([^)]*\)\.[a-z]/i);
});
