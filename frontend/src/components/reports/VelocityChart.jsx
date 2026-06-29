import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVelocity } from '../../api/reports';

const W = 560, H = 180;
const PAD = { top: 16, right: 16, bottom: 48, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export default function VelocityChart({ projectId, onDrilldown }) {
  const { data: sprints = [], isLoading } = useQuery({
    queryKey: ['reports-velocity', projectId],
    queryFn: () => getVelocity(projectId),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-slate-400 text-sm p-8 text-center">Loading velocity...</div>;
  if (!sprints.length) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">
      No completed or active sprints yet.
    </div>
  );

  const maxPts = Math.max(...sprints.map(s => s.total_points), 1);
  const ticks = 4;
  const tickStep = Math.ceil(maxPts / ticks);
  const yMax = tickStep * ticks;

  const barGroupW = PLOT_W / sprints.length;
  const barW = Math.min(20, barGroupW * 0.3);
  const gap = 4;

  const yScale = v => PLOT_H - (v / yMax) * PLOT_H;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Velocity (Story Points)</div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> Planned</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Completed</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {/* Gridlines + y-ticks */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const val = i * tickStep;
            const y = PAD.top + yScale(val);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="#f1f5f9" strokeWidth={i === 0 ? 1.5 : 1} />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{val}</text>
              </g>
            );
          })}

          {/* Bars */}
          {sprints.map((s, i) => {
            const cx = PAD.left + i * barGroupW + barGroupW / 2;
            const totalH = (s.total_points / yMax) * PLOT_H;
            const doneH = (s.completed_points / yMax) * PLOT_H;
            const labelX = cx;
            const labelY = PAD.top + PLOT_H + 14;
            const shortName = s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name;

            const clickable = onDrilldown && s.sprint_id;
            return (
              <g key={s.sprint_id}
                onClick={() => clickable && onDrilldown({ label: `${s.name} tickets`, filters: { sprintId: s.sprint_id } })}
                className={clickable ? 'cursor-pointer' : ''}
              >
                {/* Hover target */}
                {clickable && <rect x={cx - barGroupW / 2} y={PAD.top} width={barGroupW} height={PLOT_H + 24} fill="transparent"
                  className="hover:fill-slate-50" rx={4} />}
                {/* Total (planned) bar */}
                <rect
                  x={cx - barW - gap / 2}
                  y={PAD.top + yScale(s.total_points)}
                  width={barW}
                  height={totalH}
                  rx={2} fill="#cbd5e1"
                />
                {/* Completed bar */}
                <rect
                  x={cx + gap / 2}
                  y={PAD.top + yScale(s.completed_points)}
                  width={barW}
                  height={doneH}
                  rx={2} fill="#6366f1"
                />
                <text x={labelX} y={labelY} textAnchor="middle" fontSize={9} fill="#64748b">{shortName}</text>
                {s.status === 'active' && (
                  <text x={labelX} y={labelY + 10} textAnchor="middle" fontSize={8} fill="#10b981">active</text>
                )}
              </g>
            );
          })}

          {/* X axis */}
          <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={W - PAD.right} y2={PAD.top + PLOT_H}
            stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>

      {/* Data table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-semibold">Sprint</th>
              <th className="text-right px-4 py-2 font-semibold">Total Pts</th>
              <th className="text-right px-4 py-2 font-semibold">Done Pts</th>
              <th className="text-right px-4 py-2 font-semibold">Tickets</th>
              <th className="text-right px-4 py-2 font-semibold">Done</th>
              <th className="text-right px-4 py-2 font-semibold">% Done</th>
              <th className="text-right px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...sprints].reverse().map(s => {
              const pct = s.total_points ? Math.round((s.completed_points / s.total_points) * 100) : 0;
              return (
                <tr key={s.sprint_id}
                  onClick={() => onDrilldown && onDrilldown({ label: `${s.name} tickets`, filters: { sprintId: s.sprint_id } })}
                  className={`border-b border-slate-50 hover:bg-slate-50 ${onDrilldown ? 'cursor-pointer' : ''}`}>
                  <td className="px-4 py-2 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{s.total_points}</td>
                  <td className="px-4 py-2 text-right text-indigo-600 font-medium">{s.completed_points}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{s.ticket_count}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{s.completed_count}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-semibold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                      {pct}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      s.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
