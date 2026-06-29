import client from './client';

export const getLabels = (projectId) =>
  client.get(`/api/projects/${projectId}/labels`);

export const createLabel = (projectId, data) =>
  client.post(`/api/projects/${projectId}/labels`, data);

export const updateLabel = (projectId, labelId, data) =>
  client.patch(`/api/projects/${projectId}/labels/${labelId}`, data);

export const deleteLabel = (projectId, labelId) =>
  client.delete(`/api/projects/${projectId}/labels/${labelId}`);
