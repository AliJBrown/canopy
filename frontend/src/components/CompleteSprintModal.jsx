import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, Circle, TrendingUp } from 'lucide-react';
import { completeSprint } from '../api/sprints';

export default function CompleteSprintModal({ sprint, otherSprints, projectId, onClose }) {
  const qc = useQueryClient();
  const [moveToSprintId, setMoveToSprintId] = useState('');
  const [error, setError] = useState('');

  const totalPts      = sprint.total_points ?? 0;
  const donePts       = sprint.done_points ?? 0;
  const committedPts  = sprint.committed_points ?? 0;
  const remainingPts  = totalPts - donePts;
  const completionPct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0;
  const doneTickets   = sprint.ticket_count > 0
    ? Math.round((donePts / Math.max(totalPts, 1)) * sprint.ticket_count)
    : 0;

  const complete = useMutation({
    mutationFn: () => completeSprint(projectId, sprint.id, { move_to_sprint_id: moveToSprintId || null }),
    onSuccess: () => { qc.invalidateQueries(['sprints', projectId]); qc.invalidateQueries(['tickets']); onClose(); },
    onError: (e) => setError(e.error || 'Failed to complete sprint'),
  });

  const plannedSprints = (otherSprints || []).filter(s => s.id !== sprint.id && s.status === 'planned');

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
          {/* Sprint name */}
          <p className="text-sm font-semibold text-slate-800">{sprint.name}</p>

          {/* Summary stats */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{completionPct}% complete</span>
                <span>{donePts} / {totalPts} pts</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${completionPct}%`,
                    background: completionPct >= 80 ? '#10b981' : completionPct >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-600">{donePts}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Pts done</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-600">{remainingPts}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Remaining</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${committedPts > 0 ? (donePts >= committedPts ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'}`}>
                  {committedPts > 0 ? committedPts : '—'}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Committed</div>
              </div>
            </div>

            {/* Commitment insight */}
            {committedPts > 0 && (
              <div className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${
                donePts >= committedPts
                  ? 'bg-emerald-50 text-emerald-700'
                  : donePts >= committedPts * 0.8
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                <TrendingUp size={12} />
                {donePts >= committedPts
                  ? `Delivered ${donePts - committedPts > 0 ? `${donePts - committedPts}pt over` : 'exactly at'} commitment`
                  : `${committedPts - donePts}pt short of commitment`
                }
              </div>
            )}
          </div>

          {/* Where to move incomplete tickets */}
          {remainingPts > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Move {sprint.ticket_count - doneTickets} incomplete ticket{sprint.ticket_count - doneTickets !== 1 ? 's' : ''} to
              </label>
              <select
                value={moveToSprintId}
                onChange={e => setMoveToSprintId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">Product Backlog</option>
                {plannedSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={() => complete.mutate()} disabled={complete.isPending}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-40">
              {complete.isPending ? 'Completing…' : 'Complete Sprint'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
