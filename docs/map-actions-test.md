# Map actions gameplay test

Install the v0.5C.3 archive in MO2 and enable it in place of the previous Nirn Command package. Launch Skyrim through SKSE and load a save with known locations in the current worldspace.

Open Nirn Command, search for a known location away from the player and press Enter. Check that the palette closes, the world map opens centered on that location, and normal control returns when the map closes. An existing destination marker should remain in place.

Camera movement and map replacement compatibility require in-game observation. If positioning does not occur, record the selected location, game and SKSE versions, active map replacement and the NirnCommandNative log under Documents/My Games/Skyrim Special Edition/SKSE. The log records whether a matching marker was found and whether positioning was invoked. An invocation alone does not confirm camera movement.

The first v0.5C.3 test found matching markers and invoked the handler, but the camera remained at the player. The follow-up waits for the map camera to enter its world state before invoking it. This explanation and the follow-up need confirmation in game.

During ordinary play, observe locations selected from interiors, other worldspaces and mod-added worldspaces, as well as map closure during initialization. Unsupported configurations should leave the general world map open.
