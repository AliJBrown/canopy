import React, { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, CalendarClock, AlertCircle } from 'lucide-react';
import { TypeBadge, PriorityBadge, Avatar, STATUS_CONFIG } from './Badge';

function DueDateChip({ dueDate, status }) {
  if (!dueDate || status === 'done') return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  let cls, label;
  if (diffDays < 0) {
    cls = 'text-red-600 bg-red-50';
    label = `${Math.abs(diffDays)}d overdue`;
  } else if (diffDays <= 2) {
    cls = 'text-orange-600 bg-orange-50';
    label = diffDays === 0 ? 'Due today' : `${diffDays}d left`;
  } else {
    cls = 'text-slate-400 bg-slate-50';
    label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      <CalendarClock size={9} />
      {label}
    </span>
  );
}

function TicketCard({ ticket, onClick, isDragOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { status: ticket.status },
  });

  const style = { transform: CSS.Translate.toString(transform) };
  const isBlocked = ticket.blocked_by_count > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick(ticket)}
      className={`bg-white rounded-lg border p-3 cursor-pointer select-none
        hover:border-indigo-300 hover:shadow-sm transition-all group
        ${isDragging ? 'opacity-40 shadow-lg' : ''}
        ${isDragOverlay ? 'shadow-xl rotate-1 opacity-95' : ''}
        ${isBlocked ? 'border-red-200' : 'border-slate-200'}
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeBadge type={ticket.type} />
          <span className="text-[11px] text-slate-400 font-mono">{ticket.ticket_key}</span>
          {isBlocked && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              <AlertCircle size={9} />
              Blocked
            </span>
          )}
        </div>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <p className="text-sm text-slate-800 font-medium leading-snug line-clamp-2">{ticket.title}</p>
      {ticket.type === 'epic' && ticket.epic_progress?.total > 0 && (
        <div className="mt-1.5 space-y-0.5">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: `${Math.min((ticket.epic_progress.done / ticket.epic_progress.total) * 100, 100)}%` }} />
          </div>
          <div className="text-[10px] text-slate-400">{ticket.epic_progress.done}/{ticket.epic_progress.total} done</div>
        </div>
      )}
      {ticket.child_count > 0 && ticket.type !== 'epic' && (
        <div className="mt-1.5 text-[11px] text-slate-400">{ticket.child_count} sub-ticket{ticket.child_count > 1 ? 's' : ''}</div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {ticket.assignee
          ? <Avatar user={ticket.assignee} size="sm" />
          : <span />
        }
        <div className="flex items-center gap-1.5">
          {ticket.story_points != null && (
            <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">
              {ticket.story_points}pt
            </span>
          )}
          <DueDateChip dueDate={ticket.due_date} status={ticket.status} />
        </div>
      </div>
    </div>
  );
}

function Column({ status, label, color, wip_limit, tickets, onTicketClick, onAddClick }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const overLimit = wip_limit != null && tickets.length >= wip_limit;

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{label}</span>
          <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
            overLimit
              ? 'bg-red-100 text-red-600 font-bold'
              : 'bg-slate-200 text-slate-500'
          }`}>
            {wip_limit != null ? `${tickets.length} / ${wip_limit}` : tickets.length}
          </span>
        </div>
        <button onClick={() => onAddClick(status)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
          <Plus size={14} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 min-h-[100px] p-2 rounded-xl transition-colors
          ${isOver ? 'bg-indigo-50 ring-2 ring-indigo-200' : overLimit ? 'bg-red-50/40' : 'bg-slate-100/60'}`}
      >
        {tickets.map(t => (
          <TicketCard key={t.id} ticket={t} onClick={onTicketClick} />
        ))}
      </div>
    </div>
  );
}

export default function Board({ tickets, onTicketClick, onStatusChange, onAddClick, statuses, selectedStatuses }) {
  const [activeTicket, setActiveTicket] = useState(null);
  const [wipToast, setWipToast] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = ({ active }) => {
    setActiveTicket(tickets.find(t => t.id === active.id) || null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTicket(null);
    if (!over) return;
    const ticket = tickets.find(t => t.id === active.id);
    if (ticket && over.id !== ticket.status) {
      onStatusChange(ticket.id, over.id, (warning) => {
        if (warning) {
          setWipToast(`WIP limit exceeded: ${warning.count}/${warning.limit} in "${over.id}"`);
          setTimeout(() => setWipToast(null), 4000);
        }
      });
    }
  };

  const allColumns = statuses && statuses.length > 0
    ? statuses.map(s => ({ status: s.slug, label: s.name, color: s.color, wip_limit: s.wip_limit ?? null, tickets: tickets.filter(t => t.status === s.slug) }))
    : Object.entries(STATUS_CONFIG).map(([status, cfg]) => ({ status, label: cfg.label, color: null, wip_limit: null, tickets: tickets.filter(t => t.status === status) }));

  const columns = selectedStatuses?.length
    ? allColumns.filter(c => selectedStatuses.includes(c.status))
    : allColumns;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-5 overflow-x-auto h-full scrollbar-thin">
        {columns.map(col => (
          <Column
            key={col.status}
            {...col}
            onTicketClick={onTicketClick}
            onAddClick={onAddClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket && <TicketCard ticket={activeTicket} onClick={() => {}} isDragOverlay />}
      </DragOverlay>
      {wipToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
          {wipToast}
        </div>
      )}
    </DndContext>
  );
}
