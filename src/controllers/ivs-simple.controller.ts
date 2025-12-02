import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IvsClient, CreateChannelCommand, CreateStreamKeyCommand, GetStreamCommand } from '@aws-sdk/client-ivs';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const ivs = new IvsClient({ region: process.env.AWS_REGION });

export class IvsSimpleController {

  // ADMIN: Create channel
  static async createChannel(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'ADMIN') return res.status(403).send('forbidden');

    const { name, type = 'STANDARD' } = req.body;
    try {
      const resp = await ivs.send(new CreateChannelCommand({
        name,
        type,
        recordingConfigurationArn: process.env.IVS_RECORDING_ARN || undefined
      }));

      const channel = resp.channel;
      if (!channel) throw new Error('No channel returned from AWS');

      const created = await prisma.iVSChannel.create({
        data: {
          channelArn: channel.arn!,
          channelId: channel.name || name,
          playbackUrl: channel.playbackUrl!,
          ingestEndpoint: channel.ingestEndpoint!,
          channelName: channel.name || name,
        }
      });
      res.json(created);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'create channel failed', details: err.message });
    }
  }

  // Helper: check if channel has live stream
  private static async isChannelLive(channelArn: string) {
    try {
      const res = await ivs.send(new GetStreamCommand({ channelArn }));
      return !!res.stream;
    } catch (err: any) {
      if (err.name === 'ResourceNotFoundException') return false;
      throw err;
    }
  }

  // Get a free channel
  private static async getAvailableChannel() {
    const candidates = await prisma.iVSChannel.findMany({ where: { isActive: false } });
    for (const ch of candidates) {
      const live = await IvsSimpleController.isChannelLive(ch.channelArn);
      if (!live) return ch;
      // else if live, mark active to avoid repeated checking
      await prisma.iVSChannel.update({ where: { id: ch.id }, data: { isActive: true } });
    }
    return null;
  }

  // Mentor: Start session
  static async startSession(req: AuthenticatedRequest, res: Response) {
    const { sessionId } = req.params;
    
    const session = await prisma.scheduledSession.findUnique({ 
        where: { id: sessionId },
        include: { mentorProfile: true }
    });
    
    if (!session) return res.status(404).send('session not found');
    
    // Check if user is the mentor of this session
    if (session.mentorProfile.userId !== req.user?.id && req.user?.userType !== 'ADMIN') {
        return res.status(403).send('forbidden');
    }

    const freeCh = await IvsSimpleController.getAvailableChannel();
    if (!freeCh) return res.status(503).json({ error: 'no free channels' });

    try {
      const skResp = await ivs.send(new CreateStreamKeyCommand({ channelArn: freeCh.channelArn }));
      const streamKey = skResp.streamKey?.value;

      await prisma.scheduledSession.update({
        where: { id: sessionId },
        data: {
          ivsChannelId: freeCh.id,
          currentStreamKey: streamKey,
          status: 'LIVE',
          startedAt: new Date()
        }
      });

      await prisma.iVSChannel.update({
        where: { id: freeCh.id },
        data: {
          isActive: true,
          assignedToSessionId: sessionId
        }
      });

      return res.json({
        ingestEndpoint: freeCh.ingestEndpoint,
        streamKey,
        playbackUrl: freeCh.playbackUrl,
        channelId: freeCh.id
      });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: 'start failed', details: err.message });
    }
  }

  // Mentor: Stop session
  static async stopSession(req: AuthenticatedRequest, res: Response) {
    const { sessionId } = req.params;
    const session = await prisma.scheduledSession.findUnique({ 
        where: { id: sessionId },
        include: { mentorProfile: true }
    });
    
    if (!session) return res.status(404).send('not found');
    if (session.mentorProfile.userId !== req.user?.id && req.user?.userType !== 'ADMIN') {
        return res.status(403).send('forbidden');
    }

    if (!session.ivsChannelId) {
      return res.json({ ok: true, msg: 'no channel assigned' });
    }

    await prisma.iVSChannel.update({
      where: { id: session.ivsChannelId },
      data: { isActive: false, assignedToSessionId: null }
    });

    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: { 
          ivsChannelId: null,
          status: 'ENDED',
          endedAt: new Date()
      }
    });

    res.json({ ok: true });
  }

  // Student: Join session
  static async joinSession(req: AuthenticatedRequest, res: Response) {
    const { sessionId } = req.params;
    const session = await prisma.scheduledSession.findUnique({ 
        where: { id: sessionId }, 
        include: { course: true, ivsChannel: true, mentorProfile: true }
    });
    
    if (!session) return res.status(404).send('session not found');

    // Check enrollment
    if (session.courseId) {
        const enrolled = await prisma.enrollment.findFirst({
            where: { courseId: session.courseId, userId: req.user?.id }
        });
        if (!enrolled && req.user?.userType !== 'ADMIN' && session.mentorProfile.userId !== req.user?.id) {
            return res.status(403).send('not enrolled');
        }
    }

    if (!session.ivsChannel?.playbackUrl) return res.status(400).json({ error: 'session not started yet' });

    res.json({
      playbackUrl: session.ivsChannel.playbackUrl,
      sessionId: session.id,
      title: session.title
    });
  }

  // Admin: List channels
  static async listChannels(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'ADMIN') return res.status(403).send('forbidden');
    const channels = await prisma.iVSChannel.findMany();
    res.json(channels);
  }

  // Mentor: Get streaming credentials (ingest server + stream key) for a session
  // This uses an available channel from the pool without creating a new IVS channel
  static async getStreamingCredentials(req: AuthenticatedRequest, res: Response) {
    const { sessionId } = req.params;
    
    // Check if user is a mentor
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Only mentors can get streaming credentials' });
    }

    try {
      // Get the session and verify ownership
      const session = await prisma.scheduledSession.findUnique({
        where: { id: sessionId },
        include: { 
          mentorProfile: true,
          ivsChannel: true 
        }
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Verify the user is the mentor for this session
      if (session.mentorProfile.userId !== req.user?.id && req.user?.userType !== 'ADMIN') {
        return res.status(403).json({ error: 'You are not authorized to access this session' });
      }

      // If session already has a channel assigned with stream key, return those credentials
      if (session.ivsChannel && session.currentStreamKey) {
        return res.json({
          ingestServer: session.ivsChannel.ingestEndpoint,
          streamKey: session.currentStreamKey,
          playbackUrl: session.ivsChannel.playbackUrl,
          channelId: session.ivsChannel.id,
          sessionId: session.id,
          status: session.status,
          message: 'Using existing channel assignment'
        });
      }

      // Find an available channel from the pool
      const freeChannel = await IvsSimpleController.getAvailableChannel();
      
      if (!freeChannel) {
        return res.status(503).json({ 
          error: 'No available channels', 
          message: 'All streaming channels are currently in use. Please try again later or contact admin.'
        });
      }

      // Create a new stream key for this session
      const streamKeyResp = await ivs.send(new CreateStreamKeyCommand({ 
        channelArn: freeChannel.channelArn 
      }));
      const streamKey = streamKeyResp.streamKey?.value;

      if (!streamKey) {
        return res.status(500).json({ error: 'Failed to generate stream key' });
      }

      // Assign the channel to this session
      await prisma.scheduledSession.update({
        where: { id: sessionId },
        data: {
          ivsChannelId: freeChannel.id,
          currentStreamKey: streamKey,
          status: 'SCHEDULED' // Keep as scheduled until they actually start streaming
        }
      });

      // Mark channel as active and assigned
      await prisma.iVSChannel.update({
        where: { id: freeChannel.id },
        data: {
          isActive: true,
          assignedToSessionId: sessionId
        }
      });

      return res.json({
        ingestServer: freeChannel.ingestEndpoint,
        streamKey: streamKey,
        playbackUrl: freeChannel.playbackUrl,
        channelId: freeChannel.id,
        sessionId: session.id,
        status: 'READY',
        message: 'Channel assigned. You can now configure OBS with these credentials.'
      });

    } catch (err: any) {
      console.error('Error getting streaming credentials:', err);
      return res.status(500).json({ 
        error: 'Failed to get streaming credentials', 
        details: err.message 
      });
    }
  }

  // Mentor: Release streaming credentials (when done or cancelled)
  static async releaseStreamingCredentials(req: AuthenticatedRequest, res: Response) {
    const { sessionId } = req.params;
    
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Only mentors can release streaming credentials' });
    }

    try {
      const session = await prisma.scheduledSession.findUnique({
        where: { id: sessionId },
        include: { mentorProfile: true }
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.mentorProfile.userId !== req.user?.id && req.user?.userType !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (!session.ivsChannelId) {
        return res.json({ ok: true, message: 'No channel was assigned' });
      }

      // Release the channel back to the pool
      await prisma.iVSChannel.update({
        where: { id: session.ivsChannelId },
        data: { 
          isActive: false, 
          assignedToSessionId: null 
        }
      });

      // Clear channel from session
      await prisma.scheduledSession.update({
        where: { id: sessionId },
        data: { 
          ivsChannelId: null,
          currentStreamKey: null
        }
      });

      return res.json({ ok: true, message: 'Streaming credentials released' });

    } catch (err: any) {
      console.error('Error releasing streaming credentials:', err);
      return res.status(500).json({ 
        error: 'Failed to release credentials', 
        details: err.message 
      });
    }
  }

  // ============================================
  // STUDENT ENDPOINTS
  // ============================================

  /**
   * Get all currently live sessions/classes
   * Called: Student dashboard showing all available live classes
   */
  static async getLiveClasses(req: AuthenticatedRequest, res: Response) {
    try {
      const sessions = await prisma.scheduledSession.findMany({
        where: { status: 'LIVE' },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
              description: true
            }
          },
          ivsChannel: true
        },
        orderBy: { startedAt: 'desc' }
      });

      // Verify each stream is actually live on AWS and collect results
      const liveClasses = [];

      for (const session of sessions) {
        if (!session.ivsChannel) continue;

        let streamHealth = null;
        let viewerCount = 0;
        let isActuallyLive = false;

        try {
          const streamResponse = await ivs.send(new GetStreamCommand({
            channelArn: session.ivsChannel.channelArn
          }));

          if (streamResponse.stream?.state === 'LIVE') {
            isActuallyLive = true;
            streamHealth = streamResponse.stream.health;
            viewerCount = streamResponse.stream.viewerCount || 0;
          }
        } catch {
          // Stream not found on AWS - mark as not live
          isActuallyLive = false;
        }

        if (isActuallyLive) {
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
            viewerCount,
            streamHealth,
            enableChat: session.enableChat,
            enableQuiz: session.enableQuiz
          });
        }
      }

      return res.json({
        success: true,
        count: liveClasses.length,
        classes: liveClasses
      });

    } catch (err: any) {
      console.error('Error getting live classes:', err);
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * Get active session for a specific class/course
   * Called: When student opens a class page
   */
  static async getActiveClassSession(req: AuthenticatedRequest, res: Response) {
    try {
      const { courseId } = req.params;

      // Get active session for this course
      const session = await prisma.scheduledSession.findFirst({
        where: { 
          courseId,
          status: 'LIVE'
        },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true
            }
          },
          ivsChannel: true
        },
        orderBy: { startedAt: 'desc' }
      });

      if (!session) {
        return res.json({
          success: true,
          isLive: false,
          message: 'No active session for this class'
        });
      }

      if (!session.ivsChannel) {
        return res.json({
          success: true,
          isLive: false,
          message: 'Session exists but no channel assigned'
        });
      }

      // Verify stream is actually live on AWS
      let isActuallyLive = false;
      let streamHealth = null;
      let viewerCount = 0;

      try {
        const streamResponse = await ivs.send(new GetStreamCommand({
          channelArn: session.ivsChannel.channelArn
        }));
        
        isActuallyLive = streamResponse.stream?.state === 'LIVE';
        streamHealth = streamResponse.stream?.health || null;
        viewerCount = streamResponse.stream?.viewerCount || 0;
      } catch {
        // Stream not found
        isActuallyLive = false;
      }

      return res.json({
        success: true,
        isLive: isActuallyLive,
        data: {
          sessionId: session.id,
          title: session.title,
          description: session.description,
          courseId: session.courseId,
          courseName: session.course?.courseName,
          mentorName: session.mentorProfile.user?.fullName,
          playbackUrl: session.ivsChannel.playbackUrl,
          startedAt: session.startedAt,
          streamHealth,
          viewerCount,
          enableChat: session.enableChat,
          enableQuiz: session.enableQuiz
        }
      });

    } catch (err: any) {
      console.error('Error getting active class session:', err);
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * Check stream health/status
   * Called: Periodically by frontend to update UI
   */
  static async getStreamStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { sessionId } = req.params;

      const session = await prisma.scheduledSession.findUnique({
        where: { id: sessionId },
        include: { ivsChannel: true }
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      if (!session.ivsChannel) {
        return res.json({
          success: true,
          isLive: false,
          data: null,
          message: 'No channel assigned to this session'
        });
      }

      try {
        const streamResponse = await ivs.send(new GetStreamCommand({
          channelArn: session.ivsChannel.channelArn
        }));

        return res.json({
          success: true,
          isLive: streamResponse.stream?.state === 'LIVE',
          data: {
            state: streamResponse.stream?.state,
            health: streamResponse.stream?.health,
            viewerCount: streamResponse.stream?.viewerCount || 0,
            startTime: streamResponse.stream?.startTime
          }
        });
      } catch {
        // Stream not found on AWS
        return res.json({
          success: true,
          isLive: false,
          data: null
        });
      }

    } catch (err) {
      console.error('Error checking stream status:', err);
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  /**
   * Check stream status by channel ARN (for more direct access)
   */
  static async getStreamStatusByChannel(req: AuthenticatedRequest, res: Response) {
    try {
      const channelArn = decodeURIComponent(req.params.channelArn);

      try {
        const streamResponse = await ivs.send(new GetStreamCommand({ channelArn }));

        return res.json({
          success: true,
          isLive: streamResponse.stream?.state === 'LIVE',
          data: {
            state: streamResponse.stream?.state,
            health: streamResponse.stream?.health,
            viewerCount: streamResponse.stream?.viewerCount || 0,
            startTime: streamResponse.stream?.startTime
          }
        });
      } catch {
        return res.json({
          success: true,
          isLive: false,
          data: null
        });
      }

    } catch (err) {
      console.error('Error checking stream status by channel:', err);
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }
}
