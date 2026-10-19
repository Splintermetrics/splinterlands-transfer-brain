# Splinterlands Transfer Brain

Explore the latest 30 complete UTC days of successful direct card and pack gifts at
https://transfers.splintermetrics.com.

Search one player or several separated by commas (case insensitive; @ prefixes work), tap a point, drag to pan,
or scroll to zoom. On mobile, pinch with two fingers to zoom and drag with one finger to
pan. The graph also has **+**, **−** and **Fit** buttons with large touch targets;
Fit restores the current player's neighbourhood (or the whole network).
Cyan links show gifts **incoming** to the selected
player; amber links show **outgoing** gifts. Dotted links carry pack gifts only.
Arrowheads and replay pulses
follow sender to recipient. Purple neighbours send and receive. The whole
network uses neutral blue. Account positions remain stable between updates.

Multiple names select a combined neighbourhood. Every selected player is ringed;
incoming/outgoing colours are relative to the selected group, and purple links
show gifts between selected players. Totals sum the selected players' incoming
and outgoing movements, so a gift within the group counts once in each direction.
Direct connection gift counts, history records and two-hop card paths are
deduplicated. History filters apply to the group; internal gifts appear in both
direction filters. Suggestions complete the name after the last comma. Unknown
or ambiguous names leave the previous selection in place with an explanation.
Clicking a graph point or an account button selects that player on its own.

After selecting a player, use **Connection depth** to choose one or two hops.
Use **Show transfers** to choose **Cards & packs**, **Cards only**, or **Packs
only**. The filter applies to the brain, search suggestions, direct connections,
two-hop neighbourhood, replay and history. Card movements and pack quantities
have separate totals and columns; pack quantities are not multiplied by the
number of cards in a pack. Accounts keep their positions when switching views.

The **Transfer history** beneath the connection totals lists individual
gifts newest first, with UTC times, sender/recipient accounts, card names and
card IDs. Filter incoming/outgoing gifts or a particular connection and page
through the results. Pack rows show edition, variant and quantity. Known pack
names come from the public item catalogue; unknown editions retain their
edition number and variant. Packs do not have individual card-style IDs, so
their current owner is labelled **Not individually traceable**.
Account buttons select that player in the brain.
Current card ownership loads automatically from Splinterlands for the displayed
history page, showing account names and cards
still with the recipient, now elsewhere, or unavailable (for example after
combining or burning). Checks cover up to 100 cards per gift and report the
check time. Batched lookups reuse results for one minute and refresh every
minute while history is open. History follows the same daily 30-day snapshot as the network;
market sales, rentals and delegations are not included.

**2 hops · follow the same cards** uses unique card IDs and consecutive observed
gifts in block order. It follows a direct gift one move onward or one move
upstream, such as `you → A → B` or `B → A → you`, and can show cards entering
and leaving the selected account. A neighbour's unrelated cards and third hops
are excluded. Ambiguous same-block ordering and gaps between different owners
are not bridged. Blue links show matched continuations; their width and replay
pulses use only the matched cards. The **Cards followed over two hops** list
shows card IDs and clickable account routes, including returns. Counts of
matching cards are deduplicated across routes. This describes observed gifts
within the 30-day window, not mint origins, continuous ownership or current
ownership. Direct connection/history totals retain their original scope.

Packs have no individual IDs, so packs-only mode stays at one hop. In the
combined view direct pack gifts remain visible, and second hops trace cards.
The matching index is compressed, loaded on demand and refreshed with the
same snapshot as the graph; mismatched snapshots require a reload.

## Automatic refresh

GitHub Actions runs daily at **02:17 UTC** (03:17 during British Summer Time,
02:17 during GMT), after pushes to main, and from **Actions → Refresh transfer
brain → Run workflow**. Scheduled runs can be delayed by GitHub.

Each refresh:
1. Traverses both `gift_cards` and `gift_packs` histories across the date boundaries.
2. Re-reads the final block of each page and deduplicates transaction IDs.
3. Includes successful gifts only, reconciles card IDs and validates whole pack quantities.
4. Rebuilds player, edge and daily replay totals and checks their agreement.
5. Runs collection safeguards and real browser checks.
6. Commits the validated graph and compressed history to main and explicitly requests
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
workspace; the compact graph and card/pack gift history are committed.

## Scope

Only successful `gift_cards` and `gift_packs` transactions returned by the global Splinterlands
history API are included. The filter is empirical and undocumented in the
current Swagger; boundary traversal is not independent certification of all
internal activity. Market sales, rentals, delegation, currency transfers and
external wallet movements are excluded. Card counts represent movements of
individual card IDs, not BCX; pack counts represent transferred quantities. Names
follow transaction payloads; similarly named accounts are not merged. The
schematic brain shape does not establish common ownership. Replay displays
recorded daily totals, not live transactions.

## Development

Python 3.12+ and Node.js 22+ are used in CI. Python uses the standard library.

```sh
python -m unittest discover -s tests -v
python scripts/collect_transfers.py --days 30 --output .refresh/source
python scripts/collect_transfers.py --days 30 --kind gift_packs --output .refresh/packs
python scripts/build_graph.py --packs .refresh/packs
python scripts/build_history.py --packs .refresh/packs
python scripts/build_card_paths.py
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/browser.cjs
node tests/history.cjs
node tests/packs.cjs
node tests/touch.cjs
node tests/card-paths.cjs
python -m http.server 8000
```

The browser check starts its own temporary local HTTP server. Open
http://localhost:8000 for development. Set TEST_BROWSER_CHANNEL=msedge to
test with an installed Edge browser instead of downloaded Chromium.
