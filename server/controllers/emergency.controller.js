import Emergency from '../models/Emergency.model.js';
import { sendEmergencySmsAlerts } from '../services/twilio.service.js';
import { createError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function getEmergencyLocation(req) {
  const requestLocation = req.body.location;
  const fallbackLocation = req.user.currentLocation;
  const location = requestLocation || fallbackLocation;

  if (typeof location?.latitude !== 'number' || typeof location?.longitude !== 'number') {
    throw createError('Current location is required to activate SOS', 400);
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    updatedAt: location.updatedAt ? new Date(location.updatedAt) : new Date(),
  };
}

export const createSosEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.create({
    user: req.user._id,
    message: req.body.message || 'SOS emergency activated',
    location: getEmergencyLocation(req),
    riskLevel: req.body.riskLevel || 'UNKNOWN',
    riskScore: req.body.riskScore || 0,
    guardianContacts: req.user.guardianContacts,
  });

  emergency.smsAlerts = await sendEmergencySmsAlerts({
    emergency,
    user: req.user,
  });
  await emergency.save();

  res.status(201).json({
    success: true,
    emergency,
  });
});

export const getMyEmergencies = asyncHandler(async (req, res) => {
  const emergencies = await Emergency.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(25);

  res.status(200).json({
    success: true,
    emergencies,
  });
});

export const resolveEmergency = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findOne({
    _id: req.params.emergencyId,
    user: req.user._id,
  });

  if (!emergency) {
    throw createError('Emergency record not found', 404);
  }

  emergency.status = req.body.status;
  emergency.resolvedAt = new Date();
  await emergency.save();

  res.status(200).json({
    success: true,
    emergency,
  });
});

export const retryEmergencySms = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findOne({
    _id: req.params.emergencyId,
    user: req.user._id,
  });

  if (!emergency) {
    throw createError('Emergency record not found', 404);
  }

  emergency.smsAlerts = await sendEmergencySmsAlerts({
    emergency,
    user: req.user,
    onlyRetryable: true,
  });
  await emergency.save();

  res.status(200).json({
    success: true,
    emergency,
  });
});
