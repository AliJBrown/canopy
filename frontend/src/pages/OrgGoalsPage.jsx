import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, ChevronDown, Target, Edit2, Trash2, X,
         Search, Link, Unlink, ExternalLink, Layers, Ticket, Lock, Unlock } from 'lucide-react';
import {
  getOrgGoals, getOrgGoal, createOrgGoal, createSubGoal, updateOrgGoal, deleteOrgGoal, lockOrgGoal,
  getGoalTicketCandidates, linkTicketToOrgGoal, unlinkTicketFromOrgGoal,
} from '../api/orgGoals';
import { getProjects } from '../api/projects';
import { Avatar, TypeBadge, StatusBadge } from '../components/Badge';
import { useApp } from '../context/AppContext';
import client from '../api/client';

const STATUS_META = {
  not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-500' },
  on_track:    { label: 'On Track',    cls: 'bg-emerald-100 text-emerald-700' },
  at_risk:     { label: 'At Risk',     cls: 'bg-amber-100 text-amber-700' },
  behind:      { label: 'Behind',      cls: 'bg-red-100 text-red-700' },
  completed:   { label: 'Completed',   cls: 'bg-indigo-100 text-indigo-700' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-400' },
};

const GOAL_TYPE_META = {
  objective:  { label: 'Objective',  cls: 'bg-purple-100 text-purple-700' },
  key_result: { label: 'Key Result', cls: 'bg-blue-100 text-blue-700' },
  milestone:  { label: 'Milestone',  cls: 'bg-amber-100 text-amber-700' },
  initiative: { label: 'Initiative', cls: 'bg-teal-100 text-teal-700' },
  task:       { label: 'Task',       cls: 'bg-sky-100 text-sky-700' },
};

function progressColor(p) {
  if (p >= 80) return '#10b981';
  if (p >= 50) return '#f59e0b';
  return '#ef4444';
}

function ProgressBar({ value }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: progressColor(pct) }} />
      </div>
      <span className="text-xs text-slate-500 font-medium w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

// ─── Goal row in the main tree table ─────────────────────────────────────────

function GoalRow({ goal, depth = 0, onOpen, onDelete, users, canManage, canDelete }) {
  const [open, setOpen] = useState(true);
  const hasChildren = goal.children?.length > 0;
  const statusKey = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const typeMeta = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const owner = users.find(u => u.id === goal.owner_id);
  const daysLeft = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <>
      <tr className="group hover:bg-slate-50 border-b border-slate-50 transition-colors">
        <td className="py-2.5 pr-3" style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(o => !o)}
              className={`w-4 h-4 flex-shrink-0 text-slate-400 ${hasChildren ? 'hover:text-slate-600' : 'opacity-0 pointer-events-none'}`}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.cls}`}>
              {typeMeta.label}
            </span>
            <button
              onClick={() => onOpen(goal.id)}
              className="text-sm text-slate-800 font-medium truncate max-w-[240px] hover:text-indigo-700 text-left transition-colors">
              {goal.title}
            </button>
            {goal.is_locked && (
              <Lock size={11} className="text-amber-500 flex-shrink-0" title="Locked" />
            )}
            {/* Project badge for project-scoped sub-goals */}
            {goal.project && (
              <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                {goal.project.key}
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 pr-4 min-w-[140px]">
          <ProgressBar value={goal.progress} />
        </td>
        <td className="py-2.5 pr-4">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-xs text-slate-400">
          {goal.linked_count > 0 && (
            <span title="Linked tickets" className="text-slate-400">
              {goal.completed_count}/{goal.linked_count} tickets
            </span>
          )}
        </td>
        <td className="py-2.5 pr-4">
          {goal.due_date ? (
            <div>
              <div className={`text-xs font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-700'}`}>
                {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className={`text-[10px] ${daysLeft < 0 ? 'text-red-500 font-medium' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
              </div>
            </div>
          ) : <span className="text-slate-300 text-xs">—</span>}
        </td>
        <td className="py-2.5 pr-4">
          {owner ? (
            <div className="flex items-center gap-1.5">
              <Avatar user={owner} size="xs" />
              <span className="text-xs text-slate-500 truncate max-w-[80px]">{owner.name}</span>
            </div>
          ) : <span className="text-slate-300 text-xs">—</span>}
        </td>
        <td className="py-2.5 pr-2">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onOpen(goal.id)}
              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded text-xs font-medium px-2">
              Open
            </button>
            {canDelete && (
              <button onClick={() => onDelete(goal.id)}
                className="p-1 text-slate-300 hover:text-red-400 rounded transition-colors">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && goal.children?.map(c => (
        <GoalRow key={c.id} goal={c} depth={depth + 1}
          onOpen={onOpen} onDelete={onDelete} users={users} canManage={canManage} canDelete={canDelete} />
      ))}
    </>
  );
}

// ─── Sub-goal creation form ───────────────────────────────────────────────────

function SubGoalForm({ goalId, projects, users, onSave, onCancel, isPending }) {
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState('key_result');
  const [projectId, setProjectId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title, goal_type: goalType,
      project_id: projectId || undefined,
      owner_id: ownerId || undefined,
      due_date: dueDate || undefined,
      metric_type: 'completion',
    });
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 rounded-xl border border-indigo-100 p-4 space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus
        placeholder="Sub-goal title..."
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
          <select value={goalType} onChange={e => setGoalType(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="key_result">Key Result</option>
            <option value="initiative">Initiative</option>
            <option value="milestone">Milestone</option>
            <option value="objective">Objective</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
      </div>
      {/* Project assignment */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Assign to project <span className="font-normal normal-case">(optional — lets that project's PM link tickets)</span>
        </label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
          <option value="">No project (org-level)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
        </select>
        {projectId && (
          <p className="text-[10px] text-indigo-600 mt-1">
            This sub-goal will appear in {projects.find(p => p.id === projectId)?.name}'s Goals & KPIs page for their PM to fill in ticket requirements.
          </p>
        )}
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Owner</label>
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
          <option value="">No owner</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending || !title.trim()}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Creating...' : 'Create sub-goal'}
        </button>
      </div>
    </form>
  );
}

// ─── Ticket search + link ─────────────────────────────────────────────────────

function TicketLinker({ goalId, linkedTickets, onLink, onUnlink }) {
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['org-goal-ticket-candidates', goalId, debouncedQ],
    queryFn: () => getGoalTicketCandidates(goalId, debouncedQ),
    enabled: !!goalId && debouncedQ.length >= 2,
  });

  const linkedIds = new Set((linkedTickets || []).map(t => t.id));

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by title or ticket key (e.g. MFP-42)..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        )}
      </div>

      {/* Search results */}
      {debouncedQ.length >= 2 && (
        <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
          {candidates.length === 0 && !isFetching ? (
            <p className="text-xs text-slate-400 text-center py-4">No matching tickets</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {candidates.map(t => (
                <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                  <TypeBadge type={t.type} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-slate-400 mr-1.5">{t.ticket_key}</span>
                    <span className="text-sm text-slate-700 truncate">{t.title}</span>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    {t.project_key}
                  </span>
                  <button
                    onClick={() => { onLink(t.id); setQuery(''); setDebouncedQ(''); }}
                    className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-500 flex-shrink-0 font-medium">
                    <Plus size={10} /> Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Linked tickets */}
      {linkedTickets?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Linked tickets ({linkedTickets.length})
          </p>
          <div className="bg-white rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden">
            {linkedTickets.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 group">
                <TypeBadge type={t.type} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-slate-400 mr-1.5">{t.ticket_key}</span>
                  <span className="text-sm text-slate-700 truncate">{t.title}</span>
                </div>
                <StatusBadge status={t.status} />
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                  {t.project_key}
                </span>
                <button onClick={() => onUnlink(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded transition-all flex-shrink-0">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!linkedTickets?.length && debouncedQ.length < 2 && (
        <p className="text-xs text-slate-400 italic text-center py-2">
          Type at least 2 characters to search tickets across all projects.
        </p>
      )}
    </div>
  );
}

// ─── Goal detail panel ────────────────────────────────────────────────────────

function GoalPanel({ goalId, projects, users, onClose, onDelete, canManage, canDelete, canLock }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('sub-goals');
  const [addingSubGoal, setAddingSubGoal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const { data: goal, isLoading } = useQuery({
    queryKey: ['org-goal', goalId],
    queryFn: () => getOrgGoal(goalId),
    enabled: !!goalId,
  });

  const addSubGoal = useMutation({
    mutationFn: (data) => createSubGoal(goalId, data),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
      setAddingSubGoal(false);
    },
  });

  const updateTitle = useMutation({
    mutationFn: (title) => updateOrgGoal(goalId, { title }),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
      setEditingTitle(false);
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status) => updateOrgGoal(goalId, { status }),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
    },
  });

  const linkTicket = useMutation({
    mutationFn: (ticketId) => linkTicketToOrgGoal(goalId, ticketId),
    onSuccess: () => qc.invalidateQueries(['org-goal', goalId]),
  });

  const unlinkTicket = useMutation({
    mutationFn: (ticketId) => unlinkTicketFromOrgGoal(goalId, ticketId),
    onSuccess: () => qc.invalidateQueries(['org-goal', goalId]),
  });

  const toggleLock = useMutation({
    mutationFn: (is_locked) => lockOrgGoal(goalId, is_locked),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
    },
  });

  if (isLoading || !goal) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  const typeMeta = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const statusKey = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const canEdit = canManage && (!goal.is_locked || canLock);
  const owner = users.find(u => u.id === goal.owner_id);
  const daysLeft = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-start gap-3">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${typeMeta.cls}`}>
            {typeMeta.label}
          </span>
          <div className="flex-1 min-w-0">
            {editingTitle && canEdit ? (
              <form onSubmit={e => { e.preventDefault(); updateTitle.mutate(titleDraft); }} className="flex gap-2">
                <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} autoFocus
                  className="flex-1 text-sm font-semibold text-slate-800 border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300" />
                <button type="submit" className="text-xs text-indigo-600 font-medium px-2">Save</button>
                <button type="button" onClick={() => setEditingTitle(false)} className="text-xs text-slate-400">Cancel</button>
              </form>
            ) : (
              <div
                onClick={() => canEdit && (setTitleDraft(goal.title), setEditingTitle(true))}
                className={`text-sm font-semibold text-slate-800 truncate ${canEdit ? 'cursor-text hover:text-indigo-700' : ''} transition-colors`}>
                {goal.title}
              </div>
            )}
            {goal.is_locked && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-600 font-medium">
                <Lock size={9} /> Locked
              </div>
            )}
            {goal.project && (
              <div className="text-[10px] text-indigo-600 mt-0.5 font-medium">
                Assigned to {goal.project.name}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canLock && (
              <button
                onClick={() => toggleLock.mutate(!goal.is_locked)}
                disabled={toggleLock.isPending}
                title={goal.is_locked ? 'Unlock goal' : 'Lock goal'}
                className={`p-1.5 rounded transition-colors ${goal.is_locked ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}>
                {goal.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {canEdit ? (
            <select value={goal.status} onChange={e => updateStatus.mutate(e.target.value)}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${statusMeta.cls}`}>
              {Object.entries(STATUS_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          ) : (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          )}
          {owner && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Avatar user={owner} size="xs" />
              {owner.name}
            </div>
          )}
          {goal.due_date && (
            <div className="flex flex-col items-end">
              <span className={`text-xs font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-700'}`}>
                {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className={`text-[10px] ${daysLeft < 0 ? 'text-red-500 font-medium' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
              </span>
            </div>
          )}
          {(goal.linked_count > 0) && (
            <span className="text-xs text-slate-400">{goal.completed_count}/{goal.linked_count} tickets done</span>
          )}
        </div>

        {/* Progress bar */}
        {goal.progress > 0 && (
          <div className="mt-3">
            <ProgressBar value={goal.progress} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {[
          { key: 'sub-goals', label: `Sub-goals${goal.children?.length ? ` (${goal.children.length})` : ''}`, icon: Layers },
          { key: 'tickets',   label: `Tickets${goal.tickets?.length ? ` (${goal.tickets.length})` : ''}`, icon: Target },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'sub-goals' && (
          <div className="space-y-3">
            {/* Sub-goal list */}
            {goal.children?.length > 0 && (
              <div className="space-y-2">
                {goal.children.map(child => {
                  const childTypeMeta = GOAL_TYPE_META[child.goal_type] || GOAL_TYPE_META.key_result;
                  const childStatus = STATUS_META[child.auto_status || child.status] || STATUS_META.not_started;
                  return (
                    <div key={child.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-white hover:border-slate-200 transition-colors group">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${childTypeMeta.cls}`}>
                        {childTypeMeta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{child.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${childStatus.cls}`}>
                            {childStatus.label}
                          </span>
                          {child.project && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                              {child.project.name}
                            </span>
                          )}
                          {child.linked_count > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {child.completed_count}/{child.linked_count} tickets
                            </span>
                          )}
                        </div>
                        {child.linked_count > 0 && (
                          <div className="mt-1.5">
                            <ProgressBar value={child.progress || 0} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add sub-goal */}
            {canEdit && (addingSubGoal ? (
              <SubGoalForm
                goalId={goalId}
                projects={projects}
                users={users}
                onSave={(data) => addSubGoal.mutate(data)}
                onCancel={() => setAddingSubGoal(false)}
                isPending={addSubGoal.isPending}
              />
            ) : (
              <button onClick={() => setAddingSubGoal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
                <Plus size={13} /> Add sub-goal
              </button>
            ))}

            {!goal.children?.length && !addingSubGoal && (
              <p className="text-xs text-slate-400 text-center py-2">
                No sub-goals yet. Break this goal down into key results, milestones, or assign sub-goals to specific projects.
              </p>
            )}
          </div>
        )}

        {tab === 'tickets' && (
          <TicketLinker
            goalId={goalId}
            linkedTickets={goal.tickets}
            onLink={(ticketId) => linkTicket.mutate(ticketId)}
            onUnlink={(ticketId) => unlinkTicket.mutate(ticketId)}
          />
        )}
      </div>

      {/* Footer actions */}
      {canDelete && (
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
          <button
            disabled={goal.is_locked && !canLock}
            onClick={() => { if (confirm('Delete this goal and all sub-goals?')) { onDelete(goalId); onClose(); } }}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 size={12} /> Delete goal
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Top-level goal form ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', description: '', goal_type: 'objective', metric_type: 'manual',
  target_value: '', unit: '%', status: 'not_started', owner_id: '', start_date: '', due_date: '',
};

function RootGoalForm({ users, onSave, onCancel, isPending }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 bg-white";

  return (
    <form onSubmit={e => { e.preventDefault(); if (!form.title.trim()) return; onSave(form); }}
      className="space-y-3">
      <input value={form.title} onChange={set('title')} required autoFocus
        placeholder="Company objective title" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
          <select value={form.goal_type} onChange={set('goal_type')} className={inputCls}>
            {Object.entries(GOAL_TYPE_META).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Owner</label>
        <select value={form.owner_id} onChange={set('owner_id')} className={inputCls}>
          <option value="">No owner</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={isPending || !form.title.trim()}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Creating...' : 'Create goal'}
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrgGoalsPage() {
  const qc = useQueryClient();
  const { user } = useApp();
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin || user?.systemPermissions?.includes('org_goals.write');
  const canDelete = isAdmin || user?.systemPermissions?.includes('org_goals.delete');
  const canLock   = isAdmin || user?.systemPermissions?.includes('org_goals.lock');
  const [showForm, setShowForm] = useState(false);
  const [openGoalId, setOpenGoalId] = useState(null);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['org-goals'],
    queryFn: getOrgGoals,
  });

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => client.get('/api/users').then(r => Array.isArray(r) ? r : r.users || []),
  });

  const create = useMutation({
    mutationFn: createOrgGoal,
    onSuccess: () => { qc.invalidateQueries(['org-goals']); setShowForm(false); },
  });

  const remove = useMutation({
    mutationFn: deleteOrgGoal,
    onSuccess: () => qc.invalidateQueries(['org-goals']),
  });

  function handleDelete(id) {
    if (confirm('Delete this goal and all sub-goals?')) remove.mutate(id);
  }

  // Flatten tree for counts
  function countAll(nodes) {
    return nodes.reduce((n, g) => n + 1 + countAll(g.children || []), 0);
  }
  const totalGoals = countAll(goals);
  const onTrack = goals.reduce(function count(acc, g) {
    const s = g.auto_status || g.status;
    return acc + (s === 'on_track' || s === 'completed' ? 1 : 0) + countAll(g.children || [].filter(c => {
      const cs = c.auto_status || c.status; return cs === 'on_track' || cs === 'completed';
    }));
  }, 0);

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Main panel */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target size={20} className="text-indigo-500" />
              <h1 className="text-lg font-bold text-slate-800">Company Goals</h1>
              {!isLoading && totalGoals > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                  {totalGoals} goal{totalGoals !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {canManage && (
              <button onClick={() => { setShowForm(true); setOpenGoalId(null); }}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
                <Plus size={14} /> New objective
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* New root goal form */}
          {showForm && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">New company objective</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <RootGoalForm users={users} onSave={(data) => create.mutate(data)}
                onCancel={() => setShowForm(false)} isPending={create.isPending} />
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-slate-400 text-sm py-16">Loading...</div>
          ) : goals.length === 0 ? (
            <div className="text-center py-20">
              <Target size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium mb-1">No company goals yet</p>
              <p className="text-slate-400 text-sm mb-4 max-w-sm mx-auto">
                Create top-level objectives, then break them into sub-goals assigned to projects. Each project's PM can then link tickets to deliver those sub-goals.
              </p>
              {canManage && (
                <button onClick={() => setShowForm(true)}
                  className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                  Create first goal
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wide bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-semibold">Goal</th>
                    <th className="text-left px-4 py-2.5 font-semibold min-w-[150px]">Progress</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Tickets</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Timeline</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Owner</th>
                    <th className="w-20 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {goals.map(g => (
                    <GoalRow key={g.id} goal={g} onOpen={setOpenGoalId}
                      onDelete={handleDelete} users={users} canManage={canManage} canDelete={canDelete} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — slides in from right */}
      {openGoalId && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpenGoalId(null)} />
          <div className="relative z-30 w-[420px] flex-shrink-0 border-l border-slate-200 bg-white shadow-xl flex flex-col">
            <GoalPanel
              goalId={openGoalId}
              projects={projects}
              users={users}
              canManage={canManage}
              canDelete={canDelete}
              canLock={canLock}
              onClose={() => setOpenGoalId(null)}
              onDelete={(id) => { remove.mutate(id); qc.invalidateQueries(['org-goals']); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
