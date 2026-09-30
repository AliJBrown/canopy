import client from './client';

export const getFeatureFlags = () => client.get('/api/feature-flags');
