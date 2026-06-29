import client from './client';

export const getSprints = (projectId) =>
  client.get(`/api/projects/${projectId}/sprints`);

export const createSprint = (projectId, data) =>
  client.post(`/api/projects/${projectId}/sprints`, data);

export const updateSprint = (projectId, sprintId, data) =>
  client.patch(`/api/projects/${projectId}/sprints/${sprintId}`, data);

export const deleteSprint = (projectId, sprintId) =>
  client.delete(`/api/projects/${projectId}/sprints/${sprintId}`);

export const startSprint = (projectId, sprintId) =>
  client.post(`/api/projects/${projectId}/sprints/${sprintId}/start`);

export const completeSprint = (projectId, sprintId, data) =>
  client.post(`/api/projects/${projectId}/sprints/${sprintId}/complete`, data);

export const getBurndown = (projectId, sprintId) =>
  client.get(`/api/projects/${projectId}/sprints/${sprintId}/burndown`);
