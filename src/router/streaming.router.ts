import { Router } from 'express';
import { streamingController } from '../controllers/streaming.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

/**
 * Streaming Routes
 */

// Public routes
router.get('/active', streamingController.getActiveStreams);
router.get('/:streamId', streamingController.getStreamForViewer);

// Authenticated routes (students and mentors)
router.post('/:streamId/join', protect, streamingController.joinStream);
router.post('/:streamId/leave', protect, streamingController.leaveStream);

// Mentor-only routes
// NOTE: Stream creation removed - mentors should use scheduled sessions
// router.post('/', protect, restrictTo(UserType.MENTOR), streamingController.createStream);
router.get('/:streamId/manage', protect, restrictTo(UserType.MENTOR), streamingController.getStreamForMentor);
router.post('/:streamId/start', protect, restrictTo(UserType.MENTOR), streamingController.startStream);
router.post('/:streamId/end', protect, restrictTo(UserType.MENTOR), streamingController.endStream);
router.patch('/:streamId', protect, restrictTo(UserType.MENTOR), streamingController.updateStream);
router.delete('/:streamId', protect, restrictTo(UserType.MENTOR), streamingController.deleteStream);
router.get('/:streamId/viewers', protect, restrictTo(UserType.MENTOR), streamingController.getStreamViewers);
router.get('/mentor/my-streams', protect, restrictTo(UserType.MENTOR), streamingController.getMentorStreams);

export default router;
