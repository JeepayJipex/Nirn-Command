const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.children=[]; this.listeners={}; this.value=''; this._text=''; this.classList={toggle(){}}; }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { if (item.fragment) this.children.push(...item.children); else this.children.push(item); }
  addEventListener(name, fn) { this.listeners[name]=fn; }
  setAttribute() {} focus() {} scrollIntoView() {}
}
const input=new Element(), results=new Element(), handlers={}, sent=[];
const document={querySelector:s=>({'#query':input,'#results':results,'#meta':new Element(),'#status':new Element()})[s],createElement:()=>new Element(),createDocumentFragment:()=>Object.assign(new Element(),{fragment:true}),addEventListener:(name,fn)=>handlers[name]=fn};
const window={magelight:{send:(...args)=>sent.push(args),on:(name,fn)=>handlers[name]=fn},NIRN_COMMANDS:[],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const context=vm.createContext({window,document,localStorage,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:()=>0});
for (const file of ['world-catalog.js','search.js','main.js']) vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/'+file,'utf8'),context);
const search=value=>{input.value=value;input.listeners.input();};
const enter=()=>handlers.keydown({key:'Enter',code:'Enter',ctrlKey:false,isComposing:false,preventDefault(){}});
window.ncGameLoaded('session'); handlers.__uimode('1'); window.ncWorldContext('session|1');
window.ncWorldBegin('session|1|npc|1|1|1');
window.ncWorldEntry('session|1|npc|1|1|0|'+JSON.stringify({id:'npc:9',token:'9',form:'4278190081',distance:12,label:'Test Actor',detail:'nearby'}));
window.ncWorldComplete('session|1|npc|1|1');
sent.length=0;
search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
search('Test Actor'); enter(); assert.deepEqual(sent.pop(),['world','track|session|1|9|1']);
window.ncTrackingState('old|1|-16777215'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|2|-16777215'); window.ncTrackingState('session|1|0'); search('Test Actor'); assert.equal(results.children[0].children[1].children[1].textContent,'Tracked · nearby');
search('Stop tracking NPC'); assert.equal(results.children[0].children[1].children[0].textContent,'Stop tracking NPC'); enter(); assert.deepEqual(sent.pop(),['world','stop-tracking|session|1|2']);
window.ncTrackingState('session|3|0'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|4|123'); window.ncGameLoaded('new-session'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|5|123'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
console.log('Tracking UI state, request routing and save isolation passed.');

