import client from './client';

const base = (projectId) => `/api/projects/${projectId}/statuses`;

export const getProjectStatuses    = (projectId)           => client.get(base(projectId));
export const createProjectStatus   = (projectId, data)     => client.post(base(projectId), data);
export const updateProjectStatus   = (projectId, id, data) => client.patch(`${base(projectId)}/${id}`, data);
export const deleteProjectStatus   = (projectId, id)       => client.delete(`${base(projectId)}/${id}`);
export const reorderProjectStatuses= (projectId, order)    => client.post(`${base(projectId)}/reorder`, { order });
