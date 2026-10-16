import datetime as dt
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_card_paths import build


def gift(tx,block,sender,recipient,cards,day=None):
    return dict(tx_id=tx,block_num=block,time_utc=(dt.date(2026,9,1)+dt.timedelta(days=day if day is not None else block-1)).isoformat()+'T00:00:00Z',cards=cards,**{'from':sender,'to':recipient})


def graph_for(records):
    names=sorted({r[k] for r in records for k in ('from','to')});index={name:i for i,name in enumerate(names)}
    pairs=sorted({(index[r['from']],index[r['to']]) for r in records})
    return dict(start='2026-09-01',updated_at='test',nodes=[[n] for n in names],edges=[[a,b,1,1,'2026-09-01','2026-09-30'] for a,b in pairs])


class CardPathTests(unittest.TestCase):
    def test_matches_id_and_chronological_handoff(self):
        records=[gift('a',1,'alpha','beta',['C1-1-A']),gift('b',2,'beta','gamma',['C1-1-A']),gift('unrelated',3,'beta','delta',['C1-1-B'])]
        graph=graph_for(records);result=build(records[::-1],graph)
        self.assertEqual(len(result['paths']),1)
        self.assertEqual(result['paths'][0][2],[['C1-1-A',[[0,1]]]])

    def test_does_not_link_backwards_or_across_an_owner_gap(self):
        backward=[gift('a',1,'beta','gamma',['A']),gift('b',2,'alpha','beta',['A'])]
        gap=[gift('a',1,'alpha','beta',['A']),gift('b',2,'gamma','delta',['A']),gift('c',3,'beta','epsilon',['A'])]
        for records in [backward,gap]:
            with self.subTest(records=records):self.assertEqual(build(records,graph_for(records))['paths'],[])

    def test_same_block_ambiguity_breaks_the_chain(self):
        records=[gift('a',1,'alpha','beta',['A']),gift('b',2,'beta','gamma',['A']),gift('c',2,'gamma','delta',['A']),gift('d',3,'delta','epsilon',['A'])]
        self.assertEqual(build(records,graph_for(records))['paths'],[])

    def test_multiple_cards_and_repeated_routes_keep_dates_without_double_counting_ids(self):
        records=[gift('a',1,'alpha','beta',['A','B']),gift('b',2,'beta','gamma',['A','B']),gift('c',3,'gamma','alpha',['A']),gift('d',4,'alpha','beta',['A']),gift('e',5,'beta','gamma',['A'])]
        graph=graph_for(records);names={n[0]:i for i,n in enumerate(graph['nodes'])};edges={(e[0],e[1]):i for i,e in enumerate(graph['edges'])}
        wanted=(edges[(names['alpha'],names['beta'])],edges[(names['beta'],names['gamma'])])
        route=next(r for r in build(records,graph)['paths'] if tuple(r[:2])==wanted)
        self.assertEqual(route[2],[['A',[[0,1],[3,4]]],['B',[[0,1]]]])

    def test_packs_do_not_generate_item_paths(self):
        records=[{**gift('a',1,'alpha','beta',[]),'pack':[15,'foundation',3]},{**gift('b',2,'beta','gamma',[]),'pack':[15,'foundation',3]}]
        self.assertEqual(build(records,graph_for(records))['paths'],[])

    def test_rejects_records_outside_snapshot(self):
        records=[gift('a',1,'alpha','beta',['A'],day=30)]
        with self.assertRaisesRegex(ValueError,'outside'):build(records,graph_for(records))


if __name__=='__main__':unittest.main()
