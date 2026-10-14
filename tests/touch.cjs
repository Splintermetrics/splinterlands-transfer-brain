const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/graph.json'),'utf8'));
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(body);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
try{
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',colorScheme:'dark'}),errors=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
// Observe the selected player's rendered ring, rather than exposing camera
// internals in production, to verify pinch anchoring and pan distances.
await page.addInitScript(()=>{const arc=CanvasRenderingContext2D.prototype.arc,clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(!this.canvas.id)window.graphNodePoints=[];return Reflect.apply(clear,this,args);};CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){if(r===11)window.graphSelectedPoint={x,y};else if(!this.canvas.id&&r<10)window.graphNodePoints.push({x,y});return Reflect.apply(arc,this,[x,y,r,...rest]);};});
const fixture={start:data.start,end:data.end,snapshot:data.snapshot,gifts:2,movements:2,nodes:[['alpha',-.3,0,1,1,1],['beta',.3,0,1,1,1]],edges:[[0,1,1,1,data.start,data.start],[1,0,1,1,data.start,data.start]],daily:[[0,0,1,1],[0,1,1,1]]};
await page.route('**/data/graph.json',route=>route.fulfill({json:fixture}));
await page.goto(process.env.SITE_URL||'http://127.0.0.1:'+server.address().port);await page.waitForSelector('#splinterlands-brain:not(.loading)');
await page.locator('#brain-player').fill('alpha');await page.locator('#brain-search button[type=submit]').click();
const canvas=page.locator('#brain-canvas'),zoom=()=>page.locator('#brain-zoom-level').textContent();
await canvas.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='320%');
await page.getByRole('button',{name:'Zoom in',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='416%');
await page.getByRole('button',{name:'Zoom out',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='320%');
const selected=await page.locator('#brain-selection').textContent(),point=()=>page.evaluate(()=>window.graphSelectedPoint);
const original=await point(),rect=await canvas.boundingBox(),center={x:original.x+40,y:original.y-40},client=await page.context().newCDPSession(page);
function touches(cx,cy,half){return [{x:rect.x+cx-half,y:rect.y+cy,id:1},{x:rect.x+cx+half,y:rect.y+cy,id:2}];}
await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(center.x,center.y,35)});
for(let i=1;i<=5;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(center.x+i*2,center.y+i*2.4,35+i*7)});
await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='640%');
const anchored=await point();assert(Math.abs(anchored.x-(center.x+10+(original.x-center.x)*2))<2,'Pinch zoom must keep the world point under the moving finger midpoint');assert(Math.abs(anchored.y-(center.y+12+(original.y-center.y)*2))<2);
await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(center.x+10,center.y+12,17.5)});await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='160%');
await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('#brain-selection').textContent(),selected,'A pinch release must not select a player');
assert.equal(await page.evaluate(()=>visualViewport.scale),1,'The graph should zoom without magnifying the whole page');
// A new one-finger drag after pinching must pan without jumping or selecting.
const beforePan=await point(),panStart={x:rect.x+100,y:rect.y+300,id:3};
await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[panStart]});
await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...panStart,x:panStart.x+25,y:panStart.y+15}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForFunction(before=>Math.abs(window.graphSelectedPoint.x-before.x-25)<2,beforePan);assert(Math.abs((await point()).y-beforePan.y-15)<2);assert.equal(await zoom(),'160%');assert.equal(await page.locator('#brain-selection').textContent(),selected);
// Cancellation must clear both fingers so the next drag remains usable.
await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(center.x,center.y,35)});await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
const beforeCancelPan=await point();await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[panStart]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...panStart,x:panStart.x-20}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(before=>Math.abs(window.graphSelectedPoint.x-before.x+20)<2,beforeCancelPan);
// Touch targets provide an alternative to gestures, including a fitted view.
for(const id of ['brain-zoom-out','brain-zoom-in','brain-zoom-fit']){const box=await page.locator('#'+id).boundingBox();assert(box.width>=44&&box.height>=44);}
async function tapButton(name){const box=await page.getByRole('button',{name,exact:true}).boundingBox();await client.send('Input.synthesizeTapGesture',{x:box.x+box.width/2,y:box.y+box.height/2,gestureSourceType:'touch',duration:50});}
await tapButton('Zoom in');await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='208%');
await tapButton('Zoom out');await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='160%');
await tapButton('Fit graph to view');await page.waitForFunction(()=>window.graphNodePoints?.length===2&&window.graphNodePoints.every(p=>p.x>0&&p.x<document.querySelector('#brain-canvas').clientWidth));assert.equal(await page.locator('#brain-selection').textContent(),selected);
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.locator('#brain-stage').screenshot({path:path.join(root,'test-results/mobile-zoom.png')});
// Keyboard, wheel anchoring and zoom limits on a desktop viewport.
await page.setViewportSize({width:1280,height:900});await canvas.scrollIntoViewIfNeeded();
const beforeKeyboard=Number((await zoom()).replace('%',''));await page.getByRole('button',{name:'Zoom in',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForFunction(before=>Number(document.querySelector('#brain-zoom-level').value.replace('%',''))>before,beforeKeyboard);
const beforeWheel=Number((await zoom()).replace('%','')),desktopRect=await canvas.boundingBox();await page.mouse.move(desktopRect.x+desktopRect.width/2,desktopRect.y+desktopRect.height/2);await page.mouse.wheel(0,-200);await page.waitForFunction(before=>Number(document.querySelector('#brain-zoom-level').value.replace('%',''))>before,beforeWheel);
await page.evaluate(()=>{for(let i=0;i<20;i++)document.querySelector('#brain-zoom-in').click();});await page.waitForFunction(()=>document.querySelector('#brain-zoom-in').disabled);assert.equal(await zoom(),'1200%');
await page.evaluate(()=>{for(let i=0;i<30;i++)document.querySelector('#brain-zoom-out').click();});await page.waitForFunction(()=>document.querySelector('#brain-zoom-out').disabled);assert.equal(await zoom(),'70%');
await page.getByRole('button',{name:'Fit graph to view'}).click();await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='370%');assert.equal(await page.locator('#brain-selection').textContent(),selected);
await page.locator('#brain-overview').click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Fit graph to view'}).click();await page.waitForFunction(()=>document.querySelector('#brain-zoom-level').value==='100%');
assert.deepEqual(errors,[]);console.log('Touch checks passed: real two-finger zoom in/out, midpoint anchoring, one-finger pan, cancellation, unchanged selection, touch buttons, fit, keyboard, wheel and limits.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
