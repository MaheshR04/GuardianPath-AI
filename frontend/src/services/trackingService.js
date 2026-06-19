import apiClient from './apiClient.js';

export async function fetchTrackedUsers() {
  const { data } = await apiClient.get('/tracking/tracked-users');
  return data;
}

export async function fetchTrackingSnapshot(userId) {
  const { data } = await apiClient.get(`/tracking/${userId}`);
  return data;
}
