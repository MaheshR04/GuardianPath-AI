import { useState } from 'react';
import { MessageSquareWarning, PhoneCall, RotateCcw, ShieldAlert, X } from 'lucide-react';
import {
  activateSosRequest,
  resolveEmergencyRequest,
  retryEmergencySmsRequest,
} from '../../services/emergencyService.js';
import { emitSosAlert } from '../../sockets/socketClient.js';
import { formatCoordinate, formatTimestamp } from '../../services/mapService.js';

function SosPanel({ dangerAssessment, isTracking, location, startTracking, token, user }) {
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryingSms, setRetryingSms] = useState(false);
  const [resolvedMessage, setResolvedMessage] = useState('');

  const activateSos = async () => {
    setError('');
    setResolvedMessage('');

    if (!location) {
      setError('Allow location access before activating SOS.');
      startTracking();
      return;
    }

    if (!isTracking) {
      startTracking();
    }

    setLoading(true);

    try {
      const response = await activateSosRequest({
        message: 'SOS emergency activated',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          updatedAt: new Date(location.timestamp || Date.now()).toISOString(),
        },
        riskLevel: dangerAssessment?.riskLevel || 'UNKNOWN',
        riskScore: dangerAssessment?.riskScore || 0,
      });

      setActiveEmergency(response.emergency);
      emitSosAlert(token, {
        emergencyId: response.emergency._id,
        location: response.emergency.location,
        riskLevel: response.emergency.riskLevel,
        riskScore: response.emergency.riskScore,
        message: response.emergency.message,
      });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to activate SOS right now.');
    } finally {
      setLoading(false);
    }
  };

  const closeEmergency = async (status = 'RESOLVED') => {
    if (!activeEmergency) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await resolveEmergencyRequest(activeEmergency._id, status);
      setActiveEmergency(null);
      setResolvedMessage(`Emergency marked ${response.emergency.status.toLowerCase()}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update emergency status.');
    } finally {
      setLoading(false);
    }
  };

  const retrySms = async () => {
    if (!activeEmergency) {
      return;
    }

    setRetryingSms(true);
    setError('');

    try {
      const response = await retryEmergencySmsRequest(activeEmergency._id);
      setActiveEmergency(response.emergency);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to retry SMS alerts.');
    } finally {
      setRetryingSms(false);
    }
  };

  const sentCount = activeEmergency?.smsAlerts?.filter((alert) => alert.status === 'SENT').length || 0;
  const failedCount = activeEmergency?.smsAlerts?.filter((alert) => alert.status !== 'SENT').length || 0;

  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Emergency SOS</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Instant guardian alert</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            SOS saves your emergency, broadcasts realtime alerts, and sends SMS to trusted guardians when Twilio is configured.
          </p>
        </div>
        <button
          type="button"
          onClick={activateSos}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-6 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-soft transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <PhoneCall size={19} aria-hidden="true" />
          {loading ? 'Sending SOS' : 'SOS'}
        </button>
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {resolvedMessage ? (
        <p className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{resolvedMessage}</p>
      ) : null}

      {activeEmergency ? (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/60 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-red-600 text-white">
                <ShieldAlert size={24} aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={() => closeEmergency('CANCELLED')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Cancel emergency"
                title="Cancel emergency"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p className="mt-5 text-sm font-bold uppercase tracking-wide text-red-600">SOS active</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{user?.name} may need help.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Emergency log created, realtime alert sent, and guardian SMS alerts processed.
            </p>

            <dl className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-slate-500">Risk</dt>
                <dd className="font-bold text-slate-950">
                  {activeEmergency.riskLevel} {activeEmergency.riskScore}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-slate-500">Latitude</dt>
                <dd className="font-mono text-slate-950">{formatCoordinate(activeEmergency.location.latitude)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-slate-500">Longitude</dt>
                <dd className="font-mono text-slate-950">{formatCoordinate(activeEmergency.location.longitude)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-slate-500">Created</dt>
                <dd className="font-semibold text-slate-950">{formatTimestamp(activeEmergency.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-5 rounded-md border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Guardian SMS alerts</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {sentCount} sent, {failedCount} pending or failed.
                  </p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-600">
                  <MessageSquareWarning size={18} aria-hidden="true" />
                </span>
              </div>

              {activeEmergency.smsAlerts?.length ? (
                <div className="mt-4 space-y-2">
                  {activeEmergency.smsAlerts.map((alert) => (
                    <div key={`${alert.phoneNumber}-${alert.lastAttemptAt}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">{alert.guardianName || alert.phoneNumber}</span>
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-bold ${
                            alert.status === 'SENT'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {alert.phoneNumber} {alert.errorMessage ? `- ${alert.errorMessage}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No guardian contacts were attached to this emergency.</p>
              )}

              {failedCount > 0 ? (
                <button
                  type="button"
                  onClick={retrySms}
                  disabled={retryingSms}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {retryingSms ? 'Retrying SMS' : 'Retry SMS Alerts'}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => closeEmergency('RESOLVED')}
              disabled={loading}
              className="mt-6 w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Mark Emergency Resolved
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default SosPanel;
