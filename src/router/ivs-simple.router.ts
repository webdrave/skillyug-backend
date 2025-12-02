import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { IvsSimpleController } from '../controllers/ivs-simple.controller';

const router = Router();

router.post('/admin/channels', protect, IvsSimpleController.createChannel);
router.get('/admin/channels', protect, IvsSimpleController.listChannels);

router.post('/mentor/sessions/:sessionId/start', protect, IvsSimpleController.startSession);
router.post('/mentor/sessions/:sessionId/stop', protect, IvsSimpleController.stopSession);

router.get('/student/sessions/:sessionId/join', protect, IvsSimpleController.joinSession);

export default router;
