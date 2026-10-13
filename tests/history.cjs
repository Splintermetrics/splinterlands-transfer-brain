const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/graph.json'),'utf8')),zlib=require('node:zlib');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(body);});
});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
try{
const page=await browser.newPage({viewport:{width:1440,height:1100},colorScheme:'dark',reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const url=process.env.SITE_URL||'http://127.0.0.1:'+server.address().port;
if(process.env.CHECK_LIVE_OWNERS!=='1')await page.route('https://api.splinterlands.com/cards/find?*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('ids').split(',').map(uid=>({uid,player:'fixture-owner'}))}));
await page.goto(url);await page.waitForSelector('#splinterlands-brain:not(.loading)');
if(data.pack_gifts!==undefined)await page.locator('#brain-asset').selectOption('cards');
async function select(name){await page.locator('#brain-player').fill(name);await page.locator('#brain-search button[type=submit]').click();}
const name=data.nodes.some(n=>n[0]==='animeboy09')?'animeboy09':data.nodes.find(n=>n[4]>0||n[5]>0)[0],shard=[...name].reduce((s,c)=>s+c.charCodeAt(0),0)%32;
const liveHistory=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/history',String(shard).padStart(2,'0')+'.json.gz'))).toString('utf8')).players[name].filter(r=>!r[5]);
await select(name);await page.waitForSelector('#history-rows tr');
assert((await page.locator('#history-status').textContent()).includes(liveHistory.length+' gifts'));
assert.equal(await page.locator('#history-rows tr').count(),Math.min(25,liveHistory.length));
assert.equal(await page.locator('#history-rows time').first().getAttribute('datetime'),liveHistory[0][0]);
assert((await page.locator('#history-rows').textContent()).includes(liveHistory[0][4][0]));
if(process.env.CHECK_LIVE_OWNERS==='1'){
 await page.waitForFunction(()=>document.querySelector('.owner-status').textContent.includes('checked'),{},{timeout:30000});
 console.log('Live ownership API: '+await page.locator('.owner-status').first().textContent());
}
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
await page.locator('#transfer-history').screenshot({path:path.join(root,'test-results/history-dark.png')});
await page.getByRole('button',{name:'Switch to light mode'}).click();
await page.locator('#transfer-history').screenshot({path:path.join(root,'test-results/history-light.png')});
await page.setViewportSize({width:390,height:1000});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.locator('#transfer-history').screenshot({path:path.join(root,'test-results/history-mobile.png')});
// Controlled gifts exercise filtering, pagination, self transfers and live owner results.
const fixture={start:data.start,end:data.end,snapshot:data.snapshot,updated_at:'fixture',gifts:32,movements:34,
 history:{schema:1,shards:32},card_names:{'1':'Goblin Shaman'},
 nodes:[['alpha',0,0,3,4,31],['beta',.3,.3,1,30,0],['gamma',-.3,-.3,1,0,3]],
 edges:[[0,1,30,30,data.start,data.end],[2,0,1,3,data.end,data.end],[0,0,1,1,data.start,data.start]],daily:[[0,0,30,30],[29,1,3,1],[0,2,1,1]]};
const incoming=[data.end+'T23:59:00Z','in','gamma','alpha',['C1-1-A','C1-1-B','C1-1-C']];
const outgoing=Array.from({length:30},(_,i)=>[data.end+'T12:'+String(59-i).padStart(2,'0')+':00Z','out'+i,'alpha','beta',['C1-1-O'+i]]);
const self=[data.start+'T00:00:00Z','self','alpha','alpha',['C1-1-S']];
const players={alpha:[incoming,...outgoing,self],beta:outgoing,gamma:[incoming]};
await page.route('**/data/graph.json',route=>route.fulfill({json:fixture}));
await page.route('**/data/history/*.json',route=>route.fulfill({json:{updated_at:'fixture',players}}));
let lookups=0;
await page.route('https://api.splinterlands.com/cards/find?*',route=>{lookups++;return route.fulfill({json:new URL(route.request().url()).searchParams.get('ids').split(',').map(uid=>uid==='C1-1-C'?{uid,error:'Card not found.'}:{uid,player:uid==='C1-1-A'||uid==='C1-1-S'?'alpha':'beta'})});});
await page.clock.install();await page.reload();await page.waitForSelector('#splinterlands-brain:not(.loading)');await select('alpha');await page.waitForSelector('#history-rows tr');
await page.waitForFunction(()=>document.querySelector('.owner-status').textContent.includes('checked'));
assert.equal(await page.getByRole('button',{name:'Check owners',exact:true}).count(),0);
assert.equal(lookups,1,'The visible page should use a single batched automatic lookup');assert((await page.locator('.owner-status').first().textContent()).includes('1 still with recipient · 1 elsewhere · 1 unavailable'));
assert.deepEqual(await page.locator('#history-rows tr').first().locator('.current-owners button').allTextContents(),['alpha','beta']);
assert((await page.locator('#history-rows tr').first().textContent()).includes('Now with beta'));
await page.locator('#history-next').click();assert.equal(await page.locator('#history-rows tr').count(),7);
assert((await page.locator('#history-rows tr').last().textContent()).includes('Self gift'));
await page.waitForFunction(()=>![...document.querySelectorAll('.owner-status')].some(el=>el.textContent.includes('Loading')));
assert.equal(lookups,2,'Only the new cards on the older page need a lookup');
await page.locator('#history-direction').selectOption('in');assert.equal(await page.locator('#history-rows tr').count(),2);
await page.locator('#history-account').selectOption('gamma');assert.equal(await page.locator('#history-rows tr').count(),1);
await page.locator('#history-rows tr').first().getByRole('button',{name:'gamma',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('#history-status').textContent.startsWith('gamma:'));
assert.equal(await page.locator('#history-rows tr').count(),1);
assert.equal(lookups,2,'Filtering and selecting another player should reuse fresh owner results');
await page.clock.fastForward(61000);
await page.waitForFunction(()=>!document.querySelector('.owner-status').textContent.includes('Loading'));
assert.equal(lookups,3,'Owners refresh automatically after a minute');
await page.locator('#transfer-history > summary').click();await page.clock.fastForward(61000);
assert.equal(lookups,3,'Collapsed history should not keep polling');
await page.clock.resume();
// Failed lookups must not imply cards are still with the recipient.
await page.route('https://api.splinterlands.com/cards/find?*',route=>route.fulfill({status:503,body:'Temporarily unavailable'}));
await page.reload();await page.waitForSelector('#splinterlands-brain:not(.loading)');await select('alpha');
await page.waitForFunction(()=>document.querySelector('.owner-status')?.textContent.includes('Owner lookup unavailable'));
assert.equal(await page.locator('.current-owners button').count(),0);
// A stale history file must never be shown with a newer network.
await page.route('**/data/history/*.json',route=>route.fulfill({json:{updated_at:'old',players}}));
await page.reload();await page.waitForSelector('#splinterlands-brain:not(.loading)');await select('alpha');
await page.waitForFunction(()=>document.querySelector('#history-status').textContent.includes('snapshot changed'));
assert.equal(await page.locator('#history-rows tr').count(),0);
assert(await page.getByRole('button',{name:'Reload latest snapshot'}).isVisible());
assert.deepEqual(errors,[]);
console.log('History checks passed: automatic batched owners, cache reuse, minute refresh, collapsed pause, failures, real gifts, filters/pagination, themes/mobile and snapshot mismatch.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
