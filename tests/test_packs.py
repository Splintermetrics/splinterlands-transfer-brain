import copy
import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import collect_transfers as collector
import build_graph
import build_history


def pack_row(tx,block,date,qty=2,success=True):
    return dict(id=tx,type='gift_packs',block_num=block,created_date=date+'T12:00:00.000Z',success=success,player='sender',data=json.dumps(dict(to='recipient',qty=qty,edition=15,type='foundation')),result=json.dumps(dict(success=True)))


class PackTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.packs=self.root/'packs';self.cards=self.root/'cards';self.cards.mkdir()
        self.start=dt.date(2026,9,13);self.end=dt.date(2026,10,13)
        self.rows=[pack_row('new',400,'2026-10-13'),pack_row('included',300,'2026-10-12'),pack_row('failed',299,'2026-10-11',success=False),pack_row('old',100,'2026-09-12')]

    def collect(self,rows=None):
        with patch.object(collector,'request',side_effect=[rows or self.rows]):
            return collector.collect(self.start,self.end,self.packs,500,'gift_packs')

    def test_pack_quantity_and_failed_gifts(self):
        summary=self.collect()
        self.assertEqual(summary['successful_gift_transactions'],1)
        self.assertEqual(summary['pack_movements'],2)
        self.assertEqual(summary['observed_failed_gifts'],1)
        records=json.loads((self.packs/'transactions.json').read_text())
        self.assertEqual(records[0]['pack'],[15,'foundation',2])
        self.assertEqual(records[0]['cards'],[])

    def test_invalid_quantities_fail(self):
        for qty in [0,-1,True,1.5,'2']:
            with self.subTest(qty=qty),self.assertRaisesRegex(RuntimeError,'quantity'):
                self.collect([self.rows[0],pack_row('bad',300,'2026-10-12',qty),self.rows[-1]])

    def test_quiet_day_requires_verified_current_head(self):
        quiet=[self.rows[1],self.rows[-1]]
        with patch.object(collector,'request',side_effect=[quiet,[self.rows[0]]]):
            summary=collector.collect(self.start,self.end,self.packs,500,'gift_packs')
        self.assertEqual(summary['pack_movements'],2)
        self.assertEqual(summary['head_boundary_proof']['block_num'],400)
        with patch.object(collector,'request',side_effect=[quiet,[self.rows[1]]]):
            with self.assertRaisesRegex(RuntimeError,'upper boundary'):
                collector.collect(self.start,self.end,self.packs,500,'gift_packs')

    def test_wrong_type_and_result_are_rejected(self):
        row=copy.deepcopy(self.rows[1]);row['type']='token_transfer'
        with self.assertRaisesRegex(RuntimeError,'ignored'):self.collect([row])
        row=copy.deepcopy(self.rows[1]);row['result']=json.dumps({'success':False})
        with self.assertRaisesRegex(RuntimeError,'successful pack'):self.collect([self.rows[0],row,self.rows[-1]])

    def test_shared_edge_preserves_card_and_pack_units(self):
        self.collect()
        summary=dict(start_utc=collector.stamp(self.start),end_utc_exclusive=collector.stamp(self.end),pages=[{}],successful_gift_transactions=1,card_id_movements=1)
        record=dict(tx_id='card',block_num=200,time_utc='2026-10-10T00:00:00Z',**{'from':'sender','to':'recipient','cards':['C1-1-ID']})
        (self.cards/'summary.json').write_text(json.dumps(summary));(self.cards/'transactions.json').write_text(json.dumps([record]))
        graph=build_graph.build(self.cards,pack_source=self.packs)
        self.assertEqual((graph['gifts'],graph['movements'],graph['pack_gifts'],graph['packs']),(1,1,1,2))
        self.assertEqual(graph['edges'][0][2:4],[1,1]);self.assertEqual(graph['edges'][0][6:8],[1,2])
        shards=build_history.build([record]+json.loads((self.packs/'transactions.json').read_text()),graph,[dict(id=1,name='First')],[dict(sub_type='Pack',data=dict(edition=15,pack_type='foundation'),name='Foundations Pack')])
        history=shards[build_history.bucket('sender')]['players']['sender']
        self.assertEqual(history[0][5],[15,'foundation',2]);self.assertEqual(len(history[1]),5)
        self.assertEqual(graph['pack_names']['15:foundation'],'Foundations Pack')
        broken=copy.deepcopy(graph);broken['daily'][1][4]+=1
        with self.assertRaisesRegex(ValueError,'Replay'):build_graph.validate(broken)
        mismatch=json.loads((self.packs/'summary.json').read_text());mismatch['start_utc']='2026-09-12T00:00:00.000Z';(self.packs/'summary.json').write_text(json.dumps(mismatch))
        with self.assertRaisesRegex(ValueError,'windows'):build_graph.build(self.cards,pack_source=self.packs)


if __name__=='__main__':unittest.main()
