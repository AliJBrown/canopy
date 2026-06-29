import client from './client';

export const getFields = (projectId) =>
  client.get(`/api/projects/${projectId}/fields`);

export const createField = (projectId, data) =>
  client.post(`/api/projects/${projectId}/fields`, data);

export const updateField = (projectId, fieldId, data) =>
  client.patch(`/api/projects/${projectId}/fields/${fieldId}`, data);

export const deleteField = (projectId, fieldId) =>
  client.delete(`/api/projects/${projectId}/fields/${fieldId}`);

export const upsertFieldValues = (projectId, ticketId, values) =>
  client.put(`/api/projects/${projectId}/fields/tickets/${ticketId}`, { values });
