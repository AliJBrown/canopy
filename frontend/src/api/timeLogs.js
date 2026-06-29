import client from './client';

export const getTimeLogs = (ticketId) => client.get(`/api/tickets/${ticketId}/time-logs`);
export const createTimeLog = (ticketId, data) => client.post(`/api/tickets/${ticketId}/time-logs`, data);
export const deleteTimeLog = (ticketId, logId) => client.delete(`/api/tickets/${ticketId}/time-logs/${logId}`);
