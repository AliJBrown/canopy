import client from './client';

export const getProjects = () => client.get('/api/projects');
export const getProject = (id) => client.get(`/api/projects/${id}`);
export const createProject = (data) => client.post('/api/projects', data);
export const updateProject = (id, data) => client.patch(`/api/projects/${id}`, data);
export const deleteProject = (id) => client.delete(`/api/projects/${id}`);

// Project role permissions
export const getProjectRolePermissions = (projectId) =>
  client.get(`/api/projects/${projectId}/role-permissions`);
export const setRolePermissions = (projectId, role, permissions) =>
  client.put(`/api/projects/${projectId}/role-permissions/${role}`, { permissions });
export const resetRolePermissions = (projectId) =>
  client.post(`/api/projects/${projectId}/role-permissions/reset`);
