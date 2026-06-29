import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { createTicket, getTicketList } from '../api/tickets';
import { getProjectMembers } from '../api/admin';
import { getSprints } from '../api/sprints';
import { getLabels } from '../api/labels';
import { getProjectStatuses } from '../api/projectStatuses';
import { useApp } from '../context/AppContext';
import { TYPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from './Badge';

export default function CreateTicketModal({ projectId, defaultStatus = 'backlog', defaultParentId = null, onClose }) {
  const qc = useQueryClient();
  const { user } = useApp();
  const titleRef = useRef(null);
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => getSprints(projectId),
    enabled: !!projectId,
  });
  const activeSprints = sprints.filter(s => s.status !== 'completed');
  const defaultSprintId = activeSprints.find(s => s.status === 'active')?.id || '';

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'task',
    status: defaultStatus,
    priority: 'medium',
    assignee_id: '',
    parent_id: defaultParentId || '',
    due_date: '',
    estimate_hours: '',
    story_points: '',
    sprint_id: defaultSprintId,
  });
  const [selectedLabelIds, setSelectedLabelIds] = useState([]);

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  });
  const assignableUsers = members.filter(m => m.role !== 'viewer');
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', 'parent-select', projectId],
    queryFn: () => getTicketList({ projectId }),
    enabled: !!projectId,
  });
  const { data: labels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  });
  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => getProjectStatuses(projectId),
    enabled: !!projectId,
  });
  const statusOptions = projectStatuses.length > 0
    ? projectStatuses.map(s => ({ value: s.slug, label: s.name }))
    : STATUS_OPTIONS;

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mut = useMutation({
    mutationFn: () => createTicket({
      project_id: projectId,
      title: form.title,
      description: form.description,
      type: form.type,
      status: form.status,
      priority: form.priority,
      assignee_id: form.assignee_id || null,
      reporter_id: user?.id || null,
      parent_id: form.parent_id || null,
      due_date: form.due_date || null,
      estimate_hours: form.estimate_hours ? parseFloat(form.estimate_hours) : null,
      story_points: form.story_points ? parseInt(form.story_points) : null,
      sprint_id: form.sprint_id || null,
      label_ids: selectedLabelIds,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets']);
      onClose();
    },
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Create ticket</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="p-6 space-y-4">
          <input
            ref={titleRef}
            value={form.title}
            onChange={set('title')}
            placeholder="Ticket title"
            required
            className="w-full text-lg font-medium text-slate-900 border-b border-slate-200 pb-2 outline-none focus:border-indigo-400 placeholder-slate-300"
          />

          <textarea
            value={form.description}
            onChange={set('description')}
            placeholder="Description (optional)"
            rows={3}
            className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-3 outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Type</label>
              <select value={form.type} onChange={set('type')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={set('status')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Priority</label>
              <select value={form.priority} onChange={set('priority')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Assignee</label>
              <select value={form.assignee_id} onChange={set('assignee_id')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                <option value="">Unassigned</option>
                {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Date <span className="font-normal normal-case text-slate-400">(optional)</span></label>
              <input type="date" value={form.due_date} onChange={set('due_date')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Story Points</label>
              <input type="number" min="0" step="1" placeholder="Optional" value={form.story_points} onChange={set('story_points')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Estimate (hours)</label>
              <input type="number" min="0" step="0.5" placeholder="Optional" value={form.estimate_hours} onChange={set('estimate_hours')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sprint</label>
              <select value={form.sprint_id} onChange={set('sprint_id')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                <option value="">Backlog</option>
                {activeSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {labels.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Labels</label>
              <div className="flex flex-wrap gap-1.5">
                {labels.map(l => {
                  const sel = selectedLabelIds.includes(l.id);
                  return (
                    <button key={l.id} type="button"
                      onClick={() => setSelectedLabelIds(ids =>
                        sel ? ids.filter(id => id !== l.id) : [...ids, l.id]
                      )}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border-2 transition-all font-medium"
                      style={sel
                        ? { background: l.color, borderColor: l.color, color: '#fff' }
                        : { background: l.color + '18', borderColor: l.color + '44', color: l.color }
                      }>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Parent Ticket</label>
            <select value={form.parent_id} onChange={set('parent_id')}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="">None (root ticket)</option>
              {tickets.map(t => (
                <option key={t.id} value={t.id}>{t.ticket_key}: {t.title.slice(0, 50)}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!form.title.trim() || mut.isPending}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {mut.isPending ? 'Creating...' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
