Scriptname NirnCommandNative Hidden
bool Function IsOarAvailable() Global Native
bool Function ToggleOar() Global Native
Function RefreshDiscovery() Global Native
int Function DiscoveryCount() Global Native
string Function DiscoveryEntry(int index) Global Native
int Function LoadCommands() Global Native
string Function CommandsChunk(int index) Global Native
Function BeginCommandsWrite() Global Native
bool Function AppendCommandsChunk(string chunk) Global Native
bool Function CommitCommandsWrite() Global Native
int Function GetHotkey(int part) Global Native
bool Function SetHotkey(int keyCode, int modifiers) Global Native
