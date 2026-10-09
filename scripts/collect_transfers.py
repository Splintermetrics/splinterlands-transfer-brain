#!/usr/bin/env python3
"""Collect a UTC date window of Splinterlands direct card gifts.

Python 3 standard library only. --end is exclusive (UTC). Example:
  python transfer_collector.py --day 2026-10-07 --output collected
  python transfer_collector.py --end 2026-10-09 --days 30 --output collected30

The filtered API is empirical and undocumented in the current Swagger.
Successful date-window traversal is not independent certification of all activity.
"""
import argparse,collections,datetime,gzip,json,pathlib,sqlite3,time,urllib.parse,urllib.request

API='https://api.splinterlands.com'
UTC=datetime.timezone.utc

def request(path,metrics):
    url=API+path
    for attempt in range(3):
        tick=time.monotonic()
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Splintermetrics-Transfer-Brain/1.0'})
            with urllib.request.urlopen(req,timeout=45) as response:body=response.read()
            elapsed=time.monotonic()-tick
            metrics.append({'url':url,'seconds':round(elapsed,3),'bytes':len(body),'attempt':attempt+1,'ok':True})
            return json.loads(body)
        except Exception as exc:
            metrics.append({'url':url,'seconds':round(time.monotonic()-tick,3),'attempt':attempt+1,'ok':False,'error':str(exc)})
            if attempt==2:raise
            time.sleep(1+attempt)

def stamp(date):return date.isoformat()+'T00:00:00.000Z'

def collect(start,end,output,before_hint=None):
    output.mkdir(parents=True,exist_ok=True);metrics=[];seen={};pages=[];duplicate_rows=0;cursor=before_hint
    if cursor is None:cursor=int(request('/last_block',metrics)['last_block'])+1
    upper_covered=False;lower_covered=False;earliest=None;latest=None
    for page_no in range(1,2001):
        params={'before_block':cursor,'limit':1000,'types':'gift_cards'}
        rows=request('/transactions/history?'+urllib.parse.urlencode(params),metrics)
        if not isinstance(rows,list):raise ValueError('Expected an array of transactions')
        with gzip.open(output/f'page-{page_no:04}.json.gz','wt',encoding='utf-8') as stream:json.dump(rows,stream)
        if not rows:raise RuntimeError('History ended before the lower date boundary; coverage incomplete')
        if any(r['type']!='gift_cards' for r in rows):raise RuntimeError('Server ignored the gift_cards filter')
        blocks=[int(r['block_num']) for r in rows]
        if any(b>=cursor for b in blocks):raise RuntimeError('Unexpected before_block behaviour')
        if blocks!=sorted(blocks,reverse=True):raise RuntimeError('Records are not ordered by descending block')
        dates=[r['created_date'] for r in rows]
        page_min=min(dates);page_max=max(dates);earliest=min(earliest or page_min,page_min);latest=max(latest or page_max,page_max)
        if page_no==1:upper_covered=page_max>=stamp(end)
        for r in rows:
            if r['id'] in seen:duplicate_rows+=1
            seen[r['id']]=r
        pages.append({'page':page_no,'before_block':cursor,'rows':len(rows),'oldest_block':min(blocks),'newest_block':max(blocks),'oldest_date':page_min,'newest_date':page_max})
        print(f'Page {page_no}: {len(rows)} rows, {page_min} to {page_max}',flush=True)
        if page_min<stamp(start):lower_covered=True;break
        # Re-read the final block on the next page so a page boundary cannot
        # silently skip additional records in the same block.
        next_cursor=min(blocks)+1
        if next_cursor>=cursor:raise RuntimeError('Pagination stalled: a block exceeds page capacity or cursor did not advance')
        cursor=next_cursor
    else:raise RuntimeError('Page safety limit reached; coverage incomplete')
    if not upper_covered:raise RuntimeError('Initial page does not cross the end date; requested upper boundary is unverified')
    selected=sorted((r for r in seen.values() if stamp(start)<=r['created_date']<stamp(end)),key=lambda r:(r['created_date'],r['id']))
    connection=sqlite3.connect(output/'transfers.sqlite')
    connection.executescript('''
    CREATE TABLE IF NOT EXISTS transfers(tx_id TEXT PRIMARY KEY,block_num INTEGER NOT NULL,time_utc TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,card_count INTEGER NOT NULL,raw_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cards(tx_id TEXT NOT NULL,card_uid TEXT NOT NULL,PRIMARY KEY(tx_id,card_uid),FOREIGN KEY(tx_id) REFERENCES transfers(tx_id));
    CREATE INDEX IF NOT EXISTS transfers_sender_time ON transfers(sender,time_utc);
    CREATE INDEX IF NOT EXISTS transfers_recipient_time ON transfers(recipient,time_utc);
    CREATE INDEX IF NOT EXISTS cards_uid ON cards(card_uid);
    ''')
    failed=0;movements=0;uids=set();accounts=set();edges={};daily=collections.Counter();normal=[]
    for r in selected:
        if r['success'] is not True:failed+=1;continue
        payload=json.loads(r['data']) if isinstance(r['data'],str) else r['data']
        result=json.loads(r['result']) if isinstance(r['result'],str) else r['result']
        card_ids=result.get('cards')
        if not isinstance(card_ids,list) or set(card_ids)!=set(payload.get('cards',[])):raise RuntimeError('Payload/result card mismatch: '+r['id'])
        if len(card_ids)!=len(set(card_ids)):raise RuntimeError('Repeated UID in transaction '+r['id'])
        sender=r['player'];recipient=payload['to'];n=len(card_ids)
        connection.execute('INSERT OR REPLACE INTO transfers VALUES (?,?,?,?,?,?,?)',(r['id'],r['block_num'],r['created_date'],sender,recipient,n,json.dumps(r)))
        connection.execute('DELETE FROM cards WHERE tx_id=?',(r['id'],))
        connection.executemany('INSERT INTO cards VALUES (?,?)',[(r['id'],uid) for uid in card_ids])
        movements+=n;uids.update(card_ids);accounts.update([sender,recipient]);daily[r['created_date'][:10]]+=1
        e=edges.setdefault((sender,recipient),{'source':sender,'target':recipient,'transactions':0,'card_movements':0,'first':r['created_date'],'last':r['created_date']})
        e['transactions']+=1;e['card_movements']+=n;e['last']=r['created_date']
        normal.append({'tx_id':r['id'],'block_num':r['block_num'],'time_utc':r['created_date'],'from':sender,'to':recipient,'cards':card_ids})
    connection.commit()
    connection.close()
    summary={'start_utc':stamp(start),'end_utc_exclusive':stamp(end),'coverage':'Filtered API traversal crosses both date boundaries; not independently certified for all internal transfers.', 'source':API+'/transactions/history','filter':'gift_cards','success_only':True,'pages':pages,'unique_rows_scanned':len(seen),'overlap_rows_deduplicated':duplicate_rows,'observed_failed_gifts':failed,'successful_gift_transactions':len(normal),'card_id_movements':movements,'distinct_card_ids':len(uids),'accounts':len(accounts),'directed_connections':len(edges),'daily_transaction_counts':dict(sorted(daily.items())),'request_metrics':metrics,'database_bytes':(output/'transfers.sqlite').stat().st_size}
    (output/'summary.json').write_text(json.dumps(summary,indent=2))
    (output/'transactions.json').write_text(json.dumps(normal,indent=2))
    (output/'network.json').write_text(json.dumps({'nodes':[{'id':a} for a in sorted(accounts)],'links':list(edges.values())},indent=2))
    return summary

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--day',type=datetime.date.fromisoformat);p.add_argument('--end',type=datetime.date.fromisoformat);p.add_argument('--days',type=int,default=1);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--before-block',type=int)
    args=p.parse_args()
    if args.day and args.end:p.error('Use --day or --end, not both')
    if args.days<1:p.error('--days must be positive')
    end=args.day+datetime.timedelta(days=1) if args.day else args.end or datetime.datetime.now(UTC).date()
    start=end-datetime.timedelta(days=args.days)
    result=collect(start,end,args.output,args.before_block)
    print(json.dumps({k:v for k,v in result.items() if k not in ['pages','request_metrics']},indent=2))
