# World actions feasibility

## Evidence and decisions

This discovery is based on main at `7935e357` and source inspection. The user reports that v0.5B was validated in game. The mechanisms below have not been exercised in game. SE 1.5.97 and AE 1.6.1170 are the project's supported targets. All engine access must use the appropriate game or UI thread. Do not modify discovery flags or fast travel availability.

| Feature | Decision | Remaining gate |
| --- | --- | --- |
| NPC tracking | Conditional go for a vanilla quest prototype | Verify marker, actor and quest behavior in game |
| Known Locations | Conditional go for a runtime-visible marker prototype | Validate bounded enumeration, visibility, worldspace coverage and performance |
| Map positioning | Conditional go for a menu prototype | Verify readiness, reference matching and camera movement |

## 1. Temporary NPC tracking

### Mechanism and risks

A dedicated technical quest can have one optional reference alias and one objective target. Start the quest, call `ReferenceAlias.ForceRefTo(actor)`, verify `GetActorRef()`, display the objective with `Quest.SetObjectiveDisplayed`, and activate the quest with `Quest.SetActive`. The alias must be filled before displaying the objective because objective targets may not refresh after a later fill. `ForceRefTo` can fail and reevaluates actor packages. The alias should have no reserve-reference, quest-object, essential or protected flags, packages, factions, scripts or name overrides. Quest alias assignment can still interact with other quests and AI. Its effects need runtime observation. [ReferenceAlias](https://github.com/ianpatt/skse64/blob/25b72352adb6543fa6d0bd3795780672b2e238e0/scripts/vanilla/ReferenceAlias.psc) · [Quest](https://github.com/ianpatt/skse64/blob/25b72352adb6543fa6d0bd3795780672b2e238e0/scripts/vanilla/Quest.psc) · [Objective behavior](https://papyrus.bellcube.dev/skyrimse/script/quest/function/setobjectivedisplayed/) · [Alias record flags](https://github.com/TES5Edit/meta/blob/master/UESPWiki/QUSTDef.wiki)

Hide the objective before replacing a target, clear the alias, then assign and verify the next actor. Stop hides the objective, deactivates this quest, clears the alias and stops the quest. The API has no documented silent argument for objective display. Measure journal entries, notifications and sound. Keep other quests active and verify their markers remain intact. A compass or HUD replacement may suppress or change native markers.

The initial actor comes from the validated World Search token. Once assigned, its alias should remain independent of the search radius and loaded 3D, but this is a hypothesis. Test interiors, doors, unloaded actors, separate worldspaces and actor movement. Reject dead, disabled or deleted references when selecting. Clear a target when it is confirmed invalid, and clear the technical quest on load to prevent stale tracking across save boundaries. Do not treat an unloaded actor as invalid merely because it lacks 3D. Save/load persistence, deletion and cleanup need observation.

### Integration and gate

Extend the generated ESP with a separate quest and objective, retaining the controller quest and SEQ. Update the generator and checker. Papyrus owns the quest lifecycle and receives a revalidated actor from the native bridge. UI Enter closes the palette and requests tracking, with session, context and request correlation. Add a searchable `Stop tracking NPC` action and allow one target. Native code resolves existing actor handles on the game thread and rejects stale requests. No HUD hook is needed for the prototype.

Automated coverage should check quest records, single-target replacement, invalid references, stale requests, cancellation and save boundaries. The smallest smoke test uses a disposable two-actor quest and an unrelated active quest. Track A, replace it with B, stop, reload a save made while tracking, cross an exterior boundary and an interior door, and move beyond the search radius. Observe compass, journal, notifications, AI and other quest markers. Repeat with the target HUD replacement.

**Go** when the correct native marker follows ordinary transitions, replacement and cleanup work, and actor and unrelated quest behavior remain acceptable without unwanted announcements. **No go** if those conditions fail. A custom HUD marker would require invasive compatibility work and is an alternative for separate review.

## 2. Known Locations import

### Sources and limitations

Known Locations includes named, valid locations currently visible on the player's map, including those revealed by quests or mods before installation. Fast travel availability is irrelevant. Exclude hidden, disabled, deleted, unresolved and unnamed markers. Revalidate visibility during publication and action execution so markers hidden after enumeration disappear. Never modify marker flags. The relationship between engine flags and the actual map display requires runtime validation.

The pinned CommonLib fork exposes `PlayerCharacter::GetPlayerRuntimeData().currentMapMarkers`, a `BSTArray<ObjectRefHandle>`, and `mapMarkerIterator`. `ExtraMapMarker::mapData` exposes `kVisible`, `kCanTravelTo` and `kShowAllHidden`. Use current visibility as the candidate eligibility signal without filtering on `kCanTravelTo`. Special visibility states and map replacements require runtime validation. `mapMarkerIterator` is not established as an all-worldspaces enumeration API. [PlayerCharacter](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/P/PlayerCharacter.h) · [ExtraMapMarker](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/E/ExtraMapMarker.h)

Dylbills Papyrus Functions implements `GetCurrentMapMarkerRefs` using the player's current array. Its `GetAllMapMarkerRefs` scans `TESForm::GetAllForms()` under a read lock and filters marker flags. The current collection is described as applicable to the current worldspace or interior cell grid, so its completeness across DLC and mod worldspaces is unproven. The global scan is potentially expensive. Persistent-cell traversal is another candidate for enumeration with unproven coverage. A dependency-free probe is possible using the existing DLL. Complete dependency-free coverage remains unverified. [Dylbill source](https://github.com/Dylbill-Iroh/DbSkseFunctions/blob/fc588406a825969b78a7b42c1a5a63d01f000e96/DbSkseFunctions/src/MapMarker.cpp#L291-L529)

The existing event sink correlates `LocationDiscovery::Event::mapMarkerData` with a unique entry in the current array. It persists confirmed IDs in the `NCL1` SKSE record and uses `ResolveFormID` on load. Retain the distinction between event-confirmed discoveries and runtime-visible candidates internally where useful. Both are eligible only while currently visible and valid. A remembered ID alone must never authorize exposing a hidden marker.

### Probe, integration and gate

On a pre-install save, log IDs and flags before opening the map, after opening it and after changing worldspaces. Compare a visited marker, a quest-revealed unvisited marker, a mod-visible marker, a visible marker without fast travel and hidden markers. Confirm inclusion matches the player's map without changing flags. Repeat in Skyrim, Solstheim, an interior and a mod-added worldspace. Measure collection size, per-batch time and frame impact. Check a second save with different visibility and revisit a worldspace after visibility changes.

Enumerate candidates in bounded game-thread batches after load and relevant world transitions, away from palette opening and search. Merge visible candidates with event-confirmed IDs, deduplicate by resolved identity and revalidate visibility before publication and action. Preserve save isolation, `ResolveFormID`, co-save compatibility, session cancellation and atomic revision publication. Clear stale candidates at save boundaries and do not assume a previously visible marker stays visible. Review the existing 40,000-byte record limit before increasing persistent capacity. Existing Papyrus and UI catalog interfaces can remain in use, with user-facing terminology updated to Known Locations as needed. Add tests for visible markers with and without fast travel, revealed and mod-visible markers, hidden or newly hidden markers, duplicates, old records, removed plugins, remapping, save changes, cancellation and unchanged flags.

**Go** when runtime visibility matches the player's map, hidden markers stay excluded, enumeration is bounded and measured performance is acceptable. Progressive import on worldspace transitions is acceptable with its coverage documented. **No go** for a path that exposes hidden markers, mixes saves or produces unacceptable frame stalls. Retain the event-based catalog while investigating uncovered worldspaces.

## 3. Precise map positioning

### Mechanism and risks

The current action closes the palette, waits briefly, and queues `MapMenu` after validating the location. The pinned `MapMenu::GetRuntimeData2()->mapMarkers` contains `MapMenuMarker::ref`. SKSE registers `_global.skse.ShowOnMap(index)`. Its handler reads the indexed menu marker's handle and queues a `RefHandleUIData` refresh. The index is an array position in the active menu, not a saved reference ID. SkyUI creates markers incrementally, so menu-open alone does not establish readiness. [MapMenu](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/M/MapMenu.h) · [Marker](https://github.com/MinLL/CommonLibVR/blob/550cc4fb9114649dcf526d1f3d73d710c5d7003b/include/RE/M/MapMenuMarker.h) · [SKSE handler](https://github.com/ianpatt/skse64/blob/25b72352adb6543fa6d0bd3795780672b2e238e0/skse64/Hooks_Scaleform.cpp#L788-L825) · [SkyUI source](https://github.com/schlangster/skyui/blob/835428728e2305865e220fdfc99d791434955eb1/src/MapMenu/Map/MapMenu.as#L185-L252)

After unpausing and opening the map, wait for the active menu, its marker list and GFx handler. Resolve the reference to one unique current array position and invoke the handler on the UI execution path. Bound the wait and cancel on menu close, replacement request or save change. A successful invocation does not itself prove the camera moved. If the worldspace, marker or handler is unavailable, retain the general map. Directly sending a typed native refresh is an alternative, but message allocation and ownership need proof. Replacement map movies may change behavior, including worldspace selection.

`PlayerCharacter::playerMapMarker` and `MapMenu::PlaceMarker` suggest a route to a native custom destination. Placement semantics, worldspace and effects on the player's existing waypoint are unverified. Keep it outside this increment.

### Integration and gate

The existing location action and ESP need no new records. Papyrus retains palette release, while SKSE owns a bounded, correlated menu request and UI readiness checks. Test matching, absent and duplicate references, delayed initialization, stale requests, close/reopen and fallback.

The smallest smoke test selects one known marker in the current world and observes camera movement in vanilla MapMenu. Then test SkyUI, the target map replacement, interiors, Solstheim, a mod-added worldspace and an unavailable marker. Confirm no fast travel or waypoint modification occurs. **Go** when the correct marker is centered and fallback remains reliable. **No go** for incompatible menus or worldspaces, where the general map remains the supported action.

## Increment order

1. Prototype and validate the NPC quest before integrating its palette action.
2. Probe runtime visibility, marker enumeration, worldspace coverage and performance before implementing Known Locations import.
3. Prototype same-world map positioning, then add readiness and fallback handling after validation.

Record the game and SKSE versions, active HUD and map replacements, logs and observed results for each smoke test. Automated checks do not establish in-game compatibility.
