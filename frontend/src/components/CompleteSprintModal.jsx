import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2 } from 'lucide-react';
import { completeSprint } from '../api/sprints';

export default function CompleteSprintModal({ sprint, otherSprints, projectId, onClose }) {
  const qc = useQueryClient();
  const [moveToSprintId, setMoveToSprintId] = useState('');
  const [error, setError] = useState('');

  const incompleteCount = (sprint.ticket_count ?? 0) - (sprint.done_points !== undefined
    ? undefined : 0);

  const complete = useMutation({
    mutationFn: () => completeSprint(projectId, sprint.id, {
      move_to_sprint_id: moveToSprintId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['sprints', projectId]);
      qc.invalidateQueries(['tickets']);
      onClose();
    },
    onError: (e) => setError(e.error || 'Failed to complete sprint'),
  });

  const plannedSprints = (otherSprints || []).filter(
    s => s.id !== sprint.id && s.status === 'planned'
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Complete Sprint</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Sprint summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">{sprint.name}</p>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600 font-medium">
                <CheckCircle2 size={13} className="inline mr-1" />
                {sprint.done_points ?? 0} pts done
              </span>
              <span className="text-slate-500">
                {(sprint.total_points ?? 0) - (sprint.done_points ?? 0)} pts remaining
              </span>
            </div>
          </div>

          {/* Where to move incomplete tickets */}
          {((sprint.total_points ?? 0) - (sprint.done_points ?? 0)) > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Move incomplete tickets to
              </label>
              <select
                value={moveToSprintId}
                onChange={e => setMoveToSprintId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">Product Backlog</option>
                {plannedSprints.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => complete.mutate()}
              disabled={complete.isPending}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-40">
              {complete.isPending ? 'Completing...' : 'Complete Sprint'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
