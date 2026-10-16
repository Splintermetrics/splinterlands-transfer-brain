'use strict';
function createCardPaths(data){
let paths=null,pending=null;
async function load(){
 if(paths)return paths;
 if(!pending)pending=(async()=>{
  const response=await fetch('data/card-paths.json.gz',{cache:'no-cache',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Card paths request failed');
  const result=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  if(result.updated_at!==data.updated_at)throw new Error('The snapshot changed. Reload for matching card paths.');
  if(result.schema!==1||!Array.isArray(result.paths))throw new Error('Invalid card path data');
  for(const [first,second,cards] of result.paths){const a=data.edges[first],b=data.edges[second];if(!a||!b||!a[2]||!b[2]||a[1]!==b[0]||!Array.isArray(cards))throw new Error('Invalid card route');for(const [uid,days] of cards){if(typeof uid!=='string'||!Array.isArray(days)||days.some(pair=>pair.length!==2||pair.some(day=>!Number.isInteger(day)||day<0||day>29)||pair[0]>pair[1]))throw new Error('Invalid card path dates');}}
  paths=result.paths;return paths;
 })().catch(error=>{pending=null;throw error;});
 return pending;
}
function trace(selected,available){
 const links=new Map(),days=new Map(),cards=new Set(),routes=new Map();
 function add(edge,uid,pairs,leg,first,second){
  if(!links.has(edge))links.set(edge,new Set());links.get(edge).add(uid);cards.add(uid);
  if(!days.has(edge))days.set(edge,new Map());const byDay=days.get(edge);
  for(const pair of pairs){const day=pair[leg];if(!byDay.has(day))byDay.set(day,new Set());byDay.get(day).add(uid);}
  routes.set(`${first}:${second}:${uid}`,{uid,first,second});
 }
 for(const [first,second,items] of paths||[]){
  if(!available.has(first)||!available.has(second))continue;const a=data.edges[first],b=data.edges[second];
  // A gift to or from the selected account anchors the route. Follow just
  // its adjacent observed gift, never recursively expand the intermediary.
  if(a[0]===selected||a[1]===selected)for(const [uid,pairs] of items)add(second,uid,pairs,1,first,second);
  if(b[0]===selected||b[1]===selected)for(const [uid,pairs] of items)add(first,uid,pairs,0,first,second);
 }
 return {links,days,cards,routes:[...routes.values()]};
}
return {load,trace,get ready(){return paths!==null;}};
}
