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
  this.classList={toggle:(name,on)=>{if(on)this.className+=' '+name}};
 }
 set textContent(x){this._t=String(x);this.children=[]}
 get textContent(){return this._t+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(k,fn){this.events[k]=fn}
 appendChild(n){n.parentElement=this;this.children.push(n);if(this.tagName==='select' && n.tagName==='option' && this.children.length===1)this.value=n.attrs.value||n.textContent;return n}
 append(){Array.from(arguments).forEach(n=>this.appendChild(n))}
 insertBefore(n,sibling){n.parentElement=this;this.children.unshift(n)}
 replaceChildren(){this.children=[];Array.from(arguments).forEach(n=>{if(n instanceof E)this.appendChild(n)})}
 querySelector(q){const target=q.replace('#','');return this.querySelectorAll(q)[0]||null}
 querySelectorAll(q){const all=[],pred=n=>q.startsWith('#')?n.attrs.id===q.slice(1):q.startsWith('.')?n.className.split(' ').includes(q.slice(1)):n.tagName===q;const walk=n=>{n.children.forEach(c=>{if(pred(c))all.push(c);walk(c)})};walk(this);return all}
 get isConnected(){return !!this.parentElement}
 get firstChild(){return this.children[0]||null}
}
class URLStub{constructor(){this.pathname='/index.php';this.searchParams={get:()=>null}}}
function simulate(saved){
 const body=new E('body'),head=new E('head');
 const doc={body,head,documentElement:new E('html'),readyState:'complete',
  createElement:x=>new E(x),createTextNode:x=>new E('#text',x),
  getElementById:id=>body.querySelector('#'+id)||head.querySelector('#'+id),
  addEventListener:()=>{}};
 const localStorage={getItem:key=>Object.hasOwn(saved,key)?JSON.stringify(saved[key]):null,setItem:(k,v)=>{saved[k]=JSON.parse(v)},removeItem:k=>delete saved[k]};
 new Function('document','Node','URL','location','localStorage','GM_getValue','GM_setValue','GM_deleteValue','setInterval','setTimeout',js)(
  doc,E,URLStub,{href:'https://www.torn.com/index.php'},localStorage,undefined,undefined,undefined,()=>0,()=>0
 );
 return {body,doc};
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
