# Changelog

## v3.5.0

- Support Humble's redesigned (Next.js) game bundle pages: find game cards by their `data-testid` markers, badge the card thumbnail, and place the counter above the games grid.
- Wait briefly after a full page load before tagging the redesigned layout so the overlay does not cause a React hydration error.
- Keep the previous bundle discovery unchanged for the legacy layout in case Humble restores it.
- Support the redesigned public Humble Choice page: count games from the page's embedded data and badge the carousel thumbnails that are on screen. After in-site navigation to Choice from another page, reload once if no counter appears.
- Support the redesigned signed-in Choice page (`/membership/home`): badge the titled cards and show the counter above the grid. Its details dialog is badged too. On both redesigned Choice pages, games for other launchers count toward the total but cannot be marked owned; playtests and the IGN Plus offer are not counted.
- Simplify the settings page and toolbar popup: plainer wording, less text on screen, and colours that follow the browser's light or dark theme. Fetch behaviour is unchanged.
- Rewrite the README.

## v3.4.7

- Add a gamepad and ownership-check icon for the extensions page, toolbar, and installation screens in Chrome and Firefox.
- Include declared icon files in browser packages and validate them before release.

## v3.4.6

Chrome and Firefox release; browser-store submissions are separate.

The Firefox package is unsigned and uses temporary installation until Mozilla signs it.

Includes the reviewed reliability and Firefox work first tested locally as v3.3.10, while preserving the v3.4.5 canary toolbar popup.

- Add separate Chrome and Firefox MV3 packages from the same runtime files.
- Stop counter updates from repeatedly triggering DOM scans.
- Keep the public Choice counter visible across Humble's full grid width and support the populated mobile bundle view.
- Decorate responsive/carousel copies while counting each title only once.
- Remove stale owned badges and adapt Choice badges when CLAIMED changes.
- Update open Humble pages after a successful manual library refresh.
- Preserve the previous library and account when a refresh fails, and reject malformed game records before caching them.
- Add bounded Steam requests, structured errors, and reliable API-key input cleanup.
- Prevent unrelated titles from matching through empty normalized names.
- Add regression tests and browser-package validation to normal CI.

## v3.4.5

- Remove expanded bundle title Steam links because exact app links were not available consistently across Humble panels.

## v3.4.4

- Remove experimental Humble Library and Purchases page badging until those account layouts can be revisited.

## v3.4.3

- Fix Humble Library and Purchases badge detection on account list rows.
- Link more expanded bundle titles by reading exact Steam app links already present in the expanded panel.

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
