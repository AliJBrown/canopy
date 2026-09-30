import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, ExternalLink, Trash2, CheckSquare, Ticket as TicketIcon, Check, RefreshCw, Wand2, Search, Link2 } from 'lucide-react';
import { getChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem } from '../api/checklistItems';
import { getStageProgress, updateStageProgress } from '../api/programStageProgress';
import { getTicketList } from '../api/tickets';
import { StatusBadge } from './Badge';

const STATE_OPTIONS = [
  { value: null,          label: 'Auto',        icon: Wand2 },
  { value: 'not_started', label: 'Not started', icon: null },
  { value: 'active',      label: 'In progress', icon: RefreshCw },
  { value: 'done',        label: 'Done',        icon: Check },
];

export default function ProgramChecklistModal({ programId, stageId, stageName, clientName, canManage, onClose }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('task'); // 'task' | 'ticket' | 'link'
  const [linkSearch, setLinkSearch] = useState('');
  const [notes, setNotes] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist-items', programId, stageId],
    queryFn: () => getChecklistItems(programId, stageId),
  });

  const { data: progress } = useQuery({
    queryKey: ['stage-progress', programId, stageId],
    queryFn: () => getStageProgress(programId, stageId),
  });
  useEffect(() => { setNotes(progress?.notes || ''); }, [progress?.notes]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['checklist-items', programId, stageId] });
    qc.invalidateQueries({ queryKey: ['programs'] });
  }

  const create = useMutation({
    mutationFn: () => createChecklistItem(programId, { stage_id: stageId, item_type: newType, title: newTitle }),
    onSuccess: () => { invalidate(); setNewTitle(''); },
  });
  const linkExisting = useMutation({
    mutationFn: (ticketId) => createChecklistItem(programId, { stage_id: stageId, item_type: 'ticket', existing_ticket_id: ticketId }),
    onSuccess: () => { invalidate(); setLinkSearch(''); },
  });
  const { data: ticketResults = [], isFetching: searchingTickets } = useQuery({
    queryKey: ['ticket-search', linkSearch],
    queryFn: () => getTicketList({ search: linkSearch, limit: 8 }),
    enabled: newType === 'link' && linkSearch.trim().length > 0,
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_done }) => updateChecklistItem(programId, id, { is_done }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id) => deleteChecklistItem(programId, id),
    onSuccess: invalidate,
  });

  const saveProgress = useMutation({
    mutationFn: (data) => updateStageProgress(programId, stageId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-progress', programId, stageId] });
      qc.invalidateQueries({ queryKey: ['programs'] });
    },
  });
  const setManualState = (manual_state) => saveProgress.mutate({ manual_state, notes });
  const saveNotes = () => saveProgress.mutate({ manual_state: progress?.manual_state ?? null, notes });

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{stageName}</h2>
            <p className="text-xs text-slate-500">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-slate-100">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Stage status
          </label>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
            {STATE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button key={label} type="button" disabled={!canManage || saveProgress.isPending}
                onClick={() => setManualState(value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:cursor-default ${
                  (progress?.manual_state ?? null) === value
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {Icon ? <Icon size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                {label}
              </button>
            ))}
          </div>
          {!progress?.manual_state && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              Auto: derived from checklist completion below. Pick a status to override it by hand.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
          {isLoading ? (
            <div className="text-center text-slate-400 text-sm py-8">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">No checklist items yet</div>
          ) : items.map(item => (
            <div key={item.id} className="flex items-center gap-2.5 group px-2 py-1.5 rounded-lg hover:bg-slate-50">
              {item.item_type === 'task' ? (
                <input type="checkbox" checked={item.is_done} disabled={!canManage}
                  onChange={e => toggle.mutate({ id: item.id, is_done: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 flex-shrink-0" />
              ) : (
                <TicketIcon size={14} className="text-indigo-400 flex-shrink-0" />
              )}

              {item.item_type === 'task' ? (
                <span className={`flex-1 text-sm min-w-0 truncate ${item.is_done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {item.title}
                </span>
              ) : (
                <Link
                  to={`/p/${item.ticket_project_key}/board?ticket=${item.ticket_id}`}
                  className="flex-1 text-sm min-w-0 flex items-center gap-1.5 text-slate-700 hover:text-indigo-600 truncate">
                  <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                    {item.ticket_project_key}-{item.ticket_number}
                  </span>
                  <span className="truncate">{item.ticket_title}</span>
                  <ExternalLink size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100" />
                </Link>
              )}

              {item.item_type === 'ticket' && (
                <StatusBadge status={item.ticket_status} />
              )}

              {canManage && (
                <button onClick={() => remove.mutate(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 flex-shrink-0 p-0.5">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 px-6 py-3 border-t border-slate-100">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            disabled={!canManage}
            placeholder="Notes about this stage..."
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {canManage && (
          <div className="flex-shrink-0 border-t border-slate-100 p-4 space-y-2">
            {newType === 'link' ? (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search existing tickets to link..."
                  className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 w-full placeholder:text-slate-400" />
                {linkSearch.trim().length > 0 && (
                  <div className="absolute bottom-full mb-1 z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {ticketResults.length > 0 ? ticketResults.map(t => (
                      <button key={t.id} onClick={() => linkExisting.mutate(t.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{t.ticket_key}</span>
                        <span className="truncate flex-1">{t.title}</span>
                        <Plus size={12} className="text-indigo-500 flex-shrink-0" />
                      </button>
                    )) : (
                      <div className="px-3 py-2 text-sm text-slate-400">
                        {searchingTickets ? 'Searching...' : 'No matching tickets'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); if (newTitle.trim()) create.mutate(); }} className="flex items-center gap-2">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder={newType === 'task' ? 'Add a task...' : 'Ticket title...'}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
                <button type="submit" disabled={!newTitle.trim() || create.isPending}
                  className="bg-indigo-600 text-white rounded-lg p-2 hover:bg-indigo-500 disabled:opacity-40 flex-shrink-0">
                  <Plus size={16} />
                </button>
              </form>
            )}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setNewType('task')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  newType === 'task' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <CheckSquare size={12} /> Task
              </button>
              <button type="button" onClick={() => setNewType('ticket')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  newType === 'ticket' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <TicketIcon size={12} /> New ticket <span className="text-slate-400 font-normal">(heavier work)</span>
              </button>
              <button type="button" onClick={() => setNewType('link')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  newType === 'link' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Link2 size={12} /> Link ticket
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
