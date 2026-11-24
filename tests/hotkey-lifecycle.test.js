const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Scripts/Source/NirnCommand_PlayerAlias.psc', 'utf8');
const body = source.match(/Event OnNativeHotkey\([^\n]*\)\r?\n([\s\S]*?)\r?\nEndEvent/)[1];
const translated = body.split(/\r?\n/).map(line => {
  line = line.trim();
  if (line.startsWith('if ')) return `if (${line.slice(3)}) {`;
  if (line.startsWith('elseif ')) return `} else if (${line.slice(7)}) {`;
  if (line === 'else') return '} else {';
  if (line === 'endif') return '}';
  if (line === 'int token = payload as int') return 'let token = Number(payload);';
  return line + ';';
}).join('\n');
const makeHandler = new Function('ctx', `with(ctx) { return function(payload) { ${translated} }; }`);

function fixture() {
  const calls = [];
  const ctx = {
    _viewId: 2, _domReady: true, _activeEpoch: 0, _initialScanEarliest: 30,
    Debug: { Trace() {} }, SKSE: { GetPluginVersion() { return 1; } },
    NirnCommandNative: { ConsumeHotkey() { return ctx.tokenValid; } },
    Utility: { IsInMenuMode() { return ctx.menu; }, GetCurrentRealTime() { return 10; } },
    Magelight: {
      IsUIModeActive() { return ctx.owner !== 0; }, GetUIModeView() { return ctx.owner; },
      RequestUIMode(view, pause) { calls.push(['request', view, pause]); return ctx.accept; },
      ShowView(view, visible) { calls.push(['show', view, visible]); }, GetLastError() { return 'busy'; }
    },
    ClosePalette() { calls.push(['close']); }, tokenValid: true, menu: false, owner: 0, accept: true
  };
  return { ctx, calls, press: () => makeHandler(ctx)('123') };
}
{
  const f = fixture(); f.press();
  assert.deepEqual(f.calls, [['request', 2, true]]);
  assert.equal(f.ctx._initialScanEarliest, 12);
}
for (const property of ['tokenValid', '_domReady']) {
  const f = fixture(); f.ctx[property] = false; f.press(); assert.deepEqual(f.calls, []);
}
{
  const f = fixture(); f.ctx._viewId = 0; f.press(); assert.deepEqual(f.calls, []);
}
{
  const f = fixture(); f.ctx.menu = true; f.press(); assert.deepEqual(f.calls, []);
}
{
  const f = fixture(); f.ctx.owner = 3; f.press(); assert.deepEqual(f.calls, []);
  f.ctx.owner = 2; f.press(); assert.deepEqual(f.calls, [['close']]);
}
{
  const f = fixture(); f.ctx.accept = false; f.press();
  assert.deepEqual(f.calls, [['request', 2, true], ['show', 2, false]]);
}
console.log('Hotkey page readiness, menu and UI mode decisions passed.');
