// ==UserScript==
// @name         Torn Toolkit — Combat Edition
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      0.5.4
// @description  Manual target watchlists, solo chain lists and read-only faction rosters. No gameplay automation.
// @author       fl0w-development
// @copyright    Copyright (c) 2026 fl0w-development
// @license      PolyForm-Strict-1.0.0
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// ==/UserScript==
(function(){
'use strict';
const VER='0.5.4',API='https://api.torn.com/v2/',PDA='###PDA-APIKEY###';
const isPda=!PDA.includes('#'),hasGM=typeof GM_getValue==='function'&&typeof GM_setValue==='function';
const store={
 get(k,f){try{if(hasGM)return GM_getValue(k,f);const v=localStorage.getItem('tt_'+k);return v==null?f:JSON.parse(v)}catch(_){return f}},
 set(k,v){try{if(hasGM)GM_setValue(k,v);else localStorage.setItem('tt_'+k,JSON.stringify(v))}catch(_){}},
 del(k){try{if(hasGM&&typeof GM_deleteValue==='function')GM_deleteValue(k);else localStorage.removeItem('tt_'+k)}catch(_){}}
};
const key=()=>isPda?PDA:store.get('apiKey','');
const good=id=>/^\d{1,10}$/.test(String(id).trim())&&Number(id)>0;
const norm=id=>String(Number(id));
const url=id=>'https://www.torn.com/page.php?sid=attack&user2ID='+encodeURIComponent(id);
const ranks=['Absolute beginner','Beginner','Inexperienced','Rookie','Novice','Below average','Average','Reasonable','Above average','Competent','Highly competent','Veteran','Distinguished','Highly distinguished','Professional','Star','Master','Outstanding','Celebrity','Supreme','Idolized','Champion','Heroic','Legendary','Elite','Invincible'];
const ranges=['under ~2.5k','~2k–25k','~20k–250k','~200k–2.5m','~2m–35m','~20m–250m','over ~200m'];
function number(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
function estimate(p,ps){
 const rank=ranks.findIndex(x=>x.toLowerCase()===String(p&&p.rank||'').trim().toLowerCase());
 const l=number(p&&p.level),c=number(ps&&ps.crimes&&ps.crimes.total),n=number(ps&&ps.networth&&ps.networth.total);
 if(rank<0||l===null||c===null||n===null)return {label:'Insufficient public data',confidence:'None'};
 const count=(a,v)=>a.filter(t=>v>=t).length;
 const b=rank-count([2,6,11,26,31,50,71,100],l)-count([100,5000,10000,20000,30000,50000],c)-count([5e6,5e7,5e8,5e9,5e10],n);
 return b<0||b>6?{label:'Inconsistent rank data',confidence:'None'}:{label:ranges[b],confidence:'Low'};
}
function watchlist(){
 const v=store.get('combatWatchlist',[]),seen=new Set();
 return (Array.isArray(v)?v:[]).filter(x=>x&&good(x.id)).map(x=>({
  id:norm(x.id),name:String(x.name||'Player '+x.id).slice(0,60),
  group:['General','Farm','Chain','Rival','Other'].includes(x.group)?x.group:'General',
  note:String(x.note||'').slice(0,200)
 })).filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true}).slice(0,250);
}
function chain(){const v=store.get('combatSoloChain',[]);return (Array.isArray(v)?v:[]).filter(good).map(norm).slice(0,150)}
const saveWatch=x=>store.set('combatWatchlist',x.slice(0,250));
const saveChain=x=>store.set('combatSoloChain',x.slice(0,150));
function addWatch(id,name){
 if(!good(id))return false;id=norm(id);const a=watchlist();
 if(!a.some(x=>x.id===id)){a.unshift({id,name:String(name||'Player '+id).slice(0,60),group:'General',note:''});saveWatch(a)}
 return true;
}
function members(response){
 const raw=response&&response.members,arr=Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.entries(raw).map(([id,v])=>({id,...v})):[];
 return arr.filter(x=>x&&good(x.id)).map(x=>({id:norm(x.id),name:String(x.name||'Player '+x.id),
  level:x.level==null?'?':x.level,status:String(x.status&& (x.status.description||x.status.state)||'Unknown')}));
}
function move(list,i,d){const j=i+d,v=list.slice();if(j>=0&&j<v.length)[v[i],v[j]]=[v[j],v[i]];return v}
// Remove exactly one planned hit; duplicates elsewhere in the chain remain.
function removeHitAt(list,index){const v=list.slice();if(Number.isInteger(index)&&index>=0&&index<v.length)v.splice(index,1);return v}
function availability(value){
 const state=String(value||'').trim().toLowerCase();
 if(/hospital|jail|federal|fallen/.test(state))return 'unavailable';
 if(/travel|abroad/.test(state))return 'location';
 if(state==='okay')return 'likely';
 return 'unknown';
}
function parseStatus(response){
 const p=response&&response.profile||response||{},status=p.status;
 if(!status||typeof status!=='object')return {state:'Unknown',description:'Status not provided',until:null,availability:'unknown'};
 const state=String(status.state||'Unknown').slice(0,60);
 const description=String(status.description||state).replace(/<[^>]*>/g,'').slice(0,110);
 const seconds=Number(status.until);
 return {state,description,until:Number.isFinite(seconds)&&seconds>0?seconds:null,availability:availability(state)};
}
const pure={good,norm,url,number,estimate,members,move,removeHitAt,availability,parseStatus};
if(typeof module!=='undefined'&&module.exports){module.exports=pure;return}
function h(tag,attrs={},...kids){
 const n=document.createElement(tag);
 Object.entries(attrs).forEach(([k,v])=>{
  if(v===false||v==null)return;
  if(k==='class')n.className=v;else if(k==='style')n.style.cssText=v;
  else if(k==='value')n.value=v;else if(k==='checked')n.checked=!!v;
  else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);
  else n.setAttribute(k,v===true?'':String(v));
 });
 kids.flat().forEach(x=>{if(x!=null)n.append(x instanceof Node?x:document.createTextNode(String(x)))});
 return n;
}
const btn=(t,cb,secondary=false)=>h('button',{type:'button',class:'tc-btn'+(secondary?' tc-soft':''),onclick:cb},t);
const attack=id=>h('a',{class:'tc-btn tc-primary',href:url(id),title:'Open attack page; you initiate the attack'},'Attack');
const muted=t=>h('div',{class:'tc-muted'},t);
const card=(...kids)=>h('div',{class:'tc-card'},...kids);
const row=(...kids)=>h('div',{class:'tc-row'},...kids);
const main=(...kids)=>h('div',{class:'tc-grow'},...kids);
const title=t=>h('div',{class:'tc-title'},t);
const css=[
 "#tc-root{--tc-ink:#e3e6ea;--tc-muted:#9fa6ae;--tc-line:#41454a;--tc-accent:#bd4943;",
 " color-scheme:dark;font:12px/1.45 Arial,Helvetica,sans-serif;color:var(--tc-ink);",
 " background:#202225;border:1px solid #4a4d51;border-top:2px solid var(--tc-accent);",
 " border-radius:5px;width:100%;max-width:640px;min-width:0;margin:0 0 10px;overflow:hidden;",
 " box-sizing:border-box;box-shadow:0 2px 10px rgba(0,0,0,.17)}",
 "#tc-root *{box-sizing:border-box}",
 "#tc-root button,#tc-root input,#tc-root select,#tc-root textarea{font-family:inherit}",
 "#tc-root .tc-head{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px;",
 " background:#2c2e31;border-bottom:1px solid var(--tc-line)}",
 "#tc-root .tc-brand{min-width:0;display:flex;flex-direction:column;line-height:1.2;gap:2px}",
 "#tc-root .tc-brand .tc-title{font-size:14px;letter-spacing:.015em;white-space:nowrap}",
 "#tc-root .tc-brand .tc-muted{font-size:10px;margin:0;text-transform:uppercase;letter-spacing:.08em}",
 "#tc-root .tc-count{font-size:11px;color:#b5b9bd;white-space:nowrap}",
 "#tc-root .tc-body{padding:10px 12px 11px;max-height:min(405px,55vh);overflow-y:auto;",
 " overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#62676c #232528}",
 "#tc-root .tc-title{font-size:12px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}",
 "#tc-root .tc-muted{font-size:11px;color:var(--tc-muted);line-height:1.45;margin:3px 0}",
 "#tc-root .tc-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
 "#tc-root .tc-grow{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}",
 "#tc-root .tc-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap}",
 "#tc-root .tc-card{background:transparent;border:0;border-bottom:1px solid #383b3f;padding:9px 3px;margin:0}",
 "#tc-root .tc-card.tc-entry:hover{background:#292c30}",
 "#tc-root .tc-card.tc-current{background:#2b2b2e;border:1px solid #514c4c;border-left:3px solid var(--tc-accent);",
 " padding:9px;border-radius:3px;margin:6px 0 8px}",
 "#tc-root .tc-view-header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0 7px}",
 "#tc-root .tc-view-header .tc-title{font-size:13px}",
 "#tc-root .tc-notice{border-left:3px solid #c28a3b;padding:6px 8px;background:#34302a;margin-bottom:9px}",
 "#tc-root .tc-settings{background:#2a2c2f;border:1px solid #464a4e;padding:12px;border-radius:3px}",
 "#tc-root .tc-btn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;",
 " min-height:30px;padding:5px 9px;border-radius:3px;border:1px solid #5b5f64;background:#34373b;",
 " color:#e6e7e9;font:600 11px Arial,Helvetica,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer}",
 "#tc-root .tc-btn:hover{background:#45494e;border-color:#737980;color:#fff}",
 "#tc-root .tc-btn.tc-primary{background:#ad403c;border-color:#c25b55;color:#fff}",
 "#tc-root .tc-btn.tc-primary:hover{background:#c2514a;border-color:#d06a63}",
 "#tc-root .tc-btn.tc-soft{background:#2d3034;border-color:#4b4f54;color:#bfc4c9}",
 "#tc-root .tc-btn.tc-soft:hover{background:#3b3f43;color:#fff}",
 "#tc-root .tc-btn:disabled{opacity:.4;cursor:not-allowed}",
 "#tc-root .tc-btn:focus-visible,#tc-root .tc-tab:focus-visible,#tc-root .tc-input:focus-visible{",
 " outline:2px solid #e69b95;outline-offset:2px}",
 "#tc-root .tc-input{background:#191b1d;color:var(--tc-ink);border:1px solid #54585d;border-radius:3px;",
 " padding:7px 8px;font:12px Arial,Helvetica,sans-serif;min-width:0;width:100%;min-height:33px}",
 "#tc-root textarea.tc-input{min-height:66px;resize:vertical}",
 "#tc-root .tc-tabs{display:flex;gap:0;padding:0 8px;background:#282a2d;border-bottom:1px solid var(--tc-line)}",
 "#tc-root .tc-tab{min-height:36px;flex:0 1 110px;min-width:0;border:0;border-bottom:2px solid transparent;",
 " background:transparent;color:#a9b0b7;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer}",
 "#tc-root .tc-tab:hover{color:#fff;background:#33363a}",
 "#tc-root .tc-tab.selected{color:#fff;border-bottom-color:var(--tc-accent);background:#33363a}",
 "#tc-root .tc-body .tc-tabs{border:1px solid var(--tc-line);padding:0;margin:8px 0}",
 "#tc-root .tc-toggle{width:31px;min-width:31px;padding:3px;font-size:17px;line-height:1}",
 "#tc-root.tc-collapsed .tc-tabs,#tc-root.tc-collapsed .tc-body,#tc-root.tc-collapsed .tc-foot,",
 "#tc-root.tc-collapsed .tc-settings,#tc-root.tc-collapsed .tc-settings-btn{display:none!important}",
 "#tc-root.tc-collapsed .tc-head{min-height:36px;padding:4px 10px}",
 "#tc-root .tc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:7px 0}",
 "#tc-root .tc-section{font-size:11px;font-weight:700;color:#d5d9dd;margin:11px 0 5px}",
 "#tc-root .tc-status{font-size:11px;color:#b2b8bf;line-height:1.45;overflow-wrap:anywhere;margin:4px 0}",
 "#tc-root .tc-status:before{content:\"\";display:inline-block;width:7px;height:7px;border-radius:50%;",
 " margin:0 6px 1px 0;vertical-align:middle;background:#8f979e}",
 "#tc-root .tc-status-unavailable:before{background:#e16b62}",
 "#tc-root .tc-status-location:before{background:#d6ad59}",
 "#tc-root .tc-status-likely:before{background:#69b48a}",
 "#tc-root .tc-pager{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;margin:9px 0 3px}",
 "#tc-root .tc-pager .tc-muted{font-variant-numeric:tabular-nums}",
 "#tc-root .tc-empty{padding:16px 8px;text-align:center;color:#9fa6ae;background:#292c2e;",
 " border:1px dashed #42484e;border-radius:3px}",
 "#tc-root .tc-roster-row{padding:8px 3px;border-bottom:1px solid #383c40}",
 "#tc-root [hidden]{display:none!important}",
 "@media(max-width:570px){",
 " #tc-root{max-width:100%;border-radius:3px}",
 " #tc-root .tc-body{max-height:min(355px,52vh);padding:9px}",
 " #tc-root .tc-head{padding:5px 8px;gap:6px}",
 " #tc-root .tc-count{display:none}",
 " #tc-root .tc-head .tc-brand .tc-muted{font-size:9px}",
 " #tc-root .tc-btn{min-height:40px}",
 " #tc-root .tc-input{font-size:16px;min-height:42px}",
 " #tc-root .tc-tab{min-height:42px;flex:1}",
 " #tc-root .tc-toggle{width:38px;min-width:38px;min-height:40px}",
 "}"
].join('');
const state={tab:'attack',sub:'watch',watchPage:0,chainPage:0,collapsed:store.get('combatCollapsed',false)===true,target:null,player:null,playerError:'',own:'',enemy:'',left:null,right:null,warError:'',loading:false};
const apiCache=new Map(),inflight=new Map(),requests=[];
async function api(path,params={},ttl=300){
 if(!key())throw Error('Add an API key in Settings');
 const q=new URLSearchParams(params),ident=path+'?'+q.toString(),cached=apiCache.get(ident);
 if(cached&&Date.now()-cached.t<ttl*1000)return cached.v;
 if(inflight.has(ident))return inflight.get(ident);
 const now=Date.now();while(requests.length&&now-requests[0]>60000)requests.shift();
 if(requests.length>=25)throw Error('API rate limit safeguard: try again shortly');
 requests.push(now);q.set('comment','TornToolkit');
 const pending=(async()=>{
  const r=await fetch(API+path+'?'+q.toString(),{headers:{Authorization:'ApiKey '+key()}});
  if(!r.ok)throw Error('Torn API HTTP '+r.status);
  const v=await r.json();if(v.error)throw Error('Torn API: '+String(v.error.error||v.error.code));
  apiCache.set(ident,{t:Date.now(),v});return v;
 })();
 inflight.set(ident,pending);try{return await pending}finally{inflight.delete(ident)}
}
// Status checks only run for a visible list page or explicit refresh.
const statusCache=new Map(),statusQueue=new Map(),STATUS_TTL=90000,STATUS_PAGE_SIZE=10;
let statusBusy=false,checkingStatusId=null;
function statusLabel(id){
 const entry=statusCache.get(id);
 if(checkingStatusId===id)return 'Checking condition…';
 if(!entry)return key()?'Condition: Not checked':'Condition: API key required';
 if(entry.error)return 'Condition unavailable: '+entry.error+' · Refresh to try again';
 const label=entry.availability==='unavailable'?'Unavailable':entry.availability==='location'?'Location-dependent':
  entry.availability==='likely'?'Likely available':'Unconfirmed';
 let desc=entry.state;
 if(entry.description&&entry.description.toLowerCase()!==entry.state.toLowerCase())desc+=' · '+entry.description;
 if(entry.until){
  const secs=entry.until-Math.floor(Date.now()/1000);
  desc+=secs>0?' · ~'+Math.ceil(secs/60)+'m remaining':' · End time passed; refresh';
 }
 const age=Math.max(0,Math.floor((Date.now()-entry.checkedAt)/1000));
 return label+' — '+desc+' · Checked '+(age<60?'just now':Math.floor(age/60)+'m ago');
}
function statusBadge(id){
 const entry=statusCache.get(id);
 return h('div',{class:'tc-status tc-status-'+(entry?entry.availability:'unknown'),'data-status-id':id},statusLabel(id));
}
function updateStatusNodes(){
 if(!root)return;
 root.querySelectorAll('[data-status-id]').forEach(el=>{
  const id=el.getAttribute('data-status-id'),entry=statusCache.get(id);
  el.className='tc-status tc-status-'+(entry?entry.availability:'unknown');
  el.textContent=statusLabel(id);
 });
}
function enqueueStatuses(ids,force=false){
 if(!key()||state.collapsed||document.hidden)return;
 const now=Date.now(),unique=[...new Set(ids.filter(good).map(norm))].slice(0,STATUS_PAGE_SIZE);
 for(const id of unique){
  const old=statusCache.get(id);
  if(!force&&old&&now-old.checkedAt<STATUS_TTL)continue;
  statusQueue.set(id,force||statusQueue.get(id)===true);
 }
 void processStatusQueue();
}
async function processStatusQueue(){
 if(statusBusy)return;
 statusBusy=true;
 try{
  while(statusQueue.size){
   const [id,force]=statusQueue.entries().next().value;
   statusQueue.delete(id);
   const old=statusCache.get(id);
   if(!force&&old&&Date.now()-old.checkedAt<STATUS_TTL)continue;
   checkingStatusId=id;updateStatusNodes();
   try{
    const data=await api('user/'+id+'/basic',{striptags:'true'},force?0:90);
    statusCache.set(id,{...parseStatus(data),checkedAt:Date.now()});
   }catch(e){
    const msg=String(e&&e.message||e).slice(0,110);
    statusCache.set(id,{state:'Unknown',description:'',until:null,availability:'unknown',error:msg,checkedAt:Date.now()});
    if(/rate limit|slow down/i.test(msg)){statusQueue.clear();break}
   }finally{checkingStatusId=null;updateStatusNodes()}
  }
 }finally{statusBusy=false}
}
let root,body,tabs,collapseBtn;
function applyCollapsed(){
 root.classList.toggle('tc-collapsed',state.collapsed);
 collapseBtn.textContent=state.collapsed?'▾':'▴';
 collapseBtn.title=state.collapsed?'Expand Torn Toolkit':'Collapse Torn Toolkit';
 collapseBtn.setAttribute('aria-label',collapseBtn.title);
 collapseBtn.setAttribute('aria-expanded',String(!state.collapsed));
}
function toggleCollapsed(){
 state.collapsed=!state.collapsed;
 store.set('combatCollapsed',state.collapsed);
 applyCollapsed();
 if(!state.collapsed&&state.tab==='attack')render();
}
function targetFromUrl(){
 const u=new URL(location.href);
 const id=u.pathname==='/profiles.php'?u.searchParams.get('XID'):
  ['/loader.php','/page.php'].includes(u.pathname)&&u.searchParams.get('sid')==='attack'?
  (u.searchParams.get('user2ID')||u.searchParams.get('XID')):null;
 return good(id)?norm(id):null;
}
function host(){
 for(const selector of ['.content-wrapper','#mainContainer','#main-content','main','#content']){
  const found=document.querySelector(selector);if(found&&!found.closest('#tc-root'))return found;
 }
 return document.body;
}
function mount(){const dest=host();if(root.parentElement!==dest)dest.prepend(root)}
function showSettings(){
 const previous=root.querySelector('.tc-settings');if(previous){previous.remove();return}
 const input=h('input',{class:'tc-input',type:'password',maxlength:16,disabled:isPda,
  placeholder:isPda?'Torn PDA key connected':'16-character Torn API key',value:isPda?'':key()});
 const message=muted('');
 const form=card(title('API key'),input,muted('Key stays on this device, and is sent only to api.torn.com.'),
  row(btn('Save',async()=>{
   if(isPda){form.remove();return}
   const k=input.value.trim();
   if(k&&!/^[a-z0-9]{16}$/i.test(k)){message.textContent='Enter a 16-character API key';return}
   if(k){
    message.textContent='Verifying…';
    try{const r=await fetch(API+'key/info?comment=TornToolkit',{headers:{Authorization:'ApiKey '+k}});
     const d=await r.json();if(!r.ok||d.error)throw Error(d.error&&d.error.error||'Verification failed')}
    catch(e){message.textContent=String(e.message);return}
    store.set('apiKey',k);
   }else store.del('apiKey');
   location.reload();
  }),btn('Cancel',()=>form.remove(),true)),message);
 form.classList.add('tc-settings');root.insertBefore(form,body);
}
function renderTabs(){
 tabs.replaceChildren(...[['attack','Attack'],['war','War']].map(([id,label])=>
  h('button',{type:'button',class:'tc-tab'+(state.tab===id?' selected':''),
   onclick:()=>{state.tab=id;renderTabs();render()}},label)));
}
function render(){
 body.replaceChildren();
 if(!key())body.append(card(muted('Add an API key to fetch public profiles and faction rosters. Local lists work without a key.'),
  btn('API settings',showSettings,true)));
 if(state.tab==='attack')renderAttack();else renderWar();
}
function renderAttack(){
 body.append(h('div',{class:'tc-section'},'Current target'));
 if(state.target){
  const p=state.player&&state.player.profile||{},ps=state.player&&state.player.personalstats||{};
  const est=state.player?estimate(p,ps):null,name=String(p.name||'Player '+state.target);
  body.append(card(row(main(title(name+' ['+state.target+']'),
   muted(est?'Estimated battle stats: '+est.label+' · '+est.confidence+' confidence':
     state.playerError||'Loading public estimate…')),
   attack(state.target),btn(watchlist().some(x=>x.id===state.target)?'Watching':'+ Watch',
    ()=>{addWatch(state.target,name);render()},true))));
 }else body.append(muted('Open a player profile or attack page to see a public stat estimate.'));
 const nav=h('div',{class:'tc-tabs'},
  ...[['watch','Watchlist'],['chain','Solo Chain']].map(([id,label])=>
    h('button',{type:'button',class:'tc-tab'+(state.sub===id?' selected':''),
      onclick:()=>{state.sub=id;render()}},label)));
 body.append(nav);
 if(state.sub==='watch')renderWatch();else renderChain();
}
function renderWatch(){
 const id=h('input',{class:'tc-input',placeholder:'Player ID',inputmode:'numeric',maxlength:10}),message=muted('');
 body.append(row(main(id),btn('Add target',()=>{
  if(addWatch(id.value)){state.watchPage=0;render()}else message.textContent='Enter a valid numeric player ID';
 })),message);
 const search=h('input',{class:'tc-input',placeholder:'Search name or ID'});
 const group=h('select',{class:'tc-input'},...['All','General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g},g)));
 const list=h('div'),pager=h('div',{class:'tc-pager'});let visibleIds=[];
 body.append(h('div',{class:'tc-grid'},search,group),
  row(btn('Refresh shown conditions',()=>enqueueStatuses(visibleIds,true),true),muted('Up to 10 visible targets at a time')),
  list,pager,muted('Conditions are recent API snapshots, not guaranteed attack eligibility. Lists stay on this device.'));
 const paint=()=>{
  const q=search.value.toLowerCase(),filtered=watchlist().filter(x=>
   (group.value==='All'||x.group===group.value)&&(x.name.toLowerCase().includes(q)||x.id.includes(q)));
  const pages=Math.max(1,Math.ceil(filtered.length/STATUS_PAGE_SIZE));
  state.watchPage=Math.max(0,Math.min(state.watchPage,pages-1));
  const start=state.watchPage*STATUS_PAGE_SIZE,visible=filtered.slice(start,start+STATUS_PAGE_SIZE);
  visibleIds=visible.map(x=>x.id);
  list.replaceChildren(...visible.map(x=>{
   const editor=h('div',{hidden:true}),category=h('select',{class:'tc-input'},
    ...['General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g,selected:g===x.group},g)));
   const note=h('textarea',{class:'tc-input',rows:2,maxlength:200});note.value=x.note;
   editor.append(h('div',{class:'tc-grid'},category,note),
    row(btn('Save',()=>{const all=watchlist(),current=all.find(t=>t.id===x.id);
     if(current){current.group=category.value;current.note=note.value.slice(0,200);saveWatch(all)}render()}),
    btn('Cancel',()=>{editor.hidden=true},true)));
   return card(row(main(title(x.name+' ['+x.id+']'),statusBadge(x.id),
    muted(x.group+(x.note?' · '+x.note:''))),
    attack(x.id),btn('Chain +',()=>{saveChain([...chain(),x.id]);state.sub='chain';state.chainPage=0;render()},true),
    btn('Edit',()=>{editor.hidden=!editor.hidden},true),
    btn('Remove',()=>{saveWatch(watchlist().filter(t=>t.id!==x.id));render()},true)),editor);
  }));
  if(!filtered.length)list.append(muted('No matching targets.'));
  pager.replaceChildren(
   btn('◀ Previous',()=>{if(state.watchPage>0){state.watchPage--;paint()}},true),
   muted('Page '+(state.watchPage+1)+' of '+pages+' · '+filtered.length+' target(s)'),
   btn('Next ▶',()=>{if(state.watchPage<pages-1){state.watchPage++;paint()}},true));
  pager.querySelectorAll('button')[0].disabled=state.watchPage===0;
  pager.querySelectorAll('button')[1].disabled=state.watchPage===pages-1;
  enqueueStatuses(visibleIds);
 };
 search.addEventListener('input',()=>{state.watchPage=0;paint()});
 group.addEventListener('change',()=>{state.watchPage=0;paint()});
 paint();
}
function renderChain(){
 body.append(muted('Manual solo hit order. Duplicate targets allowed; no automatic attacks.'));
 const id=h('input',{class:'tc-input',placeholder:'Player ID to add',inputmode:'numeric',maxlength:10}),error=muted('');
 body.append(row(main(id),btn('Add hit',()=>{
  if(!good(id.value)){error.textContent='Enter a valid numeric player ID';return}
  saveChain([...chain(),norm(id.value)]);render();
 })),error);
 const items=chain();if(!items.length){body.append(muted('No planned hits yet.'));return}
 const nameOf=target=>watchlist().find(x=>x.id===target)?.name||'Player '+target;
 const current=items[0];
 body.append(h('div',{class:'tc-card tc-current'},h('div',{class:'tc-section'},'Current chain target'),
  row(main(title(nameOf(current)+' ['+current+']'),statusBadge(current)),
   attack(current),btn('Skip current target',()=>{saveChain(removeHitAt(chain(),0));state.chainPage=0;render()},true)),
  muted('Skipping removes this hit only. The watchlist entry stays saved.')));
 const rest=items.slice(1),pages=Math.max(1,Math.ceil(rest.length/9));
 state.chainPage=Math.max(0,Math.min(state.chainPage,pages-1));
 const start=state.chainPage*9,visible=rest.slice(start,start+9);
 if(rest.length)body.append(h('div',{class:'tc-section'},'UPCOMING HITS'));
 visible.forEach((target,j)=>{
  const i=start+j+1;
  body.append(card(row(muted('#'+(i+1)),main(title(nameOf(target)+' ['+target+']'),statusBadge(target)),
   attack(target),btn('↑',()=>{saveChain(move(chain(),i,-1));render()},true),
   btn('↓',()=>{saveChain(move(chain(),i,1));render()},true),
   btn('Remove hit',()=>{saveChain(removeHitAt(chain(),i));render()},true))));
 });
 const visibleIds=[current,...visible],pager=h('div',{class:'tc-pager'});
 pager.append(
  btn('◀ Previous',()=>{if(state.chainPage>0){state.chainPage--;render()}},true),
  muted('Upcoming page '+(state.chainPage+1)+' of '+pages),
  btn('Next ▶',()=>{if(state.chainPage<pages-1){state.chainPage++;render()}},true));
 pager.querySelectorAll('button')[0].disabled=state.chainPage===0;
 pager.querySelectorAll('button')[1].disabled=state.chainPage===pages-1;
 if(rest.length>9)body.append(pager);
 body.append(row(btn('Refresh shown conditions',()=>enqueueStatuses(visibleIds,true),true),
  btn('Clear chain',()=>{if(confirm('Clear your solo chain list?')){saveChain([]);state.chainPage=0;render()}},true)));
 body.append(muted('Hospital/Jail conditions are flagged unavailable; Traveling/Abroad depend on location. Statuses checked only on viewing this page or manual refresh.'));
 enqueueStatuses(visibleIds);
}
function renderWar(){
 body.append(h('div',{class:'tc-section'},'Faction rosters'),
  muted('Read-only roster viewer. Manually load two factions; shared plans and leadership editing are not active.'));
 const own=h('input',{class:'tc-input',placeholder:'Your faction ID',inputmode:'numeric',value:state.own});
 const enemy=h('input',{class:'tc-input',placeholder:'Enemy faction ID',inputmode:'numeric',value:state.enemy});
 body.append(h('div',{class:'tc-grid'},own,enemy),
  btn(state.loading?'Loading…':'Load rosters',async()=>{
   if(state.loading)return;
   if(!good(own.value)||!good(enemy.value)){state.warError='Enter both valid faction IDs';render();return}
   state.own=norm(own.value);state.enemy=norm(enemy.value);state.loading=true;
   state.warError='';state.left=null;state.right=null;render();
   try{
    const both=await Promise.all([
     api('faction/'+state.own+'/members',{},300),
     api('faction/'+state.enemy+'/members',{},300)
    ]);
    state.left=members(both[0]);state.right=members(both[1]);
   }catch(e){state.warError=String(e.message)}
   finally{state.loading=false;if(state.tab==='war')render()}
  }));
 if(state.loading)body.append(muted('Loading official API roster data…'));
 if(state.warError)body.append(card(muted(state.warError)));
 if(state.left&&state.right){
  const roster=(label,people)=>{
   const list=h('div',{class:'tc-roster'});
   people.forEach(p=>list.append(card(row(main(title(p.name+' ['+p.id+']'),
    muted('Level '+p.level+' · '+p.status)),attack(p.id)))));
   return h('div',{},h('div',{class:'tc-section'},label+' ('+people.length+')'),list);
  };
  body.append(h('div',{class:'tc-grid rosters'},roster('Your faction',state.left),roster('Enemy faction',state.right)));
  body.append(muted('Roster entries are not verified battle-stat reports. Visit profiles for conservative rank estimates.'));
 }
 body.append(card(title('War Planner Pro — upcoming'),
  muted('Shared chain orders, leadership-only editing, and assignments need a secure VPS backend. No insecure local role simulation.')));
}
async function loadTarget(id){
 state.player=null;state.playerError='';render();
 if(!id||!key())return;
 try{
  const data=await Promise.all([
   api('user/'+id+'/profile',{},300),
   api('user/'+id+'/personalstats',{cat:'popular'},300)
  ]);
  if(state.target!==id)return;
  state.player={profile:data[0].profile||data[0],personalstats:data[1].personalstats||data[1]};
 }catch(e){if(state.target===id)state.playerError=String(e.message)}
 if(state.tab==='attack'&&state.target===id)render();
}
function boot(){
 if(document.getElementById('tc-root'))return;
 document.head.append(h('style',{id:'tc-style'},css));
 tabs=h('div',{id:'tc-tabs',class:'tc-tabs',role:'tablist'});body=h('div',{id:'tc-body',class:'tc-body'});
 collapseBtn=btn('▴',toggleCollapsed,true);
 collapseBtn.classList.add('tc-toggle');
 collapseBtn.setAttribute('aria-controls','tc-tabs tc-body');
 root=h('section',{id:'tc-root','aria-label':'Torn Toolkit Combat Edition'},
  h('div',{class:'tc-head'},title('Torn Toolkit'),muted('Combat · '+VER),
   h('span',{style:'flex:1'}),
   h('button',{type:'button',class:'tc-btn tc-soft tc-settings-btn',onclick:showSettings},'Settings'),
   collapseBtn),
  tabs,body,h('div',{class:'tc-muted tc-foot',style:'padding:7px 12px;border-top:1px solid #3a4752'},'Manual actions only'));
 applyCollapsed();mount();renderTabs();state.target=targetFromUrl();render();loadTarget(state.target);
 let last=location.href;
 setInterval(()=>{
  if(location.href!==last){last=location.href;const current=targetFromUrl();
   if(current!==state.target){state.target=current;loadTarget(current)}}
  if(!root.isConnected||root.parentElement!==host())mount();
 },1500);
 setInterval(()=>{if(!document.hidden&&!state.collapsed)updateStatusNodes()},15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();