import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, X, FolderOpen } from 'lucide-react';
import { globalSearch } from '../api/search';
import { TypeBadge } from './Badge';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function GlobalSearch({ onTicketOpen }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 250);

  const { data } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => globalSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const tickets = data?.tickets ?? [];
  const projects = data?.projects ?? [];
  const allItems = [
    ...tickets.map(t => ({ _kind: 'ticket', ...t })),
    ...projects.map(p => ({ _kind: 'project', ...p })),
  ];

  // Listen for open-global-search event from Sidebar button
  useEffect(() => {
    const handler = () => setOpen(true);
    document.addEventListener('open-global-search', handler);
    return () => document.removeEventListener('open-global-search', handler);
  }, []);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const handleSelect = useCallback((item) => {
    if (item._kind === 'ticket') {
      navigate(`/p/${item.project_key}/board?ticket=${item.id}`);
    } else {
      navigate(`/p/${item.key}/board`);
    }
    close();
  }, [navigate, close]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allItems[selectedIdx]) {
      handleSelect(allItems[selectedIdx]);
    }
  };

  useEffect(() => { setSelectedIdx(0); }, [debouncedQuery]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-slate-900/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tickets, projects…"
            className="flex-1 text-sm text-slate-800 outline-none placeholder-slate-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {debouncedQuery.length < 2 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              Type to search across all projects
            </div>
          ) : !allItems.length ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              No results for "{debouncedQuery}"
            </div>
          ) : (
            <>
              {tickets.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    Tickets
                  </div>
                  {tickets.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect({ _kind: 'ticket', ...t })}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-slate-50 ${
                        selectedIdx === i ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <TypeBadge type={t.type} />
                      <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">{t.ticket_key}</span>
                      <span className="text-sm text-slate-700 flex-1 truncate">{t.title}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{t.project_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    Projects
                  </div>
                  {projects.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelect({ _kind: 'project', ...p })}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        selectedIdx === tickets.length + i ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <FolderOpen size={14} className="text-indigo-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{p.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">{p.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
