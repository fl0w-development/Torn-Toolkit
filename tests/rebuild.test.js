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
 for(const name of ['Targets','Solo Chain','Faction Chain','War'])assert.ok(js.includes(name),name);
 assert.match(js,/@run-at\s+document-end/);
 assert.doesNotMatch(js,/module\.exports/);
});
class E{
 constructor(tag,txt=''){
  this.tagName=tag;this.children=[];this.parentElement=null;this._t=String(txt);this.className='';this.attrs={};this.style={cssText:''};this.events={};this.value='';this.hidden=false;this.checked=false;
  this.classList={toggle:(name,on)=>{if(on && !this.className.split(' ').includes(name))this.className+=' '+name;else if(!on)this.className=this.className.split(' ').filter(x=>x!==name).join(' ')},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ')}};
 }
 set textContent(x){this._t=String(x);this.children=[]}
 get textContent(){return this._t+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=v}
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
}
class URLStub{constructor(){this.pathname='/index.php';this.searchParams={get:()=>null}}}
function simulate(saved,withWrapper=false,options={}){
 const body=new E('body'),head=new E('head');
 const wrapper=new E('div');wrapper.className='content-wrapper';
 if(withWrapper){body.appendChild(new E('header'));body.appendChild(wrapper)}
 const doc={body,head,documentElement:new E('html'),readyState:'complete',
  createElement:x=>new E(x),createTextNode:x=>new E('#text',x),
  getElementById:id=>body.querySelector('#'+id)||head.querySelector('#'+id),
  querySelector:q=>q==='.content-wrapper'&&withWrapper?wrapper:null,
  addEventListener:()=>{}};
 const localStorage={getItem:key=>Object.hasOwn(saved,key)?JSON.stringify(saved[key]):null,setItem:(k,v)=>{saved[k]=JSON.parse(v)},removeItem:k=>delete saved[k]};
 const executable=options.pda?js.replace('###PDA-APIKEY###','example1234567890'):js;
 new Function('document','Node','URL','location','localStorage','GM_getValue','GM_setValue','GM_deleteValue','setInterval','setTimeout','PDA_httpGet','fetch',executable)(
  doc,E,URLStub,{href:'https://www.torn.com/index.php'},localStorage,undefined,undefined,undefined,()=>0,()=>0,options.pdaGet,options.fetch
 );
 return {body,doc,wrapper};
}
test('actual rebuild creates aurora panel and four tabs without existing data',()=>{
 const {body}=simulate({});
 const panel=body.querySelector('#tc-root');
 assert.ok(panel,'rebuilt panel should mount on the page');
 assert.equal(panel.querySelectorAll('.tc-tab').length,4);
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

test('PDA launcher remains visible independently of Torn content wrapper and opens existing UI',()=>{
 const saved={};
 const {body,wrapper}=simulate(saved,true,{pda:true,pdaGet:async()=>({status:200,responseText:'{}'})});
 const panel=body.querySelector('#tc-root'),launcher=body.querySelector('#tc-pda-launcher');
 assert.ok(launcher,'native PDA should get an independent launcher');
 assert.equal(panel.parentElement,wrapper,'default panel placement remains in Torn content area');
 assert.match(launcher.style.cssText,/position:fixed!important/);
 launcher.events.click();
 assert.equal(panel.parentElement,body,'tap moves the same panel to visible page overlay');
 assert.match(panel.style.cssText,/position:fixed!important/);
 launcher.events.click();
 assert.equal(panel.parentElement,wrapper,'closing returns the panel to original content area');
 assert.equal(saved.tt_combatSoloChain,undefined,'opening launcher never overwrites saved chains');
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
