import Emergency from '../models/Emergency.model.js';
import { sendEmergencySmsAlerts } from '../services/twilio.service.js';
import { getIo } from '../sockets/index.js';
import { getGuardianRoom, getUserRoom } from '../sockets/socketRooms.js';

export async function executeSafetyAction(userId, user, evaluation) {
  let io;
  try {
    io = getIo();
  } catch {
    // If Socket.IO hasn't finished initial setup (e.g. during test hooks), skip broadcast
    return;
  }

  const userRoom = getUserRoom(userId);
  const guardianRoom = getGuardianRoom(userId);
  const { status, threatScore, reason, riskAnalysis } = evaluation;

  if (status === 'ADVISORY' || status === 'WARNING') {
    const payload = {
      userId,
      name: user.name,
      status,
      threatScore,
      reason,
      movement: riskAnalysis?.movement || { status: 'UNKNOWN', speed: 0, stationaryDurationSeconds: 0 },
      breakdown: {
        crime: riskAnalysis?.crime?.score || 0,
        battery: riskAnalysis?.battery || 0,
        temporal: riskAnalysis?.temporal || 0,
        deviation: riskAnalysis?.deviation || 0,
        immobility: riskAnalysis?.immobility || 0,
      },
      timestamp: new Date().toISOString(),
    };
    io.to(userRoom).emit('agent-advisory', payload);
    io.to(guardianRoom).emit('agent-advisory', payload);
  }


  if (status === 'CRITICAL') {
    const activeEmergency = await Emergency.findOne({
      user: userId,
      status: 'ACTIVE',
    });

    if (activeEmergency) {
      return;
    }

    const latestLocation =
      riskAnalysis?.riskAnalysis?.location ||
      user.currentLocation ||
      { latitude: 19.076, longitude: 72.8777 }; // Default fallback Mumbai coordinates

    const emergency = await Emergency.create({
      user: userId,
      message: `Safety Agent Escalation: Critically high travel hazard (${reason})`,
      location: {
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        accuracy: latestLocation.accuracy || null,
        updatedAt: new Date(),
      },
      riskLevel: riskAnalysis?.crime?.score >= 75 ? 'CRITICAL' : 'HIGH',
      riskScore: threatScore,
      guardianContacts: user.guardianContacts,
    });

    emergency.smsAlerts = await sendEmergencySmsAlerts({
      emergency,
      user,
    });
    await emergency.save();

    const sosPayload = {
      userId,
      name: user.name,
      emergencyId: emergency._id,
      location: emergency.location,
      riskLevel: emergency.riskLevel,
      riskScore: emergency.riskScore,
      message: emergency.message,
      createdAt: emergency.createdAt,
    };

    io.to(userRoom).emit('sos-alert', sosPayload);
    io.to(guardianRoom).emit('sos-alert', sosPayload);
    
    io.to(userRoom).emit('agent-escalation', {
      userId,
      emergencyId: emergency._id,
      reason,
      threatScore,
    });
  }
}
