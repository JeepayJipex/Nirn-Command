; Keeps the optional SkyrimNet dependency outside the controller script.
Scriptname NirnCommand_SkyrimNetAdapter Hidden
int Function Trigger(string operation) Global
    if operation == "dashboard"
        return SkyrimNetApi.TriggerToggleDashboard()
    elseif operation == "gamemaster"
        return SkyrimNetApi.TriggerToggleGameMaster()
    elseif operation == "continuous"
        return SkyrimNetApi.TriggerToggleContinuousMode()
    endif
    return 1
EndFunction
