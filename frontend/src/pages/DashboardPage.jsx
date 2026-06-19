import { useMemo, useState } from 'react';
import { AlertTriangle, LocateFixed, MapPinned, Navigation, RadioTower, Search } from 'lucide-react';
import SosPanel from '../components/emergency/SosPanel.jsx';
import GuardianContactsEditor from '../components/forms/GuardianContactsEditor.jsx';
import MapView from '../components/map/MapView.jsx';
import { CRIME_ZONES } from '../data/crimeZones.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCurrentLocation } from '../hooks/useCurrentLocation.js';
import { useDangerAlertSocket } from '../hooks/useDangerAlertSocket.js';
import { useLiveTracking } from '../hooks/useLiveTracking.js';
import { formatAccuracy, formatCoordinate, formatTimestamp } from '../services/mapService.js';
import { fetchRouteAlternatives, searchDestinations } from '../services/routeService.js';
import { analyzeCrimeRisk, getRiskToneClass } from '../utils/crimeRiskEngine.js';
import { compareRoutes, formatDistance, formatDuration } from '../utils/routeComparison.js';

const cards = [
  {
    icon: LocateFixed,
    title: 'Location tracking',
    text: 'Browser geolocation is active and feeds the map marker as coordinates change.',
  },
  {
    icon: RadioTower,
    title: 'Realtime sockets',
    text: 'Socket.IO shares coordinates with the backend and private guardian rooms.',
  },
  {
    icon: AlertTriangle,
    title: 'Danger detection',
    text: 'Nearby risk zones are checked in realtime and alerts fire for high-risk areas.',
  },
];

function DashboardPage() {
  const { token, updateGuardianContacts, user } = useAuth();
  const {
    error: locationError,
    isTracking,
    location,
    startTracking,
    status: locationStatus,
    stopTracking,
  } = useCurrentLocation();
  const { connectedUsers, lastSharedAt, socketError, socketId, socketStatus } = useLiveTracking({
    enabled: isTracking,
    location,
    token,
  });
  const dangerAssessment = useMemo(() => analyzeCrimeRisk(location), [location]);
  useDangerAlertSocket({
    assessment: dangerAssessment,
    enabled: isTracking,
    location,
    token,
  });
  const [guardianContacts, setGuardianContacts] = useState(user?.guardianContacts || []);
  const [agentTelemetry, setAgentTelemetry] = useState(null);

  useEffect(() => {
    if (!isTracking) {
      setAgentTelemetry(null);
      return undefined;
    }

    const handleAdvisory = (event) => {
      setAgentTelemetry(event.detail);
    };

    window.addEventListener('agent-advisory', handleAdvisory);
    return () => window.removeEventListener('agent-advisory', handleAdvisory);
  }, [isTracking]);

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationResults, setDestinationResults] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeError, setRouteError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);

  const safestRoute = routes.find((route) => route.isSafest);

  const saveContacts = async (event) => {
    event.preventDefault();
    setStatus('');
    setError('');
    setSaving(true);

    const cleanedContacts = guardianContacts.filter(
      (contact) => contact.name.trim() && contact.phoneNumber.trim(),
    );

    try {
      await updateGuardianContacts(cleanedContacts);
      setGuardianContacts(cleanedContacts);
      setStatus('Guardian contacts saved successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save guardian contacts.');
    } finally {
      setSaving(false);
    }
  };

  const handleDestinationSearch = async (event) => {
    event.preventDefault();
    setRouteError('');
    setRouteStatus('');
    setRouteLoading(true);

    try {
      const results = await searchDestinations(destinationQuery, location);
      setDestinationResults(results);
      setSelectedDestination(null);
      setRoutes([]);
      setSelectedRouteId('');

      if (results.length === 0) {
        setRouteError('No destination found. Try a more specific place name.');
      }
    } catch (requestError) {
      setRouteError(requestError.message || 'Destination search failed.');
    } finally {
      setRouteLoading(false);
    }
  };

  const selectDestination = (destination) => {
    setSelectedDestination(destination);
    setDestinationQuery(destination.label);
    setDestinationResults([]);
    setRoutes([]);
    setSelectedRouteId('');
    setRouteStatus('Destination selected. Generate safe routes when ready.');
  };

  const generateRoutes = async () => {
    setRouteError('');
    setRouteStatus('');

    if (!location) {
      setRouteError('Allow location access before generating routes.');
      return;
    }

    if (!selectedDestination) {
      setRouteError('Select a destination from search results first.');
      return;
    }

    setRouteLoading(true);

    try {
      const alternatives = await fetchRouteAlternatives(location, selectedDestination);
      const rankedRoutes = compareRoutes(alternatives);
      setRoutes(rankedRoutes);
      setSelectedRouteId(rankedRoutes[0]?.id || '');
      setRouteStatus(`${rankedRoutes.length} route option${rankedRoutes.length === 1 ? '' : 's'} generated.`);
    } catch (requestError) {
      setRouteError(requestError.message || 'Unable to generate routes.');
    } finally {
      setRouteLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Protected area</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Safety Dashboard</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Welcome, {user?.name}. Your account is authenticated and ready for map, tracking, and SOS features.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <card.icon className="text-brand-700" size={26} aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.text}</p>
          </article>
        ))}
      </div>

      {dangerAssessment.shouldAlert ? (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800 shadow-soft">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-red-600 text-white">
              <AlertTriangle size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide">Danger zone warning</p>
              <h2 className="mt-1 text-xl font-bold">
                You are near a {dangerAssessment.riskLevel.toLowerCase()} risk area.
              </h2>
              <p className="mt-2 text-sm leading-6">
                Closest zone: {dangerAssessment.nearbyZones[0]?.label}. Move toward a populated, well-lit route and keep
                live tracking active.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isTracking && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-600"></span>
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-950">Safety Agent HUD</h3>
                <p className="text-xs text-slate-500 mt-0.5">AI-powered risk intelligence monitoring active.</p>
              </div>
            </div>

            {agentTelemetry ? (
              <div className="flex flex-wrap gap-4 text-sm sm:items-center">
                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Status:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                    agentTelemetry.status === 'CRITICAL' ? 'bg-red-600 text-white animate-pulse' :
                    agentTelemetry.status === 'WARNING' ? 'bg-orange-500 text-white' :
                    agentTelemetry.status === 'ADVISORY' ? 'bg-amber-100 text-amber-800' :
                    'bg-emerald-100 text-emerald-800'
                  }`}>
                    {agentTelemetry.status}
                  </span>
                </div>

                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Movement:</span>
                  <span className="font-bold text-slate-900 capitalize">
                    {agentTelemetry.movement?.status?.toLowerCase() || 'calculating...'}
                    {agentTelemetry.movement?.status === 'STATIONARY' && agentTelemetry.movement?.stationaryDurationSeconds > 10 && (
                      <span className="text-xs text-slate-500 font-medium ml-1">
                        ({Math.round(agentTelemetry.movement.stationaryDurationSeconds)}s)
                      </span>
                    )}
                  </span>
                </div>

                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Threat:</span>
                  <span className="font-mono font-bold text-slate-950">{agentTelemetry.threatScore}/100</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium italic">Awaiting first update loop...</p>
            )}
          </div>

          {agentTelemetry && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-700">{agentTelemetry.reason}</p>
                {agentTelemetry.status !== 'NORMAL' && (
                  <p className="text-xs font-bold text-amber-600 bg-amber-50 rounded px-2.5 py-1 animate-pulse">
                    ⚠️ Advice: Keep moving and head to well-lit public corridors.
                  </p>
                )}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                <div
                  className={`h-1.5 transition-all duration-500 ${
                    agentTelemetry.threatScore >= 75 ? 'bg-red-600' :
                    agentTelemetry.threatScore >= 45 ? 'bg-orange-500' :
                    agentTelemetry.threatScore >= 20 ? 'bg-amber-500' :
                    'bg-brand-500'
                  }`}
                  style={{ width: `${agentTelemetry.threatScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <SosPanel

          dangerAssessment={dangerAssessment}
          isTracking={isTracking}
          location={location}
          startTracking={startTracking}
          token={token}
          user={user}
        />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <form onSubmit={handleDestinationSearch} className="flex-1">
            <label htmlFor="destination" className="text-sm font-medium text-slate-700">
              Destination
            </label>
            <div className="mt-2 flex gap-3">
              <input
                id="destination"
                value={destinationQuery}
                onChange={(event) => setDestinationQuery(event.target.value)}
                placeholder="Search a place, landmark, or address"
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                required
              />
              <button
                type="submit"
                disabled={routeLoading}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search size={17} aria-hidden="true" />
                Search
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={generateRoutes}
            disabled={routeLoading || !selectedDestination}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Navigation size={17} aria-hidden="true" />
            Generate Safe Routes
          </button>
        </div>

        {destinationResults.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
            {destinationResults.map((destination) => (
              <button
                key={destination.id}
                type="button"
                onClick={() => selectDestination(destination)}
                className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-brand-50 hover:text-brand-700"
              >
                {destination.label}
              </button>
            ))}
          </div>
        ) : null}

        {routeStatus ? <p className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{routeStatus}</p> : null}
        {routeError ? <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{routeError}</p> : null}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <MapView
          destination={selectedDestination}
          location={location}
          riskZones={CRIME_ZONES}
          routes={routes}
          selectedRouteId={selectedRouteId}
          status={locationStatus}
        />

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Live coordinates</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Current location</h2>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700">
              <MapPinned size={22} aria-hidden="true" />
            </span>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Status</dt>
              <dd className="font-semibold capitalize text-slate-900">{locationStatus}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Socket</dt>
              <dd className="font-semibold capitalize text-slate-900">{socketStatus}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Risk</dt>
              <dd className={`rounded-md px-2 py-1 text-xs font-bold ${getRiskToneClass(dangerAssessment.riskLevel)}`}>
                {dangerAssessment.riskLevel} {dangerAssessment.riskScore}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Latitude</dt>
              <dd className="font-mono text-slate-900">{formatCoordinate(location?.latitude)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Longitude</dt>
              <dd className="font-mono text-slate-900">{formatCoordinate(location?.longitude)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-medium text-slate-500">Accuracy</dt>
              <dd className="font-semibold text-slate-900">{formatAccuracy(location?.accuracy)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-slate-500">Last update</dt>
              <dd className="font-semibold text-slate-900">{formatTimestamp(location?.timestamp)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
              <dt className="font-medium text-slate-500">Last shared</dt>
              <dd className="font-semibold text-slate-900">{formatTimestamp(lastSharedAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-slate-500">Online users</dt>
              <dd className="font-semibold text-slate-900">{connectedUsers.length}</dd>
            </div>
          </dl>

          {locationError ? (
            <p className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">{locationError}</p>
          ) : null}
          {socketError ? (
            <p className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{socketError}</p>
          ) : null}
          {socketId ? <p className="mt-4 truncate text-xs text-slate-400">Socket ID: {socketId}</p> : null}

          {dangerAssessment.nearbyZones.length > 0 ? (
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nearby risk zones</p>
              <div className="mt-3 space-y-2">
                {dangerAssessment.nearbyZones.slice(0, 3).map((zone) => (
                  <div key={zone.id} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{zone.label}</span>
                      <span className="text-xs font-bold text-slate-500">{zone.level}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {Math.round(zone.distanceMeters)} m away - {zone.category}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={isTracking ? stopTracking : startTracking}
            className="mt-6 w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {isTracking ? 'Pause Tracking' : 'Start Tracking'}
          </button>
        </aside>
      </div>

      {routes.length > 0 ? (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Route comparison</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                Safest route score: {safestRoute?.safetyScore}
              </h2>
            </div>
            <p className="text-sm text-slate-500">Risk zones are now shared with danger detection.</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {routes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => setSelectedRouteId(route.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  route.id === selectedRouteId
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-brand-300'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Option {route.rank}</span>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${
                      route.isSafest ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {route.isSafest ? 'Safest' : route.riskLevel}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Score</dt>
                    <dd className="mt-1 font-bold text-slate-950">{route.safetyScore}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Distance</dt>
                    <dd className="mt-1 font-bold text-slate-950">{formatDistance(route.distance)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ETA</dt>
                    <dd className="mt-1 font-bold text-slate-950">{formatDuration(route.duration)}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={saveContacts} className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <GuardianContactsEditor contacts={guardianContacts} onChange={setGuardianContacts} />

        {status ? <p className="mt-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{status}</p> : null}
        {error ? <p className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Saving contacts...' : 'Save Guardian Contacts'}
        </button>
      </form>
    </section>
  );
}

export default DashboardPage;
