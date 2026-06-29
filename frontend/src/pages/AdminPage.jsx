import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronDown, ChevronRight, Shield, Users, UserCheck, UserX, RefreshCw, KeyRound, X, Pencil } from 'lucide-react';
import {
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  getTeams, createTeam, deleteTeam, getTeamMembers, addTeamMember, removeTeamMember,
  getSystemPermissions, setUserPermissions,
} from '../api/admin';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Badge';

const ROLE_COLORS = {
  admin:  'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
};

const USER_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

function NewUserForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', color: USER_COLORS[0] });
  const [err, setErr] = useState('');
  const mut = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => { qc.invalidateQueries(['adminUsers']); onClose(); },
    onError: (e) => setErr(e.error || 'Failed to create user'),
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={5} className="px-4 py-4">
        <div className="space-y-3 max-w-2xl">
          {err && <p className="text-xs text-red-600 font-medium">{err}</p>}
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={set('name')} placeholder="Full name" required
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <input value={form.email} onChange={set('email')} placeholder="Email" type="email" required
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <input value={form.password} onChange={set('password')} placeholder="Password (min 6)" type="password" required
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
          </div>
          <div className="flex items-center gap-4">
            <select value={form.role} onChange={set('role')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-1.5">
              {USER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-5 h-5 rounded-full border-2 ${form.color === c ? 'border-slate-700' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => mut.mutate(form)}
                disabled={!form.name || !form.email || !form.password || mut.isPending}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40">
                {mut.isPending ? 'Creating...' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function EditUserRow({ user, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: user.name, email: user.email, color: user.color });
  const [err, setErr] = useState('');
  const mut = useMutation({
    mutationFn: data => updateAdminUser(user.id, data),
    onSuccess: () => { qc.invalidateQueries(['adminUsers']); onClose(); },
    onError: e => setErr(e.error || 'Failed to update user'),
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={5} className="px-4 py-4">
        <div className="space-y-3 max-w-2xl">
          {err && <p className="text-xs text-red-600 font-medium">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={set('name')} placeholder="Full name"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <input value={form.email} onChange={set('email')} placeholder="Email" type="email"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {USER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-5 h-5 rounded-full border-2 ${form.color === c ? 'border-slate-700' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => mut.mutate(form)}
                disabled={!form.name || !form.email || mut.isPending}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40">
                {mut.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function TeamRow({ team, allUsers }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ['teamMembers', team.id],
    queryFn: () => getTeamMembers(team.id),
    enabled: open,
  });
  const [addingUserId, setAddingUserId] = useState('');

  const removeMut = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onSuccess: () => qc.invalidateQueries(['teams']),
  });
  const addMemberMut = useMutation({
    mutationFn: (userId) => addTeamMember(team.id, { user_id: userId }),
    onSuccess: () => { qc.invalidateQueries(['teamMembers', team.id]); qc.invalidateQueries(['teams']); setAddingUserId(''); },
  });
  const removeMemberMut = useMutation({
    mutationFn: (userId) => removeTeamMember(team.id, userId),
    onSuccess: () => { qc.invalidateQueries(['teamMembers', team.id]); qc.invalidateQueries(['teams']); },
  });

  const memberIds = new Set(members.map(m => m.id));
  const available = allUsers.filter(u => !memberIds.has(u.id));

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50 group">
        <td className="px-4 py-3">
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
            {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            <span className="font-medium text-slate-800">{team.name}</span>
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{team.description || '—'}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{team.member_count} member{team.member_count !== 1 ? 's' : ''}</td>
        <td className="px-4 py-3">
          <button onClick={() => { if (confirm(`Delete team "${team.name}"?`)) removeMut.mutate(); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={4} className="px-8 py-3">
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-2 group/m">
                  <Avatar user={m} size="sm" />
                  <span className="text-sm text-slate-700">{m.name}</span>
                  <span className="text-xs text-slate-400">{m.email}</span>
                  <button onClick={() => removeMemberMut.mutate(m.id)}
                    className="ml-auto opacity-0 group-hover/m:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {available.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <select value={addingUserId} onChange={e => setAddingUserId(e.target.value)}
                    className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300">
                    <option value="">Add member...</option>
                    {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  {addingUserId && (
                    <button onClick={() => addMemberMut.mutate(addingUserId)}
                      className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded hover:bg-indigo-500">
                      Add
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useApp();
  const [tab, setTab] = useState('users');
  const [showNewUser, setShowNewUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const { data: users = [] } = useQuery({ queryKey: ['adminUsers'], queryFn: getAdminUsers });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });

  const updateUser = useMutation({
    mutationFn: ({ id, ...data }) => updateAdminUser(id, data),
    onSuccess: () => qc.invalidateQueries(['adminUsers']),
  });
  const deleteUser = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => qc.invalidateQueries(['adminUsers']),
  });
  const createTeamMut = useMutation({
    mutationFn: createTeam,
    onSuccess: () => { qc.invalidateQueries(['teams']); setShowNewTeam(false); setNewTeamName(''); },
  });

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 w-full overflow-y-auto h-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
          <Shield size={18} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
          <p className="text-xs text-slate-500">Manage users, teams, and permissions</p>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-6">
        {[['users', Users, 'Users'], ['teams', Users, 'Teams'], ['permissions', KeyRound, 'Permissions']].map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">{users.length} users</span>
            <button onClick={() => setShowNewUser(s => !s)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">
              <Plus size={14} /> New user
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['User', 'Email', 'System role', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showNewUser && <NewUserForm onClose={() => setShowNewUser(false)} />}
              {users.map(u => editingUserId === u.id ? (
                <EditUserRow key={u.id} user={u} onClose={() => setEditingUserId(null)} />
              ) : (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} />
                      <span className="text-sm font-medium text-slate-800">{u.name}</span>
                      {u.id === currentUser?.id && <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded px-1.5 py-0.5 font-semibold">You</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e => updateUser.mutate({ id: u.id, role: e.target.value })}
                      disabled={u.id === currentUser?.id}
                      className={`text-xs font-semibold rounded-full px-2.5 py-0.5 border-none outline-none cursor-pointer disabled:cursor-default ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600'}`}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateUser.mutate({ id: u.id, is_active: !u.is_active })}
                      disabled={u.id === currentUser?.id}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-default ${
                        u.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {u.is_active ? <><UserCheck size={11} /> Active</> : <><UserX size={11} /> Disabled</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingUserId(u.id)}
                        title="Edit name, email, color"
                        className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          const p = prompt(`Reset password for ${u.name}:`, '');
                          if (p) updateUser.mutate({ id: u.id, password: p });
                        }}
                        title="Reset password"
                        className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded">
                        <RefreshCw size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteUser.mutate(u.id); }}
                        disabled={u.id === currentUser?.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-default">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'teams' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">{teams.length} teams</span>
            <button onClick={() => setShowNewTeam(s => !s)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">
              <Plus size={14} /> New team
            </button>
          </div>
          {showNewTeam && (
            <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50/50 border-b border-slate-100">
              <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                placeholder="Team name" autoFocus
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300 flex-1 max-w-xs" />
              <button onClick={() => createTeamMut.mutate({ name: newTeamName })}
                disabled={!newTeamName.trim() || createTeamMut.isPending}
                className="text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-500 disabled:opacity-40">Create</button>
              <button onClick={() => setShowNewTeam(false)}
                className="text-sm text-slate-500 hover:text-slate-700 px-2 py-2">Cancel</button>
            </div>
          )}
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Team', 'Description', 'Members', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map(t => <TeamRow key={t.id} team={t} allUsers={users} />)}
              {teams.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No teams yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'permissions' && (
        <PermissionsTab users={users} />
      )}
    </div>
  );
}

function PermissionsTab({ users }) {
  const qc = useQueryClient();
  const { data: permsData, isLoading } = useQuery({
    queryKey: ['system-permissions'],
    queryFn: getSystemPermissions,
  });

  const grantMut = useMutation({
    mutationFn: ({ userId, permissions }) => setUserPermissions(userId, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-permissions'] }),
  });

  const definitions = permsData?.definitions || [];
  const grants = permsData?.grants || {};

  function getUserCurrentPerms(userId) {
    return Object.keys(grants).filter(key => grants[key].users?.some(u => u.id === userId));
  }

  function handleRemove(userId, permKey) {
    const current = getUserCurrentPerms(userId);
    grantMut.mutate({ userId, permissions: current.filter(k => k !== permKey) });
  }

  function handleGrant(userId, permKey) {
    const current = getUserCurrentPerms(userId);
    if (!current.includes(permKey)) {
      grantMut.mutate({ userId, permissions: [...current, permKey] });
    }
  }

  const categoryOrder = [...new Set(definitions.map(d => d.category))];

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-8 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">System Permissions</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Grant users additional capabilities beyond their system role. System administrators always have all permissions implicitly.
        </p>
      </div>

      {categoryOrder.map(category => {
        const catDefs = definitions.filter(d => d.category === category);
        return (
          <div key={category} className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 rounded-t-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{category}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {catDefs.map(def => (
                <PermissionRow
                  key={def.key}
                  def={def}
                  grant={grants[def.key]}
                  allUsers={users}
                  onRemove={(userId) => handleRemove(userId, def.key)}
                  onGrant={(userId) => handleGrant(userId, def.key)}
                  isPending={grantMut.isPending}
                />
              ))}
            </div>
          </div>
        );
      })}

      {definitions.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-8">No permission definitions found.</div>
      )}
    </div>
  );
}

function PermissionRow({ def, grant, allUsers, onRemove, onGrant, isPending }) {
  const [showPicker, setShowPicker] = useState(false);
  const grantedUsers = grant?.users || [];
  const grantedIds = new Set(grantedUsers.map(u => u.id));
  const eligible = allUsers.filter(u => !grantedIds.has(u.id) && u.role !== 'admin');

  return (
    <div className="px-4 py-3 flex items-start gap-4">
      <div className="min-w-[200px]">
        <span className="text-sm font-medium text-slate-800">{def.label}</span>
        <span className="ml-2 text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
          {def.category}
        </span>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{def.key}</div>
      </div>

      <div className="flex-1 flex flex-wrap items-center gap-1.5">
        {grantedUsers.map(u => (
          <span key={u.id}
            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full pl-1.5 pr-1 py-0.5 border border-indigo-100">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: u.color || '#6366F1' }}>
              {u.name?.[0]?.toUpperCase()}
            </span>
            {u.name}
            <button
              onClick={() => onRemove(u.id)}
              disabled={isPending}
              className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors disabled:opacity-40">
              <X size={10} />
            </button>
          </span>
        ))}

        {grantedUsers.length === 0 && (
          <span className="text-xs text-slate-400 italic">No grants</span>
        )}
      </div>

      <div className="relative flex-shrink-0">
        {eligible.length > 0 && (
          <>
            <button
              onClick={() => setShowPicker(p => !p)}
              disabled={isPending}
              className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors disabled:opacity-40">
              <Plus size={11} /> Grant
            </button>
            {showPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden min-w-[220px]">
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {eligible.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { onGrant(u.id); setShowPicker(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left transition-colors">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: u.color || '#6366F1' }}>
                        {u.name?.[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{u.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100">
                  <button onClick={() => setShowPicker(false)}
                    className="w-full text-xs text-slate-400 hover:text-slate-600 py-1.5 text-center">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
