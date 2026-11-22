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
const parent=new El(),document={createElement:()=>new El(),querySelector:()=>({appendChild(el){parent.panel=el;}})};
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
console.log('Editor capture, left/right modifiers, command CRUD, and opening shortcut checks passed.');
