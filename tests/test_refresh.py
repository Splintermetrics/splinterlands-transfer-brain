"""Regression checks for date coverage, overlapping pages and safe graph output."""
import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import collect_transfers as collector
import build_graph

def row(tx, block, date, success=True, cards=None):
    cards = cards or ["card-" + tx]
    return {"id":tx, "type":"gift_cards", "block_num":block,
            "created_date":date+"T12:00:00.000Z", "success":success,
            "player":"sender", "data":json.dumps({"to":"recipient","cards":cards}),
            "result":json.dumps({"cards":cards})}

class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)
        self.start = dt.date(2026, 9, 9)
        self.end = dt.date(2026, 10, 9)

    def collect(self, responses):
        with patch.object(collector, "request", side_effect=responses):
            return collector.collect(self.start, self.end, self.output, 500)

    def test_overlap_success_filter_boundaries_and_totals(self):
        one = row("one", 300, "2026-10-08", cards=["card-a","card-b"])
        two = row("two", 299, "2026-10-08")
        failed = row("failed", 280, "2026-10-07", success=False)
        responses = [[row("new",400,"2026-10-09"),one],
                     [one,two,failed,row("first",100,"2026-09-09"),row("old",99,"2026-09-08")]]
        summary = self.collect(responses)
        self.assertEqual(summary["overlap_rows_deduplicated"], 1)
        self.assertEqual(summary["successful_gift_transactions"], 3)
        self.assertEqual(summary["card_id_movements"], 4)
        data = build_graph.build(self.output)
        self.assertEqual(data["gifts"], 3)
        self.assertEqual(data["movements"], 4)
        self.assertEqual([n[4:6] for n in data["nodes"]], [[4,0],[0,4]])
        previous = copy.deepcopy(data)
        changed = build_graph.build(self.output, previous)
        self.assertEqual([n[:3] for n in data["nodes"]], [n[:3] for n in changed["nodes"]])
        broken = copy.deepcopy(data)
        broken["daily"][0][2] += 1
        with self.assertRaisesRegex(ValueError, "Replay"):
            build_graph.validate(broken)

    def test_incomplete_history_fails(self):
        with self.assertRaisesRegex(RuntimeError, "coverage incomplete"):
            self.collect([[row("new",400,"2026-10-09"),row("one",300,"2026-10-08")],[]])

    def test_stalled_block_fails(self):
        with self.assertRaisesRegex(RuntimeError, "Pagination stalled"):
            self.collect([[row("new",499,"2026-10-09")]])

    def test_filter_ignored_fails(self):
        other = row("other",400,"2026-10-09")
        other["type"] = "market_purchase"
        with self.assertRaisesRegex(RuntimeError, "ignored"):
            self.collect([[other]])

    def test_unverified_upper_boundary_fails(self):
        with self.assertRaisesRegex(RuntimeError, "upper boundary"):
            self.collect([[row("one",300,"2026-10-08"),row("old",99,"2026-09-08")]])

if __name__ == "__main__":
    unittest.main()
