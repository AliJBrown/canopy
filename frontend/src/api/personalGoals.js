import client from './client';

export const getMyGoals = () => client.get('/api/me/goals');
export const getMyAssignedGoals = () => client.get('/api/me/goals/assigned');
export const getMyCreatedGoals = () => client.get('/api/me/goals/created');
export const createMyGoal = (data) => client.post('/api/me/goals', data);
export const createMySubGoal = (parentId, data) => client.post(`/api/me/goals/${parentId}/sub-goals`, data);
export const updateMyGoal = (id, data) => client.patch(`/api/me/goals/${id}`, data);
export const deleteMyGoal = (id) => client.delete(`/api/me/goals/${id}`);
export const publishMyGoal = (id, project_id) => client.post(`/api/me/goals/${id}/publish`, { project_id });
export const unpublishMyGoal = (id) => client.post(`/api/me/goals/${id}/unpublish`, {});

export const getMyGoalTickets = (goalId) => client.get(`/api/me/goals/${goalId}/tickets`);
export const linkTicketToMyGoal = (goalId, ticket_id) =>
  client.post(`/api/me/goals/${goalId}/tickets`, { ticket_id });
export const unlinkTicketFromMyGoal = (goalId, ticketId) =>
  client.delete(`/api/me/goals/${goalId}/tickets/${ticketId}`);
export const getMyGoalTicketCandidates = (goalId, q) =>
  client.get(`/api/me/goals/${goalId}/ticket-candidates`, { params: { q } });
