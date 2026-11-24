# Known Locations diagnostic

This review build probes `PlayerCharacter::currentMapMarkers` without changing map marker flags. The Locations catalog continues to use event-confirmed discoveries. The relationship between the current collection, map visibility and all worldspaces requires in-game evidence before importing its entries.

Install the archive as a mod in MO2 and enable NirnCommand.esp and its existing dependencies. Use a save made before Nirn Command was installed. Record the Skyrim and SKSE versions, active map mods and save identity.

After loading, before opening the map, open Nirn Command and select **Nirn Command — Diagnose Known Locations**. The palette closes and the probe runs during gameplay in batches of at most 128 markers with a soft one-millisecond time budget per batch. Wait for the `Known locations probe complete` line in `NirnCommandNative.log` under the profile's SKSE log directory. The output includes the world and cell FormIDs, collection size, visible named reference FormIDs and names, excluded and duplicate counts, total engine processing time, maximum batch time and elapsed wall time. Hidden or invalid marker names are not logged. The probe publishes no results to the palette.

Repeat after opening and closing the map, indoors, outdoors, in Solstheim, and in a mod-added worldspace. Compare each log with the visible map, including a location revealed by a quest, one revealed by a mod, a marker without fast travel, and an undiscovered hidden marker. Repeat with a second save with different visibility. Report missing or unexpected visible markers, the relevant log lines and any noticeable stalls. The collection may change while a probe runs. A change of cell, worldspace or collection length restarts the probe.

The probe uses the current collection only. It does not establish coverage in unvisited worldspaces or equivalence between the native visible flag and a replacement map's display. `mapMarkerIterator` has no established enumeration semantics in the pinned headers. Persistent worldspace references also have unproven coverage. In-game observations and timing are pending.
