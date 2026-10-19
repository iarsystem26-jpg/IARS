import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { DropdownPanel } from './DropdownPanel';

export type Suggestion = { id: string; label: string; detail: string; keywords?: string };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function rankSuggestions(options: Suggestion[], query: string) {
  const needle = normalize(query);
  if (!needle) return [];
  const tokens = needle.split(/\s+/);
  return options.map(option => {
    const label = normalize(option.label), detail = normalize(option.detail), keywords = normalize(option.keywords || '');
    const all = `${label} ${detail} ${keywords}`;
    const match = tokens.every(token => all.includes(token)) || [label, detail, keywords].some(text => text.replace(/ /g, '').includes(needle.replace(/ /g, '')));
    const score = label === needle || keywords === needle ? 0 : label.startsWith(needle) ? 1 : tokens.every(token => label.includes(token)) ? 2 : 3;
    return { option, match, score };
  }).filter(row => row.match).sort((a,b) => a.score - b.score || a.option.label.localeCompare(b.option.label) || a.option.id.localeCompare(b.option.id)).map(row => row.option);
}

/** Search-only picker. Selecting a suggestion adds it; free text never creates an item. */
export function SearchSuggest({ label, placeholder, options, onSelect }: { label:string; placeholder:string; options:Suggestion[]; onSelect:(id:string)=>void }) {
  const id = useId();
  const [query,setQuery] = useState('');
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => rankSuggestions(options,query),[options,query]);
  const visible = matches.slice(0,8);
  const expanded = open && Boolean(normalize(query));
  const index = Math.min(active, Math.max(0,visible.length-1));
  useEffect(() => { if (expanded) list.current?.children[index]?.scrollIntoView?.({block:'nearest'}); },[index,expanded]);
  const select = (option:Suggestion) => { onSelect(option.id); setQuery(''); setActive(0); setOpen(false); input.current?.focus(); };
  return <div className="relative min-w-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="app-field-label">{label}</label>
    <div className="relative mt-2"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-suggestions`} aria-activedescendant={expanded && visible.length ? `${id}-option-${index}` : undefined} aria-describedby={`${id}-hint`} autoComplete="off" className="app-search-input" placeholder={placeholder} value={query} onFocus={() => setOpen(true)} onChange={e => {setQuery(e.target.value);setActive(0);setOpen(true);}} onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') {e.preventDefault();e.stopPropagation();setOpen(false);}
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {e.preventDefault();setOpen(true);setActive(expanded ? (index + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % (visible.length || 1) : 0);}
        if (e.key === 'Enter') {e.preventDefault(); if (expanded && visible[index]) select(visible[index]);}
      }} />
      {query && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} className="app-icon-button absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-lg" onClick={() => {setQuery('');setActive(0);input.current?.focus();}}><X size={17} /></button>}
    </div>
    <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">Type to search. Select a suggestion to add it; use arrow keys and Enter with a keyboard.</p>
    <DropdownPanel open={expanded} anchorRef={input} className="absolute z-50 mt-2 w-full p-1">
      <ul ref={list} id={`${id}-suggestions`} role="listbox" aria-label={`${label} suggestions`} className="custom-scrollbar max-h-72 overflow-auto">{visible.map((option,i) => <li id={`${id}-option-${i}`} key={option.id} role="option" aria-selected={i === index} className="app-dropdown-option" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => select(option)}>
        <span className="block break-words font-semibold">{option.label}</span><span className="app-dropdown-meta mt-1 block break-words">{option.detail}</span>
      </li>)}</ul>
      <p role="status" className="app-dropdown-meta px-3 py-2">{matches.length ? matches.length > 8 ? `Showing 8 of ${matches.length} matches. Type more to narrow the results.` : `${matches.length} matching ${matches.length === 1 ? 'result' : 'results'}.` : 'No unselected matches in your assigned scope. Try a name, ID, or class.'}</p>
    </DropdownPanel>
  </div>;
}
