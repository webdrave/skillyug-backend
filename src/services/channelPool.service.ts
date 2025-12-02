import prisma from '../utils/prisma';
import { ivsService } from './ivs.service';
import { BusinessLogicError, NotFoundError } from '../utils/errors';
import { IvsClient, GetStreamCommand } from '@aws-sdk/client-ivs';

/**
 * Channel Pool Service - Enterprise Architecture
 * Manages reusable IVS channel pool for all sessions
 */
export class ChannelPoolService {
  private ivsClient: IvsClient;

  constructor() {
    this.ivsClient = new IvsClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * ADMIN: Create a new IVS channel and add to pool
   */
  async createChannel(params: {
    name?: string;
    latencyMode?: 'NORMAL' | 'LOW';
  }): Promise<{
    id: string;
    channelArn: string;
    channelId: string;
    channelName: string;
    ingestEndpoint: string;
    playbackUrl: string;
  }> {
    try {
      // Create channel via AWS IVS
      const channelData = await ivsService.createChannel({
        mentorId: 'admin-pool',
        mentorName: params.name || `Channel-${Date.now()}`,
        latencyMode: params.latencyMode === 'LOW' ? 'LOW' : 'NORMAL',
      });

      // Store in database (channel pool)
      const channel = await prisma.iVSChannel.create({
        data: {
          channelArn: channelData.channelArn,
          channelId: channelData.channelArn.split('/').pop() || channelData.channelName,
          channelName: channelData.channelName,
          ingestEndpoint: channelData.ingestEndpoint,
          playbackUrl: channelData.playbackUrl,
          isActive: false,
          isEnabled: true,
        },
      });

      return {
        id: channel.id,
        channelArn: channel.channelArn,
        channelId: channel.channelId,
        channelName: channel.channelName,
        ingestEndpoint: channel.ingestEndpoint,
        playbackUrl: channel.playbackUrl,
      };
    } catch (error) {
      console.error('Error creating channel for pool:', error);
      throw new BusinessLogicError('Failed to create IVS channel');
    }
  }

  /**
   * ADMIN: List all channels in pool
   */
  async listChannels(params?: {
    onlyEnabled?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    channels: Array<{
      id: string;
      channelName: string;
      channelArn: string;
      isActive: boolean;
      isEnabled: boolean;
      assignedToSessionId: string | null;
      playbackUrl: string;
      totalUsageHours: number;
      lastUsedAt: Date | null;
    }>;
    total: number;
  }> {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const skip = (page - 1) * limit;

    const where = params?.onlyEnabled ? { isEnabled: true } : {};

    const [channels, total] = await Promise.all([
      prisma.iVSChannel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.iVSChannel.count({ where }),
    ]);

    return {
      channels,
      total,
    };
  }

  /**
   * ADMIN: Delete a channel from pool
   */
  async deleteChannel(channelId: string): Promise<void> {
    const channel = await prisma.iVSChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundError('Channel');
    }

    if (channel.isActive) {
      throw new BusinessLogicError('Cannot delete an active channel. End the session first.');
    }

    // Delete from AWS IVS
    try {
      await ivsService.deleteChannel(channel.channelArn);
    } catch (error) {
      console.error('Error deleting AWS IVS channel:', error);
      // Continue even if AWS deletion fails
    }

    // Delete from database
    await prisma.iVSChannel.delete({
      where: { id: channelId },
    });
  }

  /**
   * ADMIN: Enable/disable a channel
   */
  async toggleChannel(channelId: string, isEnabled: boolean): Promise<void> {
    await prisma.iVSChannel.update({
      where: { id: channelId },
      data: { isEnabled },
    });
  }

  /**
   * SYSTEM: Find a free channel for assignment
   */
  async findFreeChannel(): Promise<{
    id: string;
    channelArn: string;
    channelId: string;
    ingestEndpoint: string;
    playbackUrl: string;
  } | null> {
    // Get all channels that appear free in DB
    const candidates = await prisma.iVSChannel.findMany({
      where: {
        isActive: false,
        isEnabled: true,
      },
      orderBy: {
        lastUsedAt: 'asc', // Least recently used first
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    // Double-check with AWS IVS if channel is really free
    for (const channel of candidates) {
      const isReallyFree = await this.verifyChannelIsFree(channel.channelArn);
      if (isReallyFree) {
        return {
          id: channel.id,
          channelArn: channel.channelArn,
          channelId: channel.channelId,
          ingestEndpoint: channel.ingestEndpoint,
          playbackUrl: channel.playbackUrl,
        };
      } else {
        // Fix inconsistent state
        await prisma.iVSChannel.update({
          where: { id: channel.id },
          data: { isActive: true },
        });
      }
    }

    return null;
  }

  /**
   * SYSTEM: Verify with AWS if channel is actually free
   */
  private async verifyChannelIsFree(channelArn: string): Promise<boolean> {
    try {
      const command = new GetStreamCommand({ channelArn });
      const response = await this.ivsClient.send(command);
      
      // If GetStream returns data, stream is live
      return !response.stream || response.stream.state !== 'LIVE';
    } catch (error: unknown) {
      // If error is ResourceNotFoundException, channel is free
      const err = error as { name?: string };
      if (err.name === 'ResourceNotFoundException' || err.name === 'ChannelNotBroadcasting') {
        return true;
      }
      console.error('Error verifying channel status:', error);
      return false; // Assume busy on error
    }
  }

  /**
   * SYSTEM: Assign channel to session
   */
  async assignChannelToSession(
    channelId: string,
    sessionId: string
  ): Promise<{
    streamKey: string;
    ingestEndpoint: string;
    playbackUrl: string;
  }> {
    const channel = await prisma.iVSChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundError('Channel');
    }

    if (channel.isActive) {
      throw new BusinessLogicError('Channel is already in use');
    }

    // Create stream key for this session
    const { streamKey } = await ivsService.createStreamKey(channel.channelArn);

    // Mark channel as active
    await prisma.iVSChannel.update({
      where: { id: channelId },
      data: {
        isActive: true,
        assignedToSessionId: sessionId,
        lastUsedAt: new Date(),
      },
    });

    return {
      streamKey,
      ingestEndpoint: channel.ingestEndpoint,
      playbackUrl: channel.playbackUrl,
    };
  }

  /**
   * SYSTEM: Release channel after session ends
   */
  async releaseChannel(channelId: string): Promise<void> {
    const channel = await prisma.iVSChannel.findUnique({
      where: { id: channelId },
      include: {
        sessions: {
          where: { status: 'LIVE' },
          select: { id: true },
        },
      },
    });

    if (!channel) {
      throw new NotFoundError('Channel');
    }

    // Make sure no active sessions are using this channel
    if (channel.sessions.length > 0) {
      throw new BusinessLogicError('Channel still has active sessions');
    }

    // Mark channel as free
    await prisma.iVSChannel.update({
      where: { id: channelId },
      data: {
        isActive: false,
        assignedToSessionId: null,
      },
    });
  }

  /**
   * ADMIN: Get channel statistics
   */
  async getChannelStats(): Promise<{
    total: number;
    active: number;
    free: number;
    disabled: number;
    totalUsageHours: number;
  }> {
    const [total, active, free, disabled, usage] = await Promise.all([
      prisma.iVSChannel.count(),
      prisma.iVSChannel.count({ where: { isActive: true, isEnabled: true } }),
      prisma.iVSChannel.count({ where: { isActive: false, isEnabled: true } }),
      prisma.iVSChannel.count({ where: { isEnabled: false } }),
      prisma.iVSChannel.aggregate({
        _sum: { totalUsageHours: true },
      }),
    ]);

    return {
      total,
      active,
      free,
      disabled,
      totalUsageHours: usage._sum.totalUsageHours || 0,
    };
  }
}

// Export singleton
export const channelPoolService = new ChannelPoolService();
