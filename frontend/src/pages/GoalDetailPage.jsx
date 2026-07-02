import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Target, X, Search, Lock, Unlock, Trash2, Pencil, EyeOff,
  ChevronRight, CalendarRange, Link2, Layers, UserPlus, GitMerge, Users,
} from 'lucide-react';
import {
  getOrgGoal, createSubGoal, updateOrgGoal, deleteOrgGoal, lockOrgGoal,
  getGoalTicketCandidates, linkTicketToOrgGoal, unlinkTicketFromOrgGoal,
  getGoalMembers, addGoalMember, removeGoalMember,
  getGoalAssignees, addGoalAssignee, removeGoalAssignee,
  getGoalDependencies, addGoalDependency, removeGoalDependency, searchGoals,
  getGoalProjects,
} from '../api/orgGoals';
import { Avatar, TypeBadge, StatusBadge } from '../components/Badge';
import { useApp } from '../context/AppContext';
import client from '../api/client';

const STATUS_META = {
  not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-500',    color: '#94a3b8' },
  on_track:    { label: 'On Track',    cls: 'bg-emerald-100 text-emerald-700', color: '#10b981' },
  at_risk:     { label: 'At Risk',     cls: 'bg-amber-100 text-amber-700',     color: '#f59e0b' },
  behind:      { label: 'Behind',      cls: 'bg-red-100 text-red-700',         color: '#ef4444' },
  completed:   { label: 'Completed',   cls: 'bg-indigo-100 text-indigo-700',   color: '#6366f1' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-400',     color: '#cbd5e1' },
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

function ProgressBar({ value, className = '' }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: progressColor(pct) }} />
      </div>
      <span className="text-xs text-slate-500 font-medium w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

// ── Gantt timeline ──────────────────────────────────────────────────────────

function GoalTimeline({ goals, onGoalClick }) {
  const now = new Date();

  const allDates = goals.flatMap(g => [
    g.start_date && new Date(g.start_date),
    g.due_date   && new Date(g.due_date),
  ].filter(Boolean));

  if (allDates.length === 0) {
    allDates.push(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    allDates.push(new Date(now.getFullYear(), now.getMonth() + 4, 0));
  }

  const minD = new Date(Math.min(...allDates));
  const maxD = new Date(Math.max(...allDates));
  const rangeStart = new Date(minD.getFullYear(), minD.getMonth(), 1);
  const rangeEnd   = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0);
  const totalMs    = Math.max(rangeEnd - rangeStart, 1);

  const months = [];
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  const pct = (date) =>
    Math.max(0, Math.min(100, ((new Date(date) - rangeStart) / totalMs) * 100));

  const todayPct = pct(now);

  return (
    <div style={{ minWidth: '600px' }}>
      {/* Month header */}
      <div className="flex mb-1">
        <div className="w-52 flex-shrink-0" />
        <div className="flex-1 relative h-8 border-b border-slate-100">
          {months.map((m, i) => (
            <div key={i}
              className="absolute top-0 h-full border-l border-slate-100 pl-2 flex items-center"
              style={{ left: `${pct(m)}%` }}>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
                {m.toLocaleDateString('en-US', {
                  month: 'short',
                  year: (i === 0 || m.getMonth() === 0) ? 'numeric' : undefined,
                })}
              </span>
            </div>
          ))}
          <div className="absolute top-0 h-full w-px bg-red-400/40"
            style={{ left: `${todayPct}%` }} />
        </div>
      </div>

      {/* Rows */}
      {goals.map(goal => {
        const statusKey = goal.auto_status || goal.status;
        const barColor  = STATUS_META[statusKey]?.color || '#94a3b8';
        const progress  = goal.progress || 0;

        const startPct = goal.start_date
          ? pct(goal.start_date)
          : goal.due_date ? Math.max(0, pct(goal.due_date) - 8) : Math.max(0, todayPct - 2);
        const endPct = goal.due_date
          ? pct(goal.due_date)
          : Math.min(100, startPct + 8);
        const barWidth = Math.max(endPct - startPct, 0.5);

        return (
          <div key={goal.id}
            className="flex items-center h-12 border-b border-slate-50 hover:bg-slate-50 transition-colors group">
            <div className="w-52 flex-shrink-0 pr-4">
              <button onClick={() => onGoalClick(goal.id)}
                className="text-sm text-slate-700 font-medium truncate text-left hover:text-indigo-600 w-full transition-colors block">
                {goal.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${GOAL_TYPE_META[goal.goal_type]?.cls || ''}`}>
                  {GOAL_TYPE_META[goal.goal_type]?.label}
                </span>
              </div>
            </div>
            <div className="flex-1 relative h-full">
              {months.map((m, i) => i > 0 && (
                <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100"
                  style={{ left: `${pct(m)}%` }} />
              ))}
              <div className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10"
                style={{ left: `${todayPct}%` }} />
              <div
                className="absolute rounded-md cursor-pointer hover:brightness-110 transition-all overflow-hidden"
                style={{
                  left: `${startPct}%`,
                  width: `${barWidth}%`,
                  top: '22%',
                  height: '56%',
                  backgroundColor: barColor,
                }}
                onClick={() => onGoalClick(goal.id)}
                title={goal.title}>
                <div className="h-full bg-black/10 rounded-md"
                  style={{ width: `${progress}%` }} />
                {barWidth > 16 && (
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="text-white text-[10px] font-semibold truncate drop-shadow-sm">
                      {goal.title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-1.5 mt-4 text-[10px] text-slate-400">
        <div className="w-4 h-0.5 bg-red-400/60 rounded" />
        Today
      </div>
    </div>
  );
}

// ── Child goal card ─────────────────────────────────────────────────────────

function GoalCard({ goal, onClick }) {
  const statusKey  = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const typeMeta   = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const assignees  = Array.isArray(goal.assignees) ? goal.assignees : [];
  const progress   = goal.progress || 0;
  const childCount = (goal.children || []).length;
  const ticketCount = parseInt(goal.linked_count) || 0;
  const completedCount = parseInt(goal.completed_count) || 0;
  const daysLeft   = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-slate-100 p-4 cursor-pointer
                 hover:border-indigo-200 hover:shadow-md transition-all group flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug">
        {goal.title}
        {goal.is_locked   && <Lock   size={11} className="inline ml-1.5 text-amber-500 mb-0.5" />}
        {goal.is_private  && <EyeOff size={11} className="inline ml-1.5 text-slate-400 mb-0.5" />}
      </h3>

      <ProgressBar value={progress} />

      {goal.description && (
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{goal.description}</p>
      )}

      {goal.due_date && (
        <div className={`text-[11px] font-medium ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
          {goal.start_date && (
            <span>{new Date(String(goal.start_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → </span>
          )}
          {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {daysLeft !== null && (
            <span className="ml-1">
              ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
            </span>
          )}
        </div>
      )}

      {goal.project && (
        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium w-fit">
          {goal.project.name}
        </span>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
        <div className="flex items-center gap-1.5 min-w-0">
          {assignees.length > 0 ? (
            <>
              {assignees.slice(0, 3).map(a => <Avatar key={a.id} user={a} size="xs" />)}
              <span className="truncate max-w-[90px]">{assignees[0].name}</span>
              {assignees.length > 1 && <span className="flex-shrink-0">+{assignees.length - 1}</span>}
            </>
          ) : (
            <span className="text-slate-300">Unassigned</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {childCount > 0 && (
            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium text-[10px]">
              {childCount} sub-goal{childCount !== 1 ? 's' : ''}
            </span>
          )}
          {ticketCount > 0 && (
            <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium text-[10px]">
              {completedCount}/{ticketCount} tickets
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ticket linker ───────────────────────────────────────────────────────────

function TicketLinker({ goalId, linkedTickets, onLink, onUnlink }) {
  const [query, setQuery]         = useState('');
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

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tickets by title or key (e.g. MFP-42)..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        )}
      </div>

      {debouncedQ.length >= 2 && (
        <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
          {candidates.length === 0 && !isFetching ? (
            <p className="text-xs text-slate-400 text-center py-4">No matching tickets</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
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
                  <button
                    onClick={() => { onLink(t.id); setQuery(''); setDebouncedQ(''); }}
                    className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-500 flex-shrink-0 font-medium flex items-center gap-1">
                    <Plus size={10} /> Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        <p className="text-xs text-slate-400 italic text-center py-6">
          Type at least 2 characters to search tickets across all projects.
        </p>
      )}
    </div>
  );
}

// ── Sub-goal form ───────────────────────────────────────────────────────────

function SubGoalForm({ goalId, projects, users, onSave, onCancel, isPending }) {
  const [form, setForm] = useState({
    title: '', goal_type: 'key_result', due_date: '', start_date: '', owner_id: '', project_id: '',
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300';

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!form.title.trim()) return;
        onSave({ ...form, metric_type: 'completion', project_id: form.project_id || undefined });
      }}
      className="bg-slate-50 rounded-xl border border-indigo-100 p-4 space-y-3">
      <input value={form.title} onChange={set('title')} required autoFocus
        placeholder="Sub-goal title..." className={cls} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
          <select value={form.goal_type} onChange={set('goal_type')} className={cls}>
            <option value="key_result">Key Result</option>
            <option value="initiative">Initiative</option>
            <option value="milestone">Milestone</option>
            <option value="objective">Objective</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} className={cls} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Start date</label>
          <input type="date" value={form.start_date} onChange={set('start_date')} className={cls} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Owner</label>
          <select value={form.owner_id} onChange={set('owner_id')} className={cls}>
            <option value="">No owner</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Assign to project <span className="font-normal normal-case text-slate-300">(optional — lets that project's PM link tickets)</span>
        </label>
        <select value={form.project_id} onChange={set('project_id')} className={cls}>
          <option value="">No project (org-level)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
        </select>
        {form.project_id && (
          <p className="text-[10px] text-indigo-600 mt-1">
            This sub-goal will appear in {projects.find(p => p.id === form.project_id)?.name}'s Goals page.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending || !form.title.trim()}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Creating...' : 'Create sub-goal'}
        </button>
      </div>
    </form>
  );
}

// ── Goal members section (used inside EditGoalPanel) ────────────────────────

function GoalMembersSection({ goalId, users }) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState('');

  const { data: members = [] } = useQuery({
    queryKey: ['goal-members', goalId],
    queryFn: () => getGoalMembers(goalId),
  });

  const addMut = useMutation({
    mutationFn: (uid) => addGoalMember(goalId, uid),
    onSuccess: () => { qc.invalidateQueries(['goal-members', goalId]); setAddUserId(''); },
  });

  const removeMut = useMutation({
    mutationFn: (uid) => removeGoalMember(goalId, uid),
    onSuccess: () => qc.invalidateQueries(['goal-members', goalId]),
  });

  const memberIds = new Set(members.map(m => m.id));
  const available = users.filter(u => !memberIds.has(u.id));

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
        Members with access
      </label>

      {members.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          Only the owner can see this goal. Add members to grant access.
        </p>
      )}

      {members.map(m => (
        <div key={m.id} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Avatar user={m} size="xs" />
            <span className="text-sm text-slate-700">{m.name}</span>
          </div>
          <button
            onClick={() => removeMut.mutate(m.id)}
            disabled={removeMut.isPending}
            className="p-0.5 text-slate-300 hover:text-red-400 rounded transition-colors">
            <X size={12} />
          </button>
        </div>
      ))}

      {available.length > 0 && (
        <div className="flex gap-2">
          <select value={addUserId} onChange={e => setAddUserId(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="">Add person...</option>
            {available.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button
            disabled={!addUserId || addMut.isPending}
            onClick={() => addMut.mutate(addUserId)}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium transition-colors flex items-center gap-1">
            <UserPlus size={12} /> Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Goal assignees section (shown in hero) ──────────────────────────────────

function GoalAssigneesSection({ goalId, users, canEdit }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [selectedUid, setSelectedUid] = useState('');

  const { data: assignees = [] } = useQuery({
    queryKey: ['goal-assignees', goalId],
    queryFn: () => getGoalAssignees(goalId),
  });

  const addMut = useMutation({
    mutationFn: (uid) => addGoalAssignee(goalId, uid),
    onSuccess: () => {
      qc.invalidateQueries(['goal-assignees', goalId]);
      qc.invalidateQueries(['org-goal', goalId]);
      qc.invalidateQueries(['org-goals']);
      setSelectedUid('');
      setAdding(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: (uid) => removeGoalAssignee(goalId, uid),
    onSuccess: () => {
      qc.invalidateQueries(['goal-assignees', goalId]);
      qc.invalidateQueries(['org-goal', goalId]);
      qc.invalidateQueries(['org-goals']);
    },
  });

  const assigneeIds = new Set(assignees.map(a => a.id));
  const available   = users.filter(u => !assigneeIds.has(u.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {assignees.map(a => (
        <div key={a.id} className="relative group/av">
          <Avatar user={a} size="sm" />
          {canEdit && (
            <button
              onClick={() => removeMut.mutate(a.id)}
              title={`Remove ${a.name}`}
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-400 text-white rounded-full hidden group-hover/av:flex items-center justify-center">
              <X size={8} />
            </button>
          )}
        </div>
      ))}
      {assignees.length === 0 && !adding && (
        <span className="text-xs text-slate-400 italic">No assignees</span>
      )}
      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-7 h-7 rounded-full border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center transition-colors"
          title="Add assignee">
          <UserPlus size={12} />
        </button>
      )}
      {adding && (
        <div className="flex items-center gap-2">
          <select
            value={selectedUid}
            onChange={e => setSelectedUid(e.target.value)}
            autoFocus
            className="text-sm border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
            <option value="">Pick a person…</option>
            {available.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button
            onClick={() => selectedUid && addMut.mutate(selectedUid)}
            disabled={!selectedUid || addMut.isPending}
            className="text-xs text-white bg-indigo-600 px-2 py-1 rounded-lg font-medium disabled:opacity-40">
            Add
          </button>
          <button onClick={() => { setAdding(false); setSelectedUid(''); }}
            className="text-xs text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Edit goal panel ─────────────────────────────────────────────────────────

function EditGoalPanel({ goal, users, projects, onSave, onClose, isPending }) {
  const [form, setForm] = useState({
    title:         goal.title || '',
    goal_type:     goal.goal_type || 'objective',
    status:        goal.status || 'not_started',
    owner_id:      goal.owner_id || '',
    start_date:    goal.start_date ? String(goal.start_date).slice(0, 10) : '',
    due_date:      goal.due_date   ? String(goal.due_date).slice(0, 10)   : '',
    project_id:    goal.project_id || '',
    description:   goal.description || '',
    target_value:  goal.target_value != null ? String(goal.target_value) : '',
    current_value: goal.current_value != null ? String(goal.current_value) : '',
    unit:          goal.unit || '',
    is_private:    goal.is_private || false,
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300';

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-96 bg-white shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800">Edit Goal</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Title</label>
            <input value={form.title} onChange={set('title')} required className={cls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
              <select value={form.goal_type} onChange={set('goal_type')} className={cls}>
                <option value="objective">Objective</option>
                <option value="key_result">Key Result</option>
                <option value="milestone">Milestone</option>
                <option value="initiative">Initiative</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</label>
              <select value={form.status} onChange={set('status')} className={cls}>
                {Object.entries(STATUS_META).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Owner</label>
            <select value={form.owner_id} onChange={set('owner_id')} className={cls}>
              <option value="">No owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Start date</label>
              <input type="date" value={form.start_date} onChange={set('start_date')} className={cls} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due date</label>
              <input type="date" value={form.due_date} onChange={set('due_date')} className={cls} />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Project</label>
            <select value={form.project_id} onChange={set('project_id')} className={cls}>
              <option value="">No project (org-level)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3}
              placeholder="Optional description..."
              className={`${cls} resize-none`} />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Metric <span className="font-normal normal-case text-slate-300">(optional — for numeric progress tracking)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Current</label>
                <input type="number" placeholder="0" value={form.current_value} onChange={set('current_value')} className={cls} />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Target</label>
                <input type="number" placeholder="100" value={form.target_value} onChange={set('target_value')} className={cls} />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Unit</label>
                <input placeholder="%" value={form.unit} onChange={set('unit')} className={cls} />
              </div>
            </div>
          </div>

          {/* Privacy toggle */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <EyeOff size={14} className="text-slate-400" /> Private goal
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Only the owner and added members can see this goal and its sub-goals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_private: !f.is_private }))}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${form.is_private ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_private ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {form.is_private && (
              <div className="mt-3">
                <GoalMembersSection goalId={goal.id} users={users} />
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            disabled={isPending || !form.title.trim()}
            onClick={() => onSave(form)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium transition-colors">
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dependencies tab ────────────────────────────────────────────────────────

const GOAL_TYPE_ABBR = {
  objective: { abbr: 'O',  cls: 'bg-purple-100 text-purple-700' },
  key_result:{ abbr: 'KR', cls: 'bg-blue-100 text-blue-700' },
  milestone: { abbr: 'M',  cls: 'bg-amber-100 text-amber-700' },
  initiative:{ abbr: 'I',  cls: 'bg-teal-100 text-teal-700' },
};

function DependenciesTab({ goalId, canEdit }) {
  const qc = useQueryClient();
  const [addingType, setAddingType] = useState(null); // 'blocks' | 'blocked_by'
  const [depType, setDepType]       = useState('blocks');
  const [searchQ, setSearchQ]       = useState('');
  const [debouncedQ, setDQ]         = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDQ(searchQ), 300);
    return () => clearTimeout(timer.current);
  }, [searchQ]);

  const { data: deps = { blockedBy: [], blocks: [] } } = useQuery({
    queryKey: ['goal-deps', goalId],
    queryFn: () => getGoalDependencies(goalId),
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['goal-search', debouncedQ],
    queryFn: () => searchGoals(debouncedQ),
    enabled: debouncedQ.length >= 2,
  });

  const addMut = useMutation({
    mutationFn: (data) => addGoalDependency(goalId, data),
    onSuccess: () => {
      qc.invalidateQueries(['goal-deps', goalId]);
      qc.invalidateQueries(['org-goal-deps']);
      setAddingType(null);
      setSearchQ('');
    },
  });

  const removeMut = useMutation({
    mutationFn: (depId) => removeGoalDependency(goalId, depId),
    onSuccess: () => {
      qc.invalidateQueries(['goal-deps', goalId]);
      qc.invalidateQueries(['org-goal-deps']);
    },
  });

  const handleAdd = (result) => {
    const payload = addingType === 'blocks'
      ? { blocker_id: goalId, blocked_id: result.id, type: depType }
      : { blocker_id: result.id, blocked_id: goalId, type: depType };
    addMut.mutate(payload);
  };

  // Filter out goals already in deps
  const existingIds = new Set([
    ...deps.blockedBy.map(d => d.goal_id),
    ...deps.blocks.map(d => d.goal_id),
    goalId,
  ]);
  const candidates = searchResults.filter(r => !existingIds.has(r.id));

  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300';

  function DepRow({ dep, label }) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 group hover:bg-slate-50 rounded-lg">
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${GOAL_TYPE_ABBR[dep.goal_type]?.cls || 'bg-slate-100 text-slate-500'}`}>
          {GOAL_TYPE_ABBR[dep.goal_type]?.abbr || '?'}
        </span>
        <span className="text-sm text-slate-700 flex-1 truncate">{dep.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_META[dep.status]?.cls || ''}`}>
          {STATUS_META[dep.status]?.label}
        </span>
        {dep.due_date && (
          <span className="text-[10px] text-slate-400 flex-shrink-0">
            {new Date(String(dep.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {dep.type === 'relates_to' && (
          <span className="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded">relates</span>
        )}
        {canEdit && (
          <button
            onClick={() => removeMut.mutate(dep.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded transition-all flex-shrink-0">
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Blocked by */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Blocked by
            <span className="text-xs text-slate-400 font-normal">— must complete before this goal can start</span>
          </h3>
          {canEdit && addingType !== 'blocked_by' && (
            <button
              onClick={() => { setAddingType('blocked_by'); setDepType('blocks'); }}
              className="text-xs text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-1">
              <Plus size={11} /> Add
            </button>
          )}
        </div>

        {deps.blockedBy.length === 0 && addingType !== 'blocked_by' && (
          <p className="text-xs text-slate-400 italic px-1">No blockers — this goal can start freely.</p>
        )}
        {deps.blockedBy.map(d => <DepRow key={d.id} dep={d} />)}

        {addingType === 'blocked_by' && (
          <AddDepForm
            searchQ={searchQ} setSearchQ={setSearchQ}
            candidates={candidates} searching={searching}
            depType={depType} setDepType={setDepType}
            onSelect={handleAdd} onCancel={() => { setAddingType(null); setSearchQ(''); }}
            isPending={addMut.isPending}
          />
        )}
      </div>

      {/* Blocks */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
            Blocks
            <span className="text-xs text-slate-400 font-normal">— these goals cannot start until this one is done</span>
          </h3>
          {canEdit && addingType !== 'blocks' && (
            <button
              onClick={() => { setAddingType('blocks'); setDepType('blocks'); }}
              className="text-xs text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-1">
              <Plus size={11} /> Add
            </button>
          )}
        </div>

        {deps.blocks.length === 0 && addingType !== 'blocks' && (
          <p className="text-xs text-slate-400 italic px-1">This goal doesn't block any other goals.</p>
        )}
        {deps.blocks.map(d => <DepRow key={d.id} dep={d} />)}

        {addingType === 'blocks' && (
          <AddDepForm
            searchQ={searchQ} setSearchQ={setSearchQ}
            candidates={candidates} searching={searching}
            depType={depType} setDepType={setDepType}
            onSelect={handleAdd} onCancel={() => { setAddingType(null); setSearchQ(''); }}
            isPending={addMut.isPending}
          />
        )}
      </div>
    </div>
  );
}

function AddDepForm({ searchQ, setSearchQ, candidates, searching, depType, setDepType, onSelect, onCancel, isPending }) {
  const cls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300';
  return (
    <div className="mt-3 space-y-2 pt-3 border-t border-slate-100">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search goals by title…"
            className={`w-full pl-8 pr-3 ${cls}`}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          )}
        </div>
        <select value={depType} onChange={e => setDepType(e.target.value)} className={cls}>
          <option value="blocks">Blocks</option>
          <option value="relates_to">Relates to</option>
        </select>
      </div>

      {searchQ.length >= 2 && (
        <div className="bg-white rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden max-h-48 overflow-y-auto">
          {candidates.length === 0 && !searching ? (
            <p className="text-xs text-slate-400 text-center py-3">No matching goals</p>
          ) : (
            candidates.map(r => (
              <button key={r.id} onClick={() => onSelect(r)} disabled={isPending}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 transition-colors">
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${GOAL_TYPE_ABBR[r.goal_type]?.cls || 'bg-slate-100'}`}>
                  {GOAL_TYPE_ABBR[r.goal_type]?.abbr || '?'}
                </span>
                <span className="text-sm text-slate-700 truncate">{r.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function GoalDetailPage() {
  const { goalId } = useParams();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const { user }   = useApp();
  const isAdmin    = user?.role === 'admin';
  const canManage  = isAdmin || user?.systemPermissions?.includes('org_goals.write');
  const canDelete  = isAdmin || user?.systemPermissions?.includes('org_goals.delete');
  const canLock    = isAdmin || user?.systemPermissions?.includes('org_goals.lock');

  const [tab, setTab]                 = useState('subgoals');
  const [addingSubGoal, setAdding]    = useState(false);
  const [editingTitle, setEditing]    = useState(false);
  const [titleDraft, setTitleDraft]   = useState('');
  const [editOpen, setEditOpen]       = useState(false);
  const [descDraft, setDescDraft]     = useState(null);

  const { data: goal, isLoading } = useQuery({
    queryKey: ['org-goal', goalId],
    queryFn: () => getOrgGoal(goalId),
    enabled: !!goalId,
  });

  const { data: projects = [] } = useQuery({ queryKey: ['goal-projects'], queryFn: getGoalProjects });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => client.get('/api/users').then(r => Array.isArray(r) ? r : r.users || []),
  });

  const addSubGoal = useMutation({
    mutationFn: (data) => createSubGoal(goalId, data),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
      setAdding(false);
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status) => updateOrgGoal(goalId, { status }),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
    },
  });

  const updateGoal = useMutation({
    mutationFn: (data) => updateOrgGoal(goalId, data),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
      setEditOpen(false);
    },
  });

  const updateTitle = useMutation({
    mutationFn: (title) => updateOrgGoal(goalId, { title }),
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      qc.invalidateQueries(['org-goal', goalId]);
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: deleteOrgGoal,
    onSuccess: () => {
      qc.invalidateQueries(['org-goals']);
      // Navigate up to parent or company goals
      const ancestors = goal?.ancestors || [];
      if (ancestors.length > 0) {
        navigate(`/goals/${ancestors[ancestors.length - 1].id}`);
      } else {
        navigate('/goals');
      }
    },
  });

  const updateDesc = useMutation({
    mutationFn: (description) => updateOrgGoal(goalId, { description }),
    onSuccess: () => qc.invalidateQueries(['org-goal', goalId]),
  });

  const toggleLock = useMutation({
    mutationFn: (is_locked) => lockOrgGoal(goalId, is_locked),
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-slate-500 font-medium mb-2">Goal not found</p>
          <button onClick={() => navigate('/goals')}
            className="text-indigo-600 text-sm hover:underline">
            ← Back to Strategic Goals
          </button>
        </div>
      </div>
    );
  }

  const typeMeta   = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const statusKey  = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const canEdit    = canManage && (!goal.is_locked || canLock);
  const daysLeft   = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const ticketsTotal    = parseInt(goal.linked_count) || 0;
  const ticketsDone     = parseInt(goal.completed_count) || 0;
  const progress        = goal.progress || 0;
  const ancestors = goal.ancestors || [];
  const children  = goal.children || [];
  const tickets   = goal.tickets || [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button onClick={() => navigate('/goals')}
            className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors whitespace-nowrap">
            Strategic Goals
          </button>
          {ancestors.map(a => (
            <React.Fragment key={a.id}>
              <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />
              <button onClick={() => navigate(`/goals/${a.id}`)}
                className="text-slate-500 hover:text-indigo-600 transition-colors truncate max-w-[160px]">
                {a.title}
              </button>
            </React.Fragment>
          ))}
          <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />
          <span className="text-slate-700 font-medium truncate max-w-[220px]">{goal.title}</span>
        </div>
      </div>

      {/* Goal hero */}
      <div className="bg-white border-b border-slate-100 px-6 py-5 flex-shrink-0">
        <div className="flex items-start gap-3">
          <span className={`text-[10px] font-semibold px-2 py-1 rounded mt-0.5 flex-shrink-0 ${typeMeta.cls}`}>
            {typeMeta.label}
          </span>
          <div className="flex-1 min-w-0">
            {editingTitle && canEdit ? (
              <form onSubmit={e => { e.preventDefault(); updateTitle.mutate(titleDraft); }}
                className="flex gap-2 mb-3">
                <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} autoFocus
                  className="flex-1 text-xl font-bold text-slate-800 border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300" />
                <button type="submit" className="text-sm text-indigo-600 font-medium px-2 hover:text-indigo-800">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
              </form>
            ) : (
              <h1
                onClick={() => canEdit && (setTitleDraft(goal.title), setEditing(true))}
                className={`text-xl font-bold text-slate-800 mb-3 leading-snug ${canEdit ? 'cursor-text hover:text-indigo-700' : ''} transition-colors`}>
                {goal.title}
                {goal.is_locked && <Lock size={14} className="inline ml-2 text-amber-500 mb-0.5" />}
              </h1>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 flex-wrap">
              {canEdit ? (
                <select value={goal.status} onChange={e => updateStatus.mutate(e.target.value)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer ${statusMeta.cls}`}>
                  {Object.entries(STATUS_META).map(([v, { label }]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              ) : (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusMeta.cls}`}>
                  {statusMeta.label}
                </span>
              )}

              {goal.start_date && goal.due_date && (
                <span className="text-sm text-slate-400">
                  {new Date(String(goal.start_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' → '}
                  {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}

              {!goal.start_date && goal.due_date && (
                <span className={`text-sm font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-600'}`}>
                  Due {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  <span className={`text-xs font-normal ml-1.5 ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                    ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
                  </span>
                </span>
              )}

              {goal.project && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-medium">
                  {goal.project.name}
                </span>
              )}

              {goal.is_private && (
                <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                  <EyeOff size={11} /> Private
                </span>
              )}

              {ticketsTotal > 0 && (
                <span className="text-xs text-slate-400">
                  {ticketsDone}/{ticketsTotal} tickets done
                </span>
              )}
            </div>

            {/* Assignees */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium flex-shrink-0 flex items-center gap-1">
                <Users size={12} /> Assignees
              </span>
              <GoalAssigneesSection goalId={goalId} users={users} canEdit={canEdit} />
            </div>

            {/* Description / Notes */}
            <div className="mt-4 max-w-2xl">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Description &amp; Notes
              </div>
              {descDraft !== null ? (
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = descDraft.trim();
                    if (trimmed !== (goal.description || '').trim()) updateDesc.mutate(trimmed);
                    setDescDraft(null);
                  }}
                  onKeyDown={e => e.key === 'Escape' && setDescDraft(null)}
                  rows={7}
                  placeholder="Add a description, context, or notes…"
                  className="w-full text-sm text-slate-700 border border-indigo-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200 resize-y min-h-[120px]"
                />
              ) : goal.description ? (
                <div
                  onClick={() => canEdit && setDescDraft(goal.description)}
                  className={`text-sm leading-relaxed text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 ${
                    canEdit ? 'cursor-text hover:border-indigo-200 hover:bg-white transition-colors' : ''
                  }`}>
                  {goal.description}
                </div>
              ) : canEdit ? (
                <div
                  onClick={() => setDescDraft('')}
                  className="text-sm text-slate-400 italic bg-slate-50 rounded-lg px-3 py-2.5 border border-dashed border-slate-200 cursor-text hover:border-indigo-300 hover:bg-white transition-colors">
                  Add a description or notes…
                </div>
              ) : null}
            </div>

            <div className="mt-4 max-w-xl">
              <ProgressBar value={progress} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <button onClick={() => setEditOpen(true)}
                title="Edit goal"
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Pencil size={15} />
              </button>
            )}
            {canLock && (
              <button onClick={() => toggleLock.mutate(!goal.is_locked)} disabled={toggleLock.isPending}
                title={goal.is_locked ? 'Unlock' : 'Lock'}
                className={`p-1.5 rounded transition-colors ${goal.is_locked ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}>
                {goal.is_locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            )}
            {canDelete && (
              <button
                disabled={goal.is_locked && !canLock}
                onClick={() => {
                  if (confirm('Delete this goal and all its sub-goals?')) remove.mutate(goalId);
                }}
                className="p-1.5 text-slate-300 hover:text-red-400 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 flex-shrink-0">
        {[
          { key: 'subgoals',      label: `Sub-goals${children.length ? ` (${children.length})` : ''}`, icon: Layers },
          { key: 'timeline',      label: 'Timeline',                                                     icon: CalendarRange },
          { key: 'dependencies',  label: 'Dependencies',                                                 icon: GitMerge },
          { key: 'tickets',       label: `Tickets${tickets.length ? ` (${tickets.length})` : ''}`,      icon: Link2 },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Sub-goals tab */}
        {tab === 'subgoals' && (
          <div className="space-y-4">
            {children.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {children.map(child => (
                  <GoalCard
                    key={child.id}
                    goal={child}
                    onClick={() => navigate(`/goals/${child.id}`)}
                  />
                ))}
              </div>
            ) : !addingSubGoal ? (
              <div className="text-center py-20">
                <Layers size={32} className="text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium mb-1">No sub-goals yet</p>
                <p className="text-slate-400 text-sm mb-5 max-w-sm mx-auto">
                  Break this goal into key results, initiatives, or milestones. Each sub-goal can be
                  assigned to a project and linked to tickets for execution tracking.
                </p>
                {canEdit && (
                  <button onClick={() => setAdding(true)}
                    className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                    Add first sub-goal
                  </button>
                )}
              </div>
            ) : null}

            {canEdit && (
              addingSubGoal ? (
                <SubGoalForm
                  goalId={goalId}
                  projects={projects}
                  users={users}
                  onSave={(data) => addSubGoal.mutate(data)}
                  onCancel={() => setAdding(false)}
                  isPending={addSubGoal.isPending}
                />
              ) : children.length > 0 ? (
                <button onClick={() => setAdding(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
                  <Plus size={14} /> Add sub-goal
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Timeline tab */}
        {tab === 'timeline' && (
          <div className="bg-white rounded-xl border border-slate-100 p-6 overflow-x-auto">
            {children.length > 0 ? (
              <GoalTimeline
                goals={children}
                onGoalClick={(id) => navigate(`/goals/${id}`)}
              />
            ) : (
              <div className="text-center py-14">
                <CalendarRange size={32} className="text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Add sub-goals to see the timeline.</p>
              </div>
            )}
          </div>
        )}

        {/* Dependencies tab */}
        {tab === 'dependencies' && (
          <DependenciesTab goalId={goalId} canEdit={canEdit} />
        )}

        {/* Tickets tab */}
        {tab === 'tickets' && (
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <TicketLinker
              goalId={goalId}
              linkedTickets={tickets}
              onLink={(ticketId) => linkTicket.mutate(ticketId)}
              onUnlink={(ticketId) => unlinkTicket.mutate(ticketId)}
            />
          </div>
        )}
      </div>

      {editOpen && (
        <EditGoalPanel
          goal={goal}
          users={users}
          projects={projects}
          onSave={(data) => updateGoal.mutate(data)}
          onClose={() => setEditOpen(false)}
          isPending={updateGoal.isPending}
        />
      )}
    </div>
  );
}
