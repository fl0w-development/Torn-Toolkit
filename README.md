# Torn Toolkit — Combat Edition

**Version 0.5.0** · A small, manual combat companion userscript for [Torn](https://www.torn.com). No external website or VPS is needed for this release.

## Install
1. Install a supported userscript manager (Tampermonkey, Violentmonkey, or Torn PDA if compatible).
2. [Install the latest userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js).
3. Add your Torn API key under **API settings**. Existing keys from prior Torn Toolkit versions remain locally stored.
4. Disable duplicate copies of earlier Torn Toolkit scripts in your userscript manager.

## Attack tab
- **Current target:** On a player profile or attack page, show the player's public rank-based **battle-stat estimate**, with an explicit low-confidence label or missing-data warning.
- **Watchlist:** Add players by Torn ID or use **+ Watch** from their profile; search, categorize, edit notes and remove targets.
- **Solo Chain:** Arrange your own ordered manual hit list **outside a faction war**. Add targets from the watchlist or by ID, move entries up or down, remove entries, and keep repeated targets if you wish.
- **Attack:** Opens Torn's normal attack page using a manual click. The toolkit never attacks, consumes items, selects fight actions, or plays for you.
- Watchlist and solo chain are stored **only in the browser** under `combatWatchlist` and `combatSoloChain`. There is no account sync or cloud backup yet.

## War tab
- Enter the IDs of **your faction** and the **enemy faction**.
- Press **Load rosters** to fetch both rosters from the official Torn API v2.
- Browse member names, levels, public statuses, and manual Attack links.
- Roster information does **not** reveal battle stats. Visit a player's profile for a conservative estimate where public information permits.

**Not yet included:** shared faction war plans, chain orders synchronized between members, faction-specific authentication, leadership-only editing, Xanax subscription activation, war score dashboards, or automated roster/target monitoring. These require additional API review and an authenticated backend. The current War tab is intentionally read-only.

## Privacy and compliance
- Your Torn API key is stored in your local userscript-manager/browser storage, never uploaded to a Torn Toolkit server.
- Requests are made to `api.torn.com` only. No non-API Torn scraping, background enemy-status scanning, webhooks or third-party analytics are used.
- All game interactions are manual. Each Attack button only navigates to Torn's native attack page.
- Public stat estimates are broad rank-trigger brackets, **not spies, exact stats, or win predictions**.

## Migration from v0.4.3
This is a **focused rewrite**. General-purpose tools (travel profitability, gym planner, market badges, and the standalone status panel) are not present in v0.5.0. The previous implementation remains recoverable in Git history. Legacy saved settings are left in storage but not used by Combat Edition.

## Roadmap
1. Test Combat Edition in Torn on desktop and mobile.
2. Validate faction roster shape and API key permission behavior with real responses.
3. Prototype shared War Planner backed by a securely authenticated VPS service.
4. Implement server-enforced leader/co-leader/authorized war-officer permissions, draft/publish revisions, and audit logs.
5. Pilot faction access before considering in-game Xanax subscriptions.

No faction editing permissions or Premium access claims are enforced by this first version.
