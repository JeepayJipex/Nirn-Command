# Nirn Command Personal All-in

Nirn Command is a compact in-game command palette for Skyrim Special Edition. Press **Insert**, type to search, use the arrow keys and Enter, then return to the game. Ctrl+Enter equips a spell in the left hand; Enter uses the right hand. Ctrl+D or the star toggles a favorite.

## Installation

1. Install `NirnCommand-Personal-AllIn.zip` as a separate mod in Mod Organizer 2 and enable `NirnCommand.esp`. Disable the previous Nirn Command prototype so that it does not override these files.
2. Enable SKSE, Magelight UI 1.9.2 or newer, and PapyrusUtil. Console actions additionally need ConsoleUtilSSE NG. SkyrimNet and Open Animation Replacer are needed only for their corresponding actions.
3. Launch Skyrim through the matching SKSE executable, load a save, and press Insert. A separate test save is recommended.

The intended design target is Skyrim SE/AE 1.6.1170. The locally inspected Nolvus MO2 profile contains Skyrim 1.5.97. Use versions of SKSE and each dependency built for your actual executable. The package has not been run in Skyrim, and compatibility with either runtime is not yet verified.

## Actions

The catalog reads weapons, armor, potions and known spells from the current player. Enter equips an item or consumes a potion through the game; Ctrl+Enter selects the left hand for a spell. Favorites and recent use are stored globally by Magelight, not per save. A form that cannot be identified unambiguously cannot be favorited. Individual instances of the same base item are not distinguished.

Type `> tgm` or another console command and press Enter to send it. Commands and travel presets execute only when selected. Console and simulated shortcuts report **sent**, not verified success. SkyrimNet entries call its native API. The OAR entry simulates the configured key and may not be received by the OAR DLL. Open OAR manually if needed.

Select **Nirn Command — Clear history** or **Clear favorites** twice within five seconds to clear the chosen list. Search for **Toggle unavailable actions** to show or hide commands whose dependencies were not detected, or **Refresh catalog** to request a new scan.

If Magelight localStorage is unavailable, PapyrusUtil writes a global fallback under `Data/SKSE/Plugins/StorageUtilData/NirnCommand/preferences.json`; MO2 normally places generated files in Overwrite. This fallback is not save-specific.

## Custom commands

Edit `Magelight/NirnCommand/views/palette/user-commands.js` in this mod. Keep stable unique IDs beginning with `user:`. For example:

```js
window.NIRN_USER_COMMANDS = [
  { id: 'user:dragonreach', label: 'Travel — Dragonsreach', kind: 'Travel',
    keywords: 'whiterun', action: 'console:coc WhiterunDragonsreach' },
  { id: 'user:gold', label: 'Add 1000 gold', kind: 'Console',
    action: 'console:player.additem f 1000' }
];
```

Reload the game to load edits. Duplicate IDs are ignored in favor of the earlier entry. Supported action prefixes are `console:`, `skyrimnet:` and `shortcut:<DirectInput key>:<modifier mask>`; modifier bits are Shift=1, Ctrl=2 and Alt=4. Only select commands you intend to execute. Files are loaded as JavaScript, so only edit or install trusted files.

## Shortcut detection

The optional `tools/scan-shortcuts.js` reads the enabled mods in an MO2 profile and writes a generated `scanned-commands.js`. It currently detects the highest-priority OAR INI binding only. It never writes another mod's configuration. From the source checkout:

```powershell
node tools/scan-shortcuts.js 'D:/path/to/MODS' 'Profile name' 'Magelight/NirnCommand/views/palette/scanned-commands.js'
```

Run the build again to include the result, or place the generated file in the installed Nirn Command mod. Detection identifies a configured key; it does not prove OAR accepts simulated input.

## Logs and reporting

Magelight logs are normally under `Documents/My Games/Skyrim Special Edition/SKSE/Magelight.log` and Papyrus logs under `Documents/My Games/Skyrim Special Edition/Logs/Script/Papyrus.0.log` when Papyrus logging is enabled. Include the relevant `[NirnCommand]` lines and use `BUG_REPORT_TEMPLATE.md`. Paths may differ when MO2 uses profile-specific documents.

## Build

Install Node.js, the Creation Kit Papyrus compiler and the matching Skyrim, SKSE, Magelight, PapyrusUtil and SkyrimNet script sources. Copy `config.example.json` to ignored `config.local.json` and fill its paths. Run `./build.ps1`. It generates the ESP and SEQ, compiles the controller, checks JS syntax and the ESP with xEdit's command-line dumper, then creates `dist/NirnCommand-Personal-AllIn.zip`. It does not modify MO2 or other mods.
