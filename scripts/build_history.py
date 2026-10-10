"""Publish card-level gift history in small, lazily loaded account buckets."""
import collections
import gzip
import json
import re
from pathlib import Path

from collect_transfers import request

SHARDS = 32


def bucket(name):
    return sum(ord(c) for c in name) % SHARDS


def build(records, graph, catalogue):
    players = collections.defaultdict(list)
    for r in sorted(records, key=lambda r: (r["time_utc"], r["block_num"], r["tx_id"]), reverse=True):
        row = [r["time_utc"], r["tx_id"], r["from"], r["to"], r["cards"]]
        for name in {r["from"], r["to"]}:
            players[name].append(row)
    if set(players) != {n[0] for n in graph["nodes"]}:
        raise ValueError("History and graph accounts disagree")
    for name, _, _, _, incoming, outgoing in graph["nodes"]:
        rows = players[name]
        if len({r[1] for r in rows}) != len(rows):
            raise ValueError("Duplicate history transaction")
        if [sum(len(r[4]) for r in rows if r[3] == name),
            sum(len(r[4]) for r in rows if r[2] == name)] != [incoming, outgoing]:
            raise ValueError("History and graph card totals disagree")
    all_rows = {r[1]: r for rows in players.values() for r in rows}
    if len(all_rows) != graph["gifts"] or sum(len(r[4]) for r in all_rows.values()) != graph["movements"]:
        raise ValueError("History and graph gift totals disagree")
    ids = {m.group(1) for r in records for uid in r["cards"]
           if (m := re.match(r"^[CG]\d+-(\d+)-", uid))}
    names = {str(c["id"]): c["name"] for c in catalogue
             if isinstance(c, dict) and str(c.get("id")) in ids and isinstance(c.get("name"), str)}
    if not names:
        raise ValueError("Card catalogue did not return usable names")
    graph["card_names"] = names
    graph["history"] = {"schema": 1, "shards": SHARDS, "compression": "gzip"}
    shards = [{"updated_at": graph["updated_at"], "players": {}} for _ in range(SHARDS)]
    for name, rows in sorted(players.items()):
        shards[bucket(name)]["players"][name] = rows
    return shards


def publish(source=Path(".refresh/source"), output=Path("data")):
    graph = json.loads((output / "graph.json").read_text(encoding="utf-8"))
    records = json.loads((source / "transactions.json").read_text(encoding="utf-8"))
    catalogue = request("/cards/get_details", [])
    if not isinstance(catalogue, list):
        raise ValueError("Invalid card catalogue")
    shards = build(records, graph, catalogue)
    folder = output / "history"
    folder.mkdir(parents=True, exist_ok=True)
    for i, shard in enumerate(shards):
        pending = folder / f"{i:02}.tmp"
        pending.write_bytes(gzip.compress(json.dumps(shard, separators=(",", ":")).encode("utf-8"), mtime=0))
        pending.replace(folder / f"{i:02}.json.gz")
    pending = output / "graph.tmp"
    pending.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    pending.replace(output / "graph.json")
    print(f"Validated {graph['gifts']} gifts across {SHARDS} history buckets")


if __name__ == "__main__":
    publish()
