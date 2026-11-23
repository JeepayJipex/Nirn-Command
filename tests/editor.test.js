const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class El {
  constructor() {this.hidden=false;this.value='';this.textContent='';this.listeners={};this.options=[];}
  set innerHTML(html) { this.fields={}; for(const match of html.matchAll(/data-field="([^"]+)"/g)) this.fields[match[1]]=new El(); }
  querySelector(sel) {return this.fields[sel.match(/"([^"]+)"/)[1]];}
  addEventListener(type,fn) {this.listeners[type]=fn;}
  appendChild(child) {this.options.push(child);}
  focus() {}
  click(){this.listeners.click?.({});}
}
const parent=new El(); parent.classList={add(){},remove(){}}; const document={createElement:()=>new El(),querySelector:()=>({appendChild(el){parent.panel=el;el.parentElement=parent;}})};
const window={},ctx=vm.createContext({window,document,Date,Math});
vm.runInContext(fs.readFileSync('Magelight/NirnCommand/views/palette/editor.js','utf8'),ctx);
let commands=[],hotkey=null,closed=0;
const editor=window.NirnEditor.create({getCommands:()=>commands,setCommands:value=>commands=value,getHotkey:()=>({key:210,mask:0}),setHotkey:(key,mask)=>hotkey={key,mask},onClose:()=>closed++});
const f=id=>parent.panel.fields[id],press=(key,code,extra={})=>editor.keydown({key,code,preventDefault(){},stopPropagation(){},...extra});
editor.open('command');f('name').value='Open test';f('type').value='shortcut';f('type').listeners.change();f('capture').click();
press('Shift','ShiftRight');press('Control','ControlLeft');press('K','KeyK');f('save').click();
assert.equal(commands.length,1);assert.equal(commands[0].action,'shortcut2:37:6');
const id=commands[0].id; f('commands').value=id; f('commands').listeners.change(); f('name').value='Renamed';f('save').click();
assert.equal(commands.length,1);assert.equal(commands[0].id,id);assert.equal(commands[0].label,'Renamed');
f('delete').click();assert.equal(commands.length,0);
editor.open('hotkey');f('capture').click();press('Alt','AltRight');press('F8','F8');f('save').click();assert.deepEqual(hotkey,{key:66,mask:32});
editor.hotkeyResult(true);assert.equal(closed,1);
editor.open('hotkey');f('capture').click();press('PageUp','PageUp');f('save').click();assert.equal(hotkey.key,66);
press('Escape','Escape'); editor.hotkeyResult('timeout'); assert.equal(f('message').textContent,'Result unconfirmed. Current shortcut is being checked.'); editor.hotkeyState({key:66,mask:32}); assert.equal(f('message').textContent,'Current shortcut: Alt Right + F8'); editor.hotkeyResult(false); assert.equal(f('message').textContent,'Could not save shortcut'); editor.hide(); editor.open('hotkey'); const before=closed; editor.hotkeyResult(true,1); assert.equal(closed,before); assert.equal(editor.isOpen(),true);
console.log('Editor capture, left/right modifiers, command CRUD, and opening shortcut checks passed.');
// Provider overrides remain separate from the immutable manifest entries.
let savedOverride=null;
const providers=[{id:'provider:fictional:menu',label:'Fictional menu',action:'shortcut2:37:0'}];
const providerEditor=window.NirnEditor.create({getCommands:()=>[],setCommands:()=>{},getProviders:()=>providers,getOverride:()=>savedOverride||{},setOverride:(id,value)=>{assert.equal(id,providers[0].id);savedOverride=value;return true;},getHotkey:()=>({key:210,mask:0}),setHotkey:()=>{},onClose:()=>{}});
providerEditor.open('provider'); f('commands').value=providers[0].id;f('commands').listeners.change();f('hidden').checked=true;f('capture').click();
providerEditor.keydown({key:'F8',code:'F8',preventDefault(){},stopPropagation(){}});f('save').click();
assert.equal(savedOverride.hidden,true);assert.equal(savedOverride.action,'shortcut2:66:0');assert.equal(providers[0].action,'shortcut2:37:0');
f('reset').click();assert.equal(savedOverride,null);
f('hidden').checked=true;f('save').click();assert.equal(savedOverride.hidden,true);assert.equal(savedOverride.action,undefined);
console.log('Provider remapping, hiding and restoring preserve manifest defaults.');
