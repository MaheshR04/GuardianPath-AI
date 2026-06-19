import { Router } from 'express';
import { getTrackingSnapshot, getTrackedUsers } from '../controllers/tracking.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/tracked-users', protect, getTrackedUsers);
router.get('/:userId', protect, getTrackingSnapshot);


export default router;
