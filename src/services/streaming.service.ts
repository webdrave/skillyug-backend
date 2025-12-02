import { ivsService } from './ivs.service';
import { liveStreamRepository } from '../repositories/liveStream.repository';
import { mentorRepository } from '../repositories/mentor.repository';
import { courseRepository } from '../repositories/course.repository';
import { ChannelLatencyMode } from '@aws-sdk/client-ivs';
import { LiveStreamStatus } from '@prisma/client';
import {
  NotFoundError,
  BusinessLogicError,
  AuthorizationError,
} from '../utils/errors';

/**
 * Streaming Service - Business logic for live streaming
 */
export class StreamingService {
  /**
   * Create a new live stream channel for a mentor
   * REMOVED: Mentors should use scheduled sessions instead. Channels are assigned by admin from pool.
   */
  // async createStream(data: {
  //   userId: string;
  //   courseId?: string;
  //   title: string;
  //   description?: string;
  //   scheduledAt?: Date;
  //   latencyMode?: ChannelLatencyMode;
  // }): Promise<{
  //   message: string;
  //   stream: unknown;
  //   streamKey: string; // Only return once during creation
  // }> {
  //   // Get mentor profile (includes user relation from repository)
  //   const mentorProfile = await mentorRepository.getMentorProfileByUserId(data.userId);
  //   if (!mentorProfile) {
  //     throw new NotFoundError('Mentor profile not found. User must be a mentor.');
  //   }
  //
  //   // Verify course ownership if courseId is provided
  //   if (data.courseId) {
  //     const course = await courseRepository.findById(data.courseId);
  //     if (!course) {
  //       throw new NotFoundError('Course');
  //     }
  //     if (course.mentorId !== data.userId) {
  //       throw new AuthorizationError('You can only create streams for your own courses');
  //     }
  //   }
  //
  //   // Create IVS channel
  //   // Note: mentorProfile.user is included via repository include
  //   const mentorProfileWithUser = mentorProfile as typeof mentorProfile & { user?: { fullName?: string; email: string } };
  //   const ivsChannel = await ivsService.createChannel({
  //     mentorId: data.userId,
  //     mentorName: mentorProfileWithUser.user?.fullName || mentorProfileWithUser.user?.email || 'Mentor',
  //     latencyMode: data.latencyMode,
  //   });
  //
  //   // Store in database
  //   const stream = await liveStreamRepository.create({
  //     mentorProfileId: mentorProfile.id,
  //     courseId: data.courseId,
  //     title: data.title,
  //     description: data.description,
  //     channelArn: ivsChannel.channelArn,
  //     channelName: ivsChannel.channelName,
  //     ingestEndpoint: ivsChannel.ingestEndpoint,
  //     playbackUrl: ivsChannel.playbackUrl,
  //     streamKeyArn: ivsChannel.streamKeyArn,
  //     scheduledAt: data.scheduledAt,
  //   });
  //
  //   return {
  //     message: 'Live stream created successfully',
  //     stream,
  //     streamKey: ivsChannel.streamKey, // Return stream key only on creation
  //   };
  // }

  /**
   * Get stream details (for mentor - includes sensitive info)
   */
  async getStreamForMentor(streamId: string, userId: string): Promise<{
    stream: unknown;
    streamKey?: string;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    // Verify ownership
    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('You can only access your own streams');
    }

    // Get stream key from AWS IVS
    const streamKeyInfo = await ivsService.getStreamKey(stream.streamKeyArn);

    return {
      stream,
      streamKey: streamKeyInfo.value,
    };
  }

  /**
   * Get stream details (for viewers - public info only)
   */
  async getStreamForViewer(streamId: string): Promise<unknown> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    // Return only public information
    return {
      id: stream.id,
      title: stream.title,
      description: stream.description,
      playbackUrl: stream.playbackUrl,
      status: stream.status,
      isActive: stream.isActive,
      scheduledAt: stream.scheduledAt,
      startedAt: stream.startedAt,
      viewerCount: stream.viewerCount,
      mentor: {
        id: stream.mentorProfile.user.id,
        fullName: stream.mentorProfile.user.fullName,
        image: stream.mentorProfile.user.image,
      },
      course: stream.course,
    };
  }

  /**
   * Start a stream (update status to LIVE)
   */
  async startStream(streamId: string, userId: string): Promise<{
    message: string;
    stream: unknown;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the stream owner can start it');
    }

    const updatedStream = await liveStreamRepository.update(streamId, {
      status: LiveStreamStatus.LIVE,
      isActive: true,
      startedAt: new Date(),
    });

    return {
      message: 'Stream started successfully',
      stream: updatedStream,
    };
  }

  /**
   * End a stream
   */
  async endStream(streamId: string, userId: string): Promise<{
    message: string;
    stream: unknown;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the stream owner can end it');
    }

    // Stop the stream in AWS IVS
    await ivsService.stopStream(stream.channelArn);

    // Update database
    const updatedStream = await liveStreamRepository.update(streamId, {
      status: LiveStreamStatus.ENDED,
      isActive: false,
      endedAt: new Date(),
    });

    return {
      message: 'Stream ended successfully',
      stream: updatedStream,
    };
  }

  /**
   * Delete a stream
   */
  async deleteStream(streamId: string, userId: string): Promise<{
    message: string;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the stream owner can delete it');
    }

    // Delete from AWS IVS
    await ivsService.deleteChannel(stream.channelArn);

    // Delete from database
    await liveStreamRepository.delete(streamId);

    return {
      message: 'Stream deleted successfully',
    };
  }

  /**
   * Get all streams for a mentor
   */
  async getMentorStreams(userId: string, params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    streams: unknown[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(userId);
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile');
    }

    const page = params?.page || 1;
    const limit = params?.limit || 10;

    const { streams, total } = await liveStreamRepository.findByMentor(mentorProfile.id, {
      status: params?.status as LiveStreamStatus | undefined,
      page,
      limit,
    });

    return {
      streams,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all active/live streams (for students to discover)
   */
  async getActiveStreams(params?: {
    page?: number;
    limit?: number;
  }): Promise<{
    streams: unknown[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = params?.page || 1;
    const limit = params?.limit || 10;

    const { streams, total } = await liveStreamRepository.findActiveStreams({
      page,
      limit,
    });

    return {
      streams,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Join a stream (as a viewer)
   */
  async joinStream(streamId: string, userId: string): Promise<{
    message: string;
    playbackUrl: string;
    viewer: unknown;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    if (!stream.isActive) {
      throw new BusinessLogicError('Stream is not currently active');
    }

    // Add viewer
    const viewer = await liveStreamRepository.addViewer(streamId, userId);

    // Increment viewer count
    await liveStreamRepository.incrementViewerCount(streamId);

    return {
      message: 'Joined stream successfully',
      playbackUrl: stream.playbackUrl,
      viewer,
    };
  }

  /**
   * Leave a stream (as a viewer)
   */
  async leaveStream(streamId: string, userId: string): Promise<{
    message: string;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    // Remove viewer
    await liveStreamRepository.removeViewer(streamId, userId);

    // Decrement viewer count
    await liveStreamRepository.decrementViewerCount(streamId);

    return {
      message: 'Left stream successfully',
    };
  }

  /**
   * Get current viewers of a stream
   */
  async getStreamViewers(streamId: string, userId: string): Promise<{
    viewers: unknown[];
    count: number;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    // Only the mentor can see detailed viewer list
    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the stream owner can see viewer details');
    }

    const viewers = await liveStreamRepository.getViewers(streamId);

    return {
      viewers,
      count: viewers.length,
    };
  }

  /**
   * Update stream details
   */
  async updateStream(
    streamId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      scheduledAt?: Date;
    }
  ): Promise<{
    message: string;
    stream: unknown;
  }> {
    const stream = await liveStreamRepository.findById(streamId);
    if (!stream) {
      throw new NotFoundError('Stream');
    }

    if (stream.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the stream owner can update it');
    }

    const updatedStream = await liveStreamRepository.update(streamId, data);

    return {
      message: 'Stream updated successfully',
      stream: updatedStream,
    };
  }
}

// Export singleton instance
export const streamingService = new StreamingService();
