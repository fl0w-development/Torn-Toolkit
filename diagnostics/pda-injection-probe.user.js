// ==UserScript==
// @name         Torn Toolkit PDA Injection Probe
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      1.0.0
// @description  Minimal no-API-key PDA injection smoke test; does not change Toolkit storage.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  function show() {
    if (document.getElementById('tt-pda-probe')) return;
    var bar = document.createElement('div');
    bar.id = 'tt-pda-probe';
    bar.textContent = 'PDA SCRIPT RUNNING';
    bar.style.cssText = 'position:fixed!important;top:80px!important;left:12px!important;z-index:2147483647!important;background:#095d43!important;color:white!important;padding:12px 14px!important;border:2px solid #a5ffce!important;border-radius:8px!important;font:bold 14px Arial,sans-serif!important;';
    (document.body || document.documentElement).appendChild(bar);
  }
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show, {once:true});
})();
