import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOverview } from '../../api/reports';

const STATUS_COLORS = {
  todo: '#94a3b8',
  in_progress: '#6366f1',
  in_review: '#f59e0b',
  blocked: '#ef4444',
  done: '#10b981',
};
const STATUS_LABELS = {
  todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review',
  blocked: 'Blocked', done: 'Done',
};
const TYPE_COLORS = {
  task: '#6366f1', bug: '#ef4444', story: '#10b981', epic: '#8b5cf6', feature: '#f59e0b',
};
const PRIORITY_META = [
  { key: 'critical', label: 'Critical', color: '#ef4444', bg: 'bg-red-100',    text: 'text-red-700'    },
  { key: 'high',     label: 'High',     color: '#f97316', bg: 'bg-orange-100', text: 'text-orange-700' },
  { key: 'medium',   label: 'Medium',   color: '#eab308', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { key: 'low',      label: 'Low',      color: '#22c55e', bg: 'bg-green-100',  text: 'text-green-700'  },
];

function StatCard({ label, value, sub, accent, onClick, filter }) {
  return (
    <div
      onClick={() => onClick && filter && onClick(filter)}
      className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1 border-l-4 ${accent} ${onClick && filter ? 'cursor-pointer hover:shadow-md hover:border-opacity-100 transition-shadow' : ''}`}
    >
      <div className="text-2xl font-bold text-slate-800">{value ?? '—'}</div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function DonutChart({ data, colorMap, labelMap, filterField, onDrilldown, activeKey }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <div className="w-32 h-32 flex items-center justify-center text-slate-400 text-xs">No data</div>;

  const R = 44, C = 2 * Math.PI * R;
  let cum = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-28 h-28 flex-shrink-0">
        <g transform="rotate(-90 60 60)">
          {data.map(d => {
            const key = d[filterField] || d.type;
            const portion = (d.count / total) * C;
            const dashOffset = C - cum;
            cum += portion;
            const isActive = activeKey === key;
            return (
              <circle
                key={key}
                cx={60} cy={60} r={isActive ? R + 3 : R}
                fill="none"
                stroke={colorMap[key] || '#6366f1'}
                strokeWidth={isActive ? 22 : 18}
                strokeDasharray={`${portion} ${C}`}
                strokeDashoffset={dashOffset}
                opacity={activeKey && !isActive ? 0.35 : 1}
                className={onDrilldown ? 'cursor-pointer transition-all' : ''}
                onClick={() => onDrilldown && onDrilldown({
                  label: `${labelMap?.[key] || key} tickets`,
                  filters: { [filterField]: key },
                })}
                style={{ transition: 'r 0.15s, stroke-width 0.15s, opacity 0.15s' }}
              />
            );
          })}
        </g>
        <text x={60} y={55} textAnchor="middle" fontSize={18} fontWeight="bold" fill="#1e293b">{total}</text>
        <text x={60} y={70} textAnchor="middle" fontSize={9} fill="#94a3b8">tickets</text>
      </svg>
      <div className="space-y-1.5">
        {data.map(d => {
          const key = d[filterField] || d.type;
          const isActive = activeKey === key;
          return (
            <div
              key={key}
              onClick={() => onDrilldown && onDrilldown({
                label: `${labelMap?.[key] || key} tickets`,
                filters: { [filterField]: key },
              })}
              className={`flex items-center gap-2 text-xs rounded-md px-1.5 py-0.5 transition-colors ${
                onDrilldown ? 'cursor-pointer hover:bg-slate-100' : ''
              } ${isActive ? 'bg-slate-100 font-semibold' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorMap[key] || '#6366f1' }} />
              <span className="text-slate-600">{labelMap?.[key] || key}</span>
              <span className="ml-auto font-semibold text-slate-700">{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HBarChart({ data, colorMap, labelKey, filterField, onDrilldown, activeKey }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const BAR_H = 18, GAP = 8, PAD_L = 58;
  const W = 260, rows = data.length;
  const H = rows * (BAR_H + GAP) - GAP;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280 }}>
      {data.map((d, i) => {
        const key = d[labelKey];
        const barW = Math.max((d.count / max) * (W - PAD_L - 32), d.count ? 4 : 0);
        const y = i * (BAR_H + GAP);
        const isActive = activeKey === key;
        return (
          <g
            key={key}
            onClick={() => onDrilldown && d.count > 0 && onDrilldown({
              label: `${key} tickets`,
              filters: { [filterField]: key },
            })}
            className={onDrilldown && d.count > 0 ? 'cursor-pointer' : ''}
            opacity={activeKey && !isActive ? 0.4 : 1}
            style={{ transition: 'opacity 0.15s' }}
          >
            <rect x={0} y={y} width={W} height={BAR_H} fill={isActive ? '#f1f5f9' : 'transparent'} rx={3} />
            <text x={PAD_L - 6} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize={10} fill="#64748b" className="capitalize">
              {key}
            </text>
            <rect x={PAD_L} y={y + 2} width={barW} height={BAR_H - 4} rx={3}
              fill={colorMap[key] || '#6366f1'}
              opacity={isActive ? 1 : 0.8}
            />
            <text x={PAD_L + barW + 5} y={y + BAR_H / 2 + 4} fontSize={10} fill="#64748b">
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function OverviewCards({ projectId, sprintMetric = 'points', onDrilldown }) {
  const [activeSegment, setActiveSegment] = useState(null); // { field, key }

  const { data, isLoading } = useQuery({
    queryKey: ['reports-overview', projectId],
    queryFn: () => getOverview(projectId),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-slate-400 text-sm p-8 text-center">Loading overview...</div>;
  if (!data) return null;

  const { status = [], type = [], priority = [], health = {} } = data;
  const priorityMap = Object.fromEntries(priority.map(p => [p.priority, p.count]));

  function handleDrilldown(drilldown) {
    const field = Object.keys(drilldown.filters)[0];
    const key = drilldown.filters[field];
    setActiveSegment(prev => prev?.key === key ? null : { field, key });
    onDrilldown?.(drilldown);
  }

  const activeKey = activeSegment?.key || null;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Open" value={health.open_tickets} accent="border-indigo-400"
          onClick={handleDrilldown}
          filter={{ label: 'Open tickets', filters: { statuses: ['backlog','todo','in_progress','in_review','blocked'] } }} />
        <StatCard label="In Progress" value={health.in_progress} accent="border-amber-400"
          onClick={handleDrilldown}
          filter={{ label: 'In progress tickets', filters: { status: 'in_progress' } }} />
        <StatCard label="Overdue" value={health.overdue} accent="border-red-400"
          onClick={handleDrilldown}
          filter={{ label: 'Overdue tickets', filters: { overdue: true } }} />
        <StatCard
          label="Unestimated"
          value={sprintMetric === 'hours' ? health.unestimated_hours : health.unestimated}
          sub={sprintMetric === 'hours' ? 'open, no hours' : 'open, no points'}
          accent="border-slate-300"
          onClick={handleDrilldown}
          filter={{
            label: 'Unestimated tickets',
            filters: sprintMetric === 'hours'
              ? { hasNoHours: true, statuses: ['backlog','todo','in_progress','in_review','blocked'] }
              : { hasNoPoints: true, statuses: ['backlog','todo','in_progress','in_review','blocked'] },
          }}
        />
        <StatCard label="Unassigned" value={health.unassigned} sub="open only" accent="border-slate-300"
          onClick={handleDrilldown}
          filter={{ label: 'Unassigned open tickets', filters: { hasNoAssignee: true, statuses: ['backlog','todo','in_progress','in_review','blocked'] } }} />
        <StatCard label="Backlog" value={health.backlog_count} sub="no sprint" accent="border-slate-300" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status donut */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status Distribution</div>
          <p className="text-[10px] text-slate-400 mb-3">Click a segment to see tickets</p>
          <DonutChart
            data={status}
            colorMap={STATUS_COLORS}
            labelMap={STATUS_LABELS}
            filterField="status"
            onDrilldown={handleDrilldown}
            activeKey={activeSegment?.field === 'status' ? activeKey : null}
          />
        </div>

        {/* Type distribution */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">By Type</div>
          <p className="text-[10px] text-slate-400 mb-3">Click a bar to see tickets</p>
          {type.length ? (
            <HBarChart
              data={type}
              colorMap={TYPE_COLORS}
              labelKey="type"
              filterField="type"
              onDrilldown={handleDrilldown}
              activeKey={activeSegment?.field === 'type' ? activeKey : null}
            />
          ) : (
            <div className="text-slate-400 text-xs py-6 text-center">No data</div>
          )}
        </div>

        {/* Priority heat */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Open by Priority</div>
          <p className="text-[10px] text-slate-400 mb-3">Click a bar to see tickets</p>
          <div className="space-y-2 mt-2">
            {PRIORITY_META.map(({ key, label, color, bg, text }) => {
              const count = priorityMap[key] ?? 0;
              const isActive = activeSegment?.field === 'priority' && activeSegment?.key === key;
              return (
                <div
                  key={key}
                  onClick={() => count > 0 && handleDrilldown({ label: `${label} priority tickets`, filters: { priority: key } })}
                  className={`flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors ${count > 0 ? 'cursor-pointer hover:bg-slate-50' : ''} ${isActive ? 'bg-slate-100' : ''}`}
                >
                  <span className={`text-xs font-semibold w-16 ${text}`}>{label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bg} flex items-center justify-end pr-2 transition-all`}
                      style={{ width: `${Math.min(100, (count / (health.open_tickets || 1)) * 100)}%`, minWidth: count ? '2rem' : 0 }}
                    >
                      {count > 0 && <span className={`text-[10px] font-bold ${text}`}>{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-slate-400 text-xs w-4">0</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
