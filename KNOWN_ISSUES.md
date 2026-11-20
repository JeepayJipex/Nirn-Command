# Known issues

- This build has not been tested in Skyrim. Its startup, UI focus, actions, persistence, and save/load behavior remain unverified in game.
- The design targets Skyrim 1.6.1170; the inspected local Nolvus profile uses 1.5.97. Runtime compatibility has not been established for either executable.
- OAR shortcut simulation is experimental. Detecting a key in an INI does not establish that OAR accepts simulated input, and the scanner currently detects OAR only.
- The catalog uses base forms; it does not identify individual enchanted instances. Spell filtering checks ownership, a name and an equip slot; it does not fully classify modded powers or passive effects.
- Magelight localStorage is installation-wide, not tied to a character. The PapyrusUtil JSON fallback is also global and has passed offline protocol tests only; its persistence and Unicode handling still need in-game verification.
- Long catalog scans are divided into batches, but throughput and behavior while Magelight pauses the game have not been measured in the target runtime.
- Optional integration availability depends on the SKSE plugin names registered at runtime. If a known-installed integration is reported unavailable, provide logs.
