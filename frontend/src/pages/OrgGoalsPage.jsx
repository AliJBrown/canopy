import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Target, X, LayoutGrid, CalendarRange, Lock, EyeOff } from 'lucide-react';
import { getOrgGoals, createOrgGoal } from '../api/orgGoals';
import { Avatar } from '../components/Badge';
import { useApp } from '../context/AppContext';
import client from '../api/client';

const STATUS_META = {
  not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-500',        color: '#94a3b8' },
  on_track:    { label: 'On Track',    cls: 'bg-emerald-100 text-emerald-700',     color: '#10b981' },
  at_risk:     { label: 'At Risk',     cls: 'bg-amber-100 text-amber-700',         color: '#f59e0b' },
  behind:      { label: 'Behind',      cls: 'bg-red-100 text-red-700',             color: '#ef4444' },
  completed:   { label: 'Completed',   cls: 'bg-indigo-100 text-indigo-700',       color: '#6366f1' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-400',         color: '#cbd5e1' },
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
    <div style={{ minWidth: '640px' }}>
      {/* Month header row */}
      <div className="flex mb-1">
        <div className="w-56 flex-shrink-0" />
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
          {/* Today line (header) */}
          <div className="absolute top-0 h-full w-px bg-red-400/40" style={{ left: `${todayPct}%` }} />
        </div>
      </div>

      {/* Goal rows */}
      {goals.map(goal => {
        const statusKey = goal.auto_status || goal.status;
        const barColor  = STATUS_META[statusKey]?.color || '#94a3b8';
        const childCount = (goal.children || []).length;
        const ticketCount = parseInt(goal.linked_count) || 0;

        const startPct = goal.start_date
          ? pct(goal.start_date)
          : goal.due_date ? Math.max(0, pct(goal.due_date) - 8) : Math.max(0, todayPct - 2);
        const endPct = goal.due_date
          ? pct(goal.due_date)
          : Math.min(100, startPct + 8);
        const barWidth = Math.max(endPct - startPct, 0.5);
        const progress = goal.progress || 0;

        return (
          <div key={goal.id}
            className="flex items-center h-12 border-b border-slate-50 hover:bg-slate-50 transition-colors group">
            {/* Label column */}
            <div className="w-56 flex-shrink-0 pr-4">
              <button onClick={() => onGoalClick(goal.id)}
                className="text-sm text-slate-700 font-medium truncate text-left hover:text-indigo-600 w-full transition-colors block">
                {goal.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                {childCount > 0 && (
                  <span className="text-[10px] text-slate-400">
                    {childCount} sub-goal{childCount !== 1 ? 's' : ''}
                  </span>
                )}
                {ticketCount > 0 && (
                  <span className="text-[10px] text-slate-400">
                    {parseInt(goal.completed_count) || 0}/{ticketCount} tickets
                  </span>
                )}
              </div>
            </div>
            {/* Timeline column */}
            <div className="flex-1 relative h-full">
              {/* Month grid lines */}
              {months.map((m, i) => i > 0 && (
                <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100"
                  style={{ left: `${pct(m)}%` }} />
              ))}
              {/* Today line */}
              <div className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10"
                style={{ left: `${todayPct}%` }} />
              {/* Bar */}
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

      {/* Today legend */}
      <div className="flex items-center gap-1.5 mt-4 text-[10px] text-slate-400">
        <div className="w-4 h-0.5 bg-red-400/60 rounded" />
        Today
      </div>
    </div>
  );
}

// ── Root goal card ──────────────────────────────────────────────────────────

function GoalCard({ goal, users, onClick }) {
  const statusKey  = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const typeMeta   = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const owner      = users.find(u => u.id === goal.owner_id);
  const progress   = goal.progress || 0;
  const childCount = (goal.children || []).length;
  const ticketCount = parseInt(goal.linked_count) || 0;
  const completedCount = parseInt(goal.completed_count) || 0;
  const daysLeft = goal.due_date
    ? Math.ceil((new Date(goal.due_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-slate-100 p-5 cursor-pointer
                 hover:border-indigo-200 hover:shadow-md transition-all group flex flex-col gap-3">
      {/* Top row: type + status */}
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-slate-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug">
        {goal.title}
        {goal.is_locked  && <Lock   size={12} className="inline ml-1.5 text-amber-500 mb-0.5" />}
        {goal.is_private && <EyeOff size={12} className="inline ml-1.5 text-slate-400 mb-0.5" />}
      </h3>

      {/* Progress */}
      <ProgressBar value={progress} />

      {/* Dates */}
      {goal.due_date && (
        <div className={`text-xs font-medium ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
          {goal.start_date && (
            <span>{new Date(String(goal.start_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → </span>
          )}
          {new Date(String(goal.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {daysLeft !== null && (
            <span className="ml-1.5">
              ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
            </span>
          )}
        </div>
      )}

      {/* Footer: owner + sub-goal/ticket counts */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
        <div>
          {owner ? (
            <div className="flex items-center gap-1.5">
              <Avatar user={owner} size="xs" />
              <span>{owner.name}</span>
            </div>
          ) : (
            <span className="text-slate-300">No owner</span>
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

// ── Create form ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', description: '', goal_type: 'objective', metric_type: 'manual',
  target_value: '', unit: '%', status: 'not_started', owner_id: '', start_date: '', due_date: '',
};

function RootGoalForm({ users, onSave, onCancel, isPending }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 bg-white';

  return (
    <form onSubmit={e => { e.preventDefault(); if (!form.title.trim()) return; onSave(form); }}
      className="space-y-3">
      <input value={form.title} onChange={set('title')} required autoFocus
        placeholder="Company goal title" className={cls} />
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
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending || !form.title.trim()}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Creating...' : 'Create goal'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function OrgGoalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useApp();
  const isAdmin   = user?.role === 'admin';
  const canManage = isAdmin || user?.systemPermissions?.includes('org_goals.write');

  const [view, setView]         = useState('cards');
  const [showForm, setShowForm] = useState(false);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['org-goals'],
    queryFn: getOrgGoals,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => client.get('/api/users').then(r => Array.isArray(r) ? r : r.users || []),
  });

  const create = useMutation({
    mutationFn: createOrgGoal,
    onSuccess: () => { qc.invalidateQueries(['org-goals']); setShowForm(false); },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target size={20} className="text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-800">Company Goals</h1>
            {!isLoading && goals.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                {goals.length} objective{goals.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'cards'
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                <LayoutGrid size={13} /> Cards
              </button>
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'timeline'
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                <CalendarRange size={13} /> Timeline
              </button>
            </div>
            {canManage && (
              <button
                onClick={() => { setShowForm(true); }}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
                <Plus size={14} /> New goal
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Create form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">New company goal</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <RootGoalForm
              users={users}
              onSave={(data) => create.mutate(data)}
              onCancel={() => setShowForm(false)}
              isPending={create.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-slate-400 text-sm py-16">Loading...</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-24">
            <Target size={36} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-semibold mb-2">No company goals yet</p>
            <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
              Create top-level objectives, then drill into each one to add sub-goals, assign them to
              projects, and link tickets to track execution.
            </p>
            {canManage && (
              <button onClick={() => setShowForm(true)}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                Create first goal
              </button>
            )}
          </div>
        ) : view === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                users={users}
                onClick={() => navigate(`/goals/${g.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 p-6 overflow-x-auto">
            <GoalTimeline
              goals={goals}
              onGoalClick={(id) => navigate(`/goals/${id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
