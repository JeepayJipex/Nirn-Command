# Nirn Command v0.3.3 — Personal All-in

Nirn Command is a compact in-game command palette for Skyrim SE/AE. Open it with **Insert** by default, search, navigate with the arrow keys and press Enter. Ctrl+Enter equips a spell in the left hand; Ctrl+D or the star toggles a favorite.

## Installation

1. Install `NirnCommand-v0.3.3-Personal-AllIn.zip` as a separate mod in Mod Organizer 2. Enable `NirnCommand.esp` and disable older copies of Nirn Command so they do not override it.
2. Install the versions of SKSE and Address Library matching your Skyrim executable. Magelight UI 1.9.2 or newer and PapyrusUtil are required. Console commands additionally need ConsoleUtilSSE NG. SkyrimNet and Open Animation Replacer are optional.
3. Launch Skyrim through SKSE under MO2, load a save and press Insert. Use the palette entry **Nirn Command — Change opening shortcut** to set a different key, with optional left or right Shift, Ctrl and Alt. Page Up is reserved for Magelight's default host control. Escape closes the palette.

The DLL is built for Skyrim SE 1.5.97 and AE 1.6.1170, not VR. Use matching versions of every dependency. Automated builds do not establish that this release works in a Skyrim session; runtime behavior remains unverified until played.

## Actions and discovery

The player inventory and known spells are cached in the background. Base spells and spells added to the actor are combined. Inventory events update changed forms, while the periodic check reconciles known spells. A manual refresh rebuilds the inventory snapshot. Searches keep using the last completed catalog during a refresh. A newly loaded save starts with an empty catalog while its own catalog is prepared. **Nirn Command — Refresh catalog** requests another background refresh.

Enter equips or uses a listed item, or equips a spell in the right hand. The action verifies the item or spell is still available. Individual instances of the same base item are not distinguished. Type `> tgm` or another console command and press Enter to send it. Console and simulated shortcut actions report **sent**: delivery to another mod is not proof that it acted.

SkyrimNet commands use its native hotkey APIs. Open Animation Replacer uses its UI V3 API when available. If that API is unavailable, a separate experimental simulated shortcut is offered only when OAR is loaded and its effective virtual INI explicitly identifies the key and modifiers. OAR 3.2.1 or later is needed for UI V3.

The background discovery reads MCM Helper's virtual `MCM/Settings/keybinds.json` together with matching `MCM/Config/<mod>/keybinds.json` definitions. It displays the configured action and source, labels simulated execution as unverified, and identifies a declared Papyrus target when its form and script are bound in the running VM. It never creates an action from a key alone. This is best-effort discovery: not all Papyrus registrations, SKSE plugins, custom formats, profile changes or keys held only in a save can be discovered. A file visible in MO2's virtual Data tree does not establish that a mod has loaded or reread it.

## Customize in game

Search **Nirn Command — Manage commands** to create, edit or delete commands. Give each command a name and choose a captured keyboard shortcut, a console command, or a known integration. For capture, press the desired left or right modifiers first, then the main key. Escape cancels capture; Save applies it. The shortcut associated with a custom command is sent when the command is selected in the palette; it is not a global trigger.

On first use, valid entries from the old `user-commands.js` are imported once. Custom commands and the opening shortcut are stored globally under `Data/SKSE/Plugins/NirnCommand/` through MO2, usually in Overwrite. Preserve those files when changing profiles or replacing the mod. Favorites and history continue to use Magelight storage, with the previous PapyrusUtil fallback. None of these settings are character-specific.

**Clear history** and **Clear favorites** require a second activation within five seconds. **Toggle unavailable actions** changes whether actions with missing dependencies are shown.

## Logs and reporting

Include the relevant `[NirnCommand]` lines from Papyrus logs, `NirnCommandNative.log`, Magelight's log, the executable and SKSE versions, the active MO2 profile, and the steps to reproduce. Paths vary when MO2 uses profile-specific documents. `BUG_REPORT_TEMPLATE.md` lists the useful details.

## Build

The native Windows build uses CommonLibSSE-NG, vcpkg and CMake. GitHub Actions builds the DLL and runs the native tests; the artifact contains the DLL and dependency license files. Place the DLL at `build/native/NirnCommandNative.dll` and the artifact's `licenses` directory at `build/native/licenses`, or pass `-NativeDll` and `-NativeLicenses` to `build.ps1`.

Install Node.js, the Creation Kit Papyrus compiler and matching Skyrim, SKSE, Magelight, PapyrusUtil and SkyrimNet script sources. Copy `config.example.json` to ignored `config.local.json` and fill its local paths. Run `./build.ps1`. It checks the JS tests and syntax, builds the ESP and PEX scripts, checks the ESP with xEdit, requires the native DLL and licenses, validates the MO2 ZIP, and writes a SHA-256 sidecar. No MO2 installation or other mod's configuration is changed by the build.

The OAR UI interface header is from Open Animation Replacer by ersh, pinned at commit `f4e7688b065175aff70aa523073857911e15aca3`. Its accompanying COPYING file is included with the package. Other native dependency notices are collected from the vcpkg build.
