import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Users, Shield, Lock, Type, Hash, ListChecks, Calendar, Link, Workflow, GripVertical, Pencil, Check, AlertTriangle } from 'lucide-react';
import {
  getProjectMembers, addProjectMember, updateProjectMember, removeProjectMember,
  getProjectTeams, addProjectTeam, updateProjectTeam, removeProjectTeam,
  getTeams,
} from '../api/admin';
import { getFields, createField, updateField, deleteField } from '../api/fields';
import { getProjectStatuses, createProjectStatus, updateProjectStatus, deleteProjectStatus, reorderProjectStatuses } from '../api/projectStatuses';
import { getProjectRolePermissions, setRolePermissions, resetRolePermissions, deleteProject } from '../api/projects';
import { getUsers } from '../api/users';
import { Avatar } from './Badge';
import { useApp } from '../context/AppContext';
import { useProjectPermissions } from '../hooks/useProjectPermissions';

const FIELD_TYPE_META = {
  text:   { icon: Type,       label: 'Text' },
  number: { icon: Hash,       label: 'Number' },
  select: { icon: ListChecks, label: 'Select' },
  date:   { icon: Calendar,   label: 'Date' },
  url:    { icon: Link,       label: 'URL' },
};

function FieldsTab({ projectId, canManage }) {
  const qc = useQueryClient();
  const [newField, setNewField] = useState({ name: '', field_type: 'text', options: [], is_required: false });
  const [optionInput, setOptionInput] = useState('');

  const { data: fields = [] } = useQuery({
    queryKey: ['fields', projectId],
    queryFn: () => getFields(projectId),
  });

  const addMut = useMutation({
    mutationFn: () => createField(projectId, { ...newField, options: newField.options }),
    onSuccess: () => {
      qc.invalidateQueries(['fields', projectId]);
      setNewField({ name: '', field_type: 'text', options: [], is_required: false });
      setOptionInput('');
    },
  });
  const delMut = useMutation({
    mutationFn: (id) => deleteField(projectId, id),
    onSuccess: () => qc.invalidateQueries(['fields', projectId]),
  });

  const addOption = () => {
    const v = optionInput.trim();
    if (v && !newField.options.includes(v)) {
      setNewField(f => ({ ...f, options: [...f.options, v] }));
      setOptionInput('');
    }
  };

  return (
    <div className="space-y-3">
      {fields.map(f => {
        const meta = FIELD_TYPE_META[f.field_type] || FIELD_TYPE_META.text;
        const Icon = meta.icon;
        return (
          <div key={f.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 group">
            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon size={13} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{f.name}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{meta.label}</span>
                {f.is_required && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-medium">Required</span>}
              </div>
              {f.field_type === 'select' && f.options?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {f.options.map(o => (
                    <span key={o} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{o}</span>
                  ))}
                </div>
              )}
            </div>
            {canManage && (
              <button onClick={() => delMut.mutate(f.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded transition-colors">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}

      {canManage && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Field</div>
          <input value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))}
            placeholder="Field name" required
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
          <div className="flex items-center gap-2">
            <select value={newField.field_type} onChange={e => setNewField(f => ({ ...f, field_type: e.target.value, options: [] }))}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
              {Object.entries(FIELD_TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={newField.is_required} onChange={e => setNewField(f => ({ ...f, is_required: e.target.checked }))}
                className="accent-indigo-600 rounded" />
              Required
            </label>
          </div>
          {newField.field_type === 'select' && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input value={optionInput} onChange={e => setOptionInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  placeholder="Option value (press Enter)"
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
                <button onClick={addOption} className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {newField.options.map(o => (
                  <span key={o} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                    {o}
                    <button onClick={() => setNewField(f => ({ ...f, options: f.options.filter(x => x !== o) }))}
                      className="text-indigo-400 hover:text-indigo-600 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => newField.name.trim() && addMut.mutate()} disabled={!newField.name.trim() || addMut.isPending}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white rounded-lg px-3 py-2 hover:bg-indigo-500 disabled:opacity-40 transition-colors">
            <Plus size={13} /> Add field
          </button>
        </div>
      )}
    </div>
  );
}

const CATEGORY_META = {
  todo:        { label: 'To Do',       color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  done:        { label: 'Done',        color: 'bg-green-100 text-green-700' },
};

const PRESET_COLORS = ['#94a3b8','#60a5fa','#34d399','#f59e0b','#8b5cf6','#ef4444','#ec4899','#f97316','#10b981','#06b6d4'];

function WorkflowTab({ projectId, canManage }) {
  const qc = useQueryClient();
  const [editId, setEditId]     = useState(null);
  const [editData, setEditData] = useState({});
  const [newStatus, setNewStatus] = useState({ name: '', color: '#6366f1', category: 'in_progress' });
  const [showNew, setShowNew]   = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const { data: statuses = [] } = useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => getProjectStatuses(projectId),
  });

  const createMut = useMutation({
    mutationFn: () => createProjectStatus(projectId, newStatus),
    onSuccess: () => { qc.invalidateQueries(['project-statuses', projectId]); setShowNew(false); setNewStatus({ name: '', color: '#6366f1', category: 'in_progress' }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateProjectStatus(projectId, id, data),
    onSuccess: () => { qc.invalidateQueries(['project-statuses', projectId]); setEditId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteProjectStatus(projectId, id),
    onSuccess: () => qc.invalidateQueries(['project-statuses', projectId]),
    onError: (e) => alert(e.error || 'Cannot delete this status'),
  });

  const reorderMut = useMutation({
    mutationFn: (order) => reorderProjectStatuses(projectId, order),
    onSuccess: () => qc.invalidateQueries(['project-statuses', projectId]),
  });

  const handleDrop = (targetId) => {
    if (!dragging || dragging === targetId) return;
    const ids = statuses.map(s => s.id);
    const from = ids.indexOf(dragging);
    const to   = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    reorderMut.mutate(next);
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Define the statuses available in this project's workflow. Drag to reorder — order determines board column order.
      </p>

      {/* Status list */}
      <div className="space-y-1">
        {statuses.map(s => (
          <div
            key={s.id}
            draggable={canManage}
            onDragStart={() => setDragging(s.id)}
            onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(s.id)}
            onDragEnd={() => { setDragging(null); setDragOver(null); }}
            className={`rounded-lg border p-2.5 transition-colors ${
              dragOver === s.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'
            } ${dragging === s.id ? 'opacity-40' : ''}`}
          >
            {editId === s.id ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={editData.name ?? s.name}
                  onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-32"
                />
                <div className="flex gap-1">
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button"
                      onClick={() => setEditData(d => ({ ...d, color: c }))}
                      className={`w-4 h-4 rounded-full border-2 transition-transform ${(editData.color ?? s.color) === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
                <select
                  value={editData.category ?? s.category}
                  onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="flex gap-1 ml-auto">
                  <button onClick={() => updateMut.mutate({ id: s.id, data: editData })} disabled={updateMut.isPending}
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setEditId(null); setEditData({}); }}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {canManage && (
                  <GripVertical size={14} className="text-slate-300 cursor-grab flex-shrink-0" />
                )}
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-sm font-medium text-slate-800 flex-1">{s.name}</span>
                <span className="text-[10px] font-mono text-slate-400">{s.slug}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_META[s.category]?.color}`}>
                  {CATEGORY_META[s.category]?.label}
                </span>
                {s.is_default && (
                  <span className="text-[10px] text-slate-400 italic">default</span>
                )}
                {canManage && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 ml-1">
                    <button onClick={() => { setEditId(s.id); setEditData({}); }}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id); }}
                      className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new status */}
      {canManage && (
        showNew ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">New status</p>
            <input
              value={newStatus.name}
              onChange={e => setNewStatus(s => ({ ...s, name: e.target.value }))}
              placeholder="Status name *"
              autoFocus
              className="w-full text-sm border border-slate-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Color:</span>
              <div className="flex gap-1">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => setNewStatus(s => ({ ...s, color: c }))}
                    className={`w-4 h-4 rounded-full border-2 transition-transform ${newStatus.color === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Category:</span>
              <select
                value={newStatus.category}
                onChange={e => setNewStatus(s => ({ ...s, category: e.target.value }))}
                className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
              >
                {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="text-xs text-slate-500 px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!newStatus.name.trim() || createMut.isPending}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-40">
                {createMut.isPending ? 'Adding...' : 'Add status'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            <Plus size={14} /> Add status
          </button>
        )
      )}
    </div>
  );
}

const PROJECT_PERMISSION_DEFS = [
  { key: 'tickets.view',     label: 'View tickets',                category: 'Tickets' },
  { key: 'tickets.write',    label: 'Create & edit tickets',       category: 'Tickets' },
  { key: 'tickets.delete',   label: 'Delete tickets',              category: 'Tickets' },
  { key: 'goals.view',       label: 'View goals',                  category: 'Goals' },
  { key: 'goals.write',      label: 'Create & edit goals',         category: 'Goals' },
  { key: 'goals.delete',     label: 'Delete goals',                category: 'Goals' },
  { key: 'goals.lock',       label: 'Lock / unlock goals',         category: 'Goals' },
  { key: 'sprints.view',     label: 'View sprints',                category: 'Sprints' },
  { key: 'sprints.manage',   label: 'Manage sprints',              category: 'Sprints' },
  { key: 'members.view',     label: 'View members',                category: 'Members' },
  { key: 'members.manage',   label: 'Manage members & roles',      category: 'Members' },
  { key: 'time.view',        label: 'View time logs',              category: 'Time' },
  { key: 'time.log',         label: 'Log time on tickets',         category: 'Time' },
  { key: 'reports.view',     label: 'View reports',                category: 'Reports' },
  { key: 'labels.manage',    label: 'Manage labels',               category: 'Project Settings' },
  { key: 'fields.manage',    label: 'Manage custom fields',        category: 'Project Settings' },
  { key: 'statuses.manage',  label: 'Manage statuses & workflows', category: 'Project Settings' },
  { key: 'project.settings', label: 'Edit project settings',       category: 'Project Settings' },
  { key: 'project.delete',   label: 'Delete project',              category: 'Project Settings' },
];

const PERM_ROLES = ['viewer', 'member', 'admin', 'owner'];

function PermissionsTab({ project, canManageProject, projectRole, isSysAdmin }) {
  const qc = useQueryClient();

  const { data: rolePerms, isLoading } = useQuery({
    queryKey: ['project-role-permissions', project.id],
    queryFn: () => getProjectRolePermissions(project.id),
    enabled: !!project?.id,
  });

  const toggleMut = useMutation({
    mutationFn: ({ role, permissions }) => setRolePermissions(project.id, role, permissions),
    onSuccess: () => qc.invalidateQueries(['project-role-permissions', project.id]),
  });

  const resetMut = useMutation({
    mutationFn: () => resetRolePermissions(project.id),
    onSuccess: () => qc.invalidateQueries(['project-role-permissions', project.id]),
  });

  const canEditColumn = (role) => {
    if (!canManageProject) return false;
    if (role === 'owner') return projectRole === 'owner' || isSysAdmin;
    return true;
  };

  const handleToggle = (role, permKey) => {
    if (!rolePerms) return;
    const current = rolePerms[role] ?? [];
    const next = current.includes(permKey)
      ? current.filter(p => p !== permKey)
      : [...current, permKey];
    toggleMut.mutate({ role, permissions: next });
  };

  const categories = [...new Set(PROJECT_PERMISSION_DEFS.map(p => p.category))];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500">
          Configure what each project role can do. Changes take effect immediately.
        </p>
        {canManageProject && (
          <button
            onClick={() => { if (confirm('Reset all role permissions to defaults?')) resetMut.mutate(); }}
            disabled={resetMut.isPending}
            className="flex-shrink-0 text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            {resetMut.isPending ? 'Resetting...' : 'Reset to defaults'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-slate-400 py-4 text-center">Loading permissions...</div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-full">Permission</th>
                {PERM_ROLES.map(role => (
                  <th key={role} className="px-3 py-2 font-semibold text-slate-600 text-center capitalize whitespace-nowrap">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(category => {
                const perms = PROJECT_PERMISSION_DEFS.filter(p => p.category === category);
                return (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-50 border-t border-slate-100">
                      <td colSpan={5} className="px-3 py-1.5 font-semibold text-slate-500 text-[10px] uppercase tracking-wide">
                        {category}
                      </td>
                    </tr>
                    {perms.map((perm, i) => (
                      <tr
                        key={perm.key}
                        className={`border-t border-slate-100 hover:bg-slate-50/60 ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}
                      >
                        <td className="px-3 py-2 text-slate-700">{perm.label}</td>
                        {PERM_ROLES.map(role => {
                          const checked = !!(rolePerms?.[role] ?? []).includes(perm.key);
                          const editable = canEditColumn(role);
                          return (
                            <td key={role} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!editable || toggleMut.isPending}
                                onChange={() => handleToggle(role, perm.key)}
                                className={`w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                  !editable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ROLE_OPTIONS = ['viewer', 'member', 'admin', 'owner'];
const ROLE_COLORS = {
  owner:  'bg-yellow-100 text-yellow-800',
  admin:  'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
};

export default function ProjectSettings({ project, myRole, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useApp();
  const [tab, setTab] = useState('members');
  const [addUserId, setAddUserId] = useState('');
  const [addUserRole, setAddUserRole] = useState('member');
  const [addTeamId, setAddTeamId] = useState('');
  const [addTeamRole, setAddTeamRole] = useState('member');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { canManageProject, projectRole, isSysAdmin } = useProjectPermissions(project);
  const canManage = ['owner', 'admin'].includes(myRole) || currentUser?.role === 'admin';
  const canDelete = myRole === 'owner' || isSysAdmin;

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => {
      qc.invalidateQueries(['projects']);
      onClose();
      navigate('/projects');
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', project.id],
    queryFn: () => getProjectMembers(project.id),
  });
  const { data: projectTeams = [] } = useQuery({
    queryKey: ['projectTeams', project.id],
    queryFn: () => getProjectTeams(project.id),
  });
  const { data: allUsers = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  const { data: allTeams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });

  const memberIds = new Set(members.map(m => m.id));
  const teamIds = new Set(projectTeams.map(t => t.id));
  const availableUsers = allUsers.filter(u => !memberIds.has(u.id));
  const availableTeams = allTeams.filter(t => !teamIds.has(t.id));

  const addMember = useMutation({
    mutationFn: () => addProjectMember(project.id, { user_id: addUserId, role: addUserRole }),
    onSuccess: () => { qc.invalidateQueries(['projectMembers', project.id]); setAddUserId(''); },
  });
  const updateMember = useMutation({
    mutationFn: ({ userId, role }) => updateProjectMember(project.id, userId, { role }),
    onSuccess: () => qc.invalidateQueries(['projectMembers', project.id]),
  });
  const removeMember = useMutation({
    mutationFn: (userId) => removeProjectMember(project.id, userId),
    onSuccess: () => qc.invalidateQueries(['projectMembers', project.id]),
  });
  const addTeam = useMutation({
    mutationFn: () => addProjectTeam(project.id, { team_id: addTeamId, role: addTeamRole }),
    onSuccess: () => { qc.invalidateQueries(['projectTeams', project.id]); setAddTeamId(''); },
  });
  const updateTeam = useMutation({
    mutationFn: ({ teamId, role }) => updateProjectTeam(project.id, teamId, { role }),
    onSuccess: () => qc.invalidateQueries(['projectTeams', project.id]),
  });
  const removeTeam = useMutation({
    mutationFn: (teamId) => removeProjectTeam(project.id, teamId),
    onSuccess: () => qc.invalidateQueries(['projectTeams', project.id]),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-slate-400" />
            <h2 className="font-semibold text-slate-800">Project Settings</h2>
            <span className="text-xs text-slate-400 font-mono">{project.key}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mx-4 mt-3 mb-0 flex-wrap">
          {[['members', Users, 'Members'], ['teams', Shield, 'Teams'], ['fields', ListChecks, 'Fields'], ['workflow', Workflow, 'Workflow'], ['permissions', Lock, 'Permissions']].map(([key, Icon, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
          {tab === 'fields'       && <FieldsTab       projectId={project.id} canManage={canManage} />}
          {tab === 'workflow'     && <WorkflowTab     projectId={project.id} canManage={canManage} />}
          {tab === 'permissions'  && <PermissionsTab  project={project} canManageProject={canManageProject} projectRole={projectRole} isSysAdmin={isSysAdmin} />}

          {tab === 'members' && (
            <>
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 group">
                  <Avatar user={m} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{m.name}</div>
                    <div className="text-xs text-slate-400 truncate">{m.email}</div>
                  </div>
                  {canManage ? (
                    <select
                      value={m.role}
                      onChange={e => updateMember.mutate({ userId: m.id, role: e.target.value })}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer ${ROLE_COLORS[m.role]}`}>
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ROLE_COLORS[m.role]}`}>
                      {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                    </span>
                  )}
                  {canManage && (
                    <button onClick={() => removeMember.mutate(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}

              {canManage && availableUsers.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
                  <select value={addUserId} onChange={e => setAddUserId(e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                    <option value="">Add member...</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select value={addUserRole} onChange={e => setAddUserRole(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  <button onClick={() => addUserId && addMember.mutate()}
                    disabled={!addUserId || addMember.isPending}
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40">
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'teams' && (
            <>
              {projectTeams.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 group">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users size={14} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.member_count} member{t.member_count !== 1 ? 's' : ''}</div>
                  </div>
                  {canManage ? (
                    <select
                      value={t.role}
                      onChange={e => updateTeam.mutate({ teamId: t.id, role: e.target.value })}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer ${ROLE_COLORS[t.role]}`}>
                      {ROLE_OPTIONS.filter(r => r !== 'owner').map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ROLE_COLORS[t.role]}`}>
                      {t.role.charAt(0).toUpperCase() + t.role.slice(1)}
                    </span>
                  )}
                  {canManage && (
                    <button onClick={() => removeTeam.mutate(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}

              {canManage && availableTeams.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
                  <select value={addTeamId} onChange={e => setAddTeamId(e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                    <option value="">Add team...</option>
                    {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={addTeamRole} onChange={e => setAddTeamRole(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-indigo-300">
                    {ROLE_OPTIONS.filter(r => r !== 'owner').map(r => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                  <button onClick={() => addTeamId && addTeam.mutate()}
                    disabled={!addTeamId || addTeam.isPending}
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40">
                    <Plus size={14} />
                  </button>
                </div>
              )}

              {allTeams.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No teams exist yet. Create teams in the Admin panel.</p>
              )}
            </>
          )}
        </div>

        {canDelete && (
          <div className="flex-shrink-0 border-t border-slate-100 px-4 py-4">
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 font-medium transition-colors"
              >
                <AlertTriangle size={14} />
                Delete this project…
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-1">Delete project permanently</p>
                  <p className="text-xs text-slate-500">
                    All tickets, sprints, goals, and data will be deleted. Type <span className="font-mono font-bold text-slate-700">{project.key}</span> to confirm.
                  </p>
                </div>
                <input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={project.key}
                  autoFocus
                  className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-red-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDelete(false); setDeleteConfirmText(''); }}
                    className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMut.mutate()}
                    disabled={deleteConfirmText !== project.key || deleteMut.isPending}
                    className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    {deleteMut.isPending ? 'Deleting…' : 'Delete forever'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
