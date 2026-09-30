import client from './client';

export const getAdminUsers = () => client.get('/api/admin/users');
export const createAdminUser = (data) => client.post('/api/admin/users', data);
export const updateAdminUser = (id, data) => client.patch(`/api/admin/users/${id}`, data);
export const deleteAdminUser = (id) => client.delete(`/api/admin/users/${id}`);

export const getTeams = () => client.get('/api/teams');
export const createTeam = (data) => client.post('/api/teams', data);
export const updateTeam = (id, data) => client.patch(`/api/teams/${id}`, data);
export const deleteTeam = (id) => client.delete(`/api/teams/${id}`);
export const getTeamMembers = (teamId) => client.get(`/api/teams/${teamId}/members`);
export const addTeamMember = (teamId, data) => client.post(`/api/teams/${teamId}/members`, data);
export const removeTeamMember = (teamId, userId) => client.delete(`/api/teams/${teamId}/members/${userId}`);

export const getProjectMembers = (projectId) => client.get(`/api/projects/${projectId}/members`);
export const addProjectMember = (projectId, data) => client.post(`/api/projects/${projectId}/members`, data);
export const updateProjectMember = (projectId, userId, data) => client.patch(`/api/projects/${projectId}/members/${userId}`, data);
export const removeProjectMember = (projectId, userId) => client.delete(`/api/projects/${projectId}/members/${userId}`);

export const getProjectTeams = (projectId) => client.get(`/api/projects/${projectId}/members/teams`);
export const addProjectTeam = (projectId, data) => client.post(`/api/projects/${projectId}/members/teams`, data);
export const updateProjectTeam = (projectId, teamId, data) => client.patch(`/api/projects/${projectId}/members/teams/${teamId}`, data);
export const removeProjectTeam = (projectId, teamId) => client.delete(`/api/projects/${projectId}/members/teams/${teamId}`);

// System permissions
export const getSystemPermissions = () => client.get('/api/admin/system-permissions');
export const getUserPermissions = (userId) => client.get(`/api/admin/users/${userId}/permissions`);
export const setUserPermissions = (userId, permissions) => client.put(`/api/admin/users/${userId}/permissions`, { permissions });

// Program settings
export const getProgramSettings = () => client.get('/api/admin/program-settings');
export const updateProgramSettings = (data) => client.put('/api/admin/program-settings', data);

// Feature flags
export const updateFeatureFlags = (data) => client.put('/api/admin/feature-flags', data);


