# World search feasibility checkpoint

The project pins MinLL/CommonLibVR at commit `550cc4fb9114649dcf526d1f3d73d710c5d7003b`.
Its `ProcessLists::ForEachHighActor` resolves handles from the high-process actor
list. This provides a bounded set of currently processed actors, not a complete
list of NPCs in the world. A caller must copy metadata while each actor is valid.

For map markers, `LocationDiscovery::Event` exposes a `MapMarkerData*` and a
worldspace identifier, but no reference handle or form ID. The player has a
`currentMapMarkers` array of reference handles, but the headers do not establish
when the engine populates that array or whether it covers every worldspace. The
marker flags distinguish visibility and travel availability; neither flag alone
proves that the player discovered a marker.

The intended restricted strategy is to match the event's map data to exactly one
resolved reference in the player's current marker list during the event callback,
copy its identity and metadata, and retain only confirmed discoveries in the
current save's SKSE serialization record. Ambiguous and unmatched events must be
discarded with diagnostics. Resolve saved form IDs on load and revalidate them.
This excludes discoveries made before installation and any marker whose event
cannot be correlated. It never requires a world or plugin reference scan.

This is a feasibility hypothesis, not a runtime result. In-game validation must
determine whether the marker list is populated without opening the map, whether
the event can be correlated in Skyrim and Solstheim, and whether mod-added
markers are represented. If correlation fails, the location catalog cannot be
claimed functional until a safe alternative is established.

The NPC radius is read once on the first NPC refresh from the optional virtual Data file
`SKSE/Plugins/NirnCommand/world.json`. Its format is `{ "npcRadius": 8192 }`;
the value is in Skyrim units and is clamped to 1024–32768. With no valid file,
the default is 8192. Reopen the game after changing it. The NPC snapshot contains
at most 256 actors and contains only high-process actors with a loaded 3D model.
Each refresh examines at most 1024 high-process actors; the native log reports
when this bound is reached. Results prioritize the closest actors examined.

## Candidates for a later iteration

Temporary NPC tracking could use a dedicated quest objective and an optional
reference alias. Papyrus exposes `ForceRefTo`, `SetObjectiveDisplayed` and
`Clear`. A future prototype must test journal and compass effects, cleanup on
cancel, expiry and save reload, and behavior when an actor dies or unloads.
Compass replacements may alter the displayed marker.

SKSE's Scaleform `ShowOnMap` takes an index into the currently open map menu's
marker list. A focused map action needs to wait for that list and resolve the
selected reference to its current index. Worldspace changes, missing markers and
replacement map menus require testing. The existing general-map action remains
the fallback when a specific marker cannot be selected reliably.

The player's current marker list supplies candidate references for a future
import of prior discoveries. Marker visibility and fast-travel flags do not
establish discovery on their own. A future import needs per-save discovery
evidence, stable reference remapping and bounded enumeration before it can
include earlier vanilla or mod-added markers safely.

References: [SKSE map implementation](https://github.com/ianpatt/skse64/blob/master/skse64/Hooks_Scaleform.cpp#L775-L812),
[Creation Kit alias scripts](https://github.com/ianpatt/skse64/blob/master/scripts/vanilla/ReferenceAlias.psc),
and the CommonLib sources below.

Sources: [ProcessLists.cpp](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/src/RE/P/ProcessLists.cpp),
[LocationDiscovery.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/L/LocationDiscovery.h),
[ExtraMapMarker.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/E/ExtraMapMarker.h),
[PlayerCharacter.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/P/PlayerCharacter.h).


