import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_history import build, bucket


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.records = [
            dict(tx_id="old", block_num=1, time_utc="2026-09-10T00:00:00Z", **{"from": "alpha", "to": "beta", "cards": ["C1-1-A"]}),
            dict(tx_id="new", block_num=2, time_utc="2026-09-11T00:00:00Z", **{"from": "beta", "to": "alpha", "cards": ["C1-1-B", "G1-2-C"]}),
            dict(tx_id="self", block_num=3, time_utc="2026-09-11T00:00:00Z", **{"from": "alpha", "to": "alpha", "cards": ["C1-1-D"]}),
        ]
        self.graph = {"updated_at": "stamp", "gifts": 3, "movements": 4,
                      "nodes": [["alpha", 0, 0, 2, 3, 2], ["beta", 0, 0, 1, 1, 2]]}
        self.catalogue = [{"id": 1, "name": "First"}, {"id": 2, "name": "Second"}]

    def test_newest_first_and_self_gifts_are_counted_once(self):
        shards = build(self.records, self.graph, self.catalogue)
        alpha = shards[bucket("alpha")]["players"]["alpha"]
        self.assertEqual([r[1] for r in alpha], ["self", "new", "old"])
        self.assertEqual(self.graph["card_names"], {"1": "First", "2": "Second"})
        self.assertEqual(shards[bucket("alpha")]["updated_at"], "stamp")

    def test_rejects_drift_between_network_and_history(self):
        graph = copy.deepcopy(self.graph)
        graph["nodes"][0][4] += 1
        with self.assertRaisesRegex(ValueError, "card totals"):
            build(self.records, graph, self.catalogue)

    def test_rejects_duplicate_transactions(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            build(self.records + [self.records[0]], self.graph, self.catalogue)

    def test_rejects_invalid_catalogue(self):
        with self.assertRaisesRegex(ValueError, "catalogue"):
            build(self.records, self.graph, [])


if __name__ == "__main__":
    unittest.main()
