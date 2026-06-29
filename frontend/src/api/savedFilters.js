import client from './client';

export const getSavedFilters = (projectId) =>
  client.get(`/api/projects/${projectId}/saved-filters`);

export const createSavedFilter = (projectId, data) =>
  client.post(`/api/projects/${projectId}/saved-filters`, data);

export const updateSavedFilter = (projectId, filterId, data) =>
  client.patch(`/api/projects/${projectId}/saved-filters/${filterId}`, data);

export const deleteSavedFilter = (projectId, filterId) =>
  client.delete(`/api/projects/${projectId}/saved-filters/${filterId}`);
