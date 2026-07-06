import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Play, CheckCheck, Pencil, Trash2, ChevronDown, ChevronRight, Target, Calendar, Zap } from 'lucide-react';
import { getSprints, createSprint, updateSprint, deleteSprint, startSprint, getBurndown } from '../api/sprints';
import { getTicketList, updateTicket } from '../api/tickets';
import { TypeBadge, PriorityBadge, Avatar } from './Badge';
import Burndown from './Burndown';
import CompleteSprintModal from './CompleteSprintModal';

const STATUS_COLORS = {
  planned: 'bg-slate-100 text-slate-600',
  active:  'bg-emerald-100 text-emerald-700',
  completed: 'bg-slate-100 text-slate-400',
};

function toDateStr(d) {
  return d ? String(d).slice(0, 10) : '';
}

function formatDate(d) {
  if (!d) return null;
  return new Date(toDateStr(d) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLeft(endDate) {
  if (!endDate) return null;
  const diff = Math.ceil((new Date(toDateStr(endDate) + 'T00:00:00') - new Date()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'ends today';
  return `${diff}d left`;
}

// ─── Draggable ticket row ────────────────────────────────────────────────────

function TicketRow({ ticket, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { currentSprintId: ticket.sprint_id },
  });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick(ticket)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent
        hover:border-slate-200 hover:bg-white cursor-pointer select-none group transition-colors
        ${isDragging ? 'opacity-40' : ''}`}
    >
      <TypeBadge type={ticket.type} />
      <span className="text-[11px] text-slate-400 font-mono w-16 flex-shrink-0">{ticket.ticket_key}</span>
      <span className="text-sm text-slate-800 flex-1 truncate">{ticket.title}</span>
      {ticket.story_points != null && (
        <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5 flex-shrink-0">
          {ticket.story_points}pt
        </span>
      )}
      <PriorityBadge priority={ticket.priority} />
      {ticket.assignee
        ? <Avatar user={ticket.assignee} size="sm" />
        : <span className="w-6 h-6 flex-shrink-0" />
      }
    </div>
  );
}

// ─── Droppable sprint section ────────────────────────────────────────────────

function SprintSection({ sprint, tickets, allSprints, projectId, canManage, onTicketClick, onOpenComplete }) {
  const qc = useQueryClient();
  const { isOver, setNodeRef } = useDroppable({ id: sprint.id });
  const [collapsed, setCollapsed] = useState(sprint.status === 'completed');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: sprint.name, goal: sprint.goal || '', start_date: toDateStr(sprint.start_date), end_date: toDateStr(sprint.end_date), metric: sprint.metric || 'points' });

  const { data: burndownData } = useQuery({
    queryKey: ['burndown', sprint.id],
    queryFn: () => getBurndown(projectId, sprint.id),
    enabled: sprint.status === 'active' && !collapsed,
  });

  const doStart = useMutation({
    mutationFn: () => startSprint(projectId, sprint.id),
    onSuccess: () => qc.invalidateQueries(['sprints', projectId]),
    onError: (e) => alert(e.error || 'Failed to start sprint'),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteSprint(projectId, sprint.id),
    onSuccess: () => qc.invalidateQueries(['sprints', projectId]),
    onError: (e) => alert(e.error || 'Failed to delete sprint'),
  });

  const doEdit = useMutation({
    mutationFn: () => updateSprint(projectId, sprint.id, editForm),
    onSuccess: () => { qc.invalidateQueries(['sprints', projectId]); setEditing(false); },
  });

  const useHours = sprint.metric === 'hours';
  const totalPts = sprint.total_points ?? tickets.reduce((s, t) => s + (t.story_points || 0), 0);
  const donePts = sprint.done_points ?? tickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.story_points || 0), 0);
  const totalHrs = parseFloat(sprint.total_hours ?? tickets.reduce((s, t) => s + (t.estimate_hours || 0), 0));
  const doneHrs = parseFloat(sprint.done_hours ?? tickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.estimate_hours || 0), 0));
  const displayTotal = useHours ? totalHrs : totalPts;
  const displayDone = useHours ? doneHrs : donePts;
  const displayUnit = useHours ? 'hrs' : 'pts';
  const dl = daysLeft(sprint.end_date);

  return (
    <div className={`rounded-xl border ${sprint.status === 'active' ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      {/* Sprint header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setCollapsed(c => !c)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{sprint.name}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[sprint.status]}`}>
              {sprint.status}
            </span>
            {sprint.start_date && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Calendar size={10} />
                {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}
                {sprint.status === 'active' && dl && (
                  <span className={`ml-1 font-medium ${dl.includes('overdue') ? 'text-red-500' : 'text-slate-500'}`}>
                    ({dl})
                  </span>
                )}
              </span>
            )}
          </div>
          {sprint.goal && !collapsed && (
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <Target size={10} />{sprint.goal}
            </p>
          )}
        </div>

        {/* Progress pill */}
        {displayTotal > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="h-1.5 w-16 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min((displayDone / displayTotal) * 100, 100)}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
              {displayDone}/{displayTotal} {displayUnit}
            </span>
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {sprint.status === 'planned' && (
              <>
                <button onClick={() => doStart.mutate()}
                  disabled={doStart.isPending}
                  title="Start sprint"
                  className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg font-medium transition-colors">
                  <Play size={11} /> Start
                </button>
                <button onClick={() => setEditing(e => !e)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                  <Pencil size={13} />
                </button>
                <button onClick={() => confirm('Delete this sprint?') && doDelete.mutate()}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 size={13} />
                </button>
              </>
            )}
            {sprint.status === 'active' && (
              <>
                <button onClick={() => onOpenComplete(sprint)}
                  className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition-colors">
                  <CheckCheck size={11} /> Complete
                </button>
                <button onClick={() => setEditing(e => !e)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-3 space-y-2">
          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Sprint name"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
          <input value={editForm.goal} onChange={e => setEditForm(f => ({ ...f, goal: e.target.value }))}
            placeholder="Sprint goal (optional)"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
          <div className="flex gap-2">
            <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
            <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Track by:</span>
            <div className="flex gap-1">
              {['points', 'hours'].map(m => (
                <button key={m} type="button"
                  onClick={() => setEditForm(f => ({ ...f, metric: m }))}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    editForm.metric === m
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {m === 'points' ? 'Story points' : 'Hours'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500 px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={() => doEdit.mutate()} disabled={!editForm.name || doEdit.isPending}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-40">Save</button>
          </div>
        </div>
      )}

      {/* Burndown for active sprint */}
      {!collapsed && sprint.status === 'active' && burndownData && burndownData.length > 0 && (
        <div className="px-4 pb-3 border-t border-emerald-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-2">
            Burndown ({useHours ? 'hours' : 'story points'})
          </p>
          <Burndown data={burndownData} unit={displayUnit} />
        </div>
      )}

      {/* Ticket list */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`min-h-[48px] mx-3 mb-3 rounded-lg transition-colors ${isOver ? 'bg-indigo-50 ring-2 ring-indigo-200' : ''}`}
        >
          {tickets.length === 0 ? (
            <div className="flex items-center justify-center h-12 text-xs text-slate-400 italic">
              Drag tickets here to add to this sprint
            </div>
          ) : (
            <div className="space-y-0.5 py-1">
              {tickets.map(t => (
                <TicketRow key={t.id} ticket={t} onClick={onTicketClick} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create sprint form ──────────────────────────────────────────────────────

function CreateSprintForm({ projectId, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', metric: 'points' });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () => createSprint(projectId, form),
    onSuccess: () => { qc.invalidateQueries(['sprints', projectId]); onClose(); },
  });

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-700">New Sprint</p>
      <input value={form.name} onChange={set('name')} placeholder="Sprint name *" autoFocus required
        className="w-full text-sm border border-slate-200 bg-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
      <input value={form.goal} onChange={set('goal')} placeholder="Sprint goal (optional)"
        className="w-full text-sm border border-slate-200 bg-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
      <div className="flex gap-2">
        <input type="date" value={form.start_date} onChange={set('start_date')}
          className="flex-1 text-sm border border-slate-200 bg-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
        <input type="date" value={form.end_date} onChange={set('end_date')}
          className="flex-1 text-sm border border-slate-200 bg-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Track by:</span>
        <div className="flex gap-1">
          {['points', 'hours'].map(m => (
            <button key={m} type="button"
              onClick={() => setForm(f => ({ ...f, metric: m }))}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                form.metric === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300'
              }`}>
              {m === 'points' ? 'Story points' : 'Hours'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs text-slate-500 px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancel</button>
        <button onClick={() => create.mutate()} disabled={!form.name || create.isPending}
          className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-40">
          {create.isPending ? 'Creating...' : 'Create Sprint'}
        </button>
      </div>
    </div>
  );
}

// ─── Backlog droppable zone ──────────────────────────────────────────────────

const BACKLOG_ID = '__backlog__';

function BacklogSection({ tickets, canManage, onTicketClick, onAddClick }) {
  const { isOver, setNodeRef } = useDroppable({ id: BACKLOG_ID });

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Product Backlog</span>
          <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{tickets.length}</span>
        </div>
        {canManage && (
          <button onClick={onAddClick}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            <Plus size={12} /> Add ticket
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[60px] mx-3 my-2 rounded-lg transition-colors ${isOver ? 'bg-indigo-50 ring-2 ring-indigo-200' : ''}`}
      >
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center h-14 text-xs text-slate-400 italic">
            All tickets are in a sprint — great work!
          </div>
        ) : (
          <div className="space-y-0.5 py-1">
            {tickets.map(t => (
              <TicketRow key={t.id} ticket={t} onClick={onTicketClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main BacklogView ────────────────────────────────────────────────────────

export default function BacklogView({ projectId, canManage, onTicketClick, onAddClick }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const [selectedEpicId, setSelectedEpicId] = useState(null);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => getSprints(projectId),
    enabled: !!projectId,
  });

  const { data: allTickets = [] } = useQuery({
    queryKey: ['tickets', { projectId }],
    queryFn: () => getTicketList({ projectId }),
    enabled: !!projectId,
  });

  const moveTicket = useMutation({
    mutationFn: ({ ticketId, sprintId }) => updateTicket(ticketId, { sprint_id: sprintId }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets', { projectId }]);
      qc.invalidateQueries(['sprints', projectId]);
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = ({ active }) => {
    setActiveTicket(allTickets.find(t => t.id === active.id) || null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTicket(null);
    if (!over) return;
    const ticket = allTickets.find(t => t.id === active.id);
    if (!ticket) return;

    const targetSprintId = over.id === BACKLOG_ID ? null : over.id;
    if (targetSprintId === ticket.sprint_id) return;
    moveTicket.mutate({ ticketId: ticket.id, sprintId: targetSprintId });
  };

  // Separate tickets by sprint
  const epics = allTickets.filter(t => t.type === 'epic' && t.status !== 'done');
  const backlogTickets = selectedEpicId
    ? allTickets.filter(t => !t.sprint_id && t.parent_id === selectedEpicId)
    : allTickets.filter(t => !t.sprint_id && t.type !== 'epic');
  const activeSprints = sprints.filter(s => s.status !== 'completed');
  const completedSprints = sprints.filter(s => s.status === 'completed');

  const ticketsForSprint = (sprintId) => {
    const base = allTickets.filter(t => t.sprint_id === sprintId);
    return selectedEpicId
      ? base.filter(t => t.parent_id === selectedEpicId)
      : base.filter(t => t.type !== 'epic');
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Epic sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
        <div className="p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Epics</p>
          <button
            onClick={() => setSelectedEpicId(null)}
            className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg mb-1 font-medium transition-colors ${
              selectedEpicId === null
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All tickets
          </button>
          {epics.length === 0 && (
            <p className="text-[11px] text-slate-400 italic px-2 py-1">No epics yet</p>
          )}
          {epics.map(epic => (
            <button
              key={epic.id}
              onClick={() => setSelectedEpicId(epic.id === selectedEpicId ? null : epic.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg mb-0.5 transition-colors ${
                selectedEpicId === epic.id
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="text-[10px] font-mono text-slate-400">{epic.ticket_key}</div>
              <div className="text-xs font-medium truncate">{epic.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto h-full scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-800">Sprint Planning</h2>
          {selectedEpicId && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {epics.find(e => e.id === selectedEpicId)?.title}
            </span>
          )}
        </div>
        {canManage && !showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
            <Plus size={14} /> Create Sprint
          </button>
        )}
      </div>

      {showCreate && <CreateSprintForm projectId={projectId} onClose={() => setShowCreate(false)} />}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {/* Active + planned sprints */}
          {activeSprints.map(sprint => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              tickets={ticketsForSprint(sprint.id)}
              allSprints={sprints}
              projectId={projectId}
              canManage={canManage}
              onTicketClick={onTicketClick}
              onOpenComplete={setCompleteTarget}
            />
          ))}

          {/* Backlog */}
          <BacklogSection
            tickets={backlogTickets}
            canManage={canManage}
            onTicketClick={onTicketClick}
            onAddClick={onAddClick}
          />

          {/* Completed sprints (collapsed by default, just shown as summary) */}
          {completedSprints.length > 0 && (
            <details className="rounded-xl border border-slate-100">
              <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 list-none flex items-center gap-2">
                <ChevronRight size={12} className="details-open:rotate-90" />
                {completedSprints.length} completed sprint{completedSprints.length > 1 ? 's' : ''}
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-2">
                {completedSprints.map(sprint => (
                  <div key={sprint.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-sm text-slate-600">{sprint.name}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>
                        {sprint.metric === 'hours'
                          ? `${sprint.done_hours ?? 0}/${sprint.total_hours ?? 0} hrs`
                          : `${sprint.done_points ?? 0}/${sprint.total_points ?? 0} pts`}
                      </span>
                      {sprint.completed_at && (
                        <span>{new Date(sprint.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <DragOverlay>
          {activeTicket && (
            <div className="bg-white rounded-lg border border-indigo-300 shadow-xl px-3 py-2 flex items-center gap-2 opacity-95 rotate-1">
              <TypeBadge type={activeTicket.type} />
              <span className="text-xs font-mono text-slate-400">{activeTicket.ticket_key}</span>
              <span className="text-sm text-slate-800 truncate max-w-[200px]">{activeTicket.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {completeTarget && (
        <CompleteSprintModal
          sprint={completeTarget}
          otherSprints={sprints}
          projectId={projectId}
          onClose={() => setCompleteTarget(null)}
        />
      )}
      </div>
    </div>
  );
}
