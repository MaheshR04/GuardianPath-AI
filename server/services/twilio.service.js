import twilio from 'twilio';
import { env } from '../config/env.js';

function hasUsableTwilioConfig() {
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_PHONE_NUMBER &&
      !env.TWILIO_ACCOUNT_SID.startsWith('your_') &&
      !env.TWILIO_AUTH_TOKEN.startsWith('your_') &&
      env.TWILIO_PHONE_NUMBER !== '+10000000000',
  );
}

function getGoogleMapsLink(location) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

export function buildEmergencySms({ emergency, user }) {
  return `EMERGENCY ALERT:
${user.name} may be in danger.
Live Location:
${getGoogleMapsLink(emergency.location)}`;
}

export async function sendEmergencySmsAlerts({ emergency, user, onlyRetryable = false }) {
  const contacts = emergency.guardianContacts || [];
  const configured = hasUsableTwilioConfig();
  const client = configured ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN) : null;
  const message = buildEmergencySms({ emergency, user });
  const previousAlertsByPhone = new Map((emergency.smsAlerts || []).map((alert) => [alert.phoneNumber, alert]));

  const contactsToNotify = onlyRetryable
    ? contacts.filter((contact) => previousAlertsByPhone.get(contact.phoneNumber)?.status !== 'SENT')
    : contacts;

  const alerts = [...(emergency.smsAlerts || [])].filter((alert) =>
    contactsToNotify.every((contact) => contact.phoneNumber !== alert.phoneNumber),
  );

  for (const contact of contactsToNotify) {
    const previousAlert = previousAlertsByPhone.get(contact.phoneNumber);
    const baseAlert = {
      guardianName: contact.name,
      phoneNumber: contact.phoneNumber,
      relationship: contact.relationship || 'Guardian',
      attempts: (previousAlert?.attempts || 0) + 1,
      lastAttemptAt: new Date(),
    };

    if (!configured) {
      alerts.push({
        ...baseAlert,
        status: 'SKIPPED',
        errorMessage: 'Twilio environment variables are not configured',
      });
      continue;
    }

    try {
      const twilioMessage = await client.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to: contact.phoneNumber,
      });

      alerts.push({
        ...baseAlert,
        status: 'SENT',
        messageSid: twilioMessage.sid,
        errorMessage: '',
      });
    } catch (error) {
      alerts.push({
        ...baseAlert,
        status: 'FAILED',
        errorMessage: error.message || 'Twilio SMS failed',
      });
    }
  }

  return alerts;
}
