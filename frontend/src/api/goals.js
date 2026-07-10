import client from './client';

export const getGoals = (projectId) =>
  client.get(`/api/projects/${projectId}/goals`);

export const createGoal = (projectId, data) =>
  client.post(`/api/projects/${projectId}/goals`, data);

export const updateGoal = (projectId, goalId, data) =>
  client.patch(`/api/projects/${projectId}/goals/${goalId}`, data);

export const deleteGoal = (projectId, goalId) =>
  client.delete(`/api/projects/${projectId}/goals/${goalId}`);

export const lockGoal = (projectId, goalId, is_locked) =>
  client.patch(`/api/projects/${projectId}/goals/${goalId}/lock`, { is_locked });

// Epic links
export const getGoalEpics = (projectId, goalId) =>
  client.get(`/api/projects/${projectId}/goals/${goalId}/epics`);

export const linkEpicToGoal = (projectId, goalId, epicId) =>
  client.post(`/api/projects/${projectId}/goals/${goalId}/epics`, { epic_id: epicId });

export const unlinkEpicFromGoal = (projectId, goalId, epicId) =>
  client.delete(`/api/projects/${projectId}/goals/${goalId}/epics/${epicId}`);

export const getEpicCandidates = (projectId, goalId, search = '') =>
  client.get(`/api/projects/${projectId}/goals/${goalId}/epic-candidates`, { params: { search } });

// Ticket exclusions
export const excludeTicket = (projectId, goalId, ticketId) =>
  client.post(`/api/projects/${projectId}/goals/${goalId}/exclude/${ticketId}`);

export const includeTicket = (projectId, goalId, ticketId) =>
  client.delete(`/api/projects/${projectId}/goals/${goalId}/exclude/${ticketId}`);

// Direct ticket links (for non-epic tickets)
export const getGoalTickets = (projectId, goalId) =>
  client.get(`/api/projects/${projectId}/goals/${goalId}/tickets`);

export const linkTicketToGoal = (projectId, goalId, ticketId) =>
  client.post(`/api/projects/${projectId}/goals/${goalId}/tickets`, { ticket_id: ticketId });

export const unlinkTicketFromGoal = (projectId, goalId, ticketId) =>
  client.delete(`/api/projects/${projectId}/goals/${goalId}/tickets/${ticketId}`);

export const getTicketCandidates = (projectId, goalId, search = '') =>
  client.get(`/api/projects/${projectId}/goals/${goalId}/ticket-candidates`, { params: { search } });

// Goal links from the ticket's own detail panel
export const getTicketGoals = (ticketId) =>
  client.get(`/api/tickets/${ticketId}/goals`);

export const getTicketGoalCandidates = (ticketId, search = '') =>
  client.get(`/api/tickets/${ticketId}/goals/candidates`, { params: { search } });

export const linkGoalToTicket = (ticketId, goalId) =>
  client.post(`/api/tickets/${ticketId}/goals`, { goal_id: goalId });

export const unlinkGoalFromTicket = (ticketId, goalId) =>
  client.delete(`/api/tickets/${ticketId}/goals/${goalId}`);
