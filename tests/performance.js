const {performance}=require('node:perf_hooks'),os=require('node:os'),search=require('../Magelight/NirnCommand/views/palette/search.js');
function stats(values){values.sort((a,b)=>a-b);return {median:+values[Math.floor(values.length/2)].toFixed(3),p95:+values[Math.floor(values.length*.95)].toFixed(3)}}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,unit:'ms',warmup:10,iterations:30}));
for(const count of [1000,10000,50000]) {
 const data=Array.from({length:count},(_,i)=>({id:'synthetic:'+i,label:['Iron','Steel','Ebony','Silver'][i%4]+' '+['Sword','Shield','Healing','Fireball'][Math.floor(i/4)%4]+' '+i,kind:i%2?'Item':'Spell',keywords:'synthetic fixture'}));
 const index=search.create();let start=performance.now();index.replace('catalog',data);const indexMs=performance.now()-start;
 const queries=['Steel Sword 17','steel sw','heal fast','firebal','flom','fam','zzzzzzzz'],times=[],renderTimes=[];
 for(let i=0;i<40;i++){start=performance.now();index.search(queries[i%queries.length]);const elapsed=performance.now()-start;if(i>=10)times.push(elapsed); start=performance.now(); const rows=index.search(queries[i%queries.length]).map(entry=>({label:entry.label,kind:entry.kind,detail:entry.detail||''})); if(rows.length>30)throw Error('Too many rows'); if(i>=10)renderTimes.push(performance.now()-start)}
 start=performance.now();index.replace('catalog',data);const updateMs=performance.now()-start;
 console.log(JSON.stringify({count,indexMs:+indexMs.toFixed(3),updateMs:+updateMs.toFixed(3),search:stats(times),searchAndSimulatedRows:stats(renderTimes)}));
}
for(const count of [1000,10000,50000]) {
 const inventory=Array.from({length:1000},(_,i)=>({id:'item:'+i,label:'Iron Sword '+i,kind:'Item'}));
 const world=Array.from({length:count},(_,i)=>({id:'world:'+i,label:'Nordic Location '+i,kind:i%2?'Location':'NPC',distance:i}));
 const idx=search.create(); idx.replace('catalog',inventory); const start=performance.now(); idx.replace('world',world); const indexMs=performance.now()-start;
 const all=[],items=[];
 for(let i=0;i<40;i++) {let t=performance.now(); idx.search('iron sword'); if(i>=10) all.push(performance.now()-t); t=performance.now();idx.search('iron sword',{parts:['catalog']}); if(i>=10) items.push(performance.now()-t);}
 console.log(JSON.stringify({worldCount:count,worldIndexMs:+indexMs.toFixed(3),all:stats(all),itemsOnly:stats(items)}));
}
