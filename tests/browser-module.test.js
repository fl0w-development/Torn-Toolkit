'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','torn-toolkit.user.js'),'utf8');

test('Node pure helpers still export when document is absent',()=>{
 const module={exports:{}};
 new Function('module',script)(module);
 assert.equal(typeof module.exports.encodeFactionOrder,'function');
});
class Element {
 constructor(tag,text=''){
  this.tagName=tag;this.children=[];this.parentElement=null;this._text=String(text);
  this.attrs={};this.className='';this.events={};this.style={};this.value='';this.scrollTop=0;
  this.classList={
   add:c=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),c])].join(' ')},
   remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ')},
   toggle:(c,flag)=>{const yes=flag===undefined?!this.className.split(' ').includes(c):flag;yes?this.classList.add(c):this.classList.remove(c)}
  };
 }
 set textContent(x){this._text=String(x);this.children=[]}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=v}
 getAttribute(k){return this.attrs[k]||null}
 addEventListener(k,cb){this.events[k]=cb}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n)}}
 prepend(...nodes){for(const n of nodes){n.parentElement=this;this.children.unshift(n)}}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes)}
 remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null}}
 querySelectorAll(query){
  const found=[];
  const match=n=>query.startsWith('#')?n.attrs.id===query.slice(1):query.startsWith('.')?n.className.split(' ').includes(query.slice(1)):n.tagName===query;
  const walk=node=>{for(const child of node.children){if(match(child))found.push(child);walk(child)}};
  walk(this);return found;
 }
 querySelector(query){return this.querySelectorAll(query)[0]||null}
 get isConnected(){return !!this.parentElement}
}
class URLStub{
 constructor(){this.pathname='/index.php';this.searchParams={get:()=>null}}
}
function browserBoot(withModule){
 const document={
  body:new Element('body'),head:new Element('head'),documentElement:new Element('html'),
  readyState:'complete',hidden:false,
  createElement:t=>new Element(t),createTextNode:t=>new Element('#text',t),
  getElementById(id){return this.body.querySelector('#'+id)||this.head.querySelector('#'+id)},
  querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}
 };
 const values={combatCollapsed:false};
 new Function('module','document','Node','location','URL','GM_getValue','GM_setValue',
  'GM_deleteValue','setInterval','setTimeout','clearTimeout','localStorage','console',script)(
  withModule?{exports:{}}:undefined,document,Element,
  {href:'https://www.torn.com/index.php'},URLStub,
  (k,d)=>Object.hasOwn(values,k)?values[k]:d,(k,v)=>{values[k]=v},
  k=>delete values[k],()=>0,()=>0,()=>{}, {getItem:()=>null}, {error:()=>{}}
 );
 return {root:document.body.querySelector('#tc-root'),
  error:document.body.querySelector('#tc-boot-error')};
}
test('browser mounts panel both with and without module.exports',()=>{
 for(const withModule of [false,true]){
  const {root,error}=browserBoot(withModule);
  assert.ok(root,'panel must mount when module is '+String(withModule));
  assert.equal(error,null,'no startup error expected');
 }
});
