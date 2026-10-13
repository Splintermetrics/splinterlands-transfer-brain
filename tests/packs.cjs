const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/graph.json'),'utf8'));
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(body);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
try{
const page=await browser.newPage({viewport:{width:1440,height:1100},colorScheme:'dark',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
let ownerRequests=0;
await page.route('https://api.splinterlands.com/cards/find?*',route=>{ownerRequests++;return route.fulfill({json:new URL(route.request().url()).searchParams.get('ids').split(',').map(uid=>({uid,player:'beta'}))});});
const url=process.env.SITE_URL||'http://127.0.0.1:'+server.address().port;
await page.goto(url);await page.waitForSelector('#splinterlands-brain:not(.loading)');
async function select(name){await page.locator('#brain-player').fill(name);await page.locator('#brain-search button[type=submit]').click();}
// Real pack quantities agree with both the graph and the detailed history.
assert.equal(await page.locator('#brain-asset').inputValue(),'both');
assert.equal(await page.locator('#brain-stat-gifts').textContent(),(data.gifts+data.pack_gifts).toLocaleString('en-US'));
await page.locator('#brain-asset').selectOption('packs');
assert.equal(await page.locator('#brain-stat-gifts').textContent(),data.pack_gifts.toLocaleString('en-US'));
assert.equal(await page.locator('#brain-stat-packs').textContent(),data.packs.toLocaleString('en-US'));
const node=data.nodes.find(n=>n[0]==='phoenixevents'&&(n[6]||n[7]))||data.nodes.find(n=>n[6]||n[7]),id=data.nodes.indexOf(node);
await select(node[0]);await page.waitForSelector('#history-rows tr');
const sums=await page.locator('#brain-rows tr').evaluateAll(rows=>rows.reduce((sum,r)=>[sum[0]+Number(r.children[3].textContent.replace(/,/g,'')),sum[1]+Number(r.children[4].textContent.replace(/,/g,''))],[0,0]));
assert.deepEqual(sums,[node[6],node[7]]);
const shard=[...node[0]].reduce((s,c)=>s+c.charCodeAt(0),0)%32,history=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/history',String(shard).padStart(2,'0')+'.json.gz')))).players[node[0]].filter(r=>r[5]);
assert((await page.locator('#history-status').textContent()).includes(history.length.toLocaleString('en-US')+' gifts'));
assert.equal(await page.locator('#history-rows time').first().getAttribute('datetime'),history[0][0]);
assert((await page.locator('#history-rows tr').first().textContent()).includes(history[0][5][2].toLocaleString('en-US')+' ×'));
assert.equal(ownerRequests,0,'Pack quantities must never be sent to card ownership lookup');
const packEdges=data.edges.filter(e=>e[6]>0),direct=new Set([id,...packEdges.filter(e=>e[0]===id||e[1]===id).flatMap(e=>e.slice(0,2))]),two=new Set([...direct,...packEdges.filter(e=>direct.has(e[0])||direct.has(e[1])).flatMap(e=>e.slice(0,2))]);
await page.locator('#brain-hops').selectOption('2');assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes((two.size-1)+' other players within 2 hops'));
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/packs-dark.png'),fullPage:true});
await page.getByRole('button',{name:'Switch to light mode'}).click();await page.setViewportSize({width:390,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'test-results/packs-mobile.png'),fullPage:true});
// A shared edge has one card gift and one pack gift. Pack-only accounts must
// disappear from the card neighbourhood without changing either unit count.
const fixture={start:data.start,end:data.end,snapshot:data.snapshot,updated_at:'packs-fixture',gifts:1,movements:2,pack_gifts:3,packs:12,history:{schema:1,shards:32},card_names:{'1':'Goblin Shaman'},pack_names:{'15:foundation':'Foundations Pack'},
nodes:[['alpha',0,0,2,0,2,4,3],['beta',.3,0,1,2,0,3,0],['gamma',-.3,0,2,0,0,5,4],['delta',-.6,0,1,0,0,0,5]],
edges:[[0,1,1,2,data.end,data.end,1,3],[2,0,0,0,data.end,data.end,1,4],[3,2,0,0,data.end,data.end,1,5]],daily:[[29,0,2,1,3,1],[29,1,0,0,4,1],[29,2,0,0,5,1]]};
const incoming=[data.end+'T23:00:00Z','pack-in','gamma','alpha',[],[15,'foundation',4]],card=[data.end+'T22:00:00Z','card','alpha','beta',['C1-1-A','C1-1-B']],outgoing=[data.end+'T21:00:00Z','pack-out','alpha','beta',[],[15,'foundation',3]],other=[data.end+'T20:00:00Z','other','delta','gamma',[],[15,'foundation',5]];
await page.route('**/data/graph.json',route=>route.fulfill({json:fixture}));await page.route('**/data/history/*.json',route=>route.fulfill({json:{updated_at:'packs-fixture',players:{alpha:[incoming,card,outgoing],beta:[card,outgoing],gamma:[incoming,other],delta:[other]}}}));
ownerRequests=0;await page.reload();await page.waitForSelector('#splinterlands-brain:not(.loading)');await page.locator('#brain-asset').selectOption('packs');await select('alpha');await page.waitForSelector('#history-rows tr');
assert.equal(await page.locator('#history-rows tr').count(),2);assert.equal(ownerRequests,0);assert.equal(await page.locator('#brain-stat-gifts').textContent(),'3');
assert((await page.locator('#brain-selection').textContent()).includes('4 packs incoming'));
assert((await page.locator('#brain-selection').textContent()).includes('3 packs outgoing'));
await page.locator('#brain-hops').selectOption('2');assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('3 other players within 2 hops'));
await page.locator('#brain-day').fill('29');await page.locator('#brain-day').dispatchEvent('input');assert.equal(await page.locator('#brain-day-count').textContent(),'3 gifts · 12 packs');
await page.locator('#brain-asset').selectOption('cards');assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('1 other players within 2 hops'));assert.equal(await page.locator('#history-rows tr').count(),1);assert((await page.locator('#history-status').textContent()).includes('2 card movements'));
await page.waitForFunction(()=>document.querySelector('.owner-status')?.textContent.includes('checked'));assert.equal(ownerRequests,1);
await page.locator('#brain-asset').selectOption('both');assert.equal(await page.locator('#history-rows tr').count(),3);assert.equal(await page.locator('#brain-stat-gifts').textContent(),'4');assert.equal(await page.locator('#brain-day-count').textContent(),'4 gifts · 2 cards + 12 packs');
assert((await page.locator('#history-status').textContent()).includes('2 card movements · 7 packs'));
await page.locator('#brain-asset').selectOption('packs');await page.locator('#history-direction').selectOption('in');assert.equal(await page.locator('#history-rows tr').count(),1);assert((await page.locator('#history-rows').textContent()).includes('4 × Foundations Pack'));assert((await page.locator('#history-rows').textContent()).includes('Not individually traceable'));
assert.deepEqual(errors,[]);console.log('Pack browser checks passed: real totals/history, pack-only ownership exclusion, two hops, shared edges, cards/packs/both switching, replay, filters and mobile.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
