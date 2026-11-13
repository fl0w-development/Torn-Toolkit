// ==UserScript==
// @name         Torn Toolkit — Combat Edition
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      0.8.7
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
const VER='0.8.7',API='https://api.torn.com/v2/',PDA='###PDA-APIKEY###';
const isPda=!PDA.includes('#'),hasGM=typeof GM_getValue==='function'&&typeof GM_setValue==='function';
// BOOT-DIAGNOSTIC-START
// Pure DOM diagnostic: never reads, changes or deletes user storage.
function tcBootError(error,stage){
 try{
  const doc=document,host=doc.body||doc.documentElement;if(!host)return;
  let bar=doc.getElementById('tc-boot-error');
  if(!bar){bar=doc.createElement('div');bar.id='tc-boot-error';host.appendChild(bar)}
  bar.setAttribute('role','alert');
  bar.style.cssText='position:fixed!important;top:72px!important;left:8px!important;right:8px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;background:#621d26!important;color:#fff!important;border:2px solid #ff8e8e!important;padding:12px!important;font:12px/1.5 Arial,sans-serif!important;white-space:normal!important;max-height:45vh!important;overflow:auto!important';
  bar.textContent='Torn Toolkit '+VER+' startup error ('+stage+'): '+String(error&&error.message||error).slice(0,300);
 }catch(_){}
}
function tcBootMarker(){
 try{
  if(document.getElementById('tc-boot-marker'))return;
  const host=document.body||document.documentElement;if(!host)return;
  const bar=document.createElement('div');bar.id='tc-boot-marker';
  bar.style.cssText='position:fixed!important;top:72px!important;right:8px!important;z-index:2147483646!important;background:#172f37!important;color:#fff!important;border:1px solid #7adccc!important;padding:6px 9px!important;font:11px Arial,sans-serif!important';
  bar.textContent='Torn Toolkit '+VER+' starting…';host.appendChild(bar);
 }catch(_){}
}
function tcBootComplete(){
 try{const el=document.getElementById('tc-boot-marker');if(el)el.remove()}catch(_){}
}
// BOOT-DIAGNOSTIC-END
try{
tcBootMarker();
const store={
 get(k,f){try{if(hasGM)return GM_getValue(k,f);const v=localStorage.getItem('tt_'+k);return v==null?f:JSON.parse(v)}catch(_){return f}},
 set(k,v){try{if(hasGM)GM_setValue(k,v);else localStorage.setItem('tt_'+k,JSON.stringify(v))}catch(_){}},
 del(k){try{if(hasGM&&typeof GM_deleteValue==='function')GM_deleteValue(k);else localStorage.removeItem('tt_'+k)}catch(_){}}
};
const key=()=>isPda?PDA:store.get('apiKey','');
const good=id=>/^\d{1,10}$/.test(String(id).trim())&&Number(id)>0;
const norm=id=>String(Number(id));
const url=id=>'https://www.torn.com/page.php?sid=attack&user2ID='+encodeURIComponent(id);
const CONTACT={name:'fl0ww_',id:'4605130'};
const contactLink=()=>h('a',{href:'https://www.torn.com/profiles.php?XID='+CONTACT.id},CONTACT.name+' ['+CONTACT.id+']');
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
function encodeFactionOrder(fid,author,createdAt,ids){
 if(!good(fid)||!good(author)||!Number.isInteger(createdAt)||createdAt<1600000000||
    !Array.isArray(ids)||ids.length>150||!ids.every(good))throw Error('Invalid faction chain details');
 return 'TTFC1|'+norm(fid)+'|'+norm(author)+'|'+createdAt+'|'+ids.map(norm).join(',');
}
function decodeFactionOrder(raw){
 const code=String(raw||'').trim(),parts=code.split('|');
 if(code.length>1900||parts.length!==5||parts[0]!=='TTFC1'||!good(parts[1])||!good(parts[2])||
    !/^\d{10}$/.test(parts[3]))throw Error('Invalid leader order code.');
 const ids=parts[4]?parts[4].split(','):[];
 if(ids.length>150||!ids.every(good))throw Error('Chain code contains invalid player IDs.');
 return {factionId:norm(parts[1]),authorId:norm(parts[2]),createdAt:Number(parts[3]),entries:ids.map(norm)};
}
const pure={good,norm,url,number,estimate,members,move,removeHitAt,availability,parseStatus,pageSlice,encodeFactionOrder,decodeFactionOrder};
// Only bypass the browser UI when running Node's pure-function tests.
// A web page or injected runtime can expose a global `module` object.
if(typeof document==='undefined'&&typeof module!=='undefined'&&module.exports){module.exports=pure;return}
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
// Tap-twice confirmation instead of window.confirm(): in-app browsers (e.g. Torn PDA) may never show native dialogs.
function confirmBtn(t,cb,secondary=false,needed=()=>true){
 let armed=false,timer=0;
 const b=btn(t,()=>{
  if(!needed()||armed){clearTimeout(timer);cb();return}
  armed=true;b.textContent='Tap again to confirm';b.classList.add('tc-confirm');
  timer=setTimeout(()=>{armed=false;b.textContent=t;b.classList.remove('tc-confirm')},4000);
 },secondary);
 return b;
}
const attack=id=>h('a',{class:'tc-btn tc-primary',href:url(id),title:'Open attack page; you initiate the attack'},'Attack');
const muted=t=>h('div',{class:'tc-muted'},t);
const card=(...kids)=>h('div',{class:'tc-card'},...kids);
const row=(...kids)=>h('div',{class:'tc-row'},...kids);
const main=(...kids)=>h('div',{class:'tc-grow'},...kids);
const title=t=>h('div',{class:'tc-title'},t);
const css=[
 "#tc-root{",
 " --tc-ink:#e8ecf2;--tc-muted:#8c97a8;--tc-line:rgba(232,236,242,.09);",
 " --tc-accent:#8ef0c8;--tc-danger:#ff8a8a;--tc-surface:rgba(4,7,14,.55);",
 " --tc-serif:Georgia,\"Iowan Old Style\",\"Palatino Linotype\",\"Noto Serif\",serif;",
 " --tc-mono:ui-monospace,\"SF Mono\",Menlo,Consolas,\"Roboto Mono\",monospace;",
 " color-scheme:dark;position:relative;isolation:isolate;box-sizing:border-box;",
 " width:100%;max-width:660px;min-width:0;margin:0 0 12px;",
 " border:1px solid rgba(232,236,242,.14);border-radius:4px;overflow:hidden;",
 " background-color:#060a13;color:var(--tc-ink);font:12.5px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;",
 /* a faint, fixed star field under the aurora */
 "}",
 "#tc-root::before,#tc-root::after{",
 " content:\"\";position:absolute;z-index:0;pointer-events:none;will-change:transform",
 "}",
 "#tc-root::before{",
 " inset:-40% -25% 22%;background:",
 " radial-gradient(ellipse at 24% 44%,rgba(29,234,195,.40) 0%,rgba(19,148,171,.19) 28%,transparent 64%),",
 " radial-gradient(ellipse at 73% 39%,rgba(98,82,236,.40) 0%,rgba(68,48,156,.17) 31%,transparent 67%),",
 " radial-gradient(ellipse at 50% 80%,rgba(44,140,234,.22),transparent 63%);",
 " filter:blur(30px);opacity:.9;animation:tc-aurora-drift 36s ease-in-out infinite alternate",
 "}",
 "#tc-root::after{",
 " inset:-48% -28% 28%;background:",
 " radial-gradient(ellipse at 32% 56%,rgba(108,238,199,.30),transparent 48%),",
 " radial-gradient(ellipse at 78% 40%,rgba(187,91,250,.27),transparent 54%);",
 " filter:blur(42px);opacity:.6;animation:tc-aurora-rise 44s ease-in-out infinite alternate",
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
 /* Star field: two twinkling layers plus a rare shooting star */
 "#tc-root>.tc-stars{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;",
 " background-image:radial-gradient(1px 1px at 12% 18%,rgba(255,255,255,.75),transparent 60%),",
 " radial-gradient(1px 1px at 63% 9%,rgba(255,255,255,.6),transparent 60%),",
 " radial-gradient(1.5px 1.5px at 84% 31%,rgba(255,255,255,.55),transparent 60%),",
 " radial-gradient(1px 1px at 37% 42%,rgba(255,255,255,.45),transparent 60%),",
 " radial-gradient(1px 1px at 92% 74%,rgba(255,255,255,.4),transparent 60%),",
 " radial-gradient(1px 1px at 22% 81%,rgba(255,255,255,.4),transparent 60%);",
 " animation:tc-twinkle 5.5s ease-in-out infinite alternate}",
 "#tc-root>.tc-stars::before{content:\"\";position:absolute;inset:0;",
 " background-image:radial-gradient(1px 1px at 46% 24%,rgba(255,255,255,.7),transparent 60%),",
 " radial-gradient(1.5px 1.5px at 74% 57%,rgba(255,255,255,.5),transparent 60%),",
 " radial-gradient(1px 1px at 8% 52%,rgba(255,255,255,.45),transparent 60%),",
 " radial-gradient(1px 1px at 57% 88%,rgba(255,255,255,.35),transparent 60%),",
 " radial-gradient(1px 1px at 29% 6%,rgba(255,255,255,.5),transparent 60%);",
 " animation:tc-twinkle 4.2s ease-in-out 1.7s infinite alternate-reverse}",
 "#tc-root>.tc-stars::after{content:\"\";position:absolute;top:14%;left:-12%;width:110px;height:1px;opacity:0;",
 " background:linear-gradient(90deg,transparent,rgba(255,255,255,.95));",
 " transform:rotate(16deg) translateX(0);animation:tc-shoot 17s linear 6s infinite}",
 "@keyframes tc-twinkle{0%{opacity:.35}100%{opacity:1}}",
 "@keyframes tc-shoot{",
 " 0%{opacity:0;transform:rotate(16deg) translateX(0)}",
 " 1%{opacity:1}",
 " 5%{opacity:0;transform:rotate(16deg) translateX(760px)}",
 " 100%{opacity:0;transform:rotate(16deg) translateX(760px)}",
 "}",
 "#tc-root.tc-no-aurora>.tc-stars{display:none}",
 "#tc-root>*{position:relative;z-index:1}",
 "#tc-root *{box-sizing:border-box}",
 "#tc-root button,#tc-root input,#tc-root select,#tc-root textarea{font-family:inherit}",
 /* Masthead: a serif wordmark, no logo tile, no dashboard counters */
 "#tc-root .tc-head{display:flex;align-items:center;gap:14px;min-height:54px;padding:10px 12px 10px 16px;",
 " border-bottom:1px solid var(--tc-line)}",
 "#tc-root .tc-brandlock{display:flex;align-items:center;min-width:0}",
 "#tc-root .tc-mark{display:none}",
 "#tc-root .tc-brand{display:flex;align-items:baseline;gap:10px;min-width:0}",
 "#tc-root .tc-brand .tc-title{font:italic 400 21px/1 var(--tc-serif);letter-spacing:-.01em;white-space:nowrap}",
 "#tc-root .tc-brand .tc-muted{margin:0;font:11px var(--tc-mono);color:var(--tc-muted);white-space:nowrap}",
 "#tc-root .tc-count{display:flex;align-items:baseline;gap:12px;margin-left:auto;flex-shrink:0;",
 " font:11px var(--tc-mono);color:var(--tc-muted)}",
 "#tc-root .tc-count-item{display:flex;align-items:baseline;gap:5px;text-transform:lowercase}",
 "#tc-root .tc-count-item b{color:var(--tc-accent);font-weight:500}",
 "#tc-root .tc-count-sep{display:none}",
 /* Tabs: plain words with an aurora underline */
 "#tc-root .tc-tabs{display:flex;gap:22px;padding:0 16px;border-bottom:1px solid var(--tc-line);overflow-x:auto;scrollbar-width:none}",
 "#tc-root .tc-tab{flex:0 0 auto;min-height:38px;border:0;border-radius:0;background:none;color:var(--tc-muted);",
 " padding:10px 0 9px;font-size:12.5px;font-weight:500;cursor:pointer;position:relative;white-space:nowrap}",
 "#tc-root .tc-tab:hover{color:var(--tc-ink)}",
 "#tc-root .tc-tab.selected{color:var(--tc-ink)}",
 "#tc-root .tc-tab.selected::after{content:\"\";position:absolute;left:0;right:0;bottom:-1px;height:2px;",
 " background:linear-gradient(90deg,#4ff0c0,#7b8cff,#c77dff)}",
 /* Body */
 "#tc-root .tc-body{max-height:min(406px,55vh);min-height:0;overflow-y:auto;overscroll-behavior:contain;",
 " padding:14px 16px 16px;background:linear-gradient(180deg,rgba(6,10,19,.12),rgba(6,10,19,.48) 45%);",
 " scrollbar-width:thin;scrollbar-color:rgba(142,240,200,.35) transparent}",
 "#tc-root .tc-title{font-size:13px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}",
 "#tc-root .tc-muted{font-size:11.5px;color:var(--tc-muted);line-height:1.45;margin:2px 0}",
 "#tc-root .tc-view-header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:0 0 12px}",
 "#tc-root .tc-view-header .tc-title{font:italic 400 19px/1.15 var(--tc-serif);letter-spacing:-.01em}",
 "#tc-root .tc-view-header .tc-muted{font:11px var(--tc-mono)}",
 /* Section labels: lowercase mono with a hairline running to the edge */
 "#tc-root .tc-section{display:flex;align-items:center;gap:10px;margin:16px 0 4px;",
 " font:11px var(--tc-mono);color:var(--tc-muted);text-transform:lowercase}",
 "#tc-root .tc-section::after{content:\"\";flex:1;height:1px;background:var(--tc-line)}",
 "#tc-root .tc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
 "#tc-root .tc-grow{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}",
 "#tc-root .tc-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
 /* Rows, not cards */
 "#tc-root .tc-card{margin:0;padding:10px 0;border:0;border-bottom:1px solid var(--tc-line);border-radius:0;background:none}",
 "#tc-root .tc-card.tc-entry:hover{background:linear-gradient(90deg,rgba(142,240,200,.06),transparent 70%)}",
 "#tc-root .tc-card>.tc-row>.tc-muted:first-child{min-width:26px;font:15px var(--tc-mono);color:rgba(232,236,242,.35)}",
 /* The current target reads like a headline */
 "#tc-root .tc-card.tc-current{position:relative;margin:0 0 6px;padding:4px 0 14px 14px;border-bottom:1px solid var(--tc-line)}",
 "#tc-root .tc-card.tc-current::before{content:\"\";position:absolute;left:0;top:6px;bottom:16px;width:2px;",
 " background:linear-gradient(180deg,#4ff0c0,#7b8cff,#c77dff)}",
 "#tc-root .tc-current .tc-title{font:italic 400 22px/1.15 var(--tc-serif)}",
 "#tc-root .tc-current .tc-section{margin:0 0 4px;color:var(--tc-accent)}",
 "#tc-root .tc-current .tc-section::after{display:none}",
 /* Buttons: hairline rectangles; Attack is a solid aurora-green block */
 "#tc-root .tc-btn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;",
 " min-height:28px;padding:5px 11px;border-radius:2px;border:1px solid rgba(232,236,242,.22);",
 " color:var(--tc-ink);background:transparent;font-size:12px;font-weight:500;line-height:1.2;",
 " text-decoration:none;white-space:nowrap;cursor:pointer;transition:border-color .15s,background .15s,color .15s}",
 "#tc-root .tc-btn:hover{border-color:rgba(232,236,242,.55);background:rgba(232,236,242,.05)}",
 "#tc-root .tc-btn.tc-primary{background:var(--tc-accent);border-color:var(--tc-accent);color:#04120c;font-weight:650}",
 "#tc-root .tc-btn.tc-primary:hover{background:#b6f8dd;border-color:#b6f8dd}",
 "#tc-root .tc-btn.tc-soft{color:#c2cad6;border-color:rgba(232,236,242,.15)}",
 "#tc-root .tc-btn:disabled{opacity:.4;cursor:not-allowed}",
 "#tc-root .tc-btn:focus-visible,#tc-root .tc-tab:focus-visible,#tc-root .tc-input:focus-visible,",
 "#tc-root .tc-switch:focus-within{outline:2px solid var(--tc-accent);outline-offset:2px}",
 "#tc-root .tc-settings-btn{min-width:0}",
 "#tc-root .tc-toggle{min-width:30px;width:30px;padding:2px;font-size:13px}",
 /* Fields: underlined, not boxed */
 "#tc-root .tc-input{min-width:0;width:100%;min-height:32px;background:transparent;color:var(--tc-ink);",
 " border:0;border-bottom:1px solid rgba(232,236,242,.28);border-radius:0;padding:6px 2px;font-size:12.5px}",
 "#tc-root .tc-input:focus{border-bottom-color:var(--tc-accent)}",
 "#tc-root .tc-input::placeholder{color:#6f7a8c}",
 "#tc-root select.tc-input{background:transparent}",
 "#tc-root select.tc-input option{background:#0b1220;color:var(--tc-ink)}",
 "#tc-root textarea.tc-input{min-height:68px;resize:vertical;border:1px solid rgba(232,236,242,.22);border-radius:2px;padding:7px 8px}",
 "#tc-root .tc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}",
 /* Status: small mono text with a plain dot */
 "#tc-root .tc-status{font:11px var(--tc-mono);line-height:1.45;color:var(--tc-muted);margin:3px 0;overflow-wrap:anywhere}",
 "#tc-root .tc-status::before{content:\"\";display:inline-block;width:6px;height:6px;margin:0 7px 1px 0;",
 " vertical-align:middle;border-radius:50%;background:#7d8796}",
 "#tc-root .tc-status-unavailable::before{background:var(--tc-danger)}",
 "#tc-root .tc-status-location::before{background:#f2c46d}",
 "#tc-root .tc-status-likely::before{background:var(--tc-accent)}",
 "#tc-root .tc-pager{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;margin:12px 0 2px}",
 "#tc-root .tc-pager .tc-muted{font:11px var(--tc-mono)}",
 "#tc-root .tc-notice{border-left:2px solid #f2c46d;padding:4px 0 4px 10px;margin:0 0 12px;color:#f5dcaa;font-size:12px}",
 "#tc-root .tc-empty{padding:16px 0;color:var(--tc-muted);font:italic 14px var(--tc-serif);border-bottom:1px solid var(--tc-line)}",
 /* Settings */
 "#tc-root .tc-settings{border-top:1px solid var(--tc-line);padding:12px 0 0}",
 "#tc-root .tc-settings .tc-title{margin:0 0 9px}",
 "#tc-root .tc-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;",
 " padding:10px 0;border-bottom:1px solid var(--tc-line);margin-top:4px}",
 "#tc-root .tc-switch label{cursor:pointer}",
 "#tc-root .tc-switch input{appearance:none;position:relative;width:34px;height:18px;flex-shrink:0;margin:0;",
 " border-radius:2px;border:1px solid rgba(232,236,242,.3);background:transparent;cursor:pointer;transition:background .15s}",
 "#tc-root .tc-switch input:checked{background:var(--tc-accent);border-color:var(--tc-accent)}",
 "#tc-root .tc-switch input::after{content:\"\";position:absolute;left:2px;top:2px;width:12px;height:12px;",
 " border-radius:1px;background:#c2cad6;transition:transform .15s}",
 "#tc-root .tc-switch input:checked::after{transform:translateX(16px);background:#04120c}",
 "#tc-root .tc-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:7px 16px;",
 " border-top:1px solid var(--tc-line);font:11px var(--tc-mono);color:var(--tc-muted);background:rgba(6,10,19,.5)}",
 "#tc-root .tc-foot a,#tc-root .tc-contact a{color:var(--tc-accent);text-decoration:none}",
 "#tc-root .tc-foot a:hover,#tc-root .tc-contact a:hover{text-decoration:underline}",
 "#tc-root .tc-roster-row{border-bottom:1px solid var(--tc-line);padding:9px 0}",
 "#tc-root.tc-collapsed .tc-tabs,#tc-root.tc-collapsed .tc-body,#tc-root.tc-collapsed .tc-foot,",
 "#tc-root.tc-collapsed .tc-settings,#tc-root.tc-collapsed .tc-settings-btn{display:none!important}",
 "#tc-root.tc-collapsed .tc-head{border-bottom:0}",
 "#tc-root [hidden]{display:none!important}",
 "@media(max-width:570px){",
 " #tc-root{max-width:100%}",
 " #tc-root .tc-head{padding:8px 8px 8px 12px;gap:10px;min-height:52px}",
 " #tc-root .tc-brand .tc-title{font-size:19px}",
 " #tc-root .tc-brand .tc-muted,#tc-root .tc-count{display:none}",
 " #tc-root .tc-body{max-height:min(365px,53vh);padding:12px}",
 " #tc-root .tc-tabs{gap:18px;padding:0 12px}",
 " #tc-root .tc-tab{min-height:42px}",
 " #tc-root .tc-btn{min-height:40px}",
 " #tc-root .tc-input{min-height:42px;font-size:16px}",
 " #tc-root .tc-toggle{min-width:38px;width:38px}",
 "}",
 "@media(pointer:coarse){",
 " #tc-root .tc-tab{min-height:42px}",
 " #tc-root .tc-btn{min-height:40px}",
 " #tc-root .tc-input{min-height:42px;font-size:16px}",
 " #tc-root .tc-toggle{min-width:38px;width:38px}",
 "}",
 "#tc-root .tc-btn.tc-confirm{border-color:#f2c46d;color:#f5dcaa;background:rgba(242,196,109,.08)}",
 "@media(prefers-reduced-motion:reduce){",
 " #tc-root::before,#tc-root::after{animation:none;will-change:auto;opacity:.32}",
 " #tc-root>.tc-stars,#tc-root>.tc-stars::before{animation:none}",
 " #tc-root>.tc-stars::after{display:none}",
 " #tc-root .tc-btn,#tc-root .tc-tab,#tc-root .tc-switch input,",
 " #tc-root .tc-switch input::after{transition:none}",
 "}"
].join('');
const state={view:'watch',lastView:'watch',watchPage:0,chainPage:0,factionPage:0,rosterPage:0,rosterSide:'own',rosterQuery:'',collapsed:store.get('combatCollapsed',true)===true,target:null,player:null,playerError:'',own:'',enemy:'',left:null,right:null,warError:'',loading:false};
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
// Serverless sharing: the Torn API verifies identity and membership, but does NOT
// store toolkit plans. Leaders share a code manually; members import a local copy.
const factionState={identity:null,loading:false,error:'',draft:null,shareCode:''};
function savedFactionPlan(){
 if(!factionState.identity)return null;
 const stored=store.get('combatFactionOrder_'+factionState.identity.factionId,null);
 if(!stored||stored.factionId!==factionState.identity.factionId||
    !Array.isArray(stored.entries)||stored.entries.length>150||
    !stored.entries.every(good))return null;
 return stored;
}
async function verifyFaction(){
 if(factionState.loading||!key())return;
 factionState.loading=true;factionState.error='';if(state.view==='faction')render();
 try{
  const info=await api('key/info',{},300);
  const owner=info&&info.info&&info.info.user||{};
  if(!good(owner.id)||!good(owner.faction_id))throw Error('Torn did not return your faction membership.');
  const factionId=norm(owner.faction_id),memberId=norm(owner.id);
  const [basicResult,memberResult]=await Promise.all([
   api('faction/'+factionId+'/basic',{},300),
   api('faction/'+factionId+'/members',{},300)
  ]);
  const basic=basicResult&&basicResult.basic||{},membersList=members(memberResult);
  if(norm(basic.id)!==factionId||!membersList.some(x=>x.id===memberId))
   throw Error('Torn did not confirm your faction membership.');
  factionState.identity={
   factionId,memberId,leaderId:good(basic.leader_id)?norm(basic.leader_id):null,
   coLeaderId:good(basic.co_leader_id)?norm(basic.co_leader_id):null,
   editor:memberId===norm(basic.leader_id)||good(basic.co_leader_id)&&memberId===norm(basic.co_leader_id)
  };
 }catch(e){factionState.error=String(e.message||e).slice(0,180);factionState.identity=null}
 finally{factionState.loading=false;if(state.view==='faction')render()}
}
function importFactionCode(input,notice){
 const id=factionState.identity;
 if(!id){notice.textContent='Verify your faction membership first.';return}
 try{
  const order=decodeFactionOrder(input);
  if(order.factionId!==id.factionId)throw Error('This order belongs to a different faction.');
  if(order.authorId!==id.leaderId&&order.authorId!==id.coLeaderId)
   throw Error('The claimed author is not your current faction leader or co-leader.');
  // The author ID can be forged. Only trust code received directly from leadership.
  store.set('combatFactionOrder_'+id.factionId,order);
  state.factionPage=0;factionState.error='';render();
 }catch(e){notice.textContent=String(e.message||e)}
}
function generateFactionShare(){
 const id=factionState.identity,draft=factionState.draft;
 if(!id||!id.editor||!Array.isArray(draft))return;
 factionState.shareCode=encodeFactionOrder(id.factionId,id.memberId,Math.floor(Date.now()/1000),draft);
 store.set('combatFactionOrder_'+id.factionId,decodeFactionOrder(factionState.shareCode));
 factionState.draft=null;state.factionPage=0;render();
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
  muted('Your key stays in this browser and is sent only to the official Torn API. No faction service is required.'),
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
   muted('Aurora and twinkling stars · respects reduced-motion preferences')),
  auroraToggle));
 body.append(h('div',{class:'tc-contact tc-muted',style:'margin-top:12px'},'Found a bug or need help? Message ',contactLink(),' in Torn.'));

}
function switchView(view){
 if(!['watch','chain','faction','war'].includes(view))return;
 state.view=view;state.lastView=view;renderTabs();render();body.scrollTop=0;
 if(view==='faction'&&!factionState.identity&&!factionState.loading)void verifyFaction();
}
function renderTabs(){
 tabs.replaceChildren(...[['watch','Targets'],['chain','Solo Chain'],['faction','Faction Chain'],['war','War']].map(([id,label])=>
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
 else if(state.view==='faction')renderFactionChain();
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
  confirmBtn('Clear chain',()=>{saveChain([]);state.chainPage=0;render()},true)));
 enqueueStatuses(visibleIds);
}
function renderFactionChain(){
 const identity=factionState.identity,plan=savedFactionPlan();
 body.append(h('div',{class:'tc-view-header'},title('Faction chain'),
  muted(identity?'Faction '+identity.factionId+(identity.editor?' · Leader tools':' · Member view'):'Share codes')));
 if(factionState.error)body.append(h('div',{class:'tc-notice'},factionState.error));
 if(!key()){body.append(h('div',{class:'tc-empty'},'Add your Torn API key in Settings first.'));return}
 if(!identity){
  body.append(h('div',{class:'tc-card'},title('Check faction membership'),
   muted('Only your existing Torn API key is used, directly with Torn.'),
   btn(factionState.loading?'Checking…':'Check faction',()=>{void verifyFaction()})));
  return;
 }
 body.append(row(btn('Recheck faction',()=>{void verifyFaction()},true),
  muted('Imported orders stay on this device.')));
 const code=h('textarea',{class:'tc-input',rows:2,maxlength:1900,
  placeholder:'Paste the leader’s chain code from faction chat'});
 const note=muted('');
 body.append(h('div',{class:'tc-card'},title('Load leader’s order'),
  muted('Copy the code from faction chat, then paste and load it. If clipboard access works, use the pull button.'),
  code,row(btn('Load order',()=>importFactionCode(code.value,note)),
   btn('Pull from clipboard',async()=>{
    try{
     if(!navigator.clipboard||!navigator.clipboard.readText)throw Error('Clipboard reading unavailable; paste the code instead.');
     importFactionCode(await navigator.clipboard.readText(),note);
    }catch(e){note.textContent=String(e.message||e)}
   },true)),note));
 body.append(muted('Codes are not signed. Torn checks the faction and the claimed leader ID, but only trust codes directly posted by your leadership.'));
 const editing=identity.editor&&Array.isArray(factionState.draft);
 if(identity.editor){
  if(!editing)body.append(btn(plan?'Edit local order':'Build chain order',()=>{
   factionState.draft=plan?plan.entries.slice():[];factionState.shareCode='';
   state.factionPage=0;render();
  }));
  else{
   body.append(h('div',{class:'tc-section'},'LEADER DRAFT'));
   const target=h('input',{class:'tc-input',placeholder:'Target player ID',inputmode:'numeric',maxlength:10}),err=muted('');
   body.append(row(main(target),btn('Add target',()=>{
    if(!good(target.value)){err.textContent='Enter a valid Torn player ID';return}
    if(factionState.draft.length>=150){err.textContent='Maximum 150 targets';return}
    factionState.draft.push(norm(target.value));state.factionPage=Math.floor((factionState.draft.length-1)/5);render();
   })),err);
   body.append(row(confirmBtn('Use Solo Chain',()=>{
    factionState.draft=chain().slice();state.factionPage=0;render();
   },true,()=>factionState.draft.length>0),confirmBtn('Clear draft',()=>{
    factionState.draft=[];state.factionPage=0;render();
   },true)));
   body.append(row(btn('Generate share code',generateFactionShare),
    btn('Discard draft',()=>{factionState.draft=null;state.factionPage=0;render()},true)));
  }
 }
 if(factionState.shareCode){
  const share=h('textarea',{class:'tc-input',rows:3,readonly:true},factionState.shareCode);
  const copied=muted('');
  body.append(h('div',{class:'tc-card'},title('Share with faction chat'),
   muted('Copy this code and send it to members. When the order changes, send a fresh code.'),
   share,btn('Copy share code',async()=>{
    let ok=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(factionState.shareCode);ok=true}}catch(_){}
    if(!ok){
     // Older and in-app browsers: select the text (setSelectionRange works on iOS) and use the legacy copy command.
     share.focus();share.select();share.setSelectionRange(0,share.value.length);
     try{ok=document.execCommand('copy')}catch(_){ok=false}
    }
    copied.textContent=ok?'Copied.':'Copy is blocked here. The code is selected: long-press it and choose Copy.';
   }),copied));
 }
 const items=editing?factionState.draft:plan&&plan.entries||[];
 const page=pageSlice(items,state.factionPage,5);state.factionPage=page.page;
 body.append(h('div',{class:'tc-section'},editing?'DRAFT ORDER':plan?'LOADED ORDER':'NO ORDER LOADED'));
 if(plan&&!editing)body.append(muted('Claimed leader ['+plan.authorId+'] · '+new Date(plan.createdAt*1000).toLocaleString()+' · saved locally'));
 if(!items.length)body.append(h('div',{class:'tc-empty'},editing?'Add target IDs to your draft.':'No shared chain loaded yet.'));
 const visibleIds=page.items;
 page.items.forEach((id,j)=>{
  const index=page.start+j,name=watchlist().find(x=>x.id===id)?.name||'Player';
  const controls=[attack(id)];
  if(editing)controls.push(
   btn('↑',()=>{factionState.draft=move(factionState.draft,index,-1);render()},true),
   btn('↓',()=>{factionState.draft=move(factionState.draft,index,1);render()},true),
   btn('Remove',()=>{factionState.draft=removeHitAt(factionState.draft,index);render()},true));
  const item=card(row(muted('#'+(index+1)),main(title(name+' ['+id+']'),statusBadge(id)),
   h('div',{class:'tc-actions'},...controls)));
  item.classList.add('tc-entry');body.append(item);
 });
 if(page.pages>1){
  const pager=h('div',{class:'tc-pager'},
   btn('← Prev',()=>{state.factionPage--;render()},true),
   muted((page.page+1)+' / '+page.pages),
   btn('Next →',()=>{state.factionPage++;render()},true));
  pager.querySelectorAll('button')[0].disabled=page.page===0;
  pager.querySelectorAll('button')[1].disabled=page.page===page.pages-1;
  body.append(pager);
 }
 if(visibleIds.length){
  body.append(btn('Refresh target conditions',()=>enqueueStatuses(visibleIds,true),true));
  enqueueStatuses(visibleIds);
 }
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
  h('div',{class:'tc-stars','aria-hidden':'true'}),
  h('div',{class:'tc-head'},
   h('div',{class:'tc-brandlock'},
    h('span',{class:'tc-mark','aria-hidden':'true'},'T'),
    h('div',{class:'tc-brand'},title('Torn Toolkit'),muted('combat · v'+VER))),
   h('span',{style:'flex:1'}),headCounts,
   h('button',{type:'button',class:'tc-btn tc-soft tc-settings-btn',onclick:showSettings},'Settings'),
   collapseBtn),
  tabs,body,
  h('div',{class:'tc-foot'},h('span',{},'issues? message ',contactLink()),h('span',{},'v'+VER)));
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
function safeBoot(){
 try{boot();tcBootComplete()}catch(e){tcBootError(e,'boot')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});
else safeBoot();
}catch(e){tcBootError(e,'initialization')}
})();