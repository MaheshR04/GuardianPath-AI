import { Server } from 'socket.io';
import { env } from '../config/env.js';
import User from '../models/User.model.js';
import { verifyToken } from '../utils/jwt.js';
import { getGuardianRoom, getUserRoom } from './socketRooms.js';

let io;
const connectedUsers = new Map();

function sanitizeLocation(payload) {
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  const accuracy = payload?.accuracy === null || payload?.accuracy === undefined ? null : Number(payload.accuracy);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    updatedAt: new Date(),
  };
}

function getConnectedUsersSnapshot() {
  return Array.from(connectedUsers.values()).map((user) => ({
    userId: user.userId,
    name: user.name,
    socketId: user.socketId,
    connectedAt: user.connectedAt,
  }));
}

export function initializeSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication token is required'));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return next(new Error('Authenticated user was not found'));
      }

      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = user._id.toString();
    const userRoom = getUserRoom(userId);
    const guardianRoom = getGuardianRoom(userId);

    connectedUsers.set(socket.id, {
      userId,
      name: user.name,
      socketId: socket.id,
      connectedAt: new Date().toISOString(),
    });

    socket.join(userRoom);

    socket.emit('user-connected', {
      socketId: socket.id,
      userId,
      connectedUsers: getConnectedUsersSnapshot(),
      message: 'Realtime tracking connected',
    });

    io.emit('connected-users', getConnectedUsersSnapshot());

    socket.on('guardian-joined', ({ trackedUserId } = {}, ack) => {
      const roomUserId = trackedUserId || userId;
      socket.join(getGuardianRoom(roomUserId));

      const response = {
        success: true,
        room: getGuardianRoom(roomUserId),
        trackedUserId: roomUserId,
      };

      socket.emit('guardian-joined', response);
      ack?.(response);
    });

    socket.on('location-update', async (payload, ack) => {
      const location = sanitizeLocation(payload);

      if (!location) {
        const response = { success: false, message: 'Invalid coordinates' };
        ack?.(response);
        return;
      }

      try {
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              currentLocation: location,
            },
          },
          { new: true },
        );

        if (!updatedUser) {
          ack?.({ success: false, message: 'User was not found for live tracking' });
          return;
        }

        const eventPayload = {
          userId,
          name: user.name,
          location,
        };

        socket.to(userRoom).emit('location-update', eventPayload);
        io.to(guardianRoom).emit('location-update', eventPayload);
        ack?.({ success: true, location });
      } catch (error) {
        console.error('Live location save failed:', error.message);
        ack?.({ success: false, message: error.message || 'Unable to save live location' });
      }
    });

    socket.on('danger-alert', (payload = {}) => {
      io.to(guardianRoom).emit('danger-alert', {
        userId,
        name: user.name,
        ...payload,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on('sos-alert', (payload = {}) => {
      io.to(guardianRoom).emit('sos-alert', {
        userId,
        name: user.name,
        ...payload,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      connectedUsers.delete(socket.id);
      io.emit('connected-users', getConnectedUsersSnapshot());
      socket.to(guardianRoom).emit('user-disconnected', {
        userId,
        reason,
        disconnectedAt: new Date().toISOString(),
      });
    });
  });

  return io;
}

export function getIo() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }

  return io;
}
