The extension uses SteamID64, a Steam Web API key entered by the user, cached Steam owned-games data, and Humble Bundle page content only to compare Humble Bundle games against the user’s Steam library.

The extension does not persist the Steam Web API key. It sends the key and SteamID64 to Steam over HTTPS only when the user clicks Fetch library. The API key input is cleared after the attempt. Older stored API keys are removed on extension installation/update and when settings are opened.

The successful SteamID64, returned game records, and refresh timestamp are saved in browser-local extension storage. Steam game records may include app IDs, game names, image references, and playtime fields. This cache is kept until it is replaced by a successful manual refresh or the extension's data is removed. Humble page content is processed locally and is not sent to Steam or the developer.

No data is sold, used for advertising, or transferred except the Steam API request needed to fetch the user’s library.

The use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

The Firefox development manifest declares required transmission of authentication information and personally identifying information for the API key and SteamID64 sent to Steam. There is no telemetry or advertising data transmission.
