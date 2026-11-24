(() => {
  'use strict';
  const bridge = window.magelight;
  const input = document.querySelector('#query');
  const resultsEl = document.querySelector('#results');
  const metaEl = document.querySelector('#meta');
  const statusEl = document.querySelector('#status');
  const actionHint = document.querySelector('#action-hint');
  const actionLabel = document.querySelector('#action-label');
  const leftHint = document.querySelector('#left-hint');
  const favoriteHint = document.querySelector('#favorite-hint');
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
    if (seen.has(entry.id)) { configWarnings++; continue; }
    if (!/^(console:|skyrimnet:|shortcut:|shortcut2:|local:)/.test(entry.action)) { configWarnings++; continue; }
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
  let overrides={}, overridesReady=false, overridesReadStarted=false, overridesCount=-2, overridesParts=[];
  let overridesDirty=false, overridesWriting=false, overridesSerial=0, overridesPending=null;
  function flushOverrides() {
    if (!bridge || !overridesReady || overridesWriting || !overridesDirty) return;
    const chars=Array.from(JSON.stringify({version:1,overrides}));
    let bytes=0; for(const char of chars) {const code=char.codePointAt(0);bytes+=code<128?1:code<2048?2:code<65536?3:4;}
    if(bytes>256*1024) {statusEl.textContent=`Overrides exceed 262144 UTF-8 bytes (${bytes})`;editor?.overridesResult?.(false);return;}
    const parts=[]; for(let i=0;i<chars.length;i+=100) parts.push(chars.slice(i,i+100).join(''));
    overridesDirty=false; overridesWriting=true; let index=-1;
    function next() {
      const request=String(++overridesSerial), operation=index<0?'begin':index<parts.length?'write':'commit';
      overridesPending={request,advance:()=>{if(operation==='commit') {overridesWriting=false;statusEl.textContent='Overrides saved';if(!overridesDirty) editor?.overridesResult?.(true);flushOverrides();} else {index++;next();}}};
      bridge.send('overrides',operation==='write'?`write|${request}|${parts[index]}`:`${operation}|${request}`);
      setTimeout(()=>{if(overridesPending?.request===request) {overridesPending=null;overridesWriting=false;overridesDirty=true;statusEl.textContent='Overrides save timed out';editor?.overridesResult?.('timeout');}},10000);
    }
    next();
  }
  window.ncOverridesBegin = payload=>{const count=Number(payload);overridesCount=Number.isInteger(count)&&count>=-3&&count<=1024?count:-2;overridesParts=overridesCount>=0?new Array(overridesCount):[];};
  window.ncOverridesChunk = payload=>{const text=String(payload),split=text.indexOf('|'),i=Number(text.slice(0,split));if(split>=0&&Number.isInteger(i)&&i>=0&&i<overridesCount) overridesParts[i]=text.slice(split+1);};
  window.ncOverridesDone = ()=>{
    if(overridesCount===-1) {overrides={};overridesReady=true;render();return;}
    try {if(overridesCount<0 || Array.from({length:overridesCount},(_,i)=>typeof overridesParts[i]==='string').includes(false)) throw Error('Incomplete');const saved=JSON.parse(overridesParts.join(''));if(saved.version!==1||!saved.overrides||typeof saved.overrides!=='object'||Array.isArray(saved.overrides)) throw Error('Invalid');overrides=saved.overrides;overridesReady=true;render();}
    catch (_) {statusEl.textContent='Overrides file unavailable or invalid';}
  };
  window.ncOverridesAck = payload=>{const [request,result]=String(payload).split('|');if(!overridesPending||overridesPending.request!==request)return;const pending=overridesPending;overridesPending=null;if(result==='ok') pending.advance();else {overridesWriting=false;overridesDirty=true;statusEl.textContent='Overrides could not be saved';editor?.overridesResult?.(false);}};
  function validCommands(value) {
    if(!Array.isArray(value)) return [];
    const used=new Set(statics.map(entry=>entry.id));
    return value.filter(entry=>entry && typeof entry.id==='string' && entry.id.startsWith('user:') && typeof entry.label==='string' && entry.label.trim() && typeof entry.action==='string' && !used.has(entry.id) && used.add(entry.id));
  }
  // Keep unknown actions in the saved document so a newer version can recover them.
  const supportedUserCommand = entry => /^(console:|skyrimnet:|shortcut:|shortcut2:)/.test(entry.action);
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
    getCommands:()=>commands.filter(supportedUserCommand),
    setCommands:value=>{commands=validCommands([...commands.filter(entry=>!supportedUserCommand(entry)),...value]);commandsDirty=true;render();flushCommands();},
    getProviders:()=>modDiscovered.filter(entry=>entry.id.startsWith('provider:')),
    getOverride:id=>overrides[id] || {},
    setOverride:(id,value)=>{if(!overridesReady)return false;overrides={...overrides};if(value) overrides[id]=value;else delete overrides[id];overridesDirty=true;render();flushOverrides();return true;},
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
    if (entry.requirementsMet === false) return false;
    if (!capabilities) return true;
    if (entry.action.startsWith('console:')) return capabilities[0];
    if (entry.action.startsWith('skyrimnet:')) return capabilities[1];
    return true;
  }
  function unavailableReason(entry) {
    return 'Unavailable: required plugin not detected.';
  }
  const normalize=window.NirnSearch.normalize, searchIndex=window.NirnSearch.create();
  const categories=['All','Actions','Items','Spells','NPCs','Locations'];
  const worldCatalog=window.NirnWorldCatalog?.create();
  let worldContext='', worldNpcs=[], worldLocations=[], indexedNpcs=null, indexedLocations=null, worldRequest=null;
  let trackedForm='', trackingRevision=0;
  let trackingMatchLog='';
  const stopTracking={id:'tracking:stop',label:'Stop tracking NPC',kind:'Action',action:'local:stop-tracking',transient:true};
  function reportTrackingMatch() {
    if(!trackedForm) { trackingMatchLog=''; return; }
    const matches=worldNpcs.filter(entry=>entry.form===trackedForm).length;
    const summary=`${trackedForm}|${matches}`;
    if(summary!==trackingMatchLog && bridge && catalogSession && worldContext) {
      bridge.send('world',`tracking-ui|${catalogSession}|${worldContext}|${summary}|${worldNpcs.length}`);
      trackingMatchLog=summary;
    }
  }
  function cancelWorldRequest() {
    if (!worldRequest) return;
    const item=[...worldNpcs,...worldLocations].find(entry=>entry.id===worldRequest.id);
    if (item && item.worldStatus==='Checking reference…') delete item.worldStatus;
    worldRequest=null;
  }
  let category='All', indexedStatics=false, indexedCommands=null, indexedCatalog=null;
  let indexedDiscovery=null, indexedOverrides=null, effectiveDiscovery=[];
  function eligible(entry) {return (category==='All' || category===({Item:'Items',Spell:'Spells',NPC:'NPCs',Location:'Locations'}[entry.kind] || 'Actions')) && (settings.showUnavailable!==false || available(entry));}
  function updateIndex() {
    if(!indexedStatics){searchIndex.replace('static',trackedForm ? [...statics,stopTracking] : statics);indexedStatics=true;}
    if(indexedCommands!==commands){searchIndex.replace('commands',commands.filter(supportedUserCommand));indexedCommands=commands;}
    if(indexedCatalog!==discovered){searchIndex.replace('catalog',discovered);indexedCatalog=discovered;}
    if(indexedNpcs!==worldNpcs){searchIndex.replace('npcs',worldNpcs);indexedNpcs=worldNpcs;}
    if(indexedLocations!==worldLocations){searchIndex.replace('locations',worldLocations);indexedLocations=worldLocations;}
    if(indexedDiscovery!==modDiscovered || indexedOverrides!==overrides){
      indexedDiscovery=modDiscovered;indexedOverrides=overrides;
      effectiveDiscovery=modDiscovered.filter(e=>!overrides[e.id]?.hidden).map(e=>{const o=overrides[e.id];return e.id.startsWith('provider:') && e.action.startsWith('shortcut2:') && /^shortcut2:[0-9]+:[0-9]+$/.test(o?.action||'')?{...e,action:o.action}:e;});
      searchIndex.replace('providers',effectiveDiscovery);
    }
  }
  function setCategory(next){cancelWorldRequest();category=next;selected=0;results=[];render();input.focus();}
  const categoryEl=document.querySelector('#categories');
  if(categoryEl) categories.forEach(name=>{const button=document.createElement('button');button.type='button';button.textContent=name;button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>setCategory(name));categoryEl.appendChild(button);});
  function getResults() {
    const q = input.value, query = normalize(q);
    if (q.trimStart().startsWith('>')) {
      const pos = q.indexOf('>'), raw = q.slice(pos + 1);
      return raw.trim() ? [{ id:'direct:' + raw, label:'Run: ' + raw, detail:'Console command', kind:'Console', action:'console:' + raw, transient:true }] : [];
    }
    updateIndex();
    if(!query){
      const entries=searchIndex.entries().map(x=>x.entry).filter(eligible), byId=new Map(entries.map(e=>[e.id,e]));
      const ordered=[...favorites.slice(0,8),...Object.keys(usage).sort((a,b)=>(usage[b].lastUsedAt||0)-(usage[a].lastUsedAt||0)).slice(0,8),...statics.map(e=>e.id),...commands.map(e=>e.id)];
      if(category==='Items'||category==='Spells') ordered.push(...entries.slice().sort((a,b)=>normalize(a.label).localeCompare(normalize(b.label))||a.id.localeCompare(b.id)).map(e=>e.id));
      if(category==='NPCs') ordered.push(...entries.filter(e=>e.kind==='NPC').sort((a,b)=>a.distance-b.distance).slice(0,8).map(e=>e.id));
      if(category==='Locations') ordered.push(...entries.filter(e=>e.kind==='Location').sort((a,b)=>normalize(a.label).localeCompare(normalize(b.label))||a.id.localeCompare(b.id)).slice(0,8).map(e=>e.id));
      return [...new Set(ordered)].map(id=>byId.get(id)).filter(Boolean).slice(0,20);
    }
    const parts=({Actions:['static','commands','providers'],Items:['catalog'],Spells:['catalog'],NPCs:['npcs'],Locations:['locations']})[category];
    return searchIndex.search(query,{favorites,usage,filter:eligible,parts});
  }
  function highlight(label, text, query) {
    if (!document.createTextNode || query.trimStart().startsWith('>')) {label.textContent=text;return;}
    const terms=normalize(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!terms.length) {label.textContent=text;return;}
    let normalized='', offsets=[];
    for(let pos=0;pos<text.length;) {
      const cp=String.fromCodePoint(text.codePointAt(pos)), start=pos; pos+=cp.length;
      const folded=cp.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      if (!folded && offsets.length && /[\u0300-\u036f]/.test(cp)) offsets[offsets.length-1][1]=pos;
      for(let n=0;n<folded.length;n++){normalized+=folded[n];offsets.push([start,pos]);}
    }
    const marked=new Array(text.length).fill(false);
    for(const term of terms){let at=0;while((at=normalized.indexOf(term,at))!==-1){const start=offsets[at][0],end=offsets[at+term.length-1][1];for(let i=start;i<end;i++)marked[i]=true;at+=term.length;}}
    let start=0;while(start<text.length){let end=start+1;while(end<text.length && marked[end]===marked[start])end++;const part=text.slice(start,end);if(marked[start]){const mark=document.createElement('mark');mark.textContent=part;label.appendChild(mark);}else label.appendChild(document.createTextNode(part));start=end;}
  }
  function updateActionHints() {
    const entry=results[selected];
    const actionable=!!entry && available(entry);
    if(actionHint) actionHint.hidden=!actionable;
    if(leftHint) leftHint.hidden=!actionable || entry.kind!=='Spell';
    if(favoriteHint) favoriteHint.hidden=!actionable || entry.transient || (!entry.persistent && /^(item|spell):/.test(entry.action));
    if(actionLabel && actionable) {
      if(entry.kind==='NPC') actionLabel.textContent=entry.form===trackedForm ? 'Stop tracking' : 'Track';
      else if(entry.action==='local:stop-tracking') actionLabel.textContent='Stop tracking';
      else if(entry.kind==='Location') actionLabel.textContent='Open map';
      else if(entry.kind==='Item') actionLabel.textContent='Equip or use';
      else if(entry.kind==='Spell') actionLabel.textContent='Equip';
      else actionLabel.textContent='Execute';
    }
  }
  function render() {
    const previous=results[selected]?.id; results=getResults();
    const retained=previous ? results.findIndex(e=>e.id===previous) : -1; selected=retained>=0?retained:0;
    updateActionHints();
    if(categoryEl) Array.from(categoryEl.children).forEach((button,i)=>{button.classList.toggle('active',categories[i]===category);button.setAttribute('aria-pressed',String(categories[i]===category));});
    metaEl.textContent = `${results.length} RESULTS`;
    resultsEl.textContent = '';
    if (!results.length) { const empty = document.createElement('div'); empty.className='empty'; empty.textContent=category==='All'?'No results.':'No '+category.toLowerCase()+' found. Try another search or category.'; resultsEl.appendChild(empty); return; }
    const frag = document.createDocumentFragment();
    results.forEach((entry,i) => {
      const row = document.createElement('div'); row.className='entry' + (i === selected ? ' selected' : ''); row.setAttribute('role','option'); if(entry.source) row.title=`${entry.source} · ${entry.confidence || ''}`; row.setAttribute('aria-selected',String(i === selected));
      const icon=document.createElement('span'); icon.className='symbol'; icon.textContent=({Mod:'⚙',Travel:'⌖',Console:'⌘',Item:'◇',Spell:'✧',NPC:'♙',Location:'⌖'})[entry.kind] || '✦';
      const info=document.createElement('span'); info.className='info'; const label=document.createElement('span'); label.className='label'; highlight(label,entry.label,input.value);
      const detail=document.createElement('span'); detail.className='detail'; detail.textContent=entry.worldStatus || (available(entry) ? (entry.detail || '') : unavailableReason(entry)); info.append(label,detail);
      const star=document.createElement('button'); star.type='button'; star.className='favorite'; star.textContent=favorites.includes(entry.id) ? '★' : '☆'; star.setAttribute('aria-label','Toggle favorite'); star.addEventListener('click',event => {event.stopPropagation(); toggleFavorite(entry);});
      const isTracked=entry.kind==='NPC' && entry.form===trackedForm;
      const kind=document.createElement('span'); kind.className='kind' + (isTracked?' tracked':''); kind.textContent=isTracked?'Tracked':entry.kind==='Location'?'Open general map':entry.kind || '';
      if(entry.transient) star.disabled=true;
      row.append(icon,info,star,kind);
      row.addEventListener('mouseenter',() => {
        if(selected!==i) cancelWorldRequest();
        selected=i;
        updateActionHints();
        Array.from(resultsEl.children).forEach((node,index)=>{node.classList.toggle('selected',index===i);node.setAttribute('aria-selected',String(index===i));});
      });
      row.addEventListener('click',() => {if(selected!==i) cancelWorldRequest(); selected=i; execute(entry);}); frag.appendChild(row);
    });
    resultsEl.appendChild(frag); resultsEl.children[selected]?.scrollIntoView({block:'nearest'});
  }
  function toggleFavorite(entry) {
    if (!entry || entry.transient || !entry.persistent && /^(item|spell):/.test(entry.action)) { statusEl.textContent='This action cannot be saved'; return; }
    favorites = favorites.includes(entry.id) ? favorites.filter(id => id !== entry.id) : [entry.id,...favorites]; save('favorites',favorites); render();
  }
  function execute(entry, left=false) {
    if(entry?.action==='local:stop-tracking') {
      if(bridge && trackedForm && catalogSession && worldContext) bridge.send('world',`stop-tracking|${catalogSession}|${worldContext}|${++serial}`);
      return;
    }
    if(entry?.kind==='NPC') {
      if(bridge && catalogSession && worldContext) {
        if(trackedForm && entry.form===trackedForm) bridge.send('world',`stop-tracking|${catalogSession}|${worldContext}|${++serial}|${Number(trackedForm)|0}`);
        else bridge.send('world',`track|${catalogSession}|${worldContext}|${entry.token}|${++serial}`);
      }
      return;
    }
    if(entry && (entry.kind==='NPC' || entry.kind==='Location')) {
      if (!bridge) {statusEl.textContent='Bridge unavailable';return;}
      cancelWorldRequest();
      const request=String(++serial), kind=entry.kind.toLowerCase();
      worldRequest={request,kind,token:String(entry.token),id:entry.id,session:catalogSession,context:worldContext};
      entry.worldStatus='Checking reference…'; render();
      bridge.send('world',`inspect|${catalogSession}|${worldContext}|${kind}|${entry.token}|${request}`);
      setTimeout(()=>{if(worldRequest?.request===request){worldRequest=null;entry.worldStatus='Validation timed out';render();}},5000);
      return;
    }
    if (entry?.action === 'local:clear-history' || entry?.action === 'local:clear-favorites') {
      const kind = entry.action.endsWith('history') ? 'history' : 'favorites';
      if (clearKind === kind && Date.now() - clearRequestedAt < 5000) {
        if (kind === 'history') { usage={}; save('usage',usage); } else { favorites=[]; save('favorites',favorites); }
        clearRequestedAt=0; clearKind=''; statusEl.textContent=kind + ' cleared'; render();
      } else { clearKind=kind; clearRequestedAt=Date.now(); statusEl.textContent='Activate again within five seconds to clear ' + kind; }
      return;
    }
    if (entry?.action === 'local:commands' || entry?.action === 'local:hotkey' || entry?.action === 'local:providers') { if (entry.action === 'local:commands' && !commandsReady) {statusEl.textContent='Commands unavailable or still loading';return;} if(entry.action==='local:providers' && !overridesReady) {statusEl.textContent='Overrides unavailable or still loading';return;} if(editor) {if(bridge) bridge.send('__escapecapture','1'); editor.open(entry.action === 'local:hotkey' ? 'hotkey' : entry.action==='local:providers'?'provider':'command');} return; }
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
  window.ncDiscoveryEntry = function(payload) { try { const entry=JSON.parse(String(payload)); if(entry && typeof entry.id==='string' && typeof entry.label==='string' && typeof entry.action==='string' && ((/^mcm:/.test(entry.id) && /^shortcut2:[0-9]+:[0-9]+$/.test(entry.action)) || (/^provider:[a-z0-9_-]+:[a-z0-9_-]+$/.test(entry.id) && /^(shortcut2:[0-9]+:[0-9]+|console:.+)$/.test(entry.action) && typeof entry.requirementsMet==='boolean'))) incomingMods.push(entry); } catch (_) {} };
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
  window.ncGameLoaded = function(value) { catalogTransferSerial++; catalogRetries=0; spellReceivedEpoch=''; catalogAttempt=0; catalogTransferKey=''; catalogSession=value==='new' ? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2) : String(value || ''); worldContext=''; worldNpcs=[]; worldLocations=[]; worldRequest=null; trackedForm=''; trackingRevision=0; trackingMatchLog=''; indexedStatics=false; worldCatalog?.reset(catalogSession,worldContext); modDiscovered=[]; incomingMods=[]; discovered=[]; incoming=[]; epoch=''; pending={}; capabilities=null; render(); };
  window.ncTrackingState = function(payload) {
    const [session,revision,form]=String(payload).split('|');
    const version=Number(revision);
    if(!session || session!==catalogSession || !Number.isSafeInteger(version) || version<=trackingRevision || !/^-?\d+$/.test(form)) return;
    trackingRevision=version;
    const id=Number(form) >>> 0;
    trackedForm=id ? String(id) : '';
    reportTrackingMatch();
    indexedStatics=false;
    render();
  };
  window.ncWorldContext = function(payload) {
    const [session,context]=String(payload).split('|');
    const revision=Number(context);
    if(!worldCatalog || !session || session!==catalogSession || !Number.isSafeInteger(revision) || revision<1 || revision<=Number(worldContext || 0)) return;
    worldContext=context; worldNpcs=[]; worldLocations=[]; worldRequest=null; trackingMatchLog=''; worldCatalog.reset(session,context); reportTrackingMatch(); render();
  };
  window.ncWorldBegin = function(payload) {
    const [session,context,kind,generation,attempt,count]=String(payload).split('|');
    const state=worldCatalog?.begin(session,context,kind,Number(generation),Number(count),Number(attempt));
    if(state==='applied' && bridge) bridge.send('world',`applied|${session}|${context}|${kind}|${generation}|${attempt}`);
  };
  window.ncWorldEntry = function(payload) {
    try {
      const [session,context,kind,generation,attempt,index,...rest]=String(payload).split('|');
      const row=JSON.parse(rest.join('|'));
      if(!/^-?[0-9]+$/.test(String(row.token)) || !Number.isFinite(row.distance) && kind==='npc') return;
      worldCatalog?.append(session,context,kind,Number(generation),Number(index),row,Number(attempt));
    } catch (_) {}
  };
  window.ncWorldComplete = function(payload) {
    const [session,context,kind,generation,attempt]=String(payload).split('|');
    if(!worldCatalog?.complete(session,context,kind,Number(generation),Number(attempt))) return;
    const entries=worldCatalog.entries(kind).map(row=>({...row,kind:kind==='npc'?'NPC':'Location',action:`world:${row.token}`,transient:true}));
    if(kind==='npc') { worldNpcs=entries; reportTrackingMatch(); } else worldLocations=entries;
    render();
    if(bridge) bridge.send('world',`applied|${session}|${context}|${kind}|${generation}|${attempt}`);
  };
  window.ncWorldInspect = function(payload) {
    try {
      const [session,context,rawKind,token,request,...rest]=String(payload).split('|');
      const kind=String(rawKind || '').toLowerCase();
      const current=worldRequest;
      if(!current || session!==catalogSession || context!==worldContext || session!==current.session || context!==current.context || kind!==current.kind || token!==current.token || request!==current.request) return;
      const result=JSON.parse(rest.join('|')), entry=results.find(item=>item.id===current.id);
      worldRequest=null; if(!entry) return;
      entry.worldStatus=result.available===true ? (typeof result.detail==='string' ? result.detail : entry.detail) : 'Temporarily unavailable';
      render();
      if(result.available===true && kind==='location' && bridge) bridge.send('world',`map|${session}|${context}|${token}`);
    } catch (_) {}
  };
  window.ncBridgeReady = function() {
    if(bridge) bridge.send('catalog',catalogSession?'ready|'+catalogSession:'ready');
    if (!storageAvailable && !fallbackReady && !fallbackReading && bridge) { fallbackReading=true; bridge.send('persist','read'); }
    if (!commandsReadStarted && bridge) {commandsReadStarted=true; bridge.send('commands','read');}
    if (!overridesReadStarted && bridge) {overridesReadStarted=true; bridge.send('overrides','read');}
  };
  let catalogBatches=0, catalogInvalid=false, catalogTransferStarted=0, catalogFragment=null, catalogProgress=0, catalogCategory='', catalogAttempt=0, catalogTransferKey='';
  function transferFrame(payload) {
    const text=catalogFrame(payload); if(text===null) return null;
    const fields=text.split('|'); if(fields.length<4) return null;
    const [generation,attempt,rawCategory]=fields;
    const category=rawCategory.toLowerCase();
    if(`${generation}|${attempt}|${category}`!==catalogTransferKey) return null;
    return (catalogSession?catalogSession+'|':'')+generation+'|'+fields.slice(3).join('|');
  }
  window.ncTransferBegin = function(payload) {
    const text=catalogFrame(payload); if(text===null) return;
    const [generation,attempt,rawCategory]=text.split('|');
    const category=String(rawCategory || '').toLowerCase();
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
    const [next,rawCategory]=framed.split('|');
    const category=rawCategory ? rawCategory.toLowerCase() : '';
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
    if (a<0 || b<0 || c<0) return; const type=text.slice(0,a).toLowerCase(), token=text.slice(a+1,b), id=text.slice(b+1,c), name=text.slice(c+1);
    if (!name || !/^(item|spell)$/.test(type) || !token.startsWith(epoch + ':')) return;
    incoming.push({id:id || `session:${type}:${token}`, persistent:!!id, label:name, kind:type==='item'?'Item':'Spell',detail:type==='item'?'Inventory · equip or consume':'Known spell · right hand',action:`${type}:${token}`});
    if (!queued) { queued=true; requestAnimationFrame(()=>{queued=false; statusEl.textContent=`Loading ${incoming.length} entries`;}); }
  };
  input.addEventListener('input',()=>{cancelWorldRequest();selected=0;results=[];render();});
  let heldModifiers=0;
  const modifierBits={ShiftLeft:1,ShiftRight:2,ControlLeft:4,ControlRight:8,AltLeft:16,AltRight:32};
  document.addEventListener('keydown',event=>{
    if (editor?.isOpen()) { editor.keydown(event); return; }
    if (event.isComposing || event.keyCode===229) return;
    if (modifierBits[event.code]) heldModifiers |= modifierBits[event.code];
    if (!event.repeat && window.NirnEditor?.codes[event.code]===openingHotkey.key && heldModifiers===openingHotkey.mask) {event.preventDefault(); if(bridge) bridge.send('execute',`${++serial}|hotkey:close`); return;}
    if(event.key==='Tab' && !event.ctrlKey && !event.altKey && !event.metaKey){event.preventDefault();setCategory(categories[(categories.indexOf(category)+(event.shiftKey?-1:1)+categories.length)%categories.length]);}
    else if (event.ctrlKey && event.key.toLowerCase()==='d') { event.preventDefault(); toggleFavorite(results[selected]); }
    else if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); cancelWorldRequest(); if (results.length) {selected=(selected+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;render();} }
    else if (event.key==='Enter' || event.code==='NumpadEnter') {event.preventDefault();execute(results[selected],event.ctrlKey);}
  },true);
  document.addEventListener('keyup',event=>{ if(editor?.isOpen()) editor.keyup(event); if(modifierBits[event.code]) heldModifiers &= ~modifierBits[event.code]; },true);
  function open() {
    input.value=''; category='All'; selected=0; results=[]; render(); requestAnimationFrame(()=>input.focus());
    statusEl.textContent=discovered.length ? 'Catalog ready' : 'Preparing catalog…';
    const session=catalogSession;
    setTimeout(()=>{
      if(isOpen && session===catalogSession && !epoch && !discovered.length) {
        statusEl.textContent='Catalog unavailable. Use Refresh catalog to retry.';
        console.warn('[NirnCommand] No catalog transfer started');
      }
    },30000);
  }
  let heartbeatSerial=0;
  function heartbeat(serial) {
    if (!isOpen || serial!==heartbeatSerial) return;
    if (bridge && catalogSession) bridge.send('catalog','tick|'+catalogSession);
    setTimeout(()=>heartbeat(serial),1000);
  }
  if (bridge) bridge.on('__uimode',state=>{ isOpen=state==='1'; heartbeatSerial++; if(isOpen) {open(); heartbeat(heartbeatSerial);} else {heldModifiers=0; cancelWorldRequest(); if(editor?.isOpen()) editor.hide();} });
  render();
})();
