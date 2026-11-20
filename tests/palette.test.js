const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag='div') { this.tag=tag; this.children=[]; this.listeners={}; this.value=''; this._text=''; this.className=''; }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { if (node.tag==='fragment') this.children.push(...node.children); else this.children.push(node); }
  setAttribute() {}
  addEventListener(name,fn) { this.listeners[name]=fn; }
  scrollIntoView() {}
  focus() {}
}
const input = new Element('input'), results = new Element(), meta = new Element(), status = new Element();
const selectors={'#query':input,'#results':results,'#meta':meta,'#status':status};
const handlers={}, sent=[], store=new Map();
const document={querySelector:s=>selectors[s],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(name,fn)=>{handlers[name]=fn;}};
const bridge={send:(...args)=>sent.push(args),on:(name,fn)=>{handlers[name]=fn;}};
const localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
const window={magelight:bridge,NIRN_COMMANDS:[{id:'builtin:test',label:'Fire',kind:'Console',action:'console:tgm'},{id:'builtin:other',label:'Fireball Camera',kind:'Console',action:'console:tcl'}],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const context=vm.createContext({window,document,localStorage,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:()=>0});
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),context);
const key=(key,extra={})=>handlers.keydown({key,code:key,ctrlKey:false,isComposing:false,preventDefault(){},...extra});
const search=value=>{input.value=value; input.listeners.input();};
handlers.__uimode('1'); assert.deepEqual(sent.pop(),['catalog','refresh']);
window.ncCatalogBegin('7'); window.ncAddEntry('spell|7:0|game:spell:Skyrim.esm:42|Fireball'); window.ncAddEntry('item|6:2|game:item:Skyrim.esm:7|Stale Sword'); window.ncCatalogComplete('6');
search('Stale'); assert.equal(results.children[0].textContent,'No results.');
window.ncCatalogComplete('7'); search('fire'); assert.equal(results.children[0].children[1].children[0].textContent,'Fire');
search('fireball'); key('Enter',{ctrlKey:true}); assert.deepEqual(sent.pop(),['execute','1|spellleft:7:0']);
window.ncActionResult('1|sent'); assert.equal(JSON.parse(store.get('nirn-command:v1:usage'))['game:spell:Skyrim.esm:42'].lastResult,'sent');
key('d',{ctrlKey:true}); assert.ok(JSON.parse(store.get('nirn-command:v1:favorites')).includes('game:spell:Skyrim.esm:42'));
window.ncCapabilities('0|0|0'); search('> player.additem f 1'); key('Enter'); assert.equal(sent.length,0); assert.equal(status.textContent,'Action unavailable');
window.ncCapabilities('1|1|1'); key('Enter',{isComposing:true}); assert.equal(sent.length,0); key('Enter'); assert.deepEqual(sent.pop(),['execute','2|console: player.additem f 1']);
window.ncCatalogBegin('8'); window.ncCatalogComplete('8'); search('fireball'); assert.equal(results.children.length,1); assert.equal(results.children[0].children[1].children[0].textContent,'Fireball Camera');
window.ncGameLoaded(); search('fireball'); assert.equal(results.children.length,1);
console.log('UI protocol, stale catalog, ranking, favorites, IME and availability checks passed.');
// Verify the persistent fallback sends bounded UTF-8 chunks and commits them in order.
const sent2=[], handlers2={}, results2=new Element(), input2=new Element('input'), status2=new Element();
const selectors2={'#query':input2,'#results':results2,'#meta':new Element(),'#status':status2};
const document2={querySelector:s=>selectors2[s],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(name,fn)=>{handlers2[name]=fn;}};
const bridge2={send:(...args)=>sent2.push(args),on:(name,fn)=>{handlers2[name]=fn;}};
const window2={magelight:bridge2,NIRN_COMMANDS:[{id:'user:é😀',label:'Special',kind:'Console',action:'console:tgm'}],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const badStorage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');},removeItem(){throw Error('unavailable');}};
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),vm.createContext({window:window2,document:document2,localStorage:badStorage,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:()=>0}));
window2.ncBridgeReady(); assert.deepEqual(sent2.shift(),['persist','read']);
const previous=JSON.stringify({favorites:['user:é😀'],usage:{},settings:{showUnavailable:true}});
window2.ncPersistBegin('0|1'); window2.ncPersistChunk('0|'+previous); window2.ncPersistDone();
assert.equal(results2.children[0].children[2].textContent,'★');
handlers2.keydown({key:'d',ctrlKey:true,isComposing:false,preventDefault(){}});
let writes=[],commit=null;
while(sent2.length) {
  const [channel,payload]=sent2.shift(); assert.equal(channel,'persist');
  const fields=payload.split('|'), operation=fields[0], id=fields[1];
  if(operation==='write') { const chunk=fields.slice(4).join('|'); assert.ok(Buffer.byteLength(chunk,'utf8')<=512); writes.push(chunk); }
  else if(operation==='commit') commit=fields;
  else throw Error('Unexpected fallback operation: '+operation);
  window2.ncPersistAck(id+'|ok');
}
assert.ok(commit); assert.equal(Number(commit[3]),writes.length); assert.deepEqual(JSON.parse(writes.join('')).favorites,[]);
console.log('Preference fallback read, bounded Unicode chunks and commit checks passed.');
handlers2.keydown({key:'d',ctrlKey:true,isComposing:false,preventDefault(){}});
const failed=sent2.shift(); assert.equal(failed[0],'persist');
const failedId=failed[1].split('|')[1]; window2.ncPersistAck(failedId+'|failure');
assert.equal(status2.textContent,'Preferences could not be saved'); assert.equal(sent2.length,0);
console.log('Preference save failures do not report a successful commit.');
