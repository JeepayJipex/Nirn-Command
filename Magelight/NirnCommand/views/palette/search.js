(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NirnSearch = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const words = value => normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const values = value => Array.isArray(value) ? value.join(' ') : String(value || '');
  function distance(a, b, limit) {
    if (Math.abs(a.length-b.length)>limit) return limit+1;
    let prev2=null, prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      const row=[i]; let min=i;
      for(let j=1;j<=b.length;j++) {
        let d=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) d=Math.min(d,prev2[j-2]+1);
        row.push(d); min=Math.min(min,d);
      }
      if(min>limit) return limit+1;
      prev2=prev; prev=row;
    }
    return prev[b.length];
  }
  function index(entry) {
    const label=normalize(entry.label), labelWords=words(entry.label);
    const alias=words(values(entry.aliases || entry.alias));
    const metadata=words([values(entry.keywords),entry.detail,entry.kind,entry.source].join(' '));
    return {entry,label,labelWords,alias,metadata,all:labelWords.concat(alias,metadata),fuzzy:labelWords.concat(alias)};
  }
  function rank(item, query) {
    const q=typeof query==='string' ? normalize(query) : query.q, terms=typeof query==='string' ? words(query) : query.terms;
    if(!terms.length) return -1;
    if(item.label===q) return 6;
    if(item.label.startsWith(q)) return 5;
    if(terms.every(t=>item.labelWords.some(w=>w.startsWith(t)))) return 4;
    if(terms.every(t=>item.labelWords.some(w=>w.includes(t)))) return 3;
    const all=item.all;
    if(terms.every(t=>all.some(w=>w.includes(t)))) return 2;
    const fuzzy=item.fuzzy;
    if(terms.every(t=>all.some(w=>w.includes(t)) || (t.length>=3 && fuzzy.some(w=>{const limit=t.length<=5?1:2, key=t+'\0'+w; if(query.cache && query.cache.has(key)) return query.cache.get(key); const match=distance(t,w,limit)<=limit; if(query.cache) query.cache.set(key,match); return match;})))) return 1;
    return -1;
  }
  function create() {
    const parts=new Map();
    return {
      replace(name,entries) { parts.set(name,entries.map(index)); },
      entries() { return Array.from(parts.values()).flat(); },
      search(query,options={}) {
        const fav=new Set(options.favorites || []), usage=options.usage || {}, prepared={q:normalize(query),terms:words(query),cache:new Map()};
        return this.entries().filter(x=>!options.filter || options.filter(x.entry)).map(x=>({entry:x.entry,label:x.label,rank:rank(x,prepared)})).filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank || Number(fav.has(b.entry.id))-Number(fav.has(a.entry.id)) || (usage[b.entry.id]?.useCount||0)-(usage[a.entry.id]?.useCount||0) || (usage[b.entry.id]?.lastUsedAt||0)-(usage[a.entry.id]?.lastUsedAt||0) || a.label.localeCompare(b.label) || a.entry.id.localeCompare(b.entry.id)).slice(0,options.limit || 30).map(x=>x.entry);
      }
    };
  }
  return {normalize,index,rank,create};
});
