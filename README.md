# Humble Bundle Owned Overlay

A private Chrome extension that shows which games in a Humble Bundle you already own on Steam.

Adds an "Owned" badge to each game tile and a summary counter (e.g. *"You own 5 / 8 games in this bundle"*) to the top of every bundle page.

## How it works

- You stay logged into Steam in Chrome — the extension uses your existing session
- Clicking **Refresh from Steam** fetches your owned games once and caches them locally
- On any Humble Bundle page, each tile is matched against your library and badged

There are no automatic refreshes — only when you click the button.

## Security

- **No API key, no Steam ID, no passwords**
- Your Steam session cookies are HttpOnly — invisible to JavaScript, including this extension. Chrome attaches them silently to requests; nothing here can read or exfiltrate them
- Only the list of game appids and names is stored locally in `chrome.storage.local`
- Host permissions are scoped to `humblebundle.com`, `steamcommunity.com`, and `store.steampowered.com` — nothing else
- No analytics, no third-party services, no remote code

## Install

1. Download the ZIP from this repo (Code → Download ZIP) or `git clone`
2. Extract to a stable location (e.g. `C:\Users\you\Extensions\humble-owned-overlay`)
3. Chrome → `chrome://extensions` → enable **Developer mode**
4. Click **Load unpacked** and select the extracted folder

## Use

1. Click the extension icon in your toolbar
2. Click **Refresh from Steam** (you need to be signed into Steam in this browser)
3. Browse [humblebundle.com](https://www.humblebundle.com/) — owned games will be badged

Refresh whenever you've bought new games.

## Matching

Games are matched two ways, in order:

1. **By Steam appid** — extracted from the `store.steampowered.com/app/<id>` link inside each Humble tile. Bulletproof when present.
2. **By normalized title** — fallback for tiles that don't link to Steam. Strips edition suffixes (`Definitive Edition`, `GOTY`, etc.), trademark symbols, and punctuation before comparing.

## Project layout

```
humble-owned-overlay/
├── manifest.json     # MV3 manifest, minimal permissions
├── background.js     # service worker — Steam fetch + cache
├── content.js        # injected into humblebundle.com — scrape & badge
├── content.css       # badge + counter styling
├── popup.html/.js    # toolbar popup (refresh + stats)
├── options.html/.js  # settings page (refresh + cache info)
└── lib/normalize.js  # title-normalization helper (shared)
```

## Versions

- **v2.0.1** — switched from `rgGames` HTML scrape to Steam's XML feed + `dynamicstore/userdata` fallback
- **v2.0.0** — session-based auth (no API key), Steam appid matching, toolbar popup
- **v1.1.0** — don't persist the Steam API key, manual-only refresh
- **v1.0.0** — initial release with Steam Web API key

## License

See [LICENSE](LICENSE).
