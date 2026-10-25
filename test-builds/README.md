# Chrome v3.3.10 local test build

[Download the Chrome test ZIP](https://github.com/Armadyl00/humble-owned-overlay/raw/refs/heads/canary/test-builds/humble-owned-overlay-v3.3.10-chrome.zip)

Extract the ZIP, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the extracted directory containing `manifest.json`. A separate Chrome profile keeps the published v3.3.9 build available for comparison.

This is the tested v3.3.10 development package built from the local review work based on commit `e60c203c05f603814acb3683f60ae64172f8fa5d`. This upload adds the packaged build and these instructions; the existing canary source files are preserved and are not the source of this ZIP.

Validation: 55 automated tests passed. Native Chromium 156.0.8078.47 and Firefox 158.0.1 passed public Humble Choice and ordinary bundle checks at desktop and narrow widths using synthetic ownership data. The build fixes counter visibility, mobile bundle discovery, repeated-card badges, idle observer updates, and refresh error recovery.

Branded desktop Chrome, authenticated Choice pages, a successful real Steam library import, and final installation/permission checks still need manual acceptance. This package has not been submitted to the Chrome Web Store.

SHA-256:

```text
e1d18d018d3f97ac713195f503399640277f3fe83c9bacc24a8e463d01c768d8  humble-owned-overlay-v3.3.10-chrome.zip
```
