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
const nodes=DATA.nodes.map((n,i)=>({id:n[0],x:n[1],y:n[2],degree:n[3],incoming:n[4],outgoing:n[5],index:i}));
const index=new Map(nodes.map(n=>[n.id.toLowerCase(),n.index]));
const edges=DATA.edges.map((e,i)=>({a:e[0],b:e[1],gifts:e[2],cards:e[3],first:e[4],last:e[5],index:i}));
const adjacency=nodes.map(()=>new Set()),nodeEdges=nodes.map(()=>[]),daily=Array.from({length:30},()=>[]);
edges.forEach(e=>{adjacency[e.a].add(e.b);adjacency[e.b].add(e.a);nodeEdges[e.a].push(e);if(e.a!==e.b)nodeEdges[e.b].push(e);});
DATA.daily.forEach(d=>daily[d[0]].push({edge:d[1],cards:d[2],gifts:d[3]}));
nodes.forEach(n=>{const opt=document.createElement('option');opt.value=n.id;q('brain-players').append(opt);});
q('brain-period').textContent=`${DATA.start} – ${DATA.end} · UTC`;
q('brain-stat-players').textContent=nodes.length.toLocaleString();q('brain-stat-gifts').textContent=DATA.gifts.toLocaleString();q('brain-stat-cards').textContent=DATA.movements.toLocaleString();
const updated=DATA.updated_at?new Date(DATA.updated_at):new Date(DATA.snapshot+'T00:00:00Z');
q('brain-updated').textContent=DATA.updated_at?`Updated ${updated.toLocaleString(undefined,{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC · refreshes daily`:`Snapshot ${DATA.snapshot} · refreshes daily`;
if(Date.now()-updated.getTime()>48*60*60*1000){q('brain-updated').textContent+=' · refresh delayed';q('brain-updated').classList.add('stale');}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let selected=-1,focus=new Set(),camera={x:0,y:0,k:1},transition=null,w=600,h=500,scale=240,dpr=1,day=0,playing=false,phase=0,last=0,raf=0,dirty=true,colors={},hover=-1,pointer=null,visible=true;
function resolveColor(name){const probe=document.createElement('span');probe.style.color=`var(${name})`;root.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;}
function theme(){colors={fg:resolveColor('--foreground'),base:resolveColor('--background'),soft:resolveColor('--muted-foreground'),out:resolveColor('--outgoing'),in:resolveColor('--incoming'),neutral:resolveColor('--network'),both:resolveColor('--both'),border:resolveColor('--border')};dirty=true;requestDraw();}
function point(n){return {x:w/2+(n.x-camera.x)*scale*camera.k,y:h/2+(n.y-camera.y)*scale*camera.k};}
function world(p){return {x:(p.x-w/2)/(scale*camera.k)+camera.x,y:(p.y-h/2)/(scale*camera.k)+camera.y};}
function edgePoints(e){const a=point(nodes[e.a]),b=point(nodes[e.b]);if(e.a===e.b)return {a,b,c:{x:a.x+45,y:a.y-60}};const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const bend=Math.min(42,len*.16);return {a,b,c:{x:(a.x+b.x)/2-dy/len*bend,y:(a.y+b.y)/2+dx/len*bend}};}
function edgePath(context,p){context.beginPath();context.moveTo(p.a.x,p.a.y);context.quadraticCurveTo(p.c.x,p.c.y,p.b.x,p.b.y);}
function edgeColor(e){return selected<0?colors.neutral:e.b===selected?colors.in:colors.out;}
function nodeColor(n){if(n.index===selected)return colors.fg;if(selected<0)return colors.neutral;const incoming=nodeEdges[selected].some(e=>e.a===n.index&&e.b===selected),outgoing=nodeEdges[selected].some(e=>e.b===n.index&&e.a===selected);return incoming&&outgoing?colors.both:incoming?colors.in:colors.out;}
function arrow(context,p,color){const t=.78,u=1-t,x=u*u*p.a.x+2*u*t*p.c.x+t*t*p.b.x,y=u*u*p.a.y+2*u*t*p.c.y+t*t*p.b.y;const angle=Math.atan2(2*u*(p.c.y-p.a.y)+2*t*(p.b.y-p.c.y),2*u*(p.c.x-p.a.x)+2*t*(p.b.x-p.c.x));context.save();context.translate(x,y);context.rotate(angle);context.fillStyle=color;context.beginPath();context.moveTo(5,0);context.lineTo(-4,-3);context.lineTo(-4,3);context.closePath();context.fill();context.restore();}
function edgeFocused(e){return selected<0||e.a===selected||e.b===selected;}
function paintBackground(){
bg.setTransform(dpr,0,0,dpr,0,0);bg.clearRect(0,0,w,h);bg.lineCap='round';
// Thin anatomical guides are a schematic silhouette, not additional links.
for(const side of [-1,1]){const c=point({x:side*.415,y:0});bg.globalAlpha=.11;bg.strokeStyle=colors.soft;bg.lineWidth=.8;bg.beginPath();bg.ellipse(c.x,c.y,.405*scale*camera.k,.655*scale*camera.k,0,0,Math.PI*2);bg.stroke();}
for(const e of edges){const focused=edgeFocused(e);bg.globalAlpha=selected<0?.16:focused?.64:.035;bg.strokeStyle=focused?edgeColor(e):colors.soft;bg.lineWidth=(.4+Math.min(1.3,Math.log1p(e.cards)*.15))*(selected>=0&&focused?1.4:1);const p=edgePoints(e);bg.setLineDash(selected>=0&&focused&&e.b===selected?[5,4]:[]);edgePath(bg,p);bg.stroke();bg.setLineDash([]);if(selected>=0&&focused)arrow(bg,p,edgeColor(e));}
for(const n of nodes){const p=point(n);if(p.x<-20||p.x>w+20||p.y<-20||p.y>h+20)continue;const focused=selected<0||focus.has(n.index);const radius=(1.0+Math.min(2.8,Math.log1p(n.degree)*.7))*(selected>=0&&focused?1.6:1);bg.globalAlpha=selected<0?.76:focused?.96:.13;bg.fillStyle=focused?nodeColor(n):colors.soft;bg.shadowBlur=focused?6:0;bg.shadowColor=focused?nodeColor(n):colors.soft;bg.beginPath();bg.arc(p.x,p.y,radius,0,Math.PI*2);bg.fill();}
bg.shadowBlur=0;bg.globalAlpha=1;
if(selected>=0){const p=point(nodes[selected]);bg.strokeStyle=colors.fg;bg.lineWidth=1.5;bg.beginPath();bg.arc(p.x,p.y,11,0,Math.PI*2);bg.stroke();}
dirty=false;
}
function labels(){
if(selected<0&&hover<0)return;
const ids=selected>=0?[selected,...Array.from(focus).filter(i=>i!==selected)]:[hover];const placed=[];ctx.font='12px sans-serif';ctx.textBaseline='middle';
for(const id of ids){const n=nodes[id],p=point(n);if(p.x<8||p.x>w-8||p.y<8||p.y>h-8)continue;const tw=ctx.measureText(n.id).width+12;let x=Math.max(4,Math.min(w-tw-4,p.x-tw/2)),y=p.y+15;const rect={x,y:y-10,w:tw,h:20};if(id!==selected&&placed.some(r=>rect.x<r.x+r.w+4&&rect.x+rect.w>r.x-4&&rect.y<r.y+r.h+4&&rect.y+rect.h>r.y-4))continue;if(y+10>h)y=p.y-17;
placed.push({x,y:y-10,w:tw,h:20});ctx.globalAlpha=.94;ctx.fillStyle=colors.base;ctx.fillRect(x,y-10,tw,20);ctx.globalAlpha=1;ctx.fillStyle=colors.fg;ctx.fillText(n.id,x+6,y);}
}
function drawFrame(now){
raf=0;if(!visible)return;const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
if(transition){const t=Math.min(1,(now-transition.start)/transition.duration),s=1-Math.pow(1-t,3);camera={x:transition.from.x+(transition.to.x-transition.from.x)*s,y:transition.from.y+(transition.to.y-transition.from.y)*s,k:transition.from.k+(transition.to.k-transition.from.k)*s};dirty=true;if(t===1)transition=null;}
if(playing){phase+=dt/2.6;if(phase>=1){phase=0;if(day<29){day++;updateDay();}else{playing=false;play.textContent='Replay transfers';}}}
if(dirty)paintBackground();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(off,0,0,off.width,off.height,0,0,w,h);
if(playing&&!reduced.matches){for(let i=0;i<daily[day].length;i++){const signal=daily[day][i],e=edges[signal.edge];if(selected>=0&&!edgeFocused(e))continue;const p=edgePoints(e),t=(phase*1.25+(i*0.61803398875)%1)%1,one=1-t,x=one*one*p.a.x+2*one*t*p.c.x+t*t*p.b.x,y=one*one*p.a.y+2*one*t*p.c.y+t*t*p.b.y;if(x<-10||x>w+10||y<-10||y>h+10)continue;ctx.globalAlpha=.9;ctx.fillStyle=edgeColor(e);ctx.shadowColor=edgeColor(e);ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x,y,1.8+Math.min(2,Math.log1p(signal.cards)*.25),0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;ctx.globalAlpha=1;}
labels();if(playing||transition)requestDraw();
}
function requestDraw(){if(!raf&&visible)raf=requestAnimationFrame(drawFrame);}
function updateDay(){dayControl.value=String(day);const date=new Date(DATA.start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+day);q('brain-date').textContent=date.toISOString().slice(0,10);const gifts=daily[day].reduce((v,d)=>v+d.gifts,0),cards=daily[day].reduce((v,d)=>v+d.cards,0);q('brain-day-count').textContent=`${gifts.toLocaleString()} gifts · ${cards.toLocaleString()} card movements`;requestDraw();}
function moveCamera(to){if(reduced.matches){camera=to;transition=null;dirty=true;requestDraw();return;}transition={from:{...camera},to,start:performance.now(),duration:1000};last=0;requestDraw();}
function populateConnections(){const rows=q('brain-rows');rows.replaceChildren();const map=new Map();for(const e of nodeEdges[selected]){const other=e.a===selected?e.b:e.a;const r=map.get(other)||{i:other,incoming:0,outgoing:0,gifts:0};if(e.b===selected)r.incoming+=e.cards;if(e.a===selected)r.outgoing+=e.cards;r.gifts+=e.gifts;map.set(other,r);}
Array.from(map.values()).sort((a,b)=>(b.incoming+b.outgoing)-(a.incoming+a.outgoing)).forEach(r=>{const tr=document.createElement('tr'),td=document.createElement('td'),button=document.createElement('button');button.className='btn btn-ghost';button.type='button';button.textContent=nodes[r.i].id;button.addEventListener('click',()=>selectPlayer(r.i));td.append(button);tr.append(td);for(const [column,value] of [r.incoming,r.outgoing,r.gifts].entries()){const cell=document.createElement('td');cell.className='text-end tabular-nums '+(column===0?'incoming':column===1?'outgoing':'');cell.textContent=value.toLocaleString();tr.append(cell);}rows.append(tr);});}
function selectPlayer(id){selected=id;q('brain-legend-note').textContent='Direction is relative to the selected player. Purple points send and receive.';focus=new Set([id,...adjacency[id]]);input.value=nodes[id].id;q('brain-message').textContent='';q('brain-selection').replaceChildren();for(const [text,cls] of [[nodes[id].id+' · ',''],['↓ '+nodes[id].incoming.toLocaleString()+' incoming','incoming'],[' · ',''],['↑ '+nodes[id].outgoing.toLocaleString()+' outgoing','outgoing'],[' · '+adjacency[id].size+' connected players','']]){const span=document.createElement('span');span.textContent=text;span.className=cls;q('brain-selection').append(span);}q('brain-connections').hidden=false;q('brain-connections').open=true;populateConnections();dirty=true;hover=-1;tip.hidden=true;moveCamera({x:nodes[id].x,y:nodes[id].y,k:w<480?3.2:3.7});}
function overview(){selected=-1;q('brain-legend-note').textContent='Select a player to reveal incoming and outgoing transfers.';focus.clear();input.value='';q('brain-message').textContent='';q('brain-selection').textContent='All players · drag to pan, tap a point to explore';q('brain-connections').hidden=true;dirty=true;moveCamera({x:0,y:0,k:1});}
search.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim().replace(/^@/,'').toLowerCase();const id=index.get(value);if(id!==undefined){selectPlayer(id);return;}const matches=nodes.filter(n=>n.id.toLowerCase().startsWith(value));if(value&&matches.length===1){selectPlayer(matches[0].index);return;}q('brain-message').textContent=value?matches.length?`Choose a complete player name (${matches.length} matches).`:'That player has no recorded direct card gifts in this window.':'Enter a player name.';});
q('brain-overview').addEventListener('click',overview);
play.addEventListener('click',()=>{if(reduced.matches){q('brain-message').textContent='Reduced motion is enabled. Use the replay date slider to inspect daily totals.';return;}if(!playing&&day===29){day=0;phase=0;updateDay();}playing=!playing;play.textContent=playing?'Pause transfers':'Play transfers';last=0;requestDraw();});
dayControl.addEventListener('input',()=>{day=Number(dayControl.value);phase=0;updateDay();});
function canvasPoint(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function nearest(p){let winner=-1,best=selected>=0?22:12;for(const n of nodes){const a=point(n),d=Math.hypot(a.x-p.x,a.y-p.y);if(d<best){best=d;winner=n.index;}}return winner;}
canvas.addEventListener('pointerdown',e=>{const p=canvasPoint(e);pointer={start:p,last:p,moved:false,id:e.pointerId};transition=null;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const p=canvasPoint(e);if(pointer&&pointer.id===e.pointerId){const dx=p.x-pointer.last.x,dy=p.y-pointer.last.y;if(Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y)>5)pointer.moved=true;if(pointer.moved){camera.x-=dx/(scale*camera.k);camera.y-=dy/(scale*camera.k);dirty=true;requestDraw();}pointer.last=p;return;}const id=nearest(p);if(id!==hover){hover=id;requestDraw();}tip.hidden=id<0;if(id>=0){tip.textContent=nodes[id].id;tip.style.left=Math.max(0,Math.min(w-170,p.x+12))+'px';tip.style.top=Math.max(0,p.y-32)+'px';}});
canvas.addEventListener('pointerup',e=>{const p=canvasPoint(e);if(pointer&&!pointer.moved){const id=nearest(p);if(id>=0)selectPlayer(id);}pointer=null;});
canvas.addEventListener('pointercancel',()=>{pointer=null;});canvas.addEventListener('pointerleave',()=>{hover=-1;tip.hidden=true;requestDraw();});
canvas.addEventListener('wheel',e=>{e.preventDefault();transition=null;const p=canvasPoint(e),before=world(p);camera.k=Math.max(.7,Math.min(12,camera.k*Math.exp(-e.deltaY*.0012)));const after=world(p);camera.x+=before.x-after.x;camera.y+=before.y-after.y;dirty=true;requestDraw();},{passive:false});
function resize(){const nextW=Math.max(280,Math.floor(stage.getBoundingClientRect().width)),nextH=Math.max(420,Math.min(610,nextW*.79));const ratio=Math.min(2,window.devicePixelRatio||1);if(w===nextW&&h===nextH&&dpr===ratio)return;w=nextW;h=nextH;dpr=ratio;scale=Math.min(w/1.93,h/1.92);canvas.width=off.width=Math.round(w*dpr);canvas.height=off.height=Math.round(h*dpr);canvas.style.height=h+'px';dirty=true;requestDraw();}
new ResizeObserver(resize).observe(stage);new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;requestDraw();}else if(raf){cancelAnimationFrame(raf);raf=0;}},{threshold:0});visibility.observe(canvas);
reduced.addEventListener('change',()=>{if(reduced.matches){playing=false;play.textContent='Play transfers';transition=null;requestDraw();}});
resize();theme();updateDay();overview();playing=!reduced.matches;play.textContent=playing?'Pause transfers':'Play transfers';requestDraw();
}

loadBrain();
