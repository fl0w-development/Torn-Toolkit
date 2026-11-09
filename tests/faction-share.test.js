'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {encodeFactionOrder,decodeFactionOrder,removeHitAt}=require('../torn-toolkit.user.js');

test('leader share code preserves faction, author, order and duplicate hits',()=>{
 const code=encodeFactionOrder(321,1234567,1794200000,['9','15','9']);
 assert.equal(code,'TTFC1|321|1234567|1794200000|9,15,9');
 assert.deepEqual(decodeFactionOrder(code),{
  factionId:'321',authorId:'1234567',createdAt:1794200000,entries:['9','15','9']
 });
});
test('empty chain order can be shared without losing the faction identity',()=>{
 const code=encodeFactionOrder('321','1234567',1794200000,[]);
 assert.deepEqual(decodeFactionOrder(code).entries,[]);
});
test('invalid or oversize imported data is rejected',()=>{
 for(const value of [
  '', 'TTFC1|321|123|1794200000|abc', 'TTFC1|321|123|oops|12',
  'TTFC1|0|123|1794200000|12', 'TTFC1|321|0|1794200000|12',
  'TTFC1|321|123|1794200000|-1',
  'TTFC1|321|123|1794200000|'+Array(151).fill('1').join(','),
  'TTFC2|321|123|1794200000|12'
 ])assert.throws(()=>decodeFactionOrder(value));
});
test('authors cannot encode invalid IDs and chain skip still preserves later duplicate hits',()=>{
 assert.throws(()=>encodeFactionOrder('0','123',1794200000,['1']));
 assert.throws(()=>encodeFactionOrder('321','123',1794200000,['invalid']));
 assert.deepEqual(removeHitAt(['9','15','9'],0),['15','9']);
});
