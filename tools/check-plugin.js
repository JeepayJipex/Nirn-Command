const fs=require('fs'); const b=fs.readFileSync(process.argv[2]);
function expect(v,msg) { if(!v) throw Error(msg); }
expect(b.toString('ascii',0,4)==='TES4','TES4 header');
const h=b.readUInt32LE(4)+24; expect(b.toString('ascii',h,h+4)==='GRUP','group');
expect(b.readUInt32LE(h+4)===b.length-h,'group size'); const q=h+24;
expect(b.toString('ascii',q,q+4)==='QUST','quest'); expect(q+24+b.readUInt32LE(q+4)===b.length,'quest size');
let pos=q+24, records=[]; while(pos<b.length) { let type=b.toString('ascii',pos,pos+4), length=b.readUInt16LE(pos+4); pos+=6; expect(pos+length<=b.length,'truncated '+type); records.push({type,data:b.subarray(pos,pos+length)}); pos+=length; }
const get=k=>records.find(x=>x.type===k)?.data;
expect(get('EDID').toString('ascii').replace(/\0+$/,'')==='NC_Controller','quest editor id');
expect((get('DNAM').readUInt16LE(0)&1)!==0,'start-game-enabled flag');
expect(get('VMAD').includes(Buffer.from('NirnCommand_PlayerAlias')),'alias script');
expect(get('ALID').toString('ascii').replace(/\0+$/,'')==='Player','player alias');
expect(get('ALFR').readUInt32LE(0)===0x14,'forced PlayerRef');
console.log('ESP structural checks passed:', records.map(x=>x.type).join(', '));
