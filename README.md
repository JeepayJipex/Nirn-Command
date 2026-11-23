# Nirn Command v0.5.0 — Smart Search

Nirn Command is a compact in-game command palette for Skyrim SE/AE. Open it with **Insert** by default, search, navigate with the arrow keys and press Enter. Ctrl+Enter equips a spell in the left hand; Ctrl+D or the star toggles a favorite.

## Installation

1. Install `NirnCommand-v0.5.0-world-search-review.zip` as a separate mod in Mod Organizer 2. Enable `NirnCommand.esp` and disable older copies of Nirn Command so they do not override it.
2. Install the versions of SKSE and Address Library matching your Skyrim executable. Magelight UI 1.9.2 or newer and PapyrusUtil are required. Console commands additionally need ConsoleUtilSSE NG. SkyrimNet is optional.
3. Launch Skyrim through SKSE under MO2, load a save and press Insert. Use the palette entry **Nirn Command — Change opening shortcut** to set a different key, with optional left or right Shift, Ctrl and Alt. Page Up is reserved for Magelight's default host control. Escape closes the palette.

The DLL is built for Skyrim SE 1.5.97 and AE 1.6.1170, not VR. Use matching versions of every dependency. Automated builds do not establish that this release works in a Skyrim session; runtime behavior remains unverified until played.

Use the category buttons or Tab / Shift+Tab to switch between All, Actions, Items, Spells, NPCs and Locations. Search ignores accents and capitalization, accepts partial words in any order, and tolerates small typing errors.

## World search review

The NPCs category searches nearby named, living humanoid actors currently processed by Skyrim. Select one to inspect its approximate distance, direction and available location. Actor results are temporary and cannot be added to favorites. The radius defaults to 8192 Skyrim units and can be adjusted as described in [the feasibility notes](docs/world-search-feasibility.md).

The Locations category is deliberately restricted to discoveries observed after installing this version and successfully correlated to a marker reference. It does not infer discovery from a visible map marker or fast-travel availability. It stores confirmed references in the character's SKSE co-save and rechecks them after loading. Older discoveries are not imported. Correlation without opening the map, including on Solstheim and in mod-added worldspaces, needs in-game verification. If the engine's marker list does not contain a discovered marker at the event, that location is omitted and the native log records an unresolved event.

Select a location to inspect its available worldspace. **Open general map** releases Nirn Command's pause and requests the normal map; it does not center the marker or start fast travel. World entries are not persisted as favorites or history.

For an in-game review, check: a named Whiterun NPC and its detail view; movement to another cell; loading another save; a newly discovered marker before opening the map; the absence of an undiscovered marker; Solstheim and a mod-added marker; and the map action, shortcut-only opening, pause, items and spells. Include `NirnCommandNative.log`, Papyrus and Magelight logs with the results. Compilation and automated tests do not verify these Skyrim runtime behaviors.

## Actions and discovery

The player inventory and known spells are cached in the background. Base spells and spells added to the actor are combined. Inventory events update changed forms, while the periodic check reconciles known spells. A manual refresh rebuilds the inventory snapshot. Searches keep using the last completed catalog during a refresh. A newly loaded save starts with an empty catalog while its own catalog is prepared. **Nirn Command — Refresh catalog** requests another background refresh.

Enter equips or uses a listed item, or equips a spell in the right hand. The action verifies the item or spell is still available. Individual instances of the same base item are not distinguished. Type `> tgm` or another console command and press Enter to send it. Console and simulated shortcut actions report **sent**: delivery to another mod is not proof that it acted.

SkyrimNet commands use its native hotkey APIs. Providers may declare console and shortcut actions in JSON files under the virtual Data directory. See [the provider specification](docs/providers.md) and the fictional example in `examples/`.

The background discovery reads MCM Helper's virtual `MCM/Settings/keybinds.json` together with matching `MCM/Config/<mod>/keybinds.json` definitions. It displays the configured action and source, labels simulated execution as unverified, and identifies a declared Papyrus target when its form and script are bound in the running VM. It never creates an action from a key alone. This is best-effort discovery: not all Papyrus registrations, SKSE plugins, custom formats, profile changes or keys held only in a save can be discovered. A file visible in MO2's virtual Data tree does not establish that a mod has loaded or reread it.

## Customize in game

Search **Nirn Command — Manage commands** to create, edit or delete commands. Give each command a name and choose a captured keyboard shortcut, a console command, or a known integration. For capture, press the desired left or right modifiers first, then the main key. Escape cancels capture; Save applies it. The shortcut associated with a custom command is sent when the command is selected in the palette; it is not a global trigger.

Search **Nirn Command — Customize provider commands** to remap shortcuts, hide provider commands or restore their defaults. Overrides are stored in `Data/SKSE/Plugins/NirnCommand/overrides.json` separately from provider files and survive provider removal.

On first use, valid entries from the old `user-commands.js` are imported once. Custom commands and the opening shortcut are stored globally under `Data/SKSE/Plugins/NirnCommand/` through MO2, usually in Overwrite. Preserve those files when changing profiles or replacing the mod. Favorites and history continue to use Magelight storage, with the previous PapyrusUtil fallback. None of these settings are character-specific.

**Clear history** and **Clear favorites** require a second activation within five seconds. **Toggle unavailable actions** changes whether actions with missing dependencies are shown.

## Logs and reporting

Include the relevant `[NirnCommand]` lines from Papyrus logs, `NirnCommandNative.log`, Magelight's log, the executable and SKSE versions, the active MO2 profile, and the steps to reproduce. Paths vary when MO2 uses profile-specific documents. `BUG_REPORT_TEMPLATE.md` lists the useful details.

## Build

The native Windows build uses CommonLibSSE-NG, vcpkg and CMake. GitHub Actions builds the DLL and runs the native tests; the artifact contains the DLL and dependency license files. Place the DLL at `build/native/NirnCommandNative.dll` and the artifact's `licenses` directory at `build/native/licenses`, or pass `-NativeDll` and `-NativeLicenses` to `build.ps1`.

Install Node.js, the Creation Kit Papyrus compiler and matching Skyrim, SKSE, Magelight, PapyrusUtil and SkyrimNet script sources. Copy `config.example.json` to ignored `config.local.json` and fill its local paths. Run `./build.ps1`. It checks the JS tests and syntax, builds the ESP and PEX scripts, checks the ESP with xEdit, requires the native DLL and licenses, validates the MO2 ZIP, and writes a SHA-256 sidecar. No MO2 installation or other mod's configuration is changed by the build.

## Search benchmarks

Run `node tests/performance.js` for synthetic index and search timings. To measure the actual palette's DOM updates and forced layout, open `tests/performance-browser.html` in Chromium with local file access enabled. For a reproducible Windows headless run from the repository root:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless --disable-gpu --no-sandbox --allow-file-access-from-files --disable-extensions --user-data-dir="$env:TEMP\nirn-search-benchmark" --virtual-time-budget=120000 --dump-dom "$(Resolve-Path 'tests/performance-browser.html' | ForEach-Object { [Uri]::new($_.Path).AbsoluteUri })"
```

The browser benchmark uses the real palette and synthetic catalogs, runs 10 warmups and 30 measured queries per size, and forces layout after each input. It does not measure painting, Skyrim, Magelight, or input-to-display latency in game.

