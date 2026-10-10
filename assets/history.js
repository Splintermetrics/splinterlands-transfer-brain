'use strict';
function createTransferHistory(root,data,selectAccount){
const q=id=>root.querySelector('#'+id),cache=new Map(),ownerCache=new Map(),pageSize=25,ownerMaxAge=60000;
let player='',records=[],page=0,requestId=0,reloadNeeded=false,ownerGeneration=0,ownerController=null,ownerViews=[];
const element=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function account(name){const button=element('button',name,'btn btn-ghost history-account');button.type='button';button.addEventListener('click',()=>selectAccount(name));return button;}
function direction(r){return r[2]===player&&r[3]===player?'self':r[3]===player?'in':'out';}
function matchesDirection(r){const value=q('history-direction').value;return value==='all'||(value==='in'?r[3]===player:r[2]===player);}
function other(r){return r[2]===player?r[3]:r[2];}
function cardName(uid){const match=/^[CG]\d+-(\d+)-/.exec(uid);return match?(data.card_names?.[match[1]]||'Card #'+match[1]):'Card';}
function stopOwners(){ownerGeneration++;if(ownerController)ownerController.abort();ownerController=null;}
function loadOwners(){
stopOwners();const token=ownerGeneration,views=ownerViews.slice(),controller=new AbortController();ownerController=controller;
const ids=[...new Set(views.flatMap(view=>view.ids))].filter(uid=>!ownerCache.has(uid)||Date.now()-ownerCache.get(uid).checkedAt>=ownerMaxAge),pending=new Set(ids),failed=new Set();
const state=uid=>pending.has(uid)?{loading:true}:failed.has(uid)?{error:true}:ownerCache.get(uid)||{error:true};
const paint=()=>{if(token===ownerGeneration)views.forEach(view=>view.update(state));};paint();
let cursor=0;
async function worker(){while(cursor<ids.length&&!controller.signal.aborted){const batch=ids.slice(cursor,cursor+50);cursor+=50;
 try{const response=await fetch('https://api.splinterlands.com/cards/find?ids='+encodeURIComponent(batch.join(',')),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});if(!response.ok)throw new Error('Owner lookup failed');const result=await response.json();if(!Array.isArray(result))throw new Error('Invalid owner response');if(controller.signal.aborted)return;const found=new Map(result.filter(record=>record&&batch.includes(record.uid)).map(record=>[record.uid,typeof record.player==='string'&&record.player&&!record.error?record.player:null]));const checkedAt=Date.now();batch.forEach(uid=>{ownerCache.set(uid,{owner:found.get(uid)||null,checkedAt});pending.delete(uid);});
 }catch(error){if(controller.signal.aborted)return;batch.forEach(uid=>{failed.add(uid);pending.delete(uid);});}
 paint();
}}
Promise.all(Array.from({length:Math.min(2,Math.ceil(ids.length/50))},worker)).catch(()=>{});
}
function render(){
stopOwners();ownerViews=[];
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
 if(r[4].length>3){const details=element('details',undefined,'more-cards'),summary=element('summary',`Show ${r[4].length-3} more cards`);details.append(summary);details.addEventListener('toggle',()=>{if(details.open&&!details.querySelector('ul')){const more=element('ul',undefined,'card-list');r[4].slice(3).forEach(uid=>card(uid,more));details.append(more);updateOwners(lastState);}});cards.append(details);}
 tr.append(cards);
 const now=element('td'),owners=element('div',undefined,'current-owners'),status=element('span',undefined,'owner-status');now.append(owners,status);tr.append(now);rows.append(tr);
 const ids=r[4].slice(0,100);let lastState=()=>({loading:true});
 function updateOwners(state){lastState=state;const counts=new Map();let same=0,elsewhere=0,unknown=0,loading=0,errors=0,checkedAt=Infinity;
  for(const uid of ids){const value=state(uid);if(value.loading){loading++;continue;}if(value.error){errors++;continue;}checkedAt=Math.min(checkedAt,value.checkedAt);if(!value.owner){unknown++;continue;}counts.set(value.owner,(counts.get(value.owner)||0)+1);if(value.owner===r[3])same++;else elsewhere++;}
  for(const [uid,label] of ownerLabels){label.replaceChildren();label.classList.remove('incoming');if(!ids.includes(uid)){label.textContent='Outside the first 100 cards';continue;}const value=state(uid);if(value.loading)label.textContent='Loading owner…';else if(value.error)label.textContent='Owner lookup unavailable';else if(!value.owner)label.textContent='Owner unavailable';else if(value.owner===r[3]){label.textContent='Still with recipient';label.classList.add('incoming');}else label.append(element('span','Now with '),account(value.owner));}
  owners.replaceChildren();for(const [name,count] of counts){const line=element('div');line.append(account(name),element('span',count>1?` · ${count} cards`:''));owners.append(line);}
  status.textContent=[same?`${same} still with recipient`:'',elsewhere?`${elsewhere} elsewhere`:'',unknown?`${unknown} unavailable`:'',loading?'Loading owners…':'',errors?'Owner lookup unavailable':''].filter(Boolean).join(' · ')+(Number.isFinite(checkedAt)?` · checked ${new Date(checkedAt).toISOString().slice(11,19)} UTC`:'')+(r[4].length>100?' · first 100 cards only':'');
 }
 ownerViews.push({ids,update:updateOwners});
}
q('history-status').textContent=`${player}: ${filtered.length.toLocaleString()} gifts · ${filtered.reduce((n,r)=>n+r[4].length,0).toLocaleString()} card movements · ${data.start} – ${data.end}`;
q('history-page').textContent=filtered.length?`${start+1}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length.toLocaleString()} gifts`:'No gifts match these filters.';
q('history-prev').disabled=page===0;q('history-next').disabled=start+pageSize>=filtered.length;
loadOwners();
}
async function show(name){
if(data.history?.schema!==1){q('transfer-history').hidden=true;return;}
player=name;records=[];page=0;reloadNeeded=false;const token=++requestId;
stopOwners();ownerViews=[];
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
setInterval(()=>{if(!document.hidden&&!q('transfer-history').hidden&&q('transfer-history').open&&ownerViews.length)loadOwners();},ownerMaxAge);
q('transfer-history').addEventListener('toggle',()=>{if(q('transfer-history').open&&!q('transfer-history').hidden&&ownerViews.length)loadOwners();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!q('transfer-history').hidden&&q('transfer-history').open&&ownerViews.length)loadOwners();});
return {show,hide(){requestId++;stopOwners();ownerViews=[];q('transfer-history').hidden=true;}};
}
