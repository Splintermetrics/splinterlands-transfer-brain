'use strict';
async function loadBrain(){
const root=document.getElementById('splinterlands-brain');
try {
const response=await fetch('data/graph.json',{cache:'no-cache'});
if(!response.ok)throw new Error('Data request failed');
const DATA=await response.json();
if(!Array.isArray(DATA.nodes)||!Array.isArray(DATA.edges)||!Array.isArray(DATA.daily))throw new Error('Invalid graph data');
initializeBrain(root,DATA);
root.classList.remove('loading');
}catch(error){document.getElementById('brain-message').textContent='The transfer data could not load. Please reload the page to try again.';console.error(error);}
}
function initializeBrain(root,DATA){
const q=id=>root.querySelector('#'+id);
const canvas=q('brain-canvas'),ctx=canvas.getContext('2d'),stage=q('brain-stage'),search=q('brain-search'),input=q('brain-player'),dayControl=q('brain-day'),play=q('brain-play'),tip=q('brain-tooltip');
const off=document.createElement('canvas'),bg=off.getContext('2d');
const nodes=DATA.nodes.map((n,i)=>({id:n[0],x:n[1],y:n[2],degree:n[3],incoming:n[4],outgoing:n[5],packIn:n[6]||0,packOut:n[7]||0,index:i}));
const index=new Map(nodes.map(n=>[n.id.toLowerCase(),n.index]));
const history=createTransferHistory(root,DATA,name=>{const id=index.get(name.toLowerCase());if(id!==undefined)selectPlayer(id);else q('brain-message').textContent=`${name} has no recorded direct gifts in this window.`;});
const allEdges=DATA.edges.map((e,i)=>({a:e[0],b:e[1],cardGifts:e[2],cardCount:e[3],first:e[4],last:e[5],packGifts:e[6]||0,packCount:e[7]||0,index:i}));
let edges=[],edgeLookup=new Map(),adjacency=nodes.map(()=>new Set()),nodeEdges=nodes.map(()=>[]),daily=Array.from({length:30},()=>[]),active=new Set(),asset=DATA.pack_gifts===undefined?'cards':'both';
q('brain-period').textContent=`${DATA.start} – ${DATA.end} · UTC`;
q('brain-stat-players').textContent=nodes.length.toLocaleString();q('brain-stat-gifts').textContent=DATA.gifts.toLocaleString();q('brain-stat-cards').textContent=DATA.movements.toLocaleString();
const updated=DATA.updated_at?new Date(DATA.updated_at):new Date(DATA.snapshot+'T00:00:00Z');
q('brain-updated').textContent=DATA.updated_at?`Updated ${updated.toLocaleString(undefined,{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC · refreshes daily`:`Snapshot ${DATA.snapshot} · refreshes daily`;
if(Date.now()-updated.getTime()>48*60*60*1000){q('brain-updated').textContent+=' · refresh delayed';q('brain-updated').classList.add('stale');}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let selected=-1,focus=new Set(),depth=new Map(),hops=1,camera={x:0,y:0,k:1},transition=null,w=600,h=500,scale=240,dpr=1,day=0,playing=false,phase=0,last=0,raf=0,dirty=true,colors={},hover=-1,gesture=null,visible=true;
const pointers=new Map();
const itemPaths=createCardPaths(DATA);
let tracedLinks=new Map(),tracedDays=new Map(),tracedCards=new Set(),traceRoutes=[],pathPage=0,pathsRequest=null;
function resolveColor(name){const probe=document.createElement('span');probe.style.color=`var(${name})`;root.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;}
function units(cards,packs){return [asset!=='packs'?`${cards.toLocaleString()} cards`:'',asset!=='cards'?`${packs.toLocaleString()} packs`:''].filter(Boolean).join(' + ');}
function rebuildGraph(){
if(asset==='packs'){hops=1;q('brain-hops').value='1';}
q('brain-hops').querySelector('option[value="2"]').disabled=asset==='packs'||DATA.card_paths?.schema!==1;
edges=allEdges.map(e=>({...e,gifts:(asset!=='packs'?e.cardGifts:0)+(asset!=='cards'?e.packGifts:0),cards:(asset!=='packs'?e.cardCount:0)+(asset!=='cards'?e.packCount:0)})).filter(e=>e.gifts>0);edgeLookup=new Map(edges.map(e=>[e.index,e]));
adjacency=nodes.map(()=>new Set());nodeEdges=nodes.map(()=>[]);active=new Set();
edges.forEach(e=>{active.add(e.a);active.add(e.b);adjacency[e.a].add(e.b);adjacency[e.b].add(e.a);nodeEdges[e.a].push(e);if(e.a!==e.b)nodeEdges[e.b].push(e);});nodes.forEach(n=>{n.degree=adjacency[n.index].size;});
daily=Array.from({length:30},()=>[]);DATA.daily.forEach(d=>{if(edgeLookup.has(d[1])){const cards=(asset!=='packs'?d[2]:0)+(asset!=='cards'?(d[4]||0):0),gifts=(asset!=='packs'?d[3]:0)+(asset!=='cards'?(d[5]||0):0);if(gifts)daily[d[0]].push({edge:d[1],cards,gifts,cardCount:d[2],packCount:d[4]||0});}});
q('brain-players').replaceChildren();nodes.filter(n=>active.has(n.index)).forEach(n=>{const opt=document.createElement('option');opt.value=n.id;q('brain-players').append(opt);});
q('brain-asset').value=asset;q('brain-asset').disabled=DATA.pack_gifts===undefined;q('brain-key-packs').hidden=asset==='cards';q('brain-card-stat').hidden=asset==='packs';q('brain-pack-stat').hidden=asset==='cards';
q('brain-key-in').querySelector('.line-key').classList.toggle('dotted',asset==='packs');q('brain-key-out').querySelector('.line-key').classList.toggle('dotted',asset==='packs');
q('brain-stat-players').textContent=active.size.toLocaleString();q('brain-stat-gifts').textContent=edges.reduce((sum,e)=>sum+e.gifts,0).toLocaleString();q('brain-stat-packs').textContent=(DATA.packs||0).toLocaleString();
root.querySelectorAll('[data-unit]').forEach(el=>{el.hidden=el.dataset.unit===(asset==='cards'?'packs':asset==='packs'?'cards':'');});
history.setAsset(asset);dirty=true;updateDay();if(selected>=0){updateNeighbourhood();populateConnections();}else requestDraw();
}
function theme(){colors={fg:resolveColor('--foreground'),base:resolveColor('--background'),soft:resolveColor('--muted-foreground'),out:resolveColor('--outgoing'),in:resolveColor('--incoming'),neutral:resolveColor('--network'),both:resolveColor('--both'),border:resolveColor('--border')};dirty=true;requestDraw();}
function point(n){return {x:w/2+(n.x-camera.x)*scale*camera.k,y:h/2+(n.y-camera.y)*scale*camera.k};}
function world(p){return {x:(p.x-w/2)/(scale*camera.k)+camera.x,y:(p.y-h/2)/(scale*camera.k)+camera.y};}
function zoomAt(p,factor){transition=null;const before=world(p);camera.k=Math.max(.7,Math.min(12,camera.k*factor));const after=world(p);camera.x+=before.x-after.x;camera.y+=before.y-after.y;dirty=true;requestDraw();}
function updateZoomControls(){q('brain-zoom-level').value=Math.round(camera.k*100)+'%';q('brain-zoom-out').disabled=camera.k<=.70001;q('brain-zoom-in').disabled=camera.k>=11.99999;}
function edgePoints(e){const a=point(nodes[e.a]),b=point(nodes[e.b]);if(e.a===e.b)return {a,b,c:{x:a.x+45,y:a.y-60}};const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const bend=Math.min(42,len*.16);return {a,b,c:{x:(a.x+b.x)/2-dy/len*bend,y:(a.y+b.y)/2+dx/len*bend}};}
function edgePath(context,p){context.beginPath();context.moveTo(p.a.x,p.a.y);context.quadraticCurveTo(p.c.x,p.c.y,p.b.x,p.b.y);}
function edgeColor(e){return selected<0?colors.neutral:e.b===selected?colors.in:e.a===selected?colors.out:colors.neutral;}
function nodeColor(n){if(n.index===selected)return colors.fg;if(selected<0||depth.get(n.index)===2)return colors.neutral;const incoming=nodeEdges[selected].some(e=>e.a===n.index&&e.b===selected),outgoing=nodeEdges[selected].some(e=>e.b===n.index&&e.a===selected);return incoming&&outgoing?colors.both:incoming?colors.in:colors.out;}
function arrow(context,p,color){const t=.78,u=1-t,x=u*u*p.a.x+2*u*t*p.c.x+t*t*p.b.x,y=u*u*p.a.y+2*u*t*p.c.y+t*t*p.b.y;const angle=Math.atan2(2*u*(p.c.y-p.a.y)+2*t*(p.b.y-p.c.y),2*u*(p.c.x-p.a.x)+2*t*(p.b.x-p.c.x));context.save();context.translate(x,y);context.rotate(angle);context.fillStyle=color;context.beginPath();context.moveTo(5,0);context.lineTo(-4,-3);context.lineTo(-4,3);context.closePath();context.fill();context.restore();}
function edgeFocused(e){return selected<0||e.a===selected||e.b===selected||(hops===2&&tracedLinks.has(e.index));}
function paintBackground(){
bg.setTransform(dpr,0,0,dpr,0,0);bg.clearRect(0,0,w,h);bg.lineCap='round';
// Thin anatomical guides are a schematic silhouette, not additional links.
for(const side of [-1,1]){const c=point({x:side*.415,y:0});bg.globalAlpha=.11;bg.strokeStyle=colors.soft;bg.lineWidth=.8;bg.beginPath();bg.ellipse(c.x,c.y,.405*scale*camera.k,.655*scale*camera.k,0,0,Math.PI*2);bg.stroke();}
for(const e of edges){const focused=edgeFocused(e),count=selected>=0&&hops===2&&e.a!==selected&&e.b!==selected&&tracedLinks.has(e.index)?tracedLinks.get(e.index).size:e.cards;bg.globalAlpha=selected<0?.16:focused?.64:.035;bg.strokeStyle=focused?edgeColor(e):colors.soft;bg.lineWidth=(.4+Math.min(1.3,Math.log1p(count)*.15))*(selected>=0&&focused?1.4:1);const p=edgePoints(e);bg.setLineDash(asset==='packs'||e.cardGifts===0?[1,4]:selected>=0&&focused&&e.b===selected?[5,4]:[]);edgePath(bg,p);bg.stroke();bg.setLineDash([]);if(selected>=0&&focused)arrow(bg,p,edgeColor(e));}
for(const n of nodes){if(!active.has(n.index)&&n.index!==selected)continue;const p=point(n);if(p.x<-20||p.x>w+20||p.y<-20||p.y>h+20)continue;const focused=selected<0||focus.has(n.index);const radius=(1.0+Math.min(2.8,Math.log1p(n.degree)*.7))*(selected>=0&&focused?1.6:1);bg.globalAlpha=selected<0?.76:focused?.96:.13;bg.fillStyle=focused?nodeColor(n):colors.soft;bg.shadowBlur=focused?6:0;bg.shadowColor=focused?nodeColor(n):colors.soft;bg.beginPath();bg.arc(p.x,p.y,radius,0,Math.PI*2);bg.fill();}
bg.shadowBlur=0;bg.globalAlpha=1;
if(selected>=0){const p=point(nodes[selected]);bg.strokeStyle=colors.fg;bg.lineWidth=1.5;bg.beginPath();bg.arc(p.x,p.y,11,0,Math.PI*2);bg.stroke();}
dirty=false;
}
function labels(){
if(selected<0&&hover<0)return;
const ids=selected>=0?[selected,...Array.from(focus).filter(i=>i!==selected).sort((a,b)=>(depth.get(a)-depth.get(b))||(nodes[b].degree-nodes[a].degree)).slice(0,49)]:[hover];const placed=[];ctx.font='12px sans-serif';ctx.textBaseline='middle';
for(const id of ids){const n=nodes[id],p=point(n);if(p.x<8||p.x>w-8||p.y<8||p.y>h-8)continue;const tw=ctx.measureText(n.id).width+12;let x=Math.max(4,Math.min(w-tw-4,p.x-tw/2)),y=p.y+15;const rect={x,y:y-10,w:tw,h:20};if(id!==selected&&placed.some(r=>rect.x<r.x+r.w+4&&rect.x+rect.w>r.x-4&&rect.y<r.y+r.h+4&&rect.y+rect.h>r.y-4))continue;if(y+10>h)y=p.y-17;
placed.push({x,y:y-10,w:tw,h:20});ctx.globalAlpha=.94;ctx.fillStyle=colors.base;ctx.fillRect(x,y-10,tw,20);ctx.globalAlpha=1;ctx.fillStyle=colors.fg;ctx.fillText(n.id,x+6,y);}
}
function drawFrame(now){
raf=0;if(!visible&&!dirty)return;const dt=visible&&last?Math.min(.1,(now-last)/1000):0;last=now;
if(transition){const t=Math.min(1,(now-transition.start)/transition.duration),s=1-Math.pow(1-t,3);camera={x:transition.from.x+(transition.to.x-transition.from.x)*s,y:transition.from.y+(transition.to.y-transition.from.y)*s,k:transition.from.k+(transition.to.k-transition.from.k)*s};dirty=true;if(t===1)transition=null;}
if(playing&&visible){phase+=dt/2.6;if(phase>=1){phase=0;if(day<29){day++;updateDay();}else{playing=false;play.textContent='Replay transfers';}}}
if(dirty)paintBackground();updateZoomControls();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(off,0,0,off.width,off.height,0,0,w,h);
if(playing&&!reduced.matches){for(let i=0;i<daily[day].length;i++){const signal=daily[day][i],e=edgeLookup.get(signal.edge);if(selected>=0&&!edgeFocused(e))continue;let count=signal.cards;if(selected>=0&&hops===2&&e.a!==selected&&e.b!==selected){count=tracedDays.get(e.index)?.get(day)?.size||0;if(!count)continue;}const p=edgePoints(e),t=(phase*1.25+(i*0.61803398875)%1)%1,one=1-t,x=one*one*p.a.x+2*one*t*p.c.x+t*t*p.b.x,y=one*one*p.a.y+2*one*t*p.c.y+t*t*p.b.y;if(x<-10||x>w+10||y<-10||y>h+10)continue;ctx.globalAlpha=.9;ctx.fillStyle=edgeColor(e);ctx.shadowColor=edgeColor(e);ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x,y,1.8+Math.min(2,Math.log1p(count)*.25),0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;ctx.globalAlpha=1;}
labels();if(visible&&(playing||transition))requestDraw();
}
function requestDraw(){if(!raf&&(visible||dirty))raf=requestAnimationFrame(drawFrame);}
function updateDay(){dayControl.value=String(day);const date=new Date(DATA.start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+day);q('brain-date').textContent=date.toISOString().slice(0,10);const gifts=daily[day].reduce((v,d)=>v+d.gifts,0),cards=daily[day].reduce((v,d)=>v+d.cardCount,0),packs=daily[day].reduce((v,d)=>v+d.packCount,0);q('brain-day-count').textContent=`${gifts.toLocaleString()} gifts · ${units(cards,packs)}`;requestDraw();}
function moveCamera(to){clearPointers();if(reduced.matches){camera=to;transition=null;dirty=true;requestDraw();return;}transition={from:{...camera},to,start:performance.now(),duration:1000};last=0;requestDraw();}
function populateConnections(){const rows=q('brain-rows');rows.replaceChildren();const map=new Map();for(const e of nodeEdges[selected]){const other=e.a===selected?e.b:e.a;const r=map.get(other)||{i:other,incoming:0,outgoing:0,packIn:0,packOut:0,gifts:0};if(e.b===selected){r.incoming+=e.cardCount;r.packIn+=e.packCount;}if(e.a===selected){r.outgoing+=e.cardCount;r.packOut+=e.packCount;}r.gifts+=e.gifts;map.set(other,r);}
Array.from(map.values()).sort((a,b)=>(b.incoming+b.outgoing+b.packIn+b.packOut)-(a.incoming+a.outgoing+a.packIn+a.packOut)).forEach(r=>{const tr=document.createElement('tr'),td=document.createElement('td'),button=document.createElement('button');button.className='btn btn-ghost';button.type='button';button.textContent=nodes[r.i].id;button.addEventListener('click',()=>selectPlayer(r.i));td.append(button);tr.append(td);for(const [column,value] of [r.incoming,r.outgoing,r.packIn,r.packOut,r.gifts].entries()){const cell=document.createElement('td');cell.className='text-end tabular-nums '+(column<4?(column%2===0?'incoming':'outgoing'):'');cell.hidden=(asset==='packs'&&column<2)||(asset==='cards'&&column>=2&&column<4);cell.textContent=value.toLocaleString();tr.append(cell);}rows.append(tr);});}
function updateNeighbourhood(){
depth=new Map([[selected,0]]);for(const other of adjacency[selected])if(other!==selected)depth.set(other,1);
tracedLinks=new Map();tracedDays=new Map();tracedCards=new Set();traceRoutes=[];pathPage=0;
if(hops===2&&itemPaths.ready){const trace=itemPaths.trace(selected,edgeLookup);tracedLinks=trace.links;tracedDays=trace.days;tracedCards=trace.cards;traceRoutes=trace.routes;for(const edge of tracedLinks.keys()){const e=edgeLookup.get(edge);for(const other of [e.a,e.b])if(!depth.has(other))depth.set(other,2);}}
focus=new Set(depth.keys());q('brain-hops').disabled=asset==='packs';q('brain-key-second').hidden=hops!==2;
q('brain-hop-help').textContent=asset==='packs'?'Packs have no unique IDs; only direct pack gifts can be traced.':hops===2?!itemPaths.ready?'Loading matching card paths…':'Follows the same card through consecutive gifts before or after a direct gift. Packs stay direct.':'Includes gifts directly to or from this player.';
q('brain-legend-note').textContent=hops===2?'Cyan/amber are direct gifts; blue follows matching card IDs. Connection totals stay direct.':'Direction is relative to the selected player. Purple points send and receive.';
q('brain-selection').replaceChildren();
for(const [text,cls] of [[nodes[selected].id+' · ',''],['↓ '+units(nodes[selected].incoming,nodes[selected].packIn)+' incoming','incoming'],[' · ',''],['↑ '+units(nodes[selected].outgoing,nodes[selected].packOut)+' outgoing','outgoing'],[' · '+adjacency[selected].size+' direct connections',''],[hops===2&&itemPaths.ready?' · '+(focus.size-1)+' players within 2 hops · '+tracedCards.size.toLocaleString()+' cards followed':'','']]){const span=document.createElement('span');span.textContent=text;span.className=cls;q('brain-selection').append(span);}
canvas.setAttribute('aria-label',`Transfer neighbourhood of ${nodes[selected].id}: ${focus.size-1} other players within ${hops} ${hops===1?'hop':'hops'}. The table below shows direct gifts.`);
dirty=true;hover=-1;tip.hidden=true;
renderItemPaths();if(hops===2&&!itemPaths.ready)loadItemPaths();
if(hops===1){moveCamera({x:nodes[selected].x,y:nodes[selected].y,k:w<480?3.2:3.7});return;}
fitNeighbourhood();
}
function loadItemPaths(){if(pathsRequest)return;pathsRequest=itemPaths.load().then(()=>{pathsRequest=null;if(hops===2&&selected>=0)updateNeighbourhood();}).catch(()=>{pathsRequest=null;if(hops===2&&selected>=0){hops=1;q('brain-hops').value='1';updateNeighbourhood();q('brain-message').textContent='Card paths could not load. Try 2 hops again, or reload for the latest snapshot.';}});}
function renderItemPaths(){
 q('brain-item-paths').hidden=hops!==2||!itemPaths.ready||selected<0;
 q('brain-path-count').textContent=tracedCards.size.toLocaleString()+' matching cards';const rows=q('brain-path-rows');rows.replaceChildren();
 for(const route of traceRoutes.slice(pathPage*25,pathPage*25+25)){const tr=document.createElement('tr'),card=document.createElement('td'),uid=document.createElement('code'),name=document.createElement('div'),match=/^[CG]\d+-(\d+)-/.exec(route.uid);uid.className='path-uid';uid.textContent=route.uid;name.textContent=match?DATA.card_names?.[match[1]]||'Card #'+match[1]:'Card';card.append(name,uid);const path=document.createElement('td'),a=allEdges[route.first],b=allEdges[route.second];for(const [i,id] of [a.a,a.b,b.b].entries()){if(i)path.append(document.createTextNode(' → '));const button=document.createElement('button');button.type='button';button.className='btn btn-ghost history-account';button.textContent=nodes[id].id;button.addEventListener('click',()=>selectPlayer(id));path.append(button);}tr.append(card,path);rows.append(tr);}
 q('brain-path-page').textContent=traceRoutes.length?`${pathPage*25+1}–${Math.min(pathPage*25+25,traceRoutes.length)} of ${traceRoutes.length.toLocaleString()} card routes`:'No matching two-gift card paths in this window.';q('brain-path-prev').disabled=pathPage===0;q('brain-path-next').disabled=(pathPage+1)*25>=traceRoutes.length;
}
q('brain-path-prev').addEventListener('click',()=>{if(pathPage>0){pathPage--;renderItemPaths();}});q('brain-path-next').addEventListener('click',()=>{if((pathPage+1)*25<traceRoutes.length){pathPage++;renderItemPaths();}});
function fitNeighbourhood(){
const xs=Array.from(focus,id=>nodes[id].x),ys=Array.from(focus,id=>nodes[id].y);
const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
const padding=w<480?52:80;
moveCamera({x:(left+right)/2,y:(top+bottom)/2,k:Math.max(.7,Math.min(3.7,(w-padding)/(scale*Math.max(.15,right-left)),(h-padding)/(scale*Math.max(.15,bottom-top))))});
}
function selectPlayer(id){selected=id;input.value=nodes[id].id;q('brain-message').textContent='';updateNeighbourhood();q('brain-connections').hidden=false;q('brain-connections').open=true;populateConnections();history.show(nodes[id].id);}
function overview(){selected=-1;history.hide();q('brain-item-paths').hidden=true;q('brain-legend-note').textContent='Select a player to reveal incoming and outgoing transfers.';focus.clear();depth.clear();input.value='';q('brain-message').textContent='';q('brain-selection').textContent='All players · drag to pan, tap a point to explore';q('brain-connections').hidden=true;q('brain-hops').disabled=true;q('brain-key-second').hidden=true;q('brain-hop-help').textContent='Find a player to explore their neighbourhood.';canvas.setAttribute('aria-label','Brain-shaped network of players and directed card gifts. Search a player to explore their neighbourhood.');dirty=true;moveCamera({x:0,y:0,k:1});}
q('brain-hops').addEventListener('change',()=>{hops=Number(q('brain-hops').value)===2&&asset!=='packs'&&DATA.card_paths?.schema===1?2:1;q('brain-hops').value=String(hops);q('brain-message').textContent='';if(selected>=0)updateNeighbourhood();});
q('brain-asset').addEventListener('change',()=>{asset=q('brain-asset').value;rebuildGraph();});
search.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim().replace(/^@/,'').toLowerCase();const id=index.get(value);if(id!==undefined){selectPlayer(id);return;}const matches=nodes.filter(n=>active.has(n.index)&&n.id.toLowerCase().startsWith(value));if(value&&matches.length===1){selectPlayer(matches[0].index);return;}q('brain-message').textContent=value?matches.length?`Choose a complete player name (${matches.length} matches).`:'That player has no recorded direct gifts in this window.':'Enter a player name.';});
q('brain-overview').addEventListener('click',overview);
play.addEventListener('click',()=>{if(reduced.matches){q('brain-message').textContent='Reduced motion is enabled. Use the replay date slider to inspect daily totals.';return;}if(!playing&&day===29){day=0;phase=0;updateDay();}playing=!playing;play.textContent=playing?'Pause transfers':'Play transfers';last=0;requestDraw();});
dayControl.addEventListener('input',()=>{day=Number(dayControl.value);phase=0;updateDay();});
function canvasPoint(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function nearest(p){let winner=-1,best=selected>=0?22:12;for(const n of nodes){if(!active.has(n.index)&&n.index!==selected)continue;const a=point(n),d=Math.hypot(a.x-p.x,a.y-p.y);if(d<best){best=d;winner=n.index;}}return winner;}
function clearPointers(){const ids=[...pointers.keys()];pointers.clear();gesture=null;for(const id of ids){if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}}
function startGesture(){
 const entries=[...pointers.entries()];
 if(entries.length>=2){pointers.forEach(p=>{p.moved=true;});const [[a,one],[b,two]]=entries,center={x:(one.p.x+two.p.x)/2,y:(one.p.y+two.p.y)/2};gesture={type:'pinch',ids:[a,b],distance:Math.max(1,Math.hypot(one.p.x-two.p.x,one.p.y-two.p.y)),anchor:world(center),zoom:camera.k};}
 else if(entries.length===1){const [id,pointer]=entries[0];gesture={type:'pan',id,last:{...pointer.p}};pointer.start={...pointer.p};}
 else gesture=null;
}
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;const p=canvasPoint(e);transition=null;hover=-1;tip.hidden=true;pointers.set(e.pointerId,{p,start:{...p},moved:false});canvas.setPointerCapture(e.pointerId);startGesture();});
canvas.addEventListener('pointermove',e=>{
 const p=canvasPoint(e),pointer=pointers.get(e.pointerId);
 if(pointer){pointer.p=p;
  if(gesture?.type==='pinch'){const one=pointers.get(gesture.ids[0]),two=pointers.get(gesture.ids[1]);if(one&&two){const center={x:(one.p.x+two.p.x)/2,y:(one.p.y+two.p.y)/2},distance=Math.hypot(one.p.x-two.p.x,one.p.y-two.p.y);camera.k=Math.max(.7,Math.min(12,gesture.zoom*distance/gesture.distance));camera.x=gesture.anchor.x-(center.x-w/2)/(scale*camera.k);camera.y=gesture.anchor.y-(center.y-h/2)/(scale*camera.k);dirty=true;requestDraw();}}
  else if(gesture?.type==='pan'&&gesture.id===e.pointerId){if(Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y)>5)pointer.moved=true;if(pointer.moved){camera.x-=(p.x-gesture.last.x)/(scale*camera.k);camera.y-=(p.y-gesture.last.y)/(scale*camera.k);dirty=true;requestDraw();}gesture.last=p;}
  return;
 }
 if(pointers.size||e.pointerType==='touch')return;const id=nearest(p);if(id!==hover){hover=id;requestDraw();}tip.hidden=id<0;if(id>=0){tip.textContent=nodes[id].id;tip.style.left=Math.max(0,Math.min(w-170,p.x+12))+'px';tip.style.top=Math.max(0,p.y-32)+'px';}
});
function finishPointer(e,cancelled){const pointer=pointers.get(e.pointerId);if(!pointer)return;const tap=!cancelled&&pointers.size===1&&!pointer.moved&&gesture?.type==='pan';pointers.delete(e.pointerId);startGesture();if(tap){const id=nearest(canvasPoint(e));if(id>=0)selectPlayer(id);}}
canvas.addEventListener('pointerup',e=>finishPointer(e,false));canvas.addEventListener('pointercancel',e=>finishPointer(e,true));canvas.addEventListener('lostpointercapture',e=>finishPointer(e,true));
canvas.addEventListener('pointerleave',()=>{hover=-1;tip.hidden=true;requestDraw();});window.addEventListener('blur',clearPointers);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(canvasPoint(e),Math.exp(-e.deltaY*.0012));},{passive:false});
function zoomButton(id,action){
 const button=q(id);let touch=null,lastTouch=-Infinity;
 button.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.isPrimary)touch={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};});
 button.addEventListener('pointermove',e=>{if(touch?.id===e.pointerId&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>10)touch.moved=true;});
 button.addEventListener('pointercancel',()=>{touch=null;});button.addEventListener('lostpointercapture',()=>{touch=null;});
 button.addEventListener('pointerup',e=>{if(touch?.id!==e.pointerId)return;const moved=touch.moved;touch=null;const rect=button.getBoundingClientRect();if(!moved&&!button.disabled&&e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){lastTouch=performance.now();action();}});
 // A touch can finish without a compatibility click after a cancelled pinch.
 // Keep mouse/keyboard clicks, but do not also activate a completed touch twice.
 button.addEventListener('click',e=>{const fromTouch=e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents||(typeof e.pointerType!=='string'&&e.detail!==0);if(fromTouch&&performance.now()-lastTouch<750)return;action();});
}
zoomButton('brain-zoom-in',()=>zoomAt({x:w/2,y:h/2},1.3));zoomButton('brain-zoom-out',()=>zoomAt({x:w/2,y:h/2},1/1.3));
zoomButton('brain-zoom-fit',()=>{if(selected>=0)fitNeighbourhood();else moveCamera({x:0,y:0,k:1});});
function resize(){const nextW=Math.max(280,Math.floor(stage.getBoundingClientRect().width)),nextH=Math.max(420,Math.min(610,nextW*.79));const ratio=Math.min(2,window.devicePixelRatio||1);if(w===nextW&&h===nextH&&dpr===ratio)return;clearPointers();w=nextW;h=nextH;dpr=ratio;scale=Math.min(w/1.93,h/1.92);canvas.width=off.width=Math.round(w*dpr);canvas.height=off.height=Math.round(h*dpr);canvas.style.height=h+'px';dirty=true;requestDraw();}
new ResizeObserver(resize).observe(stage);new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;requestDraw();}else{if(raf){cancelAnimationFrame(raf);raf=0;}if(dirty)requestDraw();}},{threshold:0});visibility.observe(canvas);
reduced.addEventListener('change',()=>{if(reduced.matches){playing=false;play.textContent='Play transfers';transition=null;requestDraw();}});
resize();theme();rebuildGraph();overview();playing=!reduced.matches;play.textContent=playing?'Pause transfers':'Play transfers';requestDraw();
}

loadBrain();
