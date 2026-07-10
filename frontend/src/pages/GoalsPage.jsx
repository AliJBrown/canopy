import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target, Plus, ChevronRight, ChevronDown, X, Trash2, Pencil, Link2, Link,
  Search, CheckCircle2, AlertTriangle, AlertCircle, Clock, CircleDashed,
  Ban, EyeOff, Eye, Layers, LayoutGrid, List, Calendar, Lock, Unlock, Maximize2,
} from 'lucide-react';
import { getProjects } from '../api/projects';
import { getProjectMembers } from '../api/admin';
import { getProjectStatuses } from '../api/projectStatuses';
import {
  getGoals, createGoal, updateGoal, deleteGoal, lockGoal,
  getGoalEpics, linkEpicToGoal, unlinkEpicFromGoal, getEpicCandidates,
  excludeTicket, includeTicket,
  getGoalTickets, linkTicketToGoal, unlinkTicketFromGoal, getTicketCandidates,
} from '../api/goals';
import { Avatar, StatusBadge, TypeBadge } from '../components/Badge';
import { useProjectPermissions } from '../hooks/useProjectPermissions';
import TicketPanel from '../components/TicketPanel';
import { copyToClipboard } from '../utils/clipboard';

function parseDateStr(d) {
  return new Date(String(d).slice(0, 10) + 'T00:00:00');
}
function fmtDate(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return parseDateStr(d).toLocaleDateString('en-US', opts);
}
function daysUntil(d) {
  return Math.ceil((parseDateStr(d) - new Date()) / 86400000);
}
function dueCls(days) {
  return days < 0 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-slate-400';
}
function dueLabel(days) {
  return days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
}

const GOAL_TYPE_META = {
  objective:   { label: 'Objective',   color: 'bg-indigo-100 text-indigo-700' },
  key_result:  { label: 'Key Result',  color: 'bg-emerald-100 text-emerald-700' },
  milestone:   { label: 'Milestone',   color: 'bg-amber-100 text-amber-700' },
  initiative:  { label: 'Initiative',  color: 'bg-purple-100 text-purple-700' },
  task:        { label: 'Task',        color: 'bg-sky-100 text-sky-700' },
};

const STATUS_META = {
  not_started: { icon: CircleDashed, color: 'text-slate-400',   label: 'Not started' },
  on_track:    { icon: CheckCircle2, color: 'text-emerald-500',  label: 'On track' },
  at_risk:     { icon: AlertTriangle,color: 'text-amber-500',   label: 'At risk' },
  behind:      { icon: AlertCircle,  color: 'text-red-500',     label: 'Behind' },
  completed:   { icon: CheckCircle2, color: 'text-indigo-500',  label: 'Completed' },
  cancelled:   { icon: Ban,          color: 'text-slate-400',   label: 'Cancelled' },
};

const METRIC_TYPES = [
  { value: 'subgoals',   label: 'Sub-goal completion' },
  { value: 'completion', label: 'Ticket completion %' },
  { value: 'points',     label: 'Story points' },
  { value: 'count',      label: 'Ticket count' },
  { value: 'manual',     label: 'Manual (%)' },
  { value: 'currency',   label: 'Currency ($)' },
];

function progressColor(pct) {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#6366f1';
  if (pct >= 25) return '#f59e0b';
  return '#ef4444';
}

function StatusIcon({ status, size = 14 }) {
  const meta = STATUS_META[status] || STATUS_META.not_started;
  const Icon = meta.icon;
  return <Icon size={size} className={meta.color} title={meta.label} />;
}

function GoalTypeBadge({ type }) {
  const meta = GOAL_TYPE_META[type] || GOAL_TYPE_META.objective;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// KPI summary cards (top-level objectives only)
function KpiCards({ roots, onSelect }) {
  if (!roots.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {roots.map(goal => (
        <div key={goal.id} onClick={() => onSelect?.(goal)}
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all">
          <div className="flex items-start justify-between gap-2">
            <div>
              <GoalTypeBadge type={goal.goal_type} />
              <div className="text-sm font-semibold text-slate-800 mt-1 line-clamp-2">{goal.title}</div>
            </div>
            <StatusIcon status={goal.auto_status} size={16} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">{STATUS_META[goal.auto_status]?.label || 'Not started'}</span>
              <span className="text-sm font-bold" style={{ color: progressColor(goal.progress) }}>
                {goal.progress.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${goal.progress}%`, background: progressColor(goal.progress) }} />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            {goal.due_date ? (() => {
              const days = daysUntil(goal.due_date);
              return (
                <span className={`flex items-center gap-1 font-medium ${dueCls(days)}`}>
                  <Clock size={10} />
                  {fmtDate(goal.due_date)} · {dueLabel(days)}
                </span>
              );
            })() : <span />}
            {goal.children?.length > 0 && (
              <span className="text-slate-400">{goal.children.length} sub-goal{goal.children.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Flat tree row
function GoalRow({ goal, depth, selectedId, onSelect, canWrite, onAddChild }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = goal.children?.length > 0;

  return (
    <>
      <div
        onClick={() => onSelect(goal)}
        className={`flex items-center gap-2 py-2.5 pr-4 cursor-pointer border-b border-slate-50 transition-colors group ${
          selectedId === goal.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-slate-50 border-l-2 border-transparent'
        }`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasChildren
            ? (expanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />)
            : <span className="w-3 h-px bg-slate-200 block" />}
        </button>
        <GoalTypeBadge type={goal.goal_type} />
        <span className={`flex-1 text-sm truncate ${selectedId === goal.id ? 'text-indigo-800 font-medium' : 'text-slate-800'}`}>
          {goal.title}
        </span>
        {goal.user_id && (
          <span title="Personal goal — published to this project" className="flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
            <Lock size={8} /> Personal
          </span>
        )}
        {goal.is_locked && !goal.user_id && (
          <span title="Goal is locked" className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
            <Lock size={8} /> Locked
          </span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${goal.progress}%`, background: progressColor(goal.progress) }} />
          </div>
          <span className="text-xs font-semibold w-9 text-right" style={{ color: progressColor(goal.progress) }}>
            {goal.progress.toFixed(0)}%
          </span>
          <StatusIcon status={goal.auto_status} size={13} />
          {goal.owner && <Avatar user={goal.owner} size="xs" />}
          {goal.due_date && (() => {
            const days = daysUntil(goal.due_date);
            return (
              <div className="hidden md:flex flex-col items-end flex-shrink-0" style={{ minWidth: 64 }}>
                <span className={`text-[11px] font-semibold ${dueCls(days)}`}>
                  {fmtDate(goal.due_date, { month: 'short', day: 'numeric' })}
                </span>
                <span className={`text-[10px] ${dueCls(days)}`}>{dueLabel(days)}</span>
              </div>
            );
          })()}
          {canWrite && (
            <button onClick={e => { e.stopPropagation(); onAddChild(goal); }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-indigo-600 rounded flex-shrink-0"
              title="Add sub-goal">
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>
      {expanded && hasChildren && goal.children.map(child => (
        <GoalRow key={child.id} goal={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} canWrite={canWrite} onAddChild={onAddChild} />
      ))}
    </>
  );
}

// Goal create/edit form
function GoalForm({ projectId, members, parentId = null, existing = null, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: existing?.title || '',
    description: existing?.description || '',
    goal_type: existing?.goal_type || 'objective',
    metric_type: existing?.metric_type || 'completion',
    target_value: existing?.target_value || '',
    current_value: existing?.current_value || '',
    unit: existing?.unit || '%',
    weight: existing?.weight || 1,
    owner_id: existing?.owner_id || '',
    start_date: existing?.start_date || '',
    due_date: existing?.due_date || '',
    status: existing?.status || 'not_started',
    parent_id: parentId || existing?.parent_id || null,
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const needsTarget = ['points', 'count', 'manual', 'currency'].includes(form.metric_type);

  return (
    <div className="space-y-3">
      <input value={form.title} onChange={set('title')} placeholder="Goal title" autoFocus required
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
      <textarea value={form.description} onChange={set('description')} placeholder="Description (optional)" rows={2}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
          <select value={form.goal_type} onChange={set('goal_type')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300">
            {Object.entries(GOAL_TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Progress metric</label>
          <select value={form.metric_type} onChange={set('metric_type')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300">
            {METRIC_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
      {needsTarget && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Target value</label>
            <input type="number" value={form.target_value} onChange={set('target_value')} placeholder="100"
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
          </div>
          {(form.metric_type === 'manual' || form.metric_type === 'currency') && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Current value</label>
              <input type="number" value={form.current_value} onChange={set('current_value')} placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Owner</label>
          <select value={form.owner_id} onChange={set('owner_id')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="">Unowned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Weight</label>
          <input type="number" min="0.1" step="0.1" value={form.weight} onChange={set('weight')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Start date</label>
          <input type="date" value={form.start_date} onChange={set('start_date')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={form.due_date} onChange={set('due_date')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
      </div>
      {existing && (
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Status override</label>
          <select value={form.status} onChange={set('status')}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300">
            {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={() => { if (form.title.trim()) onSave(form); }}
          disabled={!form.title.trim()}
          className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40">
          {existing ? 'Save changes' : 'Create goal'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Epic search + link panel
function EpicLinker({ projectId, goalId, onClose }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: epics = [] } = useQuery({
    queryKey: ['epic-candidates', goalId, search],
    queryFn: () => getEpicCandidates(projectId, goalId, search),
    enabled: !!goalId,
  });

  const link = useMutation({
    mutationFn: (epicId) => linkEpicToGoal(projectId, goalId, epicId),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); qc.invalidateQueries(['goal-epics', goalId]); onClose(); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Link an Epic</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <p className="text-xs text-slate-500">
        All sub-tickets of the epic will count toward this goal automatically. You can exclude specific sub-tickets individually.
      </p>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search epics..."
          autoFocus
          className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
      </div>
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {epics.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2 text-center">
            {search ? 'No epics match your search' : 'No epics available to link'}
          </p>
        )}
        {epics.map(epic => (
          <button key={epic.id} onClick={() => link.mutate(epic.id)} disabled={link.isPending}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-50 text-left transition-colors group">
            <Layers size={13} className="text-purple-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">{epic.title}</div>
              <div className="text-[10px] text-slate-400">{epic.ticket_key} · {epic.sub_ticket_count} sub-tickets</div>
            </div>
            <span className="text-[10px] text-indigo-500 font-medium opacity-0 group-hover:opacity-100 flex-shrink-0">Link</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Direct ticket search + link panel
function TicketLinker({ projectId, goalId, onClose }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: candidates = [] } = useQuery({
    queryKey: ['ticket-candidates', goalId, search],
    queryFn: () => getTicketCandidates(projectId, goalId, search),
    enabled: !!goalId,
  });

  const link = useMutation({
    mutationFn: (ticketId) => linkTicketToGoal(projectId, goalId, ticketId),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); qc.invalidateQueries(['goal-tickets', goalId]); onClose(); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Link a Ticket Directly</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <p className="text-xs text-slate-500">
        For individual tickets not part of an epic.
      </p>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."
          autoFocus
          className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
      </div>
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2 text-center">
            {search ? 'No tickets match' : 'Type to search tickets'}
          </p>
        )}
        {candidates.map(t => (
          <button key={t.id} onClick={() => link.mutate(t.id)} disabled={link.isPending}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-50 text-left transition-colors group">
            <TypeBadge type={t.type} />
            <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{t.ticket_key}</span>
            <span className="text-xs text-slate-700 flex-1 truncate">{t.title}</span>
            <StatusBadge status={t.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

// Copy link button
function CopyLinkButton({ url }) {
  const [status, setStatus] = useState(null); // null | 'copied' | 'failed'
  const copy = async () => {
    const ok = await copyToClipboard(url);
    setStatus(ok ? 'copied' : 'failed');
    setTimeout(() => setStatus(null), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy link"
      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
      {status === 'copied'
        ? <span className="text-[10px] font-medium text-indigo-600 px-0.5">Copied!</span>
        : status === 'failed'
        ? <span className="text-[10px] font-medium text-red-500 px-0.5">Failed</span>
        : <Link size={14} />}
    </button>
  );
}

// Goal detail panel
function GoalPanel({ goal, projectId, projectKey, members, canWrite, canDelete, canLockGoals, onClose, onDeleted, onAddChild, onTicketClick }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [showLinker, setShowLinker] = useState(null); // 'epic' | 'ticket' | null
  const [expandedEpics, setExpandedEpics] = useState({});

  const { data: linkedEpics = [] } = useQuery({
    queryKey: ['goal-epics', goal.id],
    queryFn: () => getGoalEpics(projectId, goal.id),
  });

  const { data: directTickets = [] } = useQuery({
    queryKey: ['goal-tickets', goal.id],
    queryFn: () => getGoalTickets(projectId, goal.id),
  });

  const updateMut = useMutation({
    mutationFn: (data) => updateGoal(projectId, goal.id, data),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteGoal(projectId, goal.id),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); onDeleted(); },
  });
  const updateCurrentValue = useMutation({
    mutationFn: (v) => updateGoal(projectId, goal.id, { current_value: v }),
    onSuccess: () => qc.invalidateQueries(['goals', projectId]),
  });
  const unlinkEpic = useMutation({
    mutationFn: (epicId) => unlinkEpicFromGoal(projectId, goal.id, epicId),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); qc.invalidateQueries(['goal-epics', goal.id]); },
  });
  const unlinkTicket = useMutation({
    mutationFn: (ticketId) => unlinkTicketFromGoal(projectId, goal.id, ticketId),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); qc.invalidateQueries(['goal-tickets', goal.id]); },
  });
  const toggleExclude = useMutation({
    mutationFn: ({ ticketId, isExcluded }) =>
      isExcluded ? includeTicket(projectId, goal.id, ticketId) : excludeTicket(projectId, goal.id, ticketId),
    onSuccess: () => { qc.invalidateQueries(['goals', projectId]); qc.invalidateQueries(['goal-epics', goal.id]); },
  });
  const toggleLock = useMutation({
    mutationFn: (is_locked) => lockGoal(projectId, goal.id, is_locked),
    onSuccess: () => qc.invalidateQueries(['goals', projectId]),
  });

  const effectiveCanWrite = canWrite && (!goal.is_locked || canLockGoals);

  const statusMeta = STATUS_META[goal.auto_status] || STATUS_META.not_started;
  const totalContributing = linkedEpics.reduce((s, e) => s + parseInt(e.total_sub_tickets || 0), 0) + directTickets.length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex-1 min-w-0 pr-2">
          <GoalTypeBadge type={goal.goal_type} />
          <h2 className="text-base font-bold text-slate-900 mt-1.5 leading-tight">{goal.title}</h2>
          {goal.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-3">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <CopyLinkButton url={`${window.location.origin}/p/${projectKey}/goals?goal=${goal.id}`} />
          {canLockGoals && !goal.user_id && (
            <button
              onClick={() => toggleLock.mutate(!goal.is_locked)}
              disabled={toggleLock.isPending}
              title={goal.is_locked ? 'Unlock goal' : 'Lock goal'}
              className={`p-1.5 rounded transition-colors ${goal.is_locked ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}>
              {goal.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          )}
          {effectiveCanWrite && (
            <button onClick={() => setEditing(e => !e)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (!goal.is_locked || canLockGoals) && (
            <button onClick={() => { if (confirm('Delete this goal and all its children?')) deleteMut.mutate(); }}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={() => navigate(`/goals/${goal.id}`)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            title="Open full page">
            <Maximize2 size={14} />
          </button>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {editing ? (
          <GoalForm projectId={projectId} members={members} existing={goal}
            onSave={(data) => updateMut.mutate(data)}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            {/* Progress */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon status={goal.auto_status} size={16} />
                  <span className={`text-sm font-semibold ${statusMeta.color}`}>{statusMeta.label}</span>
                </div>
                <span className="text-2xl font-bold" style={{ color: progressColor(goal.progress) }}>
                  {goal.progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${goal.progress}%`, background: progressColor(goal.progress) }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <span className="font-semibold">Metric: </span>
                  {METRIC_TYPES.find(m => m.value === goal.metric_type)?.label || goal.metric_type}
                </div>
                {goal.target_value && (
                  <div><span className="font-semibold">Target: </span>{goal.target_value} {goal.unit}</div>
                )}
                {goal.metric_type === 'subgoals' && (
                  <div className="col-span-2">
                    <span className="font-semibold">Sub-goals: </span>
                    {(goal.children || []).filter(c => c.auto_status === 'completed').length} / {(goal.children || []).length} complete
                  </div>
                )}
                {goal.metric_type === 'completion' && (
                  <div className="col-span-2">
                    <span className="font-semibold">Tickets: </span>
                    {parseInt(goal.completed_count) || 0} / {parseInt(goal.linked_count) || 0} done
                    {totalContributing > 0 && ` (${totalContributing} tracked)`}
                  </div>
                )}
              </div>
              {(goal.metric_type === 'manual' || goal.metric_type === 'currency') && canWrite && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                  <span className="text-xs text-slate-500 flex-shrink-0">Current value:</span>
                  <input type="number" defaultValue={goal.current_value}
                    onBlur={e => updateCurrentValue.mutate(parseFloat(e.target.value) || 0)}
                    className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                  <span className="text-xs text-slate-400">{goal.unit}</span>
                </div>
              )}
            </div>

            {/* Meta */}
            {(goal.owner || goal.start_date || goal.due_date) && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {goal.owner && (
                  <div>
                    <div className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Owner</div>
                    <div className="flex items-center gap-1.5">
                      <Avatar user={goal.owner} size="xs" />
                      <span className="text-slate-700">{goal.owner.name}</span>
                    </div>
                  </div>
                )}
                {(goal.start_date || goal.due_date) && (
                  <div>
                    <div className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Timeline</div>
                    <div className="space-y-0.5">
                      {goal.start_date && (
                        <div className="text-slate-700">Start: {fmtDate(goal.start_date)}</div>
                      )}
                      {goal.due_date && (() => {
                        const days = daysUntil(goal.due_date);
                        return (
                          <div className={`font-semibold ${dueCls(days)}`}>
                            Due: {fmtDate(goal.due_date)} · {dueLabel(days)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-goals */}
            {goal.children?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Sub-goals ({goal.children.length})
                </div>
                <div className="space-y-1.5">
                  {goal.children.map(child => (
                    <div key={child.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                      <GoalTypeBadge type={child.goal_type} />
                      <span className="flex-1 text-xs text-slate-700 truncate">{child.title}</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${child.progress}%`, background: progressColor(child.progress) }} />
                      </div>
                      <span className="text-[11px] font-semibold w-8 text-right" style={{ color: progressColor(child.progress) }}>
                        {child.progress.toFixed(0)}%
                      </span>
                      <StatusIcon status={child.auto_status} size={12} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Work Sources */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Work Sources
                </div>
                {canWrite && !showLinker && (
                  <div className="flex gap-1">
                    <button onClick={() => setShowLinker('epic')}
                      className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors">
                      <Layers size={11} /> Link Epic
                    </button>
                    <button onClick={() => setShowLinker('ticket')}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                      <Link2 size={11} /> Link Ticket
                    </button>
                  </div>
                )}
              </div>

              {/* Epic/Ticket linker panels */}
              {showLinker === 'epic' && (
                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <EpicLinker projectId={projectId} goalId={goal.id} onClose={() => setShowLinker(null)} />
                </div>
              )}
              {showLinker === 'ticket' && (
                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <TicketLinker projectId={projectId} goalId={goal.id} onClose={() => setShowLinker(null)} />
                </div>
              )}

              {/* Linked epics */}
              {linkedEpics.length === 0 && directTickets.length === 0 && !showLinker && (
                <div className="text-center py-5 text-xs text-slate-400">
                  <Layers size={24} className="mx-auto mb-2 text-slate-200" />
                  <p>No work linked yet.</p>
                  {canWrite && <p className="mt-1">Link an epic to automatically track all its sub-tickets, or link individual tickets.</p>}
                </div>
              )}

              {linkedEpics.map(epic => {
                const isOpen = expandedEpics[epic.id] !== false; // default open
                const doneCount = parseInt(epic.done_sub_tickets || 0);
                const totalCount = parseInt(epic.total_sub_tickets || 0);
                const excludedCount = parseInt(epic.excluded_count || 0);
                const effectiveTotal = totalCount - excludedCount;

                return (
                  <div key={epic.id} className="mb-2 border border-slate-200 rounded-xl overflow-hidden">
                    {/* Epic header */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedEpics(s => ({ ...s, [epic.id]: !isOpen }))}>
                      <button className="text-slate-400 flex-shrink-0">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <Layers size={12} className="text-purple-500 flex-shrink-0" />
                      <button onClick={e => { e.stopPropagation(); onTicketClick(epic.id); }}
                        className="flex-1 text-xs font-semibold text-slate-700 truncate text-left hover:text-indigo-600 transition-colors">
                        {epic.title}
                      </button>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 font-mono">{epic.ticket_key}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-12 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${effectiveTotal > 0 ? (doneCount / effectiveTotal) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                          {doneCount}/{effectiveTotal}
                          {excludedCount > 0 && <span className="text-slate-400 ml-1">({excludedCount} excluded)</span>}
                        </span>
                      </div>
                      {canWrite && (
                        <button onClick={e => { e.stopPropagation(); unlinkEpic.mutate(epic.id); }}
                          className="p-0.5 text-slate-300 hover:text-red-400 rounded flex-shrink-0 ml-1"
                          title="Unlink epic">
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Sub-tickets */}
                    {isOpen && (
                      <div className="divide-y divide-slate-50">
                        {epic.sub_tickets?.length === 0 && (
                          <p className="px-4 py-3 text-xs text-slate-400 italic">No sub-tickets yet</p>
                        )}
                        {epic.sub_tickets?.map(t => (
                          <div key={t.id}
                            className={`flex items-center gap-2 px-4 py-2 transition-colors ${t.is_excluded ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50'}`}>
                            <TypeBadge type={t.type} />
                            <button onClick={() => onTicketClick(t.id)}
                              className="text-[11px] text-slate-400 font-mono hover:text-indigo-600 flex-shrink-0 transition-colors">
                              {t.ticket_key}
                            </button>
                            <button onClick={() => onTicketClick(t.id)}
                              className="text-xs text-slate-700 flex-1 truncate text-left hover:text-indigo-700 transition-colors">
                              {t.title}
                            </button>
                            {t.assignee && <Avatar user={t.assignee} size="xs" />}
                            <StatusBadge status={t.status} />
                            {canWrite && (
                              <button
                                onClick={() => toggleExclude.mutate({ ticketId: t.id, isExcluded: t.is_excluded })}
                                className={`p-0.5 rounded flex-shrink-0 transition-colors ${
                                  t.is_excluded
                                    ? 'text-slate-300 hover:text-emerald-500'
                                    : 'text-slate-300 hover:text-red-400'
                                }`}
                                title={t.is_excluded ? 'Include in goal' : 'Exclude from goal'}>
                                {t.is_excluded ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Direct ticket links */}
              {directTickets.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 px-1">
                    Individual Tickets
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
                    {directTickets.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors">
                        <TypeBadge type={t.type} />
                        <button onClick={() => onTicketClick(t.id)}
                          className="text-[11px] text-slate-400 font-mono hover:text-indigo-600 flex-shrink-0">
                          {t.ticket_key}
                        </button>
                        <button onClick={() => onTicketClick(t.id)}
                          className="text-xs text-slate-700 flex-1 truncate text-left hover:text-indigo-700">
                          {t.title}
                        </button>
                        {t.assignee && <Avatar user={t.assignee} size="xs" />}
                        <StatusBadge status={t.status} />
                        {canWrite && (
                          <button onClick={() => unlinkTicket.mutate(t.id)}
                            className="p-0.5 text-slate-300 hover:text-red-400 rounded flex-shrink-0">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Add sub-goal */}
            {canWrite && (
              <button onClick={() => onAddChild(goal)}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                <Plus size={14} /> Add sub-goal
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Circular progress ring SVG
function ProgressRing({ progress, size = 88 }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(progress, 100) / 100);
  const color = progressColor(progress);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize="15" fontWeight="700" fill={color}>
        {Math.round(progress)}%
      </text>
    </svg>
  );
}

// Executive dashboard card — one card per top-level goal
function DashboardCard({ goal, onSelect }) {
  const statusMeta = STATUS_META[goal.auto_status] || STATUS_META.not_started;
  const children = goal.children || [];
  const MAX_SHOWN = 4;
  const shown = children.slice(0, MAX_SHOWN);
  const remaining = children.length - MAX_SHOWN;

  const daysLeft = goal.due_date ? daysUntil(goal.due_date) : null;

  return (
    <div
      onClick={() => onSelect(goal)}
      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all group flex flex-col gap-4"
    >
      {/* Type + status row */}
      <div className="flex items-center justify-between">
        <GoalTypeBadge type={goal.goal_type} />
        <div className="flex items-center gap-1.5">
          <StatusIcon status={goal.auto_status} size={14} />
          <span className={`text-xs font-semibold ${statusMeta.color}`}>{statusMeta.label}</span>
        </div>
      </div>

      {/* Ring + title */}
      <div className="flex items-center gap-4">
        <ProgressRing progress={goal.progress} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-3 group-hover:text-indigo-700 transition-colors">
            {goal.title}
          </h3>
          {goal.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{goal.description}</p>
          )}
        </div>
      </div>

      {/* Sub-goals */}
      {children.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            {children.length} sub-goal{children.length !== 1 ? 's' : ''}
          </div>
          {shown.map(child => {
            const childDays = child.due_date ? daysUntil(child.due_date) : null;
            return (
              <div key={child.id} className="flex items-center gap-2">
                <GoalTypeBadge type={child.goal_type} />
                <span className="text-xs text-slate-600 flex-1 truncate">{child.title}</span>
                {childDays !== null && (
                  <span className={`text-[10px] font-medium flex-shrink-0 ${dueCls(childDays)}`}>
                    {fmtDate(child.due_date, { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <StatusIcon status={child.auto_status} size={11} />
              </div>
            );
          })}
          {remaining > 0 && (
            <p className="text-xs text-slate-400 italic">+{remaining} more</p>
          )}
        </div>
      )}

      {/* Footer: owner + deadline */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
        {goal.owner ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={goal.owner} size="xs" />
            <span className="text-xs text-slate-500">{goal.owner.name}</span>
          </div>
        ) : <div />}
        {goal.due_date && (
          <div className="flex flex-col items-end">
            <span className={`text-xs font-semibold ${dueCls(daysLeft)}`}>
              {fmtDate(goal.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className={`text-[10px] ${dueCls(daysLeft)}`}>{dueLabel(daysLeft)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Timeline view — all goals sorted by due date, grouped into buckets
function TimelineView({ roots, selectedId, onSelect }) {
  const all = [];
  (function flatten(nodes) {
    nodes.forEach(g => { all.push(g); if (g.children?.length) flatten(g.children); });
  })(roots);

  const now = new Date();
  const week7  = new Date(now.getTime() + 7  * 86400000);
  const week30 = new Date(now.getTime() + 30 * 86400000);

  const withDue = all.filter(g => g.due_date).sort((a, b) => parseDateStr(a.due_date) - parseDateStr(b.due_date));
  const noDue   = all.filter(g => !g.due_date);

  const buckets = [
    { label: 'Overdue',        color: 'text-red-600',    bg: 'bg-red-50',    goals: withDue.filter(g => parseDateStr(g.due_date) < now) },
    { label: 'Due this week',  color: 'text-amber-600',  bg: 'bg-amber-50',  goals: withDue.filter(g => { const d = parseDateStr(g.due_date); return d >= now && d <= week7; }) },
    { label: 'Due this month', color: 'text-indigo-600', bg: 'bg-indigo-50', goals: withDue.filter(g => { const d = parseDateStr(g.due_date); return d > week7 && d <= week30; }) },
    { label: 'Later',          color: 'text-slate-500',  bg: 'bg-slate-50',  goals: withDue.filter(g => parseDateStr(g.due_date) > week30) },
  ];

  function GoalTimelineRow({ goal }) {
    const days = daysUntil(goal.due_date);
    const isSelected = selectedId === goal.id;
    return (
      <div onClick={() => onSelect(goal)}
        className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}>
        <GoalTypeBadge type={goal.goal_type} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{goal.title}</div>
          {goal.owner && (
            <div className="flex items-center gap-1 mt-0.5">
              <Avatar user={goal.owner} size="xs" />
              <span className="text-[10px] text-slate-400">{goal.owner.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: progressColor(goal.progress) }} />
          </div>
          <StatusIcon status={goal.auto_status} size={13} />
        </div>
        <div className="text-right flex-shrink-0" style={{ minWidth: 90 }}>
          <div className={`text-xs font-bold ${dueCls(days)}`}>
            {fmtDate(goal.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className={`text-[10px] ${dueCls(days)}`}>{dueLabel(days)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {withDue.length === 0 && noDue.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">No goals to show</div>
      )}
      {buckets.map(({ label, color, bg, goals }) => goals.length > 0 && (
        <div key={label}>
          <div className={`text-[10px] font-bold uppercase tracking-widest px-5 py-2 ${color} ${bg} border-b border-slate-100`}>
            {label} · {goals.length}
          </div>
          {goals.map(g => <GoalTimelineRow key={g.id} goal={g} />)}
        </div>
      ))}
      {noDue.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest px-5 py-2 text-slate-400 bg-slate-50 border-b border-slate-100">
            No due date · {noDue.length}
          </div>
          {noDue.map(g => (
            <div key={g.id} onClick={() => onSelect(g)}
              className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedId === g.id ? 'bg-indigo-50' : ''}`}>
              <GoalTypeBadge type={g.goal_type} />
              <span className="flex-1 text-sm text-slate-700 truncate">{g.title}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${g.progress}%`, background: progressColor(g.progress) }} />
                </div>
                <StatusIcon status={g.auto_status} size={13} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function flattenTree(goals, result = [], depth = 0) {
  goals.forEach(g => {
    result.push({ ...g, _depth: depth });
    if (g.children?.length) flattenTree(g.children, result, depth + 1);
  });
  return result;
}

export default function GoalsPage() {
  const { projectKey } = useParams();
  const location = useLocation();
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', project?.id],
    queryFn: () => getProjectMembers(project.id),
    enabled: !!project?.id,
  });

  const { data: roots = [], isLoading } = useQuery({
    queryKey: ['goals', project?.id],
    queryFn: () => getGoals(project.id),
    enabled: !!project?.id,
  });

  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', project?.id],
    queryFn: () => getProjectStatuses(project.id),
    enabled: !!project?.id,
  });

  const { canWrite, canDelete, canLockGoals } = useProjectPermissions(project);

  const [selectedGoal, setSelectedGoal] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createParent, setCreateParent] = useState(null);
  const [openTicketId, setOpenTicketId] = useState(null);
  const [viewMode, setViewMode] = useState('tree');

  const createMut = useMutation({
    mutationFn: (data) => createGoal(project.id, data),
    onSuccess: () => { qc.invalidateQueries(['goals', project?.id]); setShowCreate(false); setCreateParent(null); },
  });

  const handleAddChild = useCallback((parentGoal) => {
    setCreateParent(parentGoal);
    setShowCreate(true);
  }, []);

  useEffect(() => {
    if (!selectedGoal) return;
    const flat = flattenTree(roots);
    const fresh = flat.find(g => g.id === selectedGoal.id);
    if (fresh) setSelectedGoal(fresh);
  }, [roots]);

  // Deep-link support: open the goal named in ?goal=<id> once the tree has loaded
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('goal');
    if (!id || !roots.length) return;
    const flat = flattenTree(roots);
    const target = flat.find(g => String(g.id) === id);
    if (target) setSelectedGoal(target);
  }, [location.search, roots]);

  if (!project) return null;

  const showPanel = selectedGoal || showCreate;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
            {project.key.slice(0, 2)}
          </div>
          <h1 className="text-base font-semibold text-slate-800">{project.name}</h1>
          <span className="text-slate-300">/</span>
          <Target size={15} className="text-indigo-500" />
          <span className="text-sm font-medium text-slate-700">Goals & KPIs</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('dashboard')} title="Dashboard view"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setViewMode('timeline')} title="Timeline / due dates"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <Calendar size={14} />
            </button>
            <button onClick={() => setViewMode('tree')} title="Tree view"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'tree' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <List size={14} />
            </button>
          </div>
          {canWrite && !showCreate && (
            <button onClick={() => { setCreateParent(null); setShowCreate(true); setSelectedGoal(null); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} /> New goal
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className={`flex-1 overflow-y-auto scrollbar-thin ${showPanel ? 'hidden lg:block' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading goals...</div>
          ) : roots.length === 0 ? (
            <div className="text-center py-16">
              <Target size={40} className="mx-auto text-slate-300 mb-4" />
              <div className="text-slate-500 font-medium mb-1">No goals yet</div>
              <div className="text-slate-400 text-sm mb-4 max-w-sm mx-auto">
                Create top-level objectives, break them into key results, then link epics so ticket progress rolls up automatically.
              </div>
              {canWrite && (
                <button onClick={() => { setCreateParent(null); setShowCreate(true); }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors">
                  Create first goal
                </button>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
            /* ── Timeline / Due-date view ── */
            <div className="p-5">
              <p className="text-xs text-slate-400 mb-4">All goals sorted by due date. Click any row to open details.</p>
              <TimelineView
                roots={roots}
                selectedId={selectedGoal?.id}
                onSelect={(g) => { setSelectedGoal(g); setShowCreate(false); }}
              />
            </div>
          ) : viewMode === 'dashboard' ? (
            /* ── Dashboard / Executive view ── */
            <div className="p-5">
              {roots.some(g => g.goal_type === 'objective') && (
                <p className="text-xs text-slate-400 mb-4">
                  Click any card to open the detail panel. Switch to Tree view for full hierarchy.
                </p>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {roots.map(goal => (
                  <DashboardCard
                    key={goal.id}
                    goal={goal}
                    onSelect={(g) => { setSelectedGoal(g); setShowCreate(false); }}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* ── Tree view ── */
            <div className="p-5">
              <KpiCards roots={roots} onSelect={(g) => { setSelectedGoal(g); setShowCreate(false); }} />
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  <div className="flex-1 pl-6">Goal</div>
                  <div className="w-20 text-right hidden sm:block">Progress</div>
                  <div className="w-9 text-right">%</div>
                  <div className="w-4" />
                  <div className="w-5" />
                  <div className="w-16 hidden md:block" />
                  <div className="w-4" />
                </div>
                {roots.map(goal => (
                  <GoalRow key={goal.id} goal={goal} depth={0}
                    selectedId={selectedGoal?.id} onSelect={setSelectedGoal}
                    canWrite={canWrite} onAddChild={handleAddChild} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        {showPanel && (
          <div className="w-full lg:w-[440px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
            {showCreate ? (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">
                    {createParent ? `Add sub-goal to "${createParent.title.slice(0, 30)}"` : 'New goal'}
                  </h3>
                  <button onClick={() => { setShowCreate(false); setCreateParent(null); }}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                    <X size={16} />
                  </button>
                </div>
                <GoalForm projectId={project.id} members={members}
                  parentId={createParent?.id || null}
                  onSave={(data) => createMut.mutate(data)}
                  onCancel={() => { setShowCreate(false); setCreateParent(null); }} />
              </div>
            ) : selectedGoal ? (
              <GoalPanel
                key={selectedGoal.id}
                goal={selectedGoal}
                projectId={project.id}
                projectKey={projectKey}
                members={members}
                canWrite={canWrite}
                canDelete={canDelete}
                canLockGoals={canLockGoals}
                onClose={() => setSelectedGoal(null)}
                onDeleted={() => setSelectedGoal(null)}
                onAddChild={handleAddChild}
                onTicketClick={setOpenTicketId}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Ticket panel overlay — opened when a ticket is clicked */}
      {openTicketId && project && (
        <TicketPanel
          ticketId={openTicketId}
          projectId={project.id}
          projectRole={project.my_role}
          statuses={projectStatuses}
          onClose={() => setOpenTicketId(null)}
        />
      )}
    </div>
  );
}
