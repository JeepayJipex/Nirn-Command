Scriptname NirnCommand_PlayerAlias extends ReferenceAlias

int _viewId
int _viewGeneration
int _epoch
bool _scanning
bool _sending
bool _discoverySending
bool _discoveryRequested
bool _domReady
bool _snapshotRequested
bool _dirty
int _slot
int _activeEpoch
int _previousEpoch
int _previousSlot
int _uiEpoch
float _lastChange
float _lastScan
float _lastDiscovery
int _hotkey
int _hotkeyModifiers
bool _keyHeld

Event OnInit()
    Setup()
EndEvent

Event OnPlayerLoadGame()
    _epoch += 1
    _scanning = false
    _sending = false
    _discoverySending = false
    _activeEpoch = 0
    _previousEpoch = 0
    Setup()
EndEvent

Function Setup()
    _viewGeneration += 1
    _viewId = 0
    _domReady = false
    _uiEpoch = 0
    _snapshotRequested = false
    _discoveryRequested = false
    RegisterForModEvent("Magelight_JS_catalog", "OnCatalog")
    RegisterForModEvent("Magelight_JS_execute", "OnExecute")
    RegisterForModEvent("Magelight_JS_persist", "OnPersist")
    RegisterForModEvent("Magelight_JS_hotkey", "OnHotkey")
    RegisterForModEvent("Magelight_JS_commands", "OnCommands")
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
    _keyHeld = false
    RegisterForKey(_hotkey)
    RegisterForModEvent("Magelight_ViewDomReady", "OnDomReady")
    RegisterForModEvent("Magelight_UIModeExited", "OnUIModeExited")
    _dirty = true
    _lastChange = 0.0
    _lastDiscovery = Utility.GetCurrentRealTime() - 30.0
    RegisterForSingleUpdate(1.0)
    Connect()
EndFunction

Event OnUpdate()
    if _viewId == 0
        Connect()
    endif
    float now = Utility.GetCurrentRealTime()
    if !_scanning && !_sending && !Magelight.IsUIModeActive() && !Utility.IsInMenuMode()
        if (_dirty && now - _lastChange >= 0.5) || now - _lastScan >= 30.0
            ScanCatalog()
        endif
        if now - _lastDiscovery >= 30.0
            _lastDiscovery = now
            if SKSE.GetPluginVersion("NirnCommandNative") >= 0
                NirnCommandNative.RefreshDiscovery()
                SendCapabilities()
                SendDiscovery()
            endif
        endif
    endif
    RegisterForSingleUpdate(1.0)
EndEvent

Event OnItemAdded(Form akBaseItem, int aiItemCount, ObjectReference akItemReference, ObjectReference akSourceContainer)
    _dirty = true
    _lastChange = Utility.GetCurrentRealTime()
EndEvent

Event OnItemRemoved(Form akBaseItem, int aiItemCount, ObjectReference akItemReference, ObjectReference akDestContainer)
    _dirty = true
    _lastChange = Utility.GetCurrentRealTime()
EndEvent

Event OnUIModeExited(string eventName, string strArg, float numArg, Form sender)
    if (numArg as int) == _viewId
        _keyHeld = false
        if !Magelight.IsUIModeActive() || Magelight.GetUIModeView() != _viewId
            Magelight.ShowView(_viewId, false)
        endif
    endif
EndEvent

Event OnDomReady(string eventName, string strArg, float numArg, Form sender)
    if strArg == "NirnCommand"
        _viewGeneration += 1
        _domReady = false
        _viewId = 0
        Connect()
    endif
EndEvent

Function Connect()
    if !Magelight.IsReady()
        return
    endif
    if !Magelight.RegisterMod("NirnCommand", "Nirn Command")
        return
    endif
    _viewId = Magelight.FindView("NirnCommand", "palette")
    if _viewId > 0
        bool catalogReady = Magelight.RegisterListener(_viewId, "catalog")
        bool executeReady = Magelight.RegisterListener(_viewId, "execute")
        bool persistReady = Magelight.RegisterListener(_viewId, "persist")
        bool hotkeyReady = Magelight.RegisterListener(_viewId, "hotkey")
        bool commandsReady = Magelight.RegisterListener(_viewId, "commands")
        if !catalogReady || !executeReady || !persistReady || !hotkeyReady || !commandsReady
            Debug.Trace("[NirnCommand] Listener registration failed: " + Magelight.GetLastError("NirnCommand"))
            _viewId = 0
            return
        endif
        Magelight.Call(_viewId, "ncGameLoaded", "")
        SendCapabilities()
        Magelight.BindHotkey(_viewId, 0, 0)
        Magelight.Call(_viewId, "ncHotkey", _hotkey + "|" + _hotkeyModifiers)
        Magelight.Call(_viewId, "ncBridgeReady", "")
        Debug.Trace("[NirnCommand] Bridge ready, view " + _viewId)
    endif
EndFunction

Function SendCapabilities()
    if _viewId == 0
        return
    endif
    int consoleAvailable = 0
    int skyrimNetAvailable = 0
    int oarAvailable = 0
    int oarInstalled = 0
    if SKSE.GetPluginVersion("ConsoleUtilSSE") >= 0 || SKSE.GetPluginVersion("ConsoleUtil") >= 0
        consoleAvailable = 1
    endif
    if SKSE.GetPluginVersion("SkyrimNet") >= 0
        skyrimNetAvailable = 1
    endif
    if SKSE.GetPluginVersion("OpenAnimationReplacer") >= 0
        oarInstalled = 1
    endif
    if SKSE.GetPluginVersion("NirnCommandNative") >= 0
        if NirnCommandNative.IsOarAvailable()
            oarAvailable = 1
        endif
    endif
    Magelight.Call(_viewId, "ncCapabilities", consoleAvailable + "|" + skyrimNetAvailable + "|" + oarAvailable + "|" + oarInstalled)
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

int Function PressedModifiers()
    int result = 0
    if Input.IsKeyPressed(42)
        result += 1
    endif
    if Input.IsKeyPressed(54)
        result += 2
    endif
    if Input.IsKeyPressed(29)
        result += 4
    endif
    if Input.IsKeyPressed(157)
        result += 8
    endif
    if Input.IsKeyPressed(56)
        result += 16
    endif
    if Input.IsKeyPressed(184)
        result += 32
    endif
    return result
EndFunction

Event OnKeyDown(int keyCode)
    if keyCode != _hotkey || _keyHeld
        return
    endif
    _keyHeld = true
    if PressedModifiers() != _hotkeyModifiers || _viewId == 0
        return
    endif
    if Magelight.IsUIModeActive()
        if Magelight.GetUIModeView() == _viewId
            Magelight.ReleaseUIMode("NirnCommand")
            Magelight.ShowView(_viewId, false)
        endif
    elseif !Utility.IsInMenuMode()
        Magelight.RequestUIMode(_viewId, true)
    endif
EndEvent

Event OnKeyUp(int keyCode, float holdTime)
    if keyCode == _hotkey
        _keyHeld = false
    endif
EndEvent

Event OnHotkey(string eventName, string payload, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    if payload == "close"
        if Magelight.GetUIModeView() == _viewId
            Magelight.ReleaseUIMode("NirnCommand")
            Magelight.ShowView(_viewId, false)
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
        Magelight.Call(_viewId, "ncHotkeyResult", "failure")
        return
    endif
    if SKSE.GetPluginVersion("NirnCommandNative") < 0 || !NirnCommandNative.SetHotkey(keyCode, modifiers)
        Magelight.Call(_viewId, "ncHotkeyResult", "failure")
        return
    endif
    UnregisterForKey(_hotkey)
    _hotkey = keyCode
    _hotkeyModifiers = modifiers
    _keyHeld = false
    RegisterForKey(_hotkey)
    Magelight.Call(_viewId, "ncHotkey", _hotkey + "|" + _hotkeyModifiers)
    Magelight.Call(_viewId, "ncHotkeyResult", "ok")
EndEvent

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

Event OnCatalog(string eventName, string strArg, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0
        return
    endif
    if StringUtil.Find(strArg, "applied|") == 0
        int applied = StringUtil.Substring(strArg, 8) as int
        if applied == _activeEpoch
            _uiEpoch = applied
        endif
        return
    elseif strArg == "ready"
        _domReady = true
        SendCatalog()
        SendDiscovery()
        return
    elseif strArg == "refresh"
        _dirty = true
        _lastChange = 0.0
    endif
    SendCatalog()
EndEvent

Function SendCatalog()
    if _sending
        _snapshotRequested = true
        return
    endif
    if _activeEpoch == 0 || !_domReady || _viewId == 0
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
    int scanEpoch = _epoch
    int sendView = _viewId
    int viewGeneration = _viewGeneration
    string list = "NirnCommand.Forms" + sendSlot
    Actor player = Game.GetPlayer()
    if sendView > 0
        Magelight.Call(sendView, "ncCatalogBegin", sendEpoch as string)
    endif
    int i = 0
    int total = StorageUtil.FormListCount(player, list)
    while sendView > 0 && i < total && scanEpoch == _epoch && sendView == _viewId && viewGeneration == _viewGeneration && _domReady
        Form item = StorageUtil.FormListGet(player, list, i)
        if item
            string kind = "item"
            if item as Spell
                kind = "spell"
            endif
            Magelight.Call(sendView, "ncAddEntry", kind + "|" + sendEpoch + ":" + i + "|" + PersistentKey(item, kind) + "|" + item.GetName())
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if scanEpoch == _epoch && sendView == _viewId && viewGeneration == _viewGeneration && _domReady
        if commit
            _previousEpoch = _activeEpoch
            _previousSlot = _slot
            _slot = sendSlot
            _activeEpoch = sendEpoch
            _lastScan = Utility.GetCurrentRealTime()
        endif
        if sendView > 0
            Magelight.Call(sendView, "ncCatalogComplete", sendEpoch as string)
        endif
    elseif commit && scanEpoch == _epoch
        _dirty = true
    endif
    _sending = false
    if _snapshotRequested && _domReady
        _snapshotRequested = false
        SendCatalog()
    endif
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
    _dirty = false
    _epoch += 1
    int scanEpoch = _epoch
    int nextSlot = 1 - _slot
    string list = "NirnCommand.Forms" + nextSlot
    Actor player = Game.GetPlayer()
    if _previousSlot == nextSlot
        _previousEpoch = 0
    endif
    StorageUtil.FormListClear(player, list)
    int i = 0
    int total = player.GetNumItems()
    while i < total && scanEpoch == _epoch
        Form item = player.GetNthForm(i)
        if item && ((item as Weapon) || (item as Armor) || (item as Potion)) && player.GetItemCount(item) > 0 && item.GetName() != ""
            StorageUtil.FormListAdd(player, list, item)
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    i = 0
    total = player.GetSpellCount()
    while i < total && scanEpoch == _epoch
        Spell knownSpell = player.GetNthSpell(i)
        if knownSpell && knownSpell.GetEquipType() && player.HasSpell(knownSpell) && knownSpell.GetName() != ""
            StorageUtil.FormListAdd(player, list, knownSpell)
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
        endif
    endwhile
    if scanEpoch == _epoch
        if !_sending && !Magelight.IsUIModeActive()
            PublishCatalog(nextSlot, scanEpoch, true)
            _scanning = false
        else
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
    Magelight.ShowView(_viewId, false)
    bool released = Magelight.ReleaseUIMode("NirnCommand")
    if !released && Magelight.IsUIModeActive() && Magelight.GetUIModeView() == _viewId
        Debug.Trace("[NirnCommand] Could not release UI mode")
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
    elseif payload == "oar:menu"
        if SKSE.GetPluginVersion("NirnCommandNative") >= 0 && NirnCommandNative.ToggleOar()
            ReportAction(request, "sent")
        else
            ReportAction(request, "unavailable")
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
    if (epoch != _activeEpoch && epoch != _previousEpoch) || epoch == 0 || token < 0
        Debug.Trace("[NirnCommand] Stale catalog token")
        ReportAction(request, "unavailable")
        return
    endif
    Actor player = Game.GetPlayer()
    int targetSlot = _slot
    if epoch == _previousEpoch
        targetSlot = _previousSlot
    endif
    Form target = StorageUtil.FormListGet(player, "NirnCommand.Forms" + targetSlot, token)
    if kind == "item" && target && player.GetItemCount(target) > 0 && ((target as Weapon) || (target as Armor) || (target as Potion))
        player.EquipItem(target)
        ReportAction(request, "sent")
    elseif (kind == "spell" || kind == "spellleft") && (target as Spell) && (target as Spell).GetEquipType() && player.HasSpell(target as Spell)
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
