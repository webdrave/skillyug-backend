import { Response, NextFunction } from 'express';
import { purchaseService } from '../services/purchase.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * Purchase Controller
 * Handles HTTP requests for purchase operations
 * Business logic is delegated to PurchaseService
 */
export class PurchaseController {

  /**
   * Save a purchase after successful payment
   * POST /api/purchases
   */
  async savePurchase(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { courseId, paymentRef, amount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      if (!courseId || !paymentRef) {
        return ResponseUtil.fail(res, 'courseId and paymentRef are required');
      }

      const result = await purchaseService.savePurchase(userId, courseId, paymentRef, amount);
      
      ResponseUtil.created(res, result, 'Purchase saved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check purchase status for a course
   * GET /api/purchases/check/:courseId
   */
  async checkPurchaseStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.checkPurchaseStatus(userId, courseId);
      
      ResponseUtil.success(res, result, 'Purchase status retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's purchases
   * GET /api/purchases/my-purchases
   */
  async getUserPurchases(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 10 } = req.query;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.getUserPurchases(
        userId,
        Number(page),
        Number(limit)
      );
      
      ResponseUtil.successWithPagination(res, result.purchases, result.pagination, 'User purchases retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get purchase details by ID
   * GET /api/purchases/:purchaseId
   */
  async getPurchaseById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { purchaseId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.getPurchaseById(purchaseId, userId);
      
      ResponseUtil.success(res, result, 'Purchase details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's purchased courses
   * GET /api/purchases/my-courses
   */
  async getUserPurchasedCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.getPurchasedCourses(userId);
      
      ResponseUtil.success(res, result, 'User purchased courses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get purchase analytics (Admin only)
   * GET /api/purchases/analytics
   */
  async getPurchaseAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const adminId = req.user?.id;
      const { startDate, endDate } = req.query;

      if (!adminId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      const dateRange = startDate && endDate ? {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      } : undefined;
      
      const result = await purchaseService.getPurchaseAnalytics(adminId, dateRange);
      
      ResponseUtil.success(res, result, 'Purchase analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel purchase (Admin only)
   * POST /api/purchases/:purchaseId/cancel
   */
  async cancelPurchase(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { purchaseId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.id;

      if (!adminId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.cancelPurchase(purchaseId, adminId, reason);
      
      ResponseUtil.success(res, result, 'Purchase cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user purchase statistics
   * GET /api/purchases/stats
   */
  async getUserPurchaseStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.getUserPurchaseStats(userId);
      
      ResponseUtil.success(res, result, 'User purchase statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify course access for user
   * GET /api/purchases/verify-access/:courseId
   */
  async verifyCourseAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await purchaseService.verifyCourseAccess(userId, courseId);
      
      ResponseUtil.success(res, result, 'Course access verified successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create bundle purchase
   * POST /api/purchases/bundle
   */
  async createBundlePurchase(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { bundleId, paymentRef, amount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      if (!bundleId || !paymentRef || !amount) {
        return ResponseUtil.fail(res, 'bundleId, paymentRef, and amount are required');
      }
      
      const result = await purchaseService.createBundlePurchase(userId, bundleId, paymentRef, amount);
      
      ResponseUtil.created(res, result, 'Bundle purchase created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Enroll in a free course (price = 0)
   * POST /api/purchases/enroll-free
   */
  async enrollInFreeCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { courseId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      if (!courseId) {
        return ResponseUtil.fail(res, 'courseId is required');
      }
      
      const result = await purchaseService.enrollInFreeCourse(userId, courseId);
      
      ResponseUtil.created(res, result, 'Successfully enrolled in free course');
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const purchaseController = new PurchaseController();
