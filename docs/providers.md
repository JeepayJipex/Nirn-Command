# Provider manifests (version 1)

Providers declare commands in UTF-8 JSON files directly under `Data/SKSE/Plugins/NirnCommand/Providers/`. The running game reads the active virtual Data filesystem, including MO2's priority rules. Each provider should select a globally unique, stable ID and keep each command ID stable across updates. The resulting identity is `provider:<provider-id>:<command-id>`; favorites, history, and overrides use that identity.

`schemaVersion` must be `1`. The `provider` object requires `id` and `name`, and may include `version`, `description`, and `requires`. Each command requires `id`, `name`, and `action`, and may include `keywords` and `requires`. IDs contain 1–64 lowercase ASCII letters, digits, hyphens, or underscores. Names are limited to 160 UTF-8 bytes and individual keywords to 128 bytes; total keyword text is limited to 512 bytes. `requires.plugins` is an array of ESP, ESM or ESL filenames. All requirements from both levels must be loaded.

Two action types are supported:

- `{"type":"console","command":"tgm"}` sends a console command; the command is limited to 512 UTF-8 bytes and requires ConsoleUtilSSE NG.
- `{"type":"shortcut","key":37,"modifiers":4}` sends a DirectInput scan code and a modifier bitmask. Bits are left Shift 1, right Shift 2, left Ctrl 4, right Ctrl 8, left Alt 16, right Alt 32. Modifier keys cannot be used as the primary key. A simulated key is reported as sent, not as proof that the target accepted it.

The JSON Schema in `docs/provider-v1.schema.json` describes the structural format; runtime limits count UTF-8 bytes and the combined provider and command requirements. The example in `examples/example-provider.json` is fictional and is not installed automatically. Copy it into the Providers directory to experiment. Manifests do not execute DLL functions or scripts. Players can hide provider commands, remap shortcuts, and restore defaults; their overrides are stored separately and survive provider removal and reinstallation.

Discovery ignores malformed or unsupported files and invalid commands, and rejects ambiguous duplicate command IDs. Limits are 128 files, 256 KiB per file, 2 MiB total and 2,048 command declarations per scan. Provider discovery runs independently of the item and spell catalog.
