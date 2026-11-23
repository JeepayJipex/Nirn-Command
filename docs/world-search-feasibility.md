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

Sources: [ProcessLists.cpp](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/src/RE/P/ProcessLists.cpp),
[LocationDiscovery.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/L/LocationDiscovery.h),
[ExtraMapMarker.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/E/ExtraMapMarker.h),
[PlayerCharacter.h](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/P/PlayerCharacter.h).
