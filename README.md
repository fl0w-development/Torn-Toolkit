# Torn Toolkit

combat userscript for torn. target watchlist, solo chain list, faction chain orders and war rosters, all in one panel with an aurora background. everything is manual, it never attacks or does anything for you.

current version: 0.8.5

## PDA-compatible rollback

**v0.8.5 is a rollback to the original v0.7.0 userscript behavior.** The activity tracker introduced in v0.8.0 and all later changes are paused because the panel stopped appearing in Torn PDA. The feature work is preserved in Git history and can be reintroduced carefully once tested on a real PDA device.

This restores the original v0.7.0 panel, page mounting, API calls and faction chain codes. The update uses version 0.8.5 so installed copies can receive it normally. This update does **not** delete existing watchlists, local chains, API keys, or stored activity-tracker data; the activity tracker simply isn't running.

In Torn PDA, replace/update the installed script from the raw main-branch source and reload Torn. If necessary, set injection time to **END**, matching the userscript's manager defaults as supported by PDA. The script metadata itself is restored exactly except for version numbers.

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

**settings**
api key and the aurora on/off switch. if your phone or computer has reduced motion turned on the aurora and stars dont move.

## api key

| | |
|---|---|
| data storage | only on your device |
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
