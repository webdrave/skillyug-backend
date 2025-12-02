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
          channelId: channel.channelId!,
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
}
