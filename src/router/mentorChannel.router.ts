/**
 * Mentor Channel Router
 * 
 * Express routes for the mentor channel streaming system.
 * Implements ONE-CHANNEL-PER-MENTOR architecture for cost optimization.
 * 
 * Routes:
 * - POST /api/streaming/get-mentor-channel - Get/create mentor's channel (mentor/admin)
 * - POST /api/streaming/start-class - Start a live class (mentor)
 * - POST /api/streaming/end-class - End a live class (mentor)
 * - GET /api/streaming/active-class/:classId - Check if class is live (all authenticated)
 * - GET /api/streaming/live-classes - Get all live classes (all authenticated)
 * - GET /api/streaming/stream-status/:mentorId - Check stream health (all authenticated)
 * - POST /api/streaming/regenerate-key - Regenerate stream key (mentor/admin)
 * - DELETE /api/streaming/mentor-channel/:mentorId - Delete channel (admin only)
 */

import { Router } from 'express';
import { mentorChannelController } from '../controllers/mentorChannel.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

/**
 * ===========================================
 * MENTOR ENDPOINTS
 * ===========================================
 * These endpoints are for mentors to manage their streaming
 */

/**
 * @route   POST /api/streaming/get-mentor-channel
 * @desc    Get or create mentor's permanent IVS channel
 * @access  Private - Mentor or Admin only
 * @body    { mentorId: string, mentorName?: string }
 * @returns { channelArn, streamKey, streamUrl, ingestEndpoint, playbackUrl }
 * 
 * Use Case: Mentor dashboard calls this to get OBS credentials
 */
router.post(
  '/get-mentor-channel',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  mentorChannelController.getMentorChannel.bind(mentorChannelController)
);

/**
 * @route   POST /api/streaming/start-class
 * @desc    Start a live class session (after OBS is streaming)
 * @access  Private - Mentor or Admin only
 * @body    { classId: string, mentorId: string, className?: string }
 * @returns { sessionId, playbackUrl, startedAt, viewerCount }
 * 
 * Use Case: Mentor clicks "Go Live" button after starting OBS
 */
router.post(
  '/start-class',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  mentorChannelController.startClass.bind(mentorChannelController)
);

/**
 * @route   POST /api/streaming/end-class
 * @desc    End a live class session
 * @access  Private - Mentor or Admin only
 * @body    { sessionId: string, classId?: string }
 * @returns { success: true }
 * 
 * Use Case: Mentor clicks "End Class" button
 */
router.post(
  '/end-class',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  mentorChannelController.endClass.bind(mentorChannelController)
);

/**
 * @route   POST /api/streaming/regenerate-key
 * @desc    Regenerate stream key (if compromised)
 * @access  Private - Mentor or Admin only
 * @body    { mentorId: string }
 * @returns { streamKey: string }
 */
router.post(
  '/regenerate-key',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  mentorChannelController.regenerateStreamKey.bind(mentorChannelController)
);

/**
 * ===========================================
 * STUDENT ENDPOINTS
 * ===========================================
 * These endpoints are for students to watch live classes
 */

/**
 * @route   GET /api/streaming/active-class/:classId
 * @desc    Check if a class is live and get playback URL
 * @access  Private - All authenticated users
 * @params  classId - The course/class ID
 * @returns { isLive, sessionId?, playbackUrl?, classTitle?, mentorName?, viewerCount? }
 * 
 * Use Case: Student opens class page to check if it's live
 */
router.get(
  '/active-class/:classId',
  protect,
  mentorChannelController.getActiveClass.bind(mentorChannelController)
);

/**
 * @route   GET /api/streaming/live-classes
 * @desc    Get all currently live classes
 * @access  Private - All authenticated users
 * @returns { count, classes: [{ sessionId, classId, classTitle, mentorName, playbackUrl, ... }] }
 * 
 * Use Case: Student dashboard showing all available live classes
 */
router.get(
  '/live-classes',
  protect,
  mentorChannelController.getLiveClasses.bind(mentorChannelController)
);

/**
 * @route   GET /api/streaming/stream-status/:mentorId
 * @desc    Check stream health and viewer count
 * @access  Private - All authenticated users
 * @params  mentorId - The mentor's user ID
 * @returns { isLive, viewerCount, streamHealth?, startTime? }
 * 
 * Use Case: Polling for live stream status updates
 */
router.get(
  '/stream-status/:mentorId',
  protect,
  mentorChannelController.getStreamStatus.bind(mentorChannelController)
);

/**
 * ===========================================
 * ADMIN ENDPOINTS
 * ===========================================
 * Administrative functions for channel management
 */

/**
 * @route   DELETE /api/streaming/mentor-channel/:mentorId
 * @desc    Delete a mentor's channel (cleanup)
 * @access  Private - Admin only
 * @params  mentorId - The mentor's user ID
 * @returns { success: true }
 */
router.delete(
  '/mentor-channel/:mentorId',
  protect,
  restrictTo(UserType.ADMIN),
  mentorChannelController.deleteMentorChannel.bind(mentorChannelController)
);

export default router;
