import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Target, X, Search, LayoutGrid, GanttChartSquare, Lock, EyeOff, ChevronRight, ChevronDown } from 'lucide-react';
import { getOrgGoals, createOrgGoal, getAllGoalDependencies } from '../api/orgGoals';
import { Avatar } from '../components/Badge';
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
  objective:  { label: 'Objective',  abbr: 'O',  cls: 'bg-purple-100 text-purple-700' },
  key_result: { label: 'Key Result', abbr: 'KR', cls: 'bg-blue-100 text-blue-700' },
  milestone:  { label: 'Milestone',  abbr: 'M',  cls: 'bg-amber-100 text-amber-700' },
  initiative: { label: 'Initiative', abbr: 'I',  cls: 'bg-teal-100 text-teal-700' },
  task:       { label: 'Task',       abbr: 'T',  cls: 'bg-sky-100 text-sky-700' },
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

// ── Gantt ────────────────────────────────────────────────────────────────────

const LABEL_W = 280;
const ROW_H   = 40;
const HEADER_H = 34;

function flattenGoals(goals, depth = 0, collapsed = new Set()) {
  const rows = [];
  for (const g of goals) {
    const children = g.children || [];
    rows.push({ goal: g, depth, hasChildren: children.length > 0 });
    if (children.length > 0 && !collapsed.has(g.id)) {
      rows.push(...flattenGoals(children, depth + 1, collapsed));
    }
  }
  return rows;
}

function useDateRange(rows) {
  return useMemo(() => {
    const now = new Date();
    const dates = rows.flatMap(({ goal: g }) => [
      g.start_date ? new Date(g.start_date) : null,
      g.due_date   ? new Date(g.due_date)   : null,
    ].filter(Boolean));

    const minD = dates.length ? new Date(Math.min(...dates)) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const maxD = dates.length ? new Date(Math.max(...dates)) : new Date(now.getFullYear(), now.getMonth() + 5, 0);
    const rs   = new Date(minD.getFullYear(), minD.getMonth() - 1, 1);
    const re   = new Date(maxD.getFullYear(), maxD.getMonth() + 2, 0);
    const span = Math.max(re - rs, 1);

    const months = [];
    const cur = new Date(rs);
    while (cur <= re) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

    const pct = (d) => Math.max(0, Math.min(100, ((new Date(d) - rs) / span) * 100));
    return { rangeStart: rs, rangeEnd: re, months, pct, now };
  }, [rows]);
}

function GanttChart({ goals, dependencies = [], onGoalClick }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const chartRef  = useRef(null);
  const [chartPx, setChartPx] = useState(800);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => flattenGoals(goals, 0, collapsed), [goals, collapsed]);
  const { months, pct, now } = useDateRange(rows);
  const todayPct = pct(now);

  // Visible row index by goal ID (for arrow routing)
  const rowIdx = useMemo(() => {
    const m = {};
    rows.forEach(({ goal }, i) => { m[goal.id] = i; });
    return m;
  }, [rows]);

  // Bar bounds per goal (in %)
  const bounds = useMemo(() => {
    const b = {};
    rows.forEach(({ goal: g }) => {
      const sp = g.start_date ? pct(g.start_date)
               : g.due_date   ? Math.max(0, pct(g.due_date) - 4) : todayPct;
      const ep = g.due_date   ? pct(g.due_date) : Math.min(100, sp + 4);
      b[g.id] = { sp: Math.max(0, sp), ep: Math.min(100, Math.max(ep, sp + 0.3)) };
    });
    return b;
  }, [rows, pct, todayPct]);

  const toggle = (id) => setCollapsed(c => {
    const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const totalH = rows.length * ROW_H;

  // Only draw arrows for goals that are both visible in the current collapsed state
  const visibleDeps = dependencies.filter(d => rowIdx[d.blocker_id] != null && rowIdx[d.blocked_id] != null);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: LABEL_W + 700 }}>
        {/* Header */}
        <div className="flex border-b border-slate-200 bg-white sticky top-0 z-20" style={{ height: HEADER_H }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }}
            className="border-r border-slate-200 flex items-center px-4">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Goal</span>
          </div>
          <div className="flex-1 relative overflow-hidden" ref={chartRef}>
            {months.map((m, i) => (
              <div key={i}
                className="absolute top-0 h-full border-l border-slate-100 flex items-center pl-1.5"
                style={{ left: `${pct(m)}%` }}>
                <span className="text-[10px] text-slate-400 font-semibold uppercase whitespace-nowrap">
                  {m.toLocaleDateString('en-US', {
                    month: 'short',
                    year: (i === 0 || m.getMonth() === 0) ? 'numeric' : undefined,
                  })}
                </span>
              </div>
            ))}
            <div className="absolute top-0 h-full w-px bg-red-400/60" style={{ left: `${todayPct}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="relative" style={{ height: totalH }}>
          {/* SVG arrows — sits over chart area only */}
          <svg
            className="absolute pointer-events-none z-10"
            style={{ left: LABEL_W, top: 0, width: chartPx, height: totalH }}
          >
            <defs>
              <marker id="dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#818cf8" />
              </marker>
            </defs>
            {visibleDeps.map((dep, i) => {
              const fb = bounds[dep.blocker_id];
              const tb = bounds[dep.blocked_id];
              const ri = rowIdx[dep.blocker_id];
              const rj = rowIdx[dep.blocked_id];
              const x1 = (fb.ep / 100) * chartPx;
              const y1 = (ri + 0.5) * ROW_H;
              const x2 = (tb.sp / 100) * chartPx;
              const y2 = (rj + 0.5) * ROW_H;
              const cx = (x1 + x2) / 2;
              return (
                <path key={i}
                  d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="1.5"
                  strokeDasharray={dep.type === 'relates_to' ? '5 3' : undefined}
                  markerEnd="url(#dep-arrow)"
                />
              );
            })}
          </svg>

          {/* Rows */}
          {rows.map(({ goal: g, depth, hasChildren }, i) => {
            const statusKey = g.auto_status || g.status;
            const barColor  = STATUS_META[statusKey]?.color || '#94a3b8';
            const b         = bounds[g.id];
            const progress  = g.progress || 0;
            const isMile    = g.goal_type === 'milestone';
            const hasDate   = g.start_date || g.due_date;

            return (
              <div key={g.id}
                className="flex border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                style={{ height: ROW_H, position: 'absolute', top: i * ROW_H, left: 0, right: 0 }}>
                {/* Label */}
                <div
                  style={{ width: LABEL_W, flexShrink: 0, paddingLeft: 8 + depth * 18 }}
                  className="flex items-center gap-1.5 border-r border-slate-100 pr-2 overflow-hidden bg-white">
                  <button
                    onClick={() => hasChildren && toggle(g.id)}
                    className={`w-4 h-4 flex items-center justify-center rounded flex-shrink-0 ${
                      hasChildren ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer' : 'cursor-default'
                    }`}>
                    {hasChildren
                      ? (collapsed.has(g.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />)
                      : <span className="w-1.5 h-1.5 rounded-full bg-slate-200 block" />}
                  </button>
                  <button
                    onClick={() => onGoalClick(g.id)}
                    className="text-xs text-slate-700 hover:text-indigo-600 truncate text-left flex-1 min-w-0 font-medium transition-colors">
                    {g.title}
                  </button>
                  {g.is_private && <EyeOff size={10} className="text-slate-300 flex-shrink-0" />}
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${GOAL_TYPE_META[g.goal_type]?.cls || ''}`}>
                    {GOAL_TYPE_META[g.goal_type]?.abbr || '?'}
                  </span>
                </div>

                {/* Chart strip */}
                <div className="flex-1 relative" style={{ height: ROW_H }}>
                  {months.map((m, mi) => mi > 0 && (
                    <div key={mi} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${pct(m)}%` }} />
                  ))}
                  <div className="absolute inset-y-0 w-px bg-red-400/20" style={{ left: `${todayPct}%` }} />

                  {hasDate && isMile ? (
                    <div
                      onClick={() => onGoalClick(g.id)}
                      title={g.title}
                      className="cursor-pointer hover:scale-110 transition-transform"
                      style={{
                        position: 'absolute',
                        left: `${(b.sp + b.ep) / 2}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        width: 12, height: 12,
                        backgroundColor: barColor,
                      }}
                    />
                  ) : hasDate ? (
                    <div
                      onClick={() => onGoalClick(g.id)}
                      title={`${g.title} — ${Math.round(progress)}%`}
                      className="absolute rounded-sm cursor-pointer hover:brightness-110 transition-all overflow-hidden"
                      style={{
                        left: `${b.sp}%`,
                        width: `${Math.max(b.ep - b.sp, 0.3)}%`,
                        top:    depth === 0 ? '18%' : '28%',
                        height: depth === 0 ? '64%' : '44%',
                        backgroundColor: barColor,
                      }}>
                      {/* Progress fill */}
                      <div className="absolute inset-y-0 left-0 bg-black/15 rounded-sm"
                        style={{ width: `${progress}%` }} />
                      {/* Label inside bar if wide enough */}
                      {(b.ep - b.sp) > 12 && (
                        <div className="absolute inset-0 flex items-center px-1.5">
                          <span className="text-white text-[9px] font-semibold truncate drop-shadow-sm">
                            {g.title}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 pt-3 mt-2 border-t border-slate-100 text-[10px] text-slate-400 px-2">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-red-400/70 rounded" /> Today
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-3 rounded-sm overflow-hidden" style={{ background: '#94a3b8' }}>
              <div className="h-full bg-black/15" style={{ width: '40%' }} />
            </div>
            Progress fill
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, background: '#f59e0b', transform: 'rotate(45deg)' }} />
            Milestone
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="10">
              <defs>
                <marker id="leg-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                  <path d="M0,0 L5,2.5 L0,5 Z" fill="#818cf8" />
                </marker>
              </defs>
              <line x1="1" y1="5" x2="20" y2="5" stroke="#818cf8" strokeWidth="1.5" markerEnd="url(#leg-arrow)" />
            </svg>
            Blocks
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="10">
              <line x1="1" y1="5" x2="20" y2="5" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            Relates to
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root goal card ──────────────────────────────────────────────────────────

function GoalCard({ goal, onClick }) {
  const statusKey  = goal.auto_status || goal.status;
  const statusMeta = STATUS_META[statusKey] || STATUS_META.not_started;
  const typeMeta   = GOAL_TYPE_META[goal.goal_type] || GOAL_TYPE_META.objective;
  const assignees  = Array.isArray(goal.assignees) ? goal.assignees : [];
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
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>

      <h3 className="text-base font-semibold text-slate-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug">
        {goal.title}
        {goal.is_locked  && <Lock   size={12} className="inline ml-1.5 text-amber-500 mb-0.5" />}
        {goal.is_private && <EyeOff size={12} className="inline ml-1.5 text-slate-400 mb-0.5" />}
      </h3>

      <ProgressBar value={progress} />

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
        placeholder="Strategic goal title" className={cls} />
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

  const [view, setView]           = useState('cards');
  const [showForm, setShowForm]   = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType]     = useState('');
  const [mineOnly, setMineOnly]   = useState(false);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['org-goals'],
    queryFn: getOrgGoals,
  });

  const { data: dependencies = [] } = useQuery({
    queryKey: ['org-goal-deps'],
    queryFn: getAllGoalDependencies,
    enabled: view === 'gantt',
  });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => client.get('/api/users').then(r => Array.isArray(r) ? r : r.users || []),
  });

  const create = useMutation({
    mutationFn: createOrgGoal,
    onSuccess: () => { qc.invalidateQueries(['org-goals']); setShowForm(false); },
  });

  const hasFilters = search.trim() !== '' || statusFilter !== '' || typeFilter !== '' || mineOnly;

  function flattenTree(nodes) {
    const out = [];
    function walk(n) { out.push(n); (n.children || []).forEach(walk); }
    nodes.forEach(walk);
    return out;
  }

  const filteredGoals = useMemo(() => {
    if (!hasFilters) return goals;
    const q = search.toLowerCase().trim();
    return flattenTree(goals).filter(g => {
      if (q && !g.title.toLowerCase().includes(q)) return false;
      if (statusFilter && (g.auto_status || g.status) !== statusFilter) return false;
      if (typeFilter && g.goal_type !== typeFilter) return false;
      if (mineOnly && g.created_by !== user?.id) return false;
      return true;
    });
  }, [goals, search, statusFilter, typeFilter, mineOnly, user?.id]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target size={20} className="text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-800">Strategic Goals</h1>
            {!isLoading && goals.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                {hasFilters ? `${filteredGoals.length} of ${flattenTree(goals).length}` : `${goals.length} objective${goals.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'cards' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <LayoutGrid size={13} /> Cards
              </button>
              <button
                onClick={() => setView('gantt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'gantt' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <GanttChartSquare size={13} /> Gantt
              </button>
            </div>
            {canManage && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
                <Plus size={14} /> New goal
              </button>
            )}
          </div>
        </div>

        {/* Search & filter bar — only shown when there are goals */}
        {!isLoading && goals.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search goals…"
                className="pl-8 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white w-56 placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatus(e.target.value)}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                statusFilter
                  ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium'
                  : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={e => setType(e.target.value)}
              className={`text-xs border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
                typeFilter
                  ? 'border-indigo-300 text-indigo-700 bg-indigo-50 font-medium'
                  : 'border-slate-200 text-slate-500 bg-white'
              }`}>
              <option value="">All types</option>
              {Object.entries(GOAL_TYPE_META).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>

            <button
              onClick={() => setMineOnly(o => !o)}
              className={`text-xs border rounded-lg px-2.5 py-1.5 transition-colors font-medium ${
                mineOnly
                  ? 'border-indigo-300 text-indigo-700 bg-indigo-50'
                  : 'border-slate-200 text-slate-500 bg-white hover:text-slate-700'
              }`}>
              Created by me
            </button>

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setStatus(''); setType(''); setMineOnly(false); }}
                className="text-xs text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 ml-1">
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}
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
            <p className="text-slate-500 font-semibold mb-2">No strategic goals yet</p>
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
        ) : hasFilters && filteredGoals.length === 0 ? (
          <div className="text-center py-20">
            <Search size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium mb-1">No goals match your filters</p>
            <button
              onClick={() => { setSearch(''); setStatus(''); setType(''); }}
              className="text-sm text-indigo-600 hover:text-indigo-500 mt-2">
              Clear filters
            </button>
          </div>
        ) : view === 'cards' ? (
          <>
            {hasFilters && (
              <p className="text-xs text-slate-400 mb-3">
                Showing {filteredGoals.length} matching goal{filteredGoals.length !== 1 ? 's' : ''} across all levels
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGoals.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onClick={() => navigate(`/goals/${g.id}`)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <GanttChart
              goals={hasFilters ? filteredGoals : goals}
              dependencies={dependencies}
              onGoalClick={(id) => navigate(`/goals/${id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
