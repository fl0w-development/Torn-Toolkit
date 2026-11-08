# Torn Toolkit

A clean, read-only helper for [Torn](https://www.torn.com) that keeps what you check all day in one small panel. It uses your own API key, which never leaves your browser except to talk to Torn's official API.

## Features

| Tab or feature | Where | What it does |
|---|---|---|
| **Timers** | Every page | Drug, booster and medical cooldowns, plus travel and education timers. Optional notifications when energy or nerve fills, a cooldown ends, you land, or a course finishes. Torn's own energy, nerve, happy and life bars are not duplicated. |
| **Travel** | Every page | Ranks every country by profit per hour for your travel type and carrying capacity. Shows the best items, cost, flight time and when you would be back (TCT). While abroad it lists the best buys in that country. It learns your real flight times, can cap spending per trip, and warns when your energy would fill while you are away. |
| **Live foreign stock** | Travel tab | On by default; can be turned off. Shows how many of each item are on the shelves abroad, limits suggestions to what is actually in stock, and records restocks and empty shelves it sees. |
| **Target** | Profile and attack pages | Estimated battle stat range, level, rank, status, last action, networth, attacks won/lost, Xanax taken and crimes. |
| **Training ratio** | Gym | Pick Balanced, Hank's, Baldr's or a custom ratio and your main stat. It tells you which stat to train next and how many trains, and puts a **Fill** button under that stat on the gym page. The button only types the number in; **you still press Train yourself**. After you train, the suggestion updates. It never trains past a specialist gym requirement your ratio relies on, shows which specialist gym requirements you meet, and offers the best stat your current gym can train when it can't train the one you need. |
| **Jump planner** | Gym | Reads your gym, its dots and energy per train, your stats and happy. Compares normal training against a happy jump (Ecstasy) or choco jump (candy), with the cheapest candy, its cost and your booster cooldown limit. |
| **Market values** | Every page | A small badge with the market value next to item images. |

Torn Toolkit integrates into the page instead of using a floating panel. The compact in-page header keeps Settings (⚙) within reach; click the arrow to expand the full toolkit. Gym, profile/attack, and travel pages automatically open the matching tools. It adapts to narrow screens and touch controls, and each feature can be disabled in Settings.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the [direct Torn Toolkit installer](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js) and approve **Install** in Tampermonkey/Violentmonkey. If you see the source code instead, use your userscript manager's **Install from URL** option with that same address.
3. On Torn, expand the **Torn Toolkit** section (if needed), click **Add API key**, and paste a **Limited Access** key (see [Which API key you need](#which-api-key-you-need)). Your key remains saved in the userscript manager's storage after that; you won't need to re-enter it on every page.

If you already pasted the script manually into Tampermonkey, **disable the older copy** when installing from the link above to prevent duplicate panels.

**Mobile browsers:** this is a responsive userscript, not a standalone mobile extension. Install it using a mobile userscript manager (or Torn PDA on supported devices). Mobile browsers without userscript support cannot run it. The inline header is touch-friendly and doesn't cover Torn's action buttons.

**Torn PDA:** add the script under Settings → Userscripts. PDA fills in your key automatically. If live foreign stock can't load there, the Travel tab says so and everything else keeps working.

## Which API key you need

**Use a Limited Access key.** Every feature works fully with it. You never need Full Access, so don't give this script, or any script, more access than it needs.

| Feature | Key level needed |
|---|---|
| Status panel: bars, cooldowns, travel, education | Minimal |
| Jump planner: your active gym | Minimal |
| Training ratio (needs your battle stats) | **Limited** |
| Jump planner: filling in your battle stats | **Limited** |
| Travel: filling in how many items you can carry | **Limited** |
| Target estimate, market values, gym list, candy and foreign shop prices | Public |
| Live foreign stock | No key (it comes from YATA) |

- **Limited:** everything works automatically.
- **Minimal:** the training ratio is unavailable; everything else works, but you type in your battle stats and carrying capacity yourself. The panel asks when it needs them.
- **Public:** not enough. The status panel and travel helper need at least Minimal.

To create one, go to Torn → Settings → API Keys, choose **Limited Access**, and name it something like "Torn Toolkit" so you can recognise or delete it later.

## How your API key is used

These are Torn's [API Terms of Service](https://www.torn.com/api.html) fields:

| | |
|---|---|
| **Data storage** | Only locally, in your browser. Game data is cached for 1 minute to 24 hours. |
| **Data sharing** | Nobody. Live foreign stock downloads YATA's public list and sends nothing to it. |
| **Purpose of use** | Not eligible: only you see the data. |
| **Key storage & sharing** | Stored locally, not shared. Sent only to `api.torn.com`, in a request header. |
| **Key access level** | Limited Access. Minimal also works; you then type in your battle stats and travel capacity yourself. |

### Torn's rules

- **Read-only:** the script never clicks, buys, trains, travels or attacks for you. The gym Fill button only types a number into Torn's box; it sends nothing, and you press Train yourself (one click, one action).
- **Data sources:** it only uses data from the official API or from the page you are already viewing. It never requests other torn.com pages.
- **Minimal requests:** each feature asks only for the selections it needs. Results are cached and shared between tabs: the status panel makes one call a minute, and item prices update hourly.
- **Rate limit:** it stays far below Torn's limit of 100 requests a minute and backs off when the API asks it to.
- **Bad keys:** an invalid, paused or disabled key is removed as soon as Torn reports it, so it cannot get your IP blocked.

### Third-party service

**Live foreign stock** is on by default; turn it off in settings if you prefer. While it is on, the script downloads [YATA](https://yata.yt)'s public stock list every 5 minutes. No API key or player data is sent; like any website, YATA can see your IP address. See [YATA's terms of service](https://yata.yt/tos).

## Accuracy

- **Battle stats** use Torn's documented rank-trigger brackets. The estimate is low-confidence even when all required public data is available: stat balance, historic networth (ghost ranks) and delayed rank updates can make it wrong. Missing public inputs now show "Insufficient public data" rather than being counted as zero. It is not a spy report or a fight-win prediction.
- **Gym gains** use the community gym formula without perks, so they are an estimate.
- **Training ratios** are built from the specialist gym rules (each needs 1.25× or more): Hank's keeps your main stat's single-stat gym and the opposite pair's gym; Baldr's keeps your main stat's single-stat gym and its own pair gym. Targets aim at 1.27× so a normal train never drops you below a line.
- **Travel profit** assumes you resell at market value. Items with under a 5% margin are skipped because market value can't back up that little profit. Ticket costs are not included.
- **Flight times:** until the script has seen you fly a route, times come from the standard table (Torn Travel Handbook; Torn says real flights vary by ±3%). They are marked ≈. Airstrip, WLT private jet and business class are 30%, 50% and 70% faster.
- **Foreign stock** is reported by players through YATA and can change before you land. Restock times are only the ones this script has seen itself while you had Torn open. No public source predicts restocks.

## Development

```bash
npm test
```

The tests cover the stat estimate, gym formula, candy parsing, booster limits, API error handling, notifications, flight times and travel ranking. They use real public Torn API and YATA responses as fixtures, need Node 18+ and have no dependencies.

## License

MIT
