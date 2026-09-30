import client from './client';

export const getStageProgress = (programId, stageId) =>
  client.get(`/api/programs/${programId}/stage-progress/${stageId}`);
export const updateStageProgress = (programId, stageId, data) =>
  client.put(`/api/programs/${programId}/stage-progress/${stageId}`, data);
