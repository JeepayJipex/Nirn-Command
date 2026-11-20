Scriptname NirnCommand_PlayerAlias extends ReferenceAlias

int _viewId
int _epoch
bool _scanning

Event OnInit()
    Setup()
EndEvent

Event OnPlayerLoadGame()
    _epoch += 1
    _scanning = false
    Setup()
EndEvent

Function Setup()
    _viewId = 0
    RegisterForModEvent("Magelight_JS_catalog", "OnCatalog")
    RegisterForModEvent("Magelight_JS_execute", "OnExecute")
    RegisterForModEvent("Magelight_JS_persist", "OnPersist")
    RegisterForModEvent("Magelight_ViewDomReady", "OnDomReady")
    RegisterForSingleUpdate(2.0)
    Connect()
EndFunction

Event OnUpdate()
    if _viewId == 0
        Connect()
        if _viewId == 0
            RegisterForSingleUpdate(2.0)
        endif
    endif
EndEvent

Event OnDomReady(string eventName, string strArg, float numArg, Form sender)
    if strArg == "NirnCommand"
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
        if !catalogReady || !executeReady || !persistReady
            Debug.Trace("[NirnCommand] Listener registration failed: " + Magelight.GetLastError("NirnCommand"))
            _viewId = 0
            RegisterForSingleUpdate(2.0)
            return
        endif
        Magelight.Call(_viewId, "ncGameLoaded", "")
        Magelight.Call(_viewId, "ncBridgeReady", "")
        Debug.Trace("[NirnCommand] Bridge ready, view " + _viewId)
    else
        RegisterForSingleUpdate(2.0)
    endif
EndFunction

Function ReportAction(string request, string result)
    Magelight.Call(_viewId, "ncActionResult", request + "|" + result)
    Debug.Trace("[NirnCommand] Request " + request + ": " + result)
    if result == "failure" || result == "unavailable"
        Debug.Notification("Nirn Command: action " + result)
    endif
EndFunction

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

Event OnCatalog(string eventName, string strArg, float numArg, Form sender)
    if (numArg as int) != _viewId || _viewId == 0 || _scanning
        return
    endif
    _scanning = true
    int consoleAvailable = 0
    int skyrimNetAvailable = 0
    int oarAvailable = 0
    if SKSE.GetPluginVersion("ConsoleUtilSSE") >= 0 || SKSE.GetPluginVersion("ConsoleUtil") >= 0
        consoleAvailable = 1
    endif
    if SKSE.GetPluginVersion("SkyrimNet") >= 0
        skyrimNetAvailable = 1
    endif
    if SKSE.GetPluginVersion("OpenAnimationReplacer") >= 0
        oarAvailable = 1
    endif
    Magelight.Call(_viewId, "ncCapabilities", consoleAvailable + "|" + skyrimNetAvailable + "|" + oarAvailable)
    _epoch += 1
    int scanEpoch = _epoch
    Actor player = Game.GetPlayer()
    StorageUtil.FormListClear(player, "NirnCommand.Forms")
    Magelight.Call(_viewId, "ncCatalogBegin", _epoch as string)
    int i = 0
    int total = player.GetNumItems()
    while i < total && scanEpoch == _epoch
        Form item = player.GetNthForm(i)
        if item && ((item as Weapon) || (item as Armor) || (item as Potion)) && player.GetItemCount(item) > 0
            string name = item.GetName()
            if name != ""
                int token = StorageUtil.FormListAdd(player, "NirnCommand.Forms", item)
                Magelight.Call(_viewId, "ncAddEntry", "item|" + _epoch + ":" + token + "|" + PersistentKey(item, "item") + "|" + name)
            endif
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
            if scanEpoch != _epoch
                return
            endif
        endif
    endwhile
    if scanEpoch != _epoch
        return
    endif
    i = 0
    total = player.GetSpellCount()
    while i < total && scanEpoch == _epoch
        Spell knownSpell = player.GetNthSpell(i)
        if knownSpell && knownSpell.GetEquipType() && player.HasSpell(knownSpell)
            string spellName = knownSpell.GetName()
            if spellName != ""
                int spellToken = StorageUtil.FormListAdd(player, "NirnCommand.Forms", knownSpell)
                Magelight.Call(_viewId, "ncAddEntry", "spell|" + _epoch + ":" + spellToken + "|" + PersistentKey(knownSpell, "spell") + "|" + spellName)
            endif
        endif
        i += 1
        if i % 40 == 0
            Utility.WaitMenuMode(0.01)
            if scanEpoch != _epoch
                return
            endif
        endif
    endwhile
    if scanEpoch != _epoch
        return
    endif
    Magelight.Call(_viewId, "ncCatalogComplete", _epoch as string)
    Debug.Trace("[NirnCommand] Catalog " + _epoch + " contains " + StorageUtil.FormListCount(player, "NirnCommand.Forms") + " forms")
    _scanning = false
EndEvent

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
    if epoch != _epoch || token < 0
        Debug.Trace("[NirnCommand] Stale catalog token")
        ReportAction(request, "unavailable")
        return
    endif
    Actor player = Game.GetPlayer()
    Form target = StorageUtil.FormListGet(player, "NirnCommand.Forms", token)
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
