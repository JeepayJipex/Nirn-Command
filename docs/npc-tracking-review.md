# NPC tracking review

NPC tracking is an experimental native quest marker. Install the ZIP as a mod in MO2 and enable `NirnCommand.esp` along with the existing dependencies listed in the README. Use a disposable save and record the Skyrim and SKSE versions, MO2 profile, HUD replacement and other relevant quest or marker mods.

## In-game checks

- Keep an unrelated quest and its marker active. Open Nirn Command, find a nearby living NPC and press Enter. Confirm the palette closes, gameplay resumes and the native marker points to that actor.
- Reopen the palette, search for the actor and confirm the result says **Tracked**. Select the same actor again, then select another NPC and confirm only the second marker remains. Check the other quest and its marker throughout.
- Search for **Stop tracking NPC**, activate it and confirm the marker disappears. Confirm the action is absent afterward. Repeat start and stop.
- Track a nearby NPC, reopen the palette and activate their **Tracked** result. Confirm tracking stops. Repeat with Enter and with a mouse click. Check the footer hints while changing tabs and moving between results.
- Track an actor, move beyond the configured World Search radius and cross exterior boundaries and an interior door. Observe whether the marker continues to identify the actor when their 3D unloads and after they move.
- Save while tracking, load that save, and confirm the tracking quest and marker clear. Repeat with another save and check that no prior target carries over.
- Confirm dead NPCs cannot be selected as new targets. Kill an already tracked actor and wait at least ten seconds to confirm the marker remains. Check the logs if selection or alias assignment fails. Note any NPC behavior changes, quest journal entries, notifications or sounds.
- Repeat the marker checks with the active HUD replacement and with another supported runtime when available. Record observed behavior separately for each setup.

## Diagnostics

Enable Papyrus logging in the Skyrim profile's `Skyrim.ini` under `[Papyrus]` using `bEnableLogging=1`, `bEnableTrace=1` and `bLoadDebugInformation=1`. MO2 profiles may redirect the Documents directory. Find `Papyrus.0.log` under that profile's `Logs/Script` directory, `NirnCommandNative.log` under the SKSE log directory, and the Magelight log under its configured log directory. Include the `[NirnCommand]` tracking lines and native tracking validation lines, request identifiers and relevant reference IDs in bug reports.

In the game console, run `sqv NC_NPCTracking` to inspect the quest and Target alias without rebuilding or restarting. Compare the alias reference, quest running state and objective with the marker and palette. The tracking quest is temporary and is cleared on save load.

The generated quest, native compilation and automated checks cannot establish marker behavior, alias package effects, journal presentation or HUD compatibility in a running game. Report these observations with reproduction steps and logs.
