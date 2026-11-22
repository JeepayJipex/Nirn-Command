(() => {
  'use strict';
  const bridge = window.magelight;
  const input = document.querySelector('#query');
  const resultsEl = document.querySelector('#results');
  const metaEl = document.querySelector('#meta');
  const statusEl = document.querySelector('#status');
  const prefix = 'nirn-command:v1:';
  let storageAvailable = false;
  try { localStorage.setItem(prefix + 'probe','1'); localStorage.removeItem(prefix + 'probe'); storageAvailable=true; } catch (_) {}
  function load(key, fallback) { try { const value = localStorage.getItem(prefix + key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
  function save(key, value) {
    if (storageAvailable) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); return; } catch (_) { storageAvailable=false; } }
    fallbackTouched.add(key); fallbackDirty=true; flushFallback();
  }
  let favorites = load('favorites', []);
  let usage = load('usage', {});
  let settings = load('settings', {showUnavailable:true});
  if (!Array.isArray(favorites)) favorites = [];
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) usage = {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {showUnavailable:true};
  const statics = [];
  const seen = new Set();
  let configWarnings=0;
  for (const entry of [...(window.NIRN_SCANNED_COMMANDS || []), ...(window.NIRN_COMMANDS || [])]) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string' || typeof entry.action !== 'string') { configWarnings++; continue; }
    if (seen.has(entry.id)) { if (entry.id !== 'builtin:oar:menu') configWarnings++; continue; }
    if (!/^(console:|skyrimnet:|shortcut:|oar:|local:)/.test(entry.action)) { configWarnings++; continue; }
    seen.add(entry.id); statics.push(entry);
  }
  if (configWarnings) console.warn(`[NirnCommand] Ignored ${configWarnings} invalid or duplicate commands.`);
  let modDiscovered=[], incomingMods=[];
  let discovered = [], incoming = [], epoch = '', selected = 0, results = [], pending = {}, serial = 0, queued = false, clearRequestedAt = 0, clearKind = '', capabilities = null, isOpen = false;
  let fallbackReady=false, fallbackReading=false, fallbackDirty=false, fallbackWriting=false, fallbackSlot=0, fallbackParts=[], fallbackCount=0, fallbackRequest=0, fallbackPending=null;
  const fallbackTouched=new Set();
  let openingHotkey={key:210,mask:0};
  let hotkeyPending=null;
  let commands=[], commandsReady=false, commandsReadStarted=false, commandsMissing=false, commandsCount=-2, commandsParts=[];
  let commandsDirty=false, commandsWriting=false, commandsSerial=0, commandsPending=null;
  function validCommands(value) {
    if(!Array.isArray(value)) return [];
    const used=new Set(statics.map(entry=>entry.id));
    return value.filter(entry=>entry && typeof entry.id==='string' && entry.id.startsWith('user:') && typeof entry.label==='string' && entry.label.trim() && typeof entry.action==='string' && /^(console:|skyrimnet:|shortcut:|shortcut2:|oar:)/.test(entry.action) && !used.has(entry.id) && used.add(entry.id));
  }
  function finishCommandsLoad() {
    if (!commandsMissing || (!storageAvailable && !fallbackReady)) return;
    const source=Array.isArray(settings.commands) ? settings.commands : (window.NIRN_USER_COMMANDS || []);
    commands=validCommands(source); commandsReady=true; commandsMissing=false; commandsDirty=true;
    render(); flushCommands();
  }
  function flushCommands() {
    if (!bridge || !commandsReady || commandsWriting || !commandsDirty) return;
    const chars=Array.from(JSON.stringify({version:1,commands}));
    let bytes=0; for(const char of chars) { const code=char.codePointAt(0); bytes += code<128?1:code<2048?2:code<65536?3:4; }
    if(bytes>256*1024) {statusEl.textContent=`Commands exceed 262144 UTF-8 bytes (${bytes})`; editor?.commandsResult(false); return;}
    const parts=[]; for(let i=0;i<chars.length;i+=100) parts.push(chars.slice(i,i+100).join(''));
    commandsDirty=false; commandsWriting=true; let index=-1;
    function next() {
      const request=String(++commandsSerial);
      const operation=index<0?'begin':index<parts.length?'write':'commit';
      commandsPending={request,advance:()=>{ if(operation==='commit') {commandsWriting=false; editor?.commandsResult(true); statusEl.textContent='Commands saved'; flushCommands();} else {index++;next();} }};
      bridge.send('commands',operation==='write'?`write|${request}|${parts[index]}`:`${operation}|${request}`);
      setTimeout(()=>{if(commandsPending?.request===request) {commandsPending=null;commandsWriting=false;commandsDirty=true;statusEl.textContent='Commands save timed out';editor?.commandsResult(false);}},10000);
    }
    next();
  }
  const editor=window.NirnEditor?.create({
    getCommands:()=>commands,
    setCommands:value=>{commands=validCommands(value);commandsDirty=true;render();flushCommands();},
    getHotkey:()=>openingHotkey,
    setHotkey:(key,mask,session)=>{
      if(!bridge) {statusEl.textContent='Shortcut bridge unavailable'; return false;}
      if(hotkeyPending) {statusEl.textContent='Shortcut save already pending'; return false;}
      const request=String(++serial);
      hotkeyPending={request,session};
      try { bridge.send('execute',`${request}|hotkey:${key}|${mask}`); }
      catch (_) {hotkeyPending=null; statusEl.textContent='Shortcut bridge unavailable'; return false;}
      setTimeout(()=>{
        if(hotkeyPending?.request!==request) return;
        hotkeyPending=null;
        editor?.hotkeyResult('timeout',session);
        statusEl.textContent='Shortcut result unconfirmed';
        bridge.send('execute',`${++serial}|hotkey:get`);
      },5000);
      return true;
    },
    onClose:()=>{heldModifiers=0;if(bridge) bridge.send('__escapecapture','0');input.focus();render();}
  });
  window.ncCommandsBegin = function(payload) {const count=Number(payload); commandsCount=Number.isInteger(count)&&count>=-3&&count<=1024?count:-2; commandsParts=commandsCount>=0 ? new Array(commandsCount) : [];};
  window.ncCommandsChunk = function(payload) {const text=String(payload),split=text.indexOf('|'),i=Number(text.slice(0,split)); if(split>=0&&Number.isInteger(i)&&i>=0&&i<commandsCount) commandsParts[i]=text.slice(split+1);};
  window.ncCommandsDone = function() {
    if(commandsCount===-1) {commandsMissing=true;finishCommandsLoad();return;}
    if(commandsCount<0 || Array.from({length:commandsCount},(_,i)=>typeof commandsParts[i]==='string').includes(false)) {statusEl.textContent='Commands file unavailable or invalid';return;}
    try {const saved=JSON.parse(commandsParts.join(''));if(saved.version!==1||!Array.isArray(saved.commands)) throw Error('Invalid');commands=validCommands(saved.commands);commandsReady=true;render();}
    catch (_) {statusEl.textContent='Commands file could not be read';}
  };
  window.ncCommandsAck = function(payload) {
    const [request,result]=String(payload).split('|'); if(!commandsPending || commandsPending.request!==request) return;
    const pending=commandsPending; commandsPending=null;
    if(result==='ok') pending.advance(); else {commandsWriting=false;commandsDirty=true;statusEl.textContent='Commands could not be saved';editor?.commandsResult(false);}
  };
  function flushFallback() {
    if (storageAvailable || !bridge || !fallbackReady || fallbackWriting || !fallbackDirty) return;
    fallbackDirty=false; fallbackWriting=true;
    const chars=Array.from(JSON.stringify({favorites,usage,settings}));
    const parts=[]; for(let i=0;i<chars.length;i+=128) parts.push(chars.slice(i,i+128).join(''));
    if (parts.length > 4096) { fallbackWriting=false; statusEl.textContent='Preferences too large to save'; return; }
    const slot=1-fallbackSlot; let index=0;
    function sendNext() {
      const request=String(++fallbackRequest), commit=index===parts.length;
      fallbackPending={request,advance:()=>{ if(commit) { fallbackSlot=slot; fallbackWriting=false; flushFallback(); } else { index++; sendNext(); } }};
      bridge.send('persist',commit ? `commit|${request}|${slot}|${parts.length}|` : `write|${request}|${slot}|${index}|${parts[index]}`);
      setTimeout(()=>{ if(fallbackPending?.request===request) { fallbackPending=null; fallbackWriting=false; fallbackDirty=true; statusEl.textContent='Preferences save timed out'; } },10000);
    }
    sendNext();
  }
  window.ncPersistBegin = function(payload) { const [slot,count]=String(payload).split('|').map(Number); fallbackSlot=slot; fallbackCount=count; fallbackParts=new Array(count); };
  window.ncPersistChunk = function(payload) { const text=String(payload), split=text.indexOf('|'), index=Number(text.slice(0,split)); if(split>=0 && Number.isInteger(index) && index>=0 && index<fallbackCount) fallbackParts[index]=text.slice(split+1); };
  window.ncPersistDone = function() {
    fallbackReading=false;
    try {
      if (fallbackCount && (fallbackParts.length!==fallbackCount || Array.from({length:fallbackCount},(_,i)=>typeof fallbackParts[i]==='string').includes(false))) throw Error('Incomplete preferences');
      const saved=fallbackCount ? JSON.parse(fallbackParts.join('')) : {};
      if (!fallbackTouched.has('favorites') && Array.isArray(saved.favorites)) favorites=saved.favorites;
      if (!fallbackTouched.has('usage') && saved.usage && typeof saved.usage==='object' && !Array.isArray(saved.usage)) usage=saved.usage;
      if (!fallbackTouched.has('settings') && saved.settings && typeof saved.settings==='object' && !Array.isArray(saved.settings)) settings=saved.settings;
      fallbackReady=true; fallbackTouched.clear(); finishCommandsLoad(); render(); flushFallback();
    } catch (_) { statusEl.textContent='Preferences could not be read'; }
  };
  window.ncPersistAck = function(payload) {
    const [request,result]=String(payload).split('|'); if(!fallbackPending || fallbackPending.request!==request) return;
    const pendingAck=fallbackPending; fallbackPending=null;
    if(result==='ok') pendingAck.advance(); else { fallbackWriting=false; fallbackDirty=true; statusEl.textContent='Preferences could not be saved'; }
  };
  function available(entry) {
    if (!capabilities) return true;
    if (entry.action.startsWith('console:')) return capabilities[0];
    if (entry.action.startsWith('skyrimnet:')) return capabilities[1];
    if (entry.action === 'oar:menu') return capabilities[2];
    return true;
  }
  function unavailableReason(entry) {
    if (entry.action === 'oar:menu' && capabilities?.[3]) return 'Unavailable: incompatible UI API. Use a custom shortcut.';
    return 'Unavailable: required plugin not detected.';
  }
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const searchCache = new WeakMap();
  function score(entry, query) {
    let indexed = searchCache.get(entry);
    if (!indexed) { indexed={label:normalize(entry.label),hay:normalize([entry.label,entry.detail,entry.keywords,entry.kind].join(' '))}; searchCache.set(entry,indexed); }
    const {label,hay}=indexed;
    if (label === query) return 1000;
    if (label.startsWith(query)) return 800;
    if (label.includes(query)) return 600;
    if (hay.includes(query)) return 400;
    return query.split(/\s+/).every(t => hay.includes(t)) ? 200 : -1;
  }
  function getResults() {
    const q = input.value, query = normalize(q);
    if (q.trimStart().startsWith('>')) {
      const pos = q.indexOf('>'), raw = q.slice(pos + 1);
      return raw.trim() ? [{ id:'direct:' + raw, label:'Run: ' + raw, detail:'Console command', kind:'Console', action:'console:' + raw, transient:true }] : [];
    }
    const entries = statics.concat(commands, modDiscovered, discovered).filter(entry => entry.id!=='oar:configured' || (capabilities && capabilities[3] && !capabilities[2])).filter(entry => settings.showUnavailable !== false || available(entry));
    if (!query) {
      const byId = new Map(entries.map(e => [e.id, e]));
      const ordered = [...favorites.slice(0, 8), ...Object.keys(usage).sort((a,b) => (usage[b].lastUsedAt || 0) - (usage[a].lastUsedAt || 0)).slice(0, 8), ...statics.map(e => e.id), ...commands.map(e => e.id)];
      return [...new Set(ordered)].map(id => byId.get(id)).filter(Boolean).slice(0, 20);
    }
    return entries.map(entry => ({ entry, score:score(entry, query) }))
      .filter(x => x.score >= 0).sort((a,b) => b.score - a.score || Number(favorites.includes(b.entry.id)) - Number(favorites.includes(a.entry.id)) || (usage[b.entry.id]?.useCount || 0) - (usage[a.entry.id]?.useCount || 0) || a.entry.label.localeCompare(b.entry.label)).slice(0,30).map(x => x.entry);
  }
  function render() {
    results = getResults(); selected = Math.min(selected, Math.max(0, results.length - 1));
    metaEl.textContent = `${results.length} RESULTS · INVENTORY, SPELLS & ACTIONS`;
    resultsEl.textContent = '';
    if (!results.length) { const empty = document.createElement('div'); empty.className='empty'; empty.textContent='No results.'; resultsEl.appendChild(empty); return; }
    const frag = document.createDocumentFragment();
    results.forEach((entry,i) => {
      const row = document.createElement('div'); row.className='entry' + (i === selected ? ' selected' : ''); row.setAttribute('role','option'); if(entry.source) row.title=`${entry.source} · ${entry.confidence || ''}`; row.setAttribute('aria-selected',String(i === selected));
      const icon=document.createElement('span'); icon.className='symbol'; icon.textContent=({Mod:'⚙',Travel:'⌖',Console:'⌘',Item:'◇',Spell:'✧'})[entry.kind] || '✦';
      const info=document.createElement('span'); info.className='info'; const label=document.createElement('span'); label.className='label'; label.textContent=entry.label;
      const detail=document.createElement('span'); detail.className='detail'; detail.textContent=available(entry) ? (entry.detail || '') : unavailableReason(entry); info.append(label,detail);
      const star=document.createElement('button'); star.type='button'; star.className='favorite'; star.textContent=favorites.includes(entry.id) ? '★' : '☆'; star.setAttribute('aria-label','Toggle favorite'); star.addEventListener('click',event => {event.stopPropagation(); toggleFavorite(entry);});
      const kind=document.createElement('span'); kind.className='kind'; kind.textContent=entry.kind || '';
      row.append(icon,info,star,kind);
      row.addEventListener('mouseenter',() => {
        selected=i;
        Array.from(resultsEl.children).forEach((node,index)=>{node.classList.toggle('selected',index===i);node.setAttribute('aria-selected',String(index===i));});
      });
      row.addEventListener('click',() => execute(entry)); frag.appendChild(row);
    });
    resultsEl.appendChild(frag); resultsEl.children[selected]?.scrollIntoView({block:'nearest'});
  }
  function toggleFavorite(entry) {
    if (!entry || entry.transient || !entry.persistent && /^(item|spell):/.test(entry.action)) { statusEl.textContent='This action cannot be saved'; return; }
    favorites = favorites.includes(entry.id) ? favorites.filter(id => id !== entry.id) : [entry.id,...favorites]; save('favorites',favorites); render();
  }
  function execute(entry, left=false) {
    if (entry?.action === 'local:clear-history' || entry?.action === 'local:clear-favorites') {
      const kind = entry.action.endsWith('history') ? 'history' : 'favorites';
      if (clearKind === kind && Date.now() - clearRequestedAt < 5000) {
        if (kind === 'history') { usage={}; save('usage',usage); } else { favorites=[]; save('favorites',favorites); }
        clearRequestedAt=0; clearKind=''; statusEl.textContent=kind + ' cleared'; render();
      } else { clearKind=kind; clearRequestedAt=Date.now(); statusEl.textContent='Activate again within five seconds to clear ' + kind; }
      return;
    }
    if (entry?.action === 'local:commands' || entry?.action === 'local:hotkey') { if (entry.action === 'local:commands' && !commandsReady) {statusEl.textContent='Commands unavailable or still loading';return;} if(editor) {if(bridge) bridge.send('__escapecapture','1'); editor.open(entry.action === 'local:hotkey' ? 'hotkey' : 'command');} return; }
    if (entry?.action === 'local:toggle-unavailable') { settings.showUnavailable=settings.showUnavailable===false; save('settings',settings); statusEl.textContent=settings.showUnavailable ? 'Unavailable actions shown' : 'Unavailable actions hidden'; render(); return; }
    if (entry?.action === 'local:refresh') { if (bridge) { catalogRetries=0; bridge.send('catalog',catalogSession ? 'refresh|'+catalogSession : 'refresh'); statusEl.textContent='Loading…'; } return; }
    if (!entry || !bridge) { statusEl.textContent='Bridge unavailable'; return; }
    if (!available(entry)) { statusEl.textContent=unavailableReason(entry); return; }
    const action=left && entry.action.startsWith('spell:') ? entry.action.replace('spell:','spellleft:') : entry.action;
    const request=String(++serial); pending[request]=entry;
    try { bridge.send('execute',request + '|' + action); statusEl.textContent='Action sent'; }
    catch (_) { delete pending[request]; statusEl.textContent='Bridge error'; return; }
    setTimeout(() => { if (pending[request]) { delete pending[request]; statusEl.textContent='No action response'; } }, 10000);
  }
  window.ncActionResult = function(payload) {
    const [request,result]=String(payload).split('|'); const entry=pending[request]; if (!entry) return; delete pending[request];
    statusEl.textContent=({sent:'Action sent',success:'Action accepted',failure:'Action failed',unavailable:'Action unavailable',missing_plugin:'Required plugin not detected',incompatible_api:'Integration API unavailable or incompatible'})[result] || 'Unknown result';
    if ((result === 'sent' || result === 'success') && !entry.transient) {
      const now=Date.now(), old=usage[entry.id] || {}; usage[entry.id]={firstUsedAt:old.firstUsedAt || now,lastUsedAt:now,useCount:(old.useCount || 0)+1,lastResult:result};
      Object.keys(usage).sort((a,b)=>usage[b].lastUsedAt-usage[a].lastUsedAt).slice(100).forEach(id=>delete usage[id]); save('usage',usage);
    } else if ((result === 'failure' || result === 'unavailable') && usage[entry.id]) {
      usage[entry.id].lastResult=result; save('usage',usage);
    }
  };
  window.ncHotkey = function(payload) { const [key,mask]=String(payload).split('|').map(Number); if(Number.isInteger(key) && Number.isInteger(mask)) {openingHotkey={key,mask};editor?.hotkeyState(openingHotkey);} };
  window.ncHotkeyResult = function(payload) { const [request,result]=String(payload).split('|'); if(request!==hotkeyPending?.request) return; const {session}=hotkeyPending; hotkeyPending=null; editor?.hotkeyResult(result==='ok',session); statusEl.textContent=result==='ok'?'Shortcut saved':'Shortcut could not be saved'; };
  window.ncCapabilities = function(payload) { capabilities=String(payload).split('|').map(value=>value==='1'); render(); };
  window.ncDiscoveryBegin = function() { incomingMods=[]; };
  window.ncDiscoveryEntry = function(payload) { try { const entry=JSON.parse(String(payload)); if(entry && typeof entry.id==='string' && (/^(mcm:|oar:configured$)/.test(entry.id)) && typeof entry.label==='string' && /^shortcut2:[0-9]+:[0-9]+$/.test(entry.action)) incomingMods.push(entry); } catch (_) {} };
  window.ncDiscoveryComplete = function() { modDiscovered=incomingMods; incomingMods=[]; render(); };
  let catalogSession='', catalogTransferSerial=0, catalogRetries=0, spellReceivedEpoch='';
  function requestCatalogSnapshot(reason) {
    if (catalogRetries >= 1) {
      statusEl.textContent='Catalog unavailable. Use Refresh catalog to retry.';
      console.warn(`[NirnCommand] Catalog recovery stopped: ${reason}`);
      return;
    }
    catalogRetries++;
    console.warn(`[NirnCommand] Catalog recovery requested: ${reason}`);
    if (bridge) bridge.send('catalog',catalogSession ? 'snapshot|'+catalogSession : 'snapshot');
  }
  function catalogFrame(value) {const text=String(value); if(!catalogSession) return text; const prefix=catalogSession+'|'; return text.startsWith(prefix)?text.slice(prefix.length):null;}
  window.ncGameLoaded = function(value) { catalogTransferSerial++; catalogRetries=0; spellReceivedEpoch=''; catalogAttempt=0; catalogTransferKey=''; catalogSession=value==='new' ? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2) : String(value || ''); modDiscovered=[]; incomingMods=[]; discovered=[]; incoming=[]; epoch=''; pending={}; capabilities=null; render(); };
  window.ncBridgeReady = function() {
    if(bridge) bridge.send('catalog',catalogSession?'ready|'+catalogSession:'ready');
    if (!storageAvailable && !fallbackReady && !fallbackReading && bridge) { fallbackReading=true; bridge.send('persist','read'); }
    if (!commandsReadStarted && bridge) {commandsReadStarted=true; bridge.send('commands','read');}
  };
  let catalogBatches=0, catalogInvalid=false, catalogTransferStarted=0, catalogFragment=null, catalogProgress=0, catalogCategory='', catalogAttempt=0, catalogTransferKey='';
  function transferFrame(payload) {
    const text=catalogFrame(payload); if(text===null) return null;
    const fields=text.split('|'); if(fields.length<4) return null;
    const [generation,attempt,category]=fields;
    if(`${generation}|${attempt}|${category}`!==catalogTransferKey) return null;
    return (catalogSession?catalogSession+'|':'')+generation+'|'+fields.slice(3).join('|');
  }
  window.ncTransferBegin = function(payload) {
    const text=catalogFrame(payload); if(text===null) return;
    const [generation,attempt,category]=text.split('|');
    const number=Number(attempt);
    if(!Number.isSafeInteger(number) || number<catalogAttempt || !['spell','item'].includes(category)) return;
    if(number===catalogAttempt && catalogTransferKey && (category==='spell' || !catalogTransferKey.endsWith('|spell'))) return;
    catalogAttempt=number; catalogTransferKey=`${generation}|${attempt}|${category}`;
    window.ncCatalogBegin((catalogSession?catalogSession+'|':'')+generation+'|'+category);
  };
  window.ncTransferBatch = function(payload) { const value=transferFrame(payload); if(value!==null) window.ncCatalogBatch(value); };
  window.ncTransferFragment = function(payload) { const value=transferFrame(payload); if(value!==null) window.ncCatalogFragment(value); };
  window.ncTransferComplete = function(payload) { const value=transferFrame(payload); if(value!==null) window.ncCatalogComplete(value); };
  function watchCatalogTransfer() {
    const serial=++catalogTransferSerial;
    catalogProgress=Date.now();
    function check() {
      if(serial!==catalogTransferSerial) return;
      const remaining=30000-(Date.now()-catalogProgress);
      if(remaining>0) {setTimeout(check,remaining);return;}
      catalogTransferSerial++; incoming=[]; catalogFragment=null; epoch='';
      statusEl.textContent='Catalog transfer timed out';
      console.warn('[NirnCommand] Catalog transfer timed out; requesting snapshot');
      requestCatalogSnapshot('transfer timeout');
    }
    setTimeout(check,30000);
  }
  window.ncCatalogBegin = function(value) {
    const framed=catalogFrame(value); if(framed===null) return;
    const [next,category]=framed.split('|');
    if(category && category!=='item' && category!=='spell') return;
    if(category==='spell') spellReceivedEpoch='';
    if(category==='item' && spellReceivedEpoch!==next) {
      catalogTransferSerial++; epoch=''; incoming=[];
      requestCatalogSnapshot('spell category missing');
      return;
    }
    epoch=next; catalogCategory=category || '';
    incoming=category ? discovered.filter(entry=>entry.kind!==(category==='spell'?'Spell':'Item'))
      .map(entry=>({...entry,action:entry.action.replace(/^(item|spell):[^:]+:/,`$1:${next}:`)})) : [];
    catalogBatches=0; catalogInvalid=false; catalogFragment=null; catalogTransferStarted=Date.now(); watchCatalogTransfer();
  };
  window.ncDeltaBegin = function(payload) {
    const framed=catalogFrame(payload); if(framed===null) return;
    const [base,next]=framed.split('|');
    if(base!==epoch || !next) {catalogInvalid=true;requestCatalogSnapshot('generation mismatch');return;}
    incoming=discovered.map(entry=>({...entry,action:entry.action.replace(/^(item|spell):[^:]+:/,`$1:${next}:`)}));
    epoch=next; catalogCategory=''; catalogTransferKey=''; catalogBatches=0; catalogInvalid=false; catalogFragment=null; catalogTransferStarted=Date.now(); watchCatalogTransfer();
  };
  window.ncDeltaRemove = function(payload) {
    const framed=catalogFrame(payload); if(framed===null) return;
    const [generation,sequence,formId]=framed.split('|');
    if(generation!==epoch) return;
    if(Number(sequence)!==catalogBatches || !/^-?\d+$/.test(formId)) {catalogInvalid=true;return;}
    incoming=incoming.filter(entry=>entry.action!==`item:${generation}:${formId}`); catalogBatches++; catalogProgress=Date.now();
  };
  window.ncCatalogBatch = function(payload) { const text=catalogFrame(payload); if(text===null) return; const a=text.indexOf('|'), b=text.indexOf('|',a+1); if(a<0 || b<0) {catalogInvalid=true; return;} if(text.slice(0,a)!==epoch) return; if(Number(text.slice(a+1,b))!==catalogBatches || catalogFragment) {catalogInvalid=true; return;} try {for(const line of text.slice(b+1).split('\n')) {const row=JSON.parse(line); if(!Array.isArray(row) || row.length!==4 || row.some(x=>typeof x!=='string')) throw Error('Invalid entry'); window.ncAddEntry(row.join('|'));} catalogBatches++; catalogProgress=Date.now();} catch (_) {catalogInvalid=true;} };
  window.ncCatalogFragment = function(payload) {
    const text=catalogFrame(payload); if(text===null) return; let cursor=0, fields=[];
    for(let i=0;i<4;i++) {const next=text.indexOf('|',cursor); if(next<0) {catalogInvalid=true;return;} fields.push(text.slice(cursor,next));cursor=next+1;}
    const [generation,sequence,part,count]=fields; const index=Number(part), total=Number(count);
    if(generation!==epoch) return;
    if(Number(sequence)!==catalogBatches || !Number.isInteger(index) || !Number.isInteger(total) || total<1 || total>4096 || index<0 || index>=total) {catalogInvalid=true;return;}
    if(index===0 && !catalogFragment) catalogFragment={parts:[],total};
    if(!catalogFragment || catalogFragment.total!==total || catalogFragment.parts.length!==index) {catalogInvalid=true;return;}
    catalogFragment.parts.push(text.slice(cursor)); catalogBatches++; catalogProgress=Date.now();
    if(catalogFragment.parts.length===total) {
      try {const row=JSON.parse(catalogFragment.parts.join(''));if(!Array.isArray(row)||row.length!==4||row.some(x=>typeof x!=='string')) throw Error('Invalid entry');window.ncAddEntry(row.join('|'));}
      catch (_) {catalogInvalid=true;}
      catalogFragment=null;
    }
  };
  window.ncCatalogComplete = function(value) { const framed=catalogFrame(value); if(framed===null) return; const [received,count]=framed.split('|'); if(received!==epoch) return; catalogTransferSerial++; if(count!==undefined && (catalogInvalid || catalogFragment || Number(count)!==catalogBatches)) {incoming=[];epoch='';statusEl.textContent='Catalog transfer incomplete'; const session=catalogSession, transfer=catalogTransferSerial; setTimeout(()=>{if(session===catalogSession && transfer===catalogTransferSerial) requestCatalogSnapshot('incomplete transfer');},1000);return;} if(catalogCategory==='spell') { spellReceivedEpoch=epoch; watchCatalogTransfer(); } else catalogRetries=0; discovered=incoming; incoming=[]; console.info(`[NirnCommand] Catalog applied entries=${discovered.length} batches=${catalogBatches} milliseconds=${Date.now()-catalogTransferStarted}`); statusEl.textContent='Catalog ready'; render(); if(bridge && catalogCategory!=='spell') bridge.send('catalog','applied|' + (catalogSession?catalogSession+'|':'') + epoch + (catalogTransferKey ? '|'+catalogAttempt : '')); };
  window.ncAddEntry = function(payload) {
    const text=String(payload || ''), a=text.indexOf('|'), b=text.indexOf('|',a+1), c=text.indexOf('|',b+1);
    if (a<0 || b<0 || c<0) return; const type=text.slice(0,a), token=text.slice(a+1,b), id=text.slice(b+1,c), name=text.slice(c+1);
    if (!name || !/^(item|spell)$/.test(type) || !token.startsWith(epoch + ':')) return;
    incoming.push({id:id || `session:${type}:${token}`, persistent:!!id, label:name, kind:type==='item'?'Item':'Spell',detail:type==='item'?'Inventory · equip or consume':'Known spell · right hand',action:`${type}:${token}`});
    if (!queued) { queued=true; requestAnimationFrame(()=>{queued=false; statusEl.textContent=`Loading ${incoming.length} entries`;}); }
  };
  input.addEventListener('input',()=>{selected=0;render();});
  let heldModifiers=0;
  const modifierBits={ShiftLeft:1,ShiftRight:2,ControlLeft:4,ControlRight:8,AltLeft:16,AltRight:32};
  document.addEventListener('keydown',event=>{
    if (editor?.isOpen()) { editor.keydown(event); return; }
    if (event.isComposing || event.keyCode===229) return;
    if (modifierBits[event.code]) heldModifiers |= modifierBits[event.code];
    if (!event.repeat && window.NirnEditor?.codes[event.code]===openingHotkey.key && heldModifiers===openingHotkey.mask) {event.preventDefault(); if(bridge) bridge.send('execute',`${++serial}|hotkey:close`); return;}
    if (event.ctrlKey && event.key.toLowerCase()==='d') { event.preventDefault(); toggleFavorite(results[selected]); }
    else if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); if (results.length) {selected=(selected+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;render();} }
    else if (event.key==='Enter' || event.code==='NumpadEnter') {event.preventDefault();execute(results[selected],event.ctrlKey);}
  },true);
  document.addEventListener('keyup',event=>{ if(editor?.isOpen()) editor.keyup(event); if(modifierBits[event.code]) heldModifiers &= ~modifierBits[event.code]; },true);
  function open() {
    input.value=''; selected=0; render(); requestAnimationFrame(()=>input.focus());
    statusEl.textContent=discovered.length ? 'Catalog ready' : 'Preparing catalog…';
    const session=catalogSession;
    setTimeout(()=>{
      if(isOpen && session===catalogSession && !epoch && !discovered.length) {
        statusEl.textContent='Catalog unavailable. Use Refresh catalog to retry.';
        console.warn('[NirnCommand] No catalog transfer started');
      }
    },30000);
  }
  if (bridge) bridge.on('__uimode',state=>{ isOpen=state==='1'; if(isOpen) open(); else {heldModifiers=0; if(editor?.isOpen()) editor.hide();} });
  render();
})();
