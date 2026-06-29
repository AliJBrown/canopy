import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Folder, Ticket } from 'lucide-react';
import { getProjects, createProject } from '../api/projects';

export default function ProjectsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [desc, setDesc] = useState('');

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => { qc.invalidateQueries(['projects']); nav(`/p/${p.key}`); },
  });

  const autoKey = (v) => {
    setName(v);
    setKey(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5));
  };

  if (isLoading) return <div className="flex items-center justify-center h-full text-slate-400">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); create.mutate({ name, key, description: desc }); }}
          className="mb-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">New Project</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project Name *</label>
              <input value={name} onChange={e => autoKey(e.target.value)} required placeholder="My Project"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Key * (e.g. PROJ)</label>
              <input value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} required placeholder="PROJ"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What is this project about?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={create.isPending}
              className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50">
              {create.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects.map(p => (
          <div key={p.id}
            onClick={() => nav(`/p/${p.key}`)}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                  {p.key.slice(0, 2)}
                </div>
                <div>
                  <h2 className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{p.name}</h2>
                  <div className="text-xs text-slate-400 font-mono">{p.key}</div>
                </div>
              </div>
            </div>
            {p.description && <p className="mt-3 text-sm text-slate-500 line-clamp-2">{p.description}</p>}
            <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <Ticket size={12} />
              <span>{p.ticket_count} ticket{p.ticket_count !== 1 ? 's' : ''}</span>
            </div>
          </div>
        ))}

        {projects.length === 0 && !showForm && (
          <div className="col-span-2 flex flex-col items-center justify-center py-16 text-slate-400">
            <Folder size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No projects yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
