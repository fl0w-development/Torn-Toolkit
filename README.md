# Torn Toolkit — Combat Edition

Manual combat companion userscript for Torn, rebuilt cleanly in **v1.0.2** to prioritize Torn PDA on iPhone.

## v1.0.2 PDA rendering fix

The v1 rebuild had a runaway render loop: after each saved target status refresh, `refreshStatus()` called `render()` even when every status was cached or already in progress. A PDA instance with a populated watchlist and API key could endlessly rebuild its panel. It now rerenders **only after status data was actually updated**, with a regression test simulating a populated PDA watchlist.

Torn PDA API calls now use the documented `PDA_httpGet(url, headers)` native bridge when available, falling back to browser `fetch` outside PDA. This avoids cross-origin browser restrictions and keeps all API calls directed to `api.torn.com`. No saved user data is erased, and the original Aurora stylesheet is unchanged.

## v1.0.1 placement correction

Restores the original content-area host selection from the working v0.7 interface. The Toolkit is prepended inside Torn's `.content-wrapper` (or the next recognized main content container) instead of being inserted as the first element of `document.body`, above Torn's header. The interval also remounts the panel if the page's content container changes. The Aurora styling and storage keys are unchanged.

## The interface stays the same

The entire Aurora / night-sky stylesheet from v0.7–0.8.7 is retained, including twinkling stars, responsive mobile layout, green Attack buttons and the familiar four tabs:

- **Targets** — searchable and grouped watchlist, notes, player profile, attack links and public status checks
- **Solo Chain** — ordered hit queue, reorder, skip one hit, manual attack links
- **Faction Chain** — faction verification using Torn API, leader/co-leader draft, share codes, local import, manual attack queue
- **War** — public faction roster lookup, faction switching, search and manual attack links

No automated attacks or gameplay actions.

## Install / update

**Torn PDA on iOS/Android:** Settings → User Scripts → update the **existing** Torn Toolkit script from the [raw userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js). Enable it and use the **END** injection time. Keep the existing script entry so existing storage is not discarded. Torn PDA inserts your API key automatically if configured.

**Browser (Tampermonkey/Violentmonkey):** install the same script via the raw link. Open Toolkit Settings to save your API key.

This rebuild uses the same storage keys as before: `combatWatchlist`, `combatSoloChain`, `combatFactionOrder_<faction ID>`, `combatCollapsed`, `combatAurora` and `apiKey`. Existing data is not intentionally deleted or reset.

The older version is archived in [legacy/torn-toolkit-v0.8.7.user.js](legacy/torn-toolkit-v0.8.7.user.js) and is recoverable if needed.

## Development

The entrypoint `torn-toolkit.user.js` contains the complete clean runtime. The same version is staged in `torn-toolkit.rebuilt.user.js` for comparison. Run `npm test` to validate JavaScript parsing, preserved styling, storage identifiers, and browser mounting against a simulated DOM with an empty or existing watchlist.

**Testing limitation:** passing CI is not a substitute for installing the script in Torn PDA's iOS WebView. Version 1.0.0 requires a real-device smoke test to confirm the panel is visible. The independent injection probe, which already displayed successfully on a PDA device, remains in `diagnostics/pda-injection-probe.user.js`.

Message **fl0ww_ [4605130]** on Torn for questions.
