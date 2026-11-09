# Torn Toolkit — Combat Edition

**Version 0.6.2** · A small, manual combat companion userscript for [Torn](https://www.torn.com). No external server or VPS is required; faction chain orders can be shared manually using a leader-generated code.

## Install
1. Install a supported userscript manager (Tampermonkey, Violentmonkey, or Torn PDA if compatible).
2. [Install the latest userscript](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js).
3. Add your Torn API key under **Settings**. Existing keys from prior Torn Toolkit versions remain locally stored.
4. Disable duplicate copies of earlier Torn Toolkit scripts in your userscript manager.

### On a phone or tablet
- **Torn PDA** (Android and iPhone): add the script under Settings → Userscripts. PDA fills in your API key automatically.
- **Android:** Firefox with the Tampermonkey or Violentmonkey add-on.
- **iPhone and iPad:** Safari with a userscript extension such as Tampermonkey or Userscripts.

On touch screens, buttons and text boxes get larger, and text boxes are sized so iPhones don't zoom in when you tap them. Confirmations use **tap again to confirm** instead of browser pop-ups, which some in-app browsers don't show. If copying a share code is blocked, the code is selected so you can long-press and copy it.

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

The default `npm test` command runs current Combat Edition tests from the `tests/` folder. The older `test/logic.test.js` suite documents superseded travel/gym modules and can be examined with `npm run test:legacy`, but is **not expected to pass against Combat Edition** because those features were intentionally removed in v0.5.0. Faction sharing codes are tested with the other Combat Edition JavaScript tests.

## Faction Chain — no-server share codes

Faction Chain does **not require a hosted service, HTTPS setup, server login, or extra API key**.

1. Open the Faction Chain tab. Your existing local Torn API key is sent **directly to Torn** to verify your account ID and faction membership. Leader/co-leader status is also checked with Torn.
2. The faction leader or co-leader chooses **Build chain order**, adds/reorders player IDs or imports their own Solo Chain, then presses **Generate share code**.
3. The leader copies the generated code into the faction's private chat or another trusted faction-only channel.
4. Members copy the code, open the Faction Chain tab, and select **Pull from clipboard** (where supported), or paste the code and select **Load order**. The toolkit checks the member's faction ID, that the code matches their faction, and that the **claimed author ID** corresponds to a current leader or co-leader. It saves a local copy and displays the numbered plan, public status labels and manual Attack shortcuts.

**Important limitations:** Torn's API is read-only and does not expose a writable custom faction-plan datastore or private faction forums. Consequently, **the order cannot be fetched automatically from the leader's browser** using an API key alone. The leader must send a new code after every revision; members manually import it. Codes are **not digitally signed**, so a malicious member could forge a code claiming to be from leadership. Only accept codes directly posted by trusted leadership in your faction's chat. Loading a code does not establish cryptographic author authenticity or automatically update other members' copies.

No API key is embedded in the plan code. Each stored plan belongs to a verified faction ID and remains on the member's device. Solo Chain is not automatically shared or overwritten.

## War tab
- Enter the IDs of **your faction** and the **enemy faction**.
- Press **Load factions** to fetch both rosters from the official Torn API v2.
- Switch between your faction and the enemy in the War tab, search members by name or ID, and view five per page. Names, levels, public statuses, and manual Attack links remain available.
- Roster information does **not** reveal battle stats. Visit a player's profile for a conservative estimate where public information permits.

**Not yet included:** full shared war-planning dashboards, role-delegated war-officer editing, Xanax subscription activation, war score dashboards, or automated target monitoring. Faction Chain uses manually shared codes and does not require a backend. The War tab remains read-only.

## Privacy and compliance
- Your Torn API key is stored locally and sent only to `api.torn.com` for normal features and Faction Chain identity checks. No toolkit server, external HTTPS address, or third-party service receives the key.
- A shared plan code contains faction ID, claimed creator ID, creation time, and player IDs. Anyone who obtains that code can read it and potentially forge one; share it privately with trusted faction members.
- Public target conditions come from `user/{id}/basic` API v2, loaded for the visible page (maximum five distinct targets) and cached for 90 seconds.
- Status is an API snapshot, not certain attack eligibility: Hospital/Jail/Federal/Fallen appear unavailable, Traveling/Abroad are location-dependent, and Okay is only likely available.
- All attacks remain manual, and estimates are broad, low-confidence ranges, not confirmed stats or win predictions.

## Migration from v0.4.3
This is a **focused rewrite**. General-purpose tools (travel profitability, gym planner, market badges, and the standalone status panel) are not present in v0.5.0. The previous implementation remains recoverable in Git history. Legacy saved settings are left in storage but not used by Combat Edition.

## Roadmap
1. Test faction membership, leader/co-leader detection and share-code import with real Torn API keys.
2. Test clipboard importing on Tampermonkey and Torn PDA/mobile browsers.
3. Consider optional automatic synchronization only if an appropriate shared storage method is approved later.
4. Evaluate a future Premium offering separately. Premium billing is not implemented.

## License

**Torn Toolkit v0.5.4 and subsequent original releases** are offered under the [PolyForm Strict License 1.0.0](LICENSE) (source-available, **not open source**). Copyright © 2026 fl0w-development.

- You may install and run an unmodified release for personal, noncommercial use, including normal gameplay.
- You do **not** receive permission under this license to redistribute, resell, modify, publish derivatives of, or repackage current releases. Contact the copyright holder for separate written permission or commercial licensing.
- Premium access, when offered, would be a separate subscription entitlement. This repository does **not** implement Premium billing. Faction Chain code sharing is a convenience feature, not secure server-enforced authorization.
- **Existing MIT grants remain valid** for releases and code previously made available under MIT (including v0.5.3 and earlier). This change does not revoke those permissions. Their original MIT license remains in the repository history; see the [previous license](https://github.com/fl0w-development/Torn-Toolkit/blob/5bf015d6e82e1656405f755f404959c3c20bbb57/LICENSE).
- As a public GitHub repository, it can still be viewed and forked under GitHub's Terms of Service; the license does not grant broader redistribution rights for the newly licensed material.

Questions about permission can be raised with the repository owner before redistribution or commercial use.
