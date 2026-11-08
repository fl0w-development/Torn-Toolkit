# Torn Toolkit

A userscript for [Torn](https://www.torn.com) that puts the things every player checks all day on one screen. It uses your own API key and runs only in your browser.

## Features

| Module | Where | What it does |
|---|---|---|
| **Status HUD** | Every page | Energy, nerve, happy and life with "full in" timers; drug, booster and medical cooldowns; travel ETA; education timer. Optional notifications when a bar fills or a cooldown ends. |
| **Market values** | Every page | A small badge with the market value next to every item image (inventory, item market, bazaars, trades). |
| **Target estimate** | Profile and attack pages | Estimated battle stat bracket, level, rank, status, last action, networth, attacks won/lost and Xanax taken. |
| **Jump planner** | Gym | Compares gains at normal happy against a happy jump (Ecstasy) or choco jump (candy), and shows the cheapest candy and how much the extra happy costs. |

Panels can be dragged and minimised, and each module can be turned off in settings (⚙).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Open [`torn-toolkit.user.js`](torn-toolkit.user.js), click **Raw**, then click **Install** when Tampermonkey asks.
3. On Torn, click ⚙ on the Torn Toolkit panel and paste an API key. A **Limited Access** key is enough (Torn → Settings → API Keys).

## Privacy and Torn's rules

- Your key is stored in your browser's userscript storage. It is sent only to `api.torn.com`.
- The script is **read-only**: it never clicks, buys, attacks or does anything in the game for you.
- API responses are cached (bars every 60s, item data hourly, profiles for 5 minutes), and the script caps itself at 50 calls a minute, half of Torn's limit.

## Accuracy

- **Battle stat estimates** use the community rank-trigger method: a rough bracket, not exact stats.
- **Gym gains** use the community gym formula and ignore perks, so treat them as estimates. Enter the gym dots shown on your gym.

## Development

```bash
npm test
```

Tests cover the pure logic: stat estimation, gym simulation, candy parsing and formatting. They need Node 18+ and have no dependencies.
