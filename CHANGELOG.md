# Changelog

## v3.4.2

- Link expanded bundle game titles to exact Steam store pages when the cached Steam library includes an app ID.

## v3.4.1

- Add a toolbar popup with library cache status and an options shortcut.

## v3.4.0

- Add `Owned` badges to matching Steam games on Humble Library and Purchases pages.

## v3.3.9

- Center the owned-games counter on the public Humble Choice membership page for signed-out and non-Choice users.

## v3.3.8

- Open the extension options page when the pinned toolbar icon is clicked.
- Add clean release package tooling for Chrome Web Store uploads.
- Move the README version history into this changelog.

## v3.3.8-canary.1

- Open the extension options page when the pinned toolbar icon is clicked.

## v3.3.7-canary.1

- Add canary prerelease automation that validates the extension, runs tests, builds a clean ZIP, and uploads it to GitHub Releases.
- Move the README version history into this changelog.

## v3.3.6

- Keep OWNED badges below Humble site navigation and Store dropdown menus.

## v3.3.5

- Show the loaded extension version on the options page.
- Position Humble Choice OWNED badges dynamically below CLAIMED badges.

## v3.3.4

- Move Humble Choice OWNED badges farther below CLAIMED badges so the two labels no longer overlap.

## v3.3.3

- Detect Humble Choice's plain `div` month headers and `.subhub-page` grid so the counter anchors above the real games panel.

## v3.3.2

- Keep the Humble Choice counter in the page flow above the games grid instead of letting Humble's layout push it to the top-right.

## v3.3.1

- Fix Humble Choice `/membership/home` by detecting Steam game cards in the logged-in claimed-games grid.

## v3.3.0

- Add Humble Choice page support for Steam-delivered games only.
- Ignore non-Steam Choice items and playtests.

## v3.2.0

- Only run on game bundle pages.
- Scope tile discovery to the tier container so cross-promo bundles are not counted.

## v3.1.0

- Restore the proven-working v1.1 architecture after v2.x and v3.0.x experiments were reverted.

## v3.0.x / v2.x

- Experiment with session-based auth. This never worked reliably and was reverted.

## v1.1.0

- Stop persisting the Steam API key.
- Keep library refresh manual-only.

## v1.0.0

- Initial release.
