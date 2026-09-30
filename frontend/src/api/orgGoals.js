import client from './client';

export const getOrgGoals = () => client.get('/api/goals');
export const getOrgGoal = (id) => client.get(`/api/goals/${id}`);
export const createOrgGoal = (data) => client.post('/api/goals', data);
export const createSubGoal = (parentId, data) => client.post(`/api/goals/${parentId}/sub-goals`, data);
export const updateOrgGoal = (id, data) => client.patch(`/api/goals/${id}`, data);
export const deleteOrgGoal = (id) => client.delete(`/api/goals/${id}`);
export const lockOrgGoal = (id, is_locked) => client.patch(`/api/goals/${id}/lock`, { is_locked });

export const getGoalTicketCandidates = (goalId, q) =>
  client.get(`/api/goals/${goalId}/ticket-candidates`, { params: { q } });
export const linkTicketToOrgGoal = (goalId, ticketId) =>
  client.post(`/api/goals/${goalId}/tickets`, { ticket_id: ticketId });
export const unlinkTicketFromOrgGoal = (goalId, ticketId) =>
  client.delete(`/api/goals/${goalId}/tickets/${ticketId}`);

export const getGoalProgramCandidates = (goalId, q) =>
  client.get(`/api/goals/${goalId}/program-candidates`, { params: { q } });
export const linkProgramToOrgGoal = (goalId, programId) =>
  client.post(`/api/goals/${goalId}/programs`, { program_id: programId });
export const unlinkProgramFromOrgGoal = (goalId, programId) =>
  client.delete(`/api/goals/${goalId}/programs/${programId}`);

export const getGoalMembers = (goalId) =>
  client.get(`/api/goals/${goalId}/members`);
export const addGoalMember = (goalId, userId) =>
  client.post(`/api/goals/${goalId}/members`, { user_id: userId });
export const removeGoalMember = (goalId, userId) =>
  client.delete(`/api/goals/${goalId}/members/${userId}`);

export const getGoalProjects = () =>
  client.get('/api/goals/projects');

export const getGoalAssignees = (goalId) =>
  client.get(`/api/goals/${goalId}/assignees`);
export const addGoalAssignee = (goalId, userId) =>
  client.post(`/api/goals/${goalId}/assignees`, { user_id: userId });
export const removeGoalAssignee = (goalId, userId) =>
  client.delete(`/api/goals/${goalId}/assignees/${userId}`);

export const getAllGoalDependencies = () =>
  client.get('/api/goals/all-dependencies');
export const searchGoals = (q) =>
  client.get('/api/goals/search', { params: { q } });
export const getGoalDependencies = (goalId) =>
  client.get(`/api/goals/${goalId}/dependencies`);
export const addGoalDependency = (goalId, data) =>
  client.post(`/api/goals/${goalId}/dependencies`, data);
export const removeGoalDependency = (goalId, depId) =>
  client.delete(`/api/goals/${goalId}/dependencies/${depId}`);
