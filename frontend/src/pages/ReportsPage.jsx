import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Zap, Clock, Users, X, ExternalLink } from 'lucide-react';
import { getProjects } from '../api/projects';
import { getTickets } from '../api/tickets';
import { getSprints } from '../api/sprints';
import OverviewCards from '../components/reports/OverviewCards';
import VelocityChart from '../components/reports/VelocityChart';
import CycleTimeChart from '../components/reports/CycleTimeChart';
import WorkloadTable from '../components/reports/WorkloadTable';
import ThroughputChart from '../components/reports/ThroughputChart';
import TicketPanel from '../components/TicketPanel';
import { StatusBadge, TypeBadge, PriorityBadge, Avatar } from '../components/Badge';

const TABS = [
  { key: 'overview',   label: 'Overview',              icon: LayoutDashboard },
  { key: 'velocity',   label: 'Velocity',              icon: Zap },
  { key: 'cycle-time', label: 'Cycle Time',            icon: Clock },
  { key: 'workload',   label: 'Workload & Throughput', icon: Users },
];

// Normalize chart filter shapes → backend query params
function normalizeFilters(filters) {
  const out = { ...filters };
  // statuses array → comma-sep status string
  if (out.statuses) {
    out.status = out.statuses.join(',');
    delete out.statuses;
  }
  // overdue: true → due_date < now, exclude done
  if (out.overdue) {
    out.dueDateBefore = new Date().toISOString();
    if (!out.status) out.status = 'backlog,todo,in_progress,in_review,blocked';
    delete out.overdue;
  }
  return out;
}

// Slide-over panel showing tickets that match a chart drilldown filter
function DrilldownPanel({ projectId, projectRole, drilldown, onClose, onTicketOpen }) {
  const rawFilters = drilldown?.filters || {};
  const filters = normalizeFilters(rawFilters);

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-tickets', projectId, filters],
    queryFn: () => getTickets({ projectId, ...filters, limit: 100, offset: 0 }),
    enabled: !!projectId && !!drilldown,
  });

  const tickets = data?.tickets || data || [];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-slate-800">{drilldown?.label}</h3>
            {!isLoading && (
              <p className="text-xs text-slate-400 mt-0.5">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No tickets match this filter</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {tickets.map(t => (
                <button
                  key={t.id}
                  onClick={() => onTicketOpen(t.id)}
                  className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 text-left transition-colors group"
                >
                  <TypeBadge type={t.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] text-slate-400 font-mono">{t.ticket_key || `#${t.number}`}</span>
                    </div>
                    <div className="text-sm text-slate-800 font-medium truncate group-hover:text-indigo-700 transition-colors">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.assignee && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Avatar user={t.assignee} size="xs" />
                          {t.assignee.name}
                        </span>
                      )}
                      {t.story_points > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono">{t.story_points}pt</span>
                      )}
                    </div>
                  </div>
                  <ExternalLink size={12} className="text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { projectKey } = useParams();
  const [tab, setTab] = useState('overview');
  const [drilldown, setDrilldown] = useState(null);   // { label, filters }
  const [openTicketId, setOpenTicketId] = useState(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', project?.id],
    queryFn: () => getSprints(project.id),
    enabled: !!project?.id,
  });
  const activeSprint = sprints.find(s => s.status === 'active');
  const sprintMetric = activeSprint?.metric || 'points';

  function handleDrilldown(d) {
    // Clicking the same filter again toggles it off
    if (drilldown?.label === d.label && JSON.stringify(drilldown?.filters) === JSON.stringify(d.filters)) {
      setDrilldown(null);
    } else {
      setDrilldown(d);
      setOpenTicketId(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-lg font-bold text-slate-800">Reports</h1>
          {project && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
              {project.name}
            </span>
          )}
          {drilldown && (
            <button
              onClick={() => setDrilldown(null)}
              className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium hover:bg-indigo-100 transition-colors ml-auto">
              <X size={11} /> Clear drill-down
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setDrilldown(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === key
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!project ? (
          <div className="text-slate-400 text-sm text-center py-16">Loading project...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewCards projectId={project.id} sprintMetric={sprintMetric} onDrilldown={handleDrilldown} />
            )}
            {tab === 'velocity' && (
              <VelocityChart projectId={project.id} onDrilldown={handleDrilldown} />
            )}
            {tab === 'cycle-time' && (
              <CycleTimeChart projectId={project.id} />
            )}
            {tab === 'workload' && (
              <div className="space-y-6">
                <WorkloadTable projectId={project.id} onDrilldown={handleDrilldown} />
                <ThroughputChart projectId={project.id} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Drilldown slide-over */}
      {drilldown && project && (
        <DrilldownPanel
          projectId={project.id}
          projectRole={project.my_role}
          drilldown={drilldown}
          onClose={() => setDrilldown(null)}
          onTicketOpen={(id) => { setOpenTicketId(id); }}
        />
      )}

      {/* Full ticket panel — opens on top of drilldown */}
      {openTicketId && project && (
        <TicketPanel
          ticketId={openTicketId}
          projectId={project.id}
          projectRole={project.my_role}
          onClose={() => setOpenTicketId(null)}
        />
      )}
    </div>
  );
}
