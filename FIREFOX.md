# Firefox build and distribution

The Firefox development package shares all runtime scripts, CSS, and HTML with Chrome. The build changes only the manifest: an ordered `background.scripts` list replaces the service worker, and Mozilla-specific identity, version, and data-consent settings are added. The guarded `importScripts` call continues to load the normalizer in Chrome's worker; Firefox loads it before `background.js` through the manifest.

The existing `chrome.*` MV3 APIs and `return true`/`sendResponse` message handlers are retained. No API polyfill, bundler, remote code, session-cookie authentication, or additional host permission is introduced.

Build with `npm run build:firefox`, then run `npm run lint:firefox`. For a temporary desktop installation, select `dist/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`. Verify the cases in [TESTING.md](TESTING.md). Temporary installation and lint success do not establish compatibility with every Humble layout or permanent signing.

Before submitting to Mozilla:

1. Complete desktop browser acceptance testing. Do not advertise Android support without separate Android testing.
2. Confirm the permanent ID `humble-owned-overlay@armadyl.work`; keep it unchanged after the first signed release.
3. Check that `authenticationInfo` and `personallyIdentifyingInfo` accurately describe the API key and SteamID64 request, and provide the privacy policy. Humble titles and browsing history do not leave the browser.
4. Provide listing text, support information, and reviewer instructions. Use a dedicated public Steam test account where reviewer credentials are needed; do not publish a personal API key.
5. Upload the Firefox ZIP with `manifest.json` at its root. This project ships readable source; include the build instructions/source when requested by AMO.
6. Obtain Mozilla signing for a listed or unlisted release. The generated ZIP has not been signed. Each submitted update needs a new accepted version; GitHub canary filenames do not change the manifest version.

No browser-store signing or submission occurs during local builds or CI. Successful CI on `main` publishes versioned GitHub downloads. The canary workflow publishes GitHub prereleases after a matching canary tag is pushed. Firefox packages remain unsigned in both cases.

References: [background environments](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [MV3 Promise support](https://bugzilla.mozilla.org/show_bug.cgi?id=1926713#c2), [data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), [signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
