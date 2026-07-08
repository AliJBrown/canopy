import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Trash2, Plus, ExternalLink, ChevronRight, Pencil, Paperclip, Download, Image, FileText, AlertCircle, Link } from 'lucide-react';
import { getTicket, updateTicket, deleteTicket, createTicket, getTickets } from '../api/tickets';
import { getDependencies, addDependency, removeDependency } from '../api/dependencies';
import { getComments, createComment, deleteComment } from '../api/comments';
import { getActivity } from '../api/activity';
import { getAttachments, uploadAttachment, deleteAttachment } from '../api/attachments';
import { getSprints } from '../api/sprints';
import { getLabels, createLabel, updateLabel, deleteLabel } from '../api/labels';
import { getFields, upsertFieldValues } from '../api/fields';
import { getProjectMembers } from '../api/admin';
import { useApp } from '../context/AppContext';
import { useProjectPermissions } from '../hooks/useProjectPermissions';
import { TypeBadge, StatusBadge, Avatar, STATUS_OPTIONS, TYPE_OPTIONS, PRIORITY_OPTIONS } from './Badge';
import TimeTracker from './TimeTracker';

const PRESET_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#f97316'];

function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy link"
      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors relative">
      {copied ? <span className="text-[10px] font-medium text-indigo-600 absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white border border-indigo-100 rounded px-1.5 py-0.5 shadow-sm">Copied!</span> : null}
      <Link size={15} />
    </button>
  );
}

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      {children}
    </div>
  );
}

function ReadOnly({ value, fallback = '—' }) {
  return <div className="text-sm text-slate-700">{value || <span className="text-slate-400 italic">{fallback}</span>}</div>;
}

function InlineSelect({ value, options, onChange, disabled }) {
  if (disabled) {
    const opt = options.find(o => o.value === value);
    return <ReadOnly value={opt?.label} />;
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Self-contained label picker — create, edit, delete inline
function LabelPicker({ projectId, ticketLabels = [], onUpdate, canWrite, canManageProject }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const ref = useRef(null);
  const close = useCallback(() => { setOpen(false); setCreating(false); setEditId(null); }, []);
  useClickOutside(ref, close);

  const { data: allLabels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  });

  const createMut = useMutation({
    mutationFn: () => createLabel(projectId, { name: newName.trim(), color: newColor }),
    onSuccess: (label) => {
      qc.invalidateQueries(['labels', projectId]);
      onUpdate([...new Set([...ticketLabels.map(l => l.id), label.id])]);
      setNewName(''); setNewColor(PRESET_COLORS[0]); setCreating(false);
    },
  });
  const editMut = useMutation({
    mutationFn: () => updateLabel(projectId, editId, editData),
    onSuccess: () => { qc.invalidateQueries(['labels', projectId]); setEditId(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteLabel(projectId, id),
    onSuccess: () => qc.invalidateQueries(['labels', projectId]),
  });

  const selectedIds = new Set(ticketLabels.map(l => l.id));
  const toggle = (labelId) => {
    const next = selectedIds.has(labelId)
      ? [...selectedIds].filter(id => id !== labelId)
      : [...selectedIds, labelId];
    onUpdate(next);
  };

  // Read-only for viewers
  if (!canWrite) {
    return (
      <div className="flex flex-wrap gap-1 min-h-[24px]">
        {ticketLabels.length === 0
          ? <span className="text-xs text-slate-400 italic">None</span>
          : ticketLabels.map(l => (
              <span key={l.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: l.color + '22', color: l.color, border: `1px solid ${l.color}44` }}>
                {l.name}
              </span>
            ))
        }
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
        {ticketLabels.map(l => (
          <button key={l.id} onClick={() => toggle(l.id)}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
            style={{ background: l.color + '22', color: l.color, border: `1px solid ${l.color}44` }}
            title="Click to remove">
            {l.name} ×
          </button>
        ))}
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-indigo-600 px-1.5 py-0.5 rounded-full hover:bg-indigo-50 transition-colors">
          <Plus size={10} /> {ticketLabels.length === 0 ? 'Add label' : ''}
        </button>
      </div>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl shadow-lg border border-slate-100 w-52 py-1 max-h-72 overflow-y-auto">
          {allLabels.length === 0 && !creating && (
            <div className="px-3 py-2 text-xs text-slate-400 italic">No labels yet.</div>
          )}
          {allLabels.map(l => {
            const sel = selectedIds.has(l.id);
            if (editId === l.id) {
              return (
                <div key={l.id} className="px-3 py-2 space-y-1.5 bg-slate-50 border-b border-slate-100">
                  <input value={editData.name ?? l.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                    autoFocus className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                  <div className="flex gap-1">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setEditData(d => ({ ...d, color: c }))}
                        className={`w-4 h-4 rounded-full border-2 ${(editData.color ?? l.color) === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => editMut.mutate()} disabled={editMut.isPending}
                      className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">Save</button>
                    <button onClick={() => setEditId(null)} className="text-[10px] text-slate-500 px-2 py-0.5 rounded hover:bg-slate-100">Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 group">
                <input type="checkbox" checked={sel} onChange={() => toggle(l.id)} className="accent-indigo-600 rounded flex-shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                <span className="text-xs text-slate-700 flex-1 truncate">{l.name}</span>
                {canManageProject && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <button onClick={e => { e.stopPropagation(); setEditId(l.id); setEditData({ name: l.name, color: l.color }); }}
                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded">
                      <Pencil size={10} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); if (confirm(`Delete label "${l.name}"?`)) deleteMut.mutate(l.id); }}
                      className="p-0.5 text-slate-400 hover:text-red-500 rounded">
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {creating ? (
            <div className="px-3 py-2 space-y-1.5 border-t border-slate-100">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Label name"
                autoFocus onKeyDown={e => e.key === 'Enter' && newName.trim() && createMut.mutate()}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
              <div className="flex gap-1">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-4 h-4 rounded-full border-2 ${newColor === c ? 'border-slate-600 scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => newName.trim() && createMut.mutate()} disabled={!newName.trim() || createMut.isPending}
                  className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">
                  {createMut.isPending ? '...' : 'Create'}
                </button>
                <button onClick={() => setCreating(false)} className="text-[10px] text-slate-500 px-2 py-0.5 rounded hover:bg-slate-100">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-indigo-600 border-t border-slate-100 transition-colors">
              <Plus size={11} /> Create new label
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CustomFieldsSection({ ticketId, projectId, customFieldValues = {}, canWrite }) {
  const qc = useQueryClient();
  const [localValues, setLocalValues] = useState({});

  const { data: fields = [] } = useQuery({
    queryKey: ['fields', projectId],
    queryFn: () => getFields(projectId),
    enabled: !!projectId,
  });

  useEffect(() => { setLocalValues(customFieldValues); }, [JSON.stringify(customFieldValues)]);

  const upsertMut = useMutation({
    mutationFn: (values) => upsertFieldValues(projectId, ticketId, values),
    onSuccess: () => qc.invalidateQueries(['ticket', ticketId]),
  });

  const handleChange = (fieldId, value) => {
    const next = { ...localValues, [fieldId]: value };
    setLocalValues(next);
    upsertMut.mutate(next);
  };

  if (!fields.length) return null;

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom Fields</div>
      {fields.map(f => (
        <div key={f.id}>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{f.name}</div>
          {!canWrite ? (
            <ReadOnly value={localValues[f.id]} />
          ) : f.field_type === 'select' ? (
            <select value={localValues[f.id] || ''} onChange={e => handleChange(f.id, e.target.value)}
              className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
              <option value="">—</option>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.field_type === 'date' ? (
            <input type="date" value={localValues[f.id] || ''} onChange={e => handleChange(f.id, e.target.value)}
              className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
          ) : f.field_type === 'number' ? (
            <input type="number" value={localValues[f.id] || ''} onChange={e => handleChange(f.id, e.target.value)}
              placeholder="—" className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
          ) : f.field_type === 'url' ? (
            <div>
              <input type="url" value={localValues[f.id] || ''} onChange={e => handleChange(f.id, e.target.value)}
                placeholder="https://..." className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
              {localValues[f.id] && (
                <a href={localValues[f.id]} target="_blank" rel="noreferrer"
                  className="text-[10px] text-indigo-500 hover:underline flex items-center gap-1 mt-0.5">
                  <ExternalLink size={9} /> Open link
                </a>
              )}
            </div>
          ) : (
            <input type="text" value={localValues[f.id] || ''} onChange={e => handleChange(f.id, e.target.value)}
              placeholder="—" className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
          )}
        </div>
      ))}
    </div>
  );
}

// Parse @[userId:name] tokens in comment body into highlighted spans
function renderCommentBody(body) {
  if (!body) return null;
  const parts = body.split(/(@\[[a-f0-9-]{36}:[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^@\[([a-f0-9-]{36}):([^\]]+)\]$/);
    if (m) {
      return (
        <span key={i} className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs font-semibold rounded px-1 py-0.5 mx-0.5">
          @{m[2]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Textarea with @mention autocomplete
function MentionTextarea({ value, onChange, onSubmit, members, placeholder, rows = 3 }) {
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef(null);
  const popoverRef = useRef(null);

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(mentionSearch.toLowerCase())
  ).slice(0, 6);

  const handleChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    // Find the @-word ending at cursor
    const before = val.slice(0, pos);
    const match = before.match(/@([^@\s]*)$/);
    if (match) {
      setMentionStart(before.length - match[0].length);
      setMentionSearch(match[1]);
      setShowMention(true);
    } else {
      setShowMention(false);
      setMentionSearch('');
      setMentionStart(-1);
    }
    onChange(val);
  };

  const insertMention = (member) => {
    if (mentionStart < 0) return;
    const pos = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(pos);
    const token = `@[${member.id}:${member.name}]`;
    const next = before + token + ' ' + after;
    onChange(next);
    setShowMention(false);
    setMentionSearch('');
    setMentionStart(-1);
    // Restore focus
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + token.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (showMention && (e.key === 'Escape')) { setShowMention(false); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && value.trim()) onSubmit?.();
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-sm border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
      />
      {showMention && filteredMembers.length > 0 && (
        <div ref={popoverRef}
          className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 min-w-[160px]">
          {filteredMembers.map(m => (
            <button key={m.id} onMouseDown={e => { e.preventDefault(); insertMention(m); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
              <Avatar user={m} size="xs" />
              {m.name}
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] text-slate-400 border-t border-slate-100 mt-0.5">
            Type to filter · Esc to close
          </div>
        </div>
      )}
    </div>
  );
}

// Drag-and-drop file attachments section
function AttachmentsSection({ ticketId, canWrite }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', ticketId],
    queryFn: () => getAttachments(ticketId),
    enabled: !!ticketId,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteAttachment(ticketId, id),
    onSuccess: () => qc.invalidateQueries(['attachments', ticketId]),
  });

  const doUpload = async (files) => {
    if (!files?.length) return;
    setUploadError('');
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          setUploadError(`${file.name} exceeds 25MB limit`);
          continue;
        }
        await uploadAttachment(ticketId, file);
      }
      qc.invalidateQueries(['attachments', ticketId]);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isImage = (ct) => ct?.startsWith('image/');

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip size={13} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attachments</span>
        {attachments.length > 0 && (
          <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 font-semibold">{attachments.length}</span>
        )}
        {canWrite && (
          <button onClick={() => fileRef.current?.click()}
            className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            <Plus size={12} /> Add file
          </button>
        )}
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={e => doUpload(e.target.files)} />
      </div>

      {uploadError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">
          <AlertCircle size={12} /> {uploadError}
        </div>
      )}

      {uploading && (
        <div className="text-xs text-slate-400 italic mb-2">Uploading...</div>
      )}

      {/* Drop zone (only when canWrite and no files yet) */}
      {canWrite && attachments.length === 0 && !uploading && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); doUpload(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Paperclip size={20} className="mx-auto text-slate-300 mb-1" />
          <p className="text-xs text-slate-400">Drop files here or click to upload</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Max 25MB per file</p>
        </div>
      )}

      {/* Drop overlay when files exist */}
      {canWrite && attachments.length > 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); doUpload(e.dataTransfer.files); }}
          className={`transition-all ${isDragging ? 'ring-2 ring-indigo-400 ring-offset-2 rounded-lg' : ''}`}
        >
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 group transition-colors">
                {isImage(att.content_type)
                  ? <img src={att.url} alt={att.original_name}
                      className="w-10 h-10 object-cover rounded border border-slate-200 flex-shrink-0" />
                  : (
                    <div className="w-10 h-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-slate-400" />
                    </div>
                  )
                }
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{att.original_name}</div>
                  <div className="text-[10px] text-slate-400">
                    {att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : ''}
                    {att.uploader?.name && ` · ${att.uploader.name}`}
                  </div>
                </div>
                <a href={att.url} download={att.original_name} target="_blank" rel="noreferrer"
                  className="p-1.5 text-slate-300 hover:text-indigo-500 rounded transition-colors flex-shrink-0">
                  <Download size={13} />
                </a>
                {canWrite && (
                  <button onClick={() => deleteMut.mutate(att.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-400 rounded transition-colors flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isDragging && (
            <div className="mt-2 text-center text-xs text-indigo-500 py-2 border-2 border-dashed border-indigo-300 rounded-lg bg-indigo-50">
              Drop to upload
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DEP_LABELS = {
  blocking:   { label: 'Blocks',      empty: 'Not blocking any tickets' },
  blocked_by: { label: 'Blocked by',  empty: 'No blockers' },
  relates_to: { label: 'Related',     empty: 'No related tickets' },
};
const DEP_TYPE_MAP = { blocking: 'blocks', blocked_by: 'blocks', relates_to: 'relates_to' };

function DependenciesSection({ ticketId, projectId, canWrite, onTicketClick }) {
  const qc = useQueryClient();
  const [addingType, setAddingType] = useState(null);
  const [search, setSearch] = useState('');

  const { data: deps } = useQuery({
    queryKey: ['dependencies', ticketId],
    queryFn: () => getDependencies(ticketId),
    enabled: !!ticketId,
  });

  const { data: searchResults } = useQuery({
    queryKey: ['tickets', 'dep-search', projectId, search],
    queryFn: () => getTickets({ projectId, search, limit: 8 }),
    enabled: !!search && search.length >= 2,
  });

  const addMut = useMutation({
    mutationFn: ({ dependency_id, type }) => addDependency(ticketId, dependency_id, type),
    onSuccess: () => {
      qc.invalidateQueries(['dependencies', ticketId]);
      setAddingType(null);
      setSearch('');
    },
  });

  const removeMut = useMutation({
    mutationFn: (depId) => removeDependency(ticketId, depId),
    onSuccess: () => qc.invalidateQueries(['dependencies', ticketId]),
  });

  const allDeps = [
    ...(deps?.blocking   || []).map(t => ({ ...t, _group: 'blocking' })),
    ...(deps?.blocked_by || []).map(t => ({ ...t, _group: 'blocked_by' })),
    ...(deps?.relates_to || []).map(t => ({ ...t, _group: 'relates_to' })),
  ];
  const hasDeps = allDeps.length > 0;

  if (!hasDeps && !canWrite) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dependencies</div>
        {canWrite && (
          <div className="flex items-center gap-1">
            {['blocking', 'blocked_by', 'relates_to'].map(t => (
              <button key={t} onClick={() => { setAddingType(t); setSearch(''); }}
                className="text-[10px] text-indigo-600 hover:text-indigo-500 border border-indigo-200 hover:bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                + {DEP_LABELS[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Typeahead search to add dependency */}
      {addingType && (
        <div className="mb-2 relative">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search tickets to add as "${DEP_LABELS[addingType].label}"…`}
            className="w-full text-sm border border-indigo-300 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300"
          />
          {searchResults?.tickets?.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searchResults.tickets.filter(t => t.id !== ticketId).map(t => (
                <button key={t.id}
                  onClick={() => addMut.mutate({ dependency_id: t.id, type: DEP_TYPE_MAP[addingType] })}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2 text-sm">
                  <span className="text-[11px] font-mono text-slate-400">{t.ticket_key}</span>
                  <span className="text-slate-700 truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setAddingType(null); setSearch(''); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Grouped dependency list */}
      {(['blocking', 'blocked_by', 'relates_to']).map(group => {
        const items = deps?.[group] || [];
        if (!items.length) return null;
        return (
          <div key={group} className="mb-2">
            <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{DEP_LABELS[group].label}</div>
            <div className="space-y-1">
              {items.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1 px-2 bg-slate-50 rounded-lg group/dep">
                  <span className="text-[11px] font-mono text-slate-400">{t.ticket_key}</span>
                  <button onClick={() => onTicketClick(t.id)}
                    className="text-sm text-slate-700 hover:text-indigo-600 truncate flex-1 text-left">
                    {t.title}
                  </button>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    t.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                  }`}>{t.status}</span>
                  {canWrite && (
                    <button onClick={() => removeMut.mutate(t.dep_id)}
                      className="opacity-0 group-hover/dep:opacity-100 text-slate-300 hover:text-red-400 transition-opacity">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TicketPanel({ ticketId, projectId, projectRole, onClose, onTicketChange, statuses = [] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useApp();
  const { canWrite, canDelete, canManageProject } = useProjectPermissions({ id: projectId, my_role: projectRole });

  const [commentBody, setCommentBody] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskType, setSubtaskType] = useState('task');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => getTicket(ticketId),
    enabled: !!ticketId,
  });

  const [activityFilter, setActivityFilter] = useState('all'); // 'all' | 'comments'

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: () => getComments(ticketId),
    enabled: !!ticketId,
  });

  const { data: activityEvents = [] } = useQuery({
    queryKey: ['activity', ticketId],
    queryFn: () => getActivity(ticketId),
    enabled: !!ticketId,
  });

  // Only project members with role != viewer are assignable
  const { data: projectMembers = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  });
  const assignableUsers = projectMembers.filter(m => m.role !== 'viewer');
  // Always include the current assignee so their name shows even if they became a viewer
  const assigneeInList = assignableUsers.some(u => u.id === ticket?.assignee_id);
  const assigneeOptions = assigneeInList || !ticket?.assignee_id
    ? assignableUsers
    : [...assignableUsers, projectMembers.find(m => m.id === ticket.assignee_id)].filter(Boolean);

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => getSprints(projectId),
    enabled: !!projectId,
  });
  const activeSprints = sprints.filter(s => s.status !== 'completed');

  const { data: siblings = [] } = useQuery({
    queryKey: ['tickets', { projectId }],
    queryFn: async () => { const res = await getTickets({ projectId }); return res.tickets || res; },
    enabled: !!projectId && canWrite,
  });

  const update = useMutation({
    mutationFn: (data) => updateTicket(ticketId, data),
    onSuccess: (updated) => {
      setUpdateError('');
      qc.setQueryData(['ticket', ticketId], old => ({ ...old, ...updated }));
      qc.invalidateQueries(['tickets']);
      onTicketChange?.();
    },
    onError: (err) => {
      setUpdateError(err?.error || 'Failed to update ticket.');
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteTicket(ticketId),
    onSuccess: () => { qc.invalidateQueries(['tickets']); onClose(); },
  });

  const addSubtask = useMutation({
    mutationFn: (title) => createTicket({ project_id: projectId, title, type: subtaskType, parent_id: ticketId }),
    onSuccess: () => {
      qc.invalidateQueries(['ticket', ticketId]);
      qc.invalidateQueries(['tickets']);
      setSubtaskTitle('');
      setAddingSubtask(false);
    },
  });

  const addComment = useMutation({
    mutationFn: () => createComment({ ticket_id: ticketId, author_id: user?.id, body: commentBody }),
    onSuccess: () => { qc.invalidateQueries(['comments', ticketId]); qc.invalidateQueries(['activity', ticketId]); setCommentBody(''); },
  });

  const removeComment = useMutation({
    mutationFn: (id) => deleteComment(id),
    onSuccess: () => { qc.invalidateQueries(['comments', ticketId]); qc.invalidateQueries(['activity', ticketId]); },
  });

  useEffect(() => {
    if (ticket) { setTitleDraft(ticket.title); setDescDraft(ticket.description || ''); }
  }, [ticket?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!ticketId) return null;

  const sprintName = activeSprints.find(s => s.id === ticket?.sprint_id)?.name;
  const assigneeName = projectMembers.find(m => m.id === ticket?.assignee_id)?.name;
  const reporterName = projectMembers.find(m => m.id === ticket?.reporter_id)?.name;
  const parentKey = ticket?.parent?.ticket_key;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[640px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">Loading...</div>
        ) : !ticket ? (
          <div className="flex items-center justify-center h-full text-slate-400">Ticket not found</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0">
                <button
                  onClick={() => { navigate(`/p/${ticket.project_key}/board`); onClose(); }}
                  className="font-mono text-xs text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                >
                  {ticket.project_key}
                </button>
                <ChevronRight size={11} className="text-slate-300 flex-shrink-0" />
                {ticket.parent && (
                  <>
                    <button
                      onClick={() => onTicketChange?.(ticket.parent.id)}
                      className="flex items-center gap-1 hover:text-indigo-600 transition-colors flex-shrink-0"
                    >
                      <TypeBadge type={ticket.parent.type} />
                      <span className="font-mono text-xs">{ticket.parent.ticket_key}</span>
                    </button>
                    <ChevronRight size={11} className="text-slate-300 flex-shrink-0" />
                  </>
                )}
                <TypeBadge type={ticket.type} />
                <span className="font-mono font-semibold text-slate-700 flex-shrink-0">{ticket.ticket_key}</span>
              </div>
              <div className="flex items-center gap-1">
                {!canWrite && (
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium mr-1">View only</span>
                )}
                <CopyLinkButton url={`${window.location.origin}/p/${ticket.project_key}?ticket=${ticket.id}`} />
                {canDelete && (
                  <button onClick={() => { if (confirm('Delete this ticket?')) remove.mutate(); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Main content */}
              <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-5">
                {/* Title */}
                {canWrite && isEditingTitle ? (
                  <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => { update.mutate({ title: titleDraft }); setIsEditingTitle(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                    autoFocus className="w-full text-xl font-bold text-slate-900 border-b-2 border-indigo-400 outline-none pb-1" />
                ) : (
                  <h1
                    onClick={() => canWrite && setIsEditingTitle(true)}
                    className={`text-xl font-bold text-slate-900 rounded px-1 -mx-1 py-0.5 transition-colors ${canWrite ? 'cursor-text hover:bg-slate-50' : ''}`}>
                    {ticket.title}
                  </h1>
                )}

                {/* Description */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</div>
                  {canWrite && isEditingDesc ? (
                    <div>
                      <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} autoFocus rows={6}
                        placeholder="Add a description..."
                        className="w-full text-sm text-slate-700 border border-indigo-300 rounded-lg p-3 outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { update.mutate({ description: descDraft }); setIsEditingDesc(false); }}
                          className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-medium hover:bg-indigo-500">Save</button>
                        <button onClick={() => setIsEditingDesc(false)}
                          className="text-xs text-slate-500 px-3 py-1.5 rounded hover:bg-slate-100">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => canWrite && setIsEditingDesc(true)}
                      className={`min-h-[60px] rounded-lg p-2 -mx-2 transition-colors ${canWrite ? 'cursor-text hover:bg-slate-50' : ''}`}>
                      {ticket.description
                        ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
                        : <p className="text-sm text-slate-400 italic">{canWrite ? 'Click to add a description...' : 'No description'}</p>
                      }
                    </div>
                  )}
                </div>

                {/* Dependencies */}
                <DependenciesSection
                  ticketId={ticketId}
                  projectId={projectId}
                  canWrite={canWrite}
                  onTicketClick={onTicketChange}
                />

                {/* Sub-tasks — always shown for epics, shown for others if children exist */}
                {(ticket.type === 'epic' || ticket.children?.length > 0) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {ticket.type === 'epic' ? 'Sub-tasks' : 'Child Tickets'}
                        {ticket.children?.length > 0 && (
                          <span className="ml-1.5 text-slate-400 font-normal normal-case">({ticket.children.length})</span>
                        )}
                      </div>
                      {canWrite && (
                        <button
                          onClick={() => { setAddingSubtask(true); setSubtaskTitle(''); }}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium">
                          <Plus size={12} /> Add
                        </button>
                      )}
                    </div>

                    {/* Quick-create form */}
                    {addingSubtask && (
                      <div className="mb-2 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/30 space-y-2">
                        <input
                          autoFocus
                          value={subtaskTitle}
                          onChange={e => setSubtaskTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && subtaskTitle.trim()) addSubtask.mutate(subtaskTitle.trim());
                            if (e.key === 'Escape') { setAddingSubtask(false); setSubtaskTitle(''); }
                          }}
                          placeholder="Sub-task title..."
                          className="w-full text-sm bg-white border border-slate-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={subtaskType}
                            onChange={e => setSubtaskType(e.target.value)}
                            className="text-xs bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600">
                            <option value="task">Task</option>
                            <option value="bug">Bug</option>
                            <option value="story">Story</option>
                            <option value="feature">Feature</option>
                          </select>
                          <button
                            onClick={() => subtaskTitle.trim() && addSubtask.mutate(subtaskTitle.trim())}
                            disabled={!subtaskTitle.trim() || addSubtask.isPending}
                            className="text-xs bg-indigo-600 text-white px-3 py-1 rounded font-medium hover:bg-indigo-500 disabled:opacity-40">
                            {addSubtask.isPending ? '...' : 'Create'}
                          </button>
                          <button onClick={() => { setAddingSubtask(false); setSubtaskTitle(''); }}
                            className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
                        </div>
                      </div>
                    )}

                    {ticket.children?.length > 0 ? (
                      <div className="space-y-1.5">
                        {ticket.children.map(child => {
                          const doneCount = child.epic_progress?.done || 0;
                          const totalCount = child.epic_progress?.total || 0;
                          return (
                            <div key={child.id} onClick={() => onTicketChange?.(child.id)}
                              className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer transition-colors group">
                              <TypeBadge type={child.type} />
                              <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{child.ticket_key}</span>
                              <span className="text-sm text-slate-700 flex-1 truncate">{child.title}</span>
                              <StatusBadge status={child.status} />
                              <ExternalLink size={12} className="text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      !addingSubtask && (
                        <p className="text-xs text-slate-400 italic py-1">
                          No sub-tasks yet.{canWrite ? ' Click Add to create one.' : ''}
                        </p>
                      )
                    )}
                  </div>
                )}

                {/* Time tracking */}
                <div className="border-t border-slate-100 pt-4">
                  <TimeTracker ticketId={ticketId} estimateHours={ticket.estimate_hours} canWrite={canWrite} />
                </div>

                {/* Attachments */}
                <AttachmentsSection ticketId={ticketId} canWrite={canWrite} />

                {/* Activity & Comments */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Activity</div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                      {[['all', 'All'], ['comments', 'Comments']].map(([val, label]) => (
                        <button key={val} onClick={() => setActivityFilter(val)}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                            activityFilter === val ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    {(() => {
                      // Build merged, sorted feed
                      const commentMap = Object.fromEntries(comments.map(c => [c.id, c]));
                      const feedItems = activityFilter === 'comments'
                        ? comments.map(c => ({ _type: 'comment', _ts: c.created_at, ...c }))
                        : [
                            ...comments.map(c => ({ _type: 'comment', _ts: c.created_at, ...c })),
                            ...activityEvents.filter(e => e.action !== 'commented').map(e => ({ _type: 'event', _ts: e.created_at, ...e })),
                          ].sort((a, b) => new Date(a._ts) - new Date(b._ts));

                      if (!feedItems.length) return <p className="text-xs text-slate-400 italic">No activity yet</p>;

                      const FIELD_LABELS = {
                        status: 'status', priority: 'priority', assignee_id: 'assignee',
                        sprint_id: 'sprint', title: 'title', story_points: 'story points',
                        estimate_hours: 'estimate', due_date: 'due date', type: 'type',
                      };

                      return feedItems.map(item => {
                        if (item._type === 'comment') {
                          return (
                            <div key={`c-${item.id}`} className="flex gap-3 group">
                              <Avatar user={item.author} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="text-xs font-semibold text-slate-700">{item.author?.name || 'Unknown'}</span>
                                  <span className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
                                  {canWrite && (
                                    <button onClick={() => removeComment.mutate(item.id)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 ml-auto transition-opacity">
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{renderCommentBody(item.body)}</p>
                              </div>
                            </div>
                          );
                        }
                        // Change event
                        const fieldLabel = FIELD_LABELS[item.field] || item.field;
                        const actorName = item.actor?.name || 'Someone';
                        let eventText;
                        if (item.action === 'created') {
                          eventText = 'created this ticket';
                        } else if (item.field) {
                          eventText = `changed ${fieldLabel}`;
                          if (item.old_value || item.new_value) {
                            eventText += ` from "${item.old_value ?? '—'}" → "${item.new_value ?? '—'}"`;
                          }
                        } else {
                          eventText = item.action;
                        }
                        return (
                          <div key={`e-${item.id}`} className="flex items-start gap-2 text-[11px] text-slate-500">
                            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                              {item.actor ? (
                                <Avatar user={item.actor} size="sm" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5" />
                              )}
                            </div>
                            <div className="pt-0.5">
                              <span className="font-medium text-slate-600">{actorName}</span>
                              {' '}{eventText}
                              <span className="ml-1.5 text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {canWrite && (
                    <div className="flex gap-3">
                      <Avatar user={user} size="sm" />
                      <div className="flex-1">
                        <MentionTextarea
                          value={commentBody}
                          onChange={setCommentBody}
                          onSubmit={() => commentBody.trim() && addComment.mutate()}
                          members={projectMembers}
                          placeholder="Add a comment... type @ to mention someone"
                        />
                        <div className="flex justify-between items-center mt-1.5">
                          <span className="text-[11px] text-slate-400">⌘+Enter to submit · @ to mention</span>
                          <button onClick={() => commentBody.trim() && addComment.mutate()}
                            disabled={!commentBody.trim() || addComment.isPending}
                            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-medium hover:bg-indigo-500 disabled:opacity-40">
                            Comment
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar metadata */}
              <div className="w-52 flex-shrink-0 border-l border-slate-100 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
                {updateError && (
                  <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 -mx-1">
                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{updateError}</span>
                  </div>
                )}
                <Field label="Status">
                  {canWrite
                    ? <StatusBadge status={ticket.status} onChange={v => update.mutate({ status: v })} statuses={statuses} />
                    : <StatusBadge status={ticket.status} statuses={statuses} />
                  }
                </Field>

                <Field label="Type">
                  <InlineSelect value={ticket.type} options={TYPE_OPTIONS}
                    onChange={v => update.mutate({ type: v })} disabled={!canWrite} />
                </Field>

                <Field label="Priority">
                  <InlineSelect value={ticket.priority} options={PRIORITY_OPTIONS}
                    onChange={v => update.mutate({ priority: v })} disabled={!canWrite} />
                </Field>

                <Field label="Assignee">
                  {canWrite ? (
                    <select value={ticket.assignee_id || ''} onChange={e => update.mutate({ assignee_id: e.target.value || null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
                      <option value="">Unassigned</option>
                      {assigneeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={assigneeName} fallback="Unassigned" />
                  )}
                </Field>

                <Field label="Reporter">
                  {canWrite ? (
                    <select value={ticket.reporter_id || ''} onChange={e => update.mutate({ reporter_id: e.target.value || null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
                      <option value="">None</option>
                      {projectMembers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={reporterName} fallback="None" />
                  )}
                </Field>

                <Field label="Story Points">
                  {canWrite ? (
                    <input type="number" min="0" step="1" placeholder="—" value={ticket.story_points ?? ''}
                      onChange={e => update.mutate({ story_points: e.target.value ? parseInt(e.target.value) : null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
                  ) : (
                    <ReadOnly value={ticket.story_points} />
                  )}
                </Field>

                <Field label="Sprint">
                  {canWrite ? (
                    <select value={ticket.sprint_id || ''} onChange={e => update.mutate({ sprint_id: e.target.value || null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
                      <option value="">Backlog</option>
                      {activeSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={sprintName} fallback="Backlog" />
                  )}
                </Field>

                {canWrite && (
                  <Field label="Parent Ticket">
                    <select value={ticket.parent_id || ''} onChange={e => update.mutate({ parent_id: e.target.value || null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer w-full">
                      <option value="">None</option>
                      {siblings.filter(t => t.id !== ticketId).map(t => (
                        <option key={t.id} value={t.id}>{t.ticket_key}: {t.title.slice(0, 30)}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {!canWrite && ticket.parent && (
                  <Field label="Parent Ticket">
                    <ReadOnly value={`${parentKey}: ${ticket.parent?.title?.slice(0, 30)}`} />
                  </Field>
                )}

                <Field label="Due Date">
                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <input type="date" value={ticket.due_date ? ticket.due_date.split('T')[0] : ''}
                        onChange={e => update.mutate({ due_date: e.target.value || null })}
                        className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 flex-1" />
                      {ticket.due_date && (
                        <button type="button" onClick={() => update.mutate({ due_date: null })}
                          title="Clear due date"
                          className="text-slate-300 hover:text-slate-500 transition-colors text-xs px-1">
                          ×
                        </button>
                      )}
                    </div>
                  ) : (
                    <ReadOnly value={ticket.due_date ? new Date(ticket.due_date).toLocaleDateString() : null} fallback="None" />
                  )}
                </Field>

                <Field label="Estimate (hours)">
                  {canWrite ? (
                    <input type="number" min="0" step="0.5" placeholder="—" value={ticket.estimate_hours ?? ''}
                      onChange={e => update.mutate({ estimate_hours: e.target.value ? parseFloat(e.target.value) : null })}
                      className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 w-full" />
                  ) : (
                    <ReadOnly value={ticket.estimate_hours ? `${ticket.estimate_hours}h` : null} />
                  )}
                </Field>

                <Field label="Labels">
                  <LabelPicker
                    projectId={projectId}
                    ticketLabels={ticket.labels || []}
                    onUpdate={(labelIds) => update.mutate({ label_ids: labelIds })}
                    canWrite={canWrite}
                    canManageProject={canManageProject}
                  />
                </Field>

                <CustomFieldsSection
                  ticketId={ticketId}
                  projectId={projectId}
                  customFieldValues={ticket.custom_fields || {}}
                  canWrite={canWrite}
                />

                <Field label="Created">
                  <div className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleString()}</div>
                </Field>
                <Field label="Updated">
                  <div className="text-xs text-slate-500">{new Date(ticket.updated_at).toLocaleString()}</div>
                </Field>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
