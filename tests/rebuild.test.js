'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');
const staged=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.rebuilt.user.js'),'utf8');
test('promoted userscript is identical to staged clean rebuild',()=>assert.equal(js,staged));
test('rebuild source parses and keeps the same appearance, data identifiers and tabs',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/tc-aurora-drift/);
 assert.match(js,/tc-twinkle/);
 for(const key of ['combatWatchlist','combatSoloChain','combatFactionOrder_','combatCollapsed','combatAurora','apiKey','key/info','faction/'])assert.ok(js.includes(key),key);
 for(const name of ['Targets','Activity','Solo Chain','Faction Chain','War'])assert.ok(js.includes(name),name);
 assert.match(js,/@run-at\s+document-end/);
 assert.doesNotMatch(js,/module\.exports/);
 assert.doesNotMatch(js,/tc-pda-launcher|ensureMobileLauncher|mobileDrawerOpen/);
});
class E{
 constructor(tag,txt=''){
  this.tagName=tag;this.children=[];this.parentElement=null;this._t=String(txt);this.className='';this.attrs={};this.style={cssText:''};this.events={};this.value='';this.hidden=false;this.checked=false;
  this.classList={toggle:(name,on)=>{if(on && !this.className.split(' ').includes(name))this.className+=' '+name;else if(!on)this.className=this.className.split(' ').filter(x=>x!==name).join(' ')},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ')}};
 }
 set textContent(x){this._t=String(x);this.children=[]}
 get textContent(){return this._t+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=v}
 getAttribute(k){return this.attrs[k]===undefined?null:this.attrs[k]}
 removeChild(node){const i=this.children.indexOf(node);if(i<0)throw Error('Child absent');this.children.splice(i,1);node.parentElement=null;return node}
 addEventListener(k,fn){this.events[k]=fn}
 appendChild(n){n.parentElement=this;this.children.push(n);if(this.tagName==='select' && n.tagName==='option' && this.children.length===1)this.value=n.attrs.value||n.textContent;return n}
 append(){Array.from(arguments).forEach(n=>this.appendChild(n))}
 prepend(){Array.from(arguments).reverse().forEach(n=>{n.parentElement=this;this.children.unshift(n)})}
 closest(query){return null}
 insertBefore(n,sibling){n.parentElement=this;this.children.unshift(n)}
 replaceChildren(){
  if(this.attrs.id==='tc-body'){this.repaintCount=(this.repaintCount||0)+1;if(this.repaintCount>15)throw Error('Unbounded status render loop')}
  this.children=[];Array.from(arguments).forEach(n=>{if(n instanceof E)this.appendChild(n)})
 }
 querySelector(q){const target=q.replace('#','');return this.querySelectorAll(q)[0]||null}
 querySelectorAll(q){const all=[],pred=n=>q.startsWith('#')?n.attrs.id===q.slice(1):q.startsWith('.')?n.className.split(' ').includes(q.slice(1)):n.tagName===q;const walk=n=>{n.children.forEach(c=>{if(pred(c))all.push(c);walk(c)})};walk(this);return all}
 get isConnected(){return !!this.parentElement}
 get firstChild(){return this.children[0]||null}
 get previousElementSibling(){
  if(!this.parentElement)return null;
  const a=this.parentElement.children,i=a.indexOf(this);
  return i>0?a[i-1]:null;
 }
 insertAdjacentElement(position,node){
  if(position!=='afterend'||!this.parentElement)throw Error('Invalid placement');
  if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(x=>x!==node);
  const siblings=this.parentElement.children,index=siblings.indexOf(this);
  siblings.splice(index+1,0,node);node.parentElement=this.parentElement;
 }
}
class URLStub{constructor(){this.pathname='/index.php';this.searchParams={get:()=>null}}}
function simulate(saved,withWrapper=false,options={}){
 const body=new E('body'),head=new E('head');
 const wrapper=new E('div');wrapper.className='content-wrapper';
 if(withWrapper){body.appendChild(new E('header'));body.appendChild(wrapper)}
 if(options.hideWrapper)wrapper.hidden=true
 const doc={body,head,documentElement:new E('html'),readyState:'complete',
  createElement:x=>new E(x),createTextNode:x=>new E('#text',x),
  getElementById:id=>body.querySelector('#'+id)||head.querySelector('#'+id),
  querySelector:q=>q==='.content-wrapper'&&withWrapper?wrapper:null,
  addEventListener:()=>{}};
 const localStorage={getItem:key=>Object.hasOwn(saved,key)?JSON.stringify(saved[key]):null,setItem:(k,v)=>{saved[k]=JSON.parse(v)},removeItem:k=>delete saved[k]};
 const href={href:options.pageHref||'https://www.torn.com/index.php'},intervals=[];
 const executable=options.pda?js.replace('###PDA-APIKEY###','example1234567890'):js;
 new Function('document','Node','URL','location','localStorage','GM_getValue','GM_setValue','GM_deleteValue','setInterval','setTimeout','PDA_httpGet','fetch',executable)(
  doc,E,options.pageHref?URL:URLStub,href,localStorage,undefined,undefined,undefined,fn=>{intervals.push(fn);return intervals.length},()=>0,options.pdaGet,options.fetch
 );
 return {body,doc,wrapper,href,intervals};
}
test('actual rebuild creates aurora panel and five tabs without existing data',()=>{
 const {body}=simulate({});
 const panel=body.querySelector('#tc-root');
 assert.ok(panel,'rebuilt panel should mount on the page');
 assert.equal(panel.querySelectorAll('.tc-tab').length,5);
 assert.ok(body.querySelector('#tc-root').textContent.includes('Torn Toolkit'));
 assert.equal(body.querySelector('#tt-rebuild-error'),null);
});
test('rebuild renders existing watchlist and chain data without deleting them',()=>{
 const saved={tt_combatWatchlist:[{id:'123',name:'Known target',group:'Rival',note:''}],tt_combatSoloChain:['123']};
 const {body}=simulate(saved);
 assert.ok(body.querySelector('#tc-root'),'panel should show with legacy stored items');
 assert.ok(body.querySelector('#tc-root').textContent.includes('Known target'),'existing watchlist should render');
 assert.equal(saved.tt_combatSoloChain[0],'123');
});

test('restores original panel position inside Torn content wrapper (not before site header)',()=>{
 const {body,wrapper}=simulate({},true);
 const panel=body.querySelector('#tc-root');
 assert.ok(panel,'Toolkit root should exist');
 assert.equal(panel.parentElement,wrapper,'Toolkit must be mounted into original content wrapper');
 assert.equal(body.children[0].tagName,'header','Torn website header should remain first');
 assert.equal(wrapper.children[0],panel,'Toolkit should lead content without preceding entire page');
});

test('PDA uses native HTTP and never enters a status-triggered repaint loop',async()=>{
 const saved={tt_combatWatchlist:[{id:'123',name:'Known target',group:'Rival',note:''}],tt_combatSoloChain:['123']};
 let calls=0;
 const {body}=simulate(saved,false,{
  pda:true,
  pdaGet:async (url,headers)=>{
   calls++;
   assert.match(url,/api\.torn\.com\/v2\/user\/123\/profile/);
   assert.match(headers.Authorization,/^ApiKey /);
   return {status:200,responseText:JSON.stringify({profile:{status:{state:'Okay'}}})};
  },
  fetch:()=>{throw Error('PDA must use native bridge, not browser fetch')}
 });
 const panel=body.querySelector('#tc-root');
 assert.ok(panel,'panel must mount before activity request');
 // Flush native-bridge promises and one status update; a recursive repaint
 // would hit the fake DOM's finite repaint guard and display an error.
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1,'cached status must not trigger new HTTP calls');
 assert.ok(panel.textContent.includes('Okay'),'status should update after native bridge resolves');
 assert.equal(body.querySelector('#tt-rebuild-error'),null,'no repaint-loop crash banner');
 assert.ok(panel.querySelector('#tc-body').repaintCount<=3,'render must stabilize');
});

test('PDA mounts Aurora panel directly without a bottom launcher',()=>{
 const {body,wrapper}=simulate({},true,{pda:true,pdaGet:async()=>({status:200,responseText:'{}'})});
 const panel=body.querySelector('#tc-root');
 assert.ok(panel,'PDA must build the panel automatically');
 assert.equal(panel.parentElement,wrapper,'panel belongs inside the Torn content area');
 assert.equal(body.querySelector('#tc-pda-launcher'),null,'no separate bottom button');
 assert.ok(panel.textContent.includes('Torn Toolkit'),'original panel is visible');
});

test('hidden Torn wrappers are ignored and the panel stays under page header',()=>{
 const {body,wrapper}=simulate({},true,{hideWrapper:true,pda:true,pdaGet:async()=>({status:200,responseText:'{}'})});
 const panel=body.querySelector('#tc-root');
 assert.ok(wrapper.hidden,'test must hide the Torn content wrapper');
 assert.ok(panel,'panel mounts even when the first matching content wrapper is hidden');
 assert.equal(panel.parentElement,body,'fallback stays within the document flow');
 assert.equal(body.children[0].tagName,'header','website header remains first');
 assert.equal(body.children[1],panel,'panel appears directly below header');
 assert.equal(body.querySelector('#tc-pda-launcher'),null,'no launcher on fallback');
});

test('Torn PDA adaptSource normalization preserves full userscript JavaScript syntax',()=>{
 // Exact source rewriting performed by Torn PDA's UserScriptsProvider.adaptSource:
 // replace the API key token, wrap in a namespace with PDA_storage,
 // then normalize curly quotes to straight ASCII quote characters.
 const withKey=js.replaceAll('###PDA-APIKEY###','0123456789abcdef');
 const wrapped='(function(){const PDA_storage = undefined;'+withKey+'}());';
 const normalized=wrapped.replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
 assert.doesNotThrow(()=>new Function(normalized),'the exact PDA-transformed script must compile');
 assert.doesNotMatch(js,/[‘’“”]/,'never ship curly quotes that PDA can rewrite inside JS strings');
});
test('reproduces the old PDA parser failure caused by a curly apostrophe',()=>{
 const example="const message = 'Load leader’s order';";
 const rewritten=example.replace(/[‘’]/g,"'");
 assert.throws(()=>new Function(rewritten),SyntaxError);
});

test('activity tracker is a fifth in-panel tab; native profile gets a compact summary',()=>{
 const playerId='123';
 const saved={
  tt_combatActivityTargets:[{id:playerId,name:'Known target'}],
  tt_combatActivityHistory_123:[{t:Date.now()-2*86400000,s:'Online'},{t:Date.now()-86400000,s:'Offline'}]
 };
 const {body,wrapper}=simulate(saved,true,{
  pda:true,
  pageHref:'https://www.torn.com/profiles.php?XID=123',
  pdaGet:async()=>({status:200,responseText:JSON.stringify({profile:{name:'Known target',last_action:{status:'Online'}}})})
 });
 const panel=body.querySelector('#tc-root'),profile=body.querySelector('#tt-profile-activity');
 assert.ok(panel,'Aurora panel must still exist');
 assert.equal(panel.querySelectorAll('.tc-tab').length,5);
 assert.ok(profile,'profile summary should appear on a player profile');
 assert.equal(profile.parentElement,wrapper,'summary belongs inside Torn profile content');
 assert.equal(profile.attrs['data-player-id'],'123');
 assert.match(profile.textContent,/Usually online/);
 assert.match(profile.textContent,/Usually offline/);
 assert.match(profile.textContent,/observations/);
 assert.equal(body.querySelector('#tc-pda-launcher'),null,'no new floating button');
});

test('profile activity Track button stores player and records real API observation',async()=>{
 const saved={};
 let calls=0;
 const {body}=simulate(saved,true,{
  pda:true,
  pageHref:'https://www.torn.com/profiles.php?XID=456',
  pdaGet:async (url)=>{
   calls++;
   if(url.includes('personalstats'))return {status:200,responseText:'{}'};
   return {status:200,responseText:JSON.stringify({profile:{name:'Test target',last_action:{status:'Online'},status:{state:'Okay'}}})};
  }
 });
 const profile=body.querySelector('#tt-profile-activity');
 assert.ok(profile,'summary should be present even for a new player');
 assert.match(profile.textContent,/Not tracking yet/);
 const buttons=profile.querySelectorAll('button');
 assert.equal(buttons.length,1);
 buttons[0].events.click();
 assert.equal(saved.tt_combatActivityTargets.length,1);
 assert.equal(saved.tt_combatActivityTargets[0].id,'456');
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls>=1,'Torn public profile API was requested');
 assert.equal(saved.tt_combatActivityHistory_456.length,1,'an actual observation was recorded');
 assert.match(profile.textContent,/Last observed: Online/);
 assert.match(profile.textContent,/Full activity/);
 assert.equal(body.querySelector('#tt-rebuild-error'),null);
});

test('activity profile summary follows player navigation and disappears off profile pages',()=>{
 const saved={};
 const {body,href,intervals}=simulate(saved,true,{
  pda:true,
  pageHref:'https://www.torn.com/profiles.php?XID=100',
  pdaGet:async()=>({status:200,responseText:'{}'})
 });
 let widget=body.querySelector('#tt-profile-activity');
 assert.equal(widget.attrs['data-player-id'],'100');
 href.href='https://www.torn.com/profiles.php?XID=101';
 intervals[0]();
 widget=body.querySelector('#tt-profile-activity');
 assert.ok(widget);
 assert.equal(widget.attrs['data-player-id'],'101','never show the previously viewed player');
 href.href='https://www.torn.com/index.php';
 intervals[0]();
 assert.equal(body.querySelector('#tt-profile-activity'),null,'remove summary on non-profile pages');
});

test('activity tracker does not extrapolate an online pattern from insufficient samples',()=>{
 const saved={tt_combatActivityTargets:[{id:'123',name:'Known target'}]};
 const {body}=simulate(saved,true,{pda:true});
 const activityTab=body.querySelectorAll('.tc-tab').find(x=>x.textContent==='Activity');
 assert.ok(activityTab);
 activityTab.events.click();
 const pane=body.querySelector('#tc-body');
 assert.match(pane.textContent,/USUALLY ONLINE/);
 assert.match(pane.textContent,/Not enough data yet/);
 assert.match(pane.textContent,/Still learning/);
 assert.equal(body.querySelector('#tt-rebuild-error'),null);
});

test('faction activity uses one public roster request and counts Online Idle Offline separately',async()=>{
 const saved={};let requests=[];
 const mockMembers=[
  {id:111,name:'Member One',last_action:{status:'Online'}},
  {id:222,name:'Member Two',last_action:{status:'Idle'}},
  {id:333,name:'Member Three',last_action:{status:'Offline'}},
  {id:444,name:'Member Four',last_action:{status:'Unknown'}}
 ];
 const {body}=simulate(saved,true,{pda:true,
  pdaGet:async (url,headers)=>{
   requests.push({url,headers});
   return {status:200,responseText:JSON.stringify({members:mockMembers})};
  }
 });
 const activityTab=body.querySelectorAll('.tc-tab').find(x=>x.textContent==='Activity');
 activityTab.events.click();
 const pane=body.querySelector('#tc-body');
 const field=pane.querySelectorAll('input')[0];
 assert.ok(field,'faction ID field must exist');
 field.value='999';
 const track=pane.querySelectorAll('button').find(x=>x.textContent==='Track faction');
 assert.ok(track,'faction track button must exist');
 track.events.click();
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.tt_combatActivityFactionId,'999');
 assert.equal(requests.length,1,'one roster request, not one request per member');
 assert.match(requests[0].url,/faction\/999\/members/);
 const history=saved.tt_combatActivityFactionHistory_999;
 assert.equal(history.length,1);
 assert.deepEqual([history[0].online,history[0].idle,history[0].offline,history[0].total],[1,1,1,3]);
 assert.match(body.querySelector('#tc-body').textContent,/1 online, 1 idle, 1 offline/);
 assert.match(body.querySelector('#tc-body').textContent,/Member One/);
 assert.equal(body.querySelector('#tt-rebuild-error'),null,'never break Aurora panel');
});

test('faction-wide trend uses at least two days and reports averaged online percentages',()=>{
 const byDay=daysAgo=>{
  const d=new Date();d.setDate(d.getDate()-daysAgo);d.setHours(14,20,0,0);return d.getTime();
 };
 const saved={
  tt_combatActivityFactionId:'999',
  tt_combatActivityFactionHistory_999:[
   {t:byDay(3),online:6,idle:1,offline:3,total:10},
   {t:byDay(2),online:4,idle:1,offline:5,total:10},
   {t:byDay(1),online:5,idle:2,offline:3,total:10}
  ]
 };
 const {body}=simulate(saved,true,{pda:true});
 body.querySelectorAll('.tc-tab').find(x=>x.textContent==='Activity').events.click();
 const pane=body.querySelector('#tc-body');
 assert.match(pane.textContent,/FACTION BUSIEST HOURS/);
 assert.match(pane.textContent,/50% online/);
 assert.match(pane.textContent,/FACTION QUIETEST HOURS/);
 assert.equal(pane.querySelectorAll('.tc-activity-hour').length,24,'faction heatmap has 24 hourly cells');
 assert.equal(body.querySelector('#tt-rebuild-error'),null);
 const stop=pane.querySelectorAll('button').find(x=>x.textContent==='Stop tracking');
 stop.events.click();
 assert.equal(saved.tt_combatActivityFactionId,undefined,'stop tracking clears active faction ID');
 assert.equal(saved.tt_combatActivityFactionHistory_999.length,3,'stop tracking preserves past observations');
});

test('activity faction history rejects unknown member states rather than assuming offline',async()=>{
 const saved={};
 const {body}=simulate(saved,true,{pda:true,pdaGet:async()=>({
  status:200,responseText:JSON.stringify({members:[
   {id:11,name:'A',last_action:{status:'Unknown'}},
   {id:12,name:'B',status:{state:'Okay'}}
  ]})
 })});
 body.querySelectorAll('.tc-tab').find(x=>x.textContent==='Activity').events.click();
 const pane=body.querySelector('#tc-body');
 pane.querySelectorAll('input')[0].value='999';
 pane.querySelectorAll('button').find(x=>x.textContent==='Track faction').events.click();
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.tt_combatActivityFactionHistory_999,undefined,'no fake Offline observations');
 assert.match(body.querySelector('#tc-body').textContent,/Waiting for first roster snapshot/);
 assert.match(body.querySelector('#tc-body').textContent,/Last faction check/);
 assert.equal(body.querySelector('#tt-rebuild-error'),null);
});
