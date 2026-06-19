import Emergency from '../models/Emergency.model.js';
import User from '../models/User.model.js';
import { canTrackUser } from '../services/trackingAccess.service.js';
import { createError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getTrackingSnapshot = asyncHandler(async (req, res) => {
  const trackedUser = await User.findById(req.params.userId);

  if (!trackedUser) {
    throw createError('Tracked user not found', 404);
  }

  if (!canTrackUser(req.user, trackedUser)) {
    throw createError('You are not allowed to track this user', 403);
  }

  const activeEmergency = await Emergency.findOne({
    user: trackedUser._id,
    status: 'ACTIVE',
  }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    tracking: {
      user: {
        _id: trackedUser._id,
        name: trackedUser.name,
        phoneNumber: trackedUser.phoneNumber,
      },
      currentLocation: trackedUser.currentLocation,
      lastSeenAt: trackedUser.currentLocation?.updatedAt || trackedUser.updatedAt,
      emergencyStatus: activeEmergency ? activeEmergency.status : 'NONE',
      activeEmergency,
      activeRoute: null,
    },
  });
});

export const getTrackedUsers = asyncHandler(async (req, res) => {
  const requesterPhone = req.user.phoneNumber ? req.user.phoneNumber.replace(/\D/g, '') : '';

  if (!requesterPhone) {
    return res.status(200).json({
      success: true,
      users: [],
    });
  }

  const allUsersWithGuardians = await User.find({
    guardianContacts: { $exists: true, $not: { $size: 0 } },
  });

  const trackedUsers = allUsersWithGuardians.filter((u) => {
    return u.guardianContacts.some((g) => {
      const normalizedGPhone = g.phoneNumber ? g.phoneNumber.replace(/\D/g, '') : '';
      return normalizedGPhone === requesterPhone;
    });
  });

  res.status(200).json({
    success: true,
    users: trackedUsers.map((u) => ({
      _id: u._id,
      name: u.name,
      phoneNumber: u.phoneNumber,
      currentLocation: u.currentLocation,
    })),
  });
});

