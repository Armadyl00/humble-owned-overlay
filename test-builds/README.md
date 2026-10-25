# Canary browser test builds

This branch contains the merged v3.4.6 source, preserving the existing v3.4.5 toolbar popup while adding the reviewed reliability fixes and Firefox build. The published Chrome Store baseline remains v3.3.9.

- [Download Chrome v3.4.6](https://github.com/Armadyl00/humble-owned-overlay/raw/refs/heads/canary/test-builds/humble-owned-overlay-v3.4.6-chrome.zip)
- [Download Firefox v3.4.6 — unsigned](https://github.com/Armadyl00/humble-owned-overlay/raw/refs/heads/canary/test-builds/humble-owned-overlay-v3.4.6-firefox.zip)

For Chrome, extract the ZIP, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the extracted directory containing `manifest.json`. A separate profile keeps the published build available for comparison. If updating an unpacked test installation, replace its files and reload the extension.

For Firefox, extract the ZIP, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the extracted `manifest.json`. Temporary add-ons disappear when Firefox restarts. Normal permanent installation needs Mozilla signing, which has not been performed.

59 automated tests passed. Both browser builds passed validation, and Firefox lint returned zero errors, warnings, and notices. Native Chromium and Firefox passed public Humble page checks using synthetic ownership data; successful real-account Steam import and authenticated Choice acceptance remain manual checks. See [browser validation](../BROWSER-VALIDATION.md), [the acceptance checklist](../TESTING.md), and [Firefox distribution notes](../FIREFOX.md).

To reproduce these packages, use compatible Node 22.22.2+ and run:

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run build:zip
npm run lint:firefox
```

SHA-256:

```text
fc9274cef6329927a6ae11962ca38a5c3aa381f0c3021ef29776622fddc7084c  humble-owned-overlay-v3.4.6-chrome.zip
e087a2b8055bbff1299d3977d1cc7fe1b830643eec2eed1fac7b58b350a999a4  humble-owned-overlay-v3.4.6-firefox.zip
```

The earlier [Chrome v3.3.10 local test ZIP](humble-owned-overlay-v3.3.10-chrome.zip) is retained for comparison. Its source was based on commit `e60c203c05f603814acb3683f60ae64172f8fa5d` before integration with the existing canary popup.
