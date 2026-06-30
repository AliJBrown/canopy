import client from './client';

export const getNotifications = (limit = 30) =>
  client.get(`/api/notifications?limit=${limit}`);

export const getUnreadCount = () =>
  client.get('/api/notifications/unread-count');

export const markNotificationsRead = (ids) =>
  client.patch('/api/notifications/mark-read', { ids });

export const markAllNotificationsRead = () =>
  client.patch('/api/notifications/mark-read', { all: true });

export const markNotificationsUnread = (ids) =>
  client.patch('/api/notifications/mark-unread', { ids });

export const deleteNotification = (id) =>
  client.delete(`/api/notifications/${id}`);
