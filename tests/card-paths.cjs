const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/graph.json'),'utf8'));
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(body);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
try{
const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce',colorScheme:'dark'}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const clear=CanvasRenderingContext2D.prototype.clearRect,curve=CanvasRenderingContext2D.prototype.quadraticCurveTo;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(!this.canvas.id)window.graphLines=[];return Reflect.apply(clear,this,args);};CanvasRenderingContext2D.prototype.quadraticCurveTo=function(...args){if(!this.canvas.id)window.graphLines.push({alpha:this.globalAlpha});return Reflect.apply(curve,this,args);};});
const names=['alpha','beta','gamma','delta','noise','sender','upstream','island','packpeer','packfurther'],uids=Array.from({length:27},(_,i)=>'C1-1-A'+i);
const raw=[[0,1,1,28,0,0],[1,2,1,27,0,0],[2,3,1,1,0,0],[1,4,1,1,0,0],[5,0,1,1,0,0],[6,5,1,1,0,0],[2,5,1,1,0,0],[1,0,1,1,0,0],[7,7,1,1,0,0],[0,8,0,0,1,5],[8,9,0,0,1,5],[0,2,1,1,0,0]];
const edges=raw.map(([a,b,g,c,pg,p])=>[a,b,g,c,data.start,data.end,pg,p]);
const nodes=names.map((name,i)=>[name,(i%5-2)*.25,(Math.floor(i/5)-.5)*.5,new Set(edges.filter(e=>e[0]===i||e[1]===i).flatMap(e=>e.slice(0,2)).filter(n=>n!==i)).size,edges.filter(e=>e[1]===i).reduce((n,e)=>n+e[3],0),edges.filter(e=>e[0]===i).reduce((n,e)=>n+e[3],0),edges.filter(e=>e[1]===i).reduce((n,e)=>n+e[7],0),edges.filter(e=>e[0]===i).reduce((n,e)=>n+e[7],0)]);
const fixture={start:data.start,end:data.end,snapshot:data.snapshot,updated_at:data.updated_at||data.snapshot+'T00:00:00Z',card_paths:{schema:1},card_names:{'1':'Goblin Shaman'},gifts:10,movements:63,pack_gifts:2,packs:10,nodes,edges,daily:edges.map((e,i)=>[i===1||i===4?1:i===2||i===7?2:0,i,e[3],e[2],e[7],e[6]])};
const paths=[[0,1,uids.map(uid=>[uid,[[0,1]]])],[1,2,[[uids[0],[[1,2]]]]],[5,4,[['C1-1-B',[[0,1]]]]],[0,7,[['C1-1-R',[[0,2]]]]]];
await page.route('**/data/graph.json',route=>route.fulfill({json:fixture}));await page.route('https://api.splinterlands.com/cards/find?*',route=>route.fulfill({json:[]}));
let requests=0,mode='ok',hold=false,release=null;
await page.route('**/data/card-paths.json.gz',async route=>{requests++;if(hold)await new Promise(resolve=>release=resolve);if(mode==='fail')return route.fulfill({status:503,body:'Unavailable'});return route.fulfill({body:zlib.gzipSync(JSON.stringify({schema:1,updated_at:mode==='stale'?'old':fixture.updated_at,paths}))});});
const url=process.env.SITE_URL||'http://127.0.0.1:'+server.address().port;
async function ready(){await page.waitForSelector('#splinterlands-brain:not(.loading)');}
async function select(name){await page.locator('#brain-player').fill(name);await page.locator('#brain-search button[type=submit]').click();}
async function traced(){await page.waitForFunction(()=>document.querySelector('#brain-selection').textContent.includes('cards followed'));}
await page.goto(url);await ready();await select('alpha');assert.equal(requests,0,'Path index should load only when two hops are requested');
await page.locator('#brain-hops').selectOption('2');await traced();assert.equal(requests,1);
assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('5 other players within 2 hops'));
assert((await page.locator('#brain-selection').textContent()).includes('29 cards followed'));
await page.waitForFunction(()=>window.graphLines?.[1]?.alpha>.5);
const alphas=await page.evaluate(()=>window.graphLines.map(e=>e.alpha));
assert(alphas[1]>.5&&alphas[5]>.5,'Same-card downstream and upstream gifts should be highlighted');
assert(alphas[2]<.1&&alphas[3]<.1&&alphas[6]<.1&&alphas[10]<.1,'Exclude third hops, unrelated gifts, links between focused nodes and onward pack gifts');
await page.locator('#brain-item-paths > summary').click();assert.equal(await page.locator('#brain-path-rows tr').count(),25);
await page.locator('#brain-path-next').click();assert.equal(await page.locator('#brain-path-rows tr').count(),4);
const routes=await page.locator('#brain-path-rows tr').allTextContents();assert(routes.some(r=>r.includes('upstream → sender → alpha')));assert(routes.some(r=>r.includes('alpha → beta → alpha')),'Return gifts remain a single route');assert(!routes.some(r=>r.includes('noise')||r.includes('delta')||r.includes('packfurther')));
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/item-paths.png'),fullPage:true});
await page.locator('#brain-path-prev').click();await page.locator('#brain-path-rows tr').first().getByRole('button',{name:'beta',exact:true}).click();assert((await page.locator('#brain-selection').textContent()).startsWith('beta'));assert.equal(requests,1,'Changing players should reuse the matching snapshot');
await select('alpha');await page.locator('#brain-hops').selectOption('1');assert(await page.locator('#brain-item-paths').isHidden());await page.locator('#brain-hops').selectOption('2');await traced();
await page.locator('#brain-asset').selectOption('packs');assert(await page.locator('#brain-hops').isDisabled());assert.equal(await page.locator('#brain-hops').inputValue(),'1');assert(await page.locator('#brain-item-paths').isHidden());
await page.locator('#brain-asset').selectOption('cards');await page.locator('#brain-hops').selectOption('2');await traced();assert((await page.locator('#brain-canvas').getAttribute('aria-label')).includes('4 other players within 2 hops'));
await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(root,'test-results/item-paths-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
// A late response should trace whichever player is currently selected.
hold=true;const before=requests;await page.reload();await ready();await select('alpha');await page.locator('#brain-hops').selectOption('2');await page.waitForFunction(()=>document.querySelector('#brain-hop-help').textContent.includes('Loading'));
while(!release)await new Promise(resolve=>setTimeout(resolve,10));await select('beta');hold=false;release();release=null;await traced();assert((await page.locator('#brain-selection').textContent()).startsWith('beta'));assert.equal(requests,before+1);
// Failures and mismatched snapshots fall back to direct gifts, with a retry.
mode='fail';await page.reload();await ready();await select('alpha');await page.locator('#brain-hops').selectOption('2');await page.waitForFunction(()=>document.querySelector('#brain-message').textContent.includes('could not load'));assert.equal(await page.locator('#brain-hops').inputValue(),'1');
mode='ok';await page.locator('#brain-hops').selectOption('2');await traced();assert.equal(await page.locator('#brain-message').textContent(),'');
mode='stale';await page.reload();await ready();await select('alpha');await page.locator('#brain-hops').selectOption('2');await page.waitForFunction(()=>document.querySelector('#brain-message').textContent.includes('could not load'));assert.equal(await page.locator('#brain-hops').inputValue(),'1');assert(await page.locator('#brain-item-paths').isHidden());
assert.deepEqual(errors,[]);console.log('Item path checks passed: exact IDs, both directions, return gifts, unrelated/third-hop exclusion, no pack inference, item list, pagination, selection races, retry, snapshot consistency and mobile.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
