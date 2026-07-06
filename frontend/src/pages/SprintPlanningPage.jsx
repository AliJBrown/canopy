import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, ChevronDown, ChevronRight, Play, Search, Edit2,
  CheckCircle2, AlertTriangle, Flag, BarChart2, ArrowUpDown,
  TrendingUp, FileText,
} from 'lucide-react';
import { getProjects } from '../api/projects';
import { getTickets, updateTicket } from '../api/tickets';
import { getSprints, createSprint, updateSprint, startSprint, getBurndown } from '../api/sprints';
import { TypeBadge, PriorityBadge, Avatar } from '../components/Badge';
import CreateTicketModal from '../components/CreateTicketModal';
import TicketPanel from '../components/TicketPanel';
import CompleteSprintModal from '../components/CompleteSprintModal';
import Burndown from '../components/Burndown';
import { getProjectStatuses } from '../api/projectStatuses';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function toDateStr(d) { return d ? String(d).slice(0, 10) : ''; }

function fmt(d) {
  if (!d) return '';
  return new Date(toDateStr(d) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLeft(d) {
  if (!d) return null;
  return Math.ceil((new Date(toDateStr(d) + 'T00:00:00') - new Date()) / 86400000);
}

function HealthBadge({ health }) {
  if (!health) return null;
  const cfg = {
    on_track: { cls: 'bg-emerald-100 text-emerald-700', label: 'On Track' },
    at_risk:  { cls: 'bg-amber-100 text-amber-700',   label: 'At Risk' },
    behind:   { cls: 'bg-red-100 text-red-700',       label: 'Behind' },
    done:     { cls: 'bg-indigo-100 text-indigo-700', label: 'Complete' },
  }[health];
  if (!cfg) return null;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Inline story-point editor ────────────────────────────────────────────────

function InlinePoints({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft === '' ? null : parseInt(draft, 10);
    if (draft !== '' && isNaN(v)) { setEditing(false); return; }
    onSave(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" min="0" max="999" autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        className="ml-auto w-10 text-[10px] font-semibold text-center text-indigo-600 bg-white border border-indigo-300 rounded px-1 py-0.5 outline-none"
      />
    );
  }

  return value != null ? (
    <button
      className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5 hover:bg-indigo-100 transition-colors"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
    >{value}pt</button>
  ) : (
    <button
      className="ml-auto text-[10px] text-amber-500 bg-amber-50 rounded px-1.5 py-0.5 font-medium hover:bg-amber-100 transition-colors"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); setDraft(''); setEditing(true); }}
    >?pt</button>
  );
}

// ── Planning card ────────────────────────────────────────────────────────────

function PlanningCard({ ticket, onClick, onPointsChange }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick(ticket)}
      className={`bg-white border rounded-lg p-2.5 cursor-pointer select-none hover:shadow-sm transition-all
        ${isDragging ? 'opacity-40' : ''}
        ${ticket.story_points == null ? 'border-amber-200' : 'border-slate-200 hover:border-indigo-300'}
      `}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <TypeBadge type={ticket.type} />
        <span className="text-[10px] font-mono text-slate-400">{ticket.ticket_key}</span>
        <PriorityBadge priority={ticket.priority} />
        <InlinePoints value={ticket.story_points} onSave={v => onPointsChange(ticket.id, v)} />
      </div>
      <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2">{ticket.title}</p>
      {ticket.assignee && <div className="mt-1.5"><Avatar user={ticket.assignee} size="sm" /></div>}
    </div>
  );
}

// ── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ id, children, label, className }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded-xl transition-colors p-2 space-y-2 ${
        isOver ? 'bg-indigo-50 ring-2 ring-indigo-200' : className || 'bg-slate-50'
      }`}
    >
      {children}
      {!children?.length && (
        <div className="flex items-center justify-center h-16 text-xs text-slate-400 italic">{label}</div>
      )}
    </div>
  );
}

// ── Sprint create / edit form ─────────────────────────────────────────────────

function SprintForm({ initial, onSave, onCancel, isPending, title }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    goal: initial?.goal || '',
    start_date: toDateStr(initial?.start_date),
    end_date: toDateStr(initial?.end_date),
    metric: initial?.metric || 'points',
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const cls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 bg-white';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>}
      <input value={form.name} onChange={set('name')} placeholder="Sprint name" required autoFocus className={cls} />
      <textarea value={form.goal} onChange={set('goal')} placeholder="Sprint goal (optional)" rows={2}
        className={`${cls} resize-none`} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Start date</label>
          <input type="date" value={form.start_date} onChange={set('start_date')} className={cls} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">End date</label>
          <input type="date" value={form.end_date} onChange={set('end_date')} className={cls} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Metric</label>
        <select value={form.metric} onChange={set('metric')} className={cls}>
          <option value="points">Story points</option>
          <option value="hours">Hours</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={() => form.name.trim() && onSave(form)}
          disabled={isPending || !form.name.trim()}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SprintPlanningPage() {
  const { projectKey } = useParams();
  const qc = useQueryClient();

  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [backlogSearch, setBacklogSearch]       = useState('');
  const [backlogSort, setBacklogSort]           = useState('default');
  const [showCreate, setShowCreate]             = useState(false);
  const [showNewSprint, setShowNewSprint]       = useState(false);
  const [showEditSprint, setShowEditSprint]     = useState(false);
  const [showComplete, setShowComplete]         = useState(false);
  const [showBurndown, setShowBurndown]         = useState(true);
  const [showRetro, setShowRetro]               = useState(false);
  const [retroDraft, setRetroDraft]             = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [activeTicket, setActiveTicket]         = useState(null);

  const retroTimer = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', project?.id],
    queryFn: () => getSprints(project.id),
    enabled: !!project?.id,
  });

  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', project?.id],
    queryFn: () => getProjectStatuses(project.id),
    enabled: !!project?.id,
  });

  const plannableSprints = sprints.filter(s => s.status !== 'completed');
  const activeSprint     = sprints.find(s => s.status === 'active');
  const currentSprintId  = selectedSprintId ?? activeSprint?.id ?? plannableSprints[0]?.id ?? null;
  const currentSprint    = sprints.find(s => s.id === currentSprintId);

  // Velocity: avg done_points of last 3 completed sprints
  const avgVelocity = useMemo(() => {
    const completed = sprints.filter(s => s.status === 'completed' && s.done_points > 0);
    if (!completed.length) return null;
    const last3 = completed.slice(-3);
    return Math.round(last3.reduce((s, sp) => s + (sp.done_points || 0), 0) / last3.length);
  }, [sprints]);

  const { data: backlogData } = useQuery({
    queryKey: ['tickets', 'planning-backlog', project?.id, backlogSearch, 'open'],
    queryFn: () => getTickets({ projectId: project.id, sprintId: 'none', notStatus: 'done', search: backlogSearch || undefined, limit: 200 }),
    enabled: !!project?.id,
  });

  const { data: sprintData } = useQuery({
    queryKey: ['tickets', 'planning-sprint', currentSprintId],
    queryFn: () => getTickets({ projectId: project.id, sprintId: currentSprintId, limit: 200 }),
    enabled: !!project?.id && !!currentSprintId,
  });

  const { data: burndownData = [] } = useQuery({
    queryKey: ['burndown', currentSprintId],
    queryFn: () => getBurndown(project.id, currentSprintId),
    enabled: !!project?.id && !!currentSprintId
      && currentSprint?.status === 'active'
      && !!(currentSprint?.start_date && currentSprint?.end_date),
    refetchInterval: 60_000,
  });

  const rawBacklog   = backlogData?.tickets ?? [];
  const sprintTickets = sprintData?.tickets ?? [];

  // Sorted backlog
  const backlogTickets = useMemo(() => {
    const t = [...rawBacklog];
    if (backlogSort === 'priority')   t.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
    if (backlogSort === 'pts_high')   t.sort((a, b) => (b.story_points ?? -1) - (a.story_points ?? -1));
    if (backlogSort === 'pts_low')    t.sort((a, b) => (a.story_points ?? 9999) - (b.story_points ?? 9999));
    if (backlogSort === 'unestimated') t.sort((a, b) => (a.story_points == null ? -1 : 1) - (b.story_points == null ? -1 : 1));
    return t;
  }, [rawBacklog, backlogSort]);

  const unestimatedBacklog = rawBacklog.filter(t => t.story_points == null).length;
  const unestimatedSprint  = sprintTickets.filter(t => t.story_points == null).length;
  const totalPts   = sprintTickets.reduce((s, t) => s + (t.story_points || 0), 0);
  const donePts    = sprintTickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.story_points || 0), 0);
  const committed  = currentSprint?.committed_points ?? 0;
  const pctDone    = totalPts > 0 ? (donePts / totalPts) * 100 : 0;
  const dl         = daysLeft(currentSprint?.end_date);

  const sprintHealth = useMemo(() => {
    if (!burndownData?.length || currentSprint?.status !== 'active') return null;
    const latest = burndownData[burndownData.length - 1];
    if (latest.remaining === 0) return 'done';
    if (latest.remaining <= latest.ideal) return 'on_track';
    if (latest.remaining <= latest.ideal * 1.3) return 'at_risk';
    return 'behind';
  }, [burndownData, currentSprint]);

  // Sync retro draft when sprint changes
  const prevSprintId = useRef(null);
  if (currentSprint && currentSprintId !== prevSprintId.current) {
    prevSprintId.current = currentSprintId;
    setRetroDraft(currentSprint.retrospective || '');
  }

  // Mutations
  const moveMut = useMutation({
    mutationFn: ({ id, sprint_id }) => updateTicket(id, { sprint_id }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets', 'planning-backlog', project?.id]);
      qc.invalidateQueries(['tickets', 'planning-sprint', currentSprintId]);
      qc.invalidateQueries(['burndown', currentSprintId]);
    },
  });

  const pointsMut = useMutation({
    mutationFn: ({ id, story_points }) => updateTicket(id, { story_points }),
    onSuccess: (_, { id }) => {
      // Optimistically done via React Query invalidation
      qc.invalidateQueries(['tickets', 'planning-backlog', project?.id]);
      qc.invalidateQueries(['tickets', 'planning-sprint', currentSprintId]);
    },
  });

  const createSprintMut = useMutation({
    mutationFn: (data) => createSprint(project.id, data),
    onSuccess: (s) => { qc.invalidateQueries(['sprints', project?.id]); setSelectedSprintId(s.id); setShowNewSprint(false); },
  });

  const editSprintMut = useMutation({
    mutationFn: (data) => updateSprint(project.id, currentSprintId, data),
    onSuccess: () => { qc.invalidateQueries(['sprints', project?.id]); setShowEditSprint(false); },
  });

  const retroMut = useMutation({
    mutationFn: (retrospective) => updateSprint(project.id, currentSprintId, { retrospective }),
    onSuccess: () => qc.invalidateQueries(['sprints', project?.id]),
  });

  const startSprintMut = useMutation({
    mutationFn: () => startSprint(project.id, currentSprintId),
    onSuccess: () => qc.invalidateQueries(['sprints', project?.id]),
    onError: (e) => alert(e.error || 'Failed to start sprint'),
  });

  const saveRetro = useCallback((text) => {
    clearTimeout(retroTimer.current);
    retroTimer.current = setTimeout(() => retroMut.mutate(text), 1200);
  }, [currentSprintId]); // eslint-disable-line

  const handleDragStart = ({ active }) => {
    setActiveTicket([...backlogTickets, ...sprintTickets].find(t => t.id === active.id) || null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTicket(null);
    if (!over) return;
    const ticket = [...backlogTickets, ...sprintTickets].find(t => t.id === active.id);
    if (!ticket) return;
    if (over.id === 'sprint' && ticket.sprint_id !== currentSprintId)
      moveMut.mutate({ id: ticket.id, sprint_id: currentSprintId });
    else if (over.id === 'backlog' && ticket.sprint_id !== null)
      moveMut.mutate({ id: ticket.id, sprint_id: null });
  };

  if (!project) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Project not found</div>
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full overflow-hidden bg-slate-50">

        {/* ── Top bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-800">Sprint Planning</h2>

          <select
            value={currentSprintId || ''}
            onChange={e => { setSelectedSprintId(e.target.value || null); setShowEditSprint(false); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
          >
            {plannableSprints.length === 0 && <option value="">No sprints</option>}
            {plannableSprints.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (Active)' : ''}</option>
            ))}
          </select>

          {currentSprint?.status === 'planned' && (
            <button
              onClick={() => (!currentSprint.start_date || !currentSprint.end_date) ? setShowEditSprint(true) : startSprintMut.mutate()}
              disabled={startSprintMut.isPending}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-500 disabled:opacity-40 font-medium"
            >
              <Play size={11} /> Start Sprint
            </button>
          )}

          {currentSprint?.status === 'active' && (
            <button onClick={() => setShowComplete(true)}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
              <CheckCircle2 size={11} /> Complete Sprint
            </button>
          )}

          {avgVelocity != null && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 ml-1">
              <TrendingUp size={11} className="text-emerald-500" />
              Avg velocity: <strong className="text-slate-600">{avgVelocity}pt</strong>
              <span className="text-slate-300">(last {Math.min(sprints.filter(s => s.status === 'completed' && s.done_points > 0).length, 3)})</span>
            </span>
          )}

          <button onClick={() => { setShowNewSprint(o => !o); setShowEditSprint(false); }}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium ml-auto">
            <Plus size={13} /> New Sprint
          </button>
        </div>

        {/* ── New sprint form ── */}
        {showNewSprint && (
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3">
            <SprintForm title="New Sprint"
              onSave={(data) => createSprintMut.mutate(data)}
              onCancel={() => setShowNewSprint(false)}
              isPending={createSprintMut.isPending}
            />
          </div>
        )}

        {/* ── Two-column body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* LEFT — Backlog */}
          <div className="w-2/5 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden">
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Backlog</span>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{rawBacklog.length}</span>
              {unestimatedBacklog > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 font-medium">
                  <AlertTriangle size={9} /> {unestimatedBacklog} unestimated
                </span>
              )}
              <button onClick={() => setShowCreate(true)}
                className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium">
                <Plus size={12} /> Add
              </button>
            </div>

            {/* Search + sort */}
            <div className="px-3 py-2 border-b border-slate-50 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={backlogSearch} onChange={e => setBacklogSearch(e.target.value)}
                  placeholder="Filter backlog…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
              </div>
              <div className="relative">
                <ArrowUpDown size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select value={backlogSort} onChange={e => setBacklogSort(e.target.value)}
                  className="pl-6 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white appearance-none cursor-pointer">
                  <option value="default">Default</option>
                  <option value="priority">Priority</option>
                  <option value="pts_high">Points ↓</option>
                  <option value="pts_low">Points ↑</option>
                  <option value="unestimated">Unestimated first</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <DropZone id="backlog" label="Drag sprint tickets here to remove from sprint">
                {backlogTickets.map(t => (
                  <PlanningCard key={t.id} ticket={t}
                    onClick={() => setSelectedTicketId(t.id)}
                    onPointsChange={(id, pts) => pointsMut.mutate({ id, story_points: pts })}
                  />
                ))}
              </DropZone>
            </div>
          </div>

          {/* RIGHT — Sprint */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {currentSprint ? (
              <>
                <div className="flex-shrink-0 bg-white border-b border-slate-100">

                  {/* Sprint meta */}
                  {showEditSprint ? (
                    <div className="px-4 py-3">
                      <SprintForm initial={currentSprint}
                        onSave={(data) => editSprintMut.mutate(data, {
                          onSuccess: () => {
                            if (!currentSprint.start_date && data.start_date && currentSprint.status === 'planned')
                              startSprintMut.mutate();
                          },
                        })}
                        onCancel={() => setShowEditSprint(false)}
                        isPending={editSprintMut.isPending}
                        title="Edit Sprint"
                      />
                    </div>
                  ) : (
                    <div className="px-4 py-3 space-y-2">
                      {/* Name + health + edit */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{currentSprint.name}</span>
                        <HealthBadge health={sprintHealth} />
                        <button onClick={() => setShowEditSprint(true)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors" title="Edit sprint">
                          <Edit2 size={12} />
                        </button>
                      </div>

                      {/* Dates */}
                      {currentSprint.start_date && currentSprint.end_date ? (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{fmt(currentSprint.start_date)} – {fmt(currentSprint.end_date)}</span>
                          {dl !== null && (
                            <span className={`font-medium ${dl < 0 ? 'text-red-500' : dl <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>
                              · {dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'ends today' : `${dl}d left`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => setShowEditSprint(true)}
                          className="text-[11px] text-amber-500 hover:text-amber-600 flex items-center gap-1">
                          <AlertTriangle size={10} /> Set sprint dates for burndown
                        </button>
                      )}

                      {/* Goal */}
                      {currentSprint.goal && (
                        <div className="flex items-start gap-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <Flag size={10} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                          <span className="leading-snug">{currentSprint.goal}</span>
                        </div>
                      )}

                      {/* Stats */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-slate-500">
                            {sprintTickets.length} ticket{sprintTickets.length !== 1 ? 's' : ''}
                            {unestimatedSprint > 0 && (
                              <span className="ml-1.5 text-amber-500">· {unestimatedSprint} unestimated</span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 text-slate-500">
                            {committed > 0 && (
                              <span>Committed: <strong className="text-slate-700">{committed}pt</strong></span>
                            )}
                            <span>Done: <strong className="text-slate-700">{donePts}</strong> / {totalPts}pt</span>
                          </div>
                        </div>
                        {totalPts > 0 && (
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(pctDone, 100)}%`,
                                background: pctDone >= 80 ? '#10b981' : pctDone >= 40 ? '#f59e0b' : '#6366f1',
                              }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Burndown toggle */}
                  {!showEditSprint && currentSprint.status === 'active' && currentSprint.start_date && currentSprint.end_date && (
                    <div className="border-t border-slate-50">
                      <button onClick={() => setShowBurndown(o => !o)}
                        className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <BarChart2 size={11} />
                        <span className="font-medium">Burndown</span>
                        {showBurndown ? <ChevronDown size={10} className="ml-auto" /> : <ChevronRight size={10} className="ml-auto" />}
                      </button>
                      {showBurndown && (
                        <div className="px-3 pb-3">
                          <Burndown data={burndownData.length ? burndownData : null}
                            unit={currentSprint.metric === 'hours' ? 'hrs' : 'pts'} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Retrospective toggle */}
                  {!showEditSprint && (
                    <div className="border-t border-slate-50">
                      <button onClick={() => setShowRetro(o => !o)}
                        className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <FileText size={11} />
                        <span className="font-medium">Retrospective notes</span>
                        {retroMut.isPending && <span className="ml-1 text-[10px] text-slate-300">saving…</span>}
                        {showRetro ? <ChevronDown size={10} className="ml-auto" /> : <ChevronRight size={10} className="ml-auto" />}
                      </button>
                      {showRetro && (
                        <div className="px-3 pb-3">
                          <textarea
                            value={retroDraft}
                            onChange={e => { setRetroDraft(e.target.value); saveRetro(e.target.value); }}
                            placeholder="What went well? What didn't? What will you change next sprint?"
                            rows={4}
                            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300 resize-none bg-white text-slate-700 placeholder:text-slate-300"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Ticket drop zone */}
                <div className="flex-1 overflow-y-auto p-3">
                  <DropZone id="sprint" label="Drag backlog tickets here to add to sprint">
                    {sprintTickets.map(t => (
                      <PlanningCard key={t.id} ticket={t}
                        onClick={() => setSelectedTicketId(t.id)}
                        onPointsChange={(id, pts) => pointsMut.mutate({ id, story_points: pts })}
                      />
                    ))}
                  </DropZone>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                No sprint selected. Create or select a sprint above.
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeTicket && (
          <div className="bg-white border border-indigo-300 rounded-lg p-2.5 shadow-xl rotate-1 opacity-95 w-64">
            <p className="text-xs font-medium text-slate-700 truncate">{activeTicket.title}</p>
          </div>
        )}
      </DragOverlay>

      {showCreate && project && (
        <CreateTicketModal projectId={project.id} defaultStatus="backlog" onClose={() => setShowCreate(false)} />
      )}

      {selectedTicketId && project && (
        <TicketPanel
          ticketId={selectedTicketId}
          projectId={project.id}
          projectRole={project.my_role}
          statuses={projectStatuses}
          onClose={() => setSelectedTicketId(null)}
          onTicketChange={(id) => {
            if (id) setSelectedTicketId(id);
            else {
              setSelectedTicketId(null);
              qc.invalidateQueries(['tickets', 'planning-backlog', project?.id]);
              qc.invalidateQueries(['tickets', 'planning-sprint', currentSprintId]);
              qc.invalidateQueries(['burndown', currentSprintId]);
            }
          }}
        />
      )}

      {showComplete && currentSprint && (
        <CompleteSprintModal
          sprint={currentSprint}
          otherSprints={sprints}
          projectId={project.id}
          onClose={() => setShowComplete(false)}
        />
      )}
    </DndContext>
  );
}
