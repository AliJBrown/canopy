import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, StickyNote } from 'lucide-react';
import { updateProgram } from '../api/programs';

export default function ProgramNotesModal({ program, canManage, onClose }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(program.notes || '');

  const save = useMutation({
    mutationFn: (data) => updateProgram(program.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programs'] }),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <StickyNote size={16} className="text-indigo-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800">Notes</h2>
              <p className="text-xs text-slate-500 truncate">
                {program.client_name ? `${program.name} — ${program.client_name}` : program.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => save.mutate({ notes })}
            disabled={!canManage}
            autoFocus
            placeholder="Notes about this program..."
            rows={8}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>
    </div>
  );
}
