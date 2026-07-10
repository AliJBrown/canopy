import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { TypeBadge, PriorityBadge, StatusBadge, Avatar } from './Badge';

function TicketRow({ ticket, depth = 0, onTicketClick, onStatusChange, onAddChild, allTickets, collapsed, onToggle, statuses }) {
  const children = allTickets.filter(t => t.parent_id === ticket.id);
  const isOpen = !collapsed.has(ticket.id);

  return (
    <>
      <tr className="group hover:bg-slate-50 border-b border-slate-100 cursor-pointer"
        onClick={() => onTicketClick(ticket)}>
        <td className="py-2 px-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {children.length > 0 ? (
              <button onClick={e => { e.stopPropagation(); onToggle(ticket.id); }}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600">
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <TypeBadge type={ticket.type} />
            <span className="text-[11px] text-slate-400 font-mono ml-1">{ticket.ticket_key}</span>
            <span className="ml-2 text-sm text-slate-800 font-medium truncate max-w-md">{ticket.title}</span>
          </div>
        </td>
        <td className="py-2 px-4 text-center">
          <StatusBadge status={ticket.status}
            onChange={v => onStatusChange(ticket.id, v)}
            statuses={statuses} />
        </td>
        <td className="py-2 px-4">
          <PriorityBadge priority={ticket.priority} showLabel />
        </td>
        <td className="py-2 px-4">
          {ticket.assignee
            ? <div className="flex items-center gap-1.5"><Avatar user={ticket.assignee} /><span className="text-xs text-slate-600">{ticket.assignee.name}</span></div>
            : <span className="text-xs text-slate-400">Unassigned</span>
          }
        </td>
        <td className="py-2 px-4 text-center">
          {ticket.story_points != null
            ? <span className="text-xs font-semibold text-indigo-500">{ticket.story_points}</span>
            : <span className="text-xs text-slate-300">—</span>
          }
          {ticket.type === 'epic' && ticket.epic_progress?.total > 0 && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              {ticket.epic_progress.done}/{ticket.epic_progress.total}
            </div>
          )}
        </td>
        <td className="py-2 px-4 text-xs text-slate-400">
          {new Date(ticket.created_at).toLocaleDateString()}
        </td>
        <td className="py-2 px-4">
          <button onClick={e => { e.stopPropagation(); onAddChild(ticket); }}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
            <Plus size={11} /> Sub-ticket
          </button>
        </td>
      </tr>
      {isOpen && children.map(child => (
        <TicketRow
          key={child.id}
          ticket={child}
          depth={depth + 1}
          onTicketClick={onTicketClick}
          onStatusChange={onStatusChange}
          onAddChild={onAddChild}
          allTickets={allTickets}
          collapsed={collapsed}
          onToggle={onToggle}
          statuses={statuses}
        />
      ))}
    </>
  );
}

export default function ListView({ tickets, onTicketClick, onStatusChange, onAddChild, statuses }) {
  const roots = useMemo(() => tickets.filter(t => !t.parent_id), [tickets]);

  const parentIds = useMemo(
    () => new Set(tickets.filter(t => t.parent_id).map(t => t.parent_id)),
    [tickets]
  );

  // Empty set = all expanded (default)
  const [collapsed, setCollapsed] = useState(new Set());

  const toggle = (id) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const expandAll  = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(parentIds));

  const hasParents = parentIds.size > 0;

  if (!tickets.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No tickets yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full scrollbar-thin">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-white z-10 border-b-2 border-slate-100">
          <tr>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                {hasParents && (
                  <button
                    onClick={collapsed.size > 0 ? expandAll : collapseAll}
                    title={collapsed.size > 0 ? 'Expand all' : 'Collapse all'}
                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {collapsed.size > 0 ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
                Title
              </div>
            </th>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignee</th>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">SP</th>
            <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
            <th className="py-2.5 px-4" />
          </tr>
        </thead>
        <tbody>
          {roots.map(ticket => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              depth={0}
              onTicketClick={onTicketClick}
              onStatusChange={onStatusChange}
              onAddChild={onAddChild}
              allTickets={tickets}
              collapsed={collapsed}
              onToggle={toggle}
              statuses={statuses}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
