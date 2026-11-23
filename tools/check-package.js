// Inspect the actual archive, including runtime artifact headers and SEQ contents.
const fs=require('fs'), zlib=require('zlib');
const archive=fs.readFileSync(process.argv[2]);
let end=archive.length-22;
while(end>=Math.max(0,archive.length-65557) && archive.readUInt32LE(end)!==0x06054b50) end--;
if(end<0) throw Error('ZIP end record not found');
const count=archive.readUInt16LE(end+10), entries=new Map(); let pos=archive.readUInt32LE(end+16);
for(let i=0;i<count;i++) {
  if(archive.readUInt32LE(pos)!==0x02014b50) throw Error('Invalid ZIP central directory');
  const method=archive.readUInt16LE(pos+10), size=archive.readUInt32LE(pos+20), nameLength=archive.readUInt16LE(pos+28), extra=archive.readUInt16LE(pos+30), comment=archive.readUInt16LE(pos+32), local=archive.readUInt32LE(pos+42);
  const name=archive.subarray(pos+46,pos+46+nameLength).toString('utf8').replace(/\\/g,'/');
  if(entries.has(name) || name.startsWith('/') || name.startsWith('Data/') || name.split('/').includes('..')) throw Error('Invalid archive entry: '+name);
  if(archive.readUInt32LE(local)!==0x04034b50) throw Error('Invalid local ZIP header');
  const start=local+30+archive.readUInt16LE(local+26)+archive.readUInt16LE(local+28), packed=archive.subarray(start,start+size);
  const data=method===0 ? packed : method===8 ? zlib.inflateRawSync(packed) : (()=>{throw Error('Unsupported ZIP compression');})();
  if(data.length!==archive.readUInt32LE(pos+24)) throw Error('Invalid entry size: '+name);
  entries.set(name,data); pos+=46+nameLength+extra+comment;
}
for(const name of ['NirnCommand.esp','Scripts/NirnCommand_PlayerAlias.pex','Scripts/NirnCommand_ConsoleAdapter.pex','Scripts/NirnCommand_SkyrimNetAdapter.pex','Scripts/NirnCommandNative.pex','SKSE/Plugins/NirnCommandNative.dll','Magelight/NirnCommand/views/palette/editor.js','SEQ/NirnCommand.seq','Magelight/NirnCommand/manifest.json','Magelight/NirnCommand/views/palette/index.html','Magelight/NirnCommand/views/palette/main.js','Magelight/NirnCommand/views/palette/commands.js','Magelight/NirnCommand/views/palette/user-commands.js','Magelight/NirnCommand/views/palette/scanned-commands.js']) if(!entries.has(name)) throw Error('Missing archive entry: '+name);
const esp=entries.get('NirnCommand.esp'),pex=entries.get('Scripts/NirnCommand_PlayerAlias.pex'),seq=entries.get('SEQ/NirnCommand.seq');
if(pex.length<100 || pex.readUInt32BE(0)!==0xfa57c0de || !pex.includes(Buffer.from('NirnCommand_PlayerAlias'))) throw Error('Invalid PEX');
for(const name of ['NirnCommand_ConsoleAdapter','NirnCommand_SkyrimNetAdapter','NirnCommandNative']) {
  const script=entries.get('Scripts/'+name+'.pex');
  if(script.length<100 || script.readUInt32BE(0)!==0xfa57c0de || !script.includes(Buffer.from(name))) throw Error('Invalid adapter: '+name);
}
const dll=entries.get('SKSE/Plugins/NirnCommandNative.dll');
if(dll.length<256 || dll.toString('ascii',0,2)!=='MZ') throw Error('Invalid native DLL');
const pe=dll.readUInt32LE(0x3c);
if(pe+24>dll.length || dll.toString('ascii',pe,pe+4)!=='PE\0\0' || dll.readUInt16LE(pe+4)!==0x8664 || !(dll.readUInt16LE(pe+22)&0x2000)) throw Error('Native DLL is not x64 PE DLL');
if(![...entries.keys()].some(name=>name.startsWith('licenses/') && name.endsWith('/copyright'))) throw Error('Native dependency licenses missing');
const group=24+esp.readUInt32LE(4),quest=group+24;
if(seq.length!==4 || seq.readUInt32LE(0)!==esp.readUInt32LE(quest+12)) throw Error('SEQ does not reference the ESP quest');
const manifest=JSON.parse(entries.get('Magelight/NirnCommand/manifest.json').toString('utf8'));
if(manifest.version!=='0.4.0' || manifest.modId!=='NirnCommand' || manifest.views?.palette?.path!=='views/palette/index.html') throw Error('Invalid Magelight manifest');
console.log(`Archive has ${entries.size} entries; ESP, PEX, x64 DLL, SEQ, licenses and Magelight paths passed inspection.`);
