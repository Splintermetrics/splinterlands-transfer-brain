# Splinterlands Transfer Brain

A static, standalone website with no build step, account login or API key.

## Publish on GitHub Pages

1. Create a public repository named `splinterlands-transfer-brain`.
2. Upload the contents of this folder to its `main` branch (index.html at the root).
3. Open Settings → Pages. Select Deploy from a branch, main, / (root), then Save.
4. GitHub displays the site URL when deployment completes.

## Publish on Vercel

Import the repository; choose framework Other, leave Build Command empty, and serve the repository root.

## Data and scope

Snapshot collected 9 October 2026, covering 9 September–8 October 2026 inclusive (UTC).
2,233 accounts; 3,966 directed account pairs; 22,827 successful gift transactions; 200,062 card-ID movements.
Only successful direct card gifts from the Splinterlands global gift API are included. Market sales, rentals, delegation and token transfers are excluded. Counts refer to card IDs, not BCX. Names follow original transaction payloads; similarly named accounts are not merged.

Search is case insensitive and accepts @names. Drag to pan, scroll to zoom, select a node, or use the day slider and replay. Connections show direction and totals for the selected account. Layout is schematic and does not establish common ownership.

This is a fixed historical snapshot, not an automatically refreshing live feed. The collector and complete source records are supplied separately in the 30-day transfer-network package. A scheduled refresh pipeline is a subsequent step.

Validation: graph totals reconcile with source records; search, camera centring, connection totals, replay controls, missing-account handling and reset passed the interaction harness. Full browser rendering has not been verified in this environment.
