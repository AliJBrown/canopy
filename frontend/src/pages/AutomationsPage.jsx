import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, GitBranch, Key, Plus, Trash2, X, ChevronDown, ChevronRight,
         ToggleLeft, ToggleRight, Copy, Check, Eye, EyeOff, Clock,
         AlertCircle, CheckCircle, MinusCircle } from 'lucide-react';
import {
  getAutomations, createAutomation, updateAutomation, deleteAutomation, getAutomationRuns,
  getWorkflow, createWorkflow, updateWorkflowSettings, addTransition, deleteTransition,
  getTokens, createToken, deleteToken,
} from '../api/automations';
import { getProjects } from '../api/projects';
import { getLabels } from '../api/labels';
import { getProjectMembers } from '../api/admin';
import { getProjectStatuses } from '../api/projectStatuses';
import LabelCombobox from '../components/LabelCombobox';

const TRIGGER_TYPES = [
  { value: 'ticket.created',        label: 'Ticket created' },
  { value: 'ticket.status_changed', label: 'Status changed' },
  { value: 'ticket.assigned',       label: 'Ticket assigned' },
  { value: 'ticket.priority_changed', label: 'Priority changed' },
  { value: 'ticket.commented',      label: 'Comment added' },
];

const CONDITION_FIELDS = [
  { value: 'type',     label: 'Type',     ops: ['eq','neq','in'] },
  { value: 'priority', label: 'Priority', ops: ['eq','neq','in'] },
  { value: 'status',   label: 'Status',   ops: ['eq','neq','in'] },
  { value: 'label',    label: 'Label',    ops: ['has','not_has'] },
  { value: 'assignee', label: 'Assignee', ops: ['is_set','is_empty','eq'] },
  { value: 'sprint',   label: 'Sprint',   ops: ['is_set','is_empty'] },
];

const OP_LABELS = { eq: 'is', neq: 'is not', in: 'is one of', has: 'has label', not_has: 'does not have label',
  is_set: 'is set', is_empty: 'is empty' };

const ACTION_TYPES = [
  { value: 'add_label',   label: 'Add label',          fields: ['label_id'] },
  { value: 'remove_label',label: 'Remove label',       fields: ['label_id'] },
  { value: 'set_assignee',label: 'Set assignee',       fields: ['user_id'] },
  { value: 'set_priority',label: 'Set priority',       fields: ['priority'] },
  { value: 'set_status',  label: 'Set status',         fields: ['status'] },
  { value: 'add_comment', label: 'Add comment',        fields: ['body'] },
  { value: 'webhook',     label: 'Send webhook (POST)', fields: ['url','secret'] },
];

const TICKET_TYPES = ['task','bug','story','epic','feature'];
const PRIORITIES = ['low','medium','high','critical'];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Select({ value, onChange, options, placeholder, className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300 ${className}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Input({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300 ${className}`} />
  );
}

// ─── Automation condition builder ─────────────────────────────────────────────

function ConditionRow({ cond, onChange, onRemove, projectId, members, statuses }) {
  const fieldMeta = CONDITION_FIELDS.find(f => f.value === cond.field) || CONDITION_FIELDS[0];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={cond.field} onChange={v => onChange({ ...cond, field: v, op: '', value: '' })}
        options={CONDITION_FIELDS} className="w-32" />
      <Select value={cond.op} onChange={v => onChange({ ...cond, op: v })}
        options={fieldMeta.ops.map(o => ({ value: o, label: OP_LABELS[o] }))}
        placeholder="— op —" className="w-36" />
      {/* Value selector */}
      {cond.op && !['is_set','is_empty'].includes(cond.op) && (
        <>
          {cond.field === 'type' && (
            <Select value={cond.value} onChange={v => onChange({ ...cond, value: v })}
              options={TICKET_TYPES} placeholder="— type —" className="w-28" />
          )}
          {cond.field === 'priority' && (
            <Select value={cond.value} onChange={v => onChange({ ...cond, value: v })}
              options={PRIORITIES} placeholder="— priority —" className="w-28" />
          )}
          {cond.field === 'status' && (
            <Select value={cond.value} onChange={v => onChange({ ...cond, value: v })}
              options={statuses.map(s => ({ value: s.slug, label: s.name }))}
              placeholder="— status —" className="w-36" />
          )}
          {cond.field === 'label' && (
            <LabelCombobox
              projectId={projectId}
              value={cond.value}
              onChange={v => onChange({ ...cond, value: v })}
              placeholder="Search or create label…"
              className="w-48" />
          )}
          {cond.field === 'assignee' && cond.op === 'eq' && (
            <Select value={cond.value} onChange={v => onChange({ ...cond, value: v })}
              options={members.map(m => ({ value: m.id, label: m.name }))}
              placeholder="— user —" className="w-36" />
          )}
        </>
      )}
      <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Trigger config builder ───────────────────────────────────────────────────

function TriggerConfig({ triggerType, config, onChange, members, statuses }) {
  if (triggerType === 'ticket.status_changed') {
    const statusOptions = [{ value: '*', label: 'Any status' }, ...statuses.map(s => ({ value: s.slug, label: s.name }))];
    return (
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-xs text-slate-500 font-medium">From:</span>
        <Select value={config.from || '*'} onChange={v => onChange({ ...config, from: v })}
          options={statusOptions} className="w-36" />
        <span className="text-xs text-slate-500 font-medium">To:</span>
        <Select value={config.to || '*'} onChange={v => onChange({ ...config, to: v })}
          options={statusOptions} className="w-36" />
      </div>
    );
  }
  if (triggerType === 'ticket.assigned') {
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-slate-500 font-medium">Assignee:</span>
        <Select value={config.assignee_id || '*'}
          onChange={v => onChange({ ...config, assignee_id: v })}
          options={[{ value: '*', label: 'Anyone' }, ...members.map(m => ({ value: m.id, label: m.name }))]}
          className="w-40" />
      </div>
    );
  }
  return null;
}

// ─── Action row builder ───────────────────────────────────────────────────────

function ActionRow({ action, onChange, onRemove, projectId, members, statuses, index }) {
  const typeMeta = ACTION_TYPES.find(t => t.value === action.type);
  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase w-4">{index + 1}</span>
        <Select value={action.type} onChange={v => onChange({ type: v, config: {} })}
          options={ACTION_TYPES} placeholder="— action —" className="flex-1" />
        <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors">
          <X size={14} />
        </button>
      </div>
      {/* Action-specific config */}
      {action.type === 'add_label' || action.type === 'remove_label' ? (
        <LabelCombobox
          projectId={projectId}
          value={action.config?.label_id || null}
          onChange={v => onChange({ ...action, config: { label_id: v } })}
          placeholder="Search or create label…"
          className="w-full" />
      ) : action.type === 'set_assignee' ? (
        <Select value={action.config?.user_id || ''}
          onChange={v => onChange({ ...action, config: { user_id: v } })}
          options={[
            { value: 'reporter', label: 'Ticket reporter' },
            { value: 'none', label: 'Unassign' },
            ...members.map(m => ({ value: m.id, label: m.name })),
          ]}
          placeholder="— select user —" className="w-full" />
      ) : action.type === 'set_priority' ? (
        <Select value={action.config?.priority || ''}
          onChange={v => onChange({ ...action, config: { priority: v } })}
          options={PRIORITIES} placeholder="— select priority —" className="w-full" />
      ) : action.type === 'set_status' ? (
        <Select value={action.config?.status || ''}
          onChange={v => onChange({ ...action, config: { status: v } })}
          options={statuses.map(s => ({ value: s.slug, label: s.name }))}
          placeholder="— select status —" className="w-full" />
      ) : action.type === 'add_comment' ? (
        <textarea value={action.config?.body || ''} rows={2}
          onChange={e => onChange({ ...action, config: { body: e.target.value } })}
          placeholder="Comment text..."
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
      ) : action.type === 'webhook' ? (
        <div className="space-y-1.5">
          <Input value={action.config?.url || ''} onChange={v => onChange({ ...action, config: { ...action.config, url: v } })}
            placeholder="https://your-endpoint.example.com/hook" className="w-full" />
          <Input value={action.config?.secret || ''} onChange={v => onChange({ ...action, config: { ...action.config, secret: v } })}
            placeholder="Secret (optional, sent as X-Webhook-Secret header)" className="w-full" />
        </div>
      ) : null}
    </div>
  );
}

// ─── Automation form ──────────────────────────────────────────────────────────

function AutomationForm({ initial, projectId, members, statuses, onSave, onCancel, isPending }) {
  const [name, setName] = useState(initial?.name || '');
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || '');
  const [triggerConfig, setTriggerConfig] = useState(initial?.trigger_config || {});
  const [conditions, setConditions] = useState(initial?.conditions || []);
  const [actions, setActions] = useState(initial?.actions || []);

  function addCondition() {
    setConditions(c => [...c, { field: 'type', op: 'eq', value: '' }]);
  }
  function addAction() {
    setActions(a => [...a, { type: '', config: {} }]);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !triggerType) return;
    onSave({ name, trigger_type: triggerType, trigger_config: triggerConfig, conditions, actions });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} required
          placeholder="e.g. Assign bugs to QA team on creation"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Trigger *</label>
        <Select value={triggerType} onChange={v => { setTriggerType(v); setTriggerConfig({}); }}
          options={TRIGGER_TYPES} placeholder="— when does this run? —" className="w-full" />
        {triggerType && (
          <TriggerConfig triggerType={triggerType} config={triggerConfig}
            onChange={setTriggerConfig} members={members} statuses={statuses} />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Conditions <span className="font-normal normal-case text-slate-400 ml-1">(optional — all must match)</span>
          </label>
          <button type="button" onClick={addCondition}
            className="text-xs text-indigo-600 hover:text-indigo-500 flex items-center gap-1">
            <Plus size={11} /> Add condition
          </button>
        </div>
        {conditions.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Runs on all tickets. Add conditions to filter.</p>
        ) : (
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <ConditionRow key={i} cond={c}
                onChange={v => setConditions(cs => cs.map((x, j) => j === i ? v : x))}
                onRemove={() => setConditions(cs => cs.filter((_, j) => j !== i))}
                projectId={projectId} members={members} statuses={statuses} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Actions * <span className="font-normal normal-case text-slate-400 ml-1">(run in order)</span>
          </label>
          <button type="button" onClick={addAction}
            className="text-xs text-indigo-600 hover:text-indigo-500 flex items-center gap-1">
            <Plus size={11} /> Add action
          </button>
        </div>
        {actions.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Add at least one action.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a, i) => (
              <ActionRow key={i} action={a} index={i}
                onChange={v => setActions(as => as.map((x, j) => j === i ? v : x))}
                onRemove={() => setActions(as => as.filter((_, j) => j !== i))}
                projectId={projectId} members={members} statuses={statuses} />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit"
          disabled={isPending || !name.trim() || !triggerType || actions.length === 0}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
          {isPending ? 'Saving...' : 'Save automation'}
        </button>
      </div>
    </form>
  );
}

// ─── Automation card ──────────────────────────────────────────────────────────

function AutomationCard({ auto, projectId, members, onEdit, onDelete }) {
  const qc = useQueryClient();
  const [showRuns, setShowRuns] = useState(false);

  const toggle = useMutation({
    mutationFn: () => updateAutomation(projectId, auto.id, { is_active: !auto.is_active }),
    onSuccess: () => qc.invalidateQueries(['automations', projectId]),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['automation-runs', auto.id],
    queryFn: () => getAutomationRuns(projectId, auto.id),
    enabled: showRuns,
  });

  const triggerLabel = TRIGGER_TYPES.find(t => t.value === auto.trigger_type)?.label || auto.trigger_type;

  return (
    <div className={`border rounded-xl overflow-hidden transition-opacity ${auto.is_active ? 'border-slate-100' : 'border-dashed border-slate-200 opacity-60'}`}>
      <div className="bg-white p-4">
        <div className="flex items-start gap-3">
          <Zap size={16} className={`flex-shrink-0 mt-0.5 ${auto.is_active ? 'text-indigo-500' : 'text-slate-300'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-800 text-sm truncate">{auto.name}</span>
              {!auto.is_active && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Disabled</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              <span className="font-medium text-indigo-600">{triggerLabel}</span>
              {auto.conditions?.length > 0 && (
                <span className="ml-2 text-slate-400">· {auto.conditions.length} condition{auto.conditions.length !== 1 ? 's' : ''}</span>
              )}
              {auto.actions?.length > 0 && (
                <span className="ml-2 text-slate-400">· {auto.actions.length} action{auto.actions.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {auto.run_count > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                Ran {auto.run_count} time{auto.run_count !== 1 ? 's' : ''}
                {auto.last_run_at && ` · last ${new Date(auto.last_run_at).toLocaleDateString()}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setShowRuns(s => !s)}
              title="Run history"
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
              <Clock size={13} />
            </button>
            <button onClick={() => onEdit(auto)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors text-xs font-medium px-2">
              Edit
            </button>
            <button onClick={() => toggle.mutate()} title={auto.is_active ? 'Disable' : 'Enable'}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors">
              {auto.is_active ? <ToggleRight size={18} className="text-indigo-500" /> : <ToggleLeft size={18} />}
            </button>
            <button onClick={() => onDelete(auto.id)}
              className="p-1.5 text-slate-300 hover:text-red-400 rounded transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {showRuns && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500 mb-2">Recent runs</div>
          {runs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No runs yet</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {runs.slice(0, 20).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  {r.status === 'success' && <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />}
                  {r.status === 'failed' && <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                  {r.status === 'skipped' && <MinusCircle size={12} className="text-slate-400 flex-shrink-0" />}
                  <span className="text-slate-500 font-mono">{r.ticket_key || 'unknown'}</span>
                  <span className="text-slate-400 truncate flex-1">{r.ticket_title}</span>
                  <span className="text-slate-400 flex-shrink-0">{new Date(r.ran_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Transition diagram ───────────────────────────────────────────────────────

const D_NW = 88, D_NH = 28, D_HGAP = 22, D_VGAP = 56, D_PER_ROW = 5;

function buildNodePositions(statuses) {
  const rows = [];
  for (let i = 0; i < statuses.length; i += D_PER_ROW) rows.push(statuses.slice(i, i + D_PER_ROW));
  const maxCols = Math.min(statuses.length, D_PER_ROW);
  const svgW = Math.max(maxCols * (D_NW + D_HGAP) - D_HGAP + 40, 300);
  const svgH = rows.length * (D_NH + D_VGAP) - D_VGAP + 60;
  const pos = {};
  rows.forEach((row, ri) => {
    const rowW = row.length * (D_NW + D_HGAP) - D_HGAP;
    const startX = (svgW - rowW) / 2;
    row.forEach((s, ci) => {
      pos[s.slug] = { x: startX + ci * (D_NW + D_HGAP), y: 20 + ri * (D_NH + D_VGAP), color: s.color };
    });
  });
  return { pos, svgW, svgH };
}

function diagramArrowPath(from, to, pos, specific) {
  const fn = pos[from], tn = pos[to];
  if (!fn || !tn) return null;
  const fcx = fn.x + D_NW / 2, fcy = fn.y + D_NH / 2;
  const tcx = tn.x + D_NW / 2, tcy = tn.y + D_NH / 2;
  const dx = tcx - fcx, dy = tcy - fcy;
  const sameRow = Math.abs(dy) < 15;
  const sameCol = Math.abs(dx) < 15;
  const hasReverse = specific.some(t => t.from_status === to && t.to_status === from);

  if (sameRow && dx > 0) {
    const yOff = hasReverse ? 6 : 0;
    return `M ${fn.x + D_NW} ${fcy + yOff} L ${tn.x} ${tcy + yOff}`;
  }
  if (sameRow && dx < 0) {
    const dist = Math.abs(tcx - fcx);
    const ctrlY = fn.y - Math.min(50, 20 + dist * 0.06);
    return `M ${fcx} ${fn.y} C ${fcx} ${ctrlY}, ${tcx} ${ctrlY}, ${tcx} ${tn.y}`;
  }
  if (sameCol && dy > 0) {
    const xOff = hasReverse ? -10 : 0;
    return `M ${fcx + xOff} ${fn.y + D_NH} L ${tcx + xOff} ${tn.y}`;
  }
  if (sameCol && dy < 0) {
    const xOff = hasReverse ? 10 : 0;
    return `M ${fcx + xOff} ${fn.y} L ${tcx + xOff} ${tn.y + D_NH}`;
  }
  const angle = Math.atan2(dy, dx);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const λ = Math.min(
    Math.abs(cosA) > 0.01 ? (D_NW / 2) / Math.abs(cosA) : 9999,
    Math.abs(sinA) > 0.01 ? (D_NH / 2) / Math.abs(sinA) : 9999
  );
  return `M ${fcx + λ * cosA} ${fcy + λ * sinA} L ${tcx - λ * cosA} ${tcy - λ * sinA}`;
}

function TransitionDiagram({ transitions, statusLabels = {}, statuses = [] }) {
  const specific = transitions.filter(t => t.from_status !== 'any');
  const anyTrans  = transitions.filter(t => t.from_status === 'any');
  const { pos, svgW, svgH } = buildNodePositions(statuses);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Transition flow</span>
      </div>
      <div className="p-3 pb-2">
        {transitions.length === 0 ? (
          <div className="text-center text-slate-400 text-xs py-5 italic">
            No transitions configured — check boxes below to build your workflow.
          </div>
        ) : statuses.length > 0 && (
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ height: 'auto', maxHeight: 220 }}>
            <defs>
              <marker id="wf-arrow" viewBox="0 0 8 8" refX="8" refY="4"
                markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#6366f1" fillOpacity="0.75" />
              </marker>
            </defs>

            {specific.map(t => {
              const d = diagramArrowPath(t.from_status, t.to_status, pos, specific);
              if (!d) return null;
              return (
                <path key={`${t.from_status}-${t.to_status}`}
                  d={d} fill="none"
                  stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.6"
                  markerEnd="url(#wf-arrow)" />
              );
            })}

            {statuses.map(s => {
              const n = pos[s.slug];
              if (!n) return null;
              return (
                <g key={s.slug}>
                  <rect x={n.x} y={n.y} width={D_NW} height={D_NH} rx={6}
                    fill="white" stroke={n.color} strokeWidth="1.5" />
                  <text x={n.x + D_NW / 2} y={n.y + D_NH / 2 + 4}
                    textAnchor="middle" fontSize="10" fontWeight="600"
                    fill={n.color} style={{ userSelect: 'none' }}>
                    {s.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {anyTrans.length > 0 && (
          <div className="flex items-center gap-2 mt-1 flex-wrap px-1">
            <span className="text-[10px] text-slate-400 font-medium">From any status:</span>
            {anyTrans.map(t => (
              <span key={t.to_status}
                className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                → {statusLabels[t.to_status] || t.to_status}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow tab ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  backlog:     'bg-slate-100 text-slate-600',
  todo:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  in_review:   'bg-purple-100 text-purple-700',
  blocked:     'bg-red-100 text-red-700',
  done:        'bg-emerald-100 text-emerald-700',
};

const BASIC_TRANSITIONS = [
  { from: 'backlog',      to: 'todo' },
  { from: 'todo',         to: 'in_progress' },
  { from: 'in_progress',  to: 'in_review' },
  { from: 'in_progress',  to: 'blocked' },
  { from: 'in_progress',  to: 'done' },
  { from: 'in_review',    to: 'done' },
  { from: 'in_review',    to: 'in_progress' },
  { from: 'blocked',      to: 'in_progress' },
  { from: 'done',         to: 'backlog' },
  { from: 'done',         to: 'todo' },
];

function WorkflowTab({ projectId, statuses }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(new Set());

  const wfTo = statuses.map(s => s.slug);
  const wfFrom = [...wfTo, 'any'];
  const statusLabelMap = Object.fromEntries([
    ...statuses.map(s => [s.slug, s.name]),
    ['any', 'Any status'],
  ]);
  const statusColorMap = Object.fromEntries([
    ...statuses.map(s => [s.slug, CATEGORY_COLORS[s.category] || 'bg-slate-100 text-slate-600']),
    ['any', 'bg-slate-100 text-slate-500'],
  ]);

  const { data: wfData, isLoading } = useQuery({
    queryKey: ['workflow', projectId],
    queryFn: () => getWorkflow(projectId),
    enabled: !!projectId,
  });

  const createWf = useMutation({
    mutationFn: async () => {
      await createWorkflow(projectId, { name: 'Default Workflow', is_enforced: false });
      await Promise.all(
        BASIC_TRANSITIONS.map(t => addTransition(projectId, { from_status: t.from, to_status: t.to }))
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', projectId] }),
  });

  const toggleEnforce = useMutation({
    mutationFn: (is_enforced) => updateWorkflowSettings(projectId, { is_enforced }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', projectId] }),
  });

  const applyBasics = useMutation({
    mutationFn: async (transitions) => {
      // Add missing basics, remove non-basics
      const basics = new Set(BASIC_TRANSITIONS.map(b => `${b.from}→${b.to}`));
      const existing = new Set(transitions.map(t => `${t.from_status}→${t.to_status}`));

      const toAdd = BASIC_TRANSITIONS.filter(b => !existing.has(`${b.from}→${b.to}`));
      const toRemove = transitions.filter(t => !basics.has(`${t.from_status}→${t.to_status}`));

      await Promise.all([
        ...toAdd.map(b => addTransition(projectId, { from_status: b.from, to_status: b.to })),
        ...toRemove.map(t => deleteTransition(projectId, t.id)),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', projectId] }),
  });

  async function toggle(from, to, transitions) {
    const key = `${from}→${to}`;
    if (pending.has(key)) return;
    setPending(s => new Set([...s, key]));
    try {
      const existing = transitions.find(t => t.from_status === from && t.to_status === to);
      if (existing) {
        await deleteTransition(projectId, existing.id);
      } else {
        await addTransition(projectId, { from_status: from, to_status: to });
      }
      qc.invalidateQueries({ queryKey: ['workflow', projectId] });
    } finally {
      setPending(s => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  if (isLoading) return <div className="text-slate-400 text-sm text-center py-12">Loading...</div>;

  const { workflow, transitions = [] } = wfData || {};

  if (!workflow) {
    return (
      <div className="text-center py-12">
        <GitBranch size={32} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium mb-1">No workflow configured</p>
        <p className="text-slate-400 text-sm mb-4 max-w-sm mx-auto">
          Without a workflow, any status transition is allowed. Create one to control which moves are permitted — basic transitions will be pre-checked.
        </p>
        <button onClick={() => createWf.mutate()} disabled={createWf.isPending}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium disabled:opacity-40">
          {createWf.isPending ? 'Creating...' : 'Create workflow'}
        </button>
      </div>
    );
  }

  const checked = new Set(transitions.map(t => `${t.from_status}→${t.to_status}`));
  const isBasic = (from, to) => BASIC_TRANSITIONS.some(b => b.from === from && b.to === to);

  return (
    <div className="space-y-5">
      {/* Header / settings */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{workflow.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {transitions.length === 0
                ? 'No transitions defined — all status changes are allowed'
                : `${transitions.length} transition${transitions.length !== 1 ? 's' : ''} defined`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyBasics.mutate(transitions)}
              disabled={applyBasics.isPending}
              title="Reset to recommended transitions"
              className="text-xs text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
              {applyBasics.isPending ? 'Resetting…' : 'Reset to recommended'}
            </button>
            <button
              onClick={() => toggleEnforce.mutate(!workflow.is_enforced)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                workflow.is_enforced
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {workflow.is_enforced ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {workflow.is_enforced ? 'Enforced' : 'Advisory only'}
            </button>
          </div>
        </div>
        {workflow.is_enforced && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Enforcement mode: only checked transitions are permitted — unchecked moves will be rejected by the API.
          </div>
        )}
      </div>

      {/* Flow diagram */}
      <TransitionDiagram transitions={transitions} statusLabels={statusLabelMap} statuses={statuses} />

      {/* Transition matrix */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">Allowed transitions</div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Allowed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-slate-200 inline-block" /> Blocked
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-100 inline-block" /> Recommended
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {/* Corner cell */}
                <th className="bg-slate-50 px-3 py-2.5 text-left border-b border-r border-slate-100 min-w-[100px]">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">From \ To →</span>
                </th>
                {wfTo.map(to => (
                  <th key={to} className="bg-slate-50 px-2 py-2.5 border-b border-r border-slate-100 text-center min-w-[72px]">
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColorMap[to] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabelMap[to] || to}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wfFrom.map((from) => (
                <tr key={from} className={`${from === 'any' ? 'border-t-2 border-slate-200' : ''}`}>
                  <td className={`px-3 py-2 border-b border-r border-slate-100 ${from === 'any' ? 'bg-slate-50/60' : ''}`}>
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColorMap[from] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabelMap[from] || from}
                    </span>
                  </td>
                  {wfTo.map(to => {
                    const isSelf = from === to;
                    const key = `${from}→${to}`;
                    const isChecked = checked.has(key);
                    const isPending = pending.has(key);
                    const basic = isBasic(from, to);

                    return (
                      <td key={to}
                        className={`border-b border-r border-slate-100 text-center p-0 ${from === 'any' ? 'bg-slate-50/40' : ''}`}>
                        {isSelf ? (
                          <div className="w-full h-full flex items-center justify-center py-2.5">
                            <span className="text-slate-200 text-base">—</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(from, to, transitions)}
                            disabled={isPending}
                            title={`${statusLabelMap[from] || from} → ${statusLabelMap[to] || to}${basic ? ' (recommended)' : ''}`}
                            className={`w-full py-2.5 flex items-center justify-center transition-colors ${
                              isPending ? 'opacity-40' : 'hover:bg-slate-50'
                            }`}>
                            <span className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                              isChecked
                                ? 'bg-indigo-600 border-indigo-600 border'
                                : basic
                                ? 'bg-indigo-50 border border-indigo-200'
                                : 'border border-slate-200 bg-white'
                            }`}>
                              {isChecked && (
                                <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {!isChecked && basic && (
                                <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 text-[10px] text-slate-400">
          The last row ("Any status") allows a transition from any current status to the destination. Recommended transitions are shown with a light blue background when unchecked.
        </div>
      </div>
    </div>
  );
}

// ─── API keys tab ─────────────────────────────────────────────────────────────

function ApiKeysTab({ projectId }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [expiresIn, setExpiresIn] = useState('');
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: tokens = [] } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: getTokens,
  });

  // Filter to tokens for this project or unrestricted
  const projectTokens = tokens.filter(t => !t.project_id || t.project_id === projectId);

  const create = useMutation({
    mutationFn: () => createToken({
      name: newName,
      project_id: projectId,
      expires_in_days: expiresIn ? parseInt(expiresIn) : undefined,
    }),
    onSuccess: (data) => {
      const { token: rawToken, ...meta } = data;
      // Immediately add to cache so it shows without waiting for refetch
      qc.setQueryData(['api-tokens'], (old = []) => [meta, ...(old || [])]);
      qc.invalidateQueries({ queryKey: ['api-tokens'] });
      setNewToken(rawToken);
      setShowCreate(false);
      setNewName('');
    },
  });

  const revoke = useMutation({
    mutationFn: (id) => deleteToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  function copyToken() {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-5">
      {/* New token revealed */}
      {newToken && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Token created — copy it now!</span>
          </div>
          <p className="text-xs text-emerald-700 mb-3">This is the only time this token will be shown.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 break-all">
              {newToken}
            </code>
            <button onClick={copyToken}
              className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-500 font-medium flex-shrink-0">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="text-xs text-emerald-600 mt-2 underline">
            I've saved it, close this
          </button>
        </div>
      )}

      {/* How to use */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">Using API tokens</h3>
        <p className="text-xs text-slate-500 mb-3">
          Use these tokens to access the Canopy API from external scripts, AI agents, or automation tools.
          Pass the token as a Bearer header:
        </p>
        <code className="block bg-slate-800 text-green-400 text-xs rounded-lg p-3 font-mono">
          {`Authorization: Bearer tf_your_token_here`}
        </code>
        <p className="text-xs text-slate-500 mt-3">
          Example — close a ticket via curl:
        </p>
        <code className="block bg-slate-800 text-green-400 text-xs rounded-lg p-3 font-mono mt-1 whitespace-pre">
{`curl -X PATCH https://your-domain/api/tickets/<ticket-id> \\
  -H "Authorization: Bearer tf_..." \\
  -H "Content-Type: application/json" \\
  -d '{"status":"done"}'`}
        </code>
        <p className="text-xs text-slate-400 mt-3">
          Webhooks receive a POST with event payload when automations fire. Your endpoint can then
          call back into the API to perform further actions — perfect for AI agents.
        </p>
      </div>

      {/* Token list */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Your tokens ({projectTokens.length})
          </div>
          <button onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium">
            <Plus size={12} /> New token
          </button>
        </div>

        {showCreate && (
          <div className="px-4 py-3 border-b border-indigo-50 bg-indigo-50/30 space-y-2">
            <div className="flex gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Token name (e.g. CI pipeline, AI agent)"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
              <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-300">
                <option value="">No expiry</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
              <button onClick={() => newName.trim() && create.mutate()}
                disabled={!newName.trim() || create.isPending}
                className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-40 font-medium">
                {create.isPending ? '...' : 'Generate'}
              </button>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {projectTokens.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-sm italic">
            No tokens yet. Create one to allow external access.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Prefix</th>
                <th className="text-left px-4 py-2.5 font-semibold">Last used</th>
                <th className="text-left px-4 py-2.5 font-semibold">Expires</th>
                <th className="w-10 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projectTokens.map(t => (
                <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50 group">
                  <td className="px-4 py-2.5 font-medium text-slate-800 text-xs">{t.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{t.token_prefix}…</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => confirm('Revoke this token?') && revoke.mutate(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'automations', label: 'Automations', icon: Zap },
  { key: 'workflow',    label: 'Workflow',    icon: GitBranch },
  { key: 'api',        label: 'API & Integrations', icon: Key },
];

export default function AutomationsPage() {
  const { projectKey } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState('automations');
  const [showForm, setShowForm] = useState(false);
  const [editAuto, setEditAuto] = useState(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const project = projects.find(p => p.key === projectKey);
  const projectId = project?.id;

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => getProjectStatuses(projectId),
    enabled: !!projectId,
  });

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations', projectId],
    queryFn: () => getAutomations(projectId),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: (data) => createAutomation(projectId, data),
    onSuccess: () => { qc.invalidateQueries(['automations', projectId]); setShowForm(false); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }) => updateAutomation(projectId, id, data),
    onSuccess: () => { qc.invalidateQueries(['automations', projectId]); setEditAuto(null); },
  });

  const remove = useMutation({
    mutationFn: (id) => deleteAutomation(projectId, id),
    onSuccess: () => qc.invalidateQueries(['automations', projectId]),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-800">Automations</h1>
            {project && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                {project.name}
              </span>
            )}
          </div>
          {tab === 'automations' && (
            <button
              onClick={() => { setShowForm(true); setEditAuto(null); }}
              className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium">
              <Plus size={14} /> New automation
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'automations' && (
          <div className="space-y-4">
            {/* Create/edit form */}
            {(showForm || editAuto) && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">
                    {editAuto ? 'Edit automation' : 'New automation'}
                  </h3>
                  <button onClick={() => { setShowForm(false); setEditAuto(null); }}
                    className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
                <AutomationForm
                  initial={editAuto}
                  projectId={projectId}
                  members={members}
                  statuses={statuses}
                  onSave={(data) => editAuto
                    ? update.mutate({ id: editAuto.id, ...data })
                    : create.mutate(data)
                  }
                  onCancel={() => { setShowForm(false); setEditAuto(null); }}
                  isPending={create.isPending || update.isPending}
                />
              </div>
            )}

            {isLoading ? (
              <div className="text-slate-400 text-sm text-center py-12">Loading automations...</div>
            ) : automations.length === 0 ? (
              <div className="text-center py-16">
                <Zap size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium mb-1">No automations yet</p>
                <p className="text-slate-400 text-sm mb-4">
                  Set up rules that run automatically when tickets change — add labels, assign users, call webhooks, and more.
                </p>
                <button onClick={() => setShowForm(true)}
                  className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 font-medium">
                  Create first automation
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {automations.map(auto => (
                  <AutomationCard key={auto.id} auto={auto} projectId={projectId}
                    members={members}
                    onEdit={(a) => { setEditAuto(a); setShowForm(false); }}
                    onDelete={(id) => confirm('Delete this automation?') && remove.mutate(id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'workflow' && projectId && <WorkflowTab projectId={projectId} statuses={statuses} />}
        {tab === 'api' && projectId && <ApiKeysTab projectId={projectId} />}
      </div>
    </div>
  );
}
