// ==UserScript==
// @name         Torn Toolkit — Combat Edition
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      0.6.0
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
const VER='0.6.0',API='https://api.torn.com/v2/',PDA='###PDA-APIKEY###';
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
function pageSlice(items,index,size){
 const limit=Math.max(1,Math.floor(size)||1),pages=Math.max(1,Math.ceil(items.length/limit));
 const page=Math.max(0,Math.min(Number.isInteger(index)?index:0,pages-1)),start=page*limit;
 return {page,pages,start,items:items.slice(start,start+limit)};
}
const pure={good,norm,url,number,estimate,members,move,removeHitAt,availability,parseStatus,pageSlice};
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
 "#tc-root{",
 " --tc-ink:#eef3f7;--tc-muted:#94a5b8;--tc-line:rgba(157,184,212,.15);",
 " --tc-accent:#6be2d1;--tc-danger:#fa7b82;--tc-surface:rgba(13,20,34,.78);",
 " color-scheme:dark;position:relative;isolation:isolate;box-sizing:border-box;",
 " width:100%;max-width:660px;min-width:0;margin:0 0 12px;",
 " border:1px solid rgba(129,182,210,.28);border-radius:16px;overflow:hidden;",
 " background:#0a1222;color:var(--tc-ink);font:12px/1.45 \"Segoe UI\",system-ui,Arial,sans-serif;",
 " box-shadow:0 12px 38px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.055)",
 "}",
 "#tc-root::before,#tc-root::after{",
 " content:\"\";position:absolute;z-index:0;pointer-events:none;will-change:transform",
 "}",
 "#tc-root::before{",
 " inset:-40% -25% 22%;background:",
 " radial-gradient(ellipse at 24% 44%,rgba(29,234,195,.38) 0%,rgba(19,148,171,.19) 28%,transparent 64%),",
 " radial-gradient(ellipse at 73% 39%,rgba(98,82,236,.38) 0%,rgba(68,48,156,.17) 31%,transparent 67%),",
 " radial-gradient(ellipse at 50% 80%,rgba(44,140,234,.21),transparent 63%);",
 " filter:blur(30px);opacity:.9;animation:tc-aurora-drift 36s ease-in-out infinite alternate",
 "}",
 "#tc-root::after{",
 " inset:-48% -28% 28%;background:",
 " radial-gradient(ellipse at 32% 56%,rgba(108,238,199,.28),transparent 48%),",
 " radial-gradient(ellipse at 78% 40%,rgba(187,91,250,.25),transparent 54%);",
 " filter:blur(42px);opacity:.58;animation:tc-aurora-rise 44s ease-in-out infinite alternate",
 "}",
 "@keyframes tc-aurora-drift{",
 " 0%{transform:translate3d(-7%,-3%,0) rotate(-4deg)}",
 " 48%{transform:translate3d(6%,5%,0) rotate(7deg)}",
 " 100%{transform:translate3d(-2%,1%,0) rotate(-6deg)}",
 "}",
 "@keyframes tc-aurora-rise{",
 " 0%{transform:translate3d(5%,5%,0) rotate(7deg)}",
 " 50%{transform:translate3d(-4%,-3%,0) rotate(-4deg)}",
 " 100%{transform:translate3d(2%,7%,0) rotate(5deg)}",
 "}",
 "#tc-root.tc-no-aurora::before,#tc-root.tc-no-aurora::after{display:none}",
 "#tc-root>*{position:relative;z-index:1}",
 "#tc-root *{box-sizing:border-box}",
 "#tc-root button,#tc-root input,#tc-root select,#tc-root textarea{font-family:inherit}",
 "#tc-root .tc-head{",
 " display:flex;align-items:center;gap:11px;min-height:68px;padding:10px 14px;",
 " background:linear-gradient(110deg,rgba(9,22,37,.36),rgba(21,22,49,.16));",
 " border-bottom:1px solid rgba(157,204,219,.15)",
 "}",
 "#tc-root .tc-brandlock{display:flex;align-items:center;gap:11px;min-width:0}",
 "#tc-root .tc-mark{",
 " display:grid;place-items:center;flex-shrink:0;width:38px;height:38px;border-radius:12px;",
 " color:#eafff9;font:800 21px/1 \"Segoe UI\",system-ui,sans-serif;letter-spacing:-2px;",
 " border:1px solid rgba(118,241,218,.54);",
 " background:linear-gradient(140deg,rgba(67,215,190,.29),rgba(59,97,188,.28) 56%,rgba(164,86,219,.25));",
 " box-shadow:0 0 19px rgba(61,222,189,.16),inset 0 1px 0 rgba(255,255,255,.12)",
 "}",
 "#tc-root .tc-brand{display:flex;flex-direction:column;gap:3px;min-width:0}",
 "#tc-root .tc-brand .tc-title{font-size:14px;letter-spacing:.095em;font-weight:800;line-height:1.1;white-space:nowrap}",
 "#tc-root .tc-brand .tc-muted{margin:0;font-size:9px;letter-spacing:.16em;font-weight:650;color:#9eb4c8;white-space:nowrap}",
 "#tc-root .tc-count{display:flex;align-items:center;gap:9px;flex-shrink:0}",
 "#tc-root .tc-count-item{display:flex;flex-direction:column;align-items:center;gap:1px;",
 " color:#9fb5c6;font-size:9px;letter-spacing:.095em;text-transform:uppercase;line-height:1.1}",
 "#tc-root .tc-count-item b{color:#e4fff8;font-size:15px;letter-spacing:0;font-weight:750}",
 "#tc-root .tc-count-sep{height:24px;width:1px;background:rgba(167,214,224,.2)}",
 "#tc-root .tc-tabs{display:flex;gap:5px;padding:7px 11px;",
 " background:rgba(8,15,30,.54);border-bottom:1px solid var(--tc-line)}",
 "#tc-root .tc-tab{flex:1;min-width:0;min-height:38px;border:1px solid transparent;border-radius:9px;",
 " background:transparent;color:#8ea4b8;padding:8px 13px;font-size:12px;font-weight:650;",
 " letter-spacing:.015em;cursor:pointer;transition:background .16s,border-color .16s,color .16s}",
 "#tc-root .tc-tab:hover{color:#f5fbff;background:rgba(127,181,222,.11)}",
 "#tc-root .tc-tab.selected{color:#e5fff8;background:linear-gradient(120deg,rgba(32,183,161,.20),rgba(75,93,180,.16));",
 " border-color:rgba(119,234,209,.27);box-shadow:inset 0 1px 0 rgba(197,255,246,.08)}",
 "#tc-root .tc-body{max-height:min(406px,55vh);min-height:0;overflow-y:auto;",
 " overscroll-behavior:contain;padding:14px 15px 16px;",
 " background:linear-gradient(180deg,rgba(10,17,30,.52),rgba(12,17,34,.88) 38%);",
 " scrollbar-width:thin;scrollbar-color:#47716f #101827}",
 "#tc-root .tc-title{font-size:12px;font-weight:720;line-height:1.35;overflow-wrap:anywhere}",
 "#tc-root .tc-muted{font-size:11px;color:var(--tc-muted);line-height:1.42;margin:3px 0}",
 "#tc-root .tc-view-header{display:flex;align-items:center;justify-content:space-between;",
 " flex-wrap:wrap;gap:7px;margin:1px 0 10px}",
 "#tc-root .tc-view-header .tc-title{font-size:17px;letter-spacing:-.02em;font-weight:730}",
 "#tc-root .tc-view-header .tc-muted{font-size:10px;color:#9faebe}",
 "#tc-root .tc-section{font-size:10px;font-weight:750;color:#a5c1d2;letter-spacing:.115em;",
 " text-transform:uppercase;margin:13px 0 7px}",
 "#tc-root .tc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
 "#tc-root .tc-grow{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}",
 "#tc-root .tc-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
 "#tc-root .tc-card{",
 " margin:0 0 7px;padding:11px 12px;",
 " border:1px solid rgba(148,187,210,.14);border-radius:11px;",
 " background:linear-gradient(118deg,rgba(27,42,60,.68),rgba(21,30,52,.58));",
 " box-shadow:inset 0 1px 0 rgba(255,255,255,.025)",
 "}",
 "#tc-root .tc-card.tc-entry:hover{border-color:rgba(112,223,207,.34);",
 " background:linear-gradient(118deg,rgba(29,54,64,.82),rgba(28,38,61,.75))}",
 "#tc-root .tc-card.tc-current{",
 " position:relative;overflow:hidden;border-color:rgba(108,233,201,.33);",
 " padding:13px;margin:0 0 12px;",
 " background:linear-gradient(120deg,rgba(27,87,86,.58),rgba(25,38,70,.72) 64%,rgba(55,40,83,.63));",
 " box-shadow:inset 0 1px 0 rgba(187,255,236,.10),0 4px 18px rgba(0,0,0,.12)",
 "}",
 "#tc-root .tc-card.tc-current::before{content:\"\";position:absolute;left:0;top:12px;bottom:12px;",
 " width:3px;border-radius:0 4px 4px 0;background:#68e3ca;box-shadow:0 0 12px rgba(73,221,189,.5)}",
 "#tc-root .tc-current .tc-title{font-size:13px}",
 "#tc-root .tc-current .tc-section{margin:0 0 7px;color:#8cf1d8}",
 "#tc-root .tc-btn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;",
 " min-height:31px;padding:6px 10px;border-radius:8px;border:1px solid rgba(167,202,228,.20);",
 " color:#d9e7f1;background:rgba(58,75,101,.38);font-weight:650;font-size:11px;line-height:1.2;",
 " text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}",
 "#tc-root .tc-btn:hover{background:rgba(83,114,142,.45);border-color:rgba(185,222,235,.46);color:#fff}",
 "#tc-root .tc-btn.tc-primary{background:linear-gradient(120deg,#35a99d,#287f9e);color:#f7ffff;",
 " border-color:rgba(119,248,228,.42);box-shadow:0 2px 12px rgba(37,197,166,.15)}",
 "#tc-root .tc-btn.tc-primary:hover{background:linear-gradient(120deg,#42c1b2,#328eae)}",
 "#tc-root .tc-btn.tc-soft{background:rgba(38,54,76,.40);color:#b9cbd9}",
 "#tc-root .tc-btn:disabled{opacity:.4;cursor:not-allowed}",
 "#tc-root .tc-btn:focus-visible,#tc-root .tc-tab:focus-visible,#tc-root .tc-input:focus-visible,",
 "#tc-root .tc-switch:focus-within{outline:2px solid #8debd6;outline-offset:2px}",
 "#tc-root .tc-settings-btn{min-width:68px}",
 "#tc-root .tc-toggle{min-width:34px;width:34px;padding:2px;font-size:18px}",
 "#tc-root .tc-input{color-scheme:dark;min-width:0;width:100%;min-height:34px;",
 " background:rgba(9,19,34,.77);color:#f1f7fc;border:1px solid rgba(135,174,202,.30);",
 " border-radius:8px;padding:7px 10px;font-size:12px}",
 "#tc-root .tc-input::placeholder{color:#8197aa}",
 "#tc-root textarea.tc-input{min-height:72px;resize:vertical}",
 "#tc-root .tc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:9px 0}",
 "#tc-root .tc-status{font-size:10px;line-height:1.45;color:#b7c9d3;margin:6px 0 4px;overflow-wrap:anywhere}",
 "#tc-root .tc-status::before{content:\"\";display:inline-block;width:7px;height:7px;",
 " margin:0 7px 1px 0;vertical-align:middle;border-radius:50%;background:#91a4b6;",
 " box-shadow:0 0 0 3px rgba(150,171,191,.06)}",
 "#tc-root .tc-status-unavailable::before{background:#ff8891;box-shadow:0 0 0 3px rgba(255,136,145,.11)}",
 "#tc-root .tc-status-location::before{background:#efc275;box-shadow:0 0 0 3px rgba(239,194,117,.10)}",
 "#tc-root .tc-status-likely::before{background:#74e6b5;box-shadow:0 0 0 3px rgba(116,230,181,.10)}",
 "#tc-root .tc-pager{display:flex;align-items:center;gap:9px;justify-content:space-between;",
 " flex-wrap:wrap;margin:11px 0 3px}",
 "#tc-root .tc-pager .tc-muted{font-variant-numeric:tabular-nums}",
 "#tc-root .tc-notice{border:1px solid rgba(236,185,111,.30);background:rgba(71,57,36,.45);",
 " border-radius:9px;padding:9px 10px;margin:0 0 12px;color:#f2d9a9;font-size:11px}",
 "#tc-root .tc-empty{padding:19px 12px;text-align:center;color:#97adbf;background:rgba(25,37,57,.56);",
 " border:1px dashed rgba(135,178,203,.28);border-radius:10px}",
 "#tc-root .tc-settings{border:1px solid rgba(153,202,213,.18);",
 " background:rgba(24,37,57,.70);padding:13px;border-radius:11px}",
 "#tc-root .tc-settings .tc-title{margin:0 0 9px}",
 "#tc-root .tc-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;",
 " border-radius:10px;padding:12px 13px;background:rgba(26,49,68,.70);",
 " border:1px solid rgba(132,194,204,.19);margin-top:10px}",
 "#tc-root .tc-switch label{cursor:pointer}",
 "#tc-root .tc-switch input{appearance:none;position:relative;width:38px;height:22px;flex-shrink:0;",
 " border-radius:20px;border:1px solid rgba(166,201,219,.35);background:#394c64;",
 " cursor:pointer;transition:background .15s}",
 "#tc-root .tc-switch input:checked{background:#238d82;border-color:#6ddccf}",
 "#tc-root .tc-switch input::after{content:\"\";position:absolute;left:3px;top:3px;width:14px;height:14px;",
 " border-radius:50%;background:#e8f5f7;transition:transform .15s}",
 "#tc-root .tc-switch input:checked::after{transform:translateX(16px)}",
 "#tc-root .tc-roster-row{border-bottom:1px solid var(--tc-line);padding:9px 4px}",
 "#tc-root.tc-collapsed .tc-tabs,#tc-root.tc-collapsed .tc-body,#tc-root.tc-collapsed .tc-foot,",
 "#tc-root.tc-collapsed .tc-settings,#tc-root.tc-collapsed .tc-settings-btn{display:none!important}",
 "#tc-root.tc-collapsed .tc-head{min-height:52px;padding:7px 12px;border-bottom:0}",
 "#tc-root [hidden]{display:none!important}",
 "@media(max-width:570px){",
 " #tc-root{border-radius:12px;max-width:100%}",
 " #tc-root .tc-head{padding:9px 10px;gap:7px;min-height:58px}",
 " #tc-root .tc-mark{width:32px;height:32px;border-radius:10px;font-size:17px}",
 " #tc-root .tc-brandlock{gap:8px}",
 " #tc-root .tc-brand .tc-title{font-size:12px;letter-spacing:.075em}",
 " #tc-root .tc-brand .tc-muted{font-size:8px;letter-spacing:.08em}",
 " #tc-root .tc-count{display:none}",
 " #tc-root .tc-body{max-height:min(365px,53vh);padding:11px}",
 " #tc-root .tc-tab{min-height:42px;padding:8px 6px}",
 " #tc-root .tc-btn{min-height:40px}",
 " #tc-root .tc-input{min-height:42px;font-size:16px}",
 " #tc-root .tc-toggle{min-width:38px;width:38px}",
 " #tc-root .tc-settings-btn{min-width:56px}",
 " #tc-root .tc-card{padding:11px}",
 "}",
 "@media(prefers-reduced-motion:reduce){",
 " #tc-root::before,#tc-root::after{animation:none;will-change:auto;opacity:.32}",
 " #tc-root .tc-btn,#tc-root .tc-tab,#tc-root .tc-switch input,",
 " #tc-root .tc-switch input::after{transition:none}",
 "}"
].join('');
const state={view:'watch',lastView:'watch',watchPage:0,chainPage:0,rosterPage:0,rosterSide:'own',rosterQuery:'',collapsed:store.get('combatCollapsed',true)===true,target:null,player:null,playerError:'',own:'',enemy:'',left:null,right:null,warError:'',loading:false};
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
const statusCache=new Map(),statusQueue=new Map(),STATUS_TTL=90000,STATUS_PAGE_SIZE=5;
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
function conciseStatus(id){
 const entry=statusCache.get(id);
 if(checkingStatusId===id)return 'Checking condition…';
 if(!entry)return key()?'Not checked':'API key required';
 if(entry.error)return 'Status unavailable · refresh to retry';
 const state=entry.state==='Unknown'?'Unconfirmed':entry.state;
 let tail='';
 if(entry.availability==='location')tail=' · location-dependent';
 else if(entry.availability==='likely')tail=' · likely available';
 else if(entry.availability==='unavailable')tail=' · unavailable';
 if(entry.until){
  const sec=entry.until-Math.floor(Date.now()/1000);
  if(sec>0)tail+=' · '+Math.ceil(sec/60)+'m left';
  else tail+=' · refresh status';
 }
 return state+tail;
}
function statusBadge(id){
 const entry=statusCache.get(id);
 return h('div',{class:'tc-status tc-status-'+(entry?entry.availability:'unknown'),
  'data-status-id':id,title:statusLabel(id)},conciseStatus(id));
}
function updateStatusNodes(){
 if(!root)return;
 root.querySelectorAll('[data-status-id]').forEach(el=>{
  const id=el.getAttribute('data-status-id'),entry=statusCache.get(id);
  el.className='tc-status tc-status-'+(entry?entry.availability:'unknown');
  el.textContent=conciseStatus(id);
  el.setAttribute('title',statusLabel(id));
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
let root,body,tabs,collapseBtn,headCounts;
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
 if(!state.collapsed)render();
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
 state.view=state.view==='settings'?(state.lastView||'watch'):'settings';
 renderTabs();render();body.scrollTop=0;
}
function renderSettings(){
 body.append(h('div',{class:'tc-view-header'},title('API settings')));
 const input=h('input',{class:'tc-input',type:'password',maxlength:16,disabled:isPda,
  placeholder:isPda?'Torn PDA key connected':'16-character Torn API key',value:isPda?'':key()});
 const message=muted('');
 const form=h('div',{class:'tc-settings'},title('Your API key'),input,
  muted('Stored on this device; requests go to api.torn.com only.'),
  row(btn('Save key',async()=>{
   if(isPda){showSettings();return}
   const k=input.value.trim();
   if(k&&!/^[a-z0-9]{16}$/i.test(k)){message.textContent='Enter a 16-character API key';return}
   if(k){
    message.textContent='Verifying…';
    try{
     const r=await fetch(API+'key/info?comment=TornToolkit',{headers:{Authorization:'ApiKey '+k}});
     const d=await r.json();
     if(!r.ok||d.error)throw Error(d.error&&d.error.error||'Verification failed');
    }catch(e){message.textContent=String(e.message);return}
    store.set('apiKey',k);
   }else store.del('apiKey');
   location.reload();
  }),btn('Back',showSettings,true)),message);
 body.append(form);
 const auroraToggle=h('input',{
  type:'checkbox',checked:store.get('combatAurora',true)!==false,
  'aria-label':'Enable ambient aurora background',
  onchange:()=>{
   store.set('combatAurora',auroraToggle.checked);
   root.classList.toggle('tc-no-aurora',!auroraToggle.checked);
  }
 });
 body.append(h('label',{class:'tc-switch'},
  h('div',{},title('Aurora ambience'),
   muted('Slow, atmospheric background lighting · respects reduced-motion preferences')),
  auroraToggle));
}
function switchView(view){
 if(!['watch','chain','war'].includes(view))return;
 state.view=view;state.lastView=view;renderTabs();render();body.scrollTop=0;
}
function renderTabs(){
 tabs.replaceChildren(...[['watch','Targets'],['chain','Chain'],['war','War']].map(([id,label])=>
  h('button',{type:'button',role:'tab',class:'tc-tab'+(state.view===id?' selected':''),
   'aria-selected':String(state.view===id),onclick:()=>switchView(id)},label)));
}
function render(){
 const previousScroll=body.scrollTop;
 body.replaceChildren();
 if(headCounts)headCounts.replaceChildren(
  h('span',{class:'tc-count-item'},h('b',{},watchlist().length),'Targets'),
  h('span',{class:'tc-count-sep','aria-hidden':'true'}),
  h('span',{class:'tc-count-item'},h('b',{},chain().length),'Queued'));
 if(!key()&&state.view!=='settings')
  body.append(h('div',{class:'tc-notice'},'Add your API key in Settings to load player conditions and rosters.'));
 if(state.view==='watch')renderWatchPage();
 else if(state.view==='chain')renderChain();
 else if(state.view==='war')renderWar();
 else renderSettings();
 body.scrollTop=previousScroll;
}
function renderWatchPage(){
 if(state.target){
  const p=state.player&&state.player.profile||{},ps=state.player&&state.player.personalstats||{};
  const est=state.player?estimate(p,ps):null,name=String(p.name||'Player '+state.target);
  body.append(h('div',{class:'tc-card tc-current'},
   row(main(title(name+' ['+state.target+']'),
    muted(est?'Estimated stats: '+est.label+' · '+est.confidence+' confidence':
     state.playerError||'Checking public stats…')),
    h('div',{class:'tc-actions'},attack(state.target),
     btn(watchlist().some(x=>x.id===state.target)?'Saved':'+ Watch',
      ()=>{addWatch(state.target,name);render()},true)))));
 }
 renderWatch();
}
function renderWatch(){
 body.append(h('div',{class:'tc-view-header'},title('Target watchlist'),
  muted(watchlist().length+' saved · statuses checked when viewed')));
 const id=h('input',{class:'tc-input',placeholder:'Add Torn player ID',inputmode:'numeric',maxlength:10}),message=muted('');
 body.append(row(main(id),btn('Add target',()=>{
  if(addWatch(id.value)){state.watchPage=0;render();body.scrollTop=0}
  else message.textContent='Enter a valid numeric player ID';
 })),message);
 const search=h('input',{class:'tc-input',placeholder:'Find name or ID'});
 const group=h('select',{class:'tc-input'},...['All','General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g},g)));
 const list=h('div'),pager=h('div',{class:'tc-pager'}),summary=muted('');
 let visibleIds=[];
 body.append(h('div',{class:'tc-grid'},search,group),
  row(btn('Refresh conditions',()=>enqueueStatuses(visibleIds,true),true),summary),
  list,pager);
 const paint=()=>{
  const q=search.value.toLowerCase(),filtered=watchlist().filter(x=>
   (group.value==='All'||x.group===group.value)&&(x.name.toLowerCase().includes(q)||x.id.includes(q)));
  const page=pageSlice(filtered,state.watchPage,STATUS_PAGE_SIZE);
  state.watchPage=page.page;
  visibleIds=page.items.map(x=>x.id);
  summary.textContent=filtered.length+' result'+(filtered.length===1?'':'s')+' · API snapshots';
  list.replaceChildren(...page.items.map(x=>{
   const editor=h('div',{hidden:true}),category=h('select',{class:'tc-input'},
    ...['General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g,selected:g===x.group},g)));
   const note=h('textarea',{class:'tc-input',rows:2,maxlength:200});note.value=x.note;
   editor.append(h('div',{class:'tc-grid'},category,note),
    row(btn('Save',()=>{const all=watchlist(),current=all.find(t=>t.id===x.id);
     if(current){current.group=category.value;current.note=note.value.slice(0,200);saveWatch(all)}render()}),
    btn('Cancel',()=>{editor.hidden=true},true)));
   const entry=card(row(main(title(x.name+' ['+x.id+']'),statusBadge(x.id),
     muted(x.group+(x.note?' · '+x.note:''))),
    h('div',{class:'tc-actions'},attack(x.id),
     btn('+ Chain',()=>{saveChain([...chain(),x.id]);state.chainPage=0;switchView('chain')},true),
     btn('Edit',()=>{editor.hidden=!editor.hidden},true),
     btn('Remove',()=>{saveWatch(watchlist().filter(t=>t.id!==x.id));render()},true))),editor);
   entry.classList.add('tc-entry');
   return entry;
  }));
  if(!filtered.length)list.append(h('div',{class:'tc-empty'},'No targets found.'));
  pager.hidden=page.pages===1;
  pager.replaceChildren(
   btn('← Prev',()=>{state.watchPage--;paint()},true),
   muted((page.page+1)+' / '+page.pages),
   btn('Next →',()=>{state.watchPage++;paint()},true));
  pager.querySelectorAll('button')[0].disabled=page.page===0;
  pager.querySelectorAll('button')[1].disabled=page.page===page.pages-1;
  enqueueStatuses(visibleIds);
 };
 search.addEventListener('input',()=>{state.watchPage=0;paint()});
 group.addEventListener('change',()=>{state.watchPage=0;paint()});
 paint();
}
function renderChain(){
 const items=chain(),nameOf=target=>watchlist().find(x=>x.id===target)?.name||'Player '+target;
 body.append(h('div',{class:'tc-view-header'},title('Solo chain'),
  muted(items.length+' queued · manual attacks only')));
 if(items.length){
  const current=items[0];
  body.append(h('div',{class:'tc-card tc-current'},
   h('div',{class:'tc-section'},'CURRENT TARGET · #1'),
   row(main(title(nameOf(current)+' ['+current+']'),statusBadge(current)),
    h('div',{class:'tc-actions'},attack(current),
     btn('Skip target',()=>{saveChain(removeHitAt(chain(),0));state.chainPage=0;render();body.scrollTop=0},true))),
   muted('Skip removes this hit only; the watchlist stays intact.')));
 }else body.append(h('div',{class:'tc-empty'},'No hits queued. Add a player ID below or choose + Chain from Targets.'));
 const id=h('input',{class:'tc-input',placeholder:'Queue player ID',inputmode:'numeric',maxlength:10}),error=muted('');
 body.append(row(main(id),btn('Queue hit',()=>{
  if(!good(id.value)){error.textContent='Enter a valid player ID';return}
  saveChain([...chain(),norm(id.value)]);render();body.scrollTop=0;
 })),error);
 if(!items.length)return;
 const rest=items.slice(1),page=pageSlice(rest,state.chainPage,4);
 state.chainPage=page.page;
 const visibleIds=[items[0],...page.items],list=h('div');
 if(rest.length)body.append(h('div',{class:'tc-section'},'UPCOMING HITS'));
 page.items.forEach((target,j)=>{
  const index=page.start+j+1;
  const entry=card(row(muted('#'+(index+1)),
   main(title(nameOf(target)+' ['+target+']'),statusBadge(target)),
   h('div',{class:'tc-actions'},attack(target),
    btn('↑',()=>{saveChain(move(chain(),index,-1));render()},true),
    btn('↓',()=>{saveChain(move(chain(),index,1));render()},true),
    btn('Remove',()=>{saveChain(removeHitAt(chain(),index));render()},true))));
  entry.classList.add('tc-entry');list.append(entry);
 });
 body.append(list);
 if(page.pages>1){
  const pager=h('div',{class:'tc-pager'},
   btn('← Prev',()=>{state.chainPage--;render();body.scrollTop=0},true),
   muted('Upcoming '+(page.page+1)+' / '+page.pages),
   btn('Next →',()=>{state.chainPage++;render();body.scrollTop=0},true));
  pager.querySelectorAll('button')[0].disabled=page.page===0;
  pager.querySelectorAll('button')[1].disabled=page.page===page.pages-1;
  body.append(pager);
 }
 body.append(row(btn('Refresh conditions',()=>enqueueStatuses(visibleIds,true),true),
  btn('Clear chain',()=>{if(confirm('Clear your solo chain list?')){saveChain([]);state.chainPage=0;render()}},true)));
 enqueueStatuses(visibleIds);
}
function renderWar(){
 body.append(h('div',{class:'tc-view-header'},title('Faction rosters'),muted('Read-only · manual actions')));
 const own=h('input',{class:'tc-input',placeholder:'Your faction ID',inputmode:'numeric',value:state.own});
 const enemy=h('input',{class:'tc-input',placeholder:'Enemy faction ID',inputmode:'numeric',value:state.enemy});
 body.append(h('div',{class:'tc-grid'},own,enemy),
  btn(state.loading?'Loading…':'Load factions',async()=>{
   if(state.loading)return;
   if(!good(own.value)||!good(enemy.value)){state.warError='Enter valid IDs for both factions';render();return}
   state.own=norm(own.value);state.enemy=norm(enemy.value);state.loading=true;
   state.warError='';state.left=null;state.right=null;
   state.rosterSide='own';state.rosterPage=0;state.rosterQuery='';render();
   try{
    const both=await Promise.all([
     api('faction/'+state.own+'/members',{},300),
     api('faction/'+state.enemy+'/members',{},300)
    ]);
    state.left=members(both[0]);state.right=members(both[1]);
   }catch(e){state.warError=String(e.message)}
   finally{state.loading=false;if(state.view==='war')render()}
  }));
 if(state.loading)body.append(muted('Loading official Torn faction data…'));
 if(state.warError)body.append(h('div',{class:'tc-notice'},state.warError));
 if(state.left&&state.right){
  const selectors=h('div',{class:'tc-tabs'},...[
   ['own','Your faction ('+state.left.length+')'],
   ['enemy','Enemy ('+state.right.length+')']
  ].map(([side,label])=>h('button',{type:'button',
   class:'tc-tab'+(state.rosterSide===side?' selected':''),
   onclick:()=>{
    state.rosterSide=side;state.rosterPage=0;state.rosterQuery='';search.value='';paint();
   }},label)));
  const search=h('input',{class:'tc-input',placeholder:'Search roster by name or ID',value:state.rosterQuery});
  const list=h('div'),pager=h('div',{class:'tc-pager'}),total=muted('');
  body.append(selectors,search,total,list,pager);
  const paint=()=>{
   const buttons=selectors.querySelectorAll('button');
   buttons[0].classList.toggle('selected',state.rosterSide==='own');
   buttons[1].classList.toggle('selected',state.rosterSide==='enemy');
   const all=state.rosterSide==='own'?state.left:state.right;
   const q=state.rosterQuery.trim().toLowerCase();
   const filtered=all.filter(p=>p.name.toLowerCase().includes(q)||p.id.includes(q));
   const page=pageSlice(filtered,state.rosterPage,5);
   state.rosterPage=page.page;
   total.textContent=filtered.length+' member'+(filtered.length===1?'':'s')+' · page '+(page.page+1)+' of '+page.pages;
   list.replaceChildren(...page.items.map(p=>
    h('div',{class:'tc-roster-row'},
     row(main(title(p.name+' ['+p.id+']'),muted('Level '+p.level+' · '+p.status)),attack(p.id)))));
   if(!filtered.length)list.append(h('div',{class:'tc-empty'},'No matching faction members.'));
   pager.hidden=page.pages===1;
   pager.replaceChildren(
    btn('← Prev',()=>{state.rosterPage--;paint()},true),
    muted((page.page+1)+' / '+page.pages),
    btn('Next →',()=>{state.rosterPage++;paint()},true));
   pager.querySelectorAll('button')[0].disabled=page.page===0;
   pager.querySelectorAll('button')[1].disabled=page.page===page.pages-1;
  };
  search.addEventListener('input',()=>{state.rosterQuery=search.value;state.rosterPage=0;paint()});
  paint();
 }
 body.append(muted('Roster data is public API information, not verified battle stats. Shared war planning is not enabled.'));
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
 if(state.view==='watch'&&state.target===id)render();
}
function boot(){
 if(document.getElementById('tc-root'))return;
 document.head.append(h('style',{id:'tc-style'},css));
 tabs=h('div',{id:'tc-tabs',class:'tc-tabs',role:'tablist'});body=h('div',{id:'tc-body',class:'tc-body'});
 collapseBtn=btn('▴',toggleCollapsed,true);
 collapseBtn.classList.add('tc-toggle');
 collapseBtn.setAttribute('aria-controls','tc-tabs tc-body');
 headCounts=h('span',{class:'tc-count'},'');
 root=h('section',{id:'tc-root','aria-label':'Torn Toolkit Combat Edition'},
  h('div',{class:'tc-head'},
   h('div',{class:'tc-brandlock'},
    h('span',{class:'tc-mark','aria-hidden':'true'},'T'),
    h('div',{class:'tc-brand'},title('TORN TOOLKIT'),muted('COMBAT INTELLIGENCE · '+VER))),
   h('span',{style:'flex:1'}),headCounts,
   h('button',{type:'button',class:'tc-btn tc-soft tc-settings-btn',onclick:showSettings},'Settings'),
   collapseBtn),
  tabs,body);
 root.classList.toggle('tc-no-aurora',store.get('combatAurora',true)===false);
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