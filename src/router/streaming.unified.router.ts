/**
 * Unified Streaming Router
 * Consolidates all streaming endpoints
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { StreamingController } from '../controllers/streaming.controller.unified';

const router = Router();

// ============================================
// ADMIN: Channel Pool Management
// ============================================
router.post('/admin/channels', protect, StreamingController.createChannel);
router.get('/admin/channels', protect, StreamingController.listChannels);
router.get('/admin/channels/stats', protect, StreamingController.getChannelStats);

// ============================================
// MENTOR: Session Streaming
// ============================================
router.get('/mentor/sessions/:sessionId/credentials', protect, StreamingController.getSessionCredentials);
router.delete('/mentor/sessions/:sessionId/credentials', protect, StreamingController.releaseSessionCredentials);
router.post('/mentor/sessions/:sessionId/start', protect, StreamingController.startSession);
router.post('/mentor/sessions/:sessionId/stop', protect, StreamingController.stopSession);

// ============================================
// STUDENT: View Live Sessions
// ============================================
router.get('/student/sessions/:sessionId/join', protect, StreamingController.joinSession);
router.get('/streaming/live-classes', protect, StreamingController.getLiveClasses);
router.get('/streaming/active-class/:courseId', protect, StreamingController.getActiveCourseSession);
router.get('/streaming/status/:sessionId', protect, StreamingController.getStreamStatus);

export default router;
