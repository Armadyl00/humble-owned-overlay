# Humble Bundle Owned Overlay

A personal Chrome extension that shows which games in a Humble Bundle you already own on Steam.

> **Disclaimer:** This extension was built collaboratively with [Claude](https://claude.com) for personal use and learning. I am not a software engineer. The code is published as-is — review it yourself before installing.

- Green **OWNED** badge on each game tile you already have
- "X / Y games owned" counter near the bundle title
- **OWNED** badges on matching Humble Library and Purchases entries


## Screenshots

**Options page**

<img src="docs/screenshots/options-page.png" alt="Humble Bundle Owned Overlay options page" width="659">

**Bundle overlay**

<img src="docs/screenshots/bundle-counter.png" alt="Bundle page counter showing seven of eight games owned" width="943">

**Owned game badges**

<img src="docs/screenshots/owned-badge.png" alt="Owned badges over Humble Bundle game tiles" width="949">

## How it works

You set up a Steam Web API key + SteamID64 once. On the extension's options page, paste those and click **Fetch library** — the extension fetches your owned games from Steam, stores **only the game list** locally, and immediately discards the API key. Next time you want to refresh (after buying new games), you paste the key again.

On supported Humble game bundle, Humble Choice, Library, and Purchases pages, each Steam game title is matched against your owned games (by normalized title) and badged. Non-Steam Choice items, playtests, books, and software bundles are ignored.

## Setup

1. **Get a Steam Web API key** at https://steamcommunity.com/dev/apikey (domain can be `localhost`)
2. **Get your SteamID64** at https://steamid.io
3. **Make sure your Steam profile + Game details are set to Public** (Steam → Privacy → Game details = Public)

## Install

1. Download the ZIP from this repo (Code → Download ZIP) — or `git clone`
2. Extract to a stable folder
3. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the folder
4. Right-click the extension → **Options** → paste your Steam API key + SteamID64 → click **Fetch library**

## Use

After the initial fetch, open any supported Humble game bundle, Humble Choice, Library, or Purchases page — owned Steam games get a green badge.

Whenever you want to refresh (e.g. after buying new games), open the extension options, paste the key, click **Fetch library**.

## Security

- **API key is never written to disk.** It only exists in memory long enough to call Steam, then gets wiped from the input field. Keep the key in a password manager and paste it whenever you want to refresh.
- **SteamID64 is stored** between sessions (it's a public identifier — not sensitive).
- Only the resolved game list is persisted in `chrome.storage.local`.
- Host permissions: only `humblebundle.com` and `api.steampowered.com`.
- No analytics, no third parties, no remote code.

If you ever want to rotate the key, click **Revoke** at https://steamcommunity.com/dev/apikey and generate a new one.

## Files

```
manifest.json       # MV3 manifest, minimal permissions
background.js       # service worker — Steam API fetch + cache
content.js          # runs on humblebundle.com — DOM scan + badging
content.css         # badge + counter styling
options.html/.js    # settings page
lib/normalize.js    # title-normalization helper (edition suffixes, etc.)
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

See [LICENSE](LICENSE).
