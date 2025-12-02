import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { IvsSimpleController } from '../controllers/ivs-simple.controller';

const router = Router();

// ============================================
// ADMIN ENDPOINTS
// ============================================
router.post('/admin/channels', protect, IvsSimpleController.createChannel);
router.get('/admin/channels', protect, IvsSimpleController.listChannels);

// ============================================
// MENTOR ENDPOINTS
// ============================================
// Mentor streaming credentials - get ingest server and stream key for OBS
router.get('/mentor/sessions/:sessionId/credentials', protect, IvsSimpleController.getStreamingCredentials);
router.delete('/mentor/sessions/:sessionId/credentials', protect, IvsSimpleController.releaseStreamingCredentials);

// Start/Stop session streaming
router.post('/mentor/sessions/:sessionId/start', protect, IvsSimpleController.startSession);
router.post('/mentor/sessions/:sessionId/stop', protect, IvsSimpleController.stopSession);

// ============================================
// STUDENT ENDPOINTS
// ============================================
// Join a session to get playback URL
router.get('/student/sessions/:sessionId/join', protect, IvsSimpleController.joinSession);

// Get all currently live classes
router.get('/streaming/live-classes', protect, IvsSimpleController.getLiveClasses);

// Get active session for a specific course/class
router.get('/streaming/active-class/:courseId', protect, IvsSimpleController.getActiveClassSession);

// ============================================
// STREAM STATUS ENDPOINTS
// ============================================
// Check stream health/status by session ID
router.get('/streaming/status/:sessionId', protect, IvsSimpleController.getStreamStatus);

// Check stream status by channel ARN (for direct access)
router.get('/streaming/channel-status/:channelArn', protect, IvsSimpleController.getStreamStatusByChannel);

export default router;
