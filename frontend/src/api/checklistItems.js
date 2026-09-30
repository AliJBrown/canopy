import client from './client';

export const getChecklistItems = (programId, stageId) =>
  client.get(`/api/programs/${programId}/checklist-items`, { params: { stage_id: stageId } });
export const createChecklistItem = (programId, data) =>
  client.post(`/api/programs/${programId}/checklist-items`, data);
export const updateChecklistItem = (programId, itemId, data) =>
  client.patch(`/api/programs/${programId}/checklist-items/${itemId}`, data);
export const deleteChecklistItem = (programId, itemId) =>
  client.delete(`/api/programs/${programId}/checklist-items/${itemId}`);
