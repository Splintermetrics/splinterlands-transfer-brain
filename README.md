# Splinterlands Transfer Brain

Explore the latest 30 complete UTC days of successful direct card gifts at
https://transfers.splintermetrics.com.

Search a player (case insensitive; @ prefixes work), tap a point, drag to pan,
or scroll to zoom. Cyan dashed links show gifts **incoming** to the selected
player; amber solid links show **outgoing** gifts. Arrowheads and replay pulses
follow sender to recipient. Purple neighbours send and receive. The whole
network uses neutral blue. Account positions remain stable between updates.

## Automatic refresh

GitHub Actions runs daily at **02:17 UTC** (03:17 during British Summer Time,
02:17 during GMT), after pushes to main, and from **Actions → Refresh transfer
brain → Run workflow**. Scheduled runs can be delayed by GitHub.

Each refresh:
1. Traverses the filtered Splinterlands history across both date boundaries.
2. Re-reads the final block of each page and deduplicates transaction IDs.
3. Includes successful gifts only and reconciles payload/result card IDs.
4. Rebuilds player, edge and daily replay totals and checks their agreement.
5. Runs collection safeguards and real browser checks.
6. Commits only the validated `data/graph.json` to main and explicitly requests
   a Pages build. It verifies that Pages publishes that commit.

Keep GitHub Pages set to **Deploy from a branch → main → / (root)**. The
workflow uses the repository's built-in GITHUB_TOKEN with contents and Pages
write permissions; no API key, personal access token or computer left running
is needed. Explicitly requesting a build is necessary because GITHUB_TOKEN
commits do not automatically trigger Pages builds.

A failed collection or validation leaves the published data intact. A failed
deployment is reported as a failed workflow, with the previous published
revision still available. The page shows its update timestamp and a delay
notice if the snapshot is over 48 hours old. Workflow evidence and screenshots
are retained for seven days. Source records stay in the runner's temporary
workspace; only the compact graph is committed.

## Scope

Only successful `gift_cards` transactions returned by the global Splinterlands
history API are included. The filter is empirical and undocumented in the
current Swagger; boundary traversal is not independent certification of all
internal activity. Market sales, rentals, delegation and token transfers are
excluded. Counts represent movements of individual card IDs, not BCX. Names
follow transaction payloads; similarly named accounts are not merged. The
schematic brain shape does not establish common ownership. Replay displays
recorded daily totals, not live transactions.

## Development

Python 3.12+ and Node.js 22+ are used in CI. Python uses the standard library.

```sh
python -m unittest discover -s tests -v
python scripts/collect_transfers.py --days 30 --output .refresh/source
python scripts/build_graph.py
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/browser.cjs
python -m http.server 8000
```

The browser check starts its own temporary local HTTP server. Open
http://localhost:8000 for development. Set TEST_BROWSER_CHANNEL=msedge to
test with an installed Edge browser instead of downloaded Chromium.
