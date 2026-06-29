import client from './client';

const base = (projectId) => `/api/projects/${projectId}/automations`;

export const getAutomations = (projectId) => client.get(base(projectId));
export const createAutomation = (projectId, data) => client.post(base(projectId), data);
export const updateAutomation = (projectId, id, data) => client.patch(`${base(projectId)}/${id}`, data);
export const deleteAutomation = (projectId, id) => client.delete(`${base(projectId)}/${id}`);
export const getAutomationRuns = (projectId, id) => client.get(`${base(projectId)}/${id}/runs`);

const wfBase = (projectId) => `/api/projects/${projectId}/workflow`;
export const getWorkflow = (projectId) => client.get(wfBase(projectId));
export const createWorkflow = (projectId, data) => client.post(wfBase(projectId), data);
export const updateWorkflowSettings = (projectId, data) => client.patch(`${wfBase(projectId)}/settings`, data);
export const addTransition = (projectId, data) => client.post(`${wfBase(projectId)}/transitions`, data);
export const deleteTransition = (projectId, id) => client.delete(`${wfBase(projectId)}/transitions/${id}`);

export const getTokens = () => client.get('/api/tokens');
export const createToken = (data) => client.post('/api/tokens', data);
export const deleteToken = (id) => client.delete(`/api/tokens/${id}`);
