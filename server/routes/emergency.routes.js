import { Router } from 'express';
import {
  createSosEmergency,
  getMyEmergencies,
  retryEmergencySms,
  resolveEmergency,
} from '../controllers/emergency.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createSosSchema, resolveEmergencySchema } from '../validators/emergency.validator.js';

const router = Router();

router.use(protect);

router.post('/sos', validate(createSosSchema), createSosEmergency);
router.get('/', getMyEmergencies);
router.post('/:emergencyId/retry-sms', retryEmergencySms);
router.patch('/:emergencyId/resolve', validate(resolveEmergencySchema), resolveEmergency);

export default router;
