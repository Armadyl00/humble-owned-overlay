# Browser validation — v3.4.7

Checked on 2026-10-25. The current source passed 64 automated tests, both package validators, and Mozilla `web-ext` lint with zero errors, warnings, or notices. The user also confirmed successful testing with signed-in Humble pages and a real Steam library. That acceptance is separate from the synthetic-library browser checks below.

## Browser checks

Native headless Chromium 156.0.8078.47 and Firefox 158.0.1 ran on Ubuntu 24.04 ARM64 through WebDriver in disposable profiles. Chromium is not branded Google Chrome; Firefox loaded the unsigned build temporarily. Automated browser caches contained synthetic game records, never a user's library or API key.

| Check | Chromium | Firefox |
| --- | --- | --- |
| Extension loading, options initialization, and background cache messaging | Passed | Passed |
| Public Choice: two owned games out of eight eligible Steam games | Passed | Passed |
| Ordinary bundle: two owned games out of eight | Passed | Passed |
| Desktop width 1440 and narrow width 390 / 500, respectively | Passed | Passed |
| One counter; repeated carousel cards decorated without inflating totals | Passed | Passed |
| No overlay mutations during a 1.3-second idle sample on either live page | Passed | Passed |
| Real HTTP 401 from an invalid test key: controls recover, key clears, previous account/cache remain | Passed | Passed |
| Stopped service worker wakes through a cached library read | Passed | Not applicable to this Firefox background model |
| Counter and owned badge paint unobscured at both widths after dismissing the cookie banner | Passed | Passed |
| Stale-badge removal and cache-change propagation | Automated DOM coverage | Native fixture passed |
| Fresh/cached toolbar popup and declared PNG icon decoding | Passed | Passed |

The live pages were [public Choice](https://www.humblebundle.com/membership) and [Puzzlers to Puzzle You](https://www.humblebundle.com/games/puzzlers-to-puzzle-you). Choice's ten public items included IGN Plus and a playtest, leaving eight eligible Steam games. The ordinary bundle's charity entry was excluded. Page contents can change after the test date.

Visual checks combined native hit testing and screenshot inspection. A final synthetic cache matching all eight eligible Choice games made the active card's badge visible. The Chromium extensions page also displayed the v3.4.7 icon correctly.

## Regression and package checks

The automated suite covers duplicate cards, mobile containers, cache updates, malformed responses, timeouts, error cleanup, popup behavior, installation handlers, manifests, icons, and package completeness.

Both browser ZIPs passed archive/CRC checks and contain sixteen runtime/license files, including all five PNG icon sizes. Only the manifests differ between browsers; JavaScript, HTML, and CSS are shared. Neither ZIP includes Node packages or development dependencies. Runtime code and permissions are unchanged from the user-accepted v3.4.6 build; v3.4.7 adds the extension and toolbar icons.

The earlier review compared Chrome v3.3.9 at `e60c203c05f603814acb3683f60ae64172f8fa5d`. It confirmed and fixed the narrow Choice counter, empty desktop containers hiding mobile bundle cards, duplicate-card counting, and repeated idle DOM writes. The baseline produced twelve overlay mutations in the same 1.3-second samples where the corrected build produced zero. This is a short observation, not a general CPU benchmark.

Versioned browser ZIPs are kept in [GitHub Releases](https://github.com/Armadyl00/humble-owned-overlay/releases). CI validates pushes to `main` before publishing a new manifest version; subsequent pushes with the same version preserve its existing tag and assets. Browser-store submission is separate.

## Remaining manual coverage

- Store-installed branded Chrome and Mozilla-signed Firefox, including installation permissions and Firefox data consent.
- Detailed CLAIMED transitions, dropdown stacking, and back/forward edge cases beyond the user's signed-in acceptance.
- Additional real private/unavailable-library, disconnection, slow-request, and revoked-host-permission cases. Error variants have mocked coverage, and the real HTTP 401 path passed in both browsers.
- Browser restart persistence and Firefox background suspension/restart behavior.
- The declared Firefox 140 minimum and Android. Android support is not verified or advertised.

The release Firefox ZIP is unsigned. See [FIREFOX.md](FIREFOX.md) for signing requirements and [TESTING.md](TESTING.md) for the full acceptance checklist. Broader Unicode matching, edition/DLC semantics, and delivery-platform verification for ordinary bundles remain limitations.

## Development-tool dependency audit

`npm audit` reports three high-severity dependency entries from one unpatched `node-forge` advisory through `web-ext` and its transitive Android tooling: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The audit found no patched version. These dependencies are development tools and are absent from both browser ZIPs. Retain the pinned tools and review the advisory before additional signing or Android tooling; npm's suggested major downgrade has not been applied.
