Scriptname NirnCommandNative Hidden
Function WorldReset() Global Native
Function WorldRefresh() Global Native
int Function WorldContext() Global Native
int Function WorldRevision() Global Native
int Function WorldCount() Global Native
string Function WorldEntry(int index) Global Native
Function WorldInspect(int token) Global Native
string Function WorldInspection(int token) Global Native
int Function LocationRevision() Global Native
int Function LocationCount() Global Native
string Function LocationEntry(int index) Global Native
Function LocationInspect(int token) Global Native
string Function LocationInspection(int token) Global Native
Function WorldOpenMap(int token) Global Native
Function ResolveTrackingActor(int token, int context, int request) Global Native
int Function NextTrackingRequest() Global Native
int Function TrackingResolutionStatus(int request) Global Native
Actor Function TrackingResolvedActor(int request) Global Native
Function ClearTrackingResolution(int request) Global Native
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
