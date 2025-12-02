/**
 * Mentor Channel Service
 * 
 * This service implements the ONE-CHANNEL-PER-MENTOR architecture for cost optimization.
 * Each mentor gets assigned a permanent IVS channel that they reuse for ALL their classes.
 * 
 * Key Concepts:
 * - MentorChannel: A permanent IVS channel assigned to a specific mentor
 * - ClassSession: A live class using the mentor's channel
 * - Stream Key: The secret key used in OBS to broadcast to the channel
 * 
 * Flow:
 * 1. Mentor requests channel -> System creates/returns permanent channel
 * 2. Mentor configures OBS with permanent credentials
 * 3. Mentor starts class -> System verifies stream is live -> Creates session record
 * 4. Students watch via playback URL
 * 5. Mentor ends class -> System updates session record
 */

import {
  IvsClient,
  CreateChannelCommand,
  DeleteChannelCommand,
  GetStreamCommand,
  StopStreamCommand as _StopStreamCommand,
  CreateStreamKeyCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  DeleteStreamKeyCommand,
  ChannelLatencyMode,
  ChannelType,
} from '@aws-sdk/client-ivs';
import prisma from '../utils/prisma';
import { NotFoundError, BusinessLogicError, AuthorizationError } from '../utils/errors';

// AWS IVS Client Configuration
const ivsClient = new IvsClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Check if we're in mock mode (for development without AWS)
const USE_MOCK = process.env.USE_MOCK_STREAMING === 'true' || process.env.NODE_ENV === 'development';

/**
 * Interface for Mentor Channel credentials
 */
export interface MentorChannelCredentials {
  channelArn: string;
  streamKey: string;
  streamKeyArn: string;
  ingestEndpoint: string;
  playbackUrl: string;
}

/**
 * Interface for Class Session
 */
export interface ClassSessionData {
  sessionId: string;
  classId: string;
  mentorId: string;
  playbackUrl: string;
  startedAt: Date;
  status: 'live' | 'ended';
  viewerCount: number;
  streamHealth?: string;
}

/**
 * Mentor Channel Service Class
 */
export class MentorChannelService {
  
  /**
   * Get or Create Mentor's IVS Channel
   * 
   * This is the primary entry point for mentors to get their streaming credentials.
   * If the mentor already has a channel, returns existing credentials.
   * If not, creates a new IVS channel and stores it in the database.
   * 
   * @param mentorId - The unique ID of the mentor
   * @param mentorName - The display name of the mentor (for channel naming)
   * @returns MentorChannelCredentials with all info needed for OBS setup
   */
  async getOrCreateMentorChannel(
    mentorId: string,
    mentorName: string
  ): Promise<MentorChannelCredentials> {
    
    // Check if mentor already has a channel in database
    const existingChannel = await prisma.mentorChannel.findUnique({
      where: { mentorId },
    });

    if (existingChannel) {
      // Return existing credentials
      // Note: We fetch the stream key from AWS for security (not stored in DB)
      let streamKey = existingChannel.streamKey;
      
      if (!USE_MOCK && existingChannel.streamKeyArn) {
        try {
          const streamKeyResponse = await ivsClient.send(
            new GetStreamKeyCommand({ arn: existingChannel.streamKeyArn })
          );
          streamKey = streamKeyResponse.streamKey?.value || streamKey;
        } catch (error) {
          console.error('Failed to fetch stream key from AWS:', error);
          // Fall back to stored key if AWS call fails
        }
      }

      return {
        channelArn: existingChannel.channelArn,
        streamKey: streamKey,
        streamKeyArn: existingChannel.streamKeyArn,
        ingestEndpoint: existingChannel.ingestEndpoint,
        playbackUrl: existingChannel.playbackUrl,
      };
    }

    // Create new IVS channel for mentor
    return this.createNewMentorChannel(mentorId, mentorName);
  }

  /**
   * Create a new IVS channel for a mentor
   * Called internally when mentor doesn't have an existing channel
   */
  private async createNewMentorChannel(
    mentorId: string,
    mentorName: string
  ): Promise<MentorChannelCredentials> {
    const channelName = `mentor-${mentorId}-${Date.now()}`;

    // MOCK MODE: Return fake credentials for development
    if (USE_MOCK) {
      console.log('🎭 MOCK MODE: Creating fake IVS channel for development');
      
      const mockCredentials = {
        channelArn: `arn:aws:ivs:us-east-1:mock:channel/${channelName}`,
        streamKey: `sk_mock_${Math.random().toString(36).substring(7)}`,
        streamKeyArn: `arn:aws:ivs:us-east-1:mock:stream-key/${channelName}`,
        ingestEndpoint: 'mock-ingest.ivs.us-east-1.amazonaws.com',
        playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/${channelName}.m3u8`,
      };

      // Store mock channel in database
      await prisma.mentorChannel.create({
        data: {
          mentorId,
          channelArn: mockCredentials.channelArn,
          streamKeyArn: mockCredentials.streamKeyArn,
          streamKey: mockCredentials.streamKey,
          ingestEndpoint: mockCredentials.ingestEndpoint,
          playbackUrl: mockCredentials.playbackUrl,
        },
      });

      return mockCredentials;
    }

    // PRODUCTION MODE: Create real AWS IVS channel
    try {
      // Step 1: Create the IVS channel
      const createChannelResponse = await ivsClient.send(
        new CreateChannelCommand({
          name: channelName,
          latencyMode: ChannelLatencyMode.LowLatency, // Low latency for live teaching
          type: ChannelType.StandardChannelType, // Standard channel type
          authorized: false, // No token authorization required for viewers
          tags: {
            mentorId,
            mentorName,
            platform: 'skillyug',
            createdAt: new Date().toISOString(),
          },
        })
      );

      const channel = createChannelResponse.channel;
      if (!channel?.arn) {
        throw new BusinessLogicError('Failed to create IVS channel - no ARN returned');
      }

      // Step 2: Create a stream key for the channel
      const createStreamKeyResponse = await ivsClient.send(
        new CreateStreamKeyCommand({
          channelArn: channel.arn,
          tags: {
            mentorId,
            channelName,
          },
        })
      );

      const streamKey = createStreamKeyResponse.streamKey;
      if (!streamKey?.value || !streamKey?.arn) {
        throw new BusinessLogicError('Failed to create stream key');
      }

      const credentials: MentorChannelCredentials = {
        channelArn: channel.arn,
        streamKey: streamKey.value,
        streamKeyArn: streamKey.arn,
        ingestEndpoint: channel.ingestEndpoint || '',
        playbackUrl: channel.playbackUrl || '',
      };

      // Step 3: Store channel info in database
      await prisma.mentorChannel.create({
        data: {
          mentorId,
          channelArn: credentials.channelArn,
          streamKeyArn: credentials.streamKeyArn,
          streamKey: credentials.streamKey, // Store for backup/recovery
          ingestEndpoint: credentials.ingestEndpoint,
          playbackUrl: credentials.playbackUrl,
        },
      });

      console.log(`✅ Created IVS channel for mentor ${mentorId}`);
      return credentials;

    } catch (error) {
      console.error('Error creating IVS channel:', error);
      throw new BusinessLogicError('Failed to create streaming channel. Please try again or contact support.');
    }
  }

  /**
   * Verify if mentor's stream is actually live on AWS
   * 
   * @param mentorId - The mentor's user ID
   * @returns Object with live status, viewer count, and health info
   */
  async checkStreamStatus(mentorId: string): Promise<{
    isLive: boolean;
    viewerCount: number;
    streamHealth?: string;
    startTime?: Date;
  }> {
    const channel = await prisma.mentorChannel.findUnique({
      where: { mentorId },
    });

    if (!channel) {
      return { isLive: false, viewerCount: 0 };
    }

    // MOCK MODE
    if (USE_MOCK) {
      // Simulate random live status for testing
      const isLive = Math.random() > 0.5;
      return {
        isLive,
        viewerCount: isLive ? Math.floor(Math.random() * 100) : 0,
        streamHealth: isLive ? 'HEALTHY' : undefined,
        startTime: isLive ? new Date(Date.now() - 60000) : undefined,
      };
    }

    // PRODUCTION: Check AWS IVS
    try {
      const streamResponse = await ivsClient.send(
        new GetStreamCommand({ channelArn: channel.channelArn })
      );

      const stream = streamResponse.stream;
      if (stream && stream.state === 'LIVE') {
        return {
          isLive: true,
          viewerCount: stream.viewerCount || 0,
          streamHealth: stream.health,
          startTime: stream.startTime,
        };
      }

      return { isLive: false, viewerCount: 0 };
    } catch (error: unknown) {
      // ChannelNotBroadcasting or StreamNotFound means stream is not live
      const err = error as { name?: string };
      if (err.name === 'ChannelNotBroadcasting' || err.name === 'ResourceNotFoundException') {
        return { isLive: false, viewerCount: 0 };
      }
      throw error;
    }
  }

  /**
   * Start a Class Session
   * 
   * Called when mentor wants to go live for a specific class.
   * Verifies that the mentor's OBS is actually streaming, then creates a session record.
   * 
   * @param classId - The class/course ID this session is for
   * @param mentorId - The mentor's user ID
   * @param className - The name of the class (for display)
   * @returns Session info including playback URL for students
   */
  async startClassSession(
    classId: string,
    mentorId: string,
    _className: string
  ): Promise<ClassSessionData> {
    
    // Get mentor's channel
    const channel = await prisma.mentorChannel.findUnique({
      where: { mentorId },
    });

    if (!channel) {
      throw new NotFoundError('Mentor channel not found. Please set up your streaming credentials first.');
    }

    // Verify stream is actually live on AWS
    const streamStatus = await this.checkStreamStatus(mentorId);
    
    if (!streamStatus.isLive) {
      throw new BusinessLogicError(
        'Your stream is not live. Please start OBS and begin streaming before clicking "Go Live".'
      );
    }

    // Check if there's already an active session for this class
    const existingSession = await prisma.classSession.findFirst({
      where: {
        classId,
        status: 'live',
      },
    });

    if (existingSession) {
      // Return existing session instead of creating duplicate
      return {
        sessionId: existingSession.id,
        classId: existingSession.classId,
        mentorId: existingSession.mentorId,
        playbackUrl: channel.playbackUrl,
        startedAt: existingSession.startedAt,
        status: 'live',
        viewerCount: streamStatus.viewerCount,
        streamHealth: streamStatus.streamHealth,
      };
    }

    // Create new class session record
    const session = await prisma.classSession.create({
      data: {
        classId,
        mentorId,
        channelArn: channel.channelArn,
        status: 'live',
        startedAt: new Date(),
        viewerCount: streamStatus.viewerCount,
      },
    });

    return {
      sessionId: session.id,
      classId: session.classId,
      mentorId: session.mentorId,
      playbackUrl: channel.playbackUrl,
      startedAt: session.startedAt,
      status: 'live',
      viewerCount: streamStatus.viewerCount,
      streamHealth: streamStatus.streamHealth,
    };
  }

  /**
   * End a Class Session
   * 
   * Called when mentor ends their live class.
   * Updates the session record with end time and final stats.
   * 
   * @param sessionId - The session ID to end
   * @param mentorId - The mentor's user ID (for authorization)
   */
  async endClassSession(sessionId: string, mentorId: string): Promise<{ success: boolean }> {
    
    // Get and verify session
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.mentorId !== mentorId) {
      throw new AuthorizationError('You can only end your own sessions');
    }

    if (session.status === 'ended') {
      return { success: true }; // Already ended
    }

    // Get final viewer count before ending
    const streamStatus = await this.checkStreamStatus(mentorId);

    // Update session record
    await prisma.classSession.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        endedAt: new Date(),
        viewerCount: Math.max(session.viewerCount, streamStatus.viewerCount),
      },
    });

    return { success: true };
  }

  /**
   * Get Active Class Session
   * 
   * Check if there's an active live session for a specific class.
   * Used by students to join a live class.
   * 
   * @param classId - The class/course ID to check
   * @returns Session info with playback URL if live, or null if not live
   */
  async getActiveClassSession(classId: string): Promise<{
    isLive: boolean;
    sessionId?: string;
    playbackUrl?: string;
    classTitle?: string;
    mentorName?: string;
    startedAt?: Date;
    viewerCount?: number;
    streamHealth?: string;
  }> {
    
    // Find active session for this class
    const session = await prisma.classSession.findFirst({
      where: {
        classId,
        status: 'live',
      },
      include: {
        mentor: {
          select: {
            fullName: true,
            email: true,
          },
        },
        class: {
          select: {
            courseName: true,
          },
        },
      },
    });

    if (!session) {
      return { isLive: false };
    }

    // Get mentor's channel for playback URL
    const channel = await prisma.mentorChannel.findUnique({
      where: { mentorId: session.mentorId },
    });

    if (!channel) {
      return { isLive: false };
    }

    // Verify stream is actually live on AWS
    const streamStatus = await this.checkStreamStatus(session.mentorId);

    if (!streamStatus.isLive) {
      // Stream ended on AWS but session still marked live - update it
      await prisma.classSession.update({
        where: { id: session.id },
        data: {
          status: 'ended',
          endedAt: new Date(),
        },
      });
      return { isLive: false };
    }

    return {
      isLive: true,
      sessionId: session.id,
      playbackUrl: channel.playbackUrl,
      classTitle: session.class?.courseName,
      mentorName: session.mentor?.fullName || session.mentor?.email || undefined,
      startedAt: session.startedAt,
      viewerCount: streamStatus.viewerCount,
      streamHealth: streamStatus.streamHealth,
    };
  }

  /**
   * Get All Live Classes
   * 
   * Returns list of all currently live classes across the platform.
   * Used for the student dashboard to show available live sessions.
   */
  async getAllLiveClasses(): Promise<Array<{
    sessionId: string;
    classId: string;
    classTitle: string;
    mentorId: string;
    mentorName: string;
    mentorAvatar?: string;
    playbackUrl: string;
    startedAt: Date;
    viewerCount: number;
    streamHealth?: string;
  }>> {
    
    // Get all sessions marked as live
    const sessions = await prisma.classSession.findMany({
      where: { status: 'live' },
      include: {
        mentor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
        class: {
          select: {
            id: true,
            courseName: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const liveClasses = [];

    for (const session of sessions) {
      // Get mentor's channel
      const channel = await prisma.mentorChannel.findUnique({
        where: { mentorId: session.mentorId },
      });

      if (!channel) continue;

      // Verify stream is actually live
      const streamStatus = await this.checkStreamStatus(session.mentorId);

      if (streamStatus.isLive) {
        liveClasses.push({
          sessionId: session.id,
          classId: session.classId,
          classTitle: session.class?.courseName || 'Untitled Class',
          mentorId: session.mentorId,
          mentorName: session.mentor?.fullName || session.mentor?.email || 'Unknown Mentor',
          mentorAvatar: session.mentor?.image || undefined,
          playbackUrl: channel.playbackUrl,
          startedAt: session.startedAt,
          viewerCount: streamStatus.viewerCount,
          streamHealth: streamStatus.streamHealth,
        });
      } else {
        // Stream ended on AWS - update session status
        await prisma.classSession.update({
          where: { id: session.id },
          data: {
            status: 'ended',
            endedAt: new Date(),
          },
        });
      }
    }

    return liveClasses;
  }

  /**
   * Delete Mentor's Channel
   * 
   * Permanently delete a mentor's IVS channel (admin function).
   * Should rarely be needed - channels are reused.
   */
  async deleteMentorChannel(mentorId: string): Promise<void> {
    const channel = await prisma.mentorChannel.findUnique({
      where: { mentorId },
    });

    if (!channel) {
      throw new NotFoundError('Mentor channel not found');
    }

    // Delete from AWS (if not mock mode)
    if (!USE_MOCK) {
      try {
        // First delete all stream keys
        const streamKeysResponse = await ivsClient.send(
          new ListStreamKeysCommand({ channelArn: channel.channelArn })
        );

        for (const key of streamKeysResponse.streamKeys || []) {
          if (key.arn) {
            await ivsClient.send(new DeleteStreamKeyCommand({ arn: key.arn }));
          }
        }

        // Then delete the channel
        await ivsClient.send(new DeleteChannelCommand({ arn: channel.channelArn }));
      } catch (error) {
        console.error('Error deleting channel from AWS:', error);
      }
    }

    // Delete from database
    await prisma.mentorChannel.delete({
      where: { mentorId },
    });

    console.log(`🗑️ Deleted IVS channel for mentor ${mentorId}`);
  }

  /**
   * Regenerate Stream Key
   * 
   * Generate a new stream key for a mentor's channel.
   * Use this if the stream key is compromised.
   */
  async regenerateStreamKey(mentorId: string): Promise<{ streamKey: string }> {
    const channel = await prisma.mentorChannel.findUnique({
      where: { mentorId },
    });

    if (!channel) {
      throw new NotFoundError('Mentor channel not found');
    }

    if (USE_MOCK) {
      const newKey = `sk_mock_${Math.random().toString(36).substring(7)}`;
      await prisma.mentorChannel.update({
        where: { mentorId },
        data: { streamKey: newKey },
      });
      return { streamKey: newKey };
    }

    // Delete old stream key
    if (channel.streamKeyArn) {
      try {
        await ivsClient.send(new DeleteStreamKeyCommand({ arn: channel.streamKeyArn }));
      } catch (error) {
        console.error('Error deleting old stream key:', error);
      }
    }

    // Create new stream key
    const createStreamKeyResponse = await ivsClient.send(
      new CreateStreamKeyCommand({
        channelArn: channel.channelArn,
        tags: { mentorId },
      })
    );

    const newKey = createStreamKeyResponse.streamKey;
    if (!newKey?.value || !newKey?.arn) {
      throw new BusinessLogicError('Failed to create new stream key');
    }

    // Update database
    await prisma.mentorChannel.update({
      where: { mentorId },
      data: {
        streamKey: newKey.value,
        streamKeyArn: newKey.arn,
      },
    });

    return { streamKey: newKey.value };
  }
}

// Export singleton instance
export const mentorChannelService = new MentorChannelService();
