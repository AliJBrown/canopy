import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCycleTime } from '../../api/reports';

const W = 560, H = 160;
const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function fmtWeek(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtHours(h) {
  if (h == null) return '—';
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function CycleTimeChart({ projectId }) {
  const { data: weeks = [], isLoading } = useQuery({
    queryKey: ['reports-cycle-time', projectId],
    queryFn: () => getCycleTime(projectId),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-slate-400 text-sm p-8 text-center">Loading cycle time...</div>;
  if (!weeks.length) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">
      No completed tickets with cycle time data yet.
    </div>
  );

  const maxH = Math.max(...weeks.map(w => Math.max(w.avg_hours, w.median_hours)), 1);
  const yMax = Math.ceil(maxH / 24) * 24 || 24;
  const ticks = 4;
  const tickStep = yMax / ticks;

  const xScale = i => (i / Math.max(weeks.length - 1, 1)) * PLOT_W;
  const yScale = v => PLOT_H - (v / yMax) * PLOT_H;

  const avgPoints = weeks.map((w, i) => `${xScale(i)},${yScale(w.avg_hours)}`).join(' ');
  const medPoints = weeks.map((w, i) => `${xScale(i)},${yScale(w.median_hours)}`).join(' ');

  const totalTickets = weeks.reduce((s, w) => s + w.count, 0);
  const overallAvg = Math.round(weeks.reduce((s, w) => s + w.avg_hours * w.count, 0) / (totalTickets || 1));
  const overallMedian = Math.round(weeks.reduce((s, w) => s + w.median_hours * w.count, 0) / (totalTickets || 1));
  const maxAvg = Math.max(...weeks.map(w => w.avg_hours));
  const minAvg = Math.min(...weeks.map(w => w.avg_hours));

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Cycle Time', value: fmtHours(overallAvg), accent: 'border-indigo-400' },
          { label: 'Median', value: fmtHours(overallMedian), accent: 'border-purple-400' },
          { label: 'Fastest Week', value: fmtHours(minAvg), accent: 'border-emerald-400' },
          { label: 'Slowest Week', value: fmtHours(maxAvg), accent: 'border-red-400' },
        ].map(({ label, value, accent }) => (
          <div key={label} className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 border-l-4 ${accent}`}>
            <div className="text-xl font-bold text-slate-800">{value}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Line chart */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Weekly Cycle Time (last 12 weeks)</div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg width={20} height={8}><line x1={0} y1={4} x2={20} y2={4} stroke="#6366f1" strokeWidth={2} /></svg>
              Avg
            </span>
            <span className="flex items-center gap-1.5">
              <svg width={20} height={8}><line x1={0} y1={4} x2={20} y2={4} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="3 2" /></svg>
              Median
            </span>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {/* Gridlines */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const val = i * tickStep;
            const y = PAD.top + yScale(val);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="#f1f5f9" strokeWidth={i === 0 ? 1.5 : 1} />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
                  {fmtHours(val)}
                </text>
              </g>
            );
          })}

          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            {/* Median line */}
            {weeks.length > 1 && (
              <polyline points={medPoints} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            {/* Avg line */}
            {weeks.length > 1 && (
              <polyline points={avgPoints} fill="none" stroke="#6366f1" strokeWidth={2} />
            )}

            {/* Dots + x labels */}
            {weeks.map((w, i) => {
              const x = xScale(i);
              const y = yScale(w.avg_hours);
              const showLabel = weeks.length <= 8 || i % 2 === 0;
              return (
                <g key={w.week}>
                  <circle cx={x} cy={y} r={3} fill="#6366f1" />
                  {showLabel && (
                    <text x={x} y={PLOT_H + 22} textAnchor="middle" fontSize={9} fill="#94a3b8">
                      {fmtWeek(w.week)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* X axis */}
          <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={W - PAD.right} y2={PAD.top + PLOT_H}
            stroke="#e2e8f0" strokeWidth={1} />
        </svg>

        {/* Week detail table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide">
                <th className="text-left py-1.5 font-semibold">Week</th>
                <th className="text-right py-1.5 font-semibold">Avg</th>
                <th className="text-right py-1.5 font-semibold">Median</th>
                <th className="text-right py-1.5 font-semibold">Tickets</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map(w => (
                <tr key={w.week} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5">{new Date(w.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                  <td className="py-1.5 text-right font-medium text-indigo-600">{fmtHours(w.avg_hours)}</td>
                  <td className="py-1.5 text-right text-purple-600">{fmtHours(w.median_hours)}</td>
                  <td className="py-1.5 text-right">{w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
