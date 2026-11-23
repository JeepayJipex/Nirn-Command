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
let now=Date.now(); const timers=[]; class FakeDate extends Date { static now() {return now;} }
const context=vm.createContext({window,document,localStorage,Set,Map,Date:FakeDate,console,requestAnimationFrame:fn=>fn(),setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;}});
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),context);
const key=(key,extra={})=>handlers.keydown({key,code:key,ctrlKey:false,isComposing:false,preventDefault(){},...extra});
const search=value=>{input.value=value; input.listeners.input();};
window.ncGameLoaded('controller-session'); window.ncBridgeReady(); assert.ok(sent.some(message=>message[0]==='catalog' && message[1]==='ready|controller-session')); sent.length=0; window.ncGameLoaded();
handlers.__uimode('1'); assert.equal(sent.length,0);
window.ncCatalogBegin('7'); window.ncAddEntry('spell|7:0|game:spell:Skyrim.esm:42|Fireball'); window.ncAddEntry('item|6:2|game:item:Skyrim.esm:7|Stale Sword'); window.ncCatalogComplete('6');
search('Stale'); assert.equal(results.children[0].textContent,'No results.');
window.ncCatalogComplete('7'); assert.deepEqual(sent.pop(),['catalog','applied|7']); search('fire'); assert.equal(results.children[0].children[1].children[0].textContent,'Fire');
search('fireball'); key('Enter',{ctrlKey:true}); assert.deepEqual(sent.pop(),['execute','1|spellleft:7:0']);
window.ncActionResult('1|sent'); assert.equal(JSON.parse(store.get('nirn-command:v1:usage'))['game:spell:Skyrim.esm:42'].lastResult,'sent');
key('d',{ctrlKey:true}); assert.ok(JSON.parse(store.get('nirn-command:v1:favorites')).includes('game:spell:Skyrim.esm:42'));
window.ncCapabilities('0|0|0'); search('> player.additem f 1'); key('Enter'); assert.equal(sent.length,0); assert.equal(status.textContent,'Unavailable: required plugin not detected.');
window.ncCapabilities('1|1|1'); key('Enter',{isComposing:true}); assert.equal(sent.length,0); key('Enter'); assert.deepEqual(sent.pop(),['execute','2|console: player.additem f 1']);
window.ncCatalogBegin('8'); search('fireball'); assert.equal(results.children[0].children[1].children[0].textContent,'Fireball'); window.ncCatalogComplete('8'); assert.deepEqual(sent.pop(),['catalog','applied|8']); search('fireball'); assert.equal(results.children.length,1); assert.equal(results.children[0].children[1].children[0].textContent,'Fireball Camera');
window.ncGameLoaded(); search('fireball'); assert.equal(results.children.length,1);
console.log('UI protocol, stale catalog, ranking, favorites, IME and availability checks passed.');
window.ncCatalogBegin('9'); window.ncCatalogBatch('9|0|'+JSON.stringify(['spell','9:0','game:spell:Skyrim.esm:12','Éclair | 星'])+'\n'+JSON.stringify(['item','9:1','game:item:Skyrim.esm:13','Sword'])); window.ncCatalogComplete('9|1'); assert.deepEqual(sent.pop(),['catalog','applied|9']); search('Éclair'); assert.equal(results.children[0].children[1].children[0].textContent,'Éclair | 星'); window.ncCatalogBegin('10'); window.ncCatalogBatch('10|1|'+JSON.stringify(['item','10:0','','Bad'])); window.ncCatalogComplete('10|2'); search('Éclair'); assert.equal(results.children[0].children[1].children[0].textContent,'Éclair | 星'); console.log('Batched catalog preserves Unicode and rejects missing batches.');
window.ncGameLoaded(); window.ncCatalogBatch('9|0|'+JSON.stringify(['spell','9:0','game:spell:Skyrim.esm:12','Éclair | 星'])); window.ncCatalogComplete('9|1'); search('Éclair'); assert.equal(results.children[0].textContent,'No results.'); window.ncCatalogBegin('11'); window.ncCatalogBatch('11|0|'+JSON.stringify(['spell','11:0','game:spell:Skyrim.esm:99','Other save spell'])); window.ncCatalogComplete('11|1'); assert.deepEqual(sent.pop(),['catalog','applied|11']); search('Other save'); assert.equal(results.children[0].children[1].children[0].textContent,'Other save spell'); console.log('Save boundary clears catalog and ignores late batches.');
const longName='É😀'.repeat(500), longRow=JSON.stringify(['item','12:0','game:item:Skyrim.esm:1',longName]), midpoint=Math.floor(longRow.length/2); window.ncCatalogBegin('12'); window.ncCatalogFragment('12|0|0|2|'+longRow.slice(0,midpoint)); window.ncCatalogFragment('12|1|1|2|'+longRow.slice(midpoint)); window.ncCatalogComplete('12|2'); assert.deepEqual(sent.pop(),['catalog','applied|12']); search('É😀'); assert.equal(results.children[0].children[1].children[0].textContent,longName); window.ncCatalogBegin('13'); window.ncCatalogFragment('13|0|0|2|'+longRow.slice(0,midpoint)); window.ncCatalogComplete('13|1'); search('É😀'); assert.equal(results.children[0].children[1].children[0].textContent,longName); console.log('Long fragmented entry survives Unicode and incomplete fragments are rejected.');
window.ncCatalogBegin('14'); window.ncCatalogBatch('12|0|'+JSON.stringify(['item','12:0','','Stale'])); window.ncCatalogBatch('14|0|'+JSON.stringify(['spell','14:0','','Current'])); window.ncCatalogComplete('14|1'); assert.deepEqual(sent.pop(),['catalog','applied|14']); search('Current'); assert.equal(results.children[0].children[1].children[0].textContent,'Current'); console.log('Late generation data cannot invalidate a newer transfer.');
window.ncGameLoaded('new'); window.ncBridgeReady(); const ready=sent.findIndex(x=>x[0]==='catalog'&&x[1].startsWith('ready|')); assert.ok(ready>=0); const session=sent.splice(ready,1)[0][1].slice(6); window.ncCatalogBegin('old-session|2'); window.ncCatalogBatch('old-session|2|0|'+JSON.stringify(['item','2:0','','Wrong save'])); window.ncCatalogComplete('old-session|2|1'); search('Wrong save'); assert.equal(results.children[0].textContent,'No results.'); window.ncCatalogBegin(session+'|2'); window.ncCatalogBatch(session+'|2|0|'+JSON.stringify(['item','2:0','','Current save'])); window.ncCatalogComplete(session+'|2|1'); assert.deepEqual(sent.pop(),['catalog','applied|'+session+'|2']); search('Current save'); assert.equal(results.children[0].children[1].children[0].textContent,'Current save'); console.log('Session token rejects an old begin with a reused epoch.');
window.ncDeltaBegin(session+'|2|3'); window.ncDeltaRemove(session+'|3|0|0'); window.ncCatalogBatch(session+'|3|1|'+JSON.stringify(['item','3:8','','Added item'])); window.ncCatalogComplete(session+'|3|2'); assert.deepEqual(sent.pop(),['catalog','applied|'+session+'|3']); search('Current save'); assert.equal(results.children[0].textContent,'No results.'); search('Added item'); assert.equal(results.children[0].children[1].children[0].textContent,'Added item'); key('Enter'); assert.deepEqual(sent.pop(),['execute','3|item:3:8']); console.log('Inventory delta applies atomically and executes new generation.');
window.ncDeltaBegin(session+'|3|4'); window.ncDeltaRemove(session+'|4|1|8'); window.ncCatalogComplete(session+'|4|2'); search('Added item'); assert.equal(results.children[0].children[1].children[0].textContent,'Added item'); window.ncDeltaBegin(session+'|999|5'); assert.deepEqual(sent.pop(),['catalog','snapshot|'+session]); search('Added item'); assert.equal(results.children[0].children[1].children[0].textContent,'Added item'); console.log('Incomplete or mismatched delta preserves the previous catalog.');
window.ncCatalogBegin(session+'|8'); window.ncCatalogBatch(session+'|8|0|'+JSON.stringify(['spell','8:22','','Starting spell'])+'\n'+JSON.stringify(['item','8:33','','Old item'])); window.ncCatalogComplete(session+'|8|1'); assert.deepEqual(sent.pop(),['catalog','applied|'+session+'|8']); window.ncDeltaBegin(session+'|8|9'); window.ncDeltaRemove(session+'|9|0|33'); window.ncCatalogComplete(session+'|9|1'); assert.deepEqual(sent.pop(),['catalog','applied|'+session+'|9']); search('Starting spell'); assert.equal(results.children[0].children[1].children[0].textContent,'Starting spell'); key('Enter'); assert.deepEqual(sent.pop(),['execute','4|spell:9:22']); console.log('Inventory delta preserves and retokens spells.');
window.ncCatalogBegin(session+'|6'); const stalled=timers.at(-1); now+=30001; stalled.fn(); assert.deepEqual(sent.pop(),['catalog','snapshot|'+session]); window.ncCatalogComplete(session+'|6|0'); search('Starting spell'); assert.equal(results.children[0].children[1].children[0].textContent,'Starting spell'); window.ncCatalogBegin(session+'|7'); const completed=timers.at(-1); window.ncCatalogComplete(session+'|7|0'); assert.deepEqual(sent.pop(),['catalog','applied|'+session+'|7']); now+=30001; const messagesBefore=sent.length; completed.fn(); assert.equal(sent.length,messagesBefore); console.log('Stalled catalog recovers without accepting late completion or retrying completed transfers.');
window.ncCatalogBegin(session+'|10'); now+=30001; timers.at(-1).fn(); assert.deepEqual(sent.pop(),['catalog','snapshot|'+session]); window.ncCatalogBegin(session+'|11'); now+=30001; const beforeRetry=sent.length; timers.at(-1).fn(); assert.equal(sent.length,beforeRetry); assert.match(status.textContent,/unavailable/i); console.log('Recovery stops after one retry.');
window.ncGameLoaded('new'); handlers.__uimode('1'); search('Fire'); assert.equal(results.children[0].children[1].children[0].textContent,'Fire'); key('Enter'); assert.equal(sent.pop()[1].split('|')[1],'console:tgm'); window.ncBridgeReady(); const newReady=sent.findIndex(x=>x[0]==='catalog' && x[1].startsWith('ready|')); const newSession=sent.splice(newReady,1)[0][1].slice(6); window.ncCatalogBegin(newSession+'|1'); for(let i=0;i<1000;i++) window.ncCatalogBatch(newSession+'|1|'+i+'|'+JSON.stringify(['spell','1:'+i,'','Spell '+i])); window.ncCatalogComplete(newSession+'|1|1000'); assert.deepEqual(sent.pop(),['catalog','applied|'+newSession+'|1']); search('Spell 999'); assert.equal(results.children[0].children[1].children[0].textContent,'Spell 999'); console.log('Static actions work before the first scan and a large catalog is searchable.');
const beforeSpell=sent.length; window.ncCatalogBegin(newSession+'|2|spell'); window.ncCatalogBatch(newSession+'|2|0|'+JSON.stringify(['spell','2:42','','New spell'])); window.ncCatalogComplete(newSession+'|2|1'); assert.equal(sent.length,beforeSpell); search('New spell'); assert.equal(results.children[0].children[1].children[0].textContent,'New spell'); window.ncCatalogBegin(newSession+'|2|item'); window.ncCatalogBatch(newSession+'|2|0|'+JSON.stringify(['item','2:17','','New sword'])); window.ncCatalogComplete(newSession+'|2|1'); assert.deepEqual(sent.pop(),['catalog','applied|'+newSession+'|2']); search('New spell'); assert.equal(results.children[0].children[1].children[0].textContent,'New spell'); search('New sword'); assert.equal(results.children[0].children[1].children[0].textContent,'New sword'); console.log('Spells publish independently and survive the item category.');
window.ncCatalogBegin(newSession+'|3|item'); assert.deepEqual(sent.pop(),['catalog','snapshot|'+newSession]); window.ncCatalogComplete(newSession+'|3|0'); search('New spell'); assert.equal(results.children[0].children[1].children[0].textContent,'New spell'); window.ncCatalogBegin(newSession+'|3|spell'); window.ncCatalogComplete(newSession+'|3|0'); now+=30001; const beforeGap=sent.length; timers.at(-1).fn(); assert.equal(sent.length,beforeGap); assert.match(status.textContent,/unavailable/i); console.log('Missing spell category and stalled category boundary cannot acknowledge incomplete catalogs.');
window.ncTransferBegin(newSession+'|4|1|spell|'); window.ncTransferBatch(newSession+'|4|1|spell|0|'+JSON.stringify(['spell','4:5','','Stale attempt'])); window.ncTransferBegin(newSession+'|4|2|spell|'); window.ncTransferBatch(newSession+'|4|1|spell|1|'+JSON.stringify(['spell','4:6','','Late entry'])); window.ncTransferBatch(newSession+'|4|2|spell|0|'+JSON.stringify(['spell','4:7','','Fresh spell'])); window.ncTransferComplete(newSession+'|4|1|spell|2'); window.ncTransferComplete(newSession+'|4|2|spell|1'); window.ncTransferBegin(newSession+'|4|2|item|'); window.ncTransferComplete(newSession+'|4|2|item|0'); assert.deepEqual(sent.pop(),['catalog','applied|'+newSession+'|4|2']); search('Fresh spell'); assert.equal(results.children[0].children[1].children[0].textContent,'Fresh spell'); search('Late entry'); assert.equal(results.children[0].textContent,'No results.'); console.log('Stale transfer attempts cannot contaminate a newer attempt.');
window.ncTransferBegin(newSession+'|5|3|SPELL|'); window.ncTransferBatch(newSession+'|5|3|SPELL|0|'+JSON.stringify(['SPELL','5:42','','Papyrus spell'])); window.ncTransferComplete(newSession+'|5|3|SPELL|1'); window.ncTransferBegin(newSession+'|5|3|ITEM|'); window.ncTransferBatch(newSession+'|5|3|ITEM|0|'+JSON.stringify(['ITEM','5:43','','Papyrus item'])); window.ncTransferComplete(newSession+'|5|3|ITEM|1'); assert.deepEqual(sent.pop(),['catalog','applied|'+newSession+'|5|3']); search('Papyrus spell'); assert.equal(results.children[0].children[1].children[0].textContent,'Papyrus spell'); search('Papyrus item'); assert.equal(results.children[0].children[1].children[0].textContent,'Papyrus item'); console.log('Papyrus uppercase categories and entry types are accepted.');
window.ncCapabilities('1|1|0|1');
window.ncDiscoveryBegin();
window.ncDiscoveryEntry(JSON.stringify({id:'mcm:Example:open',label:'Example — Open',kind:'Mod',action:'shortcut2:37:0',source:'MCM/Settings/keybinds.json',confidence:'configured association'}));
window.ncDiscoveryEntry(JSON.stringify({id:'mcm:Example:fake',label:'Unmapped',kind:'Mod',action:'console:tgm'}));
window.ncDiscoveryComplete();search('Example');assert.equal(results.children[0].children[1].children[0].textContent,'Example — Open');assert.match(results.children[0].title,/MCM/);
search('Unmapped');assert.equal(results.children[0].textContent,'No results.');
// Verify the persistent fallback sends bounded UTF-8 chunks and commits them in order.
const sent2=[], handlers2={}, results2=new Element(), input2=new Element('input'), status2=new Element();
const selectors2={'#query':input2,'#results':results2,'#meta':new Element(),'#status':status2};
const document2={querySelector:s=>selectors2[s],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(name,fn)=>{handlers2[name]=fn;}};
const bridge2={send:(...args)=>sent2.push(args),on:(name,fn)=>{handlers2[name]=fn;}};
const window2={magelight:bridge2,NIRN_COMMANDS:[{id:'user:é😀',label:'Special',kind:'Console',action:'console:tgm'}],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const badStorage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');},removeItem(){throw Error('unavailable');}};
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),vm.createContext({window:window2,document:document2,localStorage:badStorage,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:()=>0}));
window2.ncBridgeReady(); assert.deepEqual(sent2.shift(),['catalog','ready']); assert.deepEqual(sent2.shift(),['persist','read']); assert.deepEqual(sent2.shift(),['commands','read']); assert.deepEqual(sent2.shift(),['overrides','read']);
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
// New native store migrates legacy commands once using acknowledged UTF-8-safe chunks.
const sent3=[], handlers3={}, input3=new Element('input'), results3=new Element();
const document3={querySelector:s=>({'#query':input3,'#results':results3,'#meta':new Element(),'#status':new Element()})[s],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(name,fn)=>{handlers3[name]=fn;}};
const window3={magelight:{send:(...args)=>sent3.push(args),on:(name,fn)=>{handlers3[name]=fn;}},NIRN_COMMANDS:[],NIRN_SCANNED_COMMANDS:[],NIRN_USER_COMMANDS:[{id:'user:legacy',label:'Épée 😀',action:'console:help "été|é"'}]};
const store3=new Map(), storage3={getItem:key=>store3.get(key)||null,setItem:(key,value)=>store3.set(key,value),removeItem:key=>store3.delete(key)};
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),vm.createContext({window:window3,document:document3,localStorage:storage3,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:()=>0}));
window3.ncBridgeReady(); assert.deepEqual(sent3.shift(),['catalog','ready']); assert.deepEqual(sent3.shift(),['commands','read']); assert.deepEqual(sent3.shift(),['overrides','read']);
window3.ncCommandsBegin('-1');window3.ncCommandsDone();
let serialized='';let operations=[];
while(sent3.length) {
  const [channel,payload]=sent3.shift();assert.equal(channel,'commands');const first=payload.indexOf('|'),second=payload.indexOf('|',first+1);
  const op=payload.slice(0,first),request=second<0?payload.slice(first+1):payload.slice(first+1,second);operations.push(op);
  if(op==='write') {const part=payload.slice(second+1);assert.ok(Buffer.byteLength(part,'utf8')<=400);serialized+=part;}
  window3.ncCommandsAck(request+'|ok');
}
assert.equal(operations[0],'begin');assert.equal(operations.at(-1),'commit');assert.equal(JSON.parse(serialized).commands[0].label,'Épée 😀');assert.equal(JSON.parse(serialized).commands[0].action,'console:help "été|é"');
console.log('Native command migration and Unicode transaction protocol checks passed.');
// Hotkey saves use the registered execute listener and ignore mismatched replies.
const sent4=[], timers4=[], handlers4={}, editor4={isOpen:()=>false,open(){},hide(){},hotkeyState(){},hotkeyResult(...args){this.last=args;}};
let options4;const window4={magelight:{send:(...args)=>sent4.push(args),on:(name,fn)=>handlers4[name]=fn},NirnEditor:{create:options=>(options4=options,editor4),codes:{}},NIRN_COMMANDS:[],NIRN_USER_COMMANDS:[],NIRN_SCANNED_COMMANDS:[]};
const document4={querySelector:s=>({'#query':new Element('input'),'#results':new Element(),'#meta':new Element(),'#status':new Element()})[s],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener(){}};
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),vm.createContext({window:window4,document:document4,localStorage,Set,Map,Date,console,requestAnimationFrame:fn=>fn(),setTimeout:fn=>timers4.push(fn)}));
assert.equal(options4.setHotkey(66,32,7),true);assert.deepEqual(sent4.shift(),['execute','1|hotkey:66|32']);
assert.equal(options4.setHotkey(67,0,7),false);window4.ncHotkeyResult('99|ok');assert.equal(editor4.last,undefined);
window4.ncHotkeyResult('1|ok');assert.deepEqual(editor4.last,[true,7]);timers4.shift()();assert.equal(sent4.length,0);
assert.equal(options4.setHotkey(68,0,8),true);sent4.shift();timers4.shift()();assert.deepEqual(editor4.last,['timeout',8]);assert.deepEqual(sent4.shift(),['execute','3|hotkey:get']);
console.log('Hotkey routing, request correlation and timeout reconciliation checks passed.');
// Fictional providers are independently searchable and honor saved overrides.
window.ncOverridesBegin('1');window.ncOverridesChunk('0|'+JSON.stringify({version:1,overrides:{'provider:alpha:open':{action:'shortcut2:66:4'},'provider:beta:hidden':{hidden:true},'provider:removed:old':{hidden:true}}}));window.ncOverridesDone();
window.ncCapabilities('1|1');window.ncDiscoveryBegin();
window.ncDiscoveryEntry(JSON.stringify({id:'provider:alpha:open',label:'Alpha open',kind:'Mod',action:'shortcut2:37:0',requirementsMet:true}));
window.ncDiscoveryEntry(JSON.stringify({id:'provider:beta:hidden',label:'Beta hidden',kind:'Mod',action:'console:tgm',requirementsMet:true}));
window.ncDiscoveryEntry(JSON.stringify({id:'provider:beta:missing',label:'Beta missing',kind:'Mod',action:'console:tcl',requirementsMet:false}));
window.ncDiscoveryComplete();search('Alpha open');key('Enter');assert.equal(sent.pop()[1].split('|')[1],'shortcut2:66:4');
search('Beta hidden');assert.equal(results.children[0].textContent,'No results.');
search('Beta missing');key('Enter');assert.equal(status.textContent,'Unavailable: required plugin not detected.');
window.ncDiscoveryBegin();window.ncDiscoveryComplete();search('Alpha open');assert.equal(results.children[0].textContent,'No results.');
window.ncDiscoveryBegin();window.ncDiscoveryEntry(JSON.stringify({id:'provider:alpha:open',label:'Alpha open',kind:'Mod',action:'shortcut2:37:0',requirementsMet:true}));window.ncDiscoveryComplete();search('Alpha open');key('Enter');assert.equal(sent.pop()[1].split('|')[1],'shortcut2:66:4');
console.log('Provider overrides, missing requirements and removal/reinstallation passed.');
