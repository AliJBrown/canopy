import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Target, Plus, Search } from 'lucide-react';
import { updateProgram } from '../api/programs';
import { getProjects } from '../api/projects';
import { getProgramGoalLinks, getGoalLinkCandidates, linkProgramGoal, unlinkProgramGoal } from '../api/programGoalLinks';

const GOAL_TYPE_LABEL = {
  objective: 'Objective', key_result: 'Key Result', milestone: 'Milestone', initiative: 'Initiative', task: 'Task',
};

export default function ProgramDetailsModal({ program, canManage, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(program.name);
  const [goalSearch, setGoalSearch] = useState('');

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const { data: linkedGoals = [] } = useQuery({
    queryKey: ['program-goal-links', program.id],
    queryFn: () => getProgramGoalLinks(program.id),
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ['goal-link-candidates', program.id, goalSearch],
    queryFn: () => getGoalLinkCandidates(program.id, goalSearch),
    enabled: goalSearch.trim().length > 0,
  });

  function invalidatePrograms() { qc.invalidateQueries({ queryKey: ['programs'] }); }

  const saveField = useMutation({
    mutationFn: (data) => updateProgram(program.id, data),
    onSuccess: invalidatePrograms,
  });

  const linkGoal = useMutation({
    mutationFn: (goalId) => linkProgramGoal(program.id, goalId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['program-goal-links', program.id] }); setGoalSearch(''); },
  });
  const unlinkGoal = useMutation({
    mutationFn: (goalId) => unlinkProgramGoal(program.id, goalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['program-goal-links', program.id] }),
  });

  const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 bg-white';

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            {canManage ? (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={() => name.trim() && name !== program.name && saveField.mutate({ name: name.trim() })}
                className="text-base font-semibold text-slate-800 w-full outline-none border-b border-transparent focus:border-indigo-300"
              />
            ) : (
              <h2 className="text-base font-semibold text-slate-800">{program.name}</h2>
            )}
            <p className="text-xs text-slate-500">{program.client_name || 'No client'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Linked project <span className="font-normal normal-case text-slate-400">(used in "one project per program" mode)</span>
            </label>
            <select
              value={program.project_id || ''}
              disabled={!canManage}
              onChange={e => saveField.mutate({ project_id: e.target.value || null })}
              className={cls}>
              <option value="">Auto-create when needed</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Linked strategic goals
            </label>
            {linkedGoals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {linkedGoals.map(g => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-full pl-2.5 pr-1.5 py-1">
                    <Target size={11} />
                    {g.title}
                    {canManage && (
                      <button onClick={() => unlinkGoal.mutate(g.id)} className="text-indigo-400 hover:text-indigo-700">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {canManage && (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={goalSearch}
                  onChange={e => setGoalSearch(e.target.value)}
                  placeholder="Search strategic goals to link..."
                  className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 w-full placeholder:text-slate-400"
                />
                {goalSearch.trim() && candidates.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {candidates.map(g => (
                      <button key={g.id} onClick={() => linkGoal.mutate(g.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span className="truncate">{g.title}</span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{GOAL_TYPE_LABEL[g.goal_type]}</span>
                        <Plus size={12} className="text-indigo-500 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
