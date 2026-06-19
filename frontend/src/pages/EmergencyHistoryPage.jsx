import { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, XCircle, RotateCcw, Calendar, MapPin, MessageSquareWarning } from 'lucide-react';
import { getEmergencyHistoryRequest, resolveEmergencyRequest, retryEmergencySmsRequest } from '../services/emergencyService.js';
import { formatCoordinate, formatTimestamp } from '../services/mapService.js';
import { getRiskToneClass } from '../utils/crimeRiskEngine.js';

function getStatusBadgeClass(status) {
  if (status === 'ACTIVE') return 'bg-red-100 text-red-800 border-red-200 animate-pulse';
  if (status === 'RESOLVED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function EmergencyHistoryPage() {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getEmergencyHistoryRequest();
      setEmergencies(response.emergencies || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retrieve emergency logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleResolve = async (emergencyId, statusToSet) => {
    setActionLoadingId(emergencyId);
    try {
      const response = await resolveEmergencyRequest(emergencyId, statusToSet);
      setEmergencies((prev) =>
        prev.map((e) => (e._id === emergencyId ? { ...e, status: response.emergency.status, resolvedAt: response.emergency.resolvedAt } : e))
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetrySms = async (emergencyId) => {
    setActionLoadingId(emergencyId);
    try {
      const response = await retryEmergencySmsRequest(emergencyId);
      setEmergencies((prev) =>
        prev.map((e) => (e._id === emergencyId ? { ...e, smsAlerts: response.emergency.smsAlerts } : e))
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to retry SMS alerts.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Security Logs</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">SOS Emergency History</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Review your past distress alert activations, check guardian SMS delivery reports, and manage active incident resolutions.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
          <p className="text-sm text-slate-500 font-medium">Loading security logs...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800 shadow-soft">
          <p className="font-semibold">{error}</p>
          <button
            onClick={fetchHistory}
            className="mt-3 text-sm font-bold text-red-900 hover:text-red-700 underline"
          >
            Try Again
          </button>
        </div>
      ) : emergencies.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-16 bg-white text-center">
          <CheckCircle size={48} className="text-emerald-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">All Secure</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-2">
            You haven't activated any emergency SOS alarms. Your safety history is clear.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {emergencies.map((emergency) => {
            const sentCount = emergency.smsAlerts?.filter((a) => a.status === 'SENT').length || 0;
            const failedCount = emergency.smsAlerts?.filter((a) => a.status !== 'SENT').length || 0;
            const isPendingAction = actionLoadingId === emergency._id;

            return (
              <article
                key={emergency._id}
                className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft transition hover:border-slate-300"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-4">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-md text-white ${
                        emergency.status === 'ACTIVE' ? 'bg-red-600' : 'bg-slate-400'
                      }`}
                    >
                      <ShieldAlert size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${getStatusBadgeClass(emergency.status)}`}>
                          {emergency.status}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                          <Calendar size={12} />
                          {new Date(emergency.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-slate-950">
                        {emergency.message || 'SOS distress alert activated'}
                      </h2>
                    </div>
                  </div>

                  {/* Actions for active emergencies */}
                  {emergency.status === 'ACTIVE' && (
                    <div className="flex flex-wrap gap-2 self-start md:self-auto">
                      <button
                        onClick={() => handleResolve(emergency._id, 'RESOLVED')}
                        disabled={isPendingAction}
                        className="rounded-md bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                      >
                        Resolve Incident
                      </button>
                      <button
                        onClick={() => handleResolve(emergency._id, 'CANCELLED')}
                        disabled={isPendingAction}
                        className="rounded-md border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition disabled:opacity-50"
                      >
                        Cancel SOS
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {/* Location and Assessment */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <MapPin size={16} className="text-slate-500" />
                      Location and Proximity at Activation
                    </h3>
                    <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-lg border border-slate-100">
                      <div>
                        <dt className="text-slate-500 font-medium">Latitude</dt>
                        <dd className="font-mono font-semibold mt-0.5 text-slate-900">
                          {formatCoordinate(emergency.location?.latitude)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Longitude</dt>
                        <dd className="font-mono font-semibold mt-0.5 text-slate-900">
                          {formatCoordinate(emergency.location?.longitude)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Crime Risk Score</dt>
                        <dd className="font-semibold mt-0.5 text-slate-900">
                          {emergency.riskScore || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 font-medium">Risk Assessment</dt>
                        <dd className="mt-0.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${getRiskToneClass(emergency.riskLevel)}`}>
                            {emergency.riskLevel || 'UNKNOWN'}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Guardian SMS delivery alerts */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <MessageSquareWarning size={16} className="text-slate-500" />
                        Guardian Contact Notifications
                      </h3>
                      {failedCount > 0 && (
                        <button
                          onClick={() => handleRetrySms(emergency._id)}
                          disabled={isPendingAction}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-600 transition disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          Retry Failures
                        </button>
                      )}
                    </div>

                    <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {emergency.smsAlerts && emergency.smsAlerts.length > 0 ? (
                        emergency.smsAlerts.map((alertItem) => (
                          <div key={alertItem.phoneNumber} className="p-3 text-xs bg-slate-50/50 flex items-center justify-between gap-4">
                            <div>
                              <div className="font-bold text-slate-800">{alertItem.guardianName || 'Guardian'}</div>
                              <div className="text-slate-500 mt-0.5">{alertItem.phoneNumber}</div>
                              {alertItem.errorMessage && (
                                <p className="text-red-600 mt-1 italic text-[11px]">{alertItem.errorMessage}</p>
                              )}
                            </div>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                alertItem.status === 'SENT'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {alertItem.status}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="p-4 text-xs text-slate-500 italic bg-slate-50/50 text-center">
                          No guardian contact records were snapshot with this incident.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default EmergencyHistoryPage;
