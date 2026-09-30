import client from './client';

export const getPipelineStages = () => client.get('/api/pipeline-stages');
export const createPipelineStage = (data) => client.post('/api/pipeline-stages', data);
export const updatePipelineStage = (stageId, data) => client.patch(`/api/pipeline-stages/${stageId}`, data);
export const reorderPipelineStages = (order) => client.post('/api/pipeline-stages/reorder', { order });
export const deletePipelineStage = (stageId) => client.delete(`/api/pipeline-stages/${stageId}`);
