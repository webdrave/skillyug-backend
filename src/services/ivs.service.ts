import {
  IvsClient,
  CreateChannelCommand,
  GetChannelCommand,
  DeleteChannelCommand,
  ListChannelsCommand,
  CreateStreamKeyCommand,
  GetStreamKeyCommand,
  DeleteStreamKeyCommand,
  ListStreamKeysCommand,
  StopStreamCommand,
  ChannelLatencyMode,
  ChannelType,
} from '@aws-sdk/client-ivs';
import { NotFoundError, BusinessLogicError } from '../utils/errors';

/**
 * AWS IVS Service - Manages live streaming channels for mentors
 */
export class IVSService {
  private client: IvsClient;
  private readonly DEFAULT_REGION = process.env.AWS_REGION || 'us-east-1';
  private readonly USE_MOCK = process.env.USE_MOCK_STREAMING === 'true' || process.env.NODE_ENV === 'development';

  constructor() {
    if (!this.USE_MOCK) {
      this.client = new IvsClient({
        region: this.DEFAULT_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
    } else {
      // Mock mode - initialize with dummy to satisfy TS
      this.client = new IvsClient({
        region: 'us-east-1',
        credentials: { accessKeyId: 'mock', secretAccessKey: 'mock' }
      });
    }
  }

  /**
   * Create a new IVS channel for a mentor
   */
  async createChannel(params: {
    mentorId: string;
    mentorName: string;
    latencyMode?: ChannelLatencyMode;
    type?: ChannelType;
    authorized?: boolean;
  }): Promise<{
    channelArn: string;
    channelName: string;
    ingestEndpoint: string;
    playbackUrl: string;
    streamKey: string;
    streamKeyArn: string;
  }> {
    const channelName = `mentor-${params.mentorId}-${Date.now()}`;

    // Development mode - return mock data
    if (this.USE_MOCK) {
      console.log('🎭 Using MOCK streaming (AWS IVS disabled for development)');
      return {
        channelArn: `arn:aws:ivs:us-east-1:mock:channel/mock-${channelName}`,
        channelName,
        ingestEndpoint: `rtmps://mock-ingest.ivs.amazonaws.com:443/app/`,
        playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/${channelName}.m3u8`,
        streamKey: `sk_mock_${Math.random().toString(36).substring(7)}`,
        streamKeyArn: `arn:aws:ivs:us-east-1:mock:stream-key/mock-${channelName}`,
      };
    }

    try {
      // Production mode - use real AWS IVS
      const createChannelCommand = new CreateChannelCommand({
        name: channelName,
        latencyMode: params.latencyMode || ChannelLatencyMode.LowLatency,
        type: params.type || ChannelType.StandardChannelType,
        authorized: params.authorized || false,
        tags: {
          mentorId: params.mentorId,
          mentorName: params.mentorName,
          createdAt: new Date().toISOString(),
        },
      });

      const channelResponse = await this.client.send(createChannelCommand);

      if (!channelResponse.channel?.arn) {
        throw new BusinessLogicError('Failed to create IVS channel');
      }

      // Create stream key for the channel
      const createStreamKeyCommand = new CreateStreamKeyCommand({
        channelArn: channelResponse.channel.arn,
        tags: {
          mentorId: params.mentorId,
          channelName,
        },
      });

      const streamKeyResponse = await this.client.send(createStreamKeyCommand);

      if (!streamKeyResponse.streamKey?.value || !streamKeyResponse.streamKey?.arn) {
        throw new BusinessLogicError('Failed to create stream key');
      }

      return {
        channelArn: channelResponse.channel.arn,
        channelName: channelResponse.channel.name || channelName,
        ingestEndpoint: channelResponse.channel.ingestEndpoint || '',
        playbackUrl: channelResponse.channel.playbackUrl || '',
        streamKey: streamKeyResponse.streamKey.value,
        streamKeyArn: streamKeyResponse.streamKey.arn,
      };
    } catch (error) {
      console.error('Error creating IVS channel:', error);
      throw new BusinessLogicError('Failed to create streaming channel');
    }
  }

  /**
   * Get channel information
   */
  async getChannel(channelArn: string): Promise<{
    arn: string;
    name: string;
    latencyMode: string;
    type: string;
    playbackUrl: string;
    ingestEndpoint: string;
    authorized: boolean;
  }> {
    // Mock mode
    if (this.USE_MOCK) {
      return {
        arn: channelArn,
        name: channelArn.split('/').pop() || 'mock-channel',
        latencyMode: 'LOW',
        type: 'STANDARD',
        playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/mock.m3u8`,
        ingestEndpoint: 'rtmps://mock-ingest.ivs.amazonaws.com:443/app/',
        authorized: false,
      };
    }

    try {
      const command = new GetChannelCommand({ arn: channelArn });
      const response = await this.client.send(command);

      if (!response.channel) {
        throw new NotFoundError('Channel');
      }

      return {
        arn: response.channel.arn || '',
        name: response.channel.name || '',
        latencyMode: response.channel.latencyMode || '',
        type: response.channel.type || '',
        playbackUrl: response.channel.playbackUrl || '',
        ingestEndpoint: response.channel.ingestEndpoint || '',
        authorized: response.channel.authorized || false,
      };
    } catch (error) {
      console.error('Error getting IVS channel:', error);
      throw new NotFoundError('Channel');
    }
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelArn: string): Promise<void> {
    // Mock mode - just return success
    if (this.USE_MOCK) {
      console.log('🎭 Mock: Deleted channel', channelArn);
      return;
    }

    try {
      const command = new DeleteChannelCommand({ arn: channelArn });
      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting IVS channel:', error);
      throw new BusinessLogicError('Failed to delete streaming channel');
    }
  }

  /**
   * Get stream key for a channel
   */
  async getStreamKey(streamKeyArn: string): Promise<{
    arn: string;
    value: string;
    channelArn: string;
  }> {
    try {
      const command = new GetStreamKeyCommand({ arn: streamKeyArn });
      const response = await this.client.send(command);

      if (!response.streamKey) {
        throw new NotFoundError('Stream key');
      }

      return {
        arn: response.streamKey.arn || '',
        value: response.streamKey.value || '',
        channelArn: response.streamKey.channelArn || '',
      };
    } catch (error) {
      console.error('Error getting stream key:', error);
      throw new NotFoundError('Stream key');
    }
  }

  /**
   * List all stream keys for a channel
   */
  async listStreamKeys(channelArn: string): Promise<Array<{
    arn: string;
    channelArn: string;
  }>> {
    try {
      const command = new ListStreamKeysCommand({ channelArn });
      const response = await this.client.send(command);

      return response.streamKeys?.map(key => ({
        arn: key.arn || '',
        channelArn: key.channelArn || '',
      })) || [];
    } catch (error) {
      console.error('Error listing stream keys:', error);
      return [];
    }
  }

  /**
   * Delete a stream key
   */
  async deleteStreamKey(streamKeyArn: string): Promise<void> {
    try {
      const command = new DeleteStreamKeyCommand({ arn: streamKeyArn });
      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting stream key:', error);
      throw new BusinessLogicError('Failed to delete stream key');
    }
  }

  /**
   * Stop a live stream
   */
  async stopStream(channelArn: string): Promise<void> {
    try {
      const command = new StopStreamCommand({ channelArn });
      await this.client.send(command);
    } catch (error) {
      console.error('Error stopping stream:', error);
      throw new BusinessLogicError('Failed to stop stream');
    }
  }

  /**
   * List all channels (with pagination)
   */
  async listChannels(params?: {
    filterByRecordingConfigurationArn?: string;
    maxResults?: number;
    nextToken?: string;
  }): Promise<{
    channels: Array<{
      arn: string;
      name: string;
      latencyMode: string;
      authorized: boolean;
    }>;
    nextToken?: string;
  }> {
    try {
      const command = new ListChannelsCommand({
        filterByRecordingConfigurationArn: params?.filterByRecordingConfigurationArn,
        maxResults: params?.maxResults || 50,
        nextToken: params?.nextToken,
      });

      const response = await this.client.send(command);

      return {
        channels: response.channels?.map(channel => ({
          arn: channel.arn || '',
          name: channel.name || '',
          latencyMode: channel.latencyMode || '',
          authorized: channel.authorized || false,
        })) || [],
        nextToken: response.nextToken,
      };
    } catch (error) {
      console.error('Error listing channels:', error);
      return { channels: [] };
    }
  }

  /**
   * Create a new stream key for an existing channel
   */
  async createStreamKey(channelArn: string): Promise<{
    streamKey: string;
    streamKeyArn: string;
  }> {
    try {
      const command = new CreateStreamKeyCommand({ channelArn });
      const response = await this.client.send(command);

      if (!response.streamKey?.value || !response.streamKey?.arn) {
        throw new BusinessLogicError('Failed to create stream key');
      }

      return {
        streamKey: response.streamKey.value,
        streamKeyArn: response.streamKey.arn,
      };
    } catch (error) {
      console.error('Error creating stream key:', error);
      throw new BusinessLogicError('Failed to create stream key');
    }
  }
}

// Export singleton instance
export const ivsService = new IVSService();
