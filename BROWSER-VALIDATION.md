# Local browser validation — 2026-10-25

The local v3.3.10 development build passed the checks below. The comparison baseline is unchanged Chrome v3.3.9 at repository commit `e60c203c05f603814acb3683f60ae64172f8fa5d`. Nothing has been submitted to a browser store.

## Canary integration: v3.4.6

The reviewed work was merged onto the existing v3.4.5 canary source as v3.4.6. The toolbar popup, its script, and its manifest declaration were preserved; the reverted account-page badges and expanded Steam links were not restored. The shared background/content/options scripts, CSS, and normalizer remain byte-identical to the tested v3.3.10 build. The manifest retains the canary popup declaration and advances the version.

- 59 automated tests passed, including four new popup behavior and package-completeness regressions. Both browser builds passed validation; Firefox lint reported zero errors, warnings, and notices.
- Native Chromium 156.0.8078.47 and Firefox 158.0.1 passed the live Choice/bundle count checks at desktop and narrow widths, failed-refresh recovery, and idle checks again. Chromium's stopped worker recovered through a cached read.
- Both browsers also passed native fresh/cached popup checks, stale-badge removal, cache-change propagation, and final visual counter/badge checks.
- Both runtime ZIPs contain eleven files, including the popup and its script, without development dependencies. Independent archive checks confirmed each package matches the merged source.
- The earlier v3.3.10 Chrome test ZIP is retained under `test-builds/` for comparison. The current Chrome and unsigned Firefox v3.4.6 downloads are documented in `test-builds/README.md`.

## Release acceptance

The user confirmed successful testing with signed-in Humble pages and a real Steam library. This is user-reported acceptance, separate from the synthetic-library automation above.

Fresh disposable Chromium 156.0.8078.47 and Firefox 158.0.1 profiles both returned `isOnToolbar: false` from their native action APIs. No extension code changes were needed for toolbar placement. Install/update handlers only scrub the legacy API key, and additional regression checks protect that behavior.

The final suite passes 63 tests. Both validators and Firefox lint pass. Rebuilt Chrome and Firefox ZIPs are byte-identical to the v3.4.6 packages accepted by the user; the final changes affect documentation, tests, and release automation.

GitHub publishes the versioned Chrome and unsigned Firefox packages after validation succeeds on `main`. Existing release tags/assets are preserved on subsequent pushes with the same version. This does not publish to either browser store.

## Environment and method

Tests ran on Ubuntu 24.04 ARM64 using native headless Chromium 156.0.8078.47 and Firefox 158.0.1, driven through their WebDriver implementations in disposable profiles. Chromium is not branded Google Chrome. Firefox loaded the unsigned build temporarily. These checks establish behavior in the tested browser versions; they do not establish behavior at the declared Firefox 140 minimum or on Android.

Ownership caches contained synthetic Steam game records, never a user's Steam library or API key. Live tests loaded the public Humble pages below while signed out. Successful Steam responses were covered by the automated mocked-API tests, not by a real account import.

## Completed checks

| Check | Chromium | Firefox |
| --- | --- | --- |
| Native extension loading, options initialization, and cached background messaging | Passed | Passed |
| Public Choice: two owned games out of eight eligible Steam games | Passed | Passed |
| Ordinary game bundle: two owned games out of eight | Passed | Passed |
| Desktop width 1440 and narrow width 390 in Chromium / 500 in Firefox | Passed | Passed |
| Single counter, repeated carousel cards decorated without increasing totals | Passed | Passed |
| No overlay mutations during a 1.3-second idle sample on either live page | Passed | Passed |
| Steam rejects a deliberately invalid test key with HTTP 401; controls recover, key clears, previous account/cache remain | Passed | Passed |
| Stop the service worker, verify it disappears, then wake it through a cached library read | Passed | Not applicable to this Firefox background model |
| Choice counter and visible owned badge actually paint unobscured at desktop and narrow widths, after dismissing the cookie banner | Passed | Passed |
| Humble-origin synthetic fixture: stale badge removal and cache-change propagation | Automated DOM coverage | Native browser check passed |

The live pages were [public Choice](https://www.humblebundle.com/membership) and [Puzzlers to Puzzle You](https://www.humblebundle.com/games/puzzlers-to-puzzle-you). Choice showed ten public items; the expected total excluded IGN Plus and a playtest, leaving eight eligible Steam games. The bundle's charity entry was excluded from its eight-game total. These pages can change after this test date.

The final visual run used a synthetic cache matching all eight eligible Choice games so the active card's badge could be inspected. Geometry checks were supplemented by native hit testing and screenshot inspection: a centered bounding box alone did not prove that the counter painted above Humble's carousel background.

## Issues confirmed against v3.3.9 and fixed locally

- Public Choice's desktop grid squeezed the counter into a 78-pixel column on the right. The counter now spans the grid and paints above the carousel background.
- Narrow ordinary bundle pages could have an empty desktop tier container and a populated mobile container. The old build produced no badges or counter in this case; the development build selects the populated visible container and retags on resize.
- Responsive/carousel copies need badges on each physical card while totals count each title once. Discovery and stale-badge cleanup now preserve this distinction.
- On both tested live pages, the baseline generated 12 overlay mutations in a 1.3-second idle sample. The development build generated zero in the corresponding samples. This is a short observation of overlay mutations, not a general CPU benchmark.

The baseline's failed narrow-bundle assertion is evidence of the pre-existing issue; both development-build live-page runs passed.

## Automated and package validation

- 55 automated tests passed, including duplicate-card, mobile-container, cache-update, malformed-response, timeout, error-cleanup, and browser-manifest regressions.
- Both generated packages passed the project validator.
- Mozilla `web-ext` 10.8.0 reported zero errors, warnings, and notices.
- Runtime files are identical between browser ZIPs except for their manifests. Runtime packages contain no test framework or development dependencies.
- The delivered patch applies to the baseline and reproduces the delivered source; both runtime ZIPs passed independent archive/CRC checks.

## Remaining manual acceptance

- Branded Google Chrome on a user's desktop, especially its actual unpacked/store installation and permission flow.
- Detailed CLAIMED transitions, site dropdown stacking, and back/forward edge cases on authenticated pages beyond the user-reported signed-in acceptance.
- Additional private/unavailable-library, actual disconnection, slow-request, and revoked-host-permission checks. Real-library import passed user acceptance; error variants have automated mocked coverage, and the real HTTP 401 path passed in both browsers.
- Browser restart persistence and Firefox background suspension/restart behavior.
- A Mozilla-signed Firefox installation, data consent, installation permissions, and final submission metadata.
- Firefox 140 and Android. Android support is not verified or advertised.

The Firefox ZIP remains unsigned. See [FIREFOX.md](FIREFOX.md) for distribution requirements and [TESTING.md](TESTING.md) for the full acceptance checklist. Broader Unicode matching, mixed-layout Choice discovery, edition/DLC semantics, and non-Steam filtering for ordinary bundles remain outside this change.

## Development-tool dependency audit

`npm audit` reports three high-severity dependency entries arising from one unpatched `node-forge` advisory through `web-ext` and its transitive Android tooling. The advisory lists no patched version: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). No third-party Node package is shipped in either browser ZIP. The pinned validation tools are retained; npm's suggested major downgrade is not applied. This remains a development-tool maintenance follow-up, especially before using additional signing or Android tooling.
