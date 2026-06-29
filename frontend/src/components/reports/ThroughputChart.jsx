import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getThroughput } from '../../api/reports';

const W = 560, H = 160;
const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function fmtWeek(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ThroughputChart({ projectId }) {
  const { data: weeks = [], isLoading } = useQuery({
    queryKey: ['reports-throughput', projectId],
    queryFn: () => getThroughput(projectId),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-slate-400 text-sm p-8 text-center">Loading throughput...</div>;
  if (!weeks.length) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">
      No completed tickets in the last 12 weeks.
    </div>
  );

  const maxTickets = Math.max(...weeks.map(w => w.tickets_count), 1);
  const maxPts = Math.max(...weeks.map(w => w.points_count), 1);
  const yMax = Math.ceil(maxTickets / 4) * 4 || 4;
  const ticks = 4;
  const tickStep = yMax / ticks;

  const barW = Math.min(28, (PLOT_W / weeks.length) * 0.55);
  const xScale = i => (i / Math.max(weeks.length - 1, 1)) * PLOT_W;
  const yScale = v => PLOT_H - (v / yMax) * PLOT_H;

  const totalTickets = weeks.reduce((s, w) => s + w.tickets_count, 0);
  const totalPts = weeks.reduce((s, w) => s + w.points_count, 0);
  const avgPerWeek = Math.round(totalTickets / weeks.length);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 border-l-4 border-indigo-400">
          <div className="text-2xl font-bold text-slate-800">{totalTickets}</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Total Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 border-l-4 border-purple-400">
          <div className="text-2xl font-bold text-slate-800">{totalPts}</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Total Points</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 border-l-4 border-emerald-400">
          <div className="text-2xl font-bold text-slate-800">{avgPerWeek}</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Avg / Week</div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Weekly Throughput (last 12 weeks)</div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Tickets</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-300 inline-block" /> Points (scaled)</span>
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
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{val}</text>
              </g>
            );
          })}

          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            {weeks.map((w, i) => {
              const cx = xScale(i);
              const tickH = (w.tickets_count / yMax) * PLOT_H;
              const ptsScaled = maxPts > 0 ? (w.points_count / maxPts) * maxTickets : 0;
              const ptsH = (ptsScaled / yMax) * PLOT_H;
              const showLabel = weeks.length <= 8 || i % 2 === 0;

              return (
                <g key={w.week}>
                  {/* Points bar (behind, scaled to same y-axis) */}
                  <rect
                    x={cx - barW / 2 - 2}
                    y={PLOT_H - ptsH}
                    width={barW / 2}
                    height={ptsH}
                    rx={2} fill="#c4b5fd" opacity={0.7}
                  />
                  {/* Tickets bar */}
                  <rect
                    x={cx + 2}
                    y={PLOT_H - tickH}
                    width={barW / 2}
                    height={tickH}
                    rx={2} fill="#6366f1"
                  />
                  {showLabel && (
                    <text x={cx} y={PLOT_H + 22} textAnchor="middle" fontSize={9} fill="#94a3b8">
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
      </div>
    </div>
  );
}
