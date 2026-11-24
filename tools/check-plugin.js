const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
function expect(value, message) { if (!value) throw Error(message); }
function fields(start, end) {
  const result = [];
  while (start < end) {
    expect(start + 6 <= end, 'truncated subrecord header');
    const type = b.toString('ascii', start, start + 4);
    const length = b.readUInt16LE(start + 4);
    start += 6;
    expect(start + length <= end, 'truncated ' + type);
    result.push({ type, data: b.subarray(start, start + length) });
    start += length;
  }
  return result;
}
function one(records, type) {
  const matches = records.filter(item => item.type === type);
  expect(matches.length === 1, 'expected one ' + type);
  return matches[0].data;
}
function string(value) { return value.toString('ascii').replace(/\0+$/, ''); }
expect(b.toString('ascii', 0, 4) === 'TES4', 'TES4 header');
const group = b.readUInt32LE(4) + 24;
expect(b.toString('ascii', group, group + 4) === 'GRUP', 'quest group');
expect(b.readUInt32LE(group + 4) === b.length - group, 'group size');
let pos = group + 24;
const quests = new Map();
while (pos < b.length) {
  expect(b.toString('ascii', pos, pos + 4) === 'QUST', 'quest record');
  const end = pos + 24 + b.readUInt32LE(pos + 4);
  expect(end <= b.length, 'quest size');
  const id = b.readUInt32LE(pos + 12);
  expect(!quests.has(id), 'duplicate quest');
  quests.set(id, fields(pos + 24, end));
  pos = end;
}
expect(quests.size === 2, 'expected two quests');
const controller = quests.get(0x01000d62);
expect(controller && string(one(controller, 'EDID')) === 'NC_Controller', 'controller identity');
expect((one(controller, 'DNAM').readUInt16LE(0) & 1) !== 0, 'controller start flag');
expect(one(controller, 'VMAD').includes(Buffer.from('NirnCommand_PlayerAlias')), 'controller alias script');
expect(string(one(controller, 'ALID')) === 'Player', 'player alias');
expect(one(controller, 'ALFR').readUInt32LE(0) === 0x14, 'forced player reference');
const tracking = quests.get(0x01000d63);
expect(tracking && string(one(tracking, 'EDID')) === 'NC_NPCTracking', 'tracking identity');
expect((one(tracking, 'DNAM').readUInt16LE(0) & 1) === 0, 'tracking must start on demand');
expect(one(tracking, 'QOBJ').readUInt16LE(0) === 10, 'objective index');
expect(one(tracking, 'QSTA').readUInt32LE(0) === 0, 'objective alias');
expect(one(tracking, 'ALST').readUInt32LE(0) === 0, 'target alias id');
expect(string(one(tracking, 'ALID')) === 'Target', 'target alias name');
const aliasStart = tracking.findIndex(item => item.type === 'ALST');
const aliasFields = tracking.slice(aliasStart);
expect(one(aliasFields, 'FNAM').readUInt32LE(0) === 2, 'optional alias flags');
expect(aliasFields.every(item => ['ALST', 'ALID', 'FNAM', 'VTCK', 'ALED'].includes(item.type)), 'unexpected target alias field');
expect(!tracking.some(item => item.type === 'VMAD'), 'tracking scripts');
console.log('ESP controller and tracking quest structural checks passed');
