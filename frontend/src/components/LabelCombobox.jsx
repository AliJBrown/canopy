import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Check, X } from 'lucide-react';
import { getLabels, createLabel } from '../api/labels';

const PRESET_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6',
];

function randomColor() {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
}

/**
 * Reusable label combobox — type to search, click to select, create on the fly.
 *
 * Props:
 *   projectId  — UUID, required to fetch/create labels
 *   value      — selected label ID (single-select mode) or array of IDs (multi mode)
 *   onChange   — (newValue) => void
 *   multi      — boolean, default false
 *   placeholder — string
 *   className  — additional class on the wrapper
 */
export default function LabelCombobox({
  projectId, value, onChange, multi = false, placeholder = 'Search or create label…', className = '',
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  });

  const createMut = useMutation({
    mutationFn: (name) => createLabel(projectId, { name, color: randomColor() }),
    onSuccess: (newLabel) => {
      qc.invalidateQueries({ queryKey: ['labels', projectId] });
      selectLabel(newLabel.id);
    },
  });

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const trimmed = query.trim();
  const filtered = labels.filter(l => l.name.toLowerCase().includes(trimmed.toLowerCase()));
  const exactMatch = labels.some(l => l.name.toLowerCase() === trimmed.toLowerCase());

  // Normalise value into array
  const selectedIds = multi
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : (value ? [value] : []);

  const selectedLabels = selectedIds.map(id => labels.find(l => l.id === id)).filter(Boolean);

  function selectLabel(id) {
    if (multi) {
      const next = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
      onChange(next);
    } else {
      onChange(selectedIds[0] === id ? null : id);
      setOpen(false);
    }
    setQuery('');
  }

  function removeLabel(id, e) {
    e.stopPropagation();
    if (multi) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange(null);
    }
  }

  function handleCreate() {
    if (!trimmed || createMut.isPending) return;
    createMut.mutate(trimmed);
    setQuery('');
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger / selected chips */}
      <div
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 10); }}
        className="min-h-[34px] w-full flex flex-wrap items-center gap-1 px-2 py-1 border border-slate-200 rounded-lg bg-white cursor-text hover:border-slate-300 focus-within:ring-1 focus-within:ring-indigo-300 focus-within:border-indigo-300 transition-colors"
      >
        {selectedLabels.map(l => (
          <span key={l.id}
            className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full text-white leading-none"
            style={{ background: l.color }}>
            {l.name}
            <button type="button" onClick={(e) => removeLabel(l.id, e)}
              className="opacity-70 hover:opacity-100 ml-0.5">
              <X size={9} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (filtered.length === 1) selectLabel(filtered[0].id); else if (trimmed && !exactMatch) handleCreate(); }
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          }}
          placeholder={selectedLabels.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] outline-none bg-transparent text-sm text-slate-700 placeholder-slate-400"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[200px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.length === 0 && !trimmed ? (
            <div className="px-3 py-2 text-xs text-slate-400 italic">
              {labels.length === 0 ? 'No labels yet — type to create one' : 'Type to search labels'}
            </div>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {filtered.map(l => (
                <li key={l.id}>
                  <button type="button" onClick={() => selectLabel(l.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                    <span className="flex-1 text-sm text-slate-700">{l.name}</span>
                    {selectedIds.includes(l.id) && <Check size={12} className="text-indigo-500 flex-shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create new option */}
          {trimmed && !exactMatch && (
            <button type="button" onClick={handleCreate} disabled={createMut.isPending}
              className="w-full flex items-center gap-2.5 px-3 py-2 border-t border-slate-100 hover:bg-indigo-50 transition-colors text-left">
              <Plus size={12} className="text-indigo-500 flex-shrink-0" />
              <span className="text-sm text-indigo-700 font-medium">
                {createMut.isPending ? 'Creating…' : `Create "${trimmed}"`}
              </span>
            </button>
          )}

          {trimmed && exactMatch && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400">
              Press Enter to select
            </div>
          )}
        </div>
      )}
    </div>
  );
}
