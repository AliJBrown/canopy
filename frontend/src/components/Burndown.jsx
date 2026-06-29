import React, { useMemo } from 'react';

const W = 480;
const H = 130;
const PAD = { top: 10, right: 16, bottom: 28, left: 36 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function fmt(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Burndown({ data, unit = 'pts' }) {
  const points = useMemo(() => {
    if (!data || data.length === 0) return null;

    const maxVal = Math.max(...data.map(d => Math.max(d.remaining, d.ideal)), 1);
    const n = data.length;

    const toX = (i) => PAD.left + (i / Math.max(n - 1, 1)) * INNER_W;
    const toY = (v) => PAD.top + INNER_H - (v / maxVal) * INNER_H;

    const idealPts = data.map((d, i) => `${toX(i)},${toY(d.ideal)}`).join(' ');
    const actualPts = data.map((d, i) => `${toX(i)},${toY(d.remaining)}`).join(' ');

    // X-axis labels: show first, last, and every ~4th
    const labelIdxs = new Set([0, n - 1]);
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 5))) labelIdxs.add(i);

    // Y-axis: 3 ticks
    const yTicks = [0, Math.round(maxVal / 2), maxVal];

    return { idealPts, actualPts, maxVal, n, toX, toY, labelIdxs: [...labelIdxs].sort((a,b) => a-b), yTicks };
  }, [data]);

  if (!points) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-slate-400 italic">
        No burndown data yet — add {unit === 'hrs' ? 'hour estimates' : 'story points'} to tickets
      </div>
    );
  }

  const { idealPts, actualPts, toX, toY, labelIdxs, yTicks, maxVal } = points;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {/* Y-axis ticks + gridlines */}
      {yTicks.map(v => (
        <g key={v}>
          <line
            x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke="#e2e8f0" strokeWidth="1"
          />
          <text x={PAD.left - 4} y={toY(v) + 3} textAnchor="end"
            className="text-[9px]" fontSize="9" fill="#94a3b8">{v}{unit === 'hrs' ? 'h' : ''}</text>
        </g>
      ))}

      {/* Ideal line */}
      <polyline points={idealPts} fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" />

      {/* Actual line */}
      <polyline points={actualPts} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />

      {/* X-axis labels */}
      {labelIdxs.map(i => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
          fontSize="9" fill="#94a3b8">{fmt(data[i].date)}</text>
      ))}

      {/* Legend */}
      <g transform={`translate(${W - PAD.right - 90}, ${PAD.top})`}>
        <line x1="0" y1="5" x2="12" y2="5" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="15" y="8" fontSize="8" fill="#94a3b8">Ideal</text>
        <line x1="0" y1="17" x2="12" y2="17" stroke="#6366f1" strokeWidth="2" />
        <text x="15" y="20" fontSize="8" fill="#6366f1">Actual</text>
      </g>
    </svg>
  );
}
