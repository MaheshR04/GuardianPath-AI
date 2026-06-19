export function selectToolsForState(userId, evaluation) {
  const selectedTools = [];

  // Always check position and calculate risk
  selectedTools.push({
    toolName: 'get_current_position',
    args: { userId },
  });

  selectedTools.push({
    toolName: 'calculate_risk_score',
    args: { userId },
  });

  const { status, threatScore, reason, autoActions, riskAnalysis } = evaluation;

  // Map autoActions to tools:
  if (autoActions && autoActions.length > 0) {
    for (const action of autoActions) {
      if (action === 'GENERATE_SAFE_ROUTE') {
        selectedTools.push({
          toolName: 'generate_safe_route',
          args: { userId, reason: 'Threat score exceeded 70. Recalculating safe detour.' },
        });
      }
      if (action === 'NOTIFY_GUARDIAN') {
        selectedTools.push({
          toolName: 'update_guardians',
          args: { userId, reason: 'Risk critical (> 85). Executing notification protocols.' },
        });
      }
      if (action === 'SEND_BATTERY_WARNING') {
        selectedTools.push({
          toolName: 'send_alerts',
          args: {
            userId,
            type: 'BATTERY_WARNING',
            reason: 'Critically low battery (< 10%). Alerts are being automated.',
            payload: { rawBatteryLevel: riskAnalysis?.rawBatteryLevel },
          },
        });
      }
      if (action === 'TRIGGER_SAFETY_CHECK') {
        selectedTools.push({
          toolName: 'send_alerts',
          args: {
            userId,
            type: 'TRIGGER_SAFETY_CHECK',
            reason: 'User stationary inside crime zone. Initiating safety prompt.',
          },
        });
      }
      if (action === 'START_EMERGENCY_PROTOCOL') {
        selectedTools.push({
          toolName: 'trigger_sos_actions',
          args: { userId, reason, threatScore },
        });
      }
    }
  }

  // Handle default advisory/warnings
  if ((status === 'ADVISORY' || status === 'WARNING') && (!autoActions || !autoActions.includes('START_EMERGENCY_PROTOCOL'))) {
    // Generate advisory update alert
    const advisoryPayload = {
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
    selectedTools.push({
      toolName: 'send_alerts',
      args: {
        userId,
        type: 'ADVISORY_UPDATE',
        payload: advisoryPayload,
      },
    });
  }

  return selectedTools;
}
