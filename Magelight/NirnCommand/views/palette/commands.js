// Built-in commands. User commands belong in user-commands.js.
window.NIRN_COMMANDS = [
  { id:'builtin:clear-history', label:'Nirn Command — Clear history', kind:'Utility', action:'local:clear-history', detail:'Activate twice to confirm' },
  { id:'builtin:clear-favorites', label:'Nirn Command — Clear favorites', kind:'Utility', action:'local:clear-favorites', detail:'Activate twice to confirm' },
  { id:'builtin:toggle-unavailable', label:'Nirn Command — Toggle unavailable actions', kind:'Utility', action:'local:toggle-unavailable' },
  { id:'builtin:refresh', label:'Nirn Command — Refresh catalog', kind:'Utility', action:'local:refresh' },
  { id:'builtin:skyrimnet:dashboard', label:'SkyrimNet — Dashboard', kind:'Mod', action:'skyrimnet:dashboard', keywords:'skyrimnet ai' },
  { id:'builtin:skyrimnet:gamemaster', label:'SkyrimNet — Toggle GameMaster', kind:'Mod', action:'skyrimnet:gamemaster', keywords:'skyrimnet ai' },
  { id:'builtin:skyrimnet:continuous', label:'SkyrimNet — Toggle Continuous Mode', kind:'Mod', action:'skyrimnet:continuous', keywords:'skyrimnet ai' },
  { id:'builtin:oar:menu', label:'Open Animation Replacer', kind:'Mod', action:'shortcut:24:1', detail:'Experimental default shortcut (Shift + O)', keywords:'oar animation' },
  { id:'builtin:travel:dragonsreach', label:'Travel — Dragonsreach', kind:'Travel', action:'console:coc WhiterunDragonsreach', keywords:'whiterun' },
  { id:'builtin:console:tgm', label:'Toggle god mode', kind:'Console', action:'console:tgm', keywords:'invincible' },
  { id:'builtin:console:tcl', label:'Toggle collision', kind:'Console', action:'console:tcl', keywords:'noclip' },
  { id:'builtin:console:tfc', label:'Toggle free camera', kind:'Console', action:'console:tfc', keywords:'freecam photo' }
];
