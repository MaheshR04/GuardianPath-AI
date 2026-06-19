import { toolExecutor } from './ToolExecutor.js';
import { memoryManager } from './MemoryManager.js';
import { analyzeAllRisks } from './RiskAnalyzer.js';
import { getIo } from '../sockets/index.js';
import { getUserRoom, getGuardianRoom } from '../sockets/socketRooms.js';
import Emergency from '../models/Emergency.model.js';
import { sendEmergencySmsAlerts } from '../services/twilio.service.js';

export function registerAllTools() {
  // 1. Location Tool
  toolExecutor.registerTool(
    'get_current_position',
    'Retrieve the user\'s latest GPS position, speed, and movement status history.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the tracked user' },
      },
      required: ['userId'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const memory = memoryManager.getMemory(userId);
      const latest = memory.locationHistory[memory.locationHistory.length - 1];
      return latest || { latitude: 0, longitude: 0, timestamp: new Date().toISOString() };
    }
  );

  // 2. Risk Tool
  toolExecutor.registerTool(
    'calculate_risk_score',
    'Calculate granular threat metrics including crime density, battery drain, temporal risk, route deviation, and immobility markers.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
      },
      required: ['userId'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const memory = memoryManager.getMemory(userId);
      const riskAnalysis = analyzeAllRisks(memory);
      return riskAnalysis;
    }
  );

  // 3. Navigation Tool
  toolExecutor.registerTool(
    'generate_safe_route',
    'Autonomously trigger safe route recalculated detour proposals on the user\'s client HUD maps.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
        reason: { type: 'string', description: 'Reason for recalculation' },
      },
      required: ['userId'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const io = getIo();
      const userRoom = getUserRoom(userId);

      io.to(userRoom).emit('agent-decision', {
        userId,
        type: 'GENERATE_SAFE_ROUTE',
        reason: args.reason || 'Safety Agent has initiated safe detour route generation.',
      });
      return { success: true, message: 'Safe route generation socket emitted to user client.' };
    }
  );

  // 4. Notification Tool
  toolExecutor.registerTool(
    'send_alerts',
    'Transmit security alerts, low battery warnings, or safety confirmation checks to the user and their guardians.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
        type: { type: 'string', enum: ['BATTERY_WARNING', 'TRIGGER_SAFETY_CHECK', 'ADVISORY_UPDATE'] },
        reason: { type: 'string' },
        payload: { type: 'object' },
      },
      required: ['userId', 'type'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const io = getIo();
      const userRoom = getUserRoom(userId);
      const guardianRoom = getGuardianRoom(userId);

      if (args.type === 'BATTERY_WARNING') {
        io.to(userRoom).emit('agent-decision', {
          userId,
          type: 'BATTERY_WARNING',
          reason: args.reason || 'Battery critically low (< 10%).',
          rawBatteryLevel: args.payload?.rawBatteryLevel,
        });
        io.to(guardianRoom).emit('agent-decision', {
          userId,
          type: 'BATTERY_WARNING',
          reason: `Tracked member's phone battery is critically low (< 10%).`,
          rawBatteryLevel: args.payload?.rawBatteryLevel,
        });
      } else if (args.type === 'TRIGGER_SAFETY_CHECK') {
        const memory = memoryManager.getMemory(userId);
        if (!memory.safetyCheckActive) {
          memory.safetyCheckActive = true;
          memory.safetyCheckExpiresAt = new Date(Date.now() + 15 * 1000);

          io.to(userRoom).emit('agent-decision', {
            userId,
            type: 'TRIGGER_SAFETY_CHECK',
            reason: args.reason || 'User stationary in high crime risk zone.',
            durationSeconds: 15,
          });
          io.to(guardianRoom).emit('agent-decision', {
            userId,
            type: 'TRIGGER_SAFETY_CHECK',
            reason: `AI safety check initiated.`,
            durationSeconds: 15,
          });
        }
      } else {
        // standard advisory/warning
        const payloadUpdate = {
          userId,
          name: context.user?.name || 'User',
          ...args.payload,
        };
        io.to(userRoom).emit('agent-advisory', payloadUpdate);
        io.to(guardianRoom).emit('agent-advisory', payloadUpdate);
      }
      return { success: true, message: 'Safety alerts transmitted successfully via socket.' };
    }
  );

  // 5. Emergency Tool
  toolExecutor.registerTool(
    'trigger_sos_actions',
    'Escalate system status, create active emergency logs in database, and dispatch SOS alerts (including SMS notifications) immediately.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
        reason: { type: 'string', description: 'Reason for emergency trigger' },
        threatScore: { type: 'number' },
      },
      required: ['userId'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const user = context.user;
      const io = getIo();
      const userRoom = getUserRoom(userId);
      const guardianRoom = getGuardianRoom(userId);

      const activeEmergency = await Emergency.findOne({
        user: userId,
        status: 'ACTIVE',
      });

      if (activeEmergency) {
        return { success: false, message: 'An active emergency already exists for this user.' };
      }

      const latestLocation =
        context.location ||
        user?.currentLocation ||
        { latitude: 19.076, longitude: 72.8777 };

      const emergency = await Emergency.create({
        user: userId,
        message: `Safety Agent Escalation: Critically high travel hazard (${args.reason || 'Unknown threat'})`,
        location: {
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude,
          accuracy: latestLocation.accuracy || null,
          updatedAt: new Date(),
        },
        riskLevel: 'CRITICAL',
        riskScore: args.threatScore || 100,
        guardianContacts: user?.guardianContacts || [],
      });

      if (user) {
        emergency.smsAlerts = await sendEmergencySmsAlerts({
          emergency,
          user,
        });
        await emergency.save();
      }

      const sosPayload = {
        userId,
        name: user?.name || 'User',
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
        reason: args.reason,
        threatScore: args.threatScore || 100,
      });

      return {
        success: true,
        emergencyId: emergency._id,
        message: 'Emergency created and SOS alerts dispatched.',
      };
    }
  );

  // 6. Guardian Tool
  toolExecutor.registerTool(
    'update_guardians',
    'Push safety level status and direct warning messages specifically to the guardian tracking panel.',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
        reason: { type: 'string' },
      },
      required: ['userId'],
    },
    async (args, context) => {
      const userId = args.userId || context.userId;
      const io = getIo();
      const guardianRoom = getGuardianRoom(userId);

      io.to(guardianRoom).emit('agent-decision', {
        userId,
        type: 'NOTIFY_GUARDIAN',
        reason: args.reason || `Risk metrics critical. Guardian notified.`,
      });
      return { success: true, message: 'Guardian rooms updated with alert state.' };
    }
  );
}
