# Torn Toolkit — Combat Edition

**Version 0.6.1** · A small, manual combat companion userscript for [Torn](https://www.torn.com). Core tools run without a VPS; optional Faction Chain sharing requires a separately deployed HTTPS backend.

## Install
1. Install a supported userscript manager (Tampermonkey, Violentmonkey, or Torn PDA if compatible).
2. [Install the latest userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js).
3. Add your Torn API key under **Settings**. Existing keys from prior Torn Toolkit versions remain locally stored.
4. Disable duplicate copies of earlier Torn Toolkit scripts in your userscript manager.

## Compact workspace

Torn Toolkit now stays inside a **660px-wide, bounded panel**, rather than becoming a very long full-width section that pushes Torn's content down the page. On desktop the content area is capped at **406px** (or 55% of the viewport height, whichever is smaller); mobile uses a smaller cap. When a list grows, scroll **inside the toolkit** instead of scrolling through thousands of pixels of Torn's page.

- One row of tabs: **Targets**, **Solo Chain**, **Faction Chain**, and **War**. Settings opens *inside the same bounded panel* from the header.
- The **up arrow (▴)** collapses the toolkit to a slim title bar; **down arrow (▾)** expands it. New installs start collapsed to keep Torn uncluttered, while previously saved open/closed preferences are preserved.
- Small target/queued counts are visible in the header on desktop.
- Watchlist entries and faction members are shown in **five-item pages**, with search. The Chain tab keeps the current hit prominently visible and displays up to **four upcoming hits per page**.
- Lists never lose entries merely because they are on another page. A previously saved watchlist or chain is not cleared by this UI update.

## Aurora command center — v0.6.0

A major visual redesign rather than another gray card reskin:

- A midnight-blue, translucent-glass panel with **two slow, layered aurora-borealis effects** in teal, violet, and blue. The moving light is pure CSS, so the toolkit makes **no additional network requests or image downloads**.
- A distinctive **T** emblem, compact command header, small target/queue counters, and three prominent navigation tabs.
- Softly illuminated action buttons, restrained luminous condition dots, and a highlighted current target. Readable text sits above the ambient effect.
- Choose **Settings → Aurora ambience** to turn the visual effect on or off. The preference is stored on your device, and `prefers-reduced-motion` users receive a subtle, **static** glow rather than animation.
- The bounded layout remains intact: maximum desktop width **660px**, scrollable inner area at most **406px or 55vh**, and a smaller mobile cap. It does **not** extend Torn's page for long lists.

The original public-data and manual-combat behavior remains unchanged. The toolkit does not animate Torn's game UI, only its own decorative background. Status details can be seen by hovering a condition label, while the concise condition remains visible in the row.

## Targets and Chain tabs

- **Current profile target:** On player profile/attack pages, the Targets tab shows the public rank-based battle-stat estimate with its low-confidence or missing-data warning.
- **Targets/watchlist:** Add players by Torn ID or use **+ Watch** on a profile. Search, categorize, edit notes and remove targets. View public conditions (Okay, Hospital, Jail, Traveling/Abroad), in pages of up to five. **Refresh conditions** requests a new snapshot.
- **Chain:** Arrange a solo manual hit order. The **Current target** shows public condition and a manual Attack link; **Skip target** removes exactly that one queued hit, without deleting a saved watchlist entry. Upcoming hits can be moved, removed, or searched through via pagination. Duplicate entries remain supported.
- **Attack:** Only opens Torn's native attack page when clicked. The toolkit never automatically attacks, consumes items, or plays for the user.
- Watchlists and solo chain entries remain in the browser under `combatWatchlist` and `combatSoloChain`; no account sync or cloud backup is included.

## Tests

The default `npm test` command runs current Combat Edition tests from the `tests/` folder. The older `test/logic.test.js` suite documents superseded travel/gym modules and can be examined with `npm run test:legacy`, but is **not expected to pass against Combat Edition** because those features were intentionally removed in v0.5.0. Backend permissions are tested separately with `python -m unittest discover -s server -p 'test_*.py' -v`.

## Faction Chain — optional shared order

The new **Faction Chain** tab lets a verified Torn faction leader/co-leader create and publish a numbered list of targets, rearrange the order, or import their own private Solo Chain as a draft. Members of that same faction can view the published plan, check recent public target conditions, and open **manual Attack** links, but **cannot edit or publish** the plan. A saved plan is shared through a separate HTTPS server and refreshed about once a minute while the tab is open. No attack automation is involved.

**This does not go live automatically when you install the script.** Faction sharing requires deployment of the optional [faction chain backend](server/README.md) to your VPS behind HTTPS. It validates Torn identity using the existing user's key and stores a published plan per verified faction ID.

**Key privacy/opt-in:** Other local toolkit features send the user's key directly to Torn. For Faction Chain, each player must configure the exact HTTPS service URL and explicitly press **Connect faction**; only then is their existing key transmitted to that service for Torn-backed identity and role verification. The service does not store the key, instead issuing a short-lived session token. Members should only connect to a faction service they trust. No API key, account information or faction plan is publicly published through GitHub.

The standalone private Solo Chain is unchanged and **never automatically synced** with the faction's plan. Leadership can deliberately copy it into a draft, review it, then publish. A leader's unsaved draft remains local to that browser session. Multiple leaders are protected from silently overwriting each other's changes with revision checks.

## War tab
- Enter the IDs of **your faction** and the **enemy faction**.
- Press **Load factions** to fetch both rosters from the official Torn API v2.
- Switch between your faction and the enemy in the War tab, search members by name or ID, and view five per page. Names, levels, public statuses, and manual Attack links remain available.
- Roster information does **not** reveal battle stats. Visit a player's profile for a conservative estimate where public information permits.

**Not yet included:** full shared war-planning dashboards, role-delegated war-officer editing, Xanax subscription activation, war score dashboards, or automated target monitoring. The basic published Faction Chain is available once its optional authenticated service is deployed. The War tab remains read-only.

## Privacy and compliance
- Your Torn API key is stored locally for normal toolkit features. **Only if you explicitly connect Faction Chain**, the key is sent once over HTTPS to the separately configured faction service for identity verification. That service discards the key after authentication.
- Normal toolkit requests are made to `api.torn.com`. Shared Faction Chain sessions and published plans additionally contact only the optional HTTPS URL entered in Settings. No non-API Torn scraping, continuous enemy-status scanning, webhooks or third-party analytics are used. Public target conditions come from `user/{id}/basic` API v2, loaded for the visible page of a list (at most 5 distinct targets) and refreshed only when requested. Results are cached in memory for 90 seconds.
- Conditions are a **snapshot**, not guaranteed attack eligibility: Hospital/Jail/Federal/Fallen are flagged unavailable; Traveling/Abroad are location-dependent; Okay indicates only likely availability. End times are sourced from Torn and can become stale.
- All game interactions are manual. Each Attack button only navigates to Torn's native attack page.
- Public stat estimates are broad rank-trigger brackets, **not spies, exact stats, or win predictions**.

## Migration from v0.4.3
This is a **focused rewrite**. General-purpose tools (travel profitability, gym planner, market badges, and the standalone status panel) are not present in v0.5.0. The previous implementation remains recoverable in Git history. Legacy saved settings are left in storage but not used by Combat Edition.

## Roadmap
1. Test Combat Edition in Torn on desktop and mobile, including faction chain login and leader/member permissions.
2. Validate faction roster shape and API key permission behavior with real responses.
3. Deploy the optional shared Faction Chain service and test HTTPS, membership and publishing.
4. Implement server-enforced leader/co-leader/authorized war-officer permissions, draft/publish revisions, and audit logs.
5. Pilot faction access before considering in-game Xanax subscriptions.

Faction Chain publish permissions are enforced server-side when the optional service is deployed. The War tab itself remains read-only; Premium access is not implemented.

## License

**Torn Toolkit v0.5.4 and subsequent original releases** are offered under the [PolyForm Strict License 1.0.0](LICENSE) (source-available, **not open source**). Copyright © 2026 fl0w-development.

- You may install and run an unmodified release for personal, noncommercial use, including normal gameplay.
- You do **not** receive permission under this license to redistribute, resell, modify, publish derivatives of, or repackage current releases. Contact the copyright holder for separate written permission or commercial licensing.
- Premium access, when offered, would be a separate subscription entitlement. This repository does **not** implement Premium billing; the shared Faction Chain backend enforces faction role permissions separately.
- **Existing MIT grants remain valid** for releases and code previously made available under MIT (including v0.5.3 and earlier). This change does not revoke those permissions. Their original MIT license remains in the repository history; see the [previous license](https://github.com/fl0w-development/Torn-Toolkit/blob/5bf015d6e82e1656405f755f404959c3c20bbb57/LICENSE).
- As a public GitHub repository, it can still be viewed and forked under GitHub's Terms of Service; the license does not grant broader redistribution rights for the newly licensed material.

Questions about permission can be raised with the repository owner before redistribution or commercial use.
