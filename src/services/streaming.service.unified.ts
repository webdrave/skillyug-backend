/**
 * Unified Streaming Service
 * Consolidates all streaming logic into one service
 * Uses Channel Pool approach for cost optimization
 */

import { SessionStatus } from '@prisma/client';
import { 
  IvsClient, 
  CreateChannelCommand, 
  CreateStreamKeyCommand, 
  ListStreamKeysCommand,
  GetStreamKeyCommand,
  GetStreamCommand,
  ChannelLatencyMode,
  ChannelType
} from '@aws-sdk/client-ivs';
import { NotFoundError, BusinessLogicError, AuthorizationError } from '../utils/errors';
import prisma from '../utils/prisma';

// AWS IVS Client
const ivsClient = new IvsClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Mock mode for development
// Mock mode for development
const USE_MOCK = process.env.USE_MOCK_STREAMING === 'true' || (process.env.NODE_ENV === 'development' && process.env.USE_MOCK_STREAMING !== 'false');

export class StreamingService {
  
  // ============================================
  // ADMIN: Channel Pool Management
  // ============================================

  /**
   * Create a new IVS channel and add to pool
   */
  async createChannel(params: {
    name?: string;
    type?: 'STANDARD' | 'BASIC';
  }) {
    const channelName = params.name || `Channel-${Date.now()}`;

    if (USE_MOCK) {
      const mockChannel = await prisma.iVSChannel.create({
        data: {
          channelArn: `arn:aws:ivs:us-east-1:mock:channel/${channelName}`,
          channelId: `mock-${Date.now()}`,
          channelName,
          ingestEndpoint: 'mock-ingest.ivs.us-east-1.amazonaws.com',
          playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/${channelName}.m3u8`,
          isActive: false,
          isEnabled: true,
        },
      });
      return mockChannel;
    }

    // Create real AWS IVS channel
    const response = await ivsClient.send(new CreateChannelCommand({
      name: channelName,
      type: params.type === 'BASIC' ? ChannelType.BasicChannelType : ChannelType.StandardChannelType,
      latencyMode: ChannelLatencyMode.LowLatency,
      recordingConfigurationArn: process.env.IVS_RECORDING_ARN || undefined,
    }));

    const channel = response.channel;
    if (!channel?.arn) {
      throw new BusinessLogicError('Failed to create IVS channel');
    }

    const created = await prisma.iVSChannel.create({
      data: {
        channelArn: channel.arn,
        channelId: channelName,
        channelName: channel.name || channelName,
        ingestEndpoint: channel.ingestEndpoint || '',
        playbackUrl: channel.playbackUrl || '',
        isActive: false,
        isEnabled: true,
      },
    });

    return created;
  }

  /**
   * List all channels in pool
   */
  async listChannels(params?: { onlyEnabled?: boolean; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const skip = (page - 1) * limit;
    const where = params?.onlyEnabled ? { isEnabled: true } : {};

    const [channels, total] = await Promise.all([
      prisma.iVSChannel.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.iVSChannel.count({ where }),
    ]);

    return { channels, total };
  }

  /**
   * Get channel statistics
   */
  async getChannelStats() {
    const [total, active, free, disabled] = await Promise.all([
      prisma.iVSChannel.count(),
      prisma.iVSChannel.count({ where: { isActive: true, isEnabled: true } }),
      prisma.iVSChannel.count({ where: { isActive: false, isEnabled: true } }),
      prisma.iVSChannel.count({ where: { isEnabled: false } }),
    ]);

    return { total, active, free, disabled };
  }

  // ============================================
  // INTERNAL: Channel Assignment
  // ============================================

  /**
   * Check if channel is actually live on AWS
   */
  private async isChannelLive(channelArn: string): Promise<boolean> {
    if (USE_MOCK) {
      return Math.random() > 0.7; // Randomly simulate live status
    }

    try {
      const response = await ivsClient.send(new GetStreamCommand({ channelArn }));
      return response.stream?.state === 'LIVE';
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException' || error.name === 'ChannelNotBroadcasting') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Find an available channel from the pool
   */
  private async findAvailableChannel() {
    const candidates = await prisma.iVSChannel.findMany({
      where: { isActive: false, isEnabled: true },
      orderBy: { lastUsedAt: 'asc' },
    });

    for (const channel of candidates) {
      const isLive = await this.isChannelLive(channel.channelArn);
      if (!isLive) {
        return channel;
      }
      // Fix inconsistent state
      await prisma.iVSChannel.update({
        where: { id: channel.id },
        data: { isActive: true },
      });
    }

    return null;
  }

  // ============================================
  // MENTOR: Session Management
  // ============================================

  /**
   * Get streaming credentials for a session
   * Assigns a channel from the pool and generates stream key
   */
  async getSessionCredentials(sessionId: string, userId: string) {
    // Get session and verify ownership
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: { 
        mentorProfile: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              }
            }
          }
        }, 
        ivsChannel: true 
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found or you don\'t have permission to view it.');
    }

    if (session.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can access credentials');
    }

    // If already has credentials, return them
    if (session.ivsChannel && session.currentStreamKey) {
      return {
        ingestServer: session.ivsChannel.ingestEndpoint,
        streamKey: session.currentStreamKey,
        streamUrl: `rtmps://${session.ivsChannel.ingestEndpoint}:443/app/`,
        playbackUrl: session.ivsChannel.playbackUrl,
        channelId: session.ivsChannel.id,
        sessionId: session.id,
        status: session.status,
        message: 'Using existing channel assignment',
      };
    }

    // Find available channel
    const freeChannel = await this.findAvailableChannel();
    if (!freeChannel) {
      // Check if any channels exist at all
      const totalChannels = await prisma.iVSChannel.count();
      if (totalChannels === 0) {
        throw new BusinessLogicError(
          'No streaming channels available. Please contact admin to initialize the channel pool. ' +
          'Admin can run: npm run init-channels'
        );
      }
      throw new BusinessLogicError(
        'All streaming channels are currently in use. Please try again in a few minutes or contact admin.'
      );
    }

    // Get existing stream key
    let streamKey: string;
    if (USE_MOCK) {
      streamKey = `sk_mock_${Math.random().toString(36).substring(7)}`;
    } else {
      // List keys for the channel
      const keysResponse = await ivsClient.send(
        new ListStreamKeysCommand({ channelArn: freeChannel.channelArn })
      );
      
      const firstKeySummary = keysResponse.streamKeys?.[0];
      
      if (!firstKeySummary?.arn) {
        // Fallback: Create one if none exist
        console.log('No keys found, creating new one...');
        const createResponse = await ivsClient.send(
          new CreateStreamKeyCommand({ channelArn: freeChannel.channelArn })
        );
        streamKey = createResponse.streamKey?.value || '';
      } else {
        // Get the full stream key details (including value)
        const keyResponse = await ivsClient.send(
          new GetStreamKeyCommand({ arn: firstKeySummary.arn })
        );
        streamKey = keyResponse.streamKey?.value || '';
      }

      if (!streamKey) {
        throw new BusinessLogicError('Failed to retrieve stream key');
      }
    }

    // Assign channel to session
    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: {
        ivsChannelId: freeChannel.id,
        currentStreamKey: streamKey,
      },
    });

    await prisma.iVSChannel.update({
      where: { id: freeChannel.id },
      data: {
        isActive: true,
        assignedToSessionId: sessionId,
        lastUsedAt: new Date(),
      },
    });

    return {
      ingestServer: freeChannel.ingestEndpoint,
      streamKey,
      streamUrl: `rtmps://${freeChannel.ingestEndpoint}:443/app/`,
      playbackUrl: freeChannel.playbackUrl,
      channelId: freeChannel.id,
      sessionId: session.id,
      status: 'READY',
      message: 'Channel assigned. Configure OBS with these credentials.',
    };
  }

  /**
   * Release streaming credentials (free up channel)
   */
  async releaseSessionCredentials(sessionId: string, userId: string) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: { 
        mentorProfile: {
          include: {
            user: { select: { id: true } }
          }
        }
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found or you don\'t have permission to view it.');
    }

    if (session.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Not authorized');
    }

    if (!session.ivsChannelId) {
      return { ok: true, message: 'No channel was assigned' };
    }

    // Release channel
    await prisma.iVSChannel.update({
      where: { id: session.ivsChannelId },
      data: { isActive: false, assignedToSessionId: null },
    });

    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: { ivsChannelId: null, currentStreamKey: null },
    });

    return { ok: true, message: 'Channel released' };
  }

  /**
   * Start a session (mark as LIVE)
   */
  async startSession(sessionId: string, userId: string) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: { 
        mentorProfile: {
          include: {
            user: { select: { id: true } }
          }
        }, 
        ivsChannel: true 
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found or you don\'t have permission to view it.');
    }

    if (session.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can start it');
    }

    if (session.status === SessionStatus.LIVE) {
      throw new BusinessLogicError('Session is already live');
    }

    // Verify stream is actually live
    if (session.ivsChannel) {
      const isLive = await this.isChannelLive(session.ivsChannel.channelArn);
      if (!isLive && !USE_MOCK) {
        throw new BusinessLogicError('Stream is not live. Please start OBS first.');
      }
    }

    // Update session status
    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.LIVE,
        startedAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      status: 'LIVE',
      playbackUrl: session.ivsChannel?.playbackUrl,
      ingestEndpoint: session.ivsChannel?.ingestEndpoint,
      streamKey: session.currentStreamKey,
    };
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, userId: string) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: { mentorProfile: true },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can end it');
    }

    // Release channel
    if (session.ivsChannelId) {
      await prisma.iVSChannel.update({
        where: { id: session.ivsChannelId },
        data: { isActive: false, assignedToSessionId: null },
      });
    }

    // Update session
    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
        ivsChannelId: null,
        currentStreamKey: null,
      },
    });

    return { ok: true, message: 'Session ended' };
  }

  // ============================================
  // STUDENT: View Sessions
  // ============================================

  /**
   * Get all currently live sessions
   */
  async getLiveSessions() {
    const sessions = await prisma.scheduledSession.findMany({
      where: { status: SessionStatus.LIVE },
      include: {
        mentorProfile: {
          include: {
            user: {
              select: { fullName: true, email: true, image: true },
            },
          },
        },
        course: {
          select: { id: true, courseName: true, imageUrl: true },
        },
        ivsChannel: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    const liveClasses = [];

    for (const session of sessions) {
      if (!session.ivsChannel) continue;

      const isLive = await this.isChannelLive(session.ivsChannel.channelArn);
      
      if (isLive || USE_MOCK) {
        liveClasses.push({
          sessionId: session.id,
          title: session.title,
          description: session.description,
          courseId: session.courseId,
          courseName: session.course?.courseName,
          courseImage: session.course?.imageUrl,
          mentorName: session.mentorProfile.user?.fullName || 'Unknown',
          mentorAvatar: session.mentorProfile.user?.image,
          playbackUrl: session.ivsChannel.playbackUrl,
          startedAt: session.startedAt,
          enableChat: session.enableChat,
          enableQuiz: session.enableQuiz,
        });
      }
    }

    return liveClasses;
  }

  /**
   * Get active session for a specific course
   */
  async getActiveCourseSession(courseId: string) {
    const session = await prisma.scheduledSession.findFirst({
      where: { courseId, status: SessionStatus.LIVE },
      include: {
        mentorProfile: {
          include: {
            user: {
              select: { fullName: true, email: true, image: true },
            },
          },
        },
        course: {
          select: { id: true, courseName: true, imageUrl: true },
        },
        ivsChannel: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session || !session.ivsChannel) {
      return { isLive: false };
    }

    const isLive = await this.isChannelLive(session.ivsChannel.channelArn);

    if (!isLive && !USE_MOCK) {
      return { isLive: false };
    }

    return {
      isLive: true,
      sessionId: session.id,
      title: session.title,
      description: session.description,
      courseName: session.course?.courseName,
      mentorName: session.mentorProfile.user?.fullName,
      playbackUrl: session.ivsChannel.playbackUrl,
      startedAt: session.startedAt,
      enableChat: session.enableChat,
      enableQuiz: session.enableQuiz,
    };
  }

  /**
   * Join a session (get playback URL)
   */
  async joinSession(sessionId: string, userId: string) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: {
        course: true,
        ivsChannel: true,
        mentorProfile: true,
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Check enrollment if session has a course
    if (session.courseId) {
      const enrolled = await prisma.enrollment.findFirst({
        where: { courseId: session.courseId, userId },
      });

      if (!enrolled && session.mentorProfile.userId !== userId) {
        throw new AuthorizationError('You must be enrolled in this course');
      }
    }

    if (!session.ivsChannel?.playbackUrl) {
      throw new BusinessLogicError('Session not started yet');
    }

    return {
      playbackUrl: session.ivsChannel.playbackUrl,
      sessionId: session.id,
      title: session.title,
    };
  }

  /**
   * Get stream status
   */
  async getStreamStatus(sessionId: string) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: { ivsChannel: true },
    });

    if (!session || !session.ivsChannel) {
      return { isLive: false };
    }

    if (USE_MOCK) {
      return {
        isLive: session.status === SessionStatus.LIVE,
        viewerCount: Math.floor(Math.random() * 100),
        health: 'HEALTHY',
      };
    }

    try {
      const response = await ivsClient.send(
        new GetStreamCommand({ channelArn: session.ivsChannel.channelArn })
      );

      return {
        isLive: response.stream?.state === 'LIVE',
        viewerCount: response.stream?.viewerCount || 0,
        health: response.stream?.health,
        startTime: response.stream?.startTime,
      };
    } catch {
      return { isLive: false };
    }
  }
}

export const streamingService = new StreamingService();
