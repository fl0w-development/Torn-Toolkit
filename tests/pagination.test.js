'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pageSlice,removeHitAt,parseStatus}=require('../torn-toolkit.user.js');

test('watchlist page size 5 does not drop or duplicate saved entries',()=>{
 const ids=Array.from({length:12},(_,i)=>String(i+1));
 const pages=[0,1,2].map(n=>pageSlice(ids,n,5));
 assert.deepEqual(pages.map(p=>p.items.length),[5,5,2]);
 assert.deepEqual(pages.flatMap(p=>p.items),ids);
 assert.deepEqual(pages.map(p=>p.page),[0,1,2]);
});
test('chain current item is always separate from upcoming pages',()=>{
 const chain=['1','2','3','4','5','6','7','8','9','10','11'];
 const rest=chain.slice(1);
 const pages=[0,1,2].map(n=>pageSlice(rest,n,4));
 assert.equal(chain[0],'1');
 assert.deepEqual(pages.map(p=>p.items.length),[4,4,2]);
 assert.deepEqual(pages.flatMap(p=>p.items),rest);
 const next=removeHitAt(chain,0);
 assert.equal(next[0],'2');
 assert.equal(next.length,10);
});
test('roster search and page clamping do not lose matching members',()=>{
 const roster=Array.from({length:13},(_,i)=>({id:String(i+1),name:i%2?'Blue':'Red'}));
 const filtered=roster.filter(p=>p.name==='Red');
 assert.equal(filtered.length,7);
 const a=pageSlice(filtered,0,5),b=pageSlice(filtered,1,5);
 assert.equal(a.pages,2);
 assert.deepEqual(a.items.concat(b.items),filtered);
 assert.equal(pageSlice(filtered,99,5).page,1);
 assert.equal(pageSlice(filtered,-3,5).page,0);
 assert.deepEqual(pageSlice([],9,5).items,[]);
});
test('public status classification is unaffected by layout changes',()=>{
 assert.equal(parseStatus({profile:{status:{state:'Hospital'}}}).availability,'unavailable');
 assert.equal(parseStatus({profile:{status:{state:'Traveling'}}}).availability,'location');
});
