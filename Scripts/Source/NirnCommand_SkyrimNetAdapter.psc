; Keeps the optional SkyrimNet dependency outside the controller script.
Scriptname NirnCommand_SkyrimNetAdapter Hidden
int Function Trigger(string operation) Global
    if operation == "dashboard"
        return SkyrimNetApi.TriggerToggleDashboard()
    elseif operation == "gamemaster"
        return SkyrimNetApi.TriggerToggleGameMaster()
    elseif operation == "continuous"
        return SkyrimNetApi.TriggerToggleContinuousMode()
    elseif operation == "openmic"
        return SkyrimNetApi.TriggerToggleOpenMic()
    elseif operation == "globalai"
        return SkyrimNetApi.TriggerToggleGlobalAI()
    elseif operation == "reactions"
        return SkyrimNetApi.TriggerToggleWorldEventReactions()
    elseif operation == "actions"
        return SkyrimNetApi.TriggerToggleActions()
    elseif operation == "whisper"
        return SkyrimNetApi.TriggerToggleWhisperMode()
    elseif operation == "text"
        return SkyrimNetApi.TriggerTextInput()
    elseif operation == "thought"
        return SkyrimNetApi.TriggerTextThought()
    elseif operation == "direct"
        return SkyrimNetApi.TriggerDirectInput()
    elseif operation == "continue"
        return SkyrimNetApi.TriggerContinueNarration()
    elseif operation == "interrupt"
        return SkyrimNetApi.TriggerInterruptDialogue()
    endif
    return 1
EndFunction
