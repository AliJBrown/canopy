import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, List, Layers, Plus, Settings, CalendarRange, CheckCircle2 } from 'lucide-react';
import { getProjects } from '../api/projects';
import { getTickets, updateTicket } from '../api/tickets';
import { getProjectStatuses } from '../api/projectStatuses';
import { getSprints } from '../api/sprints';
import { useApp } from '../context/AppContext';
import Board from '../components/Board';
import ListView from '../components/ListView';
import BacklogView from '../components/BacklogView';
import FilterBar from '../components/FilterBar';
import FilterBuilder from '../components/FilterBuilder';
import TicketPanel from '../components/TicketPanel';
import CreateTicketModal from '../components/CreateTicketModal';
import ProjectSettings from '../components/ProjectSettings';
import CompleteSprintModal from '../components/CompleteSprintModal';

const EMPTY_FILTERS = {
  search: '',
  status: [],
  type: [],
  priority: [],
  assigneeIds: [],
  sprintId: null,
  labelIds: [],
  dueDateBefore: null,
  dueDateAfter: null,
  hasNoAssignee: false,
  filterConfig: null,
};

const LIST_LIMIT = 50;

function buildQueryParams(projectId, filters, { forBoard = false, offset = 0 } = {}) {
  const params = { projectId };
  if (filters.search) params.search = filters.search;
  if (!forBoard && filters.status?.length) params.status = filters.status.join(',');
  if (filters.type?.length) params.type = filters.type.join(',');
  if (filters.priority?.length) params.priority = filters.priority.join(',');
  if (filters.assigneeIds?.length) params.assigneeId = filters.assigneeIds.join(',');
  if (filters.hasNoAssignee) params.hasNoAssignee = 'true';
  if (filters.sprintId === 'none') params.sprintId = 'none';
  else if (filters.sprintId) params.sprintId = filters.sprintId;
  if (filters.labelIds?.length) params.labelIds = filters.labelIds.join(',');
  if (filters.dueDateBefore) params.dueDateBefore = filters.dueDateBefore;
  if (filters.dueDateAfter) params.dueDateAfter = filters.dueDateAfter;
  if (filters.filterConfig) params.filterConfig = JSON.stringify(filters.filterConfig);
  if (!forBoard) {
    params.limit = LIST_LIMIT;
    params.offset = offset;
  } else {
    params.limit = 500;
  }
  return params;
}

export default function ProjectBoard() {
  const { projectKey, view } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useApp();

  const [selectedTicketId, setSelectedTicketId] = useState(
    () => new URLSearchParams(location.search).get('ticket') || null
  );

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('ticket');
    if (id) setSelectedTicketId(id);
  }, [location.search]);
  const [showCreate, setShowCreate] = useState(false);
  const [createDefaults, setCreateDefaults] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [completeSprint, setCompleteSprint] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [listOffset, setListOffset] = useState(0);
  const [listAccum, setListAccum] = useState([]);

  const currentView = view || 'board';
  const isBoard = currentView === 'board';
  const isList = currentView === 'list';
  const isBacklog = currentView === 'backlog';

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', project?.id],
    queryFn: () => getSprints(project.id),
    enabled: !!project?.id,
  });
  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', project?.id],
    queryFn: () => getProjectStatuses(project.id),
    enabled: !!project?.id,
  });
  const activeSprint = sprints.find(s => s.status === 'active');

  // Board query — all tickets with filters (minus status — columns handle that)
  const boardQueryKey = ['tickets', 'board', project?.id, filters];
  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => getTickets(buildQueryParams(project.id, filters, { forBoard: true })),
    enabled: !!project?.id && isBoard,
  });
  const boardTickets = boardData?.tickets ?? [];

  // List query — paginated with all filters
  const listQueryKey = ['tickets', 'list', project?.id, filters, listOffset];
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => getTickets(buildQueryParams(project.id, filters, { forBoard: false, offset: listOffset })),
    enabled: !!project?.id && isList,
  });
  const listTotal = listData?.total ?? 0;
  const displayTotal = isBoard ? boardData?.total : listTotal;

  // Accumulate list pages
  useEffect(() => {
    if (!listData) return;
    if (listOffset === 0) {
      setListAccum(listData.tickets);
    } else {
      setListAccum(prev => {
        const ids = new Set(prev.map(t => t.id));
        return [...prev, ...listData.tickets.filter(t => !ids.has(t.id))];
      });
    }
  }, [listData]);

  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => updateTicket(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries(boardQueryKey);
      const prev = qc.getQueryData(boardQueryKey);
      qc.setQueryData(boardQueryKey, old =>
        old ? { ...old, tickets: old.tickets.map(t => t.id === id ? { ...t, status } : t) } : old
      );
      return { prev };
    },
    onError: (_, __, ctx) => qc.setQueryData(boardQueryKey, ctx.prev),
    onSuccess: (data, { onWipWarning }) => {
      if (data?.wip_warning && onWipWarning) onWipWarning(data.wip_warning);
    },
    onSettled: () => {
      qc.invalidateQueries(boardQueryKey);
      qc.invalidateQueries(['tickets', 'list', project?.id]);
    },
  });

  const handleTicketClick = useCallback((ticket) => {
    setSelectedTicketId(ticket.id ?? ticket);
  }, []);

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setListOffset(0);
    setListAccum([]);
  };

  const myRole = project?.my_role;
  const canWrite = user?.role === 'admin' || ['owner', 'admin', 'member'].includes(myRole);
  const canManage = user?.role === 'admin' || ['owner', 'admin'].includes(myRole);

  if (!project && projects.length > 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Project "{projectKey}" not found.
      </div>
    );
  }

  const isLoading = isBoard ? boardLoading : listLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => navigate(`/p/${projectKey}/board`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isBoard ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <LayoutGrid size={13} /> Board
          </button>
          <button onClick={() => navigate(`/p/${projectKey}/list`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isList ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <List size={13} /> List
          </button>
          <button onClick={() => navigate(`/p/${projectKey}/backlog`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isBacklog ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Layers size={13} /> Backlog
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <button onClick={() => setShowSettings(true)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Project settings">
              <Settings size={15} />
            </button>
          )}
          {canWrite && (
            <button onClick={() => { setCreateDefaults({}); setShowCreate(true); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} /> Create
            </button>
          )}
        </div>
      </div>

      {/* Project title bar */}
      {project && (
        <div className="flex-shrink-0 px-5 py-2.5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
              {project.key.slice(0, 2)}
            </div>
            <h1 className="text-base font-semibold text-slate-800">{project.name}</h1>
            <span className="text-xs text-slate-400 font-mono">{project.key}</span>
            {myRole && (
              <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 font-medium ml-1 capitalize">
                {myRole}
              </span>
            )}
          </div>
          {/* Filter bar */}
          {(isBoard || isList) && (
            <FilterBar
              projectId={project.id}
              filters={filters}
              setFilters={handleFiltersChange}
              total={displayTotal}
              onOpenBuilder={() => setShowBuilder(true)}
              canWrite={canWrite}
              statuses={projectStatuses}
            />
          )}
        </div>
      )}

      {/* Active sprint banner (board view only) */}
      {isBoard && activeSprint && (
        <div className="flex-shrink-0 bg-emerald-50 border-b border-emerald-200 px-5 py-2 flex items-center gap-3">
          <CalendarRange size={13} className="text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-800">{activeSprint.name}</span>
          {activeSprint.end_date && (
            <span className="text-[11px] text-emerald-600">
              ends {new Date(activeSprint.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {activeSprint.total_points > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <div className="h-1.5 w-20 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(((activeSprint.done_points || 0) / activeSprint.total_points) * 100, 100)}%` }} />
              </div>
              <span className="text-[11px] text-emerald-700 font-medium">
                {activeSprint.done_points ?? 0}/{activeSprint.total_points} pts
              </span>
            </div>
          )}
          {canManage && (
            <button onClick={() => setCompleteSprint(activeSprint)}
              className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-medium bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-lg transition-colors">
              <CheckCircle2 size={11} /> Complete Sprint
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading && !boardTickets.length && !listAccum.length ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading tickets...</div>
        ) : isBacklog ? (
          <BacklogView
            projectId={project?.id}
            canManage={canManage}
            onTicketClick={handleTicketClick}
            onAddClick={() => { setCreateDefaults({}); setShowCreate(true); }}
          />
        ) : isBoard ? (
          <Board
            tickets={boardTickets}
            onTicketClick={handleTicketClick}
            onStatusChange={(id, status, onWipWarning) => changeStatus.mutate({ id, status, onWipWarning })}
            onAddClick={canWrite ? (status) => { setCreateDefaults({ status }); setShowCreate(true); } : () => {}}
            statuses={projectStatuses}
          />
        ) : (
          <div className="flex-1 overflow-auto flex flex-col">
            <ListView
              tickets={listAccum}
              onTicketClick={handleTicketClick}
              onStatusChange={(id, status) => changeStatus.mutate({ id, status })}
              onAddChild={canWrite ? (t) => { setCreateDefaults({ parent_id: t.id }); setShowCreate(true); } : () => {}}
            />
            {listAccum.length < listTotal && (
              <div className="flex justify-center py-4 border-t border-slate-100 bg-white">
                <button
                  onClick={() => setListOffset(o => o + LIST_LIMIT)}
                  disabled={listLoading}
                  className="px-4 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40 transition-colors font-medium"
                >
                  {listLoading ? 'Loading...' : `Load more (${listTotal - listAccum.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTicketId && project && (
        <TicketPanel
          ticketId={selectedTicketId}
          projectId={project.id}
          projectRole={myRole}
          statuses={projectStatuses}
          onClose={() => { setSelectedTicketId(null); setSearchParams({}, { replace: true }); }}
          onTicketChange={(id) => {
            if (id) { setSelectedTicketId(id); setSearchParams({ ticket: id }, { replace: true }); }
            else {
              setSearchParams({}, { replace: true });
              qc.invalidateQueries(boardQueryKey);
              qc.invalidateQueries(['tickets', 'list', project?.id]);
            }
          }}
        />
      )}

      {showCreate && project && canWrite && (
        <CreateTicketModal
          projectId={project.id}
          defaultStatus={createDefaults.status || 'backlog'}
          defaultParentId={createDefaults.parent_id || null}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showSettings && project && (
        <ProjectSettings
          project={project}
          myRole={myRole}
          onClose={() => setShowSettings(false)}
        />
      )}

      {completeSprint && project && (
        <CompleteSprintModal
          sprint={completeSprint}
          otherSprints={sprints}
          projectId={project.id}
          onClose={() => setCompleteSprint(null)}
        />
      )}

      {showBuilder && project && (
        <FilterBuilder
          projectId={project.id}
          filters={filters}
          onApply={handleFiltersChange}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
