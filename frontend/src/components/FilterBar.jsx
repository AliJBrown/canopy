import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, X, SlidersHorizontal, Tag, Bookmark, Plus } from 'lucide-react';
import { getSprints } from '../api/sprints';
import { getLabels, createLabel } from '../api/labels';
import { getSavedFilters } from '../api/savedFilters';
import { getProjectMembers } from '../api/admin';
import { STATUS_OPTIONS, TYPE_OPTIONS, PRIORITY_OPTIONS } from './Badge';

const PRESET_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#f97316'];

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

function DropFilter({ label, count, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
          count > 0
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        {label}
        {count > 0 && (
          <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl shadow-lg border border-slate-100 min-w-[180px] py-1">
          {children}
        </div>
      )}
    </div>
  );
}

function MultiCheckList({ options, selected, onChange }) {
  return (
    <>
      {options.map(o => {
        const isSelected = selected.includes(o.value);
        return (
          <label key={o.value}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
            <input type="checkbox" checked={isSelected}
              onChange={() => onChange(isSelected
                ? selected.filter(v => v !== o.value)
                : [...selected, o.value])}
              className="accent-indigo-600 rounded" />
            {o.label}
          </label>
        );
      })}
    </>
  );
}

function RadioList({ options, value, onChange, emptyLabel = 'Any' }) {
  return (
    <>
      <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-500 italic">
        <input type="radio" checked={!value} onChange={() => onChange(null)} className="accent-indigo-600" />
        {emptyLabel}
      </label>
      {options.map(o => (
        <label key={o.value}
          className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} className="accent-indigo-600" />
          {o.label}
        </label>
      ))}
    </>
  );
}

// Inline label creation embedded in a dropdown
function LabelDropContent({ projectId, labels, selectedIds, onToggle, canWrite }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const createMut = useMutation({
    mutationFn: () => createLabel(projectId, { name: name.trim(), color }),
    onSuccess: (label) => {
      qc.invalidateQueries(['labels', projectId]);
      onToggle(label.id, false);
      setName(''); setColor(PRESET_COLORS[0]); setCreating(false);
    },
  });

  return (
    <div className="min-w-[200px]">
      {labels.map(l => {
        const isSelected = selectedIds.includes(l.id);
        return (
          <label key={l.id}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
            <input type="checkbox" checked={isSelected}
              onChange={() => onToggle(l.id, isSelected)}
              className="accent-indigo-600 rounded" />
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
            {l.name}
          </label>
        );
      })}

      {canWrite && (
        creating ? (
          <div className="px-3 py-2 space-y-1.5 border-t border-slate-100">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Label name"
              autoFocus onKeyDown={e => e.key === 'Enter' && name.trim() && createMut.mutate()}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
            <div className="flex gap-1">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border-2 ${color === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => name.trim() && createMut.mutate()} disabled={!name.trim() || createMut.isPending}
                className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">
                {createMut.isPending ? '...' : 'Create'}
              </button>
              <button onClick={() => setCreating(false)} className="text-[10px] text-slate-500 px-2 py-0.5 rounded hover:bg-slate-100">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-indigo-600 border-t border-slate-100 transition-colors">
            <Plus size={11} /> Create label
          </button>
        )
      )}
    </div>
  );
}

export default function FilterBar({
  projectId,
  filters,
  setFilters,
  total,
  onOpenBuilder,
  canWrite = false,
  statuses = [],
}) {
  const [search, setSearch] = useState(filters.search || '');
  const searchTimer = useRef(null);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => getSprints(projectId),
    enabled: !!projectId,
  });
  const { data: labels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  });
  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters', projectId],
    queryFn: () => getSavedFilters(projectId),
    enabled: !!projectId,
  });

  const assignableUsers = members.filter(m => m.role !== 'viewer');
  const userOptions = assignableUsers.map(u => ({ value: u.id, label: u.name }));

  const set = (patch) => setFilters(f => ({ ...f, ...patch }));

  const handleSearch = (v) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => set({ search: v }), 300);
  };

  const activeSprints = sprints.filter(s => s.status !== 'completed');
  const sprintOptions = activeSprints.map(s => ({
    value: s.id,
    label: `${s.name}${s.status === 'active' ? ' (active)' : ''}`,
  }));

  const hasAnyFilter =
    filters.search || filters.status?.length || filters.type?.length ||
    filters.priority?.length || filters.assigneeIds?.length ||
    filters.sprintId || filters.labelIds?.length || filters.hasNoAssignee ||
    filters.filterConfig;

  const clearAll = () => {
    setSearch('');
    setFilters({
      search: '', status: [], type: [], priority: [],
      assigneeIds: [], sprintId: null, labelIds: [], hasNoAssignee: false,
      dueDateBefore: null, dueDateAfter: null, filterConfig: null,
    });
  };

  const applyFilter = (sf) => {
    const cfg = sf.filter_config;
    // New tree format — pass as filterConfig
    if (cfg && cfg.children) {
      setFilters({
        search: '', status: [], type: [], priority: [], assigneeIds: [],
        sprintId: null, labelIds: [], hasNoAssignee: false,
        dueDateBefore: null, dueDateAfter: null,
        filterConfig: cfg,
      });
      return;
    }
    // Legacy flat format
    const patch = { search: '', status: [], type: [], priority: [], assigneeIds: [], sprintId: null, labelIds: [], hasNoAssignee: false, dueDateBefore: null, dueDateAfter: null, filterConfig: null };
    (cfg?.conditions || []).forEach(c => {
      if (c.field === 'status')      patch.status     = c.values || [];
      if (c.field === 'type')        patch.type       = c.values || [];
      if (c.field === 'priority')    patch.priority   = c.values || [];
      if (c.field === 'assignee_id') patch.assigneeIds = c.values || (c.value ? [c.value] : []);
      if (c.field === 'sprint_id')   patch.sprintId   = c.value || null;
      if (c.field === 'label_id')    patch.labelIds   = c.values || [];
    });
    setFilters(patch);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search tickets..."
          className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-indigo-300 w-44"
        />
        {search && (
          <button onClick={() => handleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Sprint */}
      <DropFilter label="Sprint" count={filters.sprintId ? 1 : 0}>
        <RadioList
          options={[{ value: 'none', label: 'Backlog (no sprint)' }, ...sprintOptions]}
          value={filters.sprintId}
          onChange={v => set({ sprintId: v })}
          emptyLabel="Any sprint"
        />
      </DropFilter>

      {/* Status */}
      <DropFilter label="Status" count={filters.status?.length || 0}>
        <MultiCheckList
          options={statuses.length > 0
            ? statuses.map(s => ({ value: s.slug, label: s.name }))
            : STATUS_OPTIONS}
          selected={filters.status || []}
          onChange={v => set({ status: v })}
        />
      </DropFilter>

      {/* Type */}
      <DropFilter label="Type" count={filters.type?.length || 0}>
        <MultiCheckList
          options={TYPE_OPTIONS}
          selected={filters.type || []}
          onChange={v => set({ type: v })}
        />
      </DropFilter>

      {/* Priority */}
      <DropFilter label="Priority" count={filters.priority?.length || 0}>
        <MultiCheckList
          options={PRIORITY_OPTIONS}
          selected={filters.priority || []}
          onChange={v => set({ priority: v })}
        />
      </DropFilter>

      {/* Assignee — only non-viewers are shown */}
      <DropFilter label="Assignee" count={(filters.assigneeIds?.length || 0) + (filters.hasNoAssignee ? 1 : 0)}>
        <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 border-b border-slate-100">
          <input type="checkbox" checked={!!filters.hasNoAssignee}
            onChange={e => set({ hasNoAssignee: e.target.checked })}
            className="accent-indigo-600 rounded" />
          Unassigned
        </label>
        <MultiCheckList
          options={userOptions}
          selected={filters.assigneeIds || []}
          onChange={v => set({ assigneeIds: v })}
        />
      </DropFilter>

      {/* Label — with inline create */}
      <DropFilter label="Label" count={filters.labelIds?.length || 0}>
        <LabelDropContent
          projectId={projectId}
          labels={labels}
          selectedIds={filters.labelIds || []}
          onToggle={(id, isSelected) => set({
            labelIds: isSelected
              ? (filters.labelIds || []).filter(x => x !== id)
              : [...(filters.labelIds || []), id],
          })}
          canWrite={canWrite}
        />
      </DropFilter>

      {/* Active custom filter chip */}
      {filters.filterConfig && (
        <button
          onClick={onOpenBuilder}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-indigo-300 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
        >
          <SlidersHorizontal size={13} /> Custom filter
          <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">●</span>
        </button>
      )}

      {/* More filters (builder) */}
      <button
        onClick={onOpenBuilder}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg bg-white hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <SlidersHorizontal size={13} /> More
      </button>

      {/* Saved filter chips */}
      {savedFilters.length > 0 && (
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 ml-1">
          <Bookmark size={12} className="text-slate-400" />
          {savedFilters.map(sf => (
            <button
              key={sf.id}
              onClick={() => applyFilter(sf)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full hover:bg-violet-100 transition-colors font-medium"
            >
              <Tag size={10} /> {sf.name}
            </button>
          ))}
        </div>
      )}

      {/* Result count + clear */}
      <div className="ml-auto flex items-center gap-2">
        {total != null && (
          <span className="text-xs text-slate-400">{total.toLocaleString()} tickets</span>
        )}
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-md transition-colors"
          >
            <X size={11} /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
