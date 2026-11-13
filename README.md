# Torn Toolkit

combat userscript for torn. target watchlist, solo chain list, faction chain orders and war rosters, all in one panel with an aurora background. everything is manual, it never attacks or does anything for you.

current version: 0.8.4

## torn pda

version 0.8.4 uses PDA-compatible document-end injection and a top-right launcher inside the PDA browser, away from the browser's bottom controls. It also retries mounting briefly when the page's DOM is not ready. The same source remains compatible with desktop userscript managers.

**Important:** Torn PDA does not necessarily replace an installed script automatically when GitHub changes. Open **Settings → Userscripts** (or **Advanced Browser Settings → Manage Scripts**, depending on app version), update Torn Toolkit from its raw source, ensure it is enabled, set injection time to **END**, and reload the **in-app Torn browser**. The updated script should display **v0.8.4** in its header.

If the launcher is still absent, look for a red crash alert at the top of Torn PDA's browser. If neither appears, the script may not have injected; check its enabled state and match permissions before investigating its API key.

## panel visibility

the panel is now a fixed dock in the bottom-right corner, rather than being inserted into Torn's content containers. those containers sometimes hide or get replaced, which could make the toolkit disappear.

- collapsed: small Torn Toolkit header with an expand arrow
- expanded: the same aurora interface with its own internal scroll
- works on different Torn pages without pushing the rest of the page down
- keeps existing saved watchlists, chain orders, API key and collapse setting

if the panel still doesn't appear, confirm the script is enabled and allowed to run on Torn in your userscript manager. the script also shows a red error strip if its startup fails.

## install

1. get tampermonkey or violentmonkey
2. [install the script](https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js)
3. open settings in the panel and paste your api key (a public key is enough)

if you had an older version of torn toolkit installed turn it off so you dont have two panels.

### phone

- torn pda: add it under settings > userscripts, pda puts your key in for you
- android: firefox with tampermonkey or violentmonkey
- iphone/ipad: safari with tampermonkey or the userscripts app

## what it does

**targets**
add people by id, sort them into categories, add notes and see if they are okay, in hospital, jail or traveling. on someones profile it shows a rough stat estimate (its only a guess from public info).

**solo chain**
your own hit list. shows who is next with an attack button, skip takes them off the chain but keeps them on your watchlist. you can move hits up and down.

**faction chain**
leaders and co-leaders make a chain order and get a code. post the code in faction chat, members paste it in and load it. the script checks with torn that the code is for your faction and that the person who made it is actually a leader.

the codes arent signed so only load ones your leadership actually posted. you need a new code every time the order changes.

**war**
put in your faction id and the enemy faction id to see both rosters with statuses and attack links. no battle stats here, its just public info.

**enemy activity**
once you load an enemy faction in the war tab the script checks their member list about every 5 minutes while you have torn open. the activity tab shows a week heatmap (tct) of when they're usually online, their quietest window and busiest hour, and a little 24h strip for each member with when they're usually offline. people on your watchlist who are in that faction get a "usually offline" line too.

it needs a few sessions before it has enough to go on. old activity fades out over about a month. its all saved in your browser only, you can turn it off or clear it in settings.

**settings**
api key, aurora on/off, activity tracking on/off and clear activity data. if your phone or computer has reduced motion turned on the aurora and stars dont move.

## api key

| | |
|---|---|
| data storage | only on your device (activity history fades out over about a month) |
| data sharing | nobody |
| purpose of use | just for you, nothing is collected |
| key storage & sharing | saved in your browser, only sent to api.torn.com |
| key access level | public is enough for everything |

no server, nothing gets sent anywhere except torn's api.

## issues

message me in torn: [fl0ww_ [4605130]](https://www.torn.com/profiles.php?XID=4605130)

## license

0.5.4 and newer are under the [PolyForm Strict License 1.0.0](LICENSE). you can install and use it as is for yourself, but dont copy, change, reupload or sell it without asking me first.

0.5.3 and older were MIT and those stay MIT ([old license](https://github.com/fl0w-development/Torn-Toolkit/blob/5bf015d6e82e1656405f755f404959c3c20bbb57/LICENSE)).

## tests

`npm test`
