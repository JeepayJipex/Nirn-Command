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
  for (const entry of [...(window.NIRN_SCANNED_COMMANDS || []), ...(window.NIRN_COMMANDS || []), ...(window.NIRN_USER_COMMANDS || [])]) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string' || typeof entry.action !== 'string') { configWarnings++; continue; }
    if (seen.has(entry.id)) { if (entry.id !== 'builtin:oar:menu') configWarnings++; continue; }
    if (!/^(console:|skyrimnet:|shortcut:|local:)/.test(entry.action)) { configWarnings++; continue; }
    seen.add(entry.id); statics.push(entry);
  }
  if (configWarnings) console.warn(`[NirnCommand] Ignored ${configWarnings} invalid or duplicate commands.`);
  let discovered = [], incoming = [], epoch = '', selected = 0, results = [], pending = {}, serial = 0, queued = false, clearRequestedAt = 0, clearKind = '', capabilities = null, isOpen = false;
  let fallbackReady=false, fallbackReading=false, fallbackDirty=false, fallbackWriting=false, fallbackSlot=0, fallbackParts=[], fallbackCount=0, fallbackRequest=0, fallbackPending=null;
  const fallbackTouched=new Set();
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
      fallbackReady=true; fallbackTouched.clear(); render(); flushFallback();
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
    if (entry.id === 'builtin:oar:menu') return capabilities[2];
    return true;
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
    const entries = statics.concat(discovered).filter(entry => settings.showUnavailable !== false || available(entry));
    if (!query) {
      const byId = new Map(entries.map(e => [e.id, e]));
      const ordered = [...favorites.slice(0, 8), ...Object.keys(usage).sort((a,b) => (usage[b].lastUsedAt || 0) - (usage[a].lastUsedAt || 0)).slice(0, 8), ...statics.map(e => e.id)];
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
      const row = document.createElement('div'); row.className='entry' + (i === selected ? ' selected' : ''); row.setAttribute('role','option'); row.setAttribute('aria-selected',String(i === selected));
      const icon=document.createElement('span'); icon.className='symbol'; icon.textContent=({Mod:'⚙',Travel:'⌖',Console:'⌘',Item:'◇',Spell:'✧'})[entry.kind] || '✦';
      const info=document.createElement('span'); info.className='info'; const label=document.createElement('span'); label.className='label'; label.textContent=entry.label;
      const detail=document.createElement('span'); detail.className='detail'; detail.textContent=available(entry) ? (entry.detail || '') : 'Unavailable: dependency not detected'; info.append(label,detail);
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
    if (entry?.action === 'local:toggle-unavailable') { settings.showUnavailable=settings.showUnavailable===false; save('settings',settings); statusEl.textContent=settings.showUnavailable ? 'Unavailable actions shown' : 'Unavailable actions hidden'; render(); return; }
    if (entry?.action === 'local:refresh') { if (bridge) { bridge.send('catalog','refresh'); statusEl.textContent='Loading…'; } return; }
    if (!entry || !bridge) { statusEl.textContent='Bridge unavailable'; return; }
    if (!available(entry)) { statusEl.textContent='Action unavailable'; return; }
    const action=left && entry.action.startsWith('spell:') ? entry.action.replace('spell:','spellleft:') : entry.action;
    const request=String(++serial); pending[request]=entry;
    try { bridge.send('execute',request + '|' + action); statusEl.textContent='Action sent'; }
    catch (_) { delete pending[request]; statusEl.textContent='Bridge error'; return; }
    setTimeout(() => { if (pending[request]) { delete pending[request]; statusEl.textContent='No action response'; } }, 10000);
  }
  window.ncActionResult = function(payload) {
    const [request,result]=String(payload).split('|'); const entry=pending[request]; if (!entry) return; delete pending[request];
    statusEl.textContent=({sent:'Action sent',success:'Action accepted',failure:'Action failed',unavailable:'Action unavailable'})[result] || 'Unknown result';
    if ((result === 'sent' || result === 'success') && !entry.transient) {
      const now=Date.now(), old=usage[entry.id] || {}; usage[entry.id]={firstUsedAt:old.firstUsedAt || now,lastUsedAt:now,useCount:(old.useCount || 0)+1,lastResult:result};
      Object.keys(usage).sort((a,b)=>usage[b].lastUsedAt-usage[a].lastUsedAt).slice(100).forEach(id=>delete usage[id]); save('usage',usage);
    } else if ((result === 'failure' || result === 'unavailable') && usage[entry.id]) {
      usage[entry.id].lastResult=result; save('usage',usage);
    }
  };
  window.ncCapabilities = function(payload) { capabilities=String(payload).split('|').map(value=>value==='1'); render(); };
  window.ncGameLoaded = function() { discovered=[]; incoming=[]; epoch=''; pending={}; capabilities=null; render(); };
  window.ncBridgeReady = function() {
    if (!storageAvailable && !fallbackReady && !fallbackReading && bridge) { fallbackReading=true; bridge.send('persist','read'); }
    if (isOpen && bridge) bridge.send('catalog','refresh');
  };
  window.ncCatalogBegin = function(value) { epoch=String(value); incoming=[]; };
  window.ncCatalogComplete = function(value) { if (String(value)!==epoch) return; discovered=incoming; incoming=[]; statusEl.textContent='Catalog ready'; render(); };
  window.ncAddEntry = function(payload) {
    const text=String(payload || ''), a=text.indexOf('|'), b=text.indexOf('|',a+1), c=text.indexOf('|',b+1);
    if (a<0 || b<0 || c<0) return; const type=text.slice(0,a), token=text.slice(a+1,b), id=text.slice(b+1,c), name=text.slice(c+1);
    if (!name || !/^(item|spell)$/.test(type) || !token.startsWith(epoch + ':')) return;
    incoming.push({id:id || `session:${type}:${token}`, persistent:!!id, label:name, kind:type==='item'?'Item':'Spell',detail:type==='item'?'Inventory · equip or consume':'Known spell · right hand',action:`${type}:${token}`});
    if (!queued) { queued=true; requestAnimationFrame(()=>{queued=false; statusEl.textContent=`Loading ${incoming.length} entries`;}); }
  };
  input.addEventListener('input',()=>{selected=0;render();});
  document.addEventListener('keydown',event=>{
    if (event.isComposing || event.keyCode===229) return;
    if (event.ctrlKey && event.key.toLowerCase()==='d') { event.preventDefault(); toggleFavorite(results[selected]); }
    else if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); if (results.length) {selected=(selected+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;render();} }
    else if (event.key==='Enter' || event.code==='NumpadEnter') {event.preventDefault();execute(results[selected],event.ctrlKey);}
  },true);
  function open() { input.value=''; selected=0; render(); requestAnimationFrame(()=>input.focus()); if (bridge) {bridge.send('catalog','refresh'); statusEl.textContent=configWarnings ? `${configWarnings} invalid or duplicate commands` : 'Loading…';} }
  if (bridge) bridge.on('__uimode',state=>{ isOpen=state==='1'; if(isOpen) open(); });
  render();
})();
