(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NirnWorldCatalog = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  function create() {
    let session = '', context = '', sources = new Map();
    function reset(nextSession, nextContext) {
      const sameSession = session && session === String(nextSession);
      const locations = sameSession ? sources.get('location')?.entries : null;
      session = String(nextSession); context = String(nextContext); sources = new Map();
      if (locations) sources.set('location', {generation: 0, entries: locations, pending: null});
    }
    function source(name) {
      if (!sources.has(name)) sources.set(name, {generation: 0, entries: [], pending: null});
      return sources.get(name);
    }
    function valid(s, c, name) { return s === session && c === context && (name === 'npc' || name === 'location'); }
    return {
      reset,
      begin(s, c, name, generation, count, attempt=0) {
        if (!valid(s,c,name) || !Number.isSafeInteger(generation) || generation < 1 ||
            !Number.isSafeInteger(attempt) || attempt < 0 || !Number.isSafeInteger(count) || count < 0 || count > 10000) return false;
        const part = source(name);
        if (generation === part.generation) return 'applied';
        if (generation < part.generation || (part.pending && (generation < part.pending.generation || generation === part.pending.generation && attempt <= part.pending.attempt))) return false;
        part.pending = {generation, attempt, count, rows: [], ids: new Set()}; return true;
      },
      append(s, c, name, generation, index, row, attempt=0) {
        if (!valid(s,c,name)) return false;
        const pending = source(name).pending;
        if (!pending || pending.generation !== generation || pending.attempt !== attempt || index !== pending.rows.length || index >= pending.count ||
            !row || typeof row.id !== 'string' || !row.id || typeof row.label !== 'string' || !row.label) return false;
        if (pending.ids.has(row.id)) return false;
        pending.ids.add(row.id); pending.rows.push(row); return true;
      },
      complete(s, c, name, generation, attempt=0) {
        if (!valid(s,c,name)) return false;
        const part = source(name), pending = part.pending;
        if (!pending || pending.generation !== generation || pending.attempt !== attempt || pending.rows.length !== pending.count) return false;
        part.entries = pending.rows; part.generation = generation; part.pending = null; return true;
      },
      entries(name) { return source(name).entries.slice(); }
    };
  }
  return {create};
});
