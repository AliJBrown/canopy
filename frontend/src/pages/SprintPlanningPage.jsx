import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, ChevronDown, ChevronRight, Play, Search } from 'lucide-react';
import { getProjects } from '../api/projects';
import { getTickets, updateTicket } from '../api/tickets';
import { getSprints, createSprint, startSprint } from '../api/sprints';
import { TypeBadge, PriorityBadge, Avatar } from '../components/Badge';
import CreateTicketModal from '../components/CreateTicketModal';
import TicketPanel from '../components/TicketPanel';
import { getProjectStatuses } from '../api/projectStatuses';

function PlanningCard({ ticket, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick(ticket)}
      className={`bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer select-none
        hover:border-indigo-300 hover:shadow-sm transition-all
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <TypeBadge type={ticket.type} />
        <span className="text-[10px] font-mono text-slate-400">{ticket.ticket_key}</span>
        <PriorityBadge priority={ticket.priority} />
        {ticket.story_points != null && (
          <span className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">
            {ticket.story_points}pt
          </span>
        )}
      </div>
      <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2">{ticket.title}</p>
      {ticket.assignee && (
        <div className="mt-1.5">
          <Avatar user={ticket.assignee} size="sm" />
        </div>
      )}
    </div>
  );
}

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
        <div className="flex items-center justify-center h-16 text-xs text-slate-400 italic">
          {label}
        </div>
      )}
    </div>
  );
}

export default function SprintPlanningPage() {
  const { projectKey } = useParams();
  const qc = useQueryClient();
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);

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
  const activeSprint = sprints.find(s => s.status === 'active');
  const currentSprintId = selectedSprintId ?? activeSprint?.id ?? plannableSprints[0]?.id ?? null;
  const currentSprint = sprints.find(s => s.id === currentSprintId);

  const { data: backlogData } = useQuery({
    queryKey: ['tickets', 'planning-backlog', project?.id, backlogSearch],
    queryFn: () => getTickets({ projectId: project.id, sprintId: 'none', search: backlogSearch || undefined, limit: 100 }),
    enabled: !!project?.id,
  });

  const { data: sprintData } = useQuery({
    queryKey: ['tickets', 'planning-sprint', currentSprintId],
    queryFn: () => getTickets({ projectId: project.id, sprintId: currentSprintId, limit: 200 }),
    enabled: !!project?.id && !!currentSprintId,
  });

  const backlogTickets = backlogData?.tickets ?? [];
  const sprintTickets = sprintData?.tickets ?? [];

  const totalPts = sprintTickets.reduce((s, t) => s + (t.story_points || 0), 0);
  const donePts  = sprintTickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.story_points || 0), 0);

  const moveMut = useMutation({
    mutationFn: ({ id, sprint_id }) => updateTicket(id, { sprint_id }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets', 'planning-backlog', project?.id]);
      qc.invalidateQueries(['tickets', 'planning-sprint', currentSprintId]);
    },
  });

  const createSprintMut = useMutation({
    mutationFn: (name) => createSprint(project.id, { name }),
    onSuccess: (s) => {
      qc.invalidateQueries(['sprints', project?.id]);
      setSelectedSprintId(s.id);
      setShowNewSprint(false);
      setNewSprintName('');
    },
  });

  const startSprintMut = useMutation({
    mutationFn: () => startSprint(project.id, currentSprintId),
    onSuccess: () => qc.invalidateQueries(['sprints', project?.id]),
  });

  const handleDragStart = ({ active }) => {
    const t = [...backlogTickets, ...sprintTickets].find(t => t.id === active.id);
    setActiveTicket(t || null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTicket(null);
    if (!over) return;
    const ticket = [...backlogTickets, ...sprintTickets].find(t => t.id === active.id);
    if (!ticket) return;
    if (over.id === 'sprint' && ticket.sprint_id !== currentSprintId) {
      moveMut.mutate({ id: ticket.id, sprint_id: currentSprintId });
    } else if (over.id === 'backlog' && ticket.sprint_id !== null) {
      moveMut.mutate({ id: ticket.id, sprint_id: null });
    }
  };

  if (!project) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Project not found</div>;
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full overflow-hidden bg-slate-50">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-4">
          <h2 className="font-semibold text-slate-800">Sprint Planning</h2>

          {/* Sprint selector */}
          <div className="flex items-center gap-2">
            <select
              value={currentSprintId || ''}
              onChange={e => setSelectedSprintId(e.target.value || null)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
            >
              {plannableSprints.length === 0 && <option value="">No sprints</option>}
              {plannableSprints.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.status === 'active' ? '(Active)' : ''}
                </option>
              ))}
            </select>

            {currentSprint?.status === 'planned' && (
              <button
                onClick={() => startSprintMut.mutate()}
                disabled={startSprintMut.isPending}
                className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-500 disabled:opacity-40 font-medium"
              >
                <Play size={11} /> Start Sprint
              </button>
            )}
          </div>

          <button
            onClick={() => setShowNewSprint(o => !o)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium ml-auto"
          >
            <Plus size={13} /> New Sprint
          </button>
        </div>

        {/* New sprint inline form */}
        {showNewSprint && (
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-2">
            <input
              autoFocus
              value={newSprintName}
              onChange={e => setNewSprintName(e.target.value)}
              placeholder="Sprint name"
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <button
              onClick={() => newSprintName.trim() && createSprintMut.mutate(newSprintName.trim())}
              disabled={!newSprintName.trim() || createSprintMut.isPending}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium"
            >
              Create
            </button>
            <button onClick={() => setShowNewSprint(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
              Cancel
            </button>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex-1 overflow-hidden flex gap-0">
          {/* LEFT — Backlog */}
          <div className="w-2/5 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden">
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Backlog</span>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{backlogTickets.length}</span>
              <button
                onClick={() => setShowCreate(true)}
                className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="px-3 py-2 border-b border-slate-50">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={backlogSearch}
                  onChange={e => setBacklogSearch(e.target.value)}
                  placeholder="Filter backlog…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <DropZone id="backlog" label="Drag sprint tickets here to remove from sprint">
                {backlogTickets.map(t => (
                  <PlanningCard key={t.id} ticket={t} onClick={() => setSelectedTicketId(t.id)} />
                ))}
              </DropZone>
            </div>
          </div>

          {/* RIGHT — Sprint */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {currentSprint ? (
              <>
                {/* Sprint header + capacity bar */}
                <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs font-semibold text-slate-700">{currentSprint.name}</span>
                      {currentSprint.start_date && currentSprint.end_date && (
                        <span className="ml-2 text-[10px] text-slate-400">
                          {new Date(currentSprint.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                          {new Date(currentSprint.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{sprintTickets.length} tickets · {totalPts}pt</span>
                  </div>
                  {totalPts > 0 && (
                    <div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${Math.min((donePts / totalPts) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>{donePts}pt done</span>
                        <span>{totalPts - donePts}pt remaining</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  <DropZone id="sprint" label="Drag backlog tickets here to add to sprint">
                    {sprintTickets.map(t => (
                      <PlanningCard key={t.id} ticket={t} onClick={() => setSelectedTicketId(t.id)} />
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
        <CreateTicketModal
          projectId={project.id}
          defaultStatus="backlog"
          onClose={() => setShowCreate(false)}
        />
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
            }
          }}
        />
      )}
    </DndContext>
  );
}
