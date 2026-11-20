const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nirn-scan-'));
try {
  const profile=path.join(root,'profiles','Example'),high=path.join(root,'mods','[High]','SKSE','Plugins'),low=path.join(root,'mods','Low','SKSE','Plugins');
  for(const dir of [profile,high,low]) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(profile,'modlist.txt'),'+[High]\n+Low\n-Disabled\n');
  const name='OpenAnimationReplacer.ini',original='[UI]\nuToggleUIKey=11\nuToggleUIKeyShift=1\nuToggleUIKeyCtrl=1\nuToggleUIKeyAlt=0\n';
  fs.writeFileSync(path.join(high,name),original); fs.writeFileSync(path.join(low,name),'[UI]\nuToggleUIKey=24\n');
  const output=path.join(root,'out.js'); execFileSync(process.execPath,['tools/scan-shortcuts.js',root,'Example',output]);
  const context={window:{}}; vm.runInNewContext(fs.readFileSync(output,'utf8'),context);
  assert.equal(context.window.NIRN_SCANNED_COMMANDS[0].action,'shortcut:11:3');
  assert.equal(context.window.NIRN_SCANNED_COMMANDS[0].source,'[High]');
  assert.equal(fs.readFileSync(path.join(high,name),'utf8'),original);
  const overwrite=path.join(root,'overwrite','SKSE','Plugins'); fs.mkdirSync(overwrite,{recursive:true});
  fs.writeFileSync(path.join(overwrite,name),'[UI]\nuToggleUIKey=42\nuToggleUIKeyShift=0\n');
  execFileSync(process.execPath,['tools/scan-shortcuts.js',root,'Example',output]);
  const second={window:{}}; vm.runInNewContext(fs.readFileSync(output,'utf8'),second);
  assert.equal(second.window.NIRN_SCANNED_COMMANDS[0].action,'shortcut:42:0');
  assert.equal(second.window.NIRN_SCANNED_COMMANDS[0].source,'MO2 Overwrite');
  console.log('MO2 shortcut priority and read-only scanner checks passed.');
} finally {
  const parent=fs.realpathSync(os.tmpdir()), target=fs.realpathSync(root);
  if(path.dirname(target)!==parent || !path.basename(target).startsWith('nirn-scan-')) throw Error('Unsafe temporary directory');
  fs.rmSync(target,{recursive:true,force:true});
}
