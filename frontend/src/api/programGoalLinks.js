import client from './client';

export const getProgramGoalLinks = (programId) => client.get(`/api/programs/${programId}/goal-links`);
export const getGoalLinkCandidates = (programId, q) =>
  client.get(`/api/programs/${programId}/goal-links/candidates`, { params: { q } });
export const linkProgramGoal = (programId, goalId) =>
  client.post(`/api/programs/${programId}/goal-links`, { goal_id: goalId });
export const unlinkProgramGoal = (programId, goalId) =>
  client.delete(`/api/programs/${programId}/goal-links/${goalId}`);
