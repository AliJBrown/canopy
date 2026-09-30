import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Trash2, Pencil, X } from 'lucide-react';
import { getClients, createClient, updateClient, deleteClient } from '../api/clients';
import { getProjects } from '../api/projects';
import { useApp } from '../context/AppContext';

const EMPTY = { name: '', contact_person: '', contact_email: '', contact_phone: '', notes: '', project_id: '' };
const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 w-full';

function ClientForm({ initial = EMPTY, projects, onSave, onCancel, isPending }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, project_id: initial.project_id || '' });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={4} className="px-4 py-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={set('name')} placeholder="Client (company) name" required autoFocus className={inputCls} />
            <input value={form.contact_person} onChange={set('contact_person')} placeholder="Contact person" className={inputCls} />
            <input value={form.contact_email} onChange={set('contact_email')} placeholder="Contact email" type="email" className={inputCls} />
            <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="Contact phone" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Linked project <span className="font-normal normal-case text-slate-400">(used in "one project per client" mode)</span>
            </label>
            <select value={form.project_id} onChange={set('project_id')} className={inputCls}>
              <option value="">Auto-create when needed</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </select>
          </div>
          <textarea value={form.notes} onChange={set('notes')} placeholder="Notes (optional)" rows={2} className={inputCls} />
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button
              onClick={() => form.name.trim() && onSave({ ...form, project_id: form.project_id || null })}
              disabled={!form.name.trim() || isPending}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40">
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function ClientsPage() {
  const qc = useQueryClient();
  const { user } = useApp();
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin || user?.systemPermissions?.includes('clients.write');

  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const { data: clients = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: getClients });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  const create = useMutation({
    mutationFn: createClient,
    onSuccess: () => { qc.invalidateQueries(['clients']); setShowNew(false); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }) => updateClient(id, data),
    onSuccess: () => { qc.invalidateQueries(['clients']); setEditingId(null); },
  });
  const del = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => qc.invalidateQueries(['clients']),
    onError: (e) => alert(e.error || 'Failed to delete client'),
  });

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 w-full overflow-y-auto h-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Building2 size={18} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clients</h1>
          <p className="text-xs text-slate-500">Shared client records, reused across Programs</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-700">{clients.length} clients</span>
          {canManage && (
            <button onClick={() => setShowNew(s => !s)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">
              <Plus size={14} /> New client
            </button>
          )}
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Client', 'Contact', 'Programs', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showNew && (
              <ClientForm projects={projects} onSave={(data) => create.mutate(data)} onCancel={() => setShowNew(false)} isPending={create.isPending} />
            )}
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
            ) : clients.length === 0 && !showNew ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No clients yet</td></tr>
            ) : clients.map(c => editingId === c.id ? (
              <ClientForm
                key={c.id}
                initial={c}
                projects={projects}
                onSave={(data) => update.mutate({ id: c.id, ...data })}
                onCancel={() => setEditingId(null)}
                isPending={update.isPending}
              />
            ) : (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {c.contact_person ? (
                    <div>
                      <div className="text-slate-700">{c.contact_person}</div>
                      {(c.contact_email || c.contact_phone) && (
                        <div className="text-xs text-slate-400">{c.contact_email || c.contact_phone}</div>
                      )}
                    </div>
                  ) : (c.contact_email || c.contact_phone || '—')}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    {c.program_count}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingId(c.id)} title="Edit"
                        className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => { if (confirm(`Delete ${c.name}?`)) del.mutate(c.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
