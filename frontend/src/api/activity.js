import client from './client';

export const getActivity = (ticketId) =>
  client.get(`/api/tickets/${ticketId}/activity`);
