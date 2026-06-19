import { memoryManager } from './MemoryManager.js';
import { evaluateSafetyState } from './DecisionEngine.js';
import { toolExecutor } from './ToolExecutor.js';
import { selectToolsForState } from './ToolSelectionLogic.js';
import { getIo } from '../sockets/index.js';
import { getGuardianRoom, getUserRoom } from '../sockets/socketRooms.js';

class SafetyAgent {
  async onUserUpdate(userId, user, payload) {
    if (!userId || !user) return;

    // 1. Observe: Capture current telemetry and update memory state
    if (payload.location) {
      memoryManager.updateLocation(userId, payload.location);
    }
    if (payload.battery) {
      memoryManager.updateBattery(userId, payload.battery);
    }
    if (payload.activeRoute !== undefined) {
      memoryManager.updateRoute(userId, payload.activeRoute);
    }

    const memory = memoryManager.getMemory(userId);

    // Phase 4 & 5: Handle safety check timeout escalation via Emergency Tool
    if (memory.safetyCheckActive && memory.safetyCheckExpiresAt && new Date() > new Date(memory.safetyCheckExpiresAt)) {
      memory.safetyCheckActive = false;
      memory.stationaryDurationSeconds = 0; // reset stationary duration

      const currentCycleToolCalls = [];
      const res = await toolExecutor.execute('trigger_sos_actions', {
        userId,
        reason: 'User failed to respond to autonomous AI Safety Check',
        threatScore: 100,
      }, { userId, user });

      if (res.logEntry) {
        currentCycleToolCalls.push(res.logEntry);
      }

      memoryManager.addReasoningLog(userId, {
        observation: 'Safety check timed out without user confirmation.',
        thought: 'User is unresponsive. Safety metrics forced to maximum.',
        reasoning: 'Safety check timeout rules met. Escalating status to CRITICAL.',
        decision: 'Escalate to Emergency Protocol.',
        action: 'Trigger Twilio SMS Alerts & SOS Sockets via Emergency Tool.',
        result: 'Emergency protocol successfully activated.',
        toolCalls: currentCycleToolCalls,
      });

      this.broadcastReasoning(userId, user);
      return;
    }

    const latestLoc = memory.locationHistory[memory.locationHistory.length - 1];
    
    const lat = latestLoc?.latitude?.toFixed(5) || 'N/A';
    const lng = latestLoc?.longitude?.toFixed(5) || 'N/A';
    const accuracy = latestLoc?.accuracy ? Math.round(latestLoc.accuracy) + 'm' : 'N/A';
    const battLevel = memory.battery?.level !== null && memory.battery?.level !== undefined
      ? Math.round(memory.battery.level * 100) + '%'
      : 'N/A';
    const routeStatus = memory.activeRoute ? 'Active destination route selected' : 'No route active';

    const observation = `User telemetry observed. Position: [${lat}, ${lng}] (accuracy: ${accuracy}), Battery: ${battLevel}, Route: ${routeStatus}.`;

    // 2. Tool Execution - Step A: Observe state and evaluate threat
    const currentCycleToolCalls = [];

    const posRes = await toolExecutor.execute('get_current_position', { userId }, { userId });
    if (posRes.logEntry) {
      currentCycleToolCalls.push(posRes.logEntry);
    }
    const latestLocObserved = posRes.output;

    const riskRes = await toolExecutor.execute('calculate_risk_score', { userId }, { userId });
    if (riskRes.logEntry) {
      currentCycleToolCalls.push(riskRes.logEntry);
    }
    const riskAnalysis = riskRes.output;

    const thought = `Component hazard check: Proximity crime score is ${riskAnalysis.crime.score} (nearest zone: ${riskAnalysis.crime.nearbyZones[0]?.label || 'None'}), Battery risk is ${riskAnalysis.battery}, Temporal risk is ${riskAnalysis.temporal}, Route deviation risk is ${riskAnalysis.deviation}. Movement profile is ${riskAnalysis.movement.status} at ${riskAnalysis.movement.speed.toFixed(2)} m/s, Immobility risk is ${riskAnalysis.immobility} pts.`;

    // 3. Reason & Decide: Run threat evaluation rules
    const evaluation = evaluateSafetyState(riskAnalysis);
    
    const reasoning = `Applying safety evaluation rules: Threat Score = Crime (${riskAnalysis.crime.score} * 1.0) + Battery (${riskAnalysis.battery} * 0.8) + Temporal (${riskAnalysis.temporal} * 0.5) + Deviation (${riskAnalysis.deviation} * 0.6) + Immobility (${riskAnalysis.immobility} * 1.0) = ${evaluation.threatScore}/100. Threat status classified as: ${evaluation.status}.`;
    
    const activeTriggers = [];
    if (riskAnalysis.crime.score > 0) activeTriggers.push('CRIME');
    if (riskAnalysis.battery > 0) activeTriggers.push('BATTERY');
    if (riskAnalysis.temporal > 0) activeTriggers.push('TEMPORAL');
    if (riskAnalysis.deviation > 0) activeTriggers.push('DEVIATION');
    if (riskAnalysis.immobility > 0) activeTriggers.push('IMMOBILITY');

    let decision = `Safety state is ${evaluation.status}. Active triggers: [${activeTriggers.join(', ') || 'None'}]. Autonomous actions: [${evaluation.autoActions?.join(', ') || 'None'}]. actionRequired flag set to: ${evaluation.actionRequired}.`;

    let action = 'No immediate action required';
    let result = 'HUD metrics updated. System remains normal.';

    // 4. Select tools based on state
    const selectedTools = selectToolsForState(userId, evaluation);

    // 5. Execute chosen tools
    if (selectedTools && selectedTools.length > 0) {
      for (const selected of selectedTools) {
        // Skip get_current_position and calculate_risk_score as they were run first
        if (selected.toolName === 'get_current_position' || selected.toolName === 'calculate_risk_score') {
          continue;
        }

        // Apply reflection and alert throttling to notification/guardian tools
        if (selected.toolName === 'send_alerts' || selected.toolName === 'update_guardians') {
          const lastAlert = memoryManager.getLastReflection(userId, evaluation.status);
          const THROTTLE_WINDOW_MS = 2 * 60 * 1000;

          if (lastAlert && (new Date() - new Date(lastAlert.timestamp) < THROTTLE_WINDOW_MS)) {
            action = `Throttle ${evaluation.status} safety alerts`;
            result = `Action throttled to prevent user alert fatigue. Last advisory sent ${Math.round((new Date() - new Date(lastAlert.timestamp)) / 1000)}s ago.`;
            continue;
          }

          // Record reflection state
          memoryManager.addReflection(userId, evaluation.status, {
            threatScore: evaluation.threatScore,
            reason: evaluation.reason,
          });
        }

        action = `Execute safety tool: ${selected.toolName}`;
        const toolRes = await toolExecutor.execute(selected.toolName, selected.args, {
          userId,
          user,
          location: latestLocObserved,
        });

        if (toolRes.logEntry) {
          currentCycleToolCalls.push(toolRes.logEntry);
        }

        result = `Tool ${selected.toolName} executed with status ${toolRes.status}.`;
      }
    }

    memoryManager.addReasoningLog(userId, {
      observation,
      thought,
      reasoning,
      decision,
      action,
      result,
      toolCalls: currentCycleToolCalls,
    });

    this.broadcastReasoning(userId, user);
  }

  broadcastReasoning(userId, user) {
    let io;
    try {
      io = getIo();
    } catch {
      return;
    }
    const userRoom = getUserRoom(userId);
    const guardianRoom = getGuardianRoom(userId);
    const reasoningLogs = memoryManager.getReasoningLogs(userId);

    const payload = {
      userId,
      name: user.name,
      reasoningLogs,
    };

    io.to(userRoom).emit('agent-reasoning', payload);
    io.to(guardianRoom).emit('agent-reasoning', payload);
  }

  onUserDisconnect(userId) {
    if (userId) {
      memoryManager.clearMemory(userId);
    }
  }
}

export const safetyAgent = new SafetyAgent();
