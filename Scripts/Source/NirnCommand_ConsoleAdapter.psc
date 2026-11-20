; Keeps the optional ConsoleUtil dependency outside the controller script.
Scriptname NirnCommand_ConsoleAdapter Hidden
Function Execute(string command) Global
    ConsoleUtil.ExecuteCommand(command)
EndFunction
