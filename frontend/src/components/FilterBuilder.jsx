import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Save, Check, Parentheses } from 'lucide-react';
import { getSprints } from '../api/sprints';
import { getLabels, createLabel } from '../api/labels';
import { getProjectMembers } from '../api/admin';
import { getFields } from '../api/fields';
import { createSavedFilter, updateSavedFilter } from '../api/savedFilters';
import { STATUS_OPTIONS, TYPE_OPTIONS, PRIORITY_OPTIONS } from './Badge';

const FIELD_OPTIONS = [
  { value: 'status',       label: 'Status',       type: 'multi',  staticOpts: STATUS_OPTIONS },
  { value: 'type',         label: 'Type',          type: 'multi',  staticOpts: TYPE_OPTIONS },
  { value: 'priority',     label: 'Priority',      type: 'multi',  staticOpts: PRIORITY_OPTIONS },
  { value: 'assignee_id',  label: 'Assignee',      type: 'user' },
  { value: 'sprint_id',    label: 'Sprint',        type: 'sprint' },
  { value: 'label_id',     label: 'Label',         type: 'label' },
  { value: 'due_date',     label: 'Due Date',      type: 'date' },
  { value: 'story_points', label: 'Story Points',  type: 'number' },
  { value: 'created_at',   label: 'Created Date',  type: 'date' },
];

const OPERATORS = {
  multi:  [{ value: 'in', label: 'is any of' }, { value: 'nin', label: 'is none of' }],
  user:   [{ value: 'in', label: 'is any of' }, { value: 'empty', label: 'is unassigned' }],
  sprint: [{ value: 'eq', label: 'is' }, { value: 'none', label: 'has no sprint' }],
  label:  [{ value: 'in', label: 'has any of' }, { value: 'nin', label: 'has none of' }],
  date:   [{ value: 'before', label: 'is before' }, { value: 'after', label: 'is after' }],
  number: [{ value: 'eq', label: '=' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }],
};

const PRESET_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#f97316'];

const EMPTY_CONDITION = () => ({ type: 'condition', field: 'status', op: 'in', values: [], value: '' });
const EMPTY_GROUP     = () => ({ type: 'group', operator: 'OR', children: [EMPTY_CONDITION()] });

function migrateConfig(cfg) {
  if (!cfg) return { operator: 'AND', children: [EMPTY_CONDITION()] };
  if (cfg.children) return cfg;
  // legacy flat format: { operator, conditions }
  return {
    operator: cfg.operator || 'AND',
    children: (cfg.conditions || []).map(c => ({ type: 'condition', ...c })),
  };
}

// ── Condition value input ─────────────────────────────────────────────────────

function LabelConditionValue({ opts, cond, onChange, isLabel, projectId }) {
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(PRESET_COLORS[0]);

  const createMut = useMutation({
    mutationFn: () => createLabel(projectId, { name: name.trim(), color }),
    onSuccess: (label) => {
      qc.invalidateQueries(['labels', projectId]);
      onChange({ values: [...(cond.values || []), label.id] });
      setName(''); setColor(PRESET_COLORS[0]); setCreating(false);
    },
  });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {opts.map(o => {
          const sel = (cond.values || []).includes(o.value);
          return (
            <button key={o.value}
              onClick={() => onChange({ values: sel ? (cond.values || []).filter(v => v !== o.value) : [...(cond.values || []), o.value] })}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-300'
              }`}>
              {isLabel && o.color && <span className="w-2 h-2 rounded-full" style={{ background: o.color }} />}
              {o.label}
            </button>
          );
        })}
      </div>
      {isLabel && projectId && (
        creating ? (
          <div className="flex flex-col gap-1 mt-1 p-2 bg-slate-50 rounded border border-slate-200">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Label name" autoFocus
              onKeyDown={e => e.key === 'Enter' && name.trim() && createMut.mutate()}
              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
            <div className="flex gap-1">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border-2 ${color === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-1">
              <button onClick={() => name.trim() && createMut.mutate()} disabled={!name.trim() || createMut.isPending}
                className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">Create</button>
              <button onClick={() => setCreating(false)} className="text-[10px] text-slate-500 hover:bg-slate-100 px-2 py-0.5 rounded">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 mt-0.5">
            <Plus size={11} /> Create label
          </button>
        )
      )}
    </div>
  );
}

// ── Single condition row ──────────────────────────────────────────────────────

function ConditionRow({ cond, onChange, onRemove, shared }) {
  const { users, sprints, labels, customFields, projectId } = shared;

  const fieldDef = [...FIELD_OPTIONS, ...customFields.map(f => ({
    value: `custom:${f.id}`,
    label: f.name,
    type: f.field_type === 'select' ? 'static_select' : f.field_type,
    staticOpts: f.field_type === 'select' ? (f.options || []).map(o => ({ value: o, label: o })) : [],
  }))].find(f => f.value === cond.field);

  const ops = fieldDef ? (OPERATORS[fieldDef.type] || OPERATORS.multi) : OPERATORS.multi;
  const needsValue = !['empty', 'none'].includes(cond.op);

  const renderValue = () => {
    if (!fieldDef || !needsValue) return null;
    if (fieldDef.type === 'multi' || fieldDef.type === 'label' || fieldDef.type === 'static_select') {
      const isLabel = fieldDef.type === 'label';
      const opts = fieldDef.staticOpts || (isLabel ? labels.map(l => ({ value: l.id, label: l.name, color: l.color })) : []);
      return <LabelConditionValue opts={opts} cond={cond} onChange={onChange} isLabel={isLabel} projectId={projectId} />;
    }
    if (fieldDef.type === 'user') {
      return (
        <div className="flex flex-wrap gap-1">
          {users.map(u => {
            const sel = (cond.values || []).includes(u.id);
            return (
              <button key={u.id}
                onClick={() => onChange({ values: sel ? (cond.values || []).filter(v => v !== u.id) : [...(cond.values || []), u.id] })}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-300'
                }`}>
                {u.name}
              </button>
            );
          })}
        </div>
      );
    }
    if (fieldDef.type === 'sprint') {
      return (
        <select value={cond.value || ''} onChange={e => onChange({ value: e.target.value })}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300">
          <option value="">Select sprint...</option>
          {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      );
    }
    if (fieldDef.type === 'date') {
      return (
        <input type="date" value={cond.value || ''} onChange={e => onChange({ value: e.target.value })}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
      );
    }
    if (fieldDef.type === 'number') {
      return (
        <input type="number" value={cond.value || ''} onChange={e => onChange({ value: e.target.value })}
          placeholder="Value" className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 w-24" />
      );
    }
    return (
      <input type="text" value={cond.value || ''} onChange={e => onChange({ value: e.target.value })}
        placeholder="Value..." className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
    );
  };

  return (
    <div className="flex items-start gap-2 py-2">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <select value={cond.field} onChange={e => onChange({ field: e.target.value, op: '', values: [], value: '' })}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
            <optgroup label="Standard fields">
              {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            {customFields.length > 0 && (
              <optgroup label="Custom fields">
                {customFields.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
              </optgroup>
            )}
          </select>
          <select value={cond.op} onChange={e => onChange({ op: e.target.value, values: [], value: '' })}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
            <option value="">Operator...</option>
            {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {needsValue && <div>{renderValue()}</div>}
      </div>
      <button onClick={onRemove} className="text-slate-300 hover:text-red-400 mt-1.5 p-1 rounded hover:bg-red-50 flex-shrink-0 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Recursive group block ─────────────────────────────────────────────────────

function GroupBlock({ group, onChange, onRemove, depth, shared }) {
  const isRoot = depth === 0;

  const setOperator = (op) => onChange({ ...group, operator: op });

  const updateChild = (i, newChild) => onChange({
    ...group,
    children: group.children.map((c, idx) => idx === i ? newChild : c),
  });

  const removeChild = (i) => onChange({
    ...group,
    children: group.children.filter((_, idx) => idx !== i),
  });

  const addCondition = () => onChange({
    ...group,
    children: [...group.children, EMPTY_CONDITION()],
  });

  const addGroup = () => onChange({
    ...group,
    children: [...group.children, EMPTY_GROUP()],
  });

  return (
    <div className={
      isRoot
        ? 'space-y-0'
        : 'border border-slate-200 rounded-lg bg-slate-50/60 mt-2 mb-1'
    }>
      {/* Group header */}
      <div className={`flex items-center gap-1.5 ${isRoot ? 'py-2' : 'px-3 pt-2.5 pb-1'}`}>
        {!isRoot && (
          <span className="text-[11px] font-mono text-slate-400 mr-0.5 select-none">(</span>
        )}
        <span className="text-xs font-semibold text-slate-500 mr-1">
          {isRoot ? 'Match' : 'where'}
        </span>
        {['AND', 'OR'].map(op => (
          <button key={op} onClick={() => setOperator(op)}
            className={`text-xs px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
              group.operator === op
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 border border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600'
            }`}>
            {op}
          </button>
        ))}
        {!isRoot && (
          <button onClick={onRemove}
            className="ml-auto text-slate-300 hover:text-red-400 p-0.5 rounded hover:bg-red-50 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Children */}
      <div className={isRoot ? 'divide-y divide-slate-100' : 'px-3 divide-y divide-slate-100'}>
        {group.children.map((child, i) => (
          child.type === 'group' ? (
            <GroupBlock
              key={i}
              group={child}
              onChange={(newGroup) => updateChild(i, newGroup)}
              onRemove={() => removeChild(i)}
              depth={depth + 1}
              shared={shared}
            />
          ) : (
            <ConditionRow
              key={i}
              cond={child}
              onChange={(patch) => updateChild(i, { ...child, ...patch })}
              onRemove={() => removeChild(i)}
              shared={shared}
            />
          )
        ))}
      </div>

      {/* Add buttons */}
      <div className={`flex items-center gap-3 py-2 ${isRoot ? '' : 'px-3 pb-2.5'}`}>
        <button onClick={addCondition}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          <Plus size={14} /> Add condition
        </button>
        {depth < 2 && (
          <button onClick={addGroup}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <Parentheses size={14} /> Add group
          </button>
        )}
        {!isRoot && (
          <span className="text-[11px] font-mono text-slate-400 ml-auto select-none">)</span>
        )}
      </div>
    </div>
  );
}

// ── Main FilterBuilder ────────────────────────────────────────────────────────

export default function FilterBuilder({ projectId, filters, onApply, onClose, existingFilter }) {
  const qc = useQueryClient();
  const [root, setRoot] = useState({ operator: 'AND', children: [EMPTY_CONDITION()] });
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: sprints = [] }      = useQuery({ queryKey: ['sprints', projectId],        queryFn: () => getSprints(projectId),        enabled: !!projectId });
  const { data: labels = [] }       = useQuery({ queryKey: ['labels', projectId],          queryFn: () => getLabels(projectId),          enabled: !!projectId });
  const { data: customFields = [] } = useQuery({ queryKey: ['fields', projectId],          queryFn: () => getFields(projectId),          enabled: !!projectId });
  const { data: members = [] }      = useQuery({ queryKey: ['projectMembers', projectId],  queryFn: () => getProjectMembers(projectId),  enabled: !!projectId });
  const users = members.filter(m => m.role !== 'viewer');

  // Init from existing filter or current filterConfig
  useEffect(() => {
    if (existingFilter) {
      setRoot(migrateConfig(existingFilter.filter_config));
      setSaveName(existingFilter.name || '');
    } else if (filters?.filterConfig) {
      setRoot(filters.filterConfig);
    }
  }, [existingFilter]);

  const shared = { users, sprints, labels, customFields, projectId };

  const handleApply = () => {
    onApply({
      search: '', status: [], type: [], priority: [], assigneeIds: [],
      sprintId: null, labelIds: [], hasNoAssignee: false,
      dueDateBefore: null, dueDateAfter: null,
      filterConfig: root,
    });
    onClose();
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      if (existingFilter?.id) {
        await updateSavedFilter(projectId, existingFilter.id, { name: saveName, filter_config: root });
      } else {
        await createSavedFilter(projectId, { name: saveName, filter_config: root });
      }
      qc.invalidateQueries(['saved-filters', projectId]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[500px] bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Filter builder</h2>
            <p className="text-xs text-slate-400 mt-0.5">Use groups <span className="font-mono">( )</span> to nest AND/OR logic</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {/* Tree editor */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <GroupBlock
            group={root}
            onChange={setRoot}
            onRemove={null}
            depth={0}
            shared={shared}
          />
        </div>

        {/* Save filter */}
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Save this filter</div>
          <div className="flex gap-2">
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Filter name..."
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <button onClick={handleSave} disabled={!saveName.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 transition-colors">
              {saved ? <Check size={14} className="text-emerald-500" /> : <Save size={14} />}
              {saved ? 'Saved!' : saving ? '...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Apply */}
        <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
          <button onClick={handleApply}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
            Apply filters
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
