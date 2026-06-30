import client from './client';

export const getDependencies = (ticketId) =>
  client.get(`/api/tickets/${ticketId}/dependencies`);

export const addDependency = (ticketId, dependency_id, type = 'blocks') =>
  client.post(`/api/tickets/${ticketId}/dependencies`, { dependency_id, type });

export const removeDependency = (ticketId, depId) =>
  client.delete(`/api/tickets/${ticketId}/dependencies/${depId}`);
