import { BusinessLogicError } from '../utils/errors';

/**
 * IVS Stage Service - WebRTC Real-time Stages
 * 
 * NOTE: AWS IVS Real-time Stages are not yet available in @aws-sdk/client-ivs
 * This service is disabled until AWS SDK supports it.
 * 
 * For now, use RTMPS streaming with OBS.
 * See CRITICAL_FIXES_NEEDED.md for alternatives.
 */
class IVSStageService {
  constructor() {
    console.warn('⚠️  IVS Real-time Stages not yet supported in AWS SDK - use RTMPS streaming');
  }

  async createStage(_params: {
    name: string;
    mentorId: string;
    autoParticipantRecording?: boolean;
  }): Promise<never> {
    throw new BusinessLogicError(
      'WebRTC Real-time Stages not yet supported in AWS SDK. ' +
      'Please use RTMPS streaming with OBS instead. ' +
      'Set streamType to RTMPS when creating a session.'
    );
  }

  async createParticipantToken(_params: {
    stageArn: string;
    userId: string;
    capabilities?: ('PUBLISH' | 'SUBSCRIBE')[];
    durationMinutes?: number;
  }): Promise<never> {
    throw new BusinessLogicError('WebRTC not yet supported - use RTMPS streaming');
  }

  async getStage(_stageArn: string): Promise<never> {
    throw new BusinessLogicError('WebRTC not yet supported - use RTMPS streaming');
  }

  async deleteStage(_stageArn: string): Promise<void> {
    console.log('WebRTC stage deletion skipped - not supported');
  }

  async listStages(): Promise<never[]> {
    return [];
  }
}

export const ivsStageService = new IVSStageService();
