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
