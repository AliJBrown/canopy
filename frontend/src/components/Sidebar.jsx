import React, { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, List, Layers, BarChart2, Target, Zap, Plus, ChevronDown, ChevronRight, LogOut, Shield, KeyRound, Lock, Search, Map } from 'lucide-react';
import { getProjects, createProject } from '../api/projects';
import { getSprints } from '../api/sprints';
import { useApp } from '../context/AppContext';
import { Avatar } from './Badge';
import { changePassword } from '../api/auth';
import NotificationBell from './NotificationBell';

function ProjectForm({ onClose }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const mut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => { qc.invalidateQueries(['projects']); nav(`/p/${p.key}`); onClose(); },
  });
  const autoKey = (v) => {
    setName(v);
    setKey(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5));
  };
  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate({ name, key }); }}
      className="mt-2 p-3 bg-slate-800 rounded-lg space-y-2">
      <input value={name} onChange={e => autoKey(e.target.value)}
        placeholder="Project name" required
        className="w-full bg-slate-700 text-white text-sm rounded px-2 py-1.5 placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500" />
      <input value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
        placeholder="KEY" required
        className="w-full bg-slate-700 text-white text-sm rounded px-2 py-1.5 placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500" />
      <div className="flex gap-2">
        <button type="submit" disabled={mut.isPending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded px-2 py-1.5">
          {mut.isPending ? '...' : 'Create'}
        </button>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xs px-2">Cancel</button>
      </div>
    </form>
  );
}

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const mut = useMutation({
    mutationFn: () => changePassword(form.current, form.next),
    onSuccess: () => setOk(true),
    onError: (e) => setErr(e.error || 'Failed'),
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-slate-800 mb-4">Change Password</h2>
        {ok ? (
          <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mb-4">Password updated!</div>
        ) : (
          <div className="space-y-3">
            {err && <p className="text-xs text-red-600">{err}</p>}
            <input type="password" value={form.current} onChange={set('current')} placeholder="Current password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <input type="password" value={form.next} onChange={set('next')} placeholder="New password (min 6)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Confirm new password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
            <button
              onClick={() => {
                if (form.next !== form.confirm) { setErr('Passwords do not match'); return; }
                if (form.next.length < 6) { setErr('Minimum 6 characters'); return; }
                setErr(''); mut.mutate();
              }}
              disabled={mut.isPending}
              className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40">
              {mut.isPending ? 'Updating...' : 'Update password'}
            </button>
          </div>
        )}
        <button onClick={onClose} className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700 py-1">Close</button>
      </div>
    </div>
  );
}

function ProjectItem({ p, isActive }) {
  const [open, setOpen] = useState(isActive);
  const nav = useNavigate();
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', p.id],
    queryFn: () => getSprints(p.id),
    enabled: open,
    staleTime: 60_000,
  });

  const activeSprint = sprints.find(s => s.status === 'active');
  const daysLeft = activeSprint
    ? Math.max(0, Math.ceil((new Date(activeSprint.end_date) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const subCls = (a) =>
    `flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
      a ? 'text-indigo-300 bg-slate-800' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`;

  return (
    <div>
      <div className={`flex items-center gap-0 rounded-md transition-colors ${
        isActive ? 'bg-indigo-600/20' : 'hover:bg-slate-800'
      }`}>
        {/* Project name → navigate to board */}
        <button
          onClick={() => { nav(`/p/${p.key}/board`); setOpen(true); }}
          className={`flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 text-sm rounded-md transition-colors text-left ${
            isActive ? 'text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          <span className="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {p.key.slice(0, 2)}
          </span>
          <span className="truncate flex-1">{p.name}</span>
        </button>
        {/* Separate chevron to toggle expand */}
        <button
          onClick={() => setOpen(o => !o)}
          className="p-1.5 text-slate-500 hover:text-slate-300 flex-shrink-0">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {open && (
        <div className="ml-7 space-y-0.5 mt-0.5 mb-1">
          <NavLink to={`/p/${p.key}/board`} className={({ isActive: a }) => subCls(a)}>
            <LayoutGrid size={11} /> Board
          </NavLink>
          <NavLink to={`/p/${p.key}/list`} className={({ isActive: a }) => subCls(a)}>
            <List size={11} /> List
          </NavLink>
          <NavLink to={`/p/${p.key}/backlog`} className={({ isActive: a }) => subCls(a)}>
            <Layers size={11} /> Backlog
            {activeSprint && daysLeft !== null && (
              <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {daysLeft}d
              </span>
            )}
          </NavLink>
          <NavLink to={`/p/${p.key}/planning`} className={({ isActive: a }) => subCls(a)}>
            <List size={11} /> Planning
          </NavLink>
          <NavLink to={`/p/${p.key}/roadmap`} className={({ isActive: a }) => subCls(a)}>
            <Map size={11} /> Roadmap
          </NavLink>
          <NavLink to={`/p/${p.key}/reports`} className={({ isActive: a }) => subCls(a)}>
            <BarChart2 size={11} /> Reports
          </NavLink>
          <NavLink to={`/p/${p.key}/goals`} className={({ isActive: a }) => subCls(a)}>
            <Target size={11} /> Goals & KPIs
          </NavLink>
          <NavLink to={`/p/${p.key}/automations`} className={({ isActive: a }) => subCls(a)}>
            <Zap size={11} /> Automations
          </NavLink>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useApp();
  const { projectKey: activeProjectKey } = useParams();
  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  if (projectsData !== undefined && !Array.isArray(projectsData)) {
    console.error('[Sidebar] projects is not an array:', typeof projectsData, projectsData);
  }
  const projects = Array.isArray(projectsData) ? projectsData : [];
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const nav = useNavigate();

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col h-full">
      <div className="px-4 py-4 flex items-center gap-2 border-b border-slate-700">
        <Target size={20} className="text-indigo-400" />
        <span className="font-bold text-white tracking-tight text-lg flex-1">Canopy</span>
        <NotificationBell onTicketOpen={null} />
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-1">
        {/* Global search shortcut */}
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('open-global-search'))}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors mb-1"
        >
          <Search size={12} />
          <span>Search</span>
          <span className="ml-auto text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">⌘K</span>
        </button>

        {/* Top-level navigation */}
        <NavLink to="/goals"
          className={({ isActive }) => `flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors ${
            isActive ? 'text-white bg-indigo-600/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}>
          <Target size={14} className="text-indigo-400" /> Strategic Goals
        </NavLink>
        <NavLink to="/my-goals"
          className={({ isActive }) => `flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors mb-2 ${
            isActive ? 'text-white bg-indigo-600/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}>
          <Lock size={14} className="text-slate-400" /> My Goals
        </NavLink>

        <button onClick={() => setProjectsOpen(o => !o)}
          className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200">
          <span>Projects</span>
          {projectsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {projectsOpen && (
          <div className="space-y-0.5">
            {projects.map(p => (
              <ProjectItem
                key={p.id}
                p={p}
                isActive={p.key === activeProjectKey}
              />
            ))}
            {!showNewProject ? (
              <button onClick={() => setShowNewProject(true)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors">
                <Plus size={13} /> New project
              </button>
            ) : (
              <ProjectForm onClose={() => setShowNewProject(false)} />
            )}
          </div>
        )}
      </nav>

      {/* User menu */}
      <div className="border-t border-slate-700 px-2 py-2">
        <button
          onClick={() => setShowUserMenu(o => !o)}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors text-left"
        >
          <Avatar user={user} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-200 font-medium truncate">{user?.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{user?.email}</div>
          </div>
          <ChevronDown size={13} className={`text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
        </button>

        {showUserMenu && (
          <div className="mt-1 space-y-0.5">
            {user?.role === 'admin' && (
              <button onClick={() => { nav('/admin'); setShowUserMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white rounded-md">
                <Shield size={12} /> Admin panel
              </button>
            )}
            <button onClick={() => { setShowChangePass(true); setShowUserMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white rounded-md">
              <KeyRound size={12} /> Change password
            </button>
            <button onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-red-900/30 hover:text-red-300 rounded-md">
              <LogOut size={12} /> Sign out
            </button>
          </div>
        )}
      </div>

      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}
    </aside>
  );
}
