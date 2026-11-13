// ==UserScript==
// @name         Torn Toolkit — Combat Edition
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      1.0.5
// @description  Manual Torn combat companion. Clean PDA-compatible rebuild with original aurora UI.
// @author       fl0w-development
// @license      PolyForm-Strict-1.0.0
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// ==/UserScript==
(function () {
'use strict';
var VERSION = '1.0.5';
var PDA_KEY = '###PDA-APIKEY###';
var isPDA = PDA_KEY.indexOf('#') < 0;
var root, body, tabs, counts;
var state = {view:'watch',watchPage:0,chainPage:0,factionPage:0,warPage:0,warSide:'own',collapsed:false,target:null,player:null,
  factionId:'',memberId:'',leaderId:'',coLeaderId:'',editor:false,identityError:'',draft:null,shareCode:'',warOwn:'',warEnemy:'',warLeft:[],warRight:[],warLoaded:false};
var cache = {};
var busy = {};
var status = {};
var leader = null;
var ERR_ID = 'tt-rebuild-error';
function warn(error,at) {
 try {
  var host = document.body || document.documentElement;
  if (!host) return;
  var el = document.getElementById(ERR_ID);
  if (!el) { el = document.createElement('div');el.id=ERR_ID;host.appendChild(el); }
  el.style.cssText='position:fixed!important;top:70px!important;left:8px!important;right:8px!important;z-index:2147483647!important;color:#fff!important;background:#621d26!important;border:2px solid #ff9999!important;padding:12px!important;font:13px Arial!important';
  el.textContent = 'Torn Toolkit '+VERSION+' '+at+': '+String(error && error.message || error).slice(0,250);
 } catch (_) {}
}
function storageGet(k,d) {
 try {
  if (typeof GM_getValue === 'function') {
   var v=GM_getValue(k,d);
   return v == null || (v && typeof v.then==='function') ? d : v;
  }
  var raw=localStorage.getItem('tt_'+k);
  return raw===null?d:JSON.parse(raw);
 } catch (_) {return d;}
}
function storageSet(k,v) {
 try {
  if(typeof GM_setValue==='function') GM_setValue(k,v);
  else localStorage.setItem('tt_'+k,JSON.stringify(v));
 } catch (_) {}
}
function storageDel(k) {
 try {if(typeof GM_deleteValue==='function')GM_deleteValue(k);else localStorage.removeItem('tt_'+k)}catch(_){}
}
function key(){return isPDA?PDA_KEY:String(storageGet('apiKey','')||'');}
function valid(id){return /^\d{1,10}$/.test(String(id).trim()) && Number(id)>0;}
function idOf(id){return String(Number(id));}
function attackURL(id){return 'https://www.torn.com/page.php?sid=attack&user2ID='+encodeURIComponent(id);}
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
function watch(){
 var v=storageGet('combatWatchlist',[]);
 return (Array.isArray(v)?v:[]).filter(x=>x && valid(x.id)).map(x=>({id:idOf(x.id),name:String(x.name||'Player '+x.id).slice(0,60),group:String(x.group||'General'),note:String(x.note||'').slice(0,200)})).slice(0,250);
}
function chain(){var v=storageGet('combatSoloChain',[]);return (Array.isArray(v)?v:[]).filter(valid).map(idOf).slice(0,150);}
function saveWatch(v){storageSet('combatWatchlist',v.slice(0,250));}
function saveChain(v){storageSet('combatSoloChain',v.slice(0,150));}
function h(tag,attrs) {
 var e=document.createElement(tag),children=Array.prototype.slice.call(arguments,2);
 Object.keys(attrs||{}).forEach(k=>{
  var v=attrs[k];if(v===undefined||v===null||v===false)return;
  if(k==='class')e.className=v;
  else if(k==='style')e.style.cssText=v;
  else if(k==='value')e.value=v;
  else if(k==='checked')e.checked=!!v;
  else if(k==='hidden')e.hidden=!!v;
  else if(k.slice(0,2)==='on' && typeof v==='function')e.addEventListener(k.slice(2),v);
  else e.setAttribute(k,v===true?'':String(v));
 });
 children.forEach(function add(c){
  if(Array.isArray(c))return c.forEach(add);
  if(c===null||c===undefined)return;
  e.appendChild(c instanceof Node?c:document.createTextNode(String(c)));
 });
 return e;
}
function button(label,callback,soft){return h('button',{class:'tc-btn'+(soft?' tc-soft':''),type:'button',onclick:callback},label);}
function linkAttack(id){return h('a',{class:'tc-btn tc-primary',href:attackURL(id)},'Attack');}
function txt(text){return h('div',{class:'tc-muted'},text);}
function title(text){return h('div',{class:'tc-title'},text);}
function row(){return h('div',{class:'tc-row'},Array.prototype.slice.call(arguments));}
function card(){return h('div',{class:'tc-card'},Array.prototype.slice.call(arguments));}
function grow(){return h('div',{class:'tc-grow'},Array.prototype.slice.call(arguments));}
function input(placeholder,value){return h('input',{class:'tc-input',placeholder:placeholder,value:value||'',inputmode:'text'});}
function textarea(placeholder,value){var e=h('textarea',{class:'tc-input',placeholder:placeholder,rows:3});e.value=value||'';return e;}
function sec(text){return h('div',{class:'tc-section'},text);}
function notice(text){return h('div',{class:'tc-notice'},text);}
function confirmButton(label,action){
 var n=0,timer;var b=button(label,function(){
  if(n===0){n=1;b.textContent='Tap again to confirm';timer=setTimeout(()=>{n=0;b.textContent=label},3500)}
  else{clearTimeout(timer);action()}
 },true);return b;
}
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
function paginate(items,index,size){
 var pages=Math.max(1,Math.ceil(items.length/size)),page=Math.max(0,Math.min(index,pages-1));
 return {page:page,pages:pages,start:page*size,items:items.slice(page*size,(page+1)*size)};
}
function pager(page,go){
 if(page.pages<2)return null;
 return h('div',{class:'tc-pager'},button('← Prev',()=>go(Math.max(0,page.page-1)),true),
  txt((page.page+1)+' / '+page.pages),button('Next →',()=>go(Math.min(page.pages-1,page.page+1)),true));
}
function targetURL(){
 var u=new URL(location.href),id=null;
 if(u.pathname==='/profiles.php')id=u.searchParams.get('XID');
 if(u.searchParams.get('sid')==='attack')id=u.searchParams.get('user2ID')||u.searchParams.get('XID');
 return valid(id)?idOf(id):null;
}
async function api(path){
 if(!key())throw Error('Add an API key in Settings');
 var now=Date.now(),existing=cache[path];
 if(existing && now-existing.time<90000)return existing.value;
 var endpoint='https://api.torn.com/v2/'+path+(path.includes('?')?'&':'?')+'comment=TornToolkit';
 var headers={Authorization:'ApiKey '+key()},value;
 // PDA's documented native bridge avoids cross-origin browser fetch restrictions.
 if(isPDA && typeof PDA_httpGet==='function'){
  var response=await PDA_httpGet(endpoint,headers);
  var statusCode=Number(response && response.status);
  if(statusCode<200 || statusCode>=300)throw Error('Torn API HTTP '+statusCode);
  value=JSON.parse(response.responseText);
 }else{
  var resp=await fetch(endpoint,{headers:headers});
  if(!resp.ok)throw Error('Torn API HTTP '+resp.status);
  value=await resp.json();
 }
 if(value.error)throw Error(String(value.error.error||value.error.code||'Torn API error'));
 cache[path]={time:now,value:value};return value;
}
function statusNode(id){
 var entry=status[id],label=entry?(entry.error?'Unavailable: '+entry.error:entry.label):key()?'Condition: Not checked':'API key required';
 return h('div',{class:'tc-status'},label);
}
async function refreshStatus(ids,forced){
 if(!key())return;
 var updated=false;
 for(const id of ids.slice(0,5)){
  var current=status[id];
  if(current && !forced && Date.now()-current.time<90000)continue;
  if(busy[id])continue;
  busy[id]=true;
  try{
   var p=await api('user/'+id+'/profile');
   var obj=p.profile||p,stat=obj.status||{},stateText=String(stat.state||'Unknown'),desc=String(stat.description||'');
   status[id]={label:stateText+(desc && desc!==stateText?' · '+desc:''),time:Date.now()};
  }catch(e){status[id]={error:String(e.message||e),time:Date.now()}}
  finally{busy[id]=false;updated=true}
 }
 // Do not recursively repaint on a cached or already-busy status pass.
 if(updated && root && state.view!=='settings') render();
}
function switchTo(v){
 state.view=v;tabsRender();render();
 if(v==='faction'&&!leader)verifyFaction();
}
function tabsRender(){
 var views=[['watch','Targets'],['chain','Solo Chain'],['faction','Faction Chain'],['war','War']];
 tabs.replaceChildren(...views.map(x=>h('button',{class:'tc-tab'+(state.view===x[0]?' selected':''),type:'button',onclick:()=>switchTo(x[0])},x[1])));
}
function render(){
 try{
  body.replaceChildren();
  counts.textContent=watch().length+' Targets · '+chain().length+' Queued';
  if(!key() && state.view!=='settings')body.append(notice('Add a Torn API key in Settings to load target conditions and rosters.'));
  if(state.view==='watch')renderWatch();
  else if(state.view==='chain')renderChain();
  else if(state.view==='faction')renderFaction();
  else if(state.view==='war')renderWar();
  else renderSettings();
 }catch(e){warn(e,'render')}
}
function renderWatch(){
 body.append(h('div',{class:'tc-view-header'},title('Target watchlist'),txt(watch().length+' saved · statuses checked when viewed')));
 if(state.target){
  var info=state.player||{},p=info.profile||{},name=String(p.name||'Player '+state.target);
  body.append(h('div',{class:'tc-card tc-current'},sec('CURRENT PROFILE'),row(grow(title(name+' ['+state.target+']'),
   statusNode(state.target),info && info.profile?txt('Estimated stats: '+estimate(p,info.personalstats||{}).label+' · Low confidence'):null),linkAttack(state.target),
   button('Add target',()=>{addTarget(state.target,name);render()},true)),
   txt('Public data only · combat actions are always manual')));
 }
 var entry=input('Add Torn player ID'),message=txt('');
 entry.inputMode='numeric';
 body.append(row(grow(entry),button('Add target',()=>{
  if(!valid(entry.value)){message.textContent='Enter a valid player ID';return}
  addTarget(entry.value);state.watchPage=0;render();
 })),message);
 var search=input('Find name or ID'),group=h('select',{class:'tc-input'},['All','General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g},g)));
 var list=h('div'),summary=txt(''),pageRegion=h('div');
 body.append(h('div',{class:'tc-grid'},search,group),row(button('Refresh conditions',()=>refreshStatus(visible,true),true),summary),list,pageRegion);
 var visible=[];
 function paint(){
  var q=search.value.toLowerCase();
  var items=watch().filter(x=>(group.value==='All'||group.value===x.group) && (x.name.toLowerCase().includes(q)||x.id.includes(q)));
  var p=paginate(items,state.watchPage,5);state.watchPage=p.page;visible=p.items.map(x=>x.id);
  summary.textContent=items.length+' results · official API snapshots';
  list.replaceChildren(...p.items.map(x=>{
   var edit=h('div',{hidden:true});
   var cat=h('select',{class:'tc-input'},['General','Farm','Chain','Rival','Other'].map(g=>h('option',{value:g,selected:g===x.group},g)));
   cat.value=x.group;
   var note=textarea('Note',x.note);
   edit.append(h('div',{class:'tc-grid'},cat,note),row(button('Save',()=>{
    var a=watch(),current=a.find(t=>t.id===x.id);
    if(current){current.group=cat.value;current.note=note.value.slice(0,200);saveWatch(a)}render();
   }),button('Cancel',()=>{edit.hidden=true},true)));
   return card(row(grow(title(x.name+' ['+x.id+']'),statusNode(x.id),txt(x.group+(x.note?' · '+x.note:''))),
    h('div',{class:'tc-actions'},linkAttack(x.id),
     button('+ Chain',()=>{saveChain(chain().concat([x.id]));switchTo('chain')},true),
     button('Edit',()=>{edit.hidden=!edit.hidden},true),
     button('Remove',()=>{saveWatch(watch().filter(t=>t.id!==x.id));render()},true))),edit);
  }));
  if(!items.length)list.append(h('div',{class:'tc-empty'},'No targets found.'));
  pageRegion.replaceChildren(pager(p,n=>{state.watchPage=n;paint()})||'');
  if(visible.length)void refreshStatusLater(visible);
 }
 search.addEventListener('input',()=>{state.watchPage=0;paint()});
 group.addEventListener('change',()=>{state.watchPage=0;paint()});
 paint();
}
function refreshStatusLater(ids){return refreshStatus(ids,false)}
function addTarget(id,name){
 if(!valid(id))return;
 var n=idOf(id),a=watch();
 if(!a.some(x=>x.id===n)){a.unshift({id:n,name:name||'Player '+n,group:'General',note:''});saveWatch(a)}
}
function renderChain(){
 var entries=chain(),nameOf=id=>watch().find(x=>x.id===id)?.name||'Player '+id;
 body.append(h('div',{class:'tc-view-header'},title('Solo chain'),txt(entries.length+' queued · manual attacks only')));
 if(entries.length)body.append(h('div',{class:'tc-card tc-current'},sec('CURRENT TARGET · #1'),
  row(grow(title(nameOf(entries[0])+' ['+entries[0]+']'),statusNode(entries[0])),
   linkAttack(entries[0]),button('Skip target',()=>{saveChain(chain().slice(1));render()},true)),
  txt('Skip removes one hit, never the watchlist entry.')));
 else body.append(h('div',{class:'tc-empty'},'No hits queued. Add a player ID or use + Chain from Targets.'));
 var entry=input('Queue player ID'),message=txt('');entry.inputMode='numeric';
 body.append(row(grow(entry),button('Queue hit',()=>{
  if(!valid(entry.value)){message.textContent='Enter a valid player ID';return}
  saveChain(chain().concat([idOf(entry.value)]));render();
 })),message);
 if(!entries.length)return;
 var p=paginate(entries.slice(1),state.chainPage,4);state.chainPage=p.page;
 body.append(sec('UPCOMING HITS'));
 p.items.forEach((id,j)=>{
  var index=p.start+j+1;
  body.append(card(row(txt('#'+(index+1)),grow(title(nameOf(id)+' ['+id+']'),statusNode(id)),linkAttack(id),
   button('↑',()=>{var a=chain();if(index>0)[a[index-1],a[index]]=[a[index],a[index-1]];saveChain(a);render()},true),
   button('↓',()=>{var a=chain();if(index<a.length-1)[a[index+1],a[index]]=[a[index],a[index+1]];saveChain(a);render()},true),
   button('Remove',()=>{var a=chain();a.splice(index,1);saveChain(a);render()},true))));
 });
 var pg=pager(p,n=>{state.chainPage=n;render()});if(pg)body.append(pg);
 body.append(row(button('Refresh conditions',()=>refreshStatus(entries.slice(0,5),true),true),
  confirmButton('Clear chain',()=>{saveChain([]);render()})));
 void refreshStatusLater(entries.slice(0,5));
}
function decodeShare(code){
 var parts=String(code||'').trim().split('|');
 if(parts.length!==5||parts[0]!=='TTFC1'||!valid(parts[1])||!valid(parts[2])||!/^\d{10}$/.test(parts[3]))throw Error('Invalid leader order code');
 var ids=parts[4]?parts[4].split(','):[];
 if(ids.length>150 || !ids.every(valid))throw Error('Invalid chain targets');
 return {factionId:idOf(parts[1]),authorId:idOf(parts[2]),createdAt:Number(parts[3]),entries:ids.map(idOf)};
}
function savedPlan(){
 if(!valid(state.factionId))return null;
 var v=storageGet('combatFactionOrder_'+state.factionId,null);
 return v && v.factionId===state.factionId && Array.isArray(v.entries)?v:null;
}
async function verifyFaction(){
 if(!key())return;
 state.identityError='Checking faction…';render();
 try{
  var response=await api('key/info'),user=response.info && response.info.user || {};
  if(!valid(user.id)||!valid(user.faction_id))throw Error('Torn did not return your faction membership.');
  var factionId=idOf(user.faction_id),memberId=idOf(user.id);
  var results=await Promise.all([api('faction/'+factionId+'/basic'),api('faction/'+factionId+'/members')]);
  var info=results[0].basic||{},members=parseMembers(results[1]);
  if(!valid(info.id)||idOf(info.id)!==factionId||!members.some(x=>x.id===memberId))
   throw Error('Torn did not confirm your faction membership.');
  state.memberId=memberId;state.factionId=factionId;
  state.leaderId=valid(info.leader_id)?idOf(info.leader_id):'';
  state.coLeaderId=valid(info.co_leader_id)?idOf(info.co_leader_id):'';
  state.editor=memberId===state.leaderId||memberId===state.coLeaderId;
  leader=true;state.identityError='';
 }catch(e){state.identityError=String(e.message||e);leader=null}
 render();
}
function renderFaction(){
 var plan=savedPlan();
 body.append(h('div',{class:'tc-view-header'},title('Faction chain'),txt(state.factionId?'Faction '+state.factionId+(state.editor?' · Leader tools':' · Member view'):'Share codes')));
 if(state.identityError)body.append(notice(state.identityError));
 if(!key()){body.append(h('div',{class:'tc-empty'},'Set your Torn API key first.'));return}
 if(!leader){
  body.append(card(title('Check faction membership'),txt('Only your official Torn API key is used.'),
   button('Check faction',verifyFaction)));
  return;
 }
 body.append(button('Recheck faction',verifyFaction,true));
 var field=textarea('Paste leader\'s chain code'),msg=txt('');
 body.append(card(title('Load leader\'s order'),txt('Paste a share code from faction chat.'),field,
  row(button('Load order',()=>{
   try{
    var p=decodeShare(field.value);
    if(p.factionId!==state.factionId)throw Error('Code belongs to another faction');
    if(p.authorId!==state.leaderId && p.authorId!==state.coLeaderId)throw Error('Code author is not a current faction leader or co-leader');
    storageSet('combatFactionOrder_'+state.factionId,p);state.factionPage=0;render();
   }catch(e){msg.textContent=String(e.message||e)}
  }),button('Pull from clipboard',async()=>{
   try{field.value=await navigator.clipboard.readText()}catch(e){msg.textContent='Paste manually: clipboard unavailable'}
  },true)),msg));
 if(state.editor){
  if(!state.draft)body.append(button(plan?'Edit local order':'Build chain order',()=>{
   state.draft=(plan?plan.entries:[]).slice();render();
  }));
  else{
   var target=input('Target player ID');target.inputMode='numeric';
   body.append(sec('LEADER DRAFT'),row(grow(target),button('Add target',()=>{
    if(valid(target.value) && state.draft.length<150){state.draft.push(idOf(target.value));render()}
   })),row(button('Use Solo Chain',()=>{state.draft=chain();render()},true),
    button('Clear draft',()=>{state.draft=[];render()},true)),
    row(button('Generate share code',()=>{
     var t=Math.floor(Date.now()/1000);
     state.shareCode='TTFC1|'+state.factionId+'|'+state.memberId+'|'+t+'|'+state.draft.join(',');
     storageSet('combatFactionOrder_'+state.factionId,decodeShare(state.shareCode));state.draft=null;render();
    }),button('Discard draft',()=>{state.draft=null;render()},true)));
  }
 }
 if(state.shareCode){
  var share=textarea('',state.shareCode);share.readOnly=true;
  body.append(card(title('Share with faction chat'),share,button('Copy share code',async()=>{
   try{await navigator.clipboard.writeText(share.value)}catch(_){share.focus();share.select()}
  })));
 }
 var order=state.draft||plan&&plan.entries||[],p=paginate(order,state.factionPage,5);state.factionPage=p.page;
 body.append(sec(state.draft?'DRAFT ORDER':plan?'LOADED ORDER':'NO ORDER LOADED'));
 if(!order.length)body.append(h('div',{class:'tc-empty'},'No chain order loaded.'));
 p.items.forEach((id,j)=>{
  var index=p.start+j,actions=[linkAttack(id)];
  if(state.draft){
   actions.push(button('↑',()=>{if(index>0)[state.draft[index-1],state.draft[index]]=[state.draft[index],state.draft[index-1]];render()},true),
    button('↓',()=>{if(index<state.draft.length-1)[state.draft[index+1],state.draft[index]]=[state.draft[index],state.draft[index+1]];render()},true),
    button('Remove',()=>{state.draft.splice(index,1);render()},true));
  }
  body.append(card(row(txt('#'+(index+1)),grow(title('Player ['+id+']'),statusNode(id)),h('div',{class:'tc-actions'},actions))));
 });
 var pg=pager(p,n=>{state.factionPage=n;render()});if(pg)body.append(pg);
 if(p.items.length)void refreshStatusLater(p.items);
}
function parseMembers(response){
 var v=response.members||[],arr=Array.isArray(v)?v:Object.keys(v).map(id=>Object.assign({id:id},v[id]));
 return arr.filter(x=>valid(x.id)).map(x=>({id:idOf(x.id),name:String(x.name||'Player '+x.id),level:x.level||'?',status:String(x.status&& (x.status.description||x.status.state)||'Unknown')}));
}
function renderWar(){
 body.append(h('div',{class:'tc-view-header'},title('Faction rosters'),txt('Read-only · manual actions')));
 var own=input('Your faction ID',state.warOwn),enemy=input('Enemy faction ID',state.warEnemy);
 own.inputMode=enemy.inputMode='numeric';
 var msg=txt('');
 body.append(h('div',{class:'tc-grid'},own,enemy),button('Load factions',async()=>{
  if(!valid(own.value)||!valid(enemy.value)){msg.textContent='Enter two valid faction IDs';return}
  state.warOwn=idOf(own.value);state.warEnemy=idOf(enemy.value);msg.textContent='Loading…';
  try{
   var result=await Promise.all([api('faction/'+state.warOwn+'/members'),api('faction/'+state.warEnemy+'/members')]);
   state.warLeft=parseMembers(result[0]);state.warRight=parseMembers(result[1]);state.warLoaded=true;state.warPage=0;render();
  }catch(e){msg.textContent=String(e.message||e)}
 }),msg);
 if(!state.warLoaded)return;
 var sides=h('div',{class:'tc-tabs'},
  button('Your faction ('+state.warLeft.length+')',()=>{state.warSide='own';state.warPage=0;render()},true),
  button('Enemy ('+state.warRight.length+')',()=>{state.warSide='enemy';state.warPage=0;render()},true));
 var search=input('Search name or ID'),list=h('div'),pg=h('div');
 body.append(sides,search,list,pg);
 function paint(){
  var q=search.value.toLowerCase(),all=state.warSide==='own'?state.warLeft:state.warRight;
  var filtered=all.filter(x=>x.name.toLowerCase().includes(q)||x.id.includes(q)),page=paginate(filtered,state.warPage,5);state.warPage=page.page;
  list.replaceChildren(...page.items.map(x=>h('div',{class:'tc-roster-row'},row(grow(title(x.name+' ['+x.id+']'),txt('Level '+x.level+' · '+x.status)),linkAttack(x.id)))));
  if(!filtered.length)list.append(h('div',{class:'tc-empty'},'No matching members.'));
  pg.replaceChildren(pager(page,n=>{state.warPage=n;paint()})||'');
 }
 search.addEventListener('input',()=>{state.warPage=0;paint()});paint();
}
function renderSettings(){
 body.append(h('div',{class:'tc-view-header'},title('API settings')));
 var current=key(),field=input(isPDA?'Torn PDA API key is connected':'16-character API key',isPDA?'':current);
 field.type='password';field.disabled=isPDA;
 var message=txt('');
 body.append(card(title('Your API key'),field,txt('Your key is sent only to the official Torn API.'),
  row(button('Save key',()=>{
   if(isPDA){switchTo('watch');return}
   var value=field.value.trim();
   if(value && !/^[a-z0-9]{16}$/i.test(value)){message.textContent='Enter a valid 16-character key';return}
   if(value)storageSet('apiKey',value);else storageDel('apiKey');switchTo('watch');
  }),button('Back',()=>switchTo('watch'),true)),message));
 var enabled=storageGet('combatAurora',true)!==false;
 var check=h('input',{type:'checkbox',checked:enabled,onchange:()=>{
  storageSet('combatAurora',check.checked);root.classList.toggle('tc-no-aurora',!check.checked);
 }});
 body.append(h('label',{class:'tc-switch'},h('div',{},title('Aurora ambience'),txt('Aurora and twinkling stars')),check));
 body.append(txt('Issues? Message fl0ww_ [4605130] in Torn.'));
}
// Keep the panel in the page (never a floating PDA-only launcher).
// PDA may retain hidden mobile/desktop containers in the same DOM, so
// ignore any matched container hidden by a parent or responsive CSS.
function visibleHost(node){
 if(!node || (node.closest && node.closest('#tc-root')))return false;
 for(var e=node;e && e!==document.body;e=e.parentElement){
  if(e.hidden || (e.getAttribute && e.getAttribute('aria-hidden')==='true'))return false;
  if(typeof window!=='undefined' && typeof window.getComputedStyle==='function'){
   var style=window.getComputedStyle(e);
   if(style && (style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'))return false;
  }
 }
 return true;
}
function panelHost(){
 var selectors=['.content-wrapper','#mainContainer','#main-content','main','#content','#app','[role="main"]'];
 for(var i=0;i<selectors.length;i++){
  var found=document.querySelector(selectors[i]);
  if(visibleHost(found))return found;
 }
 return document.body;
}
function mount(){
 var old=document.getElementById('tc-root');
 if(old && old!==root)return;
 var dest=panelHost();if(!dest)return;
 if(dest!==document.body){
  if(root.parentElement!==dest)dest.prepend(root);
  return;
 }
 // If Torn exposes no visible content wrapper, keep the Toolkit below
 // its header in normal document flow rather than above the entire site.
 var header=null;
 var children=dest.children||[];
 for(var i=0;i<children.length;i++){
  var item=children[i];
  if(item!==root && item.tagName && item.tagName.toLowerCase()==='header'){header=item;break}
 }
 if(header && typeof header.insertAdjacentElement==='function'){
  if(root.previousElementSibling!==header)header.insertAdjacentElement('afterend',root);
 }else if(root.parentElement!==dest){
  dest.appendChild(root);
 }
}
function start(){
 try{
  if(document.getElementById('tc-root'))return;
  var sheet=h('style',{id:'tc-style'},css);
  (document.head||document.documentElement).appendChild(sheet);
  var headerCount=counts=h('span',{class:'tc-count'},'');
  body=h('div',{id:'tc-body',class:'tc-body'});
  tabs=h('div',{id:'tc-tabs',class:'tc-tabs'});
  state.collapsed=storageGet('combatCollapsed',false)===true;
  root=h('section',{id:'tc-root','aria-label':'Torn Toolkit Combat Edition'},
   h('div',{class:'tc-stars','aria-hidden':'true'}),
   h('div',{class:'tc-head'},
    h('div',{class:'tc-brandlock'},h('span',{class:'tc-mark'},'T'),
     h('div',{class:'tc-brand'},title('Torn Toolkit'),txt('combat · v'+VERSION))),
    h('span',{style:'flex:1'}),headerCount,
    button('Settings',()=>{state.view='settings';tabsRender();render()},true),
    button('▴',()=>{state.collapsed=!state.collapsed;storageSet('combatCollapsed',state.collapsed);root.classList.toggle('tc-collapsed',state.collapsed)},true)),
   tabs,body,
   h('div',{class:'tc-foot'},h('span',{},'issues? message ',h('a',{href:'https://www.torn.com/profiles.php?XID=4605130'},'fl0ww_ [4605130]')),h('span',{},'v'+VERSION)));
  root.classList.toggle('tc-no-aurora',storageGet('combatAurora',true)===false);
  root.classList.toggle('tc-collapsed',state.collapsed);
  mount();tabsRender();render();
  var prev=location.href;
  setInterval(()=>{
   if(location.href!==prev){prev=location.href;state.target=targetURL();if(state.view==='watch')render();}
   if(!root.isConnected || root.parentElement!==panelHost())mount();
  },1200);
  state.target=targetURL();if(state.target){
   Promise.all([api('user/'+state.target+'/profile'),api('user/'+state.target+'/personalstats?cat=popular')])
    .then(x=>{state.player={profile:x[0].profile||x[0],personalstats:x[1].personalstats||x[1]};if(state.view==='watch')render()})
    .catch(()=>{state.player=null});
  }
 }catch(e){warn(e,'startup')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
