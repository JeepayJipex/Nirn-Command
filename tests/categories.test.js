const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class El {constructor(){this.children=[];this.listeners={};this.value='';this._text='';this.classList={toggle(){}};this.attrs={};}set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text}append(...x){this.children.push(...x)}appendChild(x){if(x.fragment)this.children.push(...x.children);else this.children.push(x)}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,f){this.listeners[k]=f}scrollIntoView(){}focus(){this.focused=true}}
const input=new El(),results=new El(),categories=new El(),meta=new El(),status=new El(),handlers={};
const actionHint=new El(),actionLabel=new El(),leftHint=new El(),favoriteHint=new El();
const document={querySelector:s=>({'#query':input,'#results':results,'#categories':categories,'#meta':meta,'#status':status,'#action-hint':actionHint,'#action-label':actionLabel,'#left-hint':leftHint,'#favorite-hint':favoriteHint})[s],createElement:()=>new El(),createDocumentFragment:()=>Object.assign(new El(),{fragment:true}),addEventListener:(k,f)=>handlers[k]=f};
const sent=[], timers=[], bridgeEvents={};
const window={magelight:{send:(...args)=>sent.push(args),on:(name,fn)=>{bridgeEvents[name]=fn;}},NIRN_COMMANDS:[{id:'builtin:one',label:'Test action',kind:'Console',action:'console:tgm'}],NIRN_SCANNED_COMMANDS:[],NIRN_USER_COMMANDS:[]};
vm.runInNewContext(fs.readFileSync('Magelight/NirnCommand/views/palette/search.js','utf8')+'\n'+fs.readFileSync('Magelight/NirnCommand/views/palette/world-catalog.js','utf8')+'\n'+fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),{window,document,localStorage:{getItem(){return null},setItem(){},removeItem(){}},console,requestAnimationFrame:f=>f(),setTimeout:(fn,ms)=>timers.push({fn,ms}),Date,Map,Set});
const key=(key,extra={})=>{let prevented=false;handlers.keydown({key,code:key,preventDefault(){prevented=true},...extra});return prevented};
window.ncCatalogBegin('1');window.ncAddEntry('item|1:0|game:item:x:1|Iron Sword');window.ncAddEntry('spell|1:1|game:spell:x:2|Fast Healing');window.ncCatalogComplete('1');
assert.equal(categories.children.length,6);assert.equal(categories.children[0].attrs['aria-pressed'],'true');assert.ok(key('Tab'));assert.equal(categories.children[1].attrs['aria-pressed'],'true');assert.ok(input.focused);key('Tab');assert.equal(categories.children[2].attrs['aria-pressed'],'true');assert.equal(results.children[0].children[1].children[0].textContent,'Iron Sword');key('Tab');assert.equal(results.children[0].children[1].children[0].textContent,'Fast Healing');key('Tab',{shiftKey:true});assert.equal(categories.children[2].attrs['aria-pressed'],'true');categories.children[1].listeners.click();assert.equal(categories.children[1].attrs['aria-pressed'],'true');
categories.children[2].listeners.click();assert.equal(actionLabel.textContent,'Equip or use');assert.equal(leftHint.hidden,true);assert.equal(favoriteHint.hidden,false);
categories.children[3].listeners.click();assert.equal(actionLabel.textContent,'Equip');assert.equal(leftHint.hidden,false);assert.equal(favoriteHint.hidden,false);
categories.children[4].listeners.click();assert.equal(actionHint.hidden,true);assert.equal(leftHint.hidden,true);assert.equal(favoriteHint.hidden,true);
console.log('Category clicks, cycling, focus and empty-query catalogs passed.');

// Exercise actual text-node rendering, including a decomposed accent.
document.createTextNode=text=>({textContent:text});
window.ncCatalogBegin('2');window.ncAddEntry('item|2:0|game:item:x:3|E\u0301pee de fer');window.ncCatalogComplete('2');
categories.children[2].listeners.click();input.value='epee';input.listeners.input();
const label=results.children[0].children[1].children[0];
assert.equal(label.children[0].textContent,'E\u0301pee');assert.equal(label.children[1].textContent,' de fer');
input.value='zzz';input.listeners.input();assert.match(results.children[0].textContent,/No items/);
console.log('Unicode highlighting and category-specific empty state passed.');

// Keep keyboard selection across catalog publication and reset when it disappears.
window.ncCatalogBegin('3');window.ncAddEntry('item|3:0|game:item:x:10|Iron Sword');window.ncAddEntry('item|3:1|game:item:x:11|Iron Shield');window.ncCatalogComplete('3');
input.value='iron';input.listeners.input();key('ArrowDown');
const selectedName=()=>results.children.find(row=>row.attrs['aria-selected']==='true').children[1].children[0].children.map(x=>x.textContent).join('');
assert.equal(selectedName(),'Iron Sword');
window.ncCatalogBegin('4');window.ncAddEntry('item|4:0|game:item:x:10|Iron Sword');window.ncAddEntry('item|4:1|game:item:x:11|Iron Shield');window.ncAddEntry('item|4:2|game:item:x:12|Iron Arrow');window.ncCatalogComplete('4');assert.equal(selectedName(),'Iron Sword');
window.ncCatalogBegin('5');window.ncAddEntry('item|5:0|game:item:x:11|Iron Shield');window.ncCatalogComplete('5');assert.equal(selectedName(),'Iron Shield');
console.log('Keyboard selection survives catalog updates and resets after removal.');

window.ncGameLoaded('save-one'); window.ncWorldContext('save-one|1');
window.ncWorldBegin('save-one|1|npc|1|1|2');
window.ncWorldEntry('save-one|1|npc|1|1|0|'+JSON.stringify({id:'npc:1',token:'1',label:'Guard',distance:50,detail:'50 units · ahead'}));
window.ncWorldEntry('save-one|1|npc|1|1|1|'+JSON.stringify({id:'npc:2',token:'2',label:'Guard',distance:25,detail:'25 units · left'}));
window.ncWorldComplete('save-one|1|npc|1|1');
categories.children[4].listeners.click(); input.value=''; input.listeners.input();
assert.equal(results.children.length,2); assert.equal(results.children[0].children[1].children[1].textContent,'25 units · left');
key('Enter'); bridgeEvents.__uimode('0'); categories.children[4].listeners.click();
assert.equal(results.children[0].children[1].children[1].textContent,'25 units · left');
key('Enter');
let msg=sent.at(-1)[1].split('|'); assert.equal(msg[0],'track');
assert.equal(msg[3],'2'); categories.children[2].listeners.click();
assert.equal(categories.children[2].attrs['aria-pressed'],'true');
window.ncGameLoaded('save-two'); window.ncWorldComplete('save-one|1|npc|1|1');
categories.children[4].listeners.click(); input.value=''; input.listeners.input(); assert.match(results.children[0].textContent,/No npcs/);
window.ncWorldContext('save-two|2');
window.ncWorldContext('save-two|1');
window.ncWorldBegin('save-two|2|location|1|1|1');
window.ncWorldEntry('save-two|2|location|1|1|0|'+JSON.stringify({id:'location:9',token:'9',label:'Whiterun',detail:'Skyrim'}));
window.ncWorldComplete('save-two|2|location|1|1');
categories.children[5].listeners.click(); input.value=''; input.listeners.input();
assert.equal(results.children.length,1); assert.equal(results.children[0].children[1].children[0].textContent,'Whiterun');
assert.equal(actionLabel.textContent,'Show on map');assert.equal(leftHint.hidden,true);assert.equal(favoriteHint.hidden,true);
input.value='white'; input.listeners.input();
assert.equal(results.children.length,1); key('Enter'); msg=sent.at(-1)[1].split('|');
window.ncWorldInspect('save-two|2|LOCATION|9|'+msg[5]+'|'+JSON.stringify({available:true,detail:'Skyrim'}));
assert.deepEqual(sent.at(-1),['world','map|save-two|2|9']);
key('Enter'); msg=sent.at(-1)[1].split('|'); const before=sent.length;
window.ncWorldInspect('save-two|2|location|9|'+msg[5]+'|'+JSON.stringify({available:false}));
assert.equal(sent.length,before); assert.equal(results.children[0].children[1].children[1].textContent,'Temporarily unavailable');
key('Enter'); msg=sent.at(-1)[1].split('|'); timers.filter(t=>t.ms===5000).at(-1).fn();
assert.equal(results.children[0].children[1].children[1].textContent,'Validation timed out');
window.ncWorldInspect('save-two|2|location|9|'+msg[5]+'|'+JSON.stringify({available:true}));
assert.notEqual(sent.at(-1)[1],'map|save-two|2|9');
window.ncWorldBegin('save-two|2|location|2|2|10');
for(let i=0;i<10;i++) window.ncWorldEntry('save-two|2|location|2|2|'+i+'|'+JSON.stringify({id:'location:'+i,token:String(i+1),label:'Site '+i,detail:'Skyrim'}));
window.ncWorldComplete('save-two|2|location|2|2');
input.value=''; input.listeners.input(); assert.equal(results.children.length,8);
input.value='site 9'; input.listeners.input(); assert.equal(results.children.length,1);
window.ncWorldContext('save-two|3');
assert.equal(results.children.length,1);
window.ncWorldBegin('save-two|3|location|2|3|1');
window.ncWorldEntry('save-two|3|location|2|3|0|'+JSON.stringify({id:'location:9',token:'10',label:'Site 9',detail:'Skyrim'}));
window.ncWorldComplete('save-two|3|location|2|3');
assert.equal(results.children.length,1);
input.value=''; input.listeners.input(); categories.children[0].listeners.click();
assert.ok(!results.children.some(row=>row.children[1]?.children[0]?.textContent?.startsWith('Site ')));
console.log('World categories, details, unavailable references and save isolation passed.');


