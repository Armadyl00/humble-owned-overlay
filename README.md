# Humble Bundle Owned Overlay

A private Chrome extension that shows which games in a Humble Bundle you already own on Steam.

- Floating "X / Y games owned" counter in the top-right corner of every bundle page
- Green **OWNED** badge on each game tile you already have

## How it works

On a Humble Bundle bundle page (`/games/...`), the extension:

1. Reads Humble's own embedded `webpack-bundle-page-data` JSON for the canonical list of games in the bundle.
2. For each game, looks up the Steam appid via Steam's `storesearch` API (cached locally so each game is only ever searched once).
3. Reads your owned-app list from `store.steampowered.com/dynamicstore/userdata/` using your existing Steam login (your session cookies are HttpOnly — invisible to this extension).
4. Compares appids and badges any matches.

No setup, no API key, no Steam ID, no popup, no options page. Just install and open Humble Bundle.

## Install

1. Download the ZIP from this repo (Code → Download ZIP) — or `git clone`
2. Extract to a stable folder
3. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the folder
4. Make sure you're signed into Steam in this Chrome browser (check at https://store.steampowered.com/)

That's it. Open any Humble Bundle game bundle page to see badges and the counter.

## Security

- **No API key, no Steam ID, no passwords stored**
- Steam session cookies are HttpOnly — JavaScript (including this extension) cannot read them. Chrome attaches them silently to requests.
- The only thing persisted in `chrome.storage.local` is a small cache of `{game name: Steam appid}` lookups, so the same name isn't re-searched on every page visit.
- Host permissions: only `humblebundle.com` and `store.steampowered.com`.
- No analytics, no third parties, no remote code.

## Files

```
manifest.json   # MV3 manifest, minimal permissions
content.js      # runs on bundle pages — extract, match, badge
background.js   # service worker — Steam userdata + storesearch
content.css     # badge + counter styling
```

## Versions

- **v3.0.0** — major simplification: no popup, no options, no refresh, no XML feed. Just visit a bundle page.
- **v2.1.0** — embedded bundle JSON + Steam storesearch
- **v2.0.x** — session-based auth, toolbar popup
- **v1.x** — Steam Web API key

## License

See [LICENSE](LICENSE).
