import apiClient from './apiClient.js';

export async function activateSosRequest(payload) {
  const { data } = await apiClient.post('/emergencies/sos', payload);
  return data;
}

export async function resolveEmergencyRequest(emergencyId, status = 'RESOLVED') {
  const { data } = await apiClient.patch(`/emergencies/${emergencyId}/resolve`, { status });
  return data;
}

export async function retryEmergencySmsRequest(emergencyId) {
  const { data } = await apiClient.post(`/emergencies/${emergencyId}/retry-sms`);
  return data;
}

export async function getEmergencyHistoryRequest() {
  const { data } = await apiClient.get('/emergencies');
  return data;
}
