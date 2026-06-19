import { useEffect, useState, useRef, useMemo } from 'react';
import { ShieldAlert, MapPinned, Radio, Phone, User as UserIcon, RefreshCw, AlertOctagon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { fetchTrackedUsers, fetchTrackingSnapshot } from '../services/trackingService.js';
import { getSocket, disconnectSocket } from '../sockets/socketClient.js';
import MapView from '../components/map/MapView.jsx';
import { CRIME_ZONES } from '../data/crimeZones.js';
import { formatAccuracy, formatCoordinate, formatTimestamp } from '../services/mapService.js';
import { getRiskToneClass, analyzeCrimeRisk } from '../utils/crimeRiskEngine.js';

function playSosAlarm() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioContext = new AudioContext();
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.2);
    gainNode.connect(audioContext.destination);

    [0, 0.3, 0.6, 0.9].forEach((offset) => {
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      
      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      
      osc1.frequency.setValueAtTime(987.77, audioContext.currentTime + offset);
      osc1.frequency.linearRampToValueAtTime(1318.51, audioContext.currentTime + offset + 0.15);
      
      osc2.frequency.setValueAtTime(1318.51, audioContext.currentTime + offset);
      osc2.frequency.linearRampToValueAtTime(987.77, audioContext.currentTime + offset + 0.15);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      
      osc1.start(audioContext.currentTime + offset);
      osc1.stop(audioContext.currentTime + offset + 0.25);
      
      osc2.start(audioContext.currentTime + offset);
      osc2.stop(audioContext.currentTime + offset + 0.25);
    });

    window.setTimeout(() => audioContext.close(), 1500);
  } catch (err) {
    console.error("Audio error", err);
  }
}

function playDangerAlarm() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioContext = new AudioContext();
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.75);
    gainNode.connect(audioContext.destination);

    [0, 0.22, 0.44].forEach((offset) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + offset);
      oscillator.connect(gainNode);
      oscillator.start(audioContext.currentTime + offset);
      oscillator.stop(audioContext.currentTime + offset + 0.14);
    });

    window.setTimeout(() => audioContext.close(), 1000);
  } catch (err) {
    console.error("Audio error", err);
  }
}

function GuardianDashboardPage() {
  const { token, user } = useAuth();
  const [trackedUsers, setTrackedUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [socketStatus, setSocketStatus] = useState('idle');
  const [socketError, setSocketError] = useState('');
  const [lastEvent, setLastEvent] = useState(null);

  // Alarms / Alerts state
  const [activeSos, setActiveSos] = useState(null);
  const [activeDanger, setActiveDanger] = useState(null);
  const [userDisconnectedAlert, setUserDisconnectedAlert] = useState(false);
  const [agentAdvisory, setAgentAdvisory] = useState(null);

  const selectedUserRef = useRef(selectedUser);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  const loadTrackedUsers = async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const response = await fetchTrackedUsers();
      setTrackedUsers(response.users || []);
    } catch (err) {
      setUsersError(err.response?.data?.message || 'Failed to load tracked users.');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadTrackedUsers();
    }
  }, [token]);

  // Handle socket connection and listeners for the selected user
  useEffect(() => {
    if (!selectedUser || !token) {
      setTrackingData(null);
      setSocketStatus('idle');
      setActiveSos(null);
      setActiveDanger(null);
      setUserDisconnectedAlert(false);
      setAgentAdvisory(null);
      disconnectSocket();
      return undefined;
    }

    setAgentAdvisory(null);

    // Fetch initial snapshot first
    const loadSnapshot = async () => {
      try {
        const data = await fetchTrackingSnapshot(selectedUser._id);
        if (data.success) {
          setTrackingData(data.tracking);
          if (data.tracking.emergencyStatus === 'ACTIVE' && data.tracking.activeEmergency) {
            setActiveSos(data.tracking.activeEmergency);
          }
        }
      } catch (err) {
        console.error('Failed to load user tracking snapshot:', err);
      }
    };

    loadSnapshot();

    const socket = getSocket(token);

    const handleConnect = () => {
      setSocketStatus('connected');
      setSocketError('');
      // Join the tracked user's room
      socket.emit('guardian-joined', { trackedUserId: selectedUser._id }, (ack) => {
        if (ack && !ack.success) {
          setSocketError(ack.message || 'Failed to join tracking room');
        }
      });
    };

    const handleDisconnect = () => {
      setSocketStatus('disconnected');
    };

    const handleConnectError = (error) => {
      setSocketStatus('error');
      setSocketError(error.message || 'Socket connection failed');
    };

    const handleLocationUpdate = (payload) => {
      if (payload.userId !== selectedUserRef.current?._id) return;
      
      setTrackingData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentLocation: payload.location,
          lastSeenAt: payload.location.updatedAt || new Date().toISOString(),
        };
      });
      setUserDisconnectedAlert(false);
    };

    const handleDangerAlert = (payload) => {
      if (payload.userId !== selectedUserRef.current?._id) return;
      setActiveDanger(payload);
      playDangerAlarm();
    };

    const handleSosAlert = (payload) => {
      if (payload.userId !== selectedUserRef.current?._id) return;
      
      const sosRecord = {
        _id: payload.emergencyId || 'live-sos',
        message: payload.message || 'SOS activated',
        location: payload.location,
        riskLevel: payload.riskLevel,
        riskScore: payload.riskScore,
        createdAt: payload.createdAt || new Date().toISOString(),
      };
      
      setActiveSos(sosRecord);
      setTrackingData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          emergencyStatus: 'ACTIVE',
          activeEmergency: sosRecord,
        };
      });
      playSosAlarm();
    };

    const handleUserDisconnected = (payload) => {
      if (payload.userId !== selectedUserRef.current?._id) return;
      setUserDisconnectedAlert(true);
    };

    const handleAgentAdvisory = (payload) => {
      if (payload.userId !== selectedUserRef.current?._id) return;
      setAgentAdvisory(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('location-update', handleLocationUpdate);
    socket.on('danger-alert', handleDangerAlert);
    socket.on('sos-alert', handleSosAlert);
    socket.on('user-disconnected', handleUserDisconnected);
    socket.on('agent-advisory', handleAgentAdvisory);

    setSocketStatus(socket.connected ? 'connected' : 'connecting');
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('location-update', handleLocationUpdate);
      socket.off('danger-alert', handleDangerAlert);
      socket.off('sos-alert', handleSosAlert);
      socket.off('user-disconnected', handleUserDisconnected);
      socket.off('agent-advisory', handleAgentAdvisory);
      disconnectSocket();
    };
  }, [selectedUser, token]);


  const dangerAssessment = useMemo(() => {
    if (!trackingData?.currentLocation) {
      return {
        nearbyZones: [],
        riskLevel: 'LOW',
        riskScore: 0,
        shouldAlert: false,
      };
    }
    return analyzeCrimeRisk(trackingData.currentLocation);
  }, [trackingData?.currentLocation]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Guardian Portal</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Live Tracking Dashboard</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Realtime monitoring dashboard to oversee the safety of family members or friends who designated you as a guardian.
          </p>
        </div>
        <button
          onClick={loadTrackedUsers}
          className="inline-flex items-center gap-2 self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
        >
          <RefreshCw size={16} className={loadingUsers ? 'animate-spin' : ''} />
          Refresh List
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left column: Tracked Users List */}
        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h2 className="text-lg font-bold text-slate-950 mb-4 flex items-center gap-2">
            <UserIcon size={18} className="text-slate-500" />
            Tracked Users ({trackedUsers.length})
          </h2>

          {loadingUsers ? (
            <div className="space-y-3 py-4">
              <div className="h-10 animate-pulse rounded bg-slate-100" />
              <div className="h-10 animate-pulse rounded bg-slate-100" />
            </div>
          ) : usersError ? (
            <p className="text-sm text-red-600 py-2">{usersError}</p>
          ) : trackedUsers.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 italic">
              No one has added you as a guardian contact yet, or their phone numbers don't match yours.
            </p>
          ) : (
            <div className="space-y-2">
              {trackedUsers.map((u) => {
                const isSelected = selectedUser?._id === u._id;
                return (
                  <button
                    key={u._id}
                    onClick={() => setSelectedUser(u)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/70 text-brand-700'
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Phone size={10} /> {u.phoneNumber}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right column: Map and details */}
        <div>
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-16 bg-white text-center">
              <MapPinned size={48} className="text-slate-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-800">No User Selected</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-2">
                Select a user from the panel on the left to start live tracking and receive real-time alerts.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Emergency Banner */}
              {activeSos && (
                <div className="rounded-lg border border-red-200 bg-red-600 text-white p-5 shadow-soft animate-pulse">
                  <div className="flex items-start gap-4 justify-between">
                    <div className="flex items-start gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white text-red-600">
                        <AlertOctagon size={26} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-red-100">CRITICAL EMERGENCY SOS ACTIVE</p>
                        <h2 className="mt-1 text-2xl font-black">
                          {selectedUser.name} has triggered SOS!
                        </h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed">
                          Message: "{activeSos.message}"
                        </p>
                        <p className="mt-1 text-xs text-red-100">
                          Started at: {formatTimestamp(activeSos.createdAt)} | Location: {formatCoordinate(activeSos.location?.latitude)}, {formatCoordinate(activeSos.location?.longitude)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveSos(null)}
                      className="rounded bg-red-700 hover:bg-red-800 px-3 py-1.5 text-xs font-bold text-white transition"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              )}

              {/* Danger Warning Banner */}
              {activeDanger && !activeSos && (
                <div className="rounded-lg border border-orange-200 bg-orange-500 text-white p-4 shadow-soft">
                  <div className="flex items-start gap-4 justify-between">
                    <div className="flex items-start gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-orange-500">
                        <ShieldAlert size={22} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-orange-100">DANGER ZONE ENTERED</p>
                        <h2 className="mt-1 text-lg font-bold">
                          {selectedUser.name} entered a {activeDanger.riskLevel} risk zone.
                        </h2>
                        <p className="mt-1 text-sm">
                          Zone: {activeDanger.zone?.label || 'Crime hotspot'} ({activeDanger.zone?.distanceMeters}m away)
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveDanger(null)}
                      className="rounded bg-orange-600 hover:bg-orange-700 px-3 py-1 text-xs font-bold text-white transition"
                    >
                      Dismiss Alert
                    </button>
                  </div>
                </div>
              )}

              {/* Disconnection Warning */}
              {userDisconnectedAlert && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-soft">
                  <p className="text-sm font-semibold">
                    ⚠️ {selectedUser.name} went offline or disconnected from live tracking. Coordinates displayed may be stale.
                  </p>
                </div>
              )}

              {/* Socket Error */}
              {socketError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 shadow-soft">
                  <p className="text-sm font-semibold">
                    Error: {socketError}
                  </p>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                {/* Map Area */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                      <Radio size={20} className={socketStatus === 'connected' ? 'text-brand-500 animate-pulse' : 'text-slate-400'} />
                      {selectedUser.name}'s Live Location
                    </h3>
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-700 capitalize">
                      Status: {socketStatus}
                    </span>
                  </div>

                  <MapView
                    location={trackingData?.currentLocation}
                    riskZones={CRIME_ZONES}
                    status={socketStatus === 'connected' ? 'ready' : 'locating'}
                  />
                </div>

                {/* Tracking stats / Info panel */}
                <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft self-start">
                  <h3 className="text-lg font-bold text-slate-950 border-b border-slate-100 pb-3">
                    Status Overview
                  </h3>
                  
                  <dl className="mt-4 space-y-4 text-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">Tracking Status</dt>
                      <dd className="font-semibold text-slate-900 capitalize">
                        {socketStatus === 'connected' ? 'Active' : 'Disconnected'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">Risk Assessment</dt>
                      <dd className={`rounded px-2 py-0.5 text-xs font-bold ${getRiskToneClass(dangerAssessment.riskLevel)}`}>
                        {dangerAssessment.riskLevel} ({dangerAssessment.riskScore})
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">Latitude</dt>
                      <dd className="font-mono font-semibold text-slate-900">
                        {formatCoordinate(trackingData?.currentLocation?.latitude)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">Longitude</dt>
                      <dd className="font-mono font-semibold text-slate-900">
                        {formatCoordinate(trackingData?.currentLocation?.longitude)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">Accuracy</dt>
                      <dd className="font-semibold text-slate-900">
                        {formatAccuracy(trackingData?.currentLocation?.accuracy)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500 font-medium">Last Seen</dt>
                      <dd className="font-semibold text-slate-900">
                        {formatTimestamp(trackingData?.lastSeenAt)}
                      </dd>
                    </div>
                  </dl>

                  {dangerAssessment.nearbyZones.length > 0 && (
                    <div className="mt-5 rounded bg-slate-50 p-3 border border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nearby Zones</p>
                      <div className="mt-2 space-y-2">
                        {dangerAssessment.nearbyZones.slice(0, 2).map((zone) => (
                          <div key={zone.id} className="text-xs">
                            <div className="font-bold text-slate-800">{zone.label}</div>
                            <div className="text-slate-500 mt-0.5">
                              {Math.round(zone.distanceMeters)}m away | Risk: {zone.level}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {agentAdvisory && (
                    <div className="mt-5 border-t border-slate-100 pt-4 space-y-4">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Safety Agent Telemetry
                      </h4>
                      <div className="text-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Movement Status</span>
                          <span className="font-bold text-slate-800 capitalize">
                            {agentAdvisory.movement?.status?.toLowerCase() || 'unknown'}
                            {agentAdvisory.movement?.status === 'STATIONARY' && agentAdvisory.movement?.stationaryDurationSeconds > 10 && (
                              <span className="text-[10px] text-slate-400 font-medium ml-1">
                                ({Math.round(agentAdvisory.movement.stationaryDurationSeconds)}s)
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-medium">Threat Level</span>
                            <span className="font-bold font-mono text-slate-900">
                              {agentAdvisory.threatScore}/100
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                            <div
                              className={`h-1 transition-all duration-300 ${
                                agentAdvisory.threatScore >= 75 ? 'bg-red-600' :
                                agentAdvisory.threatScore >= 45 ? 'bg-orange-500' :
                                agentAdvisory.threatScore >= 20 ? 'bg-amber-500' :
                                'bg-brand-500'
                              }`}
                              style={{ width: `${agentAdvisory.threatScore}%` }}
                            />
                          </div>
                        </div>

                        {agentAdvisory.breakdown && (
                          <div className="rounded bg-slate-50 p-2.5 space-y-2 border border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Hazard Factors
                            </div>
                            
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Crime Proximity</span>
                              <span className="font-bold font-mono text-slate-700">
                                {agentAdvisory.breakdown.crime || 0}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Device Battery</span>
                              <span className="font-bold font-mono text-slate-700">
                                {agentAdvisory.breakdown.battery || 0}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Route Deviation</span>
                              <span className="font-bold font-mono text-slate-700">
                                {agentAdvisory.breakdown.deviation || 0}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Immobility Penalty</span>
                              <span className="font-bold font-mono text-slate-700">
                                {agentAdvisory.breakdown.immobility || 0}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedUser(null)}

                    className="mt-6 w-full rounded-md border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Stop Tracking
                  </button>
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default GuardianDashboardPage;
