import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Circle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  markNotificationsUnread,
  deleteNotification,
} from '../api/notifications';
import { Avatar } from './Badge';

function relativeTime(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function notifText(n) {
  const key = n.project_key && n.ticket_number
    ? `${n.project_key}-${n.ticket_number}`
    : null;
  const title = n.ticket_title || 'a ticket';
  if (n.type === 'mentioned') return `mentioned you in ${key || title}`;
  if (n.type === 'assigned')  return `assigned you to ${key || title}`;
  return n.type;
}

export default function NotificationBell({ onTicketOpen }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: countData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(30),
    enabled: open,
  });

  const markReadMut = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries(['notifications']);
      qc.invalidateQueries(['notifications-count']);
    },
  });

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries(['notifications']);
      qc.invalidateQueries(['notifications-count']);
    },
  });

  const markUnreadMut = useMutation({
    mutationFn: markNotificationsUnread,
    onSuccess: () => {
      qc.invalidateQueries(['notifications']);
      qc.invalidateQueries(['notifications-count']);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      qc.invalidateQueries(['notifications']);
      qc.invalidateQueries(['notifications-count']);
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = countData?.count ?? 0;

  const handleNotifClick = (n) => {
    if (!n.read_at) markReadMut.mutate([n.id]);
    if (n.project_key && n.ticket_id) {
      navigate(`/p/${n.project_key}/board?ticket=${n.ticket_id}`);
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                className="text-[11px] text-indigo-600 hover:text-indigo-500 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                No notifications yet
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  className={`group relative flex items-start gap-3 px-4 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 ${
                    !n.read_at ? 'bg-indigo-50/60' : ''
                  }`}
                >
                  {/* clickable avatar + text */}
                  <div
                    className="flex-shrink-0 mt-0.5 cursor-pointer"
                    onClick={() => handleNotifClick(n)}
                  >
                    {n.actor ? <Avatar user={n.actor} size="sm" /> : <Bell size={14} className="text-slate-400" />}
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleNotifClick(n)}
                  >
                    <p className="text-xs text-slate-700 leading-snug">
                      <span className="font-semibold">{n.actor?.name || 'Someone'}</span>
                      {' '}{notifText(n)}
                    </p>
                    {n.ticket_title && (
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{n.ticket_title}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">{relativeTime(n.created_at)}</p>
                  </div>

                  {/* right side: unread dot + hover actions */}
                  <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                    {/* actions revealed on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => n.read_at
                          ? markUnreadMut.mutate([n.id])
                          : markReadMut.mutate([n.id])
                        }
                        title={n.read_at ? 'Mark unread' : 'Mark read'}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {n.read_at
                          ? <Circle size={12} />
                          : <Check size={12} />
                        }
                      </button>
                      <button
                        onClick={() => deleteMut.mutate(n.id)}
                        title="Delete notification"
                        className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {/* unread dot */}
                    {!n.read_at && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
