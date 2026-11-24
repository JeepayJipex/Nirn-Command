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
const actionHint=new Element(), actionLabel=new Element(), leftHint=new Element(), favoriteHint=new Element();
const document={querySelector:s=>({'#query':input,'#results':results,'#meta':new Element(),'#status':new Element(),'#action-hint':actionHint,'#action-label':actionLabel,'#left-hint':leftHint,'#favorite-hint':favoriteHint})[s],createElement:()=>new Element(),createDocumentFragment:()=>Object.assign(new Element(),{fragment:true}),addEventListener:(name,fn)=>handlers[name]=fn};
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
search('Test Actor'); assert.equal(actionLabel.textContent,'Track'); assert.equal(leftHint.hidden,true); assert.equal(favoriteHint.hidden,true); enter(); assert.deepEqual(sent.pop(),['world','track|session|1|9|1']);
window.ncTrackingState('old|1|-16777215'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|2|-16777215'); window.ncTrackingState('session|1|0'); search('Test Actor'); assert.equal(results.children[0].children[1].children[1].textContent,'nearby'); assert.equal(results.children[0].children[3].textContent,'Tracked'); assert.match(results.children[0].children[3].className,/tracked/);
assert.deepEqual(sent.pop(),['world','tracking-ui|session|1|4278190081|1|1']);
assert.equal(actionLabel.textContent,'Stop tracking'); enter(); assert.deepEqual(sent.pop(),['world','stop-tracking|session|1|2|-16777215']);
results.children[0].listeners.click(); assert.deepEqual(sent.pop(),['world','stop-tracking|session|1|3|-16777215']);
search('Stop tracking NPC'); assert.equal(results.children[0].children[1].children[0].textContent,'Stop tracking NPC'); enter(); assert.deepEqual(sent.pop(),['world','stop-tracking|session|1|4']);
window.ncTrackingState('session|3|0'); search('Test Actor'); assert.equal(results.children[0].children[3].textContent,'NPC'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|4|123'); window.ncGameLoaded('new-session'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncTrackingState('session|5|123'); search('Stop tracking NPC'); assert.equal(results.children[0].textContent,'No results.');
window.ncWorldContext('new-session|1'); window.ncTrackingState('new-session|1|100');
window.ncWorldBegin('new-session|1|npc|1|1|2');
window.ncWorldEntry('new-session|1|npc|1|1|0|'+JSON.stringify({id:'npc:1',token:'1',form:'100',distance:5,label:'First Actor'}));
window.ncWorldEntry('new-session|1|npc|1|1|1|'+JSON.stringify({id:'npc:2',token:'2',form:'200',distance:10,label:'Second Actor'}));
window.ncWorldComplete('new-session|1|npc|1|1');sent.length=0;
search('Actor');assert.equal(actionLabel.textContent,'Stop tracking');results.children[1].listeners.mouseenter();assert.equal(actionLabel.textContent,'Track');
search('Second Actor');assert.equal(actionLabel.textContent,'Track');enter();assert.equal(sent.pop()[1].split('|')[0],'track');
search('First Actor');assert.equal(actionLabel.textContent,'Stop tracking');
console.log('Tracking UI state, request routing and save isolation passed.');

