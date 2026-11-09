# Torn Toolkit — Combat Edition

**Version 0.5.4** · A small, manual combat companion userscript for [Torn](https://www.torn.com). No external website or VPS is needed for this release.

## Install
1. Install a supported userscript manager (Tampermonkey, Violentmonkey, or Torn PDA if compatible).
2. [Install the latest userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js).
3. Add your Torn API key under **API settings**. Existing keys from prior Torn Toolkit versions remain locally stored.
4. Disable duplicate copies of earlier Torn Toolkit scripts in your userscript manager.

## Compact menu
- Click the **up arrow (▴)** in the toolkit header to collapse the Attack/War menu to a slim title bar.
- Click the **down arrow (▾)** to expand it again. The API Settings button is available while expanded.
- Your collapsed/expanded choice is saved on this device and kept across Torn page changes and reloads.

## Appearance
Combat Edition uses a compact, Torn-style charcoal interface: flat player rows, restrained red accents, smaller controls, and simple condition dots. The active chain target is still clearly highlighted, and the existing collapse arrow and mobile layout are retained.

## Attack tab
- **Current target:** On a player profile or attack page, show the player's public rank-based **battle-stat estimate**, with an explicit low-confidence label or missing-data warning.
- **Watchlist:** Add players by Torn ID or use **+ Watch** from their profile; search, categorize, edit notes and remove targets. See their public current condition (Okay, Hospital, Jail, Traveling/Abroad, etc.) on each visible page of up to 10 players. Choose **Refresh shown conditions** to check again.
- **Solo Chain:** Arrange your own ordered manual hit list **outside a faction war**. The **Current Chain Target** shows public condition and a manual Attack link; **Skip current target** removes that planned hit only, leaving the saved watchlist intact. Upcoming hits can be removed individually, reordered, or checked via paginated condition snapshots. Duplicate hits are supported.
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
- Requests are made to `api.torn.com` only. No non-API Torn scraping, continuous enemy-status scanning, webhooks or third-party analytics are used. Public target conditions come from `user/{id}/basic` API v2, loaded for the visible page of a list (at most 10 distinct targets) and refreshed only when requested. Results are cached in memory for 90 seconds.
- Conditions are a **snapshot**, not guaranteed attack eligibility: Hospital/Jail/Federal/Fallen are flagged unavailable; Traveling/Abroad are location-dependent; Okay indicates only likely availability. End times are sourced from Torn and can become stale.
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

## License

**Torn Toolkit v0.5.4 and subsequent original releases** are offered under the [PolyForm Strict License 1.0.0](LICENSE) (source-available, **not open source**). Copyright © 2026 fl0w-development.

- You may install and run an unmodified release for personal, noncommercial use, including normal gameplay.
- You do **not** receive permission under this license to redistribute, resell, modify, publish derivatives of, or repackage current releases. Contact the copyright holder for separate written permission or commercial licensing.
- Premium access, when offered, would be a separate subscription entitlement. This repository does **not** implement Premium billing or access control.
- **Existing MIT grants remain valid** for releases and code previously made available under MIT (including v0.5.3 and earlier). This change does not revoke those permissions. Their original MIT license remains in the repository history; see the [previous license](https://github.com/fl0w-development/Torn-Toolkit/blob/5bf015d6e82e1656405f755f404959c3c20bbb57/LICENSE).
- As a public GitHub repository, it can still be viewed and forked under GitHub's Terms of Service; the license does not grant broader redistribution rights for the newly licensed material.

Questions about permission can be raised with the repository owner before redistribution or commercial use.
