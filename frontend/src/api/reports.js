import client from './client';

export const getOverview   = (projectId) => client.get(`/api/projects/${projectId}/reports/overview`);
export const getVelocity   = (projectId) => client.get(`/api/projects/${projectId}/reports/velocity`);
export const getCycleTime  = (projectId) => client.get(`/api/projects/${projectId}/reports/cycle-time`);
export const getThroughput = (projectId) => client.get(`/api/projects/${projectId}/reports/throughput`);
export const getWorkload   = (projectId) => client.get(`/api/projects/${projectId}/reports/workload`);
