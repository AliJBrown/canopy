import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getTimeLogs, createTimeLog, deleteTimeLog } from '../api/timeLogs';
import { useApp } from '../context/AppContext';
import { Avatar } from './Badge';

function formatHours(h) {
  if (!h || h === 0) return '0h';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function ProgressBar({ logged, estimate }) {
  if (!estimate) return null;
  const pct = Math.min((logged / estimate) * 100, 100);
  const over = logged > estimate;
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{formatHours(logged)} logged</span>
        <span className={over ? 'text-red-500 font-medium' : ''}>{formatHours(estimate)} estimate</span>
      </div>
    </div>
  );
}

export default function TimeTracker({ ticketId, estimateHours, canWrite = true }) {
  const qc = useQueryClient();
  const { user } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [loggedDate, setLoggedDate] = useState(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');

  const { data: logs = [] } = useQuery({
    queryKey: ['timeLogs', ticketId],
    queryFn: () => getTimeLogs(ticketId),
    enabled: !!ticketId,
  });

  const addLog = useMutation({
    mutationFn: () => createTimeLog(ticketId, { hours: parseFloat(hours), description, logged_date: loggedDate }),
    onSuccess: () => {
      qc.invalidateQueries(['timeLogs', ticketId]);
      qc.invalidateQueries(['ticket', ticketId]);
      setHours('');
      setDescription('');
      setLoggedDate(new Date().toISOString().split('T')[0]);
      setShowForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e.error || 'Failed to log time'),
  });

  const removeLog = useMutation({
    mutationFn: (logId) => deleteTimeLog(ticketId, logId),
    onSuccess: () => {
      qc.invalidateQueries(['timeLogs', ticketId]);
      qc.invalidateQueries(['ticket', ticketId]);
    },
  });

  const totalLogged = logs.reduce((sum, l) => sum + parseFloat(l.hours), 0);
  const visibleLogs = showAll ? logs : logs.slice(0, 3);

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    const h = parseFloat(hours);
    if (!h || h <= 0) { setFormError('Enter a positive number of hours'); return; }
    if (h > 24) { setFormError('Max 24 hours per entry'); return; }
    addLog.mutate();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Time Tracked</span>
        </div>
        {user && canWrite && (
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            <Plus size={12} /> Log time
          </button>
        )}
      </div>

      <ProgressBar logged={totalLogged} estimate={estimateHours} />

      {!estimateHours && totalLogged > 0 && (
        <div className="text-xs text-slate-500">{formatHours(totalLogged)} logged total</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-lg p-3 space-y-2.5 border border-slate-200">
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Hours</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="1.5"
                required
                autoFocus
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                value={loggedDate}
                onChange={e => setLoggedDate(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setShowForm(false); setFormError(''); }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5">Cancel</button>
            <button type="submit" disabled={!hours || addLog.isPending}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-indigo-500 disabled:opacity-40">
              {addLog.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {logs.length > 0 && (
        <div className="space-y-1.5">
          {visibleLogs.map(log => (
            <div key={log.id} className="flex items-start gap-2.5 group py-1">
              <Avatar user={log.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-700">{log.user?.name || 'Unknown'}</span>
                  <span className="text-[11px] text-indigo-600 font-semibold">{formatHours(log.hours)}</span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(String(log.logged_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {log.description && (
                  <p className="text-[11px] text-slate-500 truncate">{log.description}</p>
                )}
              </div>
              <button onClick={() => removeLog.mutate(log.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 rounded flex-shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {logs.length > 3 && (
            <button onClick={() => setShowAll(s => !s)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-1">
              {showAll ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show {logs.length - 3} more</>}
            </button>
          )}
        </div>
      )}

      {logs.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic">No time logged yet</p>
      )}
    </div>
  );
}
