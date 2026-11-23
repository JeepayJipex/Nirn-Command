/* In-palette command and shortcut editor. DirectInput scan codes identify physical keys. */
window.NirnEditor = (() => {
  'use strict';
  const codes = {
    Escape:1, Digit1:2, Digit2:3, Digit3:4, Digit4:5, Digit5:6, Digit6:7, Digit7:8, Digit8:9, Digit9:10, Digit0:11,
    Minus:12, Equal:13, Backspace:14, Tab:15, KeyQ:16, KeyW:17, KeyE:18, KeyR:19, KeyT:20, KeyY:21, KeyU:22, KeyI:23, KeyO:24, KeyP:25,
    BracketLeft:26, BracketRight:27, Enter:28, KeyA:30, KeyS:31, KeyD:32, KeyF:33, KeyG:34, KeyH:35, KeyJ:36, KeyK:37, KeyL:38,
    Semicolon:39, Quote:40, Backquote:41, Backslash:43, KeyZ:44, KeyX:45, KeyC:46, KeyV:47, KeyB:48, KeyN:49, KeyM:50,
    Comma:51, Period:52, Slash:53, NumpadMultiply:55, Space:57, CapsLock:58, F1:59, F2:60, F3:61, F4:62, F5:63, F6:64,
    F7:65, F8:66, F9:67, F10:68, NumLock:69, ScrollLock:70, Numpad7:71, Numpad8:72, Numpad9:73, NumpadSubtract:74,
    Numpad4:75, Numpad5:76, Numpad6:77, NumpadAdd:78, Numpad1:79, Numpad2:80, Numpad3:81, Numpad0:82, NumpadDecimal:83,
    IntlBackslash:86, F11:87, F12:88, NumpadEnter:156, NumpadDivide:181, Home:199, ArrowUp:200, PageUp:201, ArrowLeft:203,
    ArrowRight:205, End:207, ArrowDown:208, PageDown:209, Insert:210, Delete:211
  };
  const modifiers={ShiftLeft:1,ShiftRight:2,ControlLeft:4,ControlRight:8,AltLeft:16,AltRight:32};
  function describe(key,mask) {
    const names=Object.entries(modifiers).filter(([,bit])=>mask&bit).map(([name])=>name.replace('Control','Ctrl').replace(/(Left|Right)/,' $1'));
    names.push(Object.keys(codes).find(code=>codes[code]===key)?.replace(/^Key/,'').replace(/^Digit/,'') || `Key ${key}`);
    return names.join(' + ');
  }
  function create(options) {
    let panel, capture=false, held=0, current=null, shortcut=null, mode='command', session=0, awaitingHotkeyState=false;
    const get=id=>panel.querySelector(`[data-field="${id}"]`);
    const message=text=>{ get('message').textContent=text; };
    function show() { panel.hidden=false; panel.parentElement.classList.add('editing'); get('name').focus(); }
    function hide() { if(panel) {panel.hidden=true; panel.parentElement.classList.remove('editing');} capture=false; held=0; options.onClose(); }
    function updateShortcut() { get('capture').textContent=shortcut ? describe(shortcut.key,shortcut.mask) : 'Capture keys'; }
    function setAction(value) {
      const parts=String(value||'').split(':'); shortcut=null;
      if(parts[0]==='shortcut2') { get('type').value='shortcut'; shortcut={key:Number(parts[1]),mask:Number(parts[2])}; }
      else if(parts[0]==='shortcut') { const m=Number(parts[2]); get('type').value='shortcut'; shortcut={key:Number(parts[1]),mask:((m&1)?1:0)|((m&2)?4:0)|((m&4)?16:0)}; }
      else if(parts[0]==='skyrimnet') { get('type').value='integration'; get('integration').value=value; }
      else { get('type').value='console'; get('value').value=parts[0]==='console' ? value.slice(8) : ''; }
      actionVisibility(); updateShortcut();
    }
    function actionVisibility() {
      const type=get('type').value;
      get('value').hidden=type!=='console'; get('capture').hidden=type!=='shortcut'; get('integration').hidden=type!=='integration';
    }
    function rebuild() {
      const select=get('commands'); select.textContent='';
      const first=document.createElement('option'); first.value=''; first.textContent=mode==='provider'?'Select a provider command':'New command'; select.appendChild(first);
      for(const command of (mode==='provider'?options.getProviders():options.getCommands())) { const item=document.createElement('option'); item.value=command.id; item.textContent=command.label; select.appendChild(item); }
      select.value=current?.id || '';
    }
    function choose() {
      current=(mode==='provider'?options.getProviders():options.getCommands()).find(item=>item.id===get('commands').value) || null;
      if(mode==='provider') {
        const override=current?options.getOverride(current.id):{};
        setAction(override.action || current?.action || '');
        get('capture').hidden=!current || !current.action.startsWith('shortcut2:'); get('value').hidden=true; get('integration').hidden=true;
        get('hidden').checked=!!override.hidden;
        updateShortcut(); message(''); return;
      }
      get('name').value=current?.label || ''; get('value').value=''; setAction(current?.action || 'shortcut2:0:0');
      if(shortcut?.key===0) shortcut=null;
      updateShortcut(); message('');
    }
    function init() {
      if(panel) return;
      panel=document.createElement('section'); panel.className='editor'; panel.hidden=true;
      panel.innerHTML=`<div class="editor-title" data-field="title"></div><label data-field="commands-label">Command<select data-field="commands"></select></label><label data-field="name-label">Name<input data-field="name" maxlength="120" autocomplete="off"></label><label data-field="type-label">Action<select data-field="type"><option value="shortcut">Send a keyboard shortcut</option><option value="console">Console command</option><option value="integration">Known integration</option></select></label><input data-field="value" placeholder="Console command" maxlength="512"><select data-field="integration"><option value="skyrimnet:dashboard">SkyrimNet — Dashboard</option><option value="skyrimnet:gamemaster">SkyrimNet — GameMaster</option><option value="skyrimnet:continuous">SkyrimNet — Continuous Mode</option></select><button type="button" data-field="capture">Capture keys</button><label data-field="hidden-label">Hide command<input type="checkbox" data-field="hidden"></label><button type="button" data-field="reset">Restore defaults</button><div class="editor-message" data-field="message" role="status"></div><div class="editor-buttons"><button type="button" data-field="save">Save</button><button type="button" data-field="delete">Delete</button><button type="button" data-field="cancel">Cancel</button></div>`;
      document.querySelector('.palette').appendChild(panel);
      get('commands').addEventListener('change',choose); get('type').addEventListener('change',actionVisibility);
      get('capture').addEventListener('click',()=>{ capture=true; held=0; message('Press modifiers, then a key. Escape cancels capture.'); });
      get('cancel').addEventListener('click',hide);
      get('delete').addEventListener('click',()=>{ if(!current) return; options.setCommands(options.getCommands().filter(x=>x.id!==current.id)); current=null; rebuild(); choose(); message('Saving changes…'); });
      get('reset').addEventListener('click',()=>{if(current && options.setOverride(current.id,null)) {choose();message('Restoring defaults…');}});
      get('save').addEventListener('click',()=>{
        if(capture) {message('Finish or cancel key capture first.'); return;}
        if(mode==='provider') {
          if(!current) {message('Select a provider command.');return;}
          const value={...options.getOverride(current.id),hidden:get('hidden').checked};
          if(current.action.startsWith('shortcut2:') && shortcut?.key) {
            const action=`shortcut2:${shortcut.key}:${shortcut.mask}`;
            if(action===current.action) delete value.action; else value.action=action;
          }
          if(options.setOverride(current.id,value)) message('Saving changes…'); else message('Overrides unavailable');
          return;
        }
        if(mode==='hotkey') {
          if(!shortcut || shortcut.key===1 || shortcut.key===201) {message('Choose a key other than Escape or Page Up.'); return;}
          if(options.setHotkey(shortcut.key,shortcut.mask,session)!==false) message('Saving shortcut…'); else message('Shortcut save unavailable or already pending'); return;
        }
        const label=get('name').value.trim(), type=get('type').value;
        if(!label) {message('Enter a name.'); return;}
        let action='';
        if(type==='shortcut' && shortcut?.key) action=`shortcut2:${shortcut.key}:${shortcut.mask}`;
        if(type==='console' && get('value').value.trim()) action='console:'+get('value').value.trim();
        if(type==='integration') action=get('integration').value;
        if(!action) {message('Choose an action.'); return;}
        const id=current?.id || `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
        const entry={id,label,action,kind:type==='console'?'Console':type==='shortcut'?'Shortcut':'Mod',detail:type==='shortcut'?describe(shortcut.key,shortcut.mask):'Custom command'};
        options.setCommands([...options.getCommands().filter(x=>x.id!==id),entry]); current=entry; rebuild(); message('Saving changes…');
      });
    }
    function open(which) {
      init(); mode=which; session++; capture=false; held=0; awaitingHotkeyState=false;
      get('title').textContent=mode==='hotkey'?'Opening shortcut':mode==='provider'?'Provider commands':'Custom commands';
      for(const id of ['commands-label','name-label','type-label','value','integration','delete']) get(id).hidden=mode==='hotkey';
      get('hidden-label').hidden=mode!=='provider'; get('reset').hidden=mode!=='provider';
      if(mode==='provider') for(const id of ['name-label','type-label','value','integration','delete']) get(id).hidden=true;
      get('capture').hidden=false; current=null; shortcut=null;
      if(mode==='hotkey') { shortcut=options.getHotkey(); updateShortcut(); }
      else { rebuild(); choose(); }
      message(''); show();
    }
    function keydown(event) {
      if(!panel || panel.hidden) return false;
      if(!capture) { if(event.key==='Escape') {event.preventDefault(); event.stopPropagation(); hide(); return true;} return false; }
      event.preventDefault(); event.stopPropagation();
      if(event.repeat) return true;
      if(event.key==='Escape') {capture=false; held=0; message('Capture cancelled'); return true;}
      if(modifiers[event.code]) {held|=modifiers[event.code]; return true;}
      const key=codes[event.code];
      if(!key) {message('Unsupported key. Try another key.'); return true;}
      if(mode==='hotkey' && key===201) {message('Page Up is reserved by Magelight.'); return true;}
      shortcut={key,mask:held}; capture=false; held=0; updateShortcut(); message('Press Save to apply.'); return true;
    }
    function keyup(event) { if(capture && modifiers[event.code]) {held &= ~modifiers[event.code]; event.preventDefault(); event.stopPropagation(); return true;} return false; }
    return {open,keydown,keyup,hide,commandsResult:ok=>{if(panel&&!panel.hidden&&mode==='command') message(ok?'Commands saved':'Commands could not be saved');},isOpen:()=>!!panel&&!panel.hidden,hotkeyResult:(result,requestSession)=>{if(panel&&!panel.hidden&&mode==='hotkey' && (requestSession===undefined || requestSession===session)) {awaitingHotkeyState=result==='timeout'; message(result===true?'Shortcut saved':result==='timeout'?'Result unconfirmed. Current shortcut is being checked.':'Could not save shortcut'); if(result===true) hide();}},hotkeyState:value=>{if(panel&&!panel.hidden&&mode==='hotkey'&&awaitingHotkeyState) {awaitingHotkeyState=false;message('Current shortcut: '+describe(value.key,value.mask));}}};
  }
  return {create,describe,codes};
})();
