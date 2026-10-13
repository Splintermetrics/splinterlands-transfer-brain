"""Publish card-level gift history in small, lazily loaded account buckets."""
import collections
import argparse
import gzip
import json
import re
from pathlib import Path

from collect_transfers import request

SHARDS = 32


def bucket(name):
    return sum(ord(c) for c in name) % SHARDS


def build(records, graph, catalogue, pack_catalogue=None):
    players = collections.defaultdict(list)
    for r in sorted(records, key=lambda r: (r["time_utc"], r["block_num"], r["tx_id"]), reverse=True):
        row = [r["time_utc"], r["tx_id"], r["from"], r["to"], r["cards"]]
        if r.get("pack"):
            row.append(r["pack"])
        for name in {r["from"], r["to"]}:
            players[name].append(row)
    if set(players) != {n[0] for n in graph["nodes"]}:
        raise ValueError("History and graph accounts disagree")
    for node in graph["nodes"]:
        name, _, _, _, incoming, outgoing = node[:6]
        rows = players[name]
        if len({r[1] for r in rows}) != len(rows):
            raise ValueError("Duplicate history transaction")
        if [sum(len(r[4]) for r in rows if r[3] == name),
            sum(len(r[4]) for r in rows if r[2] == name)] != [incoming, outgoing]:
            raise ValueError("History and graph card totals disagree")
        if [sum(r[5][2] for r in rows if len(r)>5 and r[3]==name),sum(r[5][2] for r in rows if len(r)>5 and r[2]==name)] != (node[6:8] if len(node)>6 else [0,0]):
            raise ValueError("History and graph pack totals disagree")
    all_rows = {r[1]: r for rows in players.values() for r in rows}
    if len(all_rows) != graph["gifts"] + graph.get("pack_gifts",0) or sum(len(r[4]) for r in all_rows.values()) != graph["movements"] or sum(r[5][2] for r in all_rows.values() if len(r)>5) != graph.get("packs",0):
        raise ValueError("History and graph gift totals disagree")
    ids = {m.group(1) for r in records for uid in r["cards"]
           if (m := re.match(r"^[CG]\d+-(\d+)-", uid))}
    names = {str(c["id"]): c["name"] for c in catalogue
             if isinstance(c, dict) and str(c.get("id")) in ids and isinstance(c.get("name"), str)}
    if not names:
        raise ValueError("Card catalogue did not return usable names")
    graph["card_names"] = names
    if "pack_gifts" in graph:
        if not isinstance(pack_catalogue,list):
            raise ValueError("Pack catalogue is required")
        graph["pack_names"] = {f"{c['data']['edition']}:{c['data'].get('pack_type','standard')}":c["name"] for c in pack_catalogue if c.get("sub_type")=="Pack" and isinstance(c.get("data"),dict) and "edition" in c["data"]}
    graph["history"] = {"schema": 1, "shards": SHARDS, "compression": "gzip"}
    shards = [{"updated_at": graph["updated_at"], "players": {}} for _ in range(SHARDS)]
    for name, rows in sorted(players.items()):
        shards[bucket(name)]["players"][name] = rows
    return shards


def publish(source=Path(".refresh/source"), output=Path("data"), packs=None):
    graph = json.loads((output / "graph.json").read_text(encoding="utf-8"))
    records = json.loads((source / "transactions.json").read_text(encoding="utf-8"))
    if packs is not None:
        records += json.loads((packs / "transactions.json").read_text(encoding="utf-8"))
    catalogue = request("/cards/get_details", [])
    if not isinstance(catalogue, list):
        raise ValueError("Invalid card catalogue")
    pack_catalogue = request("/players/item_details", []) if "pack_gifts" in graph else None
    shards = build(records, graph, catalogue, pack_catalogue)
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
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packs',type=Path)
    publish(packs=parser.parse_args().packs)
