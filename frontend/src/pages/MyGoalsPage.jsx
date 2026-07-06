import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target, Plus, ChevronRight, ChevronDown, Trash2, X,
  Lock, Globe, Search, Layers,
} from 'lucide-react';
import {
  getMyGoals, getMyAssignedGoals, createMyGoal, createMySubGoal, updateMyGoal, deleteMyGoal,
  publishMyGoal, unpublishMyGoal,
  getMyGoalTickets, linkTicketToMyGoal, unlinkTicketFromMyGoal, getMyGoalTicketCandidates,
} from '../api/personalGoals';
import { getProjects } from '../api/projects';
import { Avatar, TypeBadge, StatusBadge } from '../components/Badge';
import { useApp } from '../context/AppContext';

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
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: progressColor(pct) }} />
      </div>
      <span className="text-xs text-slate-500 font-medium w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

// ─── Goal row ─────────────────────────────────────────────────────────────────

function GoalRow({ goal, depth = 0, onOpen, onDelete }) {
  const [open, setOpen] = useState(true);
  const hasChildren = goal.children?.length > 0;
  const statusMeta = STATUS_META[goal.auto_status || goal.status] || STATUS_META.not_started;
  const typeMeta = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const daysLeft = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / 86400000)
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
            {/* Visibility indicator */}
            {goal.is_public && goal.project ? (
              <span className="flex items-center gap-1 text-[10px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                <Globe size={9} /> {goal.project.key}
              </span>
            ) : (
              <span title="Private — only visible to you" className="text-slate-300 flex-shrink-0">
                <Lock size={11} />
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
            <span>{goal.completed_count}/{goal.linked_count} tickets</span>
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
        <td className="py-2.5 pr-2">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onOpen(goal.id)}
              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded text-xs font-medium px-2">
              Open
            </button>
            <button onClick={() => onDelete(goal.id)}
              className="p-1 text-slate-300 hover:text-red-400 rounded transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {open && goal.children?.map(c => (
        <GoalRow key={c.id} goal={c} depth={depth + 1} onOpen={onOpen} onDelete={onDelete} />
      ))}
    </>
  );
}

// ─── Sub-goal creation form ───────────────────────────────────────────────────

function SubGoalForm({ goalId, onSave, onCancel, isPending }) {
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState('key_result');
  const [dueDate, setDueDate] = useState('');

  return (
    <form onSubmit={e => { e.preventDefault(); if (!title.trim()) return; onSave({ title, goal_type: goalType, due_date: dueDate || undefined, metric_type: 'manual' }); }}
      className="bg-slate-50 rounded-xl border border-indigo-100 p-4 space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus
        placeholder="Sub-goal title..."
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
          <select value={goalType} onChange={e => setGoalType(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="key_result">Key Result</option>
            <option value="milestone">Milestone</option>
            <option value="initiative">Initiative</option>
            <option value="task">Task</option>
            <option value="objective">Objective</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={isPending || !title.trim()}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Creating...' : 'Create sub-goal'}
        </button>
      </div>
    </form>
  );
}

// ─── Ticket linker ────────────────────────────────────────────────────────────

function TicketLinker({ goalId }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const { data: linkedTickets = [], refetch } = useQuery({
    queryKey: ['my-goal-tickets', goalId],
    queryFn: () => getMyGoalTickets(goalId),
    enabled: !!goalId,
  });

  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['my-goal-ticket-candidates', goalId, debouncedQ],
    queryFn: () => getMyGoalTicketCandidates(goalId, debouncedQ),
    enabled: !!goalId && debouncedQ.length >= 2,
  });

  const link = useMutation({
    mutationFn: (ticketId) => linkTicketToMyGoal(goalId, ticketId),
    onSuccess: () => { qc.invalidateQueries(['my-goal-tickets', goalId]); qc.invalidateQueries(['my-goals']); setQ(''); setDebouncedQ(''); },
  });

  const unlink = useMutation({
    mutationFn: (ticketId) => unlinkTicketFromMyGoal(goalId, ticketId),
    onSuccess: () => { qc.invalidateQueries(['my-goal-tickets', goalId]); qc.invalidateQueries(['my-goals']); },
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by title or ticket key..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white" />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        )}
      </div>

      {debouncedQ.length >= 2 && (
        <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
          {candidates.length === 0 && !isFetching ? (
            <p className="text-xs text-slate-400 text-center py-4">No matching tickets</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {candidates.map(t => (
                <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50">
                  <TypeBadge type={t.type} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-slate-400 mr-1.5">{t.ticket_key}</span>
                    <span className="text-sm text-slate-700 truncate">{t.title}</span>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    {t.project_key}
                  </span>
                  <button onClick={() => link.mutate(t.id)}
                    className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-500 flex-shrink-0 font-medium">
                    <Plus size={10} /> Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {linkedTickets.length > 0 && (
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
                <button onClick={() => unlink.mutate(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded transition-all">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!linkedTickets.length && debouncedQ.length < 2 && (
        <p className="text-xs text-slate-400 italic text-center py-2">
          Type at least 2 characters to search tickets across all projects.
        </p>
      )}
    </div>
  );
}

// ─── Visibility panel (publish / unpublish) ───────────────────────────────────

function VisibilityPanel({ goal, projects, onUpdate }) {
  const [selectedProject, setSelectedProject] = useState(goal.project?.id || '');
  const qc = useQueryClient();

  const publish = useMutation({
    mutationFn: () => publishMyGoal(goal.id, selectedProject),
    onSuccess: (updated) => { qc.invalidateQueries(['my-goals']); onUpdate(updated); },
  });

  const unpublish = useMutation({
    mutationFn: () => unpublishMyGoal(goal.id),
    onSuccess: (updated) => { qc.invalidateQueries(['my-goals']); onUpdate(updated); },
  });

  const isPublished = goal.is_public && goal.project_id;

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 p-3 rounded-xl border ${isPublished ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
        <div className="mt-0.5">
          {isPublished
            ? <Globe size={16} className="text-indigo-500" />
            : <Lock size={16} className="text-slate-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${isPublished ? 'text-indigo-800' : 'text-slate-700'}`}>
            {isPublished ? `Published to ${goal.project?.name}` : 'Private'}
          </div>
          <p className={`text-xs mt-0.5 ${isPublished ? 'text-indigo-600' : 'text-slate-400'}`}>
            {isPublished
              ? 'Visible to all members of that project. You can still edit it from this page.'
              : 'Only visible to you. Publish it to a project to make it visible there.'
            }
          </p>
        </div>
      </div>

      {isPublished ? (
        <button
          onClick={() => unpublish.mutate()}
          disabled={unpublish.isPending}
          className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40">
          <Lock size={12} /> {unpublish.isPending ? 'Unpublishing...' : 'Make private'}
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Publish to project
          </label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="">Select a project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
          </select>
          {selectedProject && (
            <p className="text-[10px] text-indigo-600">
              This goal will appear on {projects.find(p => p.id === selectedProject)?.name}'s Goals & KPIs page.
            </p>
          )}
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending || !selectedProject}
            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors">
            <Globe size={12} /> {publish.isPending ? 'Publishing...' : 'Publish to project'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Goal detail panel ────────────────────────────────────────────────────────

function GoalPanel({ goalId, goals, assignedGoals, projects, onClose, onDelete }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('sub-goals');
  const [addingSubGoal, setAddingSubGoal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [localGoal, setLocalGoal] = useState(null);

  function findGoal(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findGoal(n.children || [], id);
      if (found) return found;
    }
    return null;
  }

  const personalGoal = findGoal(goals, goalId);
  const assignedGoal = !personalGoal ? assignedGoals.find(g => g.id === goalId) : null;
  const goal = localGoal || personalGoal || assignedGoal;
  const isAssigned = !!assignedGoal && !personalGoal;

  const updateTitle = useMutation({
    mutationFn: (title) => updateMyGoal(goalId, { title }),
    onSuccess: () => { qc.invalidateQueries(['my-goals']); setEditingTitle(false); },
  });

  const updateStatus = useMutation({
    mutationFn: (status) => updateMyGoal(goalId, { status }),
    onSuccess: () => qc.invalidateQueries(['my-goals']),
  });

  const addSubGoal = useMutation({
    mutationFn: (data) => createMySubGoal(goalId, data),
    onSuccess: () => { qc.invalidateQueries(['my-goals']); setAddingSubGoal(false); },
  });

  if (!goal) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const typeMeta = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const statusKey = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const daysLeft = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / 86400000)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-start gap-3">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${typeMeta.cls}`}>
            {typeMeta.label}
          </span>
          <div className="flex-1 min-w-0">
            {!isAssigned && editingTitle ? (
              <form onSubmit={e => { e.preventDefault(); updateTitle.mutate(titleDraft); }} className="flex gap-2">
                <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} autoFocus
                  className="flex-1 text-sm font-semibold border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300" />
                <button type="submit" className="text-xs text-indigo-600 font-medium px-2">Save</button>
                <button type="button" onClick={() => setEditingTitle(false)} className="text-xs text-slate-400">Cancel</button>
              </form>
            ) : (
              <button
                onClick={() => { if (!isAssigned) { setTitleDraft(goal.title); setEditingTitle(true); } }}
                className={`text-sm font-semibold text-slate-800 text-left w-full truncate ${!isAssigned ? 'hover:text-indigo-700' : 'cursor-default'}`}>
                {goal.title}
              </button>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              {isAssigned ? (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  {goal.project
                    ? <><span className="font-medium text-indigo-600">{goal.project.name}</span> · assigned to you</>
                    : 'Strategic goal · assigned to you'}
                </span>
              ) : goal.is_public && goal.project ? (
                <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium">
                  <Globe size={9} /> {goal.project.name}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Lock size={9} /> Private
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {isAssigned ? (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          ) : (
            <select value={goal.status} onChange={e => updateStatus.mutate(e.target.value)}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${statusMeta.cls}`}>
              {Object.entries(STATUS_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          )}
          {goal.due_date && (
            <div>
              <span className={`text-xs font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-700'}`}>
                {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className={`ml-1.5 text-[10px] ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
              </span>
            </div>
          )}
          {goal.linked_count > 0 && (
            <span className="text-xs text-slate-400">{goal.completed_count}/{goal.linked_count} tickets done</span>
          )}
        </div>

        {goal.progress > 0 && (
          <div className="mt-3">
            <ProgressBar value={goal.progress} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {(isAssigned
          ? [{ key: 'sub-goals', label: `Sub-goals${goal.children?.length ? ` (${goal.children.length})` : ''}`, icon: Layers }]
          : [
              { key: 'sub-goals', label: `Sub-goals${goal.children?.length ? ` (${goal.children.length})` : ''}`, icon: Layers },
              { key: 'tickets',   label: `Tickets${goal.linked_count ? ` (${goal.linked_count})` : ''}`, icon: Target },
              { key: 'visibility', label: goal.is_public ? 'Published' : 'Private', icon: goal.is_public ? Globe : Lock },
            ]
        ).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'sub-goals' && (
          <div className="space-y-3">
            {goal.children?.length > 0 && (
              <div className="space-y-2">
                {goal.children.map(child => {
                  const childTypeMeta = GOAL_TYPE_META[child.goal_type] || GOAL_TYPE_META.key_result;
                  const childStatus = STATUS_META[child.auto_status || child.status] || STATUS_META.not_started;
                  return (
                    <div key={child.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-white hover:border-slate-200 transition-colors">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${childTypeMeta.cls}`}>
                        {childTypeMeta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{child.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${childStatus.cls}`}>
                            {childStatus.label}
                          </span>
                          {child.linked_count > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {child.completed_count}/{child.linked_count} tickets
                            </span>
                          )}
                        </div>
                        {child.linked_count > 0 && (
                          <div className="mt-1.5"><ProgressBar value={child.progress || 0} /></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isAssigned && (addingSubGoal ? (
              <SubGoalForm
                goalId={goalId}
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

            {!goal.children?.length && (
              <p className="text-xs text-slate-400 text-center py-2">
                {isAssigned ? 'No sub-goals.' : 'Break this goal down into key results, milestones, or tasks.'}
              </p>
            )}
          </div>
        )}

        {tab === 'tickets' && (
          <TicketLinker goalId={goalId} />
        )}

        {tab === 'visibility' && (
          <VisibilityPanel
            goal={goal}
            projects={projects}
            onUpdate={(updated) => setLocalGoal(prev => ({ ...(prev || goal), ...updated }))}
          />
        )}
      </div>

      {!isAssigned && (
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
          <button onClick={() => { if (confirm('Delete this goal and all its sub-goals?')) { onDelete(goalId); onClose(); } }}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
            <Trash2 size={12} /> Delete goal
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Assigned goals section ───────────────────────────────────────────────────

function AssignedGoalsSection({ goals, onOpen }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 hover:text-slate-700 transition-colors">
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        Assigned to me
        <span className="font-normal normal-case bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full ml-1">
          {goals.length}
        </span>
      </button>

      {!collapsed && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wide bg-slate-50">
                <th className="text-left px-4 py-2.5 font-semibold">Goal</th>
                <th className="text-left px-4 py-2.5 font-semibold min-w-[140px]">Progress</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Tickets</th>
                <th className="text-left px-4 py-2.5 font-semibold">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {goals.map(goal => {
                const statusMeta = STATUS_META[goal.auto_status || goal.status] || STATUS_META.not_started;
                const typeMeta = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
                const progress = goal.progress || 0;
                const daysLeft = goal.due_date
                  ? Math.ceil((new Date(goal.due_date) - new Date()) / 86400000)
                  : null;

                return (
                  <tr key={goal.id} className="group hover:bg-slate-50 border-b border-slate-50 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.cls}`}>
                          {typeMeta.label}
                        </span>
                        <button
                          onClick={() => onOpen(goal.id)}
                          className="text-sm text-slate-800 font-medium truncate max-w-[200px] hover:text-indigo-700 text-left transition-colors">
                          {goal.title}
                        </button>
                        {goal.project ? (
                          <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                            {goal.project.key}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 flex-shrink-0">Company</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <ProgressBar value={progress} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">
                      {goal.linked_count > 0 && `${goal.completed_count}/${goal.linked_count}`}
                    </td>
                    <td className="py-2.5 pr-4">
                      {goal.due_date ? (
                        <div>
                          <div className={`text-xs font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className={`text-[10px] ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                          </div>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Personal goals section ───────────────────────────────────────────────────

function flattenGoalTree(nodes) {
  return nodes.flatMap(n => [n, ...flattenGoalTree(n.children || [])]);
}

function countGoalTree(nodes) {
  return nodes.reduce((n, g) => n + 1 + countGoalTree(g.children || []), 0);
}

function PersonalGoalsSection({ goals, onOpen, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const hasFilters = !!(search || statusFilter || typeFilter);
  const totalCount = countGoalTree(goals);

  const filteredGoals = useMemo(() => {
    if (!hasFilters) return goals;
    return flattenGoalTree(goals).filter(g => {
      const matchSearch = !search || g.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || (g.auto_status || g.status) === statusFilter;
      const matchType = !typeFilter || g.goal_type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [goals, search, statusFilter, typeFilter, hasFilters]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          Personal Goals
          <span className="font-normal normal-case bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
            {hasFilters ? `${filteredGoals.length} of ${totalCount}` : totalCount}
          </span>
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search goals..."
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 w-44 bg-white"
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600">
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600">
              <option value="">All types</option>
              {Object.entries(GOAL_TYPE_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        hasFilters && filteredGoals.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">No goals match these filters.</div>
        ) : !collapsed && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wide bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-semibold">Goal</th>
                  <th className="text-left px-4 py-2.5 font-semibold min-w-[150px]">Progress</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Tickets</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Timeline</th>
                  <th className="w-20 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {hasFilters
                  ? filteredGoals.map(g => (
                      <GoalRow key={g.id} goal={{ ...g, children: [] }} onOpen={onOpen} onDelete={onDelete} />
                    ))
                  : goals.map(g => (
                      <GoalRow key={g.id} goal={g} onOpen={onOpen} onDelete={onDelete} />
                    ))
                }
              </tbody>
            </table>
            {hasFilters && filteredGoals.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400 text-center">
                Showing {filteredGoals.length} matching goal{filteredGoals.length !== 1 ? 's' : ''} across all levels
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ─── Root goal creation form ──────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', goal_type: 'objective', metric_type: 'manual',
  status: 'not_started', due_date: '',
};

function RootGoalForm({ onSave, onCancel, isPending }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 bg-white";

  return (
    <form onSubmit={e => { e.preventDefault(); if (!form.title.trim()) return; onSave(form); }}
      className="space-y-3">
      <input value={form.title} onChange={set('title')} required autoFocus
        placeholder="Goal title" className={cls} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
          <select value={form.goal_type} onChange={set('goal_type')} className={cls}>
            {Object.entries(GOAL_TYPE_META).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} className={cls} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
        <Lock size={11} />
        Goals start private — you can publish them to a project any time.
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

export default function MyGoalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [openGoalId, setOpenGoalId] = useState(null);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['my-goals'],
    queryFn: getMyGoals,
  });

  const { data: assignedGoals = [] } = useQuery({
    queryKey: ['my-assigned-goals'],
    queryFn: getMyAssignedGoals,
  });

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  const create = useMutation({
    mutationFn: createMyGoal,
    onSuccess: () => { qc.invalidateQueries(['my-goals']); setShowForm(false); },
  });

  const remove = useMutation({
    mutationFn: deleteMyGoal,
    onSuccess: () => qc.invalidateQueries(['my-goals']),
  });

  function handleDelete(id) {
    if (confirm('Delete this goal and all sub-goals?')) remove.mutate(id);
  }

  const totalGoals = countGoalTree(goals);
  const publishedCount = flattenGoalTree(goals).filter(g => g.is_public).length;

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Target size={20} className="text-indigo-500" />
                <Lock size={9} className="absolute -bottom-0.5 -right-0.5 text-slate-400 bg-white rounded-full" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">My Goals</h1>
                <p className="text-[11px] text-slate-400">
                  Personal goal tracking — private by default, publish to a project to share
                </p>
              </div>
              {!isLoading && totalGoals > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                  {totalGoals} goal{totalGoals !== 1 ? 's' : ''}
                  {publishedCount > 0 && `, ${publishedCount} published`}
                </span>
              )}
            </div>
            <button onClick={() => { setShowForm(true); setOpenGoalId(null); }}
              className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
              <Plus size={14} /> New goal
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showForm && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">New personal goal</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <RootGoalForm onSave={(data) => create.mutate(data)}
                onCancel={() => setShowForm(false)} isPending={create.isPending} />
            </div>
          )}

          {assignedGoals.length > 0 && (
            <AssignedGoalsSection goals={assignedGoals} onOpen={(id) => navigate(`/goals/${id}`)} />
          )}

          {isLoading ? (
            <div className="text-center text-slate-400 text-sm py-16">Loading...</div>
          ) : goals.length === 0 ? (
            <div className="text-center py-20">
              <div className="relative inline-block mb-3">
                <Target size={32} className="text-slate-300" />
                <Lock size={12} className="absolute -bottom-1 -right-1 text-slate-300 bg-slate-50 rounded-full" />
              </div>
              <p className="text-slate-500 font-medium mb-1">No personal goals yet</p>
              <p className="text-slate-400 text-sm mb-4 max-w-sm mx-auto">
                Set your own objectives, key results, and milestones. They're private by default — publish to a project when you're ready to share.
              </p>
              <button onClick={() => setShowForm(true)}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                Create first goal
              </button>
            </div>
          ) : (
            <PersonalGoalsSection goals={goals} onOpen={setOpenGoalId} onDelete={handleDelete} />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {openGoalId && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpenGoalId(null)} />
          <div className="relative z-30 w-[420px] flex-shrink-0 border-l border-slate-200 bg-white shadow-xl flex flex-col">
            <GoalPanel
              goalId={openGoalId}
              goals={goals}
              assignedGoals={assignedGoals}
              projects={projects}
              onClose={() => setOpenGoalId(null)}
              onDelete={(id) => { remove.mutate(id); qc.invalidateQueries(['my-goals']); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
