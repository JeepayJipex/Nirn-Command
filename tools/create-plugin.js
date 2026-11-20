// Emit the minimal TES5/SSE records for a start-game-enabled player-alias quest.
// Skyrim.esm is the only master. The VMAD fragment binds the script to alias 0.
const fs = require('fs');
const output = process.argv[2];
if (!output) throw Error('Usage: node create-plugin.js <output.esp>');
const hex = value => Buffer.from(value, 'hex');
const u16 = value => { const b=Buffer.alloc(2); b.writeUInt16LE(value); return b; };
const u32 = value => { const b=Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const text = value => Buffer.from(value+'\0','ascii');
const sub = (type,data) => Buffer.concat([Buffer.from(type,'ascii'),u16(data.length),data]);
const record = (type,id,data) => Buffer.concat([Buffer.from(type,'ascii'),u32(data.length),u32(0),u32(id),u32(0),u16(44),u16(0),data]);
const header = Buffer.concat([
  sub('HEDR',hex('48e1da3f02000000630d0000')),
  sub('CNAM',text('Nirn Command')),
  sub('MAST',text('Skyrim.esm')), sub('DATA',Buffer.alloc(8)), sub('INTV',u32(1))
]);
const script=Buffer.from('NirnCommand_PlayerAlias','ascii');
const vmad=Buffer.concat([hex('0500020000000200000000010000000000620d0001050002000100'),u16(script.length),script,hex('000000')]);
const quest=Buffer.concat([
  sub('EDID',text('NC_Controller')), sub('VMAD',vmad), sub('DNAM',hex('110032ff0000000000000000')),
  sub('NEXT',Buffer.alloc(0)), sub('ANAM',u32(1)), sub('ALST',u32(0)), sub('ALID',text('Player')),
  sub('FNAM',u32(0)), sub('ALFR',u32(0x14)), sub('VTCK',u32(0)), sub('ALED',Buffer.alloc(0))
]);
const qrec=record('QUST',0x01000d62,quest);
const group=Buffer.concat([Buffer.from('GRUP'),u32(qrec.length+24),Buffer.from('QUST'),u32(0),Buffer.alloc(8),qrec]);
fs.writeFileSync(output,Buffer.concat([record('TES4',0,header),group]));
