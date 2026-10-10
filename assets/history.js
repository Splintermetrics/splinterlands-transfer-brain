'use strict';
function createTransferHistory(root,data,selectAccount){
const q=id=>root.querySelector('#'+id),cache=new Map(),pageSize=25;
let player='',records=[],page=0,requestId=0,reloadNeeded=false;
const element=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function account(name){const button=element('button',name,'btn btn-ghost history-account');button.type='button';button.addEventListener('click',()=>selectAccount(name));return button;}
function direction(r){return r[2]===player&&r[3]===player?'self':r[3]===player?'in':'out';}
function matchesDirection(r){const value=q('history-direction').value;return value==='all'||(value==='in'?r[3]===player:r[2]===player);}
function other(r){return r[2]===player?r[3]:r[2];}
function cardName(uid){const match=/^[CG]\d+-(\d+)-/.exec(uid);return match?(data.card_names?.[match[1]]||'Card #'+match[1]):'Card';}
function render(){
const connection=q('history-account').value,byDirection=records.filter(matchesDirection),totals=new Map();
for(const r of byDirection){const name=other(r),value=totals.get(name)||{gifts:0,cards:0};value.gifts++;value.cards+=r[4].length;totals.set(name,value);}
const chips=q('history-chips');chips.replaceChildren();
for(const [name,total] of [...totals].sort((a,b)=>b[1].cards-a[1].cards)){const button=element('button',`${name} · ${total.gifts.toLocaleString()} gifts (${total.cards.toLocaleString()} cards)`,'history-chip');button.type='button';button.setAttribute('aria-pressed',String(connection===name));button.addEventListener('click',()=>{q('history-account').value=connection===name?'':name;page=0;render();});chips.append(button);}
const filtered=byDirection.filter(r=>!connection||other(r)===connection),start=page*pageSize,rows=q('history-rows');rows.replaceChildren();
for(const r of filtered.slice(start,start+pageSize)){
 const tr=element('tr'),date=element('td'),stamp=element('time',r[0].slice(0,16).replace('T',' ')+' UTC');stamp.dateTime=r[0];date.append(stamp);tr.append(date);
 const dir=direction(r),kind=element('td');kind.append(element('span',dir==='self'?'↔ Self gift':dir==='in'?'↓ Incoming':'↑ Outgoing','history-badge '+(dir==='in'?'incoming':dir==='out'?'outgoing':'')));tr.append(kind);
 const accounts=element('td');accounts.append(account(r[2]),element('span',' → ','history-arrow'),account(r[3]));tr.append(accounts);
 const cards=element('td'),list=element('ul',undefined,'card-list'),ownerLabels=new Map();
 function card(uid,parent){const li=element('li');li.append(element('span',cardName(uid)),element('code',uid));const owner=element('span',undefined,'card-owner');li.append(owner);ownerLabels.set(uid,owner);parent.append(li);}
 r[4].slice(0,3).forEach(uid=>card(uid,list));cards.append(list);
 if(r[4].length>3){const details=element('details',undefined,'more-cards'),summary=element('summary',`Show ${r[4].length-3} more cards`);details.append(summary);details.addEventListener('toggle',()=>{if(details.open&&!details.querySelector('ul')){const more=element('ul',undefined,'card-list');r[4].slice(3).forEach(uid=>card(uid,more));details.append(more);if(ownership)showOwnership();}});cards.append(details);}
 tr.append(cards);
 const now=element('td'),check=element('button','Check owners','btn owner-check'),status=element('span',undefined,'owner-status');check.type='button';now.append(check,status);tr.append(now);rows.append(tr);
 let ownership=null,checkedAt='';
 function showOwnership(){for(const [uid,label] of ownerLabels){label.replaceChildren();if(!ownership.has(uid))continue;const owner=ownership.get(uid);if(!owner){label.textContent='Owner unavailable';}else if(owner===r[3]){label.textContent='Still with recipient';label.classList.add('incoming');}else{label.classList.remove('incoming');label.append(element('span','Now with '),account(owner));}}}
 check.addEventListener('click',async()=>{
  check.disabled=true;check.textContent='Checking…';status.textContent='';const ids=r[4].slice(0,100),found=new Map();
  try{for(let i=0;i<ids.length;i+=50){const response=await fetch('https://api.splinterlands.com/cards/find?ids='+encodeURIComponent(ids.slice(i,i+50).join(',')),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Owner lookup failed');const result=await response.json();if(!Array.isArray(result))throw new Error('Invalid owner response');for(const record of result){if(ids.includes(record.uid))found.set(record.uid,typeof record.player==='string'&&!record.error?record.player:null);}}
   ids.forEach(uid=>{if(!found.has(uid))found.set(uid,null);});ownership=found;checkedAt=new Date().toISOString().slice(11,19)+' UTC';showOwnership();const values=[...found.values()],same=values.filter(name=>name===r[3]).length,elsewhere=values.filter(name=>name&&name!==r[3]).length,unknown=values.filter(name=>!name).length;
   status.textContent=[same?`${same} still with recipient`:'',elsewhere?`${elsewhere} elsewhere`:'',unknown?`${unknown} unavailable`:''].filter(Boolean).join(' · ')+` · checked ${checkedAt}`+(r[4].length>100?' · first 100 cards only':'');check.textContent='Recheck owners';
  }catch(error){status.textContent='Could not check owners. Try again.';check.textContent='Retry owners';}finally{check.disabled=false;}
 });
}
q('history-status').textContent=`${player}: ${filtered.length.toLocaleString()} gifts · ${filtered.reduce((n,r)=>n+r[4].length,0).toLocaleString()} card movements · ${data.start} – ${data.end}`;
q('history-page').textContent=filtered.length?`${start+1}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length.toLocaleString()} gifts`:'No gifts match these filters.';
q('history-prev').disabled=page===0;q('history-next').disabled=start+pageSize>=filtered.length;
}
async function show(name){
if(data.history?.schema!==1){q('transfer-history').hidden=true;return;}
player=name;records=[];page=0;reloadNeeded=false;const token=++requestId;
q('transfer-history').hidden=false;q('history-direction').value='all';q('history-account').replaceChildren(element('option','All connections'));q('history-account').firstChild.value='';
q('history-rows').replaceChildren();q('history-chips').replaceChildren();q('history-page').textContent='';q('history-prev').disabled=q('history-next').disabled=true;q('history-retry').hidden=true;q('history-status').textContent=`Loading ${name}’s card gifts…`;
try{
 if(data.history?.schema!==1)throw new Error('History unavailable');
 const shard=[...name].reduce((sum,c)=>sum+c.charCodeAt(0),0)%data.history.shards;
 if(!cache.has(shard)){const compressed=data.history.compression==='gzip';const response=await fetch(`data/history/${String(shard).padStart(2,'0')}.json${compressed?'.gz':''}`,{cache:'no-cache',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('History request failed');const result=compressed?await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json():await response.json();if(result.updated_at!==data.updated_at){const error=new Error('Snapshot changed');error.snapshotChanged=true;throw error;}cache.set(shard,result.players);}
 if(token!==requestId)return;
 records=cache.get(shard)[name];if(!Array.isArray(records))throw new Error('Player history unavailable');
 for(const otherName of [...new Set(records.map(other))].sort()){const option=element('option',otherName);option.value=otherName;q('history-account').append(option);}
 render();
}catch(error){if(token!==requestId)return;reloadNeeded=!!error.snapshotChanged;q('history-status').textContent=reloadNeeded?'The daily snapshot changed. Reload to get matching history and network data.':'Card history could not load. Please try again.';q('history-retry').textContent=reloadNeeded?'Reload latest snapshot':'Retry history';q('history-retry').hidden=false;}
}
q('history-direction').addEventListener('change',()=>{page=0;render();});q('history-account').addEventListener('change',()=>{page=0;render();});
q('history-prev').addEventListener('click',()=>{if(page>0){page--;render();}});q('history-next').addEventListener('click',()=>{page++;render();});
q('history-retry').addEventListener('click',()=>{if(reloadNeeded)location.reload();else show(player);});
return {show,hide(){requestId++;q('transfer-history').hidden=true;}};
}
