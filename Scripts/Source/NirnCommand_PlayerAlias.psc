Scriptname NirnCommand_PlayerAlias extends ReferenceAlias

int _viewId
int _viewGeneration
string _catalogSession
int _epoch
bool _scanning
bool _sending
bool _discoverySending
bool _discoveryRequested
int _discoveryRevision
bool _domReady
bool _connecting
bool _snapshotRequested
bool _dirty
bool _fullScan
int _slot
int _activeEpoch
int _previousEpoch
int _previousSlot
int _uiEpoch
float _lastChange
float _lastScan
float _lastSpellCheck
float _lastDiscovery
float _lastHandshake
float _transferStarted
float _initialScanEarliest
int _transferEpoch
int _transferAttempt
int _hotkey
int _hotkeyModifiers
bool _serviceBusy
float _lastWorldRefresh
bool _worldRefreshedInPalette
int _worldContext
int _worldRevision
int _locationRevision
bool _worldSending
bool _worldInspectBusy
int _worldAttempt
int _npcAttempt
int _locationAttempt
float _npcSentAt
float _locationSentAt
int _trackingEpoch
int _trackingLastUIRequest
int _trackingRevision
int _trackingOwner
bool _trackingBusy
Actor _trackedActor
bool _trackingConfirmed
float _lastTrackingCheck

Event OnInit()
    Setup()
EndEvent

Event OnPlayerLoadGame()
    _trackingEpoch += 1
    _trackingBusy = false
    _trackingOwner = 0
    Debug.Trace("[NirnCommand] Tracking save/load cleanup epoch=" + _trackingEpoch)
    CleanupTracking()
    _epoch += 1
    _scanning = false
    _sending = false
    _discoverySending = false
    _activeEpoch = 0
    _previousEpoch = 0
    Setup()
EndEvent

Function Setup()
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        NirnCommandNative.HotkeyReady(false)
    endif
    ClosePalette()
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        NirnCommandNative.WorldReset()
    endif
    _worldContext = 0
    _worldRevision = 0
    _locationRevision = 0
    _worldSending = false
    _worldInspectBusy = false
    _lastWorldRefresh = 0.0
    _worldRefreshedInPalette = false
    _npcSentAt = 0.0
    _locationSentAt = 0.0
    _viewGeneration += 1
    _viewId = 0
    _domReady = false
    _connecting = false
    _uiEpoch = 0
    _snapshotRequested = false
    _discoveryRequested = false
    _discoveryRevision = -1
    _catalogSession = ""
    _lastHandshake = 0.0
    RegisterForModEvent("Magelight_JS_catalog", "OnCatalog")
    RegisterForModEvent("Magelight_JS_execute", "OnExecute")
    RegisterForModEvent("Magelight_JS_persist", "OnPersist")
    RegisterForModEvent("Magelight_JS_hotkey", "OnHotkey")
    RegisterForModEvent("Magelight_JS_commands", "OnCommands")
    RegisterForModEvent("Magelight_JS_overrides", "OnOverrides")
    RegisterForModEvent("Magelight_JS_world", "OnWorld")
    RegisterForMenu("MapMenu")
    UnregisterForAllKeys()
    _hotkey = 210
    _hotkeyModifiers = 0
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        _hotkey = NirnCommandNative.GetHotkey(0)
        _hotkeyModifiers = NirnCommandNative.GetHotkey(1)
    endif
    if !ValidHotkey(_hotkey, _hotkeyModifiers)
        _hotkey = 210
        _hotkeyModifiers = 0
    endif
    _serviceBusy = false
    RegisterForModEvent("NirnCommand_Hotkey", "OnNativeHotkey")
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        NirnCommandNative.ConfigureHotkey(_hotkey, _hotkeyModifiers)
    endif
    RegisterForModEvent("Magelight_ViewDomReady", "OnDomReady")
    RegisterForModEvent("Magelight_UIModeExited", "OnUIModeExited")
    _dirty = true
    _fullScan = true
    StorageUtil.FormListClear(Game.GetPlayer(), "NirnCommand.Pending")
    _lastChange = 0.0
    _lastSpellCheck = Utility.GetCurrentRealTime()
    _initialScanEarliest = _lastSpellCheck + 30.0
    _lastDiscovery = Utility.GetCurrentRealTime() - 30.0
    RegisterForSingleUpdate(1.0)
    Connect()
EndFunction

Event OnUpdate()
    ServiceCatalog()
    RegisterForSingleUpdate(1.0)
EndEvent

Event OnMenuClose(string menuName)
    if menuName == "MapMenu" && SKSE.GetPluginVersion("NirnCommandNative") >= 0
        NirnCommandNative.RequestLocationRefresh()
    endif
EndEvent

Function ServiceCatalog()
    if _serviceBusy
        return
    endif
    _serviceBusy = true
    if _viewId == 0
        Connect()
    endif
    float now = Utility.GetCurrentRealTime()
    if _trackingConfirmed && now - _lastTrackingCheck >= 5.0
        _lastTrackingCheck = now
        if !TrackingStillValid()
            Debug.Trace("[NirnCommand] Tracking target or quest is no longer valid")
            _trackingEpoch += 1
            CleanupTracking()
            PublishTracking()
        endif
    endif
    if _viewId != 0 && !_domReady && now - _lastHandshake >= 5.0
        _lastHandshake = now
        Debug.Trace("[NirnCommand] Retrying catalog handshake view=" + _viewId)
        Magelight.Call(_viewId, "ncBridgeReady", "")
    endif
    bool ownPalette = Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId && _viewId != 0
    if !ownPalette
        _worldRefreshedInPalette = false
    endif
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0 && (ownPalette || (!Magelight.IsUIModeActive() && !Utility.IsInMenuMode()))
        if !ownPalette
            NirnCommandNative.StepLocationProbe()
        endif
        if (ownPalette && !_worldRefreshedInPalette) || (!ownPalette && now - _lastWorldRefresh >= 2.0)
            _lastWorldRefresh = now
            if ownPalette
                _worldRefreshedInPalette = true
            endif
            NirnCommandNative.WorldRefresh()
        endif
        if _domReady && !_worldSending
            PublishWorldNPCs()
            PublishWorldLocations()
        endif
    endif
    if !_scanning && !_sending && (ownPalette || (!Magelight.IsUIModeActive() && !Utility.IsInMenuMode()))
        if _activeEpoch != 0 || now >= _initialScanEarliest
            if _dirty && now - _lastChange >= 0.5
                ScanCatalog()
            elseif now - _lastSpellCheck >= 30.0
                _lastSpellCheck = now
                if SpellCatalogChanged()
                    ScanCatalog()
                endif
            endif
        endif
        if now - _lastDiscovery >= 30.0
            _lastDiscovery = now
            if SKSE.GetPluginVersion("NirnCommandNative") >= 0
                NirnCommandNative.RefreshDiscovery()
                SendCapabilities()
            endif
        endif
    endif
    if _domReady && SKSE.GetPluginVersion("NirnCommandNative") >= 0
        int discoveryRevision = NirnCommandNative.DiscoveryRevision()
        if discoveryRevision != _discoveryRevision
            _discoveryRevision = discoveryRevision
            SendDiscovery()
        endif
    endif
    _serviceBusy = false
EndFunction

Event OnItemAdded(Form akBaseItem, int aiItemCount, ObjectReference akItemReference, ObjectReference akSourceContainer)
    StorageUtil.FormListAdd(Game.GetPlayer(), "NirnCommand.Pending", akBaseItem, false)
    _dirty = true
    _lastChange = Utility.GetCurrentRealTime()
EndEvent

Event OnItemRemoved(Form akBaseItem, int aiItemCount, ObjectReference akItemReference, ObjectReference akDestContainer)
    StorageUtil.FormListAdd(Game.GetPlayer(), "NirnCommand.Pending", akBaseItem, false)
    _dirty = true
    _lastChange = Utility.GetCurrentRealTime()
EndEvent

Event OnUIModeExited(string eventName, string strArg, float numArg, Form sender)
    if (numArg as int) == _viewId
        if !Magelight.IsUIModeActive() || Magelight.GetUIModeView() != _viewId
            Magelight.ShowView(_viewId, false)
        endif
    endif
EndEvent

Event OnDomReady(string eventName, string strArg, float numArg, Form sender)
    if strArg == "NirnCommand"
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0
            NirnCommandNative.HotkeyReady(false)
        endif
        _viewGeneration += 1
        _domReady = false
        _viewId = 0
        Connect()
    endif
EndEvent

Function Connect()
    if _connecting || !Magelight.IsReady()
        return
    endif
    _connecting = true
    if !Magelight.RegisterMod("NirnCommand", "Nirn Command")
        _connecting = false
        return
    endif
    _viewId = Magelight.FindView("NirnCommand", "palette")
    if _viewId > 0
        bool catalogReady = Magelight.RegisterListener(_viewId, "catalog")
        bool executeReady = Magelight.RegisterListener(_viewId, "execute")
        bool persistReady = Magelight.RegisterListener(_viewId, "persist")
        bool hotkeyReady = Magelight.RegisterListener(_viewId, "hotkey")
        bool commandsReady = Magelight.RegisterListener(_viewId, "commands")
        bool overridesReady = Magelight.RegisterListener(_viewId, "overrides")
        bool worldReady = Magelight.RegisterListener(_viewId, "world")
        if !catalogReady || !executeReady || !persistReady || !hotkeyReady || !commandsReady || !overridesReady || !worldReady
            Debug.Trace("[NirnCommand] Listener registration failed: " + Magelight.GetLastError("NirnCommand"))
            _viewId = 0
            _connecting = false
            return
        endif
        _catalogSession = _viewGeneration + "-" + _epoch + "-" + Utility.GetCurrentRealTime()
        _trackingLastUIRequest = 0
        _worldContext = 0
        _worldRevision = 0
        _locationRevision = 0
        Magelight.Call(_viewId, "ncGameLoaded", _catalogSession)
        PublishTracking()
        SendCapabilities()
        Magelight.BindHotkey(_viewId, 0, 0)
        Magelight.Call(_viewId, "ncHotkey", _hotkey + "|" + _hotkeyModifiers)
        Magelight.Call(_viewId, "ncBridgeReady", "")
        Debug.Trace("[NirnCommand] Bridge ready, view " + _viewId)
    endif
    _connecting = false
EndFunction

Function SendCapabilities()
    if _viewId == 0
        return
    endif
    int consoleAvailable = 0
    int skyrimNetAvailable = 0
    if SKSE.GetPluginVersion("ConsoleUtilSSE") >= 0 || SKSE.GetPluginVersion("ConsoleUtil") >= 0
        consoleAvailable = 1
    endif
    if SKSE.GetPluginVersion("SkyrimNet") >= 0
        skyrimNetAvailable = 1
    endif
    Magelight.Call(_viewId, "ncCapabilities", consoleAvailable + "|" + skyrimNetAvailable)
EndFunction

bool Function ValidShortcut(int keyCode, int modifiers)
    if keyCode <= 0 || keyCode >= 256 || modifiers < 0 || modifiers > 63
        return false
    endif
    return keyCode != 42 && keyCode != 54 && keyCode != 29 && keyCode != 157 && keyCode != 56 && keyCode != 184
EndFunction

bool Function ValidHotkey(int keyCode, int modifiers)
    return ValidShortcut(keyCode, modifiers) && keyCode != 1 && keyCode != 201
EndFunction

bool Function ClosePalette()
    if _viewId == 0
        return true
    endif
    if Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId
        if !Magelight.ReleaseUIMode("NirnCommand") && Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId
            Debug.Trace("[NirnCommand] Could not release UI mode: " + Magelight.GetLastError("NirnCommand"))
            return false
        endif
    endif
    Magelight.ShowView(_viewId, false)
    return true
EndFunction

Event OnNativeHotkey(string eventName, string payload, float numArg, Form sender)
    int token = payload as int
    if SKSE.GetPluginVersion("NirnCommandNative") < 0 || !NirnCommandNative.ConsumeHotkey(token)
        Debug.Trace("[NirnCommand] Hotkey rejected token=" + token + " reason=expired-or-stale view=" + _viewId + " ready=" + _domReady)
        return
    endif
    if _viewId == 0 || !_domReady
        Debug.Trace("[NirnCommand] Hotkey rejected token=" + token + " reason=view-unavailable view=" + _viewId + " ready=" + _domReady)
        return
    endif
    if Magelight.IsUIModeActive()
        if Magelight.GetUIModeView() == _viewId
            ClosePalette()
        else
            Debug.Trace("[NirnCommand] Hotkey rejected token=" + token + " reason=ui-mode-busy view=" + _viewId)
        endif
    elseif !Utility.IsInMenuMode()
        if _activeEpoch == 0 && _initialScanEarliest > Utility.GetCurrentRealTime() + 2.0
            _initialScanEarliest = Utility.GetCurrentRealTime() + 2.0
        endif
        Debug.Trace("[NirnCommand] Opening requested view=" + _viewId + " initialEpoch=" + _activeEpoch)
        if !Magelight.RequestUIMode(_viewId, true)
            Debug.Trace("[NirnCommand] UI mode refused: " + Magelight.GetLastError("NirnCommand"))
            if !Magelight.IsUIModeActive() || Magelight.GetUIModeView() != _viewId
                Magelight.ShowView(_viewId, false)
            endif
        else
            Debug.Trace("[NirnCommand] UI mode request accepted token=" + token + " view=" + _viewId)
        endif
    else
        Debug.Trace("[NirnCommand] Hotkey rejected token=" + token + " reason=menu view=" + _viewId)
    endif
EndEvent

Event OnHotkey(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    HandleHotkey(payload, "legacy")
EndEvent

Function HandleHotkey(string payload, string request)
    if payload == "get"
        Magelight.Call(_viewId, "ncHotkey", _hotkey + "|" + _hotkeyModifiers)
        return
    endif
    if payload == "close"
        if Magelight.GetUIModeView() == _viewId
            ClosePalette()
        endif
        return
    endif
    int separator = StringUtil.Find(payload, "|")
    if separator < 1
        return
    endif
    int keyCode = StringUtil.Substring(payload, 0, separator) as int
    int modifiers = StringUtil.Substring(payload, separator + 1) as int
    if !ValidHotkey(keyCode, modifiers)
        Debug.Trace("[NirnCommand] Hotkey request " + request + " failed")
        Magelight.Call(_viewId, "ncHotkeyResult", request + "|failure")
        return
    endif
    if SKSE.GetPluginVersion("NirnCommandNative") < 0 || !NirnCommandNative.SetHotkey(keyCode, modifiers)
        Debug.Trace("[NirnCommand] Hotkey request " + request + " failed")
        Magelight.Call(_viewId, "ncHotkeyResult", request + "|failure")
        return
    endif
    UnregisterForKey(_hotkey)
    _hotkey = keyCode
    _hotkeyModifiers = modifiers
    NirnCommandNative.ConfigureHotkey(_hotkey, _hotkeyModifiers)
    Magelight.Call(_viewId, "ncHotkey", _hotkey + "|" + _hotkeyModifiers)
    Debug.Trace("[NirnCommand] Hotkey request " + request + " saved")
    Magelight.Call(_viewId, "ncHotkeyResult", request + "|ok")
EndFunction

Function ReportAction(string request, string result)
    Magelight.Call(_viewId, "ncActionResult", request + "|" + result)
    Debug.Trace("[NirnCommand] Request " + request + ": " + result)
    if result == "failure" || result == "unavailable"
        Debug.Notification("Nirn Command: action " + result)
    endif
EndFunction

Event OnCommands(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    if payload == "read"
        int count = -3
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0
            count = NirnCommandNative.LoadCommands()
        endif
        int sendView = _viewId
        int viewGeneration = _viewGeneration
        Magelight.Call(sendView, "ncCommandsBegin", count as string)
        int i = 0
        while i < count && sendView == _viewId && viewGeneration == _viewGeneration
            Magelight.Call(sendView, "ncCommandsChunk", i + "|" + NirnCommandNative.CommandsChunk(i))
            i += 1
            if i % 20 == 0
                Utility.WaitMenuMode(0.01)
            endif
        endwhile
        if sendView == _viewId && viewGeneration == _viewGeneration
            Magelight.Call(sendView, "ncCommandsDone", "")
        endif
        return
    endif
    int first = StringUtil.Find(payload, "|")
    int second = StringUtil.Find(payload, "|", first + 1)
    if first < 1
        return
    endif
    string operation = StringUtil.Substring(payload, 0, first)
    string request = StringUtil.Substring(payload, first + 1)
    if second > first
        request = StringUtil.Substring(payload, first + 1, second - first - 1)
    endif
    bool success = false
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        if operation == "begin"
            NirnCommandNative.BeginCommandsWrite()
            success = true
        elseif operation == "write" && second > first
            success = NirnCommandNative.AppendCommandsChunk(StringUtil.Substring(payload, second + 1))
        elseif operation == "commit"
            success = NirnCommandNative.CommitCommandsWrite()
        endif
    endif
    if success
        Magelight.Call(_viewId, "ncCommandsAck", request + "|ok")
    else
        Magelight.Call(_viewId, "ncCommandsAck", request + "|failure")
    endif
EndEvent

Event OnOverrides(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    if payload == "read"
        int count = -3
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0
            count = NirnCommandNative.LoadOverrides()
        endif
        int sendView = _viewId
        int viewGeneration = _viewGeneration
        Magelight.Call(sendView, "ncOverridesBegin", count as string)
        int i = 0
        while i < count && sendView == _viewId && viewGeneration == _viewGeneration
            Magelight.Call(sendView, "ncOverridesChunk", i + "|" + NirnCommandNative.OverridesChunk(i))
            i += 1
            if i % 20 == 0
                Utility.WaitMenuMode(0.01)
            endif
        endwhile
        if sendView == _viewId && viewGeneration == _viewGeneration
            Magelight.Call(sendView, "ncOverridesDone", "")
        endif
        return
    endif
    int first = StringUtil.Find(payload, "|")
    int second = StringUtil.Find(payload, "|", first + 1)
    if first < 1
        return
    endif
    string operation = StringUtil.Substring(payload, 0, first)
    string request = StringUtil.Substring(payload, first + 1)
    if second > first
        request = StringUtil.Substring(payload, first + 1, second - first - 1)
    endif
    bool success = false
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        if operation == "begin"
            NirnCommandNative.BeginOverridesWrite()
            success = true
        elseif operation == "write" && second > first
            success = NirnCommandNative.AppendOverridesChunk(StringUtil.Substring(payload, second + 1))
        elseif operation == "commit"
            success = NirnCommandNative.CommitOverridesWrite()
        endif
    endif
    if success
        Magelight.Call(_viewId, "ncOverridesAck", request + "|ok")
    else
        Magelight.Call(_viewId, "ncOverridesAck", request + "|failure")
    endif
EndEvent

Event OnPersist(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    string file = "NirnCommand/preferences"
    if payload == "read"
        int active = JsonUtil.GetIntValue(file, "activeSlot", 0)
        int count = JsonUtil.GetIntValue(file, "count" + active, 0)
        if active < 0 || active > 1 || count < 0 || count > 4096
            Magelight.Call(_viewId, "ncPersistBegin", "0|0")
            Magelight.Call(_viewId, "ncPersistDone", "")
            return
        endif
        Magelight.Call(_viewId, "ncPersistBegin", active + "|" + count)
        int i = 0
        while i < count
            Magelight.Call(_viewId, "ncPersistChunk", i + "|" + JsonUtil.GetStringValue(file, "part" + active + ":" + i, ""))
            i += 1
            if i % 20 == 0
                Utility.WaitMenuMode(0.01)
            endif
        endwhile
        Magelight.Call(_viewId, "ncPersistDone", "")
        return
    endif
    int a = StringUtil.Find(payload, "|")
    int b = StringUtil.Find(payload, "|", a + 1)
    int c = StringUtil.Find(payload, "|", b + 1)
    int d = StringUtil.Find(payload, "|", c + 1)
    if a < 0 || b < 0 || c < 0 || d < 0
        return
    endif
    string operation = StringUtil.Substring(payload, 0, a)
    string request = StringUtil.Substring(payload, a + 1, b - a - 1)
    int slot = StringUtil.Substring(payload, b + 1, c - b - 1) as int
    int index = StringUtil.Substring(payload, c + 1, d - c - 1) as int
    if slot < 0 || slot > 1 || index < 0 || index > 4096
        Magelight.Call(_viewId, "ncPersistAck", request + "|failure")
        return
    endif
    if operation == "write"
        string value = StringUtil.Substring(payload, d + 1)
        JsonUtil.SetStringValue(file, "part" + slot + ":" + index, value)
        Magelight.Call(_viewId, "ncPersistAck", request + "|ok")
    elseif operation == "commit"
        int oldSlot = JsonUtil.GetIntValue(file, "activeSlot", 0)
        JsonUtil.SetIntValue(file, "count" + slot, index)
        JsonUtil.SetIntValue(file, "activeSlot", slot)
        if JsonUtil.Save(file)
            Magelight.Call(_viewId, "ncPersistAck", request + "|ok")
        else
            JsonUtil.SetIntValue(file, "activeSlot", oldSlot)
            Magelight.Call(_viewId, "ncPersistAck", request + "|failure")
        endif
    endif
EndEvent

Function SendDiscovery()
    if _discoverySending
        _discoveryRequested = true
        return
    endif
    if !_domReady || _viewId == 0 || SKSE.GetPluginVersion("NirnCommandNative") < 0
        return
    endif
    _discoverySending = true
    int sendView = _viewId
    int generation = _epoch
    int viewGeneration = _viewGeneration
    Magelight.Call(sendView, "ncDiscoveryBegin", "")
    int count = NirnCommandNative.DiscoveryCount()
    int i = 0
    while i < count && sendView == _viewId && generation == _epoch && viewGeneration == _viewGeneration && _domReady
        Magelight.Call(sendView, "ncDiscoveryEntry", NirnCommandNative.DiscoveryEntry(i))
        i += 1
        if i % 20 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if sendView == _viewId && generation == _epoch && viewGeneration == _viewGeneration && _domReady
        Magelight.Call(sendView, "ncDiscoveryComplete", "")
    endif
    _discoverySending = false
    if _discoveryRequested && _domReady
        _discoveryRequested = false
        SendDiscovery()
    endif
EndFunction

Function PublishWorldNPCs()
    int context = NirnCommandNative.WorldContext()
    int revision = NirnCommandNative.WorldRevision()
    if context < 1 || revision < 1
        return
    endif
    int view = _viewId
    int viewGeneration = _viewGeneration
    string session = _catalogSession
    if context != _worldContext
        _worldContext = context
        _worldRevision = 0
        _locationRevision = 0
        Magelight.Call(view, "ncWorldContext", session + "|" + context)
    endif
    if revision == _worldRevision || Utility.GetCurrentRealTime() - _npcSentAt < 5.0
        return
    endif
    _worldSending = true
    int total = NirnCommandNative.WorldCount()
    if revision != NirnCommandNative.WorldRevision() || context != NirnCommandNative.WorldContext()
        _worldSending = false
        return
    endif
    _worldAttempt += 1
    int attempt = _worldAttempt
    _npcAttempt = attempt
    string prefix = session + "|" + context + "|npc|" + revision + "|" + attempt + "|"
    Magelight.Call(view, "ncWorldBegin", prefix + total)
    int i = 0
    while i < total && view == _viewId && viewGeneration == _viewGeneration && session == _catalogSession && context == NirnCommandNative.WorldContext() && revision == NirnCommandNative.WorldRevision()
        string row = NirnCommandNative.WorldEntry(i)
        if row == "" || StringUtil.GetLength(row) > 900
            Debug.Trace("[NirnCommand] World NPC row unavailable or too long index=" + i)
            _worldSending = false
            return
        endif
        Magelight.Call(view, "ncWorldEntry", prefix + i + "|" + row)
        i += 1
        if i % 20 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if i == total && view == _viewId && viewGeneration == _viewGeneration && session == _catalogSession && context == NirnCommandNative.WorldContext() && revision == NirnCommandNative.WorldRevision()
        Magelight.Call(view, "ncWorldComplete", session + "|" + context + "|npc|" + revision + "|" + attempt)
        _npcSentAt = Utility.GetCurrentRealTime()
        Debug.Trace("[NirnCommand] World NPC published context=" + context + " revision=" + revision + " entries=" + total)
    endif
    _worldSending = false
EndFunction

Function PublishWorldLocations()
    float publicationStarted = Utility.GetCurrentRealTime()
    int context = NirnCommandNative.WorldContext()
    int revision = NirnCommandNative.LocationRevision()
    if context < 1 || context != _worldContext || revision < 1 || revision == _locationRevision || _worldSending || Utility.GetCurrentRealTime() - _locationSentAt < 5.0
        return
    endif
    _worldSending = true
    int view = _viewId
    int viewGeneration = _viewGeneration
    string session = _catalogSession
    int total = NirnCommandNative.LocationCount()
    if revision != NirnCommandNative.LocationRevision()
        _worldSending = false
        return
    endif
    _worldAttempt += 1
    int attempt = _worldAttempt
    _locationAttempt = attempt
    string prefix = session + "|" + context + "|location|" + revision + "|" + attempt + "|"
    Magelight.Call(view, "ncWorldBegin", prefix + total)
    int i = 0
    while i < total && view == _viewId && viewGeneration == _viewGeneration && session == _catalogSession && context == NirnCommandNative.WorldContext() && revision == NirnCommandNative.LocationRevision()
        string row = NirnCommandNative.LocationEntry(i)
        if row == "" || StringUtil.GetLength(row) > 900
            Debug.Trace("[NirnCommand] World location row unavailable or too long index=" + i)
            _worldSending = false
            return
        endif
        Magelight.Call(view, "ncWorldEntry", prefix + i + "|" + row)
        i += 1
        if i % 20 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if i == total && view == _viewId && viewGeneration == _viewGeneration && session == _catalogSession && context == NirnCommandNative.WorldContext() && revision == NirnCommandNative.LocationRevision()
        Magelight.Call(view, "ncWorldComplete", session + "|" + context + "|location|" + revision + "|" + attempt)
        _locationSentAt = Utility.GetCurrentRealTime()
        Debug.Trace("[NirnCommand] World locations published context=" + context + " revision=" + revision + " entries=" + total + " seconds=" + (Utility.GetCurrentRealTime() - publicationStarted))
    endif
    _worldSending = false
EndFunction

bool Function TrackingStillValid()
    Quest tracking = TrackingQuest()
    if !_trackedActor || _trackedActor.IsDisabled() || _trackedActor.IsDeleted() || !tracking
        return false
    endif
    ReferenceAlias targetAlias = tracking.GetAlias(0) as ReferenceAlias
    return targetAlias && targetAlias.GetActorRef() == _trackedActor && tracking.IsRunning() && tracking.IsActive() && tracking.IsObjectiveDisplayed(10)
EndFunction

bool Function TrackingCancellationMatches(int targetForm)
    return _trackingConfirmed && _trackedActor && targetForm == _trackedActor.GetFormID()
EndFunction

Quest Function TrackingQuest()
    return Game.GetFormFromFile(0xD63, "NirnCommand.esp") as Quest
EndFunction

Function CleanupTracking()
    Quest tracking = TrackingQuest()
    if tracking
        ReferenceAlias targetAlias = tracking.GetAlias(0) as ReferenceAlias
        tracking.SetObjectiveDisplayed(10, false)
        tracking.SetActive(false)
        if targetAlias
            targetAlias.Clear()
        endif
        tracking.Stop()
    endif
    _trackedActor = None
    _trackingConfirmed = false
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        NirnCommandNative.ClearTrackingResolution(0)
    endif
EndFunction

Function PublishTracking()
    if _viewId == 0 || _catalogSession == ""
        return
    endif
    int formId = 0
    if _trackingConfirmed && _trackedActor
        formId = _trackedActor.GetFormID()
    endif
    _trackingRevision += 1
    Magelight.Call(_viewId, "ncTrackingState", _catalogSession + "|" + _trackingRevision + "|" + formId)
EndFunction

Function TrackNPC(int token, int context, string request, string session, int viewGeneration, int operation)
    int nativeRequest = NirnCommandNative.NextTrackingRequest()
    Debug.Trace("[NirnCommand] Tracking request=" + request + " session=" + session + " context=" + context + " token=" + token)
    if !ClosePalette()
        Debug.Trace("[NirnCommand] Tracking failed to release palette request=" + request)
        return
    endif
    int attempts = 0
    Utility.WaitMenuMode(0.1)
    while Magelight.IsUIModeActive() && attempts < 20 && operation == _trackingEpoch
        Utility.WaitMenuMode(0.1)
        attempts += 1
    endwhile
    if Magelight.IsUIModeActive() || session != _catalogSession || viewGeneration != _viewGeneration || context != NirnCommandNative.WorldContext() || operation != _trackingEpoch
        Debug.Trace("[NirnCommand] Tracking rejected stale or paused request=" + request)
        return
    endif
    NirnCommandNative.ResolveTrackingActor(token, context, nativeRequest)
    int status = 0
    attempts = 0
    while status == 0 && attempts < 40 && operation == _trackingEpoch && session == _catalogSession && context == NirnCommandNative.WorldContext()
        Utility.WaitMenuMode(0.05)
        status = NirnCommandNative.TrackingResolutionStatus(nativeRequest)
        attempts += 1
    endwhile
    if status != 1 || operation != _trackingEpoch || session != _catalogSession || viewGeneration != _viewGeneration || context != NirnCommandNative.WorldContext() || Magelight.IsUIModeActive()
        Debug.Trace("[NirnCommand] Tracking invalid or stale request=" + request + " status=" + status)
        NirnCommandNative.ClearTrackingResolution(nativeRequest)
        return
    endif
    Actor candidate = NirnCommandNative.TrackingResolvedActor(nativeRequest)
    NirnCommandNative.ClearTrackingResolution(nativeRequest)
    if !candidate || candidate.IsDead() || candidate.IsDisabled() || candidate.IsDeleted()
        Debug.Trace("[NirnCommand] Tracking invalid actor request=" + request)
        return
    endif
    Quest tracking = TrackingQuest()
    if !tracking
        Debug.Trace("[NirnCommand] Tracking quest missing request=" + request)
        return
    endif
    ReferenceAlias targetAlias = tracking.GetAlias(0) as ReferenceAlias
    if !targetAlias
        Debug.Trace("[NirnCommand] Tracking alias missing request=" + request)
        return
    endif
    if _trackedActor == candidate && tracking.IsRunning() && tracking.IsActive() && tracking.IsObjectiveDisplayed(10) && targetAlias.GetActorRef() == candidate
        Debug.Trace("[NirnCommand] Tracking same target request=" + request + " ref=" + candidate.GetFormID())
        PublishTracking()
        return
    endif
    if _trackedActor
        Debug.Trace("[NirnCommand] Tracking replacement request=" + request + " old=" + _trackedActor.GetFormID() + " new=" + candidate.GetFormID())
    endif
    _trackedActor = None
    _trackingConfirmed = false
    tracking.SetObjectiveDisplayed(10, false)
    tracking.SetActive(false)
    targetAlias.Clear()
    PublishTracking()
    if !tracking.IsRunning()
        Debug.Trace("[NirnCommand] Tracking quest startup request=" + request)
        if !tracking.Start() || !tracking.IsRunning()
            Debug.Trace("[NirnCommand] Tracking quest startup failed request=" + request)
            if operation == _trackingEpoch
                CleanupTracking()
            endif
            return
        endif
    endif
    if operation != _trackingEpoch || session != _catalogSession || viewGeneration != _viewGeneration || context != NirnCommandNative.WorldContext() || Magelight.IsUIModeActive()
        Debug.Trace("[NirnCommand] Tracking rejected stale startup request=" + request)
        if operation == _trackingEpoch || !_trackingBusy || _trackingOwner == operation
            CleanupTracking()
        endif
        return
    endif
    if candidate.IsDead() || candidate.IsDisabled() || candidate.IsDeleted()
        Debug.Trace("[NirnCommand] Tracking target invalid after startup request=" + request)
        CleanupTracking()
        return
    endif
    targetAlias.ForceRefTo(candidate)
    Debug.Trace("[NirnCommand] Tracking alias assigned request=" + request + " ref=" + candidate.GetFormID())
    if targetAlias.GetActorRef() != candidate
        Debug.Trace("[NirnCommand] Tracking alias verification failed request=" + request)
        CleanupTracking()
        return
    endif
    tracking.SetObjectiveDisplayed(10, true, true)
    tracking.SetActive(true)
    if !tracking.IsObjectiveDisplayed(10) || !tracking.IsActive() || targetAlias.GetActorRef() != candidate
        Debug.Trace("[NirnCommand] Tracking objective activation failed request=" + request)
        CleanupTracking()
        return
    endif
    _trackedActor = candidate
    _trackingConfirmed = true
    Debug.Trace("[NirnCommand] Tracking objective active request=" + request + " ref=" + candidate.GetFormID())
    PublishTracking()
EndFunction

Event OnWorld(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0 || SKSE.GetPluginVersion("NirnCommandNative") < 0
        return
    endif
    if payload == "diagnose|" + _catalogSession && _catalogSession != ""
        if ClosePalette()
            NirnCommandNative.DiagnoseLocations()
            Debug.Notification("Known Locations diagnostic started")
        endif
        return
    endif
    string uiPrefix = "tracking-ui|" + _catalogSession + "|" + _worldContext + "|"
    if _worldContext > 0 && StringUtil.Find(payload, uiPrefix) == 0
        Debug.Trace("[NirnCommand] Tracking UI match context=" + _worldContext + " form|matches|entries=" + StringUtil.Substring(payload, StringUtil.GetLength(uiPrefix)))
        return
    endif
    string trackingPrefix = "track|" + _catalogSession + "|" + _worldContext + "|"
    if _worldContext > 0 && StringUtil.Find(payload, trackingPrefix) == 0
        string arguments = StringUtil.Substring(payload, StringUtil.GetLength(trackingPrefix))
        int separator = StringUtil.Find(arguments, "|")
        if separator > 0
            int token = StringUtil.Substring(arguments, 0, separator) as int
            string request = StringUtil.Substring(arguments, separator + 1)
            int requestNumber = request as int
            if token != 0 && requestNumber > _trackingLastUIRequest && !_trackingBusy && Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId
                _trackingLastUIRequest = requestNumber
                _trackingEpoch += 1
                int operation = _trackingEpoch
                _trackingOwner = operation
                _trackingBusy = true
                TrackNPC(token, _worldContext, request, _catalogSession, _viewGeneration, operation)
                if _trackingOwner == operation
                    _trackingBusy = false
                    _trackingOwner = 0
                endif
            else
                Debug.Trace("[NirnCommand] Tracking rejected busy or inactive request=" + request)
            endif
        endif
        return
    endif
    string stopPrefix = "stop-tracking|" + _catalogSession + "|" + _worldContext + "|"
    if _worldContext > 0 && StringUtil.Find(payload, stopPrefix) == 0
        string request = StringUtil.Substring(payload, StringUtil.GetLength(stopPrefix))
        int targetSeparator = StringUtil.Find(request, "|")
        if targetSeparator >= 0
            int targetForm = StringUtil.Substring(request, targetSeparator + 1) as int
            request = StringUtil.Substring(request, 0, targetSeparator)
            if !TrackingCancellationMatches(targetForm)
                Debug.Trace("[NirnCommand] Tracking rejected stale target cancellation request=" + request + " ref=" + targetForm)
                return
            endif
        endif
        int requestNumber = request as int
        if requestNumber <= _trackingLastUIRequest || !Magelight.IsUIModeActive() || Magelight.GetUIModeView() != _viewId
            Debug.Trace("[NirnCommand] Tracking rejected stale cancellation request=" + request)
            return
        endif
        _trackingLastUIRequest = requestNumber
        _trackingEpoch += 1
        Debug.Trace("[NirnCommand] Tracking cancellation request=" + request)
        CleanupTracking()
        PublishTracking()
        return
    endif
    if StringUtil.Find(payload, "track|") == 0 || StringUtil.Find(payload, "stop-tracking|") == 0
        Debug.Trace("[NirnCommand] Tracking rejected stale request=" + payload)
        return
    endif
    string npcAck = "applied|" + _catalogSession + "|" + _worldContext + "|npc|" + NirnCommandNative.WorldRevision() + "|" + _npcAttempt
    string locationAck = "applied|" + _catalogSession + "|" + _worldContext + "|location|" + NirnCommandNative.LocationRevision() + "|" + _locationAttempt
    if payload == npcAck && _npcAttempt > 0
        _worldRevision = NirnCommandNative.WorldRevision()
        return
    elseif payload == locationAck && _locationAttempt > 0
        _locationRevision = NirnCommandNative.LocationRevision()
        return
    endif
    string mapPrefix = "map|" + _catalogSession + "|" + _worldContext + "|"
    if _worldContext > 0 && StringUtil.Find(payload, mapPrefix) == 0
        int mapToken = StringUtil.Substring(payload, StringUtil.GetLength(mapPrefix)) as int
        string mapSession = _catalogSession
        int mapContext = _worldContext
        if mapToken != 0 && ClosePalette()
            Utility.WaitMenuMode(0.1)
            if mapSession == _catalogSession && mapContext == NirnCommandNative.WorldContext()
                int mapRequest = NirnCommandNative.WorldOpenMap(mapToken, mapContext)
                while NirnCommandNative.WorldStepMap(mapRequest) == 1
                    Utility.WaitMenuMode(0.05)
                endwhile
            endif
        endif
        return
    endif
    string prefix = "inspect|" + _catalogSession + "|" + _worldContext + "|npc|"
    string kind = "npc"
    if StringUtil.Find(payload, prefix) != 0
        kind = "location"
        prefix = "inspect|" + _catalogSession + "|" + _worldContext + "|location|"
    endif
    if _worldContext < 1 || StringUtil.Find(payload, prefix) != 0
        return
    endif
    string tokenAndRequest = StringUtil.Substring(payload, StringUtil.GetLength(prefix))
    int requestSplit = StringUtil.Find(tokenAndRequest, "|")
    if requestSplit < 1
        return
    endif
    string tokenText = StringUtil.Substring(tokenAndRequest, 0, requestSplit)
    string worldRequest = StringUtil.Substring(tokenAndRequest, requestSplit + 1)
    int token = tokenText as int
    if token == 0
        return
    endif
    if _worldInspectBusy
        Magelight.Call(_viewId, "ncWorldInspect", _catalogSession + "|" + _worldContext + "|" + kind + "|" + tokenText + "|" + worldRequest + "|{\"available\":false}")
        return
    endif
    _worldInspectBusy = true
    int context = _worldContext
    int view = _viewId
    int viewGeneration = _viewGeneration
    string session = _catalogSession
    if kind == "npc"
        NirnCommandNative.WorldInspect(token)
    else
        NirnCommandNative.LocationInspect(token)
    endif
    int attempts = 0
    string result = ""
    while attempts < 30 && result == "" && session == _catalogSession && viewGeneration == _viewGeneration && context == NirnCommandNative.WorldContext()
        Utility.WaitMenuMode(0.05)
        if kind == "npc"
            result = NirnCommandNative.WorldInspection(token)
        else
            result = NirnCommandNative.LocationInspection(token)
        endif
        attempts += 1
    endwhile
    if session == _catalogSession && view == _viewId && viewGeneration == _viewGeneration && context == NirnCommandNative.WorldContext()
        if result == ""
            result = "{\"available\":false}"
        endif
        Magelight.Call(view, "ncWorldInspect", session + "|" + context + "|" + kind + "|" + tokenText + "|" + worldRequest + "|" + result)
    endif
    if viewGeneration == _viewGeneration
        _worldInspectBusy = false
    endif
EndEvent

Event OnCatalog(string eventName, string strArg, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        Debug.Trace("[NirnCommand] Catalog callback rejected view=" + (numArg as int) + " expected=" + _viewId)
        return
    endif
    if strArg == "tick|" + _catalogSession && _catalogSession != ""
        if Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId
            ServiceCatalog()
        endif
        return
    elseif StringUtil.Find(strArg, "applied|") == 0
        int separator = StringUtil.Find(strArg, "|", 8)
        if separator < 0 || StringUtil.Substring(strArg, 8, separator - 8) != _catalogSession
            return
        endif
        int attemptSeparator = StringUtil.Find(strArg, "|", separator + 1)
        int applied = 0
        if attemptSeparator >= 0
            applied = StringUtil.Substring(strArg, separator + 1, attemptSeparator - separator - 1) as int
            int acknowledgedAttempt = StringUtil.Substring(strArg, attemptSeparator + 1) as int
            if acknowledgedAttempt != _transferAttempt || applied != _transferEpoch
                Debug.Trace("[NirnCommand] Catalog acknowledgment rejected attempt=" + acknowledgedAttempt)
                return
            endif
        else
            applied = StringUtil.Substring(strArg, separator + 1) as int
        endif
        if applied == _activeEpoch
            _uiEpoch = applied
            if applied == _transferEpoch
                Debug.Trace("[NirnCommand] Catalog acknowledged epoch=" + applied + " seconds=" + (Utility.GetCurrentRealTime() - _transferStarted))
            endif
        endif
        return
    elseif StringUtil.Find(strArg, "ready|") == 0
        string readySession = StringUtil.Substring(strArg, 6)
        if readySession == ""
            return
        endif
        if readySession != _catalogSession
            Debug.Trace("[NirnCommand] Catalog ready rejected stale session=" + readySession)
            return
        endif
        if _domReady
            return
        endif
        _domReady = true
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0
            NirnCommandNative.HotkeyReady(true)
        endif
        Debug.Trace("[NirnCommand] Catalog ready session=" + _catalogSession + " epoch=" + _activeEpoch)
        SendCatalog()
        SendDiscovery()
        return
    elseif strArg == "refresh|" + _catalogSession && _catalogSession != ""
        _fullScan = true
        _dirty = true
        _lastChange = 0.0
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0
            NirnCommandNative.RefreshDiscovery()
        endif
    elseif strArg != "snapshot|" + _catalogSession || _catalogSession == ""
        Debug.Trace("[NirnCommand] Catalog request rejected session mismatch")
        return
    endif
    SendCatalog()
EndEvent

Function SendCatalog()
    if _sending
        _snapshotRequested = true
        return
    endif
    if _activeEpoch == 0 || !_domReady || _viewId == 0
        Debug.Trace("[NirnCommand] Catalog waiting epoch=" + _activeEpoch + " ready=" + _domReady + " view=" + _viewId)
        return
    endif
    PublishCatalog(_slot, _activeEpoch, false)
EndFunction

Function PublishCatalog(int sendSlot, int sendEpoch, bool commit)
    if _sending
        return
    endif
    if !_domReady
        if commit
            _previousEpoch = _activeEpoch
            _previousSlot = _slot
            _slot = sendSlot
            _activeEpoch = sendEpoch
            _lastScan = Utility.GetCurrentRealTime()
        endif
        return
    endif
    _sending = true
    float transferStarted = Utility.GetCurrentRealTime()
    _transferStarted = transferStarted
    _transferEpoch = sendEpoch
    _transferAttempt += 1
    int attempt = _transferAttempt
    int scanEpoch = _epoch
    int sendView = _viewId
    int viewGeneration = _viewGeneration
    string list = "NirnCommand.Forms" + sendSlot
    Actor player = Game.GetPlayer()
    if commit
        _previousEpoch = _activeEpoch
        _previousSlot = _slot
        _slot = sendSlot
        _activeEpoch = sendEpoch
        _lastScan = Utility.GetCurrentRealTime()
    endif
    int i = 0
    int total = StorageUtil.FormListCount(player, list)
    Debug.Trace("[NirnCommand] Catalog publication start session=" + _catalogSession + " epoch=" + sendEpoch + " entries=" + total)
    int batchIndex = 0
    int payloadBytes = 0
    string batch = ""
    int categoryIndex = 0
    while categoryIndex < 2 && scanEpoch == _epoch && sendView == _viewId && viewGeneration == _viewGeneration && _domReady
    string category = "spell"
    if categoryIndex == 1
        category = "item"
    endif
    string transferPrefix = _catalogSession + "|" + sendEpoch + "|" + attempt + "|" + category + "|"
    Magelight.Call(sendView, "ncTransferBegin", transferPrefix)
    i = 0
    batchIndex = 0
    batch = ""
    while sendView > 0 && i < total && scanEpoch == _epoch && sendView == _viewId && viewGeneration == _viewGeneration && _domReady
        Form item = StorageUtil.FormListGet(player, list, i)
        if item && ((category == "spell" && (item as Spell)) || (category == "item" && !(item as Spell)))
            string kind = "item"
            if item as Spell
                kind = "spell"
            endif
            string row = NirnCommandNative.CatalogEntry(kind, sendEpoch + ":" + item.GetFormID(), PersistentKey(item, kind), item.GetName())
            payloadBytes += StringUtil.GetLength(row)
            if StringUtil.GetLength(batch) + StringUtil.GetLength(row) + 1 > 960 && batch != ""
                Magelight.Call(sendView, "ncTransferBatch", transferPrefix + batchIndex + "|" + batch)
                batchIndex += 1
                batch = ""
            endif
            if StringUtil.GetLength(row) > 960
                string[] fragments = NirnCommandNative.CatalogFragments(row)
                int part = 0
                while part < fragments.Length && scanEpoch == _epoch && viewGeneration == _viewGeneration && _domReady
                    Magelight.Call(sendView, "ncTransferFragment", transferPrefix + batchIndex + "|" + part + "|" + fragments.Length + "|" + fragments[part])
                    batchIndex += 1
                    part += 1
                endwhile
            else
                if batch != ""
                    batch += "\n"
                endif
                batch += row
            endif
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if scanEpoch == _epoch && sendView == _viewId && viewGeneration == _viewGeneration && _domReady
            if batch != ""
                Magelight.Call(sendView, "ncTransferBatch", transferPrefix + batchIndex + "|" + batch)
                batchIndex += 1
            endif
            Magelight.Call(sendView, "ncTransferComplete", transferPrefix + batchIndex)
            Debug.Trace("[NirnCommand] Catalog publication complete session=" + _catalogSession + " epoch=" + sendEpoch + " category=" + category + " batches=" + batchIndex)
            categoryIndex += 1
    endif
    endwhile
    if categoryIndex < 2 && scanEpoch == _epoch
        Debug.Trace("[NirnCommand] Catalog publication interrupted epoch=" + sendEpoch + " view=" + sendView + " currentView=" + _viewId + " ready=" + _domReady)
        _snapshotRequested = true
    endif
    _sending = false
    if _snapshotRequested && _domReady
        _snapshotRequested = false
        SendCatalog()
    endif
EndFunction

bool Function PublishInventoryDelta(Form[] changed, int nextSlot, int nextEpoch)
    if !_domReady || _sending || _activeEpoch == 0 || _uiEpoch != _activeEpoch || changed.Length == 0 || changed.Length > 8
        return false
    endif
    Actor player = Game.GetPlayer()
    string oldList = "NirnCommand.Forms" + _slot
    string newList = "NirnCommand.Forms" + nextSlot
    int i = 0
    int expectedCount = StorageUtil.FormListCount(player, oldList)
    while i < changed.Length
        Form item = changed[i]
        if !item
            return false
        endif
        bool oldPresent = StorageUtil.FormListFind(player, oldList, item) >= 0
        bool newPresent = StorageUtil.FormListFind(player, newList, item) >= 0
        if oldPresent && !newPresent
            expectedCount -= 1
        elseif !oldPresent && newPresent
            expectedCount += 1
        endif
        if !oldPresent && newPresent
            string row = NirnCommandNative.CatalogEntry("item", nextEpoch + ":" + item.GetFormID(), PersistentKey(item, "item"), item.GetName())
            if StringUtil.GetLength(row) > 800
                return false
            endif
        endif
        i += 1
    endwhile
    if expectedCount != StorageUtil.FormListCount(player, newList)
        return false
    endif
    _sending = true
    int oldEpoch = _activeEpoch
    int viewGeneration = _viewGeneration
    int sendView = _viewId
    Magelight.Call(sendView, "ncDeltaBegin", _catalogSession + "|" + oldEpoch + "|" + nextEpoch)
    int sequence = 0
    i = 0
    while i < changed.Length && viewGeneration == _viewGeneration && _domReady
        Form item = changed[i]
        if item
            bool wasPresent = StorageUtil.FormListFind(player, oldList, item) >= 0
            bool isPresent = StorageUtil.FormListFind(player, newList, item) >= 0
            if wasPresent && !isPresent
                Magelight.Call(sendView, "ncDeltaRemove", _catalogSession + "|" + nextEpoch + "|" + sequence + "|" + item.GetFormID())
                sequence += 1
            elseif !wasPresent && isPresent
                string row = NirnCommandNative.CatalogEntry("item", nextEpoch + ":" + item.GetFormID(), PersistentKey(item, "item"), item.GetName())
                Magelight.Call(sendView, "ncCatalogBatch", _catalogSession + "|" + nextEpoch + "|" + sequence + "|" + row)
                sequence += 1
            endif
        endif
        i += 1
    endwhile
    bool success = viewGeneration == _viewGeneration && _domReady && sendView == _viewId
    if success
        _previousEpoch = oldEpoch
        _previousSlot = _slot
        _slot = nextSlot
        _activeEpoch = nextEpoch
        _lastScan = Utility.GetCurrentRealTime()
        Magelight.Call(sendView, "ncCatalogComplete", _catalogSession + "|" + nextEpoch + "|" + sequence)
        Debug.Trace("[NirnCommand] Inventory delta operations=" + sequence)
    endif
    _sending = false
    return success
EndFunction

bool Function SpellCatalogChanged()
    Actor player = Game.GetPlayer()
    string candidate = "NirnCommand.SpellCheck"
    string snapshot = "NirnCommand.SpellSnapshot"
    StorageUtil.FormListClear(player, candidate)
    int i = 0
    while i < player.GetSpellCount()
        Spell known = player.GetNthSpell(i)
        if known && NirnCommandNative.IsHandSpell(known) && player.HasSpell(known) && known.GetName() != ""
            StorageUtil.FormListAdd(player, candidate, known, false)
        endif
        i += 1
    endwhile
    ActorBase base = player.GetActorBase()
    if base
        i = 0
        while i < base.GetSpellCount()
            Spell known = base.GetNthSpell(i)
            if known && NirnCommandNative.IsHandSpell(known) && known.GetName() != ""
                StorageUtil.FormListAdd(player, candidate, known, false)
            endif
            i += 1
        endwhile
    endif
    int count = StorageUtil.FormListCount(player, candidate)
    if count != StorageUtil.FormListCount(player, snapshot)
        return true
    endif
    i = 0
    while i < count
        if StorageUtil.FormListFind(player, snapshot, StorageUtil.FormListGet(player, candidate, i)) < 0
            return true
        endif
        i += 1
    endwhile
    return false
EndFunction

Function ScanCatalog()
    if _scanning || _sending
        return
    endif
    ; Do not overwrite the prior slot until the page accepted the active generation.
    if _domReady && _previousEpoch != 0 && _uiEpoch != _activeEpoch
        SendCatalog()
        return
    endif
    _scanning = true
    float scanStarted = Utility.GetCurrentRealTime()
    _dirty = false
    _epoch += 1
    int scanEpoch = _epoch
    int nextSlot = 1 - _slot
    string list = "NirnCommand.Forms" + nextSlot
    Actor player = Game.GetPlayer()
    Debug.Trace("[NirnCommand] Catalog scan start epoch=" + scanEpoch + " full=" + _fullScan + " session=" + _catalogSession)
    if _previousSlot == nextSlot
        _previousEpoch = 0
    endif
    StorageUtil.FormListClear(player, list)
    Form[] changed = StorageUtil.FormListToArray(player, "NirnCommand.Pending")
    StorageUtil.FormListClear(player, "NirnCommand.Pending")
    int i = 0
    int total = 0
    bool scanInventoryFully = _fullScan || _activeEpoch == 0
    if scanInventoryFully
        _fullScan = false
        Form[] inventory = NirnCommandNative.InventoryForms(player)
        total = inventory.Length
        while i < total && scanEpoch == _epoch
            Form item = inventory[i]
            if item && item.GetName() != ""
                ; The native inventory snapshot contains one entry per base form.
                StorageUtil.FormListAdd(player, list, item)
            endif
            i += 1
            if i % 40 == 0
                Utility.WaitMenuMode(0.01)
            endif
        endwhile
    else
        string activeList = "NirnCommand.Forms" + _slot
        Form[] existing = StorageUtil.FormListToArray(player, activeList)
        total = existing.Length
        while i < total && scanEpoch == _epoch
            Form item = existing[i]
            if item && !(item as Spell)
                ; The active generation already contains unique base forms.
                StorageUtil.FormListAdd(player, list, item)
            endif
            i += 1
        endwhile
        i = 0
        while i < changed.Length && scanEpoch == _epoch
            Form changedItem = changed[i]
            if changedItem && ((changedItem as Weapon) || (changedItem as Armor) || (changedItem as Potion))
                if player.GetItemCount(changedItem) > 0 && changedItem.GetName() != ""
                    StorageUtil.FormListAdd(player, list, changedItem, false)
                else
                    StorageUtil.FormListRemove(player, list, changedItem, true)
                endif
            endif
            i += 1
        endwhile
    endif
    float inventorySeconds = Utility.GetCurrentRealTime() - scanStarted
    float spellsStarted = Utility.GetCurrentRealTime()
    string spellList = "NirnCommand.ScanSpells"
    StorageUtil.FormListClear(player, spellList)
    ; Inventory events do not require re-enumerating the player's spellbook.
    ; Periodic spell checks call this function with an empty pending list.
    bool cachedSpells = changed.Length > 0 && _activeEpoch != 0 && !scanInventoryFully
    if cachedSpells
        Form[] spells = StorageUtil.FormListToArray(player, "NirnCommand.SpellSnapshot")
        i = 0
        while i < spells.Length && scanEpoch == _epoch
            if spells[i]
                StorageUtil.FormListAdd(player, list, spells[i], false)
                StorageUtil.FormListAdd(player, spellList, spells[i], false)
            endif
            i += 1
        endwhile
    else
    i = 0
    total = player.GetSpellCount()
    while i < total && scanEpoch == _epoch
        Spell knownSpell = player.GetNthSpell(i)
        if knownSpell && NirnCommandNative.IsHandSpell(knownSpell) && player.HasSpell(knownSpell) && knownSpell.GetName() != ""
            StorageUtil.FormListAdd(player, list, knownSpell, false)
            StorageUtil.FormListAdd(player, spellList, knownSpell, false)
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    ActorBase playerBase = player.GetActorBase()
    if playerBase
        i = 0
        total = playerBase.GetSpellCount()
        while i < total && scanEpoch == _epoch
            Spell baseSpell = playerBase.GetNthSpell(i)
            if baseSpell && NirnCommandNative.IsHandSpell(baseSpell) && baseSpell.GetName() != "" && StorageUtil.FormListFind(player, list, baseSpell) < 0
                StorageUtil.FormListAdd(player, list, baseSpell)
                StorageUtil.FormListAdd(player, spellList, baseSpell, false)
            endif
            i += 1
            if i % 40 == 0
                Utility.WaitMenuMode(0.01)
            endif
        endwhile
    endif
    endif
    if scanEpoch == _epoch
        if !cachedSpells
            _lastSpellCheck = Utility.GetCurrentRealTime()
        endif
        int spellCount = StorageUtil.FormListCount(player, spellList)
        int entryCount = StorageUtil.FormListCount(player, list)
        Debug.Trace("[NirnCommand] Catalog scan complete epoch=" + scanEpoch + " items=" + (entryCount - spellCount) + " spells=" + spellCount + " inventorySeconds=" + inventorySeconds + " spellsSeconds=" + (Utility.GetCurrentRealTime() - spellsStarted))
        bool identical = StorageUtil.FormListCount(player, list) == StorageUtil.FormListCount(player, "NirnCommand.Forms" + _slot)
        i = 0
        while identical && i < StorageUtil.FormListCount(player, list)
            if StorageUtil.FormListGet(player, list, i) != StorageUtil.FormListGet(player, "NirnCommand.Forms" + _slot, i)
                identical = false
            endif
            i += 1
        endwhile
        if identical
            if _activeEpoch == 0
                ; The saved slot is usable only after every current form matched.
                PublishCatalog(_slot, scanEpoch, true)
            endif
            if _activeEpoch != 0
                StorageUtil.FormListCopy(player, "NirnCommand.SpellSnapshot", StorageUtil.FormListToArray(player, spellList))
                _lastScan = Utility.GetCurrentRealTime()
            else
                _fullScan = true
                _dirty = true
            endif
            _scanning = false
        elseif !_sending && (!Magelight.IsUIModeActive() || Magelight.GetUIModeView() == _viewId)
            bool deltaPublished = false
            if cachedSpells
                deltaPublished = PublishInventoryDelta(changed, nextSlot, scanEpoch)
            endif
            if !deltaPublished
                PublishCatalog(nextSlot, scanEpoch, true)
            endif
            if _activeEpoch == scanEpoch
                StorageUtil.FormListCopy(player, "NirnCommand.SpellSnapshot", StorageUtil.FormListToArray(player, spellList))
            else
                ; A failed publication consumed the pending events. Reconcile from the player.
                _fullScan = true
                _dirty = true
            endif
            _scanning = false
        else
            _fullScan = true
            _dirty = true
            _scanning = false
        endif
    endif
EndFunction

string Function PersistentKey(Form target, string kind)
    int id = target.GetFormID()
    int modIndex = Math.LogicalAnd(Math.RightShift(id, 24), 255)
    string plugin = ""
    int localId = 0
    if modIndex == 255
        return ""
    elseif modIndex == 254
        plugin = Game.GetLightModName(Math.LogicalAnd(Math.RightShift(id, 12), 4095))
        localId = Math.LogicalAnd(id, 4095)
    else
        plugin = Game.GetModName(modIndex)
        localId = Math.LogicalAnd(id, 16777215)
    endif
    if plugin == "" || Game.GetFormFromFile(localId, plugin) != target
        return ""
    endif
    return "game:" + kind + ":" + plugin + ":" + localId
EndFunction

bool Function IsAvailableSpell(Actor player, Spell target)
    if player.HasSpell(target)
        return true
    endif
    ActorBase playerBase = player.GetActorBase()
    if playerBase
        int i = 0
        while i < playerBase.GetSpellCount()
            if playerBase.GetNthSpell(i) == target
                return true
            endif
            i += 1
        endwhile
    endif
    return false
EndFunction

Event OnExecute(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    int split = StringUtil.Find(payload, "|")
    if split < 1
        return
    endif
    string request = StringUtil.Substring(payload, 0, split)
    payload = StringUtil.Substring(payload, split + 1)
    if StringUtil.Find(payload, "hotkey:") == 0
        HandleHotkey(StringUtil.Substring(payload, 7), request)
        return
    endif
    if StringUtil.Find(payload, "skyrimnet:") == 0 && SKSE.GetPluginVersion("SkyrimNet") < 0
        Magelight.Call(_viewId, "ncActionResult", request + "|missing_plugin")
        return
    elseif StringUtil.Find(payload, "console:") == 0 && SKSE.GetPluginVersion("ConsoleUtilSSE") < 0 && SKSE.GetPluginVersion("ConsoleUtil") < 0
        Magelight.Call(_viewId, "ncActionResult", request + "|missing_plugin")
        return
    endif
    if !ClosePalette()
        ReportAction(request, "failure")
        return
    endif
    Utility.WaitMenuMode(0.1)
    Debug.Trace("[NirnCommand] Dispatching request " + request)
    if StringUtil.Find(payload, "console:") == 0
        if SKSE.GetPluginVersion("ConsoleUtilSSE") >= 0 || SKSE.GetPluginVersion("ConsoleUtil") >= 0
            NirnCommand_ConsoleAdapter.Execute(StringUtil.Substring(payload, 8))
            ReportAction(request, "sent")
        else
            ReportAction(request, "unavailable")
        endif
        return
    elseif StringUtil.Find(payload, "skyrimnet:") == 0
        if SKSE.GetPluginVersion("SkyrimNet") < 0
            ReportAction(request, "unavailable")
            return
        endif
        int result = NirnCommand_SkyrimNetAdapter.Trigger(StringUtil.Substring(payload, 10))
        if result == 0 && payload == "skyrimnet:dashboard"
            ReportAction(request, "success")
        elseif result == 0
            ReportAction(request, "sent")
        else
            ReportAction(request, "failure")
        endif
        return
    elseif StringUtil.Find(payload, "shortcut2:") == 0
        int delim2 = StringUtil.Find(payload, ":", 10)
        if delim2 > 10
            int key2 = StringUtil.Substring(payload, 10, delim2 - 10) as int
            int mods2 = StringUtil.Substring(payload, delim2 + 1) as int
            if ValidShortcut(key2, mods2)
                if Math.LogicalAnd(mods2, 1) != 0
                    Input.HoldKey(42)
                endif
                if Math.LogicalAnd(mods2, 2) != 0
                    Input.HoldKey(54)
                endif
                if Math.LogicalAnd(mods2, 4) != 0
                    Input.HoldKey(29)
                endif
                if Math.LogicalAnd(mods2, 8) != 0
                    Input.HoldKey(157)
                endif
                if Math.LogicalAnd(mods2, 16) != 0
                    Input.HoldKey(56)
                endif
                if Math.LogicalAnd(mods2, 32) != 0
                    Input.HoldKey(184)
                endif
                Input.TapKey(key2)
                if Math.LogicalAnd(mods2, 32) != 0
                    Input.ReleaseKey(184)
                endif
                if Math.LogicalAnd(mods2, 16) != 0
                    Input.ReleaseKey(56)
                endif
                if Math.LogicalAnd(mods2, 8) != 0
                    Input.ReleaseKey(157)
                endif
                if Math.LogicalAnd(mods2, 4) != 0
                    Input.ReleaseKey(29)
                endif
                if Math.LogicalAnd(mods2, 2) != 0
                    Input.ReleaseKey(54)
                endif
                if Math.LogicalAnd(mods2, 1) != 0
                    Input.ReleaseKey(42)
                endif
                ReportAction(request, "sent")
                return
            endif
        endif
        ReportAction(request, "failure")
        return
    elseif StringUtil.Find(payload, "shortcut:") == 0
        int delim = StringUtil.Find(payload, ":", 9)
        if delim > 9
            int keyCode = StringUtil.Substring(payload, 9, delim - 9) as int
            int modifiers = StringUtil.Substring(payload, delim + 1) as int
            if keyCode > 0 && keyCode < 256
                if Math.LogicalAnd(modifiers, 1) != 0
                    Input.HoldKey(42)
                endif
                if Math.LogicalAnd(modifiers, 2) != 0
                    Input.HoldKey(29)
                endif
                if Math.LogicalAnd(modifiers, 4) != 0
                    Input.HoldKey(56)
                endif
                Input.TapKey(keyCode)
                if Math.LogicalAnd(modifiers, 4) != 0
                    Input.ReleaseKey(56)
                endif
                if Math.LogicalAnd(modifiers, 2) != 0
                    Input.ReleaseKey(29)
                endif
                if Math.LogicalAnd(modifiers, 1) != 0
                    Input.ReleaseKey(42)
                endif
                ReportAction(request, "sent")
                return
            endif
        endif
        ReportAction(request, "failure")
        return
    endif
    int first = StringUtil.Find(payload, ":")
    int second = StringUtil.Find(payload, ":", first + 1)
    if first < 0 || second < 0
        Debug.Trace("[NirnCommand] Unsupported action")
        ReportAction(request, "failure")
        return
    endif
    string kind = StringUtil.Substring(payload, 0, first)
    int epoch = StringUtil.Substring(payload, first + 1, second - first - 1) as int
    int token = StringUtil.Substring(payload, second + 1) as int
    if (epoch != _activeEpoch && epoch != _previousEpoch) || epoch == 0
        Debug.Trace("[NirnCommand] Stale catalog token")
        ReportAction(request, "unavailable")
        return
    endif
    Actor player = Game.GetPlayer()
    int targetSlot = _slot
    if epoch == _previousEpoch
        targetSlot = _previousSlot
    endif
    ; SKSE handles the full unsigned FormID range, including high load-order and ESL forms.
    Form target = Game.GetFormEx(token)
    if !target
        Debug.Trace("[NirnCommand] Catalog form lookup failed request=" + request + " epoch=" + epoch + " formId=" + token)
        ReportAction(request, "unavailable")
        return
    elseif StorageUtil.FormListFind(player, "NirnCommand.Forms" + targetSlot, target) < 0
        Debug.Trace("[NirnCommand] Catalog form absent request=" + request + " epoch=" + epoch + " formId=" + token)
        ReportAction(request, "unavailable")
        return
    endif
    if kind == "item" && target && player.GetItemCount(target) > 0 && ((target as Weapon) || (target as Armor) || (target as Potion))
        player.EquipItem(target)
        ReportAction(request, "sent")
    elseif (kind == "spell" || kind == "spellleft") && (target as Spell) && NirnCommandNative.IsHandSpell(target as Spell) && IsAvailableSpell(player, target as Spell)
        if kind == "spellleft"
            player.EquipSpell(target as Spell, 0)
        else
            player.EquipSpell(target as Spell, 1)
        endif
        ReportAction(request, "sent")
    else
        Debug.Trace("[NirnCommand] Action unavailable")
        ReportAction(request, "unavailable")
    endif
EndEvent
