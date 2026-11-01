export function uniformMatchesSearch(item,query=''){
 const normalize=value=>String(value||'').normalize('NFC').toLocaleLowerCase('th').replace(/\s+/g,' ').trim();
 const text=normalize([item.title,item.name,item.group].filter(Boolean).join(' '));
 return normalize(query).split(' ').every(word=>text.includes(word));
}
