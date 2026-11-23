const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class El {constructor(){this.children=[];this.listeners={};this.value='';this._text='';this.classList={toggle(){}};this.attrs={};}set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text}append(...x){this.children.push(...x)}appendChild(x){if(x.fragment)this.children.push(...x.children);else this.children.push(x)}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,f){this.listeners[k]=f}scrollIntoView(){}focus(){this.focused=true}}
const input=new El(),results=new El(),categories=new El(),meta=new El(),status=new El(),handlers={};
const document={querySelector:s=>({'#query':input,'#results':results,'#categories':categories,'#meta':meta,'#status':status})[s],createElement:()=>new El(),createDocumentFragment:()=>Object.assign(new El(),{fragment:true}),addEventListener:(k,f)=>handlers[k]=f};
const window={NIRN_COMMANDS:[{id:'builtin:one',label:'Test action',kind:'Console',action:'console:tgm'}],NIRN_SCANNED_COMMANDS:[],NIRN_USER_COMMANDS:[]};
vm.runInNewContext(fs.readFileSync('Magelight/NirnCommand/views/palette/search.js','utf8')+'\n'+fs.readFileSync('Magelight/NirnCommand/views/palette/main.js','utf8'),{window,document,localStorage:{getItem(){return null},setItem(){},removeItem(){}},console,requestAnimationFrame:f=>f(),setTimeout(){},Date,Map,Set});
const key=(key,extra={})=>{let prevented=false;handlers.keydown({key,code:key,preventDefault(){prevented=true},...extra});return prevented};
window.ncCatalogBegin('1');window.ncAddEntry('item|1:0|game:item:x:1|Iron Sword');window.ncAddEntry('spell|1:1|game:spell:x:2|Fast Healing');window.ncCatalogComplete('1');
assert.equal(categories.children.length,4);assert.equal(categories.children[0].attrs['aria-pressed'],'true');assert.ok(key('Tab'));assert.equal(categories.children[1].attrs['aria-pressed'],'true');assert.ok(input.focused);key('Tab');assert.equal(categories.children[2].attrs['aria-pressed'],'true');assert.equal(results.children[0].children[1].children[0].textContent,'Iron Sword');key('Tab');assert.equal(results.children[0].children[1].children[0].textContent,'Fast Healing');key('Tab',{shiftKey:true});assert.equal(categories.children[2].attrs['aria-pressed'],'true');categories.children[1].listeners.click();assert.equal(categories.children[1].attrs['aria-pressed'],'true');
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
