const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class E {constructor(){this.children=[];this.value='';this.classList={toggle(){}}}set textContent(x){this.children=[]}append(...xs){this.children.push(...xs)}appendChild(x){if(x.fragment)this.children.push(...x.children);else this.children.push(x)}setAttribute(){}addEventListener(){}focus(){}scrollIntoView(){}}
const elements={'#query':new E(),'#results':new E(),'#meta':new E(),'#status':new E()},events={},sent=[],timers=[];
const document={querySelector:s=>elements[s],createElement:()=>new E(),createDocumentFragment:()=>Object.assign(new E(),{fragment:true}),addEventListener(){}};
const window={magelight:{send:(...args)=>sent.push(args),on:(name,fn)=>events[name]=fn},NIRN_COMMANDS:[],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const source=fs.readFileSync('Magelight/NirnCommand/views/palette/search.js','utf8')+'\n'+fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8');
vm.runInNewContext(source,{window,document,localStorage:{getItem(){return null},setItem(){},removeItem(){}},Date,Map,Set,console,requestAnimationFrame:fn=>fn(),setTimeout:(fn,delay)=>{timers.push({fn,delay})}});
window.ncGameLoaded('session-one');events.__uimode('1');assert.deepEqual(sent.pop(),['catalog','tick|session-one']);const first=timers.find(t=>t.delay===1000);assert.ok(first);first.fn();assert.deepEqual(sent.pop(),['catalog','tick|session-one']);
window.ncGameLoaded('session-two');const next=timers.filter(t=>t.delay===1000).at(-1);next.fn();assert.deepEqual(sent.pop(),['catalog','tick|session-two']);events.__uimode('0');const closed=timers.filter(t=>t.delay===1000).at(-1);closed.fn();assert.equal(sent.length,0);
events.__uimode('1');assert.deepEqual(sent.pop(),['catalog','tick|session-two']);first.fn();assert.equal(sent.length,0);
console.log('Heartbeat uses current session, stops on close and rejects stale timers.');
