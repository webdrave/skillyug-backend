import { Response, NextFunction } from 'express';
import { channelPoolService } from '../services/channelPool.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * Admin Channel Pool Controller
 * Manages IVS channel pool for the platform
 */
export class AdminChannelController {
  /**
   * ADMIN: Create new IVS channel and add to pool
   * POST /admin/channels
   */
  async createChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, latencyMode } = req.body;

      const channel = await channelPoolService.createChannel({
        name,
        latencyMode: latencyMode || 'LOW',
      });

      res.status(201).json({
        message: 'Channel created and added to pool successfully',
        channel,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: List all channels in pool
   * GET /admin/channels
   */
  async listChannels(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { onlyEnabled, page, limit } = req.query;

      const result = await channelPoolService.listChannels({
        onlyEnabled: onlyEnabled === 'true',
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
      });

      res.json({
        message: 'Channels retrieved successfully',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Delete a channel from pool
   * DELETE /admin/channels/:channelId
   */
  async deleteChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;

      await channelPoolService.deleteChannel(channelId);

      res.json({
        message: 'Channel deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Enable/disable a channel
   * PATCH /admin/channels/:channelId/toggle
   */
  async toggleChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const { isEnabled } = req.body;

      await channelPoolService.toggleChannel(channelId, isEnabled);

      res.json({
        message: `Channel ${isEnabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get channel statistics
   * GET /admin/channels/stats
   */
  async getChannelStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await channelPoolService.getChannelStats();

      res.json({
        message: 'Channel statistics retrieved successfully',
        stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminChannelController = new AdminChannelController();
