import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { createPipelineStage, updatePipelineStage, reorderPipelineStages, deletePipelineStage } from '../api/pipelineStages';

export default function ManageProgramStagesModal({ stages, onClose }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['programs'] });
  }

  const create = useMutation({
    mutationFn: () => createPipelineStage({ name: newName }),
    onSuccess: () => { invalidate(); setNewName(''); },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }) => updatePipelineStage(id, { name }),
    onSuccess: () => { invalidate(); setRenaming(null); },
  });
  const reorder = useMutation({
    mutationFn: (order) => reorderPipelineStages(order),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id) => deletePipelineStage(id),
    onSuccess: invalidate,
    onError: (e) => alert(e.error || 'Failed to delete stage'),
  });

  function move(index, dir) {
    const order = stages.map(s => s.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    reorder.mutate(order);
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Manage stages</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              {renaming?.id === s.id ? (
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={e => setRenaming({ id: s.id, name: e.target.value })}
                  onBlur={() => renaming.name.trim() && rename.mutate({ id: s.id, name: renaming.name })}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  className="flex-1 text-sm border border-indigo-200 rounded px-1.5 py-0.5 outline-none" />
              ) : (
                <span onClick={() => setRenaming({ id: s.id, name: s.name })}
                  className="flex-1 text-sm text-slate-700 cursor-text truncate">{s.name}</span>
              )}
              <div className="flex items-center opacity-0 group-hover:opacity-100 flex-shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === stages.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                  <ChevronDown size={13} />
                </button>
                <button onClick={() => { if (confirm(`Delete stage "${s.name}"?`)) remove.mutate(s.id); }}
                  className="p-1 text-slate-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={e => { e.preventDefault(); if (newName.trim()) create.mutate(); }}
          className="flex-shrink-0 border-t border-slate-100 p-4 flex items-center gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New stage name"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
          <button type="submit" disabled={!newName.trim() || create.isPending}
            className="bg-indigo-600 text-white rounded-lg p-2 hover:bg-indigo-500 disabled:opacity-40 flex-shrink-0">
            <Plus size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
