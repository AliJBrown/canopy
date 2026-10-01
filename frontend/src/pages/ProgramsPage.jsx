import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Search, Plus, Settings2, X, Check, RefreshCw, StickyNote, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { getPrograms, createProgram, updateProgram, deleteProgram } from '../api/programs';
import { getClients } from '../api/clients';
import { getUsers } from '../api/users';
import { getFeatureFlags } from '../api/featureFlags';
import { useApp } from '../context/AppContext';
import ProgramChecklistModal from '../components/ProgramChecklistModal';
import ManageProgramStagesModal from '../components/ManageProgramStagesModal';
import ProgramDetailsModal from '../components/ProgramDetailsModal';
import ProgramNotesModal from '../components/ProgramNotesModal';

const STATUS_META = {
  active:    { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700' },
  on_hold:   { label: 'On Hold',   cls: 'bg-slate-100 text-slate-500' },
  at_risk:   { label: 'At Risk',   cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-indigo-100 text-indigo-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const PAYMENT_META = {
  pending:  { label: 'Pending',  cls: 'bg-slate-100 text-slate-500' },
  invoiced: { label: 'Invoiced', cls: 'bg-amber-100 text-amber-700' },
  paid:     { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700' },
};

const PRIORITY_META = {
  p0: { label: 'P0', cls: 'bg-red-100 text-red-700',       dot: '#ef4444' },
  p1: { label: 'P1', cls: 'bg-orange-100 text-orange-700', dot: '#f97316' },
  p2: { label: 'P2', cls: 'bg-amber-100 text-amber-700',   dot: '#f59e0b' },
  p3: { label: 'P3', cls: 'bg-slate-100 text-slate-500',   dot: '#94a3b8' },
};

const DOT_PALETTE = ['#f59e0b', '#3b82f6', '#94a3b8', '#f97316', '#a855f7', '#ef4444', '#10b981', '#ec4899'];
function clientDotColor(id) {
  if (!id) return '#cbd5e1';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_PALETTE[hash % DOT_PALETTE.length];
}

function NotesDot({ show }) {
  if (!show) return null;
  return <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 border border-white" />;
}

function StageCell({ stageState, onClick }) {
  const countLabel = stageState.total > 0 ? `${stageState.done}/${stageState.total} done` : 'No checklist items';
  const manualNote = stageState.is_manual ? ' (set manually)' : '';

  if (stageState.state === 'done') {
    return (
      <button onClick={onClick} title={`${countLabel}${manualNote}`}
        className="relative w-8 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors mx-auto">
        <Check size={14} />
        <NotesDot show={stageState.has_notes} />
      </button>
    );
  }
  if (stageState.state === 'active') {
    return (
      <button onClick={onClick} title={`${countLabel}${manualNote}`}
        className="relative w-8 h-8 rounded-lg border border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition-colors mx-auto">
        <RefreshCw size={13} />
        <NotesDot show={stageState.has_notes} />
      </button>
    );
  }
  return (
    <button onClick={onClick} title={`Not started${manualNote}`}
      className="relative w-8 h-8 rounded-lg border border-transparent flex items-center justify-center hover:border-slate-200 hover:bg-slate-50 transition-colors mx-auto">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
      <NotesDot show={stageState.has_notes} />
    </button>
  );
}

function SortHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <button onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {label}
      <Icon size={12} className={active ? 'text-indigo-500' : 'text-slate-300'} />
    </button>
  );
}

function AddProgramModal({ clients, clientsEnabled, onClose }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'
  const [clientId, setClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [programName, setProgramName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [priority, setPriority] = useState('p2');
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers });

  const selectedClient = clients.find(c => c.id === clientId);
  const effectiveName = programName.trim() || (!clientsEnabled ? '' : mode === 'existing' ? selectedClient?.name : newClientName) || '';

  const mut = useMutation({
    mutationFn: () => createProgram({
      client_id: clientsEnabled && mode === 'existing' ? clientId : undefined,
      new_client: clientsEnabled && mode === 'new' ? { name: newClientName } : undefined,
      name: effectiveName,
      owner_id: ownerId || null,
      priority,
    }),
    onSuccess: () => { qc.invalidateQueries(['programs']); qc.invalidateQueries(['clients']); onClose(); },
  });

  const canSubmit = (!clientsEnabled || (mode === 'existing' ? !!clientId : newClientName.trim().length > 0))
    && effectiveName.trim().length > 0;
  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 bg-white';

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">New program</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (canSubmit) mut.mutate(); }} className="p-6 space-y-4">
          {clientsEnabled && (
            <>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
                {[['existing', 'Existing client'], ['new', 'New client']].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setMode(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mode === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>{label}</button>
                ))}
              </div>

              {mode === 'existing' ? (
                <select value={clientId} onChange={e => setClientId(e.target.value)} required autoFocus className={cls}>
                  <option value="">Select a client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input value={newClientName} onChange={e => setNewClientName(e.target.value)}
                  placeholder="New client (company) name" required autoFocus className={cls} />
              )}
            </>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Program name {clientsEnabled && <span className="font-normal normal-case text-slate-400">(defaults to client name)</span>}
            </label>
            <input value={programName} onChange={e => setProgramName(e.target.value)}
              placeholder={!clientsEnabled ? 'Program name' : mode === 'existing' ? (selectedClient?.name || 'Program name') : (newClientName || 'Program name')}
              required={!clientsEnabled} autoFocus={!clientsEnabled} className={cls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Owner</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className={cls}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={cls}>
                {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={!canSubmit || mut.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
              {mut.isPending ? 'Creating...' : 'Create program'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { search: '', clientId: '', status: '', payment: '', priority: '' };

export default function ProgramsPage() {
  const qc = useQueryClient();
  const { user } = useApp();
  const canManage = user?.role === 'admin' || user?.systemPermissions?.includes('programs.write');
  const canDelete = user?.role === 'admin' || user?.systemPermissions?.includes('programs.delete');

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [showAdd, setShowAdd] = useState(false);
  const [showManageStages, setShowManageStages] = useState(false);
  const [activeCell, setActiveCell] = useState(null); // { programId, stageId, stageName, clientName }
  const [detailsProgram, setDetailsProgram] = useState(null);
  const [notesProgram, setNotesProgram] = useState(null);

  const { data: matrix, isLoading } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: getClients });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  const { data: flags } = useQuery({ queryKey: ['feature-flags'], queryFn: getFeatureFlags });
  const clientsEnabled = flags?.clients_enabled !== false;

  const updateProg = useMutation({
    mutationFn: ({ id, ...data }) => updateProgram(id, data),
    onSuccess: () => qc.invalidateQueries(['programs']),
  });

  const deleteProg = useMutation({
    mutationFn: deleteProgram,
    onSuccess: () => qc.invalidateQueries(['programs']),
    onError: (e) => alert(e.error || 'Failed to delete program'),
  });

  const stages = matrix?.stages || [];
  const programs = matrix?.programs || [];
  const hasFilters = filters.search.trim() !== '' || filters.clientId || filters.status || filters.payment || filters.priority;

  const filtered = useMemo(() => {
    let rows = programs;
    const q = filters.search.trim().toLowerCase();
    if (q) rows = rows.filter(p => (p.client_name || '').toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    if (filters.clientId) rows = rows.filter(p => p.client_id === filters.clientId);
    if (filters.status) rows = rows.filter(p => p.status === filters.status);
    if (filters.payment) rows = rows.filter(p => p.payment_status === filters.payment);
    if (filters.priority) rows = rows.filter(p => p.priority === filters.priority);
    return rows;
  }, [programs, filters]);

  const STATUS_ORDER = Object.keys(STATUS_META);
  const PRIORITY_ORDER = Object.keys(PRIORITY_META);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort.key === 'status') cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      else if (sort.key === 'priority') cmp = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sort]);

  const inProgressCounts = useMemo(() => {
    const counts = {};
    stages.forEach(s => { counts[s.id] = 0; });
    programs.forEach(p => {
      p.stages.forEach(s => { if (s.state === 'active') counts[s.stage_id] = (counts[s.stage_id] || 0) + 1; });
    });
    return counts;
  }, [programs, stages]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Boxes size={20} className="text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-800">Programs</h1>
            {!isLoading && programs.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                {hasFilters ? `${filtered.length} of ${programs.length}` : `${programs.length} program${programs.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button onClick={() => setShowManageStages(true)}
                className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 font-medium">
                <Settings2 size={14} /> Stages
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
                <Plus size={14} /> Add program
              </button>
            )}
          </div>
        </div>

        {!isLoading && programs.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Search programs or clients"
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white w-56 placeholder:text-slate-400" />
            </div>

            <select
              value={filters.clientId}
              onChange={e => setFilters(f => ({ ...f, clientId: e.target.value }))}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                filters.clientId ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium' : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                filters.status ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium' : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            <select
              value={filters.payment}
              onChange={e => setFilters(f => ({ ...f, payment: e.target.value }))}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                filters.payment ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium' : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All payment statuses</option>
              {Object.entries(PAYMENT_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            <select
              value={filters.priority}
              onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                filters.priority ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium' : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All priorities</option>
              {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            {hasFilters && (
              <button onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-xs text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 ml-1">
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-slate-400 text-sm py-16">Loading...</div>
        ) : programs.length === 0 ? (
          <div className="text-center py-24">
            <Boxes size={36} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-semibold mb-2">No programs yet</p>
            <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
              A Program is one client project moving through your delivery pipeline. Add one to get started.
            </p>
            {canManage && (
              <button onClick={() => setShowAdd(true)}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                Add first program
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left">
                    <SortHeader label="Program" sortKey="name" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className="px-2 py-2.5 text-left">
                    <SortHeader label="Priority" sortKey="priority" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className="px-2 py-2.5 text-left">
                    <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  </th>
                  {stages.map(s => (
                    <th key={s.id} className="px-2 py-2.5 text-center min-w-[84px]">
                      <div className="w-6 h-0.5 rounded-full mx-auto mb-1.5" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight block">{s.name}</span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment</th>
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: clientDotColor(p.client_id) }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setDetailsProgram(p)}
                              className="text-sm font-semibold text-slate-800 truncate hover:text-indigo-600 transition-colors text-left">
                              {p.name}
                            </button>
                            <button onClick={() => setNotesProgram(p)} title={p.notes?.trim() ? 'View notes' : 'Add notes'}
                              className="relative p-0.5 text-slate-300 hover:text-indigo-500 flex-shrink-0">
                              <StickyNote size={12} />
                              {p.notes?.trim() && (
                                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 border border-white" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            {p.client_name && <span className="truncate">{p.client_name}</span>}
                            {p.client_name && <span>&middot;</span>}
                            <select
                              value={p.owner_id || ''}
                              disabled={!canManage}
                              onChange={ev => updateProg.mutate({ id: p.id, owner_id: ev.target.value || null })}
                              className="text-xs text-slate-400 bg-transparent border-none outline-none -ml-0.5 disabled:appearance-none">
                              <option value="">Unassigned</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={p.priority}
                        disabled={!canManage}
                        onChange={ev => updateProg.mutate({ id: p.id, priority: ev.target.value })}
                        className={`flex items-center text-xs font-semibold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer disabled:cursor-default ${PRIORITY_META[p.priority]?.cls}`}>
                        {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={p.status}
                        disabled={!canManage}
                        onChange={ev => updateProg.mutate({ id: p.id, status: ev.target.value })}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer disabled:cursor-default ${STATUS_META[p.status]?.cls}`}>
                        {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                      </select>
                    </td>
                    {p.stages.map(s => {
                      const stageDef = stages.find(st => st.id === s.stage_id);
                      return (
                        <td key={s.stage_id} className="px-2 py-3">
                          <StageCell stageState={s} onClick={() => setActiveCell({
                            programId: p.id, stageId: s.stage_id, stageName: stageDef?.name,
                            clientName: (!p.client_name || p.name === p.client_name) ? p.name : `${p.client_name} — ${p.name}`,
                          })} />
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <select
                        value={p.payment_status}
                        disabled={!canManage}
                        onChange={ev => updateProg.mutate({ id: p.id, payment_status: ev.target.value })}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer disabled:cursor-default ${PAYMENT_META[p.payment_status]?.cls}`}>
                        {Object.entries(PAYMENT_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      {canDelete && (
                        <button
                          onClick={() => { if (confirm(`Delete program "${p.name}"? This cannot be undone.`)) deleteProg.mutate(p.id); }}
                          title="Delete program"
                          className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={stages.length + 5} className="px-4 py-16 text-center text-sm text-slate-400">
                      No programs match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/60">
                    <td className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider" colSpan={3}>In progress</td>
                    {stages.map(s => (
                      <td key={s.id} className="px-2 py-2 text-center text-sm font-semibold text-slate-600">
                        {inProgressCounts[s.id] || 0}
                      </td>
                    ))}
                    <td />
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddProgramModal clients={clients} clientsEnabled={clientsEnabled} onClose={() => setShowAdd(false)} />}
      {showManageStages && <ManageProgramStagesModal stages={stages} onClose={() => setShowManageStages(false)} />}
      {activeCell && (
        <ProgramChecklistModal
          programId={activeCell.programId}
          stageId={activeCell.stageId}
          stageName={activeCell.stageName}
          clientName={activeCell.clientName}
          canManage={canManage}
          onClose={() => setActiveCell(null)}
        />
      )}
      {detailsProgram && (
        <ProgramDetailsModal
          program={detailsProgram}
          canManage={canManage}
          canDelete={canDelete}
          onClose={() => setDetailsProgram(null)}
        />
      )}
      {notesProgram && (
        <ProgramNotesModal
          program={notesProgram}
          canManage={canManage}
          onClose={() => setNotesProgram(null)}
        />
      )}
    </div>
  );
}
