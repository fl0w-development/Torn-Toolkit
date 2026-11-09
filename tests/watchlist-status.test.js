'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseStatus,availability,removeHitAt}=require('../torn-toolkit.user.js');

test('reads nested Torn API v2 basic profile status and expiry',()=>{
 const s=parseStatus({profile:{id:123,status:{state:'Hospital',description:'Hospitalized for 4 minutes',until:1794179000}}});
 assert.equal(s.state,'Hospital');
 assert.equal(s.availability,'unavailable');
 assert.equal(s.description,'Hospitalized for 4 minutes');
 assert.equal(s.until,1794179000);
});
test('recognizes conditions without treating overseas travel as absolutely unavailable',()=>{
 for(const x of ['Hospital','Jail','Federal Jail','Fallen'])assert.equal(availability(x),'unavailable');
 for(const x of ['Traveling','Abroad'])assert.equal(availability(x),'location');
 assert.equal(availability('Okay'),'likely');
 assert.equal(availability('Unknown'),'unknown');
});
test('shows unknown when public API omits the status object',()=>{
 assert.equal(parseStatus({profile:{id:123}}).availability,'unknown');
});
test('sanitizes public description and ignores invalid expiry',()=>{
 const s=parseStatus({profile:{status:{state:'Jail',description:'<b>Jailed</b>',until:'invalid'}}});
 assert.equal(s.description,'Jailed');
 assert.equal(s.until,null);
});
test('skipping current chain hit keeps the watchlist and other duplicate hits',()=>{
 const original=['123','456','123'];
 const copy=removeHitAt(original,0);
 assert.deepEqual(copy,['456','123']);
 assert.deepEqual(original,['123','456','123']);
 assert.deepEqual(removeHitAt(original,2),['123','456']);
 assert.deepEqual(removeHitAt(original,-1),original);
 assert.deepEqual(removeHitAt(original,99),original);
});
