import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getProjects } from '../api/projects';
import { getSprints } from '../api/sprints';
import { getTickets } from '../api/tickets';
import TicketPanel from '../components/TicketPanel';
import { getProjectStatuses } from '../api/projectStatuses';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
}

const ZOOM_CONFIGS = {
  week:    { colDays: 1,  labelFmt: (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), windowDays: 28  },
  month:   { colDays: 7,  labelFmt: (d) => `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, windowDays: 90  },
  quarter: { colDays: 14, labelFmt: (d) => `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, windowDays: 180 },
};

function Bar({ left, width, color, label, sublabel, onClick, faded }) {
  if (width <= 0) return null;
  return (
    <div
      onClick={onClick}
      title={label}
      className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 overflow-hidden cursor-pointer transition-opacity ${faded ? 'opacity-30' : 'hover:opacity-90'}`}
      style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, background: color, minWidth: 4 }}
    >
      <span className="text-[11px] text-white font-medium truncate whitespace-nowrap">{label}</span>
      {sublabel && <span className="ml-1.5 text-[9px] text-white/70 truncate whitespace-nowrap hidden sm:block">{sublabel}</span>}
    </div>
  );
}

function TodayMarker({ left }) {
  if (left < 0 || left > 100) return null;
  return (
    <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${left}%` }}>
      <div className="w-px h-full bg-red-400 opacity-60" />
      <div className="absolute -top-5 -translate-x-1/2 text-[9px] text-red-500 font-semibold whitespace-nowrap">Today</div>
    </div>
  );
}

export default function RoadmapPage() {
  const { projectKey } = useParams();
  const [zoom, setZoom] = useState('month');
  const [groupBy, setGroupBy] = useState('sprint');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [windowStart, setWindowStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d;
  });

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', project?.id],
    queryFn: () => getSprints(project.id),
    enabled: !!project?.id,
  });

  const { data: epicData } = useQuery({
    queryKey: ['tickets', 'roadmap-epics', project?.id],
    queryFn: () => getTickets({ projectId: project.id, type: 'epic', limit: 200 }),
    enabled: !!project?.id,
  });

  const { data: dueDateData } = useQuery({
    queryKey: ['tickets', 'roadmap-due', project?.id],
    queryFn: () => getTickets({ projectId: project.id, limit: 500 }),
    enabled: !!project?.id,
  });

  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', project?.id],
    queryFn: () => getProjectStatuses(project.id),
    enabled: !!project?.id,
  });

  const cfg = ZOOM_CONFIGS[zoom];
  const windowEnd = addDays(windowStart, cfg.windowDays);

  // Build column headers
  const columns = useMemo(() => {
    const cols = [];
    let cur = new Date(windowStart);
    while (cur < windowEnd) {
      cols.push(new Date(cur));
      cur = addDays(cur, cfg.colDays);
    }
    return cols;
  }, [windowStart, zoom]);

  const totalDays = cfg.windowDays;

  function pct(date) {
    if (!date) return null;
    const d = startOfDay(new Date(date));
    const offset = daysBetween(windowStart, d);
    return (offset / totalDays) * 100;
  }

  function barProps(start, end) {
    const s = pct(start);
    const e = pct(end);
    if (s === null || e === null) return null;
    return { left: Math.max(0, s), width: Math.max(0, Math.min(e, 100) - Math.max(0, s)) };
  }

  const today = new Date();
  const todayPct = (daysBetween(windowStart, today) / totalDays) * 100;

  const navigate = (dir) => {
    const days = dir * Math.floor(cfg.windowDays / 3);
    setWindowStart(d => addDays(d, days));
  };

  const epics = epicData?.tickets ?? [];
  const allTickets = dueDateData?.tickets ?? [];

  // Rows for sprint grouping
  const rows = useMemo(() => {
    if (groupBy === 'sprint') {
      const sprintRows = sprints
        .filter(s => s.start_date || s.end_date)
        .map(s => ({
          type: 'sprint',
          id: s.id,
          label: s.name,
          sublabel: s.status === 'active' ? 'Active' : s.status,
          start: s.start_date,
          end: s.end_date,
          color: s.status === 'active' ? '#10b981' : s.status === 'completed' ? '#94a3b8' : '#6366f1',
        }));

      const epicRows = epics
        .filter(e => e.due_date)
        .map(e => ({
          type: 'epic',
          id: e.id,
          label: e.title,
          sublabel: `${e.epic_progress?.done ?? 0}/${e.epic_progress?.total ?? 0} done`,
          start: null,
          end: e.due_date,
          color: '#8b5cf6',
        }));

      return [...sprintRows, ...epicRows];
    }

    // Group by epic
    return epics.map(e => ({
      type: 'epic',
      id: e.id,
      label: e.title,
      sublabel: `${e.epic_progress?.done ?? 0}/${e.epic_progress?.total ?? 0} done`,
      start: null,
      end: e.due_date,
      color: '#8b5cf6',
    }));
  }, [sprints, epics, groupBy]);

  if (!project) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Project not found</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 px-5 py-3 flex items-center gap-4">
        <h2 className="font-semibold text-slate-800">Roadmap</h2>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {['week', 'month', 'quarter'].map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                zoom === z ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {z}
            </button>
          ))}
        </div>

        {/* Group by */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {[['sprint', 'Sprint'], ['epic', 'Epic']].map(([val, label]) => (
            <button key={val} onClick={() => setGroupBy(val)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === val ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => navigate(-1)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setWindowStart(() => {
            const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d;
          })}
            className="text-xs text-indigo-600 hover:text-indigo-500 font-medium px-2 py-1 rounded hover:bg-indigo-50">
            Today
          </button>
          <button onClick={() => navigate(1)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Column headers */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 flex" style={{ paddingLeft: 200 }}>
            {columns.map((col, i) => (
              <div key={i}
                className="flex-1 text-[10px] text-slate-400 font-medium border-r border-slate-100 px-1 py-2 truncate min-w-0">
                {cfg.labelFmt(col)}
              </div>
            ))}
          </div>

          {/* Row area */}
          <div className="relative">
            {/* Today marker (positioned relative to the timeline area) */}
            <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: 200, right: 0 }}>
              <div className="relative w-full h-full">
                <TodayMarker left={todayPct} />
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                No sprints or epics with dates to display. Add start/end dates to sprints or due dates to epics.
              </div>
            ) : (
              rows.map((row) => {
                const bp = row.start && row.end
                  ? barProps(row.start, row.end)
                  : row.end
                    ? { left: Math.max(0, pct(row.end) - 2), width: 2 }
                    : null;

                return (
                  <div key={`${row.type}-${row.id}`}
                    className="flex items-center border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                    style={{ height: 44 }}>
                    {/* Row label */}
                    <div className="flex-shrink-0 px-3 text-xs font-medium text-slate-700 truncate border-r border-slate-100"
                      style={{ width: 200 }}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                        <span className="truncate">{row.label}</span>
                      </div>
                      {row.sublabel && (
                        <div className="text-[10px] text-slate-400 ml-3.5 mt-0.5">{row.sublabel}</div>
                      )}
                    </div>

                    {/* Timeline bar area */}
                    <div className="relative flex-1 h-full">
                      {bp && (
                        <Bar
                          left={bp.left}
                          width={bp.width}
                          color={row.color}
                          label={row.label}
                          sublabel={row.sublabel}
                          onClick={() => row.type === 'epic' && setSelectedTicketId(row.id)}
                          faded={false}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Due-date markers for tickets with due dates */}
            {allTickets.filter(t => t.due_date && t.type !== 'epic').length > 0 && (
              <div className="border-t border-slate-100 mt-2">
                <div className="flex-shrink-0 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider py-2" style={{ marginLeft: 200 }}>
                </div>
                {allTickets
                  .filter(t => t.due_date && t.type !== 'epic')
                  .slice(0, 50)
                  .map(t => {
                    const x = pct(t.due_date);
                    if (x === null || x < 0 || x > 100) return null;
                    return (
                      <div key={t.id}
                        className="flex items-center border-b border-slate-50 hover:bg-slate-50/60"
                        style={{ height: 36 }}>
                        <div className="flex-shrink-0 px-3 text-xs text-slate-600 truncate border-r border-slate-100"
                          style={{ width: 200 }}>
                          <span className="text-[10px] font-mono text-slate-400 mr-1">{t.ticket_key}</span>
                          {t.title}
                        </div>
                        <div className="relative flex-1 h-full">
                          <div
                            onClick={() => setSelectedTicketId(t.id)}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-2 border-indigo-400 bg-white cursor-pointer hover:bg-indigo-100 transition-colors"
                            style={{ left: `${x}%` }}
                            title={`${t.ticket_key}: ${t.title} — due ${new Date(t.due_date).toLocaleDateString()}`}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTicketId && project && (
        <TicketPanel
          ticketId={selectedTicketId}
          projectId={project.id}
          projectRole={project.my_role}
          statuses={projectStatuses}
          onClose={() => setSelectedTicketId(null)}
          onTicketChange={(id) => {
            if (id) setSelectedTicketId(id);
            else setSelectedTicketId(null);
          }}
        />
      )}
    </div>
  );
}
