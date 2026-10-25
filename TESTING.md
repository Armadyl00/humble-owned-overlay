# Browser acceptance checks

See [BROWSER-VALIDATION.md](BROWSER-VALIDATION.md) for the completed local checks and their limits. The checklist below also covers cases that still require a real Steam account, a signed-in Humble session, or final distribution packages.

Run `npm ci --ignore-scripts`, `npm test`, `npm run validate`, `npm run build:zip`, and `npm run lint:firefox` first. The automated tests use the real runtime scripts with mocked browser APIs and a jsdom document. They cover MutationObserver scheduling and DOM changes but do not render Humble, use a real Steam account, validate native extension permissions, or prove browser layout.

Load `dist/chrome` into a separate Chrome test profile and `dist/firefox/manifest.json` as a temporary add-on in Firefox. Keep the published Chrome v3.3.9 version available in a different profile as a comparison. Use current stable desktop browsers; Firefox's declared minimum is 140. Android has not been verified.

Record the browser version, page URL, login state, expected count, observed count, and any console errors for each relevant case:

- Fresh installation: the popup shows the correct version and cache status; **Open settings** opens options with no prefilled API key. Installing/updating must not open unsolicited tabs or contact Steam.
- Import a valid public Steam library. Confirm the cached count, saved account ID, and key-field cleanup. Inspect extension-local storage to confirm the key is absent.
- Compare known owned/unowned games on an ordinary bundle, public `/membership`, and logged-in `/membership/home`. Check total counts, playtest/non-Steam Choice exclusion, and cross-promotion exclusion.
- Compare desktop and narrow layouts, lazy-loaded cards, tier changes, and navigation dropdowns. Check that OWNED remains readable below CLAIMED and does not cover site menus.
- Open an already tagged page, buy/add or otherwise change a controlled test library, and refresh manually. The open page should update without contacting Steam itself.
- Try a wrong key, unavailable/private library, disconnected network, revoked Steam host permission, and a deliberately slow request. The button must recover, the key must clear, and the last valid library/account must remain available.
- Navigate between supported pages and books/software/listing pages, including back/forward. Check that overlays disappear and return correctly, without duplicates.
- Let a tagged page become idle. Use DevTools to check that overlay scans stop until relevant page changes occur.
- Close the extension debugger, let the background stop, and repeat a cache read and manual refresh. Restart the browser and confirm cached ownership still works.
- Before distribution, test the actual Chrome ZIP and Mozilla-signed Firefox package, including installation permissions and denied/revoked site access. Temporary add-on permission behavior can differ from a signed install.

Matching remains title-based. Edition equivalence, complete DLC ownership, mixed-platform ordinary bundles, and all non-Latin title matching are not guaranteed by this release. Test specific examples before changing these semantics.
