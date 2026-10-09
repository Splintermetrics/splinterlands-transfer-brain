"""Build and validate the rolling transfer graph; publish only complete output."""
import argparse
import collections
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

UTC = dt.timezone.utc

def build(source, previous=None):
    summary = json.loads((source / "summary.json").read_text(encoding="utf-8"))
    records = json.loads((source / "transactions.json").read_text(encoding="utf-8"))
    start = dt.date.fromisoformat(summary["start_utc"][:10])
    end = dt.date.fromisoformat(summary["end_utc_exclusive"][:10])
    days = (end - start).days
    if days != 30:
        raise ValueError("A published graph must cover exactly 30 complete UTC days")
    if not records or not summary.get("pages"):
        raise ValueError("Refusing to replace the published graph with empty or unverified data")
    names = sorted({r[k] for r in records for k in ("from", "to")})
    index = {name: i for i, name in enumerate(names)}
    adjacency = [set() for _ in names]
    incoming = [0] * len(names)
    outgoing = [0] * len(names)
    links = {}
    daily = collections.defaultdict(lambda: [0, 0])
    seen = set()
    for record in records:
        tx = record["tx_id"]
        if tx in seen:
            raise ValueError("Duplicate transaction: " + tx)
        seen.add(tx)
        date = dt.date.fromisoformat(record["time_utc"][:10])
        if not start <= date < end:
            raise ValueError("Transaction outside the requested window")
        cards = record["cards"]
        if not isinstance(cards, list) or not cards or len(cards) != len(set(cards)):
            raise ValueError("Invalid card IDs in " + tx)
        a, b = index[record["from"]], index[record["to"]]
        count = len(cards)
        incoming[b] += count
        outgoing[a] += count
        adjacency[a].add(b)
        adjacency[b].add(a)
        edge = links.setdefault((a, b), [a, b, 0, 0, date.isoformat(), date.isoformat()])
        edge[2] += 1
        edge[3] += count
        edge[4] = min(edge[4], date.isoformat())
        edge[5] = max(edge[5], date.isoformat())
        totals = daily[((date - start).days, a, b)]
        totals[0] += count
        totals[1] += 1
    edges = [links[key] for key in sorted(links)]
    edge_index = {(edge[0], edge[1]): i for i, edge in enumerate(edges)}
    bins = [[day, edge_index[(a, b)], counts[0], counts[1]]
            for (day, a, b), counts in sorted(daily.items())]
    # Keep continuing players in place between refreshes. New accounts receive
    # deterministic positions inside the two schematic hemispheres.
    existing = {n[0]: (n[1], n[2]) for n in (previous or {}).get("nodes", [])}
    nodes = []
    for i, name in enumerate(names):
        if name in existing:
            x, y = existing[name]
        else:
            digest = hashlib.sha256(name.encode()).digest()
            side = -1 if digest[0] % 2 == 0 else 1
            angle = int.from_bytes(digest[1:5], "big") / 2**32 * 2 * math.pi
            radius = math.sqrt(int.from_bytes(digest[5:9], "big") / 2**32) * .94
            x = side * .415 + .40 * radius * math.cos(angle)
            y = .65 * radius * math.sin(angle)
        if not math.isfinite(x) or not math.isfinite(y):
            raise ValueError("Invalid node position")
        nodes.append([name, round(x, 4), round(y, 4), len(adjacency[i]), incoming[i], outgoing[i]])
    now = dt.datetime.now(UTC)
    data = {
        "start": start.isoformat(), "end": (end - dt.timedelta(days=1)).isoformat(),
        "snapshot": now.date().isoformat(), "updated_at": now.isoformat(timespec="seconds"),
        "gifts": len(records), "movements": sum(len(r["cards"]) for r in records),
        "nodes": nodes, "edges": edges, "daily": bins,
    }
    validate(data)
    if data["gifts"] != summary["successful_gift_transactions"] or data["movements"] != summary["card_id_movements"]:
        raise ValueError("Source summary and graph totals disagree")
    return data

def validate(data):
    days = (dt.date.fromisoformat(data["end"]) - dt.date.fromisoformat(data["start"])).days + 1
    if days != 30:
        raise ValueError("Invalid date range")
    names = [n[0] for n in data["nodes"]]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate accounts")
    ins = [0] * len(names)
    outs = [0] * len(names)
    for a, b, gifts, cards, first, last in data["edges"]:
        if not (0 <= a < len(names) and 0 <= b < len(names) and gifts > 0 and cards >= gifts):
            raise ValueError("Invalid edge")
        if not data["start"] <= first <= last <= data["end"]:
            raise ValueError("Edge outside the date range")
        ins[b] += cards
        outs[a] += cards
    by_edge = collections.defaultdict(lambda: [0, 0])
    for day, edge, cards, gifts in data["daily"]:
        if not (0 <= day < days and 0 <= edge < len(data["edges"]) and gifts > 0 and cards >= gifts):
            raise ValueError("Invalid replay bin")
        by_edge[edge][0] += cards
        by_edge[edge][1] += gifts
    for i, edge in enumerate(data["edges"]):
        if by_edge[i] != [edge[3], edge[2]]:
            raise ValueError("Replay and edge totals disagree")
    if any(n[4] != ins[i] or n[5] != outs[i] for i, n in enumerate(data["nodes"])):
        raise ValueError("Player totals disagree")
    if sum(e[2] for e in data["edges"]) != data["gifts"] or sum(ins) != data["movements"] or sum(outs) != data["movements"]:
        raise ValueError("Graph totals disagree")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(".refresh/source"))
    parser.add_argument("--output", type=Path, default=Path("data/graph.json"))
    args = parser.parse_args()
    previous = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else None
    data = build(args.source, previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pending = args.output.with_suffix(".tmp")
    pending.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    pending.replace(args.output)
    print(json.dumps({key: data[key] for key in ("start", "end", "updated_at", "gifts", "movements")}))
