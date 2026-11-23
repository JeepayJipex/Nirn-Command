Scriptname NirnCommandNative Hidden
Function RefreshDiscovery() Global Native
int Function DiscoveryRevision() Global Native
int Function DiscoveryCount() Global Native
string Function DiscoveryEntry(int index) Global Native
int Function LoadCommands() Global Native
string Function CommandsChunk(int index) Global Native
Function BeginCommandsWrite() Global Native
bool Function AppendCommandsChunk(string chunk) Global Native
bool Function CommitCommandsWrite() Global Native
int Function LoadOverrides() Global Native
string Function OverridesChunk(int index) Global Native
Function BeginOverridesWrite() Global Native
bool Function AppendOverridesChunk(string chunk) Global Native
bool Function CommitOverridesWrite() Global Native
int Function GetHotkey(int part) Global Native
bool Function SetHotkey(int keyCode, int modifiers) Global Native
Form[] Function InventoryForms(Actor player) Global Native
bool Function IsHandSpell(Spell candidate) Global Native
string Function CatalogEntry(string kind, string token, string id, string name) Global Native
string[] Function CatalogFragments(string row) Global Native
