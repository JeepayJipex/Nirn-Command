# Known issues and verification limits

## Hotkey reliability review

- The first native-input review build did not register its input listener because SKSE accepted only the first listener for this plugin and sender. The replacement routes input lifecycle messages through the existing listener. The replacement requires gameplay validation.

- Native input capture and the save-load guard need gameplay validation. After loading a save, check that the palette stays closed until the configured shortcut is pressed and opens on a normal tap. Verify the configured modifier chord during ordinary play.
- If a press fails, collect `NirnCommandNative.log`, Papyrus and Magelight logs. Native `Hotkey down` entries record the key, held and armed state, observed and expected modifier masks, view readiness, menu state, decision and token. Papyrus records token rejection and UI mode results.
- The previous Papyrus handler checked physical key and modifier state when the queued event ran. A release before that check could reject a real press. A missed key-up could also leave its held flag set, and reconfiguration did not reset its armed flag. These code paths are confirmed, while their contribution to the reported misses remains unmeasured.
- A prior gameplay log showed an unsolicited open during VM thaw before setup closed the palette. Its event source was not confirmed. A later log recorded two bridge setups around startup, without enough detail to associate a failed press with either setup.

## v0.5C.3 map actions

- The project owner confirmed precise map positioning in game with the camera-fix build. Fallback behavior and compatibility across other map replacements and worldspaces remain to be observed. See `docs/map-actions-test.md` for diagnostics.

- The full range of startup, input focus, simulated shortcuts, native API calls, persistence and save transitions remains unverified in game.
- The native DLL is intended for SE 1.5.97 and AE 1.6.1170. Automated compilation cannot establish runtime compatibility with either executable or a particular mod list.
- Discovery covers known native integrations and declared MCM Helper bindings. It cannot enumerate every Papyrus or SKSE shortcut, prove that a configuration was loaded, or guarantee simulated keys are received.
- Background catalog scans use base forms and do not distinguish individual enchanted instances. Spell filtering does not fully classify modded powers or passive effects. Timings and gameplay impact have not been measured in game.
- Refresh and load transitions, modifier capture, MO2 virtual filesystem behavior, global preference files and Unicode have automated checks but need observation during play.
- A custom Magelight host toggle key may differ from Page Up; avoid binding Nirn Command to the same combination. Other mods and Skyrim may also receive the opening key.

- Version 0.5.0 has automated checks only. Runtime timing, MO2 virtual filesystem behavior, spell availability and hotkey persistence need observation in a game session.
- Catalog and transfer timings are logged in Papyrus and Magelight. They are not measurements of the prior build or proof of a particular speedup.

## v0.5A review build

Search includes bounded typo-tolerant word-prefix matching. Nirn Command requests a paused Magelight UI mode; while open, a session-scoped heartbeat services pending catalog work. Opening or closing the palette, pause recovery, and catalog progress while paused require in-game verification; synthetic tests do not reproduce Skyrim's Papyrus scheduler or saved event stacks.
