# Torn Toolkit — Combat Edition

**Version 0.5.5** · A small, manual combat companion userscript for [Torn](https://www.torn.com). No external website or VPS is needed for this release.

## Install
1. Install a supported userscript manager (Tampermonkey, Violentmonkey, or Torn PDA if compatible).
2. [Install the latest userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js).
3. Add your Torn API key under **Settings**. Existing keys from prior Torn Toolkit versions remain locally stored.
4. Disable duplicate copies of earlier Torn Toolkit scripts in your userscript manager.

## Compact workspace

Torn Toolkit now stays inside a **640px-wide, bounded panel**, rather than becoming a very long full-width section that pushes Torn's content down the page. On desktop the content area is capped at **405px** (or 55% of the viewport height, whichever is smaller); mobile uses a smaller cap. When a list grows, scroll **inside the toolkit** instead of scrolling through thousands of pixels of Torn's page.

- One row of tabs: **Targets**, **Chain**, and **War**. Settings opens *inside the same bounded panel* from the header.
- The **up arrow (▴)** collapses the toolkit to a slim title bar; **down arrow (▾)** expands it. New installs start collapsed to keep Torn uncluttered, while previously saved open/closed preferences are preserved.
- Small target/queued counts are visible in the header on desktop.
- Watchlist entries and faction members are shown in **five-item pages**, with search. The Chain tab keeps the current hit prominently visible and displays up to **four upcoming hits per page**.
- Lists never lose entries merely because they are on another page. A previously saved watchlist or chain is not cleared by this UI update.

## Appearance

A compact charcoal and neutral-slate utility style with refined borders, clearer typography, quiet status dots, and a restrained red Attack button. It is responsive on mobile and keeps Torn's original pages accessible.

## Targets and Chain tabs

- **Current profile target:** On player profile/attack pages, the Targets tab shows the public rank-based battle-stat estimate with its low-confidence or missing-data warning.
- **Targets/watchlist:** Add players by Torn ID or use **+ Watch** on a profile. Search, categorize, edit notes and remove targets. View public conditions (Okay, Hospital, Jail, Traveling/Abroad), in pages of up to five. **Refresh conditions** requests a new snapshot.
- **Chain:** Arrange a solo manual hit order. The **Current target** shows public condition and a manual Attack link; **Skip target** removes exactly that one queued hit, without deleting a saved watchlist entry. Upcoming hits can be moved, removed, or searched through via pagination. Duplicate entries remain supported.
- **Attack:** Only opens Torn's native attack page when clicked. The toolkit never automatically attacks, consumes items, or plays for the user.
- Watchlists and solo chain entries remain in the browser under `combatWatchlist` and `combatSoloChain`; no account sync or cloud backup is included.

## War tab
- Enter the IDs of **your faction** and the **enemy faction**.
- Press **Load factions** to fetch both rosters from the official Torn API v2.
- Switch between your faction and the enemy in the War tab, search members by name or ID, and view five per page. Names, levels, public statuses, and manual Attack links remain available.
- Roster information does **not** reveal battle stats. Visit a player's profile for a conservative estimate where public information permits.

**Not yet included:** shared faction war plans, chain orders synchronized between members, faction-specific authentication, leadership-only editing, Xanax subscription activation, war score dashboards, or automated roster/target monitoring. These require additional API review and an authenticated backend. The current War tab is intentionally read-only.

## Privacy and compliance
- Your Torn API key is stored in your local userscript-manager/browser storage, never uploaded to a Torn Toolkit server.
- Requests are made to `api.torn.com` only. No non-API Torn scraping, continuous enemy-status scanning, webhooks or third-party analytics are used. Public target conditions come from `user/{id}/basic` API v2, loaded for the visible page of a list (at most 5 distinct targets) and refreshed only when requested. Results are cached in memory for 90 seconds.
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
