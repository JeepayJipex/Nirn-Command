# Known Locations diagnostic

This review build imports visible named locations from `PlayerCharacter::currentMapMarkers` and retains validated locations found in previous worldspaces during the same save session. It also retains event-confirmed discoveries in the SKSE co-save. The import rechecks marker visibility and never changes map marker flags.

Install the archive as a mod in MO2 and enable NirnCommand.esp and its existing dependencies. Use a save made before Nirn Command was installed. Record the Skyrim and SKSE versions, active map mods and save identity.

After loading, before opening the map, open Nirn Command and select **Nirn Command — Diagnose Known Locations**. The palette closes and the probe runs during gameplay in batches of at most 128 markers with a soft one-millisecond time budget per batch. Wait for the `Known locations probe complete` line in `NirnCommandNative.log` under the profile's SKSE log directory. The output includes the world and cell FormIDs, collection size, visible named reference FormIDs and names, excluded and duplicate counts, total engine processing time, maximum batch time and elapsed wall time. Hidden or invalid marker names are not logged. The probe publishes no results to the palette.

Repeat after opening and closing the map, indoors, outdoors, in Solstheim, and in a mod-added worldspace. Compare each log with the visible map, including a location revealed by a quest, one revealed by a mod, a marker without fast travel, and an undiscovered hidden marker. Repeat with a second save with different visibility. Report missing or unexpected visible markers, the relevant log lines and any noticeable stalls. The collection may change while a probe runs. A change of cell, worldspace or collection length restarts the probe.

The probe uses the current collection only. The owner confirmed that its logged markers matched the map in the tested Skyrim and Solstheim locations, including before opening the map. Coverage in unvisited worldspaces and compatibility with other map replacements remain unverified. `mapMarkerIterator` has no established enumeration semantics in the pinned headers. Persistent worldspace references also have unproven coverage.

## Import review

Load a save from before installation and wait for `Known locations import complete` in the native log. Search for locations already visible on the map, including a quest-revealed or mod-added marker and a visible marker without fast travel. Activate one and confirm the general map opens. Confirm that hidden and unnamed markers do not appear.

Visit another worldspace and wait for the next import. Search for markers from both worlds. Hide or disable a test marker with an appropriate mod, wait for reconciliation, and confirm that it disappears or cannot be activated. Load a different save with different map visibility and verify that entries from the first save do not carry over. Return to the first save and test an existing discovery co-save. Confirm NPC tracking and the other search categories continue to work.

The native log reports the collection size, eligible and excluded counts, duplicates, cumulative enumeration time, maximum batch duration, publication time and wall time. Report these lines along with game version, active map mods and any missing or unexpected entries. Import performance and the scenarios above remain unverified in game.
