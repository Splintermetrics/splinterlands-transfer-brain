"""Index consecutive observed gifts of the same card, in confirmed block order."""
import collections
import datetime as dt
import gzip
import itertools
import json
from pathlib import Path


def build(records, graph):
    names = {node[0]: i for i, node in enumerate(graph['nodes'])}
    edges = {(edge[0], edge[1]): i for i, edge in enumerate(graph['edges'])}
    previous = {}
    paths = collections.defaultdict(lambda: collections.defaultdict(set))
    # Different transactions in one block have no reliable intra-block order
    # in the normalized source. Break the chain at that block for this UID.
    start=dt.date.fromisoformat(graph['start'])
    for block, group in itertools.groupby(sorted(records,key=lambda r:(r['block_num'],r['tx_id'])),key=lambda r:r['block_num']):
        cards = collections.defaultdict(list)
        for record in group:
            if record.get('pack'):
                continue
            edge = edges[(names[record['from']],names[record['to']])]
            day=(dt.date.fromisoformat(record['time_utc'][:10])-start).days
            if not 0<=day<30:
                raise ValueError('Card path record outside graph window')
            for uid in record['cards']:
                cards[uid].append((record,edge,day))
        for uid, gifts in cards.items():
            if len(gifts)!=1:
                previous.pop(uid,None)
                continue
            current,edge,day = gifts[0]
            before = previous.get(uid)
            if before and before[0]['to']==current['from'] and before[0]['time_utc']<=current['time_utc']:
                # Keep the dates of both gifts so replay can show only the
                # matched cards on the day each leg actually happened.
                paths[(before[1],edge)][uid].add((before[2],day))
            previous[uid]=(current,edge,day)
    rows = [[first,second,[[uid,[list(days) for days in sorted(dates)]] for uid,dates in sorted(cards.items())]] for (first,second),cards in sorted(paths.items())]
    return {'updated_at':graph['updated_at'],'schema':1,'paths':rows}


def publish(source=Path('.refresh/source'),output=Path('data')):
    graph=json.loads((output/'graph.json').read_text(encoding='utf-8'))
    records=json.loads((source/'transactions.json').read_text(encoding='utf-8'))
    if len(records)!=graph['gifts'] or sum(len(r['cards']) for r in records)!=graph['movements']:
        raise ValueError('Card path source and graph disagree')
    data=build(records,graph)
    pending=output/'card-paths.tmp'
    pending.write_bytes(gzip.compress(json.dumps(data,separators=(',',':')).encode('utf-8'),mtime=0))
    pending.replace(output/'card-paths.json.gz')
    graph['card_paths']={'schema':1}
    pending=output/'graph.tmp'
    pending.write_text(json.dumps(graph,separators=(',',':')),encoding='utf-8')
    pending.replace(output/'graph.json')
    print(f"Indexed {len(data['paths'])} consecutive same-card gift routes")


if __name__=='__main__':
    publish()
