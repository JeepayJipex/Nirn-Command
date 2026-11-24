# Known issues and verification limits

## v0.5C.3 map actions

- Precise positioning and fallback behavior have not yet been verified in Skyrim. The active map replacement and worldspace can affect support. See `docs/map-actions-test.md` for the primary gameplay test and diagnostics.

- This version has not been run in Skyrim. Startup, input focus, simulated shortcuts, native API calls, persistence and save transitions remain unverified in game.
- The native DLL is intended for SE 1.5.97 and AE 1.6.1170. Automated compilation cannot establish runtime compatibility with either executable or a particular mod list.
- Discovery covers known native integrations and declared MCM Helper bindings. It cannot enumerate every Papyrus or SKSE shortcut, prove that a configuration was loaded, or guarantee simulated keys are received.
- Background catalog scans use base forms and do not distinguish individual enchanted instances. Spell filtering does not fully classify modded powers or passive effects. Timings and gameplay impact have not been measured in game.
- Refresh and load transitions, modifier capture, MO2 virtual filesystem behavior, global preference files and Unicode have automated checks but need observation during play.
- A custom Magelight host toggle key may differ from Page Up; avoid binding Nirn Command to the same combination. Other mods and Skyrim may also receive the opening key.

- Version 0.5.0 has automated checks only. Runtime timing, MO2 virtual filesystem behavior, spell availability and hotkey persistence need observation in a game session.
- Catalog and transfer timings are logged in Papyrus and Magelight. They are not measurements of the prior build or proof of a particular speedup.

## v0.5A review build

Search includes bounded typo-tolerant word-prefix matching. Nirn Command requests a paused Magelight UI mode; while open, a session-scoped heartbeat services pending catalog work. On game load, Nirn Command closes its own UI mode and ignores hotkey events when the physical key is not pressed. Opening or closing the palette, pause recovery, and catalog progress while paused require in-game verification; synthetic tests do not reproduce Skyrim's Papyrus scheduler or saved event stacks.
