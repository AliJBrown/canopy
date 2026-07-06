import React from 'react';
import {
  CheckSquare, Bug, BookOpen, Zap,
  ChevronsUp, ChevronUp, Equal, ChevronDown,
} from 'lucide-react';

const TYPE_CONFIG = {
  task:  { icon: CheckSquare, label: 'Task',  class: 'text-blue-600 bg-blue-50' },
  bug:   { icon: Bug,         label: 'Bug',   class: 'text-red-600 bg-red-50' },
  story: { icon: BookOpen,    label: 'Story', class: 'text-green-600 bg-green-50' },
  epic:  { icon: Zap,         label: 'Epic',  class: 'text-purple-600 bg-purple-50' },
};

const PRIORITY_CONFIG = {
  critical: { icon: ChevronsUp, label: 'Critical', class: 'text-red-600' },
  high:     { icon: ChevronUp,  label: 'High',     class: 'text-orange-500' },
  medium:   { icon: Equal,      label: 'Medium',   class: 'text-yellow-500' },
  low:      { icon: ChevronDown,label: 'Low',      class: 'text-slate-400' },
};

const STATUS_CONFIG = {
  backlog:     { label: 'Backlog',     class: 'bg-slate-100 text-slate-600' },
  todo:        { label: 'To Do',       class: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', class: 'bg-amber-100 text-amber-700' },
  in_review:   { label: 'In Review',   class: 'bg-purple-100 text-purple-700' },
  done:        { label: 'Done',        class: 'bg-green-100 text-green-700' },
};

export function TypeBadge({ type, showLabel = false }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.task;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 ${cfg.class}`}>
      <Icon size={11} />
      {showLabel && cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority, showLabel = false }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.class}`}>
      <Icon size={13} />
      {showLabel && cfg.label}
    </span>
  );
}

// Build a lookup map from a project_statuses array (slug → {label, color})
export function buildStatusMap(statuses) {
  const map = {};
  (statuses || []).forEach(s => { map[s.slug] = { label: s.name, color: s.color }; });
  return map;
}

export function StatusBadge({ status, onChange, statuses }) {
  // Prefer dynamic project statuses over the static hardcoded config
  if (statuses && statuses.length > 0) {
    const map = buildStatusMap(statuses);
    const entry = map[status] || { label: status || '—', color: '#94a3b8' };
    const style = { backgroundColor: entry.color + '22', color: entry.color };
    if (!onChange) {
      return (
        <span className="inline-flex items-center text-xs font-semibold rounded-full px-2 py-0.5" style={style}>
          <span className="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </span>
      );
    }
    return (
      <select
        value={status}
        onChange={e => onChange(e.target.value)}
        style={style}
        className="text-xs font-semibold rounded-full px-2 py-0.5 border-none outline-none cursor-pointer"
        onClick={e => e.stopPropagation()}
      >
        {statuses.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
      </select>
    );
  }

  // Fallback: static config
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
  if (!onChange) {
    return <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${cfg.class}`}>{cfg.label}</span>;
  }
  return (
    <select
      value={status}
      onChange={e => onChange(e.target.value)}
      className={`text-xs font-medium rounded-full px-2 py-0.5 border-none outline-none cursor-pointer ${cfg.class}`}
      onClick={e => e.stopPropagation()}
    >
      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  );
}

export function Avatar({ user, size = 'sm' }) {
  if (!user) return null;
  const initials = (user.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <span
      title={user.name}
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white flex-shrink-0 ${sizeClass}`}
      style={{ backgroundColor: user.color || '#6366F1' }}
    >
      {initials}
    </span>
  );
}

export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
export const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
export const PRIORITY_OPTIONS = Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
export const STATUSES = Object.keys(STATUS_CONFIG);
export { STATUS_CONFIG, TYPE_CONFIG, PRIORITY_CONFIG };
