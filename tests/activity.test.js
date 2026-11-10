'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');
// Run the real activity code from the userscript, not a copy.
const core=js.slice(js.indexOf('// ACTIVITY-CORE-START'),js.indexOf('// ACTIVITY-CORE-END'));
const act=new Function(core+';return {actBucket,actWeight,actNewFaction,actRecord,actRates,actFactionHours,actKnown,actQuietWindow,actBusiest,actOfflineLine,ACT_MIN_HOURS};')();

const MON=Date.UTC(2026,10,9)/1000; // Monday 00:00 UTC (TCT)
const at=(day,hour,min=0)=>MON+day*86400+hour*3600+min*60;
const roster=(statuses)=>statuses.map((s,i)=>({id:String(100+i),name:'P'+i,lastStatus:s,lastTs:0}));

test('buckets use TCT (UTC) with Monday as day 0',()=>{
 assert.deepEqual(act.actBucket(at(0,0)),{dow:0,hour:0,day:Math.floor(MON/86400)});
 assert.equal(act.actBucket(at(6,23)).dow,6);
 assert.equal(act.actBucket(at(2,15,30)).hour,15);
});

test('online counts fully, idle half, offline not at all',()=>{
 assert.equal(act.actWeight('Online'),1);
 assert.equal(act.actWeight('Idle'),0.5);
 assert.equal(act.actWeight('Offline'),0);
});

test('a check records the share of the faction online in that day and hour',()=>{
 const f=act.actNewFaction();
 act.actRecord(f,roster(['Online','Idle','Offline','Offline']),at(1,20));
 assert.deepEqual(f.week[1*24+20],[1,0.375]);
 assert.deepEqual(f.members['100'].h[20],[1,1]);
 assert.deepEqual(f.members['101'].h[20],[1,0.5]);
});

test('activity between checks is filled in from the last action time',()=>{
 const f=act.actNewFaction();
 act.actRecord(f,roster(['Offline']),at(0,9));
 // Torn was closed; they were active at 14:10 and we check again at 18:00.
 act.actRecord(f,[{id:'100',name:'P0',lastStatus:'Offline',lastTs:at(0,14,10)}],at(0,18));
 assert.deepEqual(f.members['100'].h[14],[1,1]);
 assert.deepEqual(f.members['100'].h[18],[1,0]);
});

test('old data fades and members gone for 30 days are dropped',()=>{
 const f=act.actNewFaction();
 act.actRecord(f,roster(['Online','Online']),at(0,12));
 act.actRecord(f,roster(['Online']),at(10,12));
 assert.ok(f.week[0*24+12][0]<0.5,'ten days later the old sample has faded');
 act.actRecord(f,roster(['Online']),at(45,12));
 assert.ok(!f.members['101'],'member not seen for over 30 days is removed');
 assert.ok(f.members['100']);
});

test('quiet window and busiest hour come from the hourly averages',()=>{
 const rates=Array.from({length:24},(_,h)=>h>=4&&h<9?0.05:h===19?0.9:0.4);
 assert.deepEqual(act.actQuietWindow(rates,5),{start:4,end:9,avg:0.05});
 assert.equal(act.actBusiest(rates),19);
 rates[6]=null;
 assert.notEqual(act.actQuietWindow(rates,5).start,4,'windows with unknown hours are skipped');
});

test('the offline line needs enough hours, then finds the longest offline stretch (wrapping midnight)',()=>{
 const m={h:Array.from({length:24},()=>[0,0])};
 for(let h=0;h<6;h++)m.h[h]=[3,0];
 assert.equal(act.actOfflineLine(m).learning,true);
 for(let h=0;h<24;h++)m.h[h]=h>=22||h<6?[3,0]:[3,2];
 const line=act.actOfflineLine(m);
 assert.equal(line.text,'usually offline 22–06 TCT');
 for(let h=0;h<24;h++)m.h[h]=h>=17?[3,3]:[3,1.5];
 assert.equal(act.actOfflineLine(m).text,'online most evenings');
 assert.equal(act.actOfflineLine(null),null);
});

test('faction hourly averages combine all seven days',()=>{
 const f=act.actNewFaction();
 act.actRecord(f,roster(['Online','Offline']),at(0,3));
 act.actRecord(f,roster(['Offline','Offline']),at(1,3));
 const hours=act.actFactionHours(f);
 // Monday's sample has faded by one day (x0.93) by the time Tuesday's is added.
 assert.ok(Math.abs(hours[3]-(0.5*0.93)/(0.93+1))<1e-9);
 assert.equal(hours[4],null);
 assert.equal(act.actKnown(hours),1);
});

test('member parser keeps last action status and time, tracking is opt-out and disclosed',()=>{
 assert.match(js,/lastStatus:String\(x\.last_action&&x\.last_action\.status\|\|''\)/);
 assert.match(js,/store\.get\('combatActivityOn',true\)/);
 assert.match(js,/Clear activity data/);
});
