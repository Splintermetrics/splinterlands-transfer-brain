const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(body);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce',colorScheme:'dark'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const clear=CanvasRenderingContext2D.prototype.clearRect,curve=CanvasRenderingContext2D.prototype.quadraticCurveTo;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(!this.canvas.id)window.graphLines=[];return Reflect.apply(clear,this,args);};CanvasRenderingContext2D.prototype.quadraticCurveTo=function(...args){if(!this.canvas.id)window.graphLines.push({alpha:this.globalAlpha,color:this.strokeStyle});return Reflect.apply(curve,this,args);};});
 const names=['alpha','beta','gamma','delta','shared','unrelated','zeta','packonly'];
 const edges=[[0,1,1,2],[1,2,1,1],[3,0,1,1],[1,4,1,1],[4,0,1,1],[6,3,1,1],[2,5,1,1],[5,5,1,1],[1,7,0,0],[0,1,0,0],[7,5,0,0]].map((e,i)=>[...e,'2026-10-01','2026-10-08',i>=8?1:0,i===8?3:i===9?2:i===10?4:0]);
 const nodes=names.map((name,i)=>[name,(i%4-1.5)*.3,(Math.floor(i/4)-.5)*.5,3,edges.filter(e=>e[1]===i).reduce((s,e)=>s+e[3],0),edges.filter(e=>e[0]===i).reduce((s,e)=>s+e[3],0),edges.filter(e=>e[1]===i).reduce((s,e)=>s+e[7],0),edges.filter(e=>e[0]===i).reduce((s,e)=>s+e[7],0)]);
 const data={start:'2026-10-01',end:'2026-10-30',snapshot:'2026-10-31',updated_at:'2026-10-31T02:30:00Z',gifts:8,movements:9,pack_gifts:3,packs:9,nodes,edges,daily:edges.map((e,i)=>[i,i,e[3],e[2],e[7],e[6]]),history:{schema:1,shards:32,compression:'gzip'},card_paths:{schema:1},card_names:{1:'Goblin Shaman'}};
 const a='C1-1-A',b='C1-1-B',uids=[[a,'C1-1-X'],[a],[b],['C1-1-C'],['C1-1-D'],[b],[a],['C1-1-U']];
 const rows=edges.map((e,i)=>['2026-10-'+String(i+1).padStart(2,'0')+'T12:00:00Z','tx-'+i,names[e[0]],names[e[1]],uids[i]||[],...(i>=8?[[1,'standard',e[7]]]:[])]);
 const players=Object.fromEntries(names.map(name=>[name,rows.filter(r=>r[2]===name||r[3]===name).reverse()]));
 const paths=[[0,1,[[a,[[0,1]]]]],[5,2,[[b,[[0,1]]]]],[1,6,[[a,[[1,2]]]]]];
 await page.route('**/data/graph.json',route=>route.fulfill({json:data}));
 let pathRequests=0,holdPaths=false,releasePaths;
 await page.route('**/data/card-paths.json.gz',async route=>{pathRequests++;if(holdPaths)await new Promise(resolve=>releasePaths=resolve);await route.fulfill({body:zlib.gzipSync(JSON.stringify({schema:1,updated_at:data.updated_at,paths}))});});
 const shardRequests=new Map();let failShard=-1,holdShard=-1,releaseShard;
 const bucket=name=>[...name].reduce((s,c)=>s+c.charCodeAt(0),0)%32;
 await page.route('**/data/history/*.json.gz',async route=>{const shard=Number(/(\d+)\.json/.exec(route.request().url())[1]);shardRequests.set(shard,(shardRequests.get(shard)||0)+1);if(shard===holdShard)await new Promise(resolve=>releaseShard=resolve);if(shard===failShard)return route.fulfill({status:503});await route.fulfill({body:zlib.gzipSync(JSON.stringify({updated_at:data.updated_at,players:Object.fromEntries(Object.entries(players).filter(([name])=>bucket(name)===shard))}))});});
 await page.route('https://api.splinterlands.com/cards/find?*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('ids').split(',').map(uid=>({uid,player:'beta'}))}));
 const url=process.env.SITE_URL||'http://127.0.0.1:'+server.address().port;
 async function ready(){await page.waitForSelector('#splinterlands-brain:not(.loading)');}
 async function select(value){await page.locator('#brain-player').fill(value);await page.locator('#brain-search button[type=submit]').click();}
 async function historyCount(count){await page.waitForFunction(n=>document.querySelector('#history-status').textContent.includes(': '+n+' gifts'),count);}
 async function trace(){await page.waitForFunction(()=>document.querySelector('#brain-selection').textContent.includes('cards followed'));}
 await page.goto(url);await ready();
 await page.locator('#brain-player').fill('alpha, be');assert(await page.locator('#brain-players option[value="alpha, beta"]').count());
 await select(' @ALPHA , @beta, alpha, ,');await historyCount(7);
 assert.equal(await page.locator('#brain-player').inputValue(),'alpha, beta');assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('4 other players within 1 hop'));
 const selection=await page.locator('#brain-selection').textContent();assert(selection.startsWith('alpha, beta'));assert(selection.includes('4 cards + 2 packs incoming'));assert(selection.includes('4 cards + 5 packs outgoing'));
 const totals=await page.locator('#brain-rows tr').evaluateAll(rows=>rows.reduce((s,r)=>s.map((n,i)=>n+Number(r.children[i+1].textContent.replace(/,/g,''))),[0,0,0,0,0]));assert.deepEqual(totals,[4,4,2,5,7]);
 assert.equal(await page.locator('#history-rows tr').count(),7,'Shared gifts appear once');assert.equal(await page.getByText('↔ Between selected',{exact:true}).count(),2);
 await page.waitForFunction(()=>window.graphLines?.length===11);const lines=await page.evaluate(()=>window.graphLines);assert(lines[0].alpha>.5&&lines[9].alpha>.5);assert.equal(lines[0].color,lines[9].color);assert.notEqual(lines[0].color,lines[1].color);assert.notEqual(lines[0].color,lines[2].color);assert(lines[5].alpha<.1&&lines[6].alpha<.1&&lines[10].alpha<.1);
 await page.locator('#history-direction').selectOption('in');await historyCount(4);await page.locator('#history-direction').selectOption('out');await historyCount(5);await page.locator('#history-direction').selectOption('all');await historyCount(7);
 await page.locator('#history-account').selectOption('shared');await historyCount(2);await page.locator('#history-account').selectOption('');
 await page.locator('#brain-hops').selectOption('2');await trace();assert.equal(pathRequests,1);assert((await page.locator('#brain-selection').textContent()).includes('2 cards followed'));assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('6 other players within 2 hops'));
 await page.locator('#brain-item-paths > summary').click();assert.equal(await page.locator('#brain-path-rows tr').count(),3,'Paths anchored by both selected players appear once');
 await page.waitForFunction(()=>window.graphLines?.[5]?.alpha>.5&&window.graphLines?.[6]?.alpha>.5);assert((await page.evaluate(()=>window.graphLines[10].alpha))<.1,'Do not infer pack continuations');
 const old=await page.locator('#brain-selection').textContent();await select('alpha, missing-account');assert.equal(await page.locator('#brain-selection').textContent(),old);assert((await page.locator('#brain-message').textContent()).includes('missing-account'));
 await select('alpha, ');assert.equal(await page.locator('#brain-player').inputValue(),'alpha');await select('al, be');assert.equal(await page.locator('#brain-player').inputValue(),'alpha, beta');
 await page.locator('#brain-asset').selectOption('cards');await historyCount(5);await page.locator('#brain-asset').selectOption('packs');await historyCount(2);assert(await page.locator('#brain-hops').isDisabled());assert((await page.locator('#brain-selection').textContent()).includes('2 packs incoming'));assert((await page.locator('#brain-selection').textContent()).includes('5 packs outgoing'));
 await page.locator('#brain-asset').selectOption('both');await historyCount(7);
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/multiple-players.png'),fullPage:true});
 await page.setViewportSize({width:390,height:1000});await page.locator('#brain-zoom-in').click();await page.locator('#brain-zoom-fit').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'test-results/multiple-players-mobile.png'),fullPage:true});
 await page.locator('#brain-rows').getByRole('button',{name:'shared',exact:true}).click();assert.equal(await page.locator('#brain-player').inputValue(),'shared');assert(await page.locator('#brain-key-internal').isHidden());
 await page.locator('#brain-overview').click();assert.equal(await page.locator('#brain-player').inputValue(),'');assert(await page.locator('#transfer-history').isHidden());
 for(const count of shardRequests.values())assert.equal(count,1,'Share and cache each history shard');
 // An in-flight response for an older selection cannot overwrite the current group.
 holdShard=bucket('alpha');await page.reload();await ready();await select('alpha, beta');await page.waitForFunction(()=>document.querySelector('#history-status').textContent.startsWith('Loading'));
 while(!releaseShard)await new Promise(resolve=>setTimeout(resolve,10));await select('gamma, delta');await historyCount(4);holdShard=-1;releaseShard();await page.waitForTimeout(100);assert((await page.locator('#history-status').textContent()).startsWith('gamma, delta:'));
 holdPaths=true;await page.locator('#brain-hops').selectOption('2');while(!releasePaths)await new Promise(resolve=>setTimeout(resolve,10));await select('alpha, beta');holdPaths=false;releasePaths();await trace();assert((await page.locator('#brain-selection').textContent()).startsWith('alpha, beta'));
 // Retry a failed shard without losing the selected group or duplicating loaded shards.
 failShard=bucket('beta');await page.reload();await ready();await select('alpha, beta');await page.waitForSelector('#history-retry:not([hidden])');failShard=-1;await page.locator('#history-retry').click();await historyCount(7);assert((await page.locator('#history-status').textContent()).startsWith('alpha, beta:'));
 assert.deepEqual(errors,[]);console.log('Multi-player checks passed: comma parsing, suggestions, combined colours/totals, shared gift/path deduplication, directions, filters, cached shards, retries, selection races, account navigation and mobile.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
