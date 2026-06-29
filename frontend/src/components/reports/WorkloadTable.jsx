import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkload } from '../../api/reports';
import { Avatar } from '../Badge';

export default function WorkloadTable({ projectId, onDrilldown }) {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['reports-workload', projectId],
    queryFn: () => getWorkload(projectId),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-slate-400 text-sm p-8 text-center">Loading workload...</div>;
  if (!members.length) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">
      No team members found.
    </div>
  );

  const maxPts = Math.max(...members.map(m => m.open_points), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team Workload</div>
        <div className="text-xs text-slate-400">{members.length} members</div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide bg-slate-50">
            <th className="text-left px-4 py-2.5 font-semibold">Member</th>
            <th className="text-right px-4 py-2.5 font-semibold">Open</th>
            <th className="px-4 py-2.5 font-semibold min-w-[120px]">Points</th>
            <th className="text-right px-4 py-2.5 font-semibold">In Progress</th>
            <th className="text-right px-4 py-2.5 font-semibold">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const pct = (m.open_points / maxPts) * 100;
            return (
              <tr key={m.id}
                onClick={() => onDrilldown && m.open_tickets > 0 && onDrilldown({ label: `${m.name}'s open tickets`, filters: { assigneeId: m.id } })}
                className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${onDrilldown && m.open_tickets > 0 ? 'cursor-pointer' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar user={m} size="sm" />
                    <span className="font-medium text-slate-800">{m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-slate-700">{m.open_tickets}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-slate-600 text-xs font-medium w-8 text-right">{m.open_points}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {m.in_progress_count > 0 ? (
                    <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {m.in_progress_count}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {m.overdue_count > 0 ? (
                    <span className="inline-flex items-center justify-center bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {m.overdue_count}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
