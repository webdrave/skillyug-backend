import { purchaseRepository } from '../repositories/purchase.repository';
import { courseRepository } from '../repositories/course.repository';
import { userRepository } from '../repositories/user.repository';
import { emailService } from './email.service';
import {
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  DuplicateError
} from '../utils/errors';
import { createPaginationMeta } from '../utils/response';

/**
 * Purchase Service
 * Handles all purchase-related business logic
 */
export class PurchaseService {

  /**
   * Save a course purchase
   */
  async savePurchase(
    userId: string,
    courseId: string,
    paymentRef: string,
    amount?: number
  ) {
    // Validate inputs
    if (!userId || !courseId || !paymentRef) {
      throw new ValidationError('Missing required fields: userId, courseId, paymentRef');
    }

    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify course exists
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    // Check if user already purchased this course
    const alreadyPurchased = await purchaseRepository.hasUserPurchasedCourse(userId, courseId);
    if (alreadyPurchased) {
      throw new DuplicateError('Course purchase');
    }

    // Use course price if amount not provided
    const purchasePrice = amount || Number(course.price);

    try {
      // Create purchase
      const purchase = await purchaseRepository.createPurchase(
        userId,
        [
          {
            courseId,
            purchasePrice,
          }
        ],
        purchasePrice
      );

      // Update purchase status to completed (since payment is already verified)
      await purchaseRepository.updateStatus(purchase.id, 'COMPLETED');

      // Send purchase confirmation email
      if (user.email) {
        try {
          await emailService.sendPurchaseConfirmation(
            user.email,
            course.courseName,
            purchasePrice,
            paymentRef
          );
        } catch (emailError) {
          console.error('Failed to send purchase confirmation:', emailError);
          // Don't fail the purchase if email fails
        }
      }

      return {
        purchase,
        message: 'Purchase saved successfully'
      };
    } catch (error) {
      console.error('Failed to save purchase:', error);
      throw new BusinessLogicError('Failed to save purchase');
    }
  }

  /**
   * Check if user has purchased a course
   */
  async checkPurchaseStatus(userId: string, courseId: string) {
    if (!userId || !courseId) {
      throw new ValidationError('User ID and Course ID are required');
    }

    const purchased = await purchaseRepository.hasUserPurchasedCourse(userId, courseId);
    
    return {
      purchased,
      message: purchased ? 'Course is purchased' : 'Course not purchased'
    };
  }

  /**
   * Get all purchases for a user
   */
  async getUserPurchases(
    userId: string,
    page: number = 1,
    limit: number = 10
  ) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (page < 1 || limit < 1 || limit > 50) {
      throw new ValidationError('Invalid pagination parameters');
    }

    const { purchases, total } = await purchaseRepository.findByUserId(userId, page, limit);

    if (!purchases || purchases.length === 0) {
      return {
        purchases: [],
        pagination: createPaginationMeta(page, limit, 0),
        message: 'No purchases found'
      };
    }

    // Transform purchases for easier frontend consumption
    const transformedPurchases = purchases.map(purchase => ({
      id: purchase.id,
      totalAmount: purchase.totalAmount,
      status: purchase.status,
      purchasedAt: purchase.purchasedAt,
      items: purchase.items.map(item => ({
        id: item.id,
        purchasePrice: item.purchasePrice,
        course: item.course ? {
          id: item.course.id,
          name: item.course.courseName,
          imageUrl: item.course.imageUrl,
          category: item.course.category,
          difficulty: item.course.difficulty,
        } : null,
        bundle: item.bundle ? {
          id: item.bundle.id,
          name: item.bundle.name,
          imageUrl: item.bundle.imageUrl,
        } : null,
      })),
      payments: purchase.payments || [],
    }));

    const pagination = createPaginationMeta(page, limit, total);

    return {
      purchases: transformedPurchases,
      pagination,
      message: 'Purchases retrieved successfully'
    };
  }

  /**
   * Get purchase details by ID
   */
  async getPurchaseById(purchaseId: string, userId: string) {
    if (!purchaseId || !userId) {
      throw new ValidationError('Purchase ID and User ID are required');
    }

    const purchase = await purchaseRepository.findById(purchaseId);
    if (!purchase) {
      throw new NotFoundError('Purchase');
    }

    // Verify user owns this purchase
    if (purchase.userId !== userId) {
      throw new BusinessLogicError('You can only view your own purchases');
    }

    return {
      purchase,
      message: 'Purchase details retrieved successfully'
    };
  }

  /**
   * Get user's purchased courses (simplified view)
   */
  async getPurchasedCourses(userId: string) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const { purchases } = await purchaseRepository.findByUserId(userId, 1, 100);

    // Extract all purchased courses
    const purchasedCourses = purchases
      .filter(purchase => purchase.status === 'COMPLETED')
      .flatMap(purchase => 
        purchase.items
          .filter(item => item.course)
          .map(item => ({
            ...item.course,
            purchasePrice: item.purchasePrice,
            purchasedAt: purchase.purchasedAt,
          }))
      );

    return {
      courses: purchasedCourses,
      totalCourses: purchasedCourses.length,
      message: 'Purchased courses retrieved successfully'
    };
  }

  /**
   * Cancel/Refund a purchase (admin functionality)
   */
  async cancelPurchase(
    purchaseId: string,
    adminId: string,
    reason?: string
  ) {
    // Verify admin permissions
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new BusinessLogicError('Only administrators can cancel purchases');
    }

    const purchase = await purchaseRepository.findById(purchaseId);
    if (!purchase) {
      throw new NotFoundError('Purchase');
    }

    if (purchase.status === 'REFUNDED') {
      throw new BusinessLogicError('Purchase is already refunded');
    }

    // Update purchase status
    await purchaseRepository.updateStatus(purchaseId, 'REFUNDED');

    // In a real implementation, you would also:
    // 1. Process refund with payment gateway
    // 2. Remove user's access to the course
    // 3. Send refund confirmation email

    return {
      message: 'Purchase cancelled and refund initiated',
      purchaseId,
      reason
    };
  }

  /**
   * Get purchase analytics (admin functionality)
   */
  async getPurchaseAnalytics(
    adminId: string,
    dateRange?: {
      startDate: Date;
      endDate: Date;
    }
  ) {
    // Verify admin permissions
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new BusinessLogicError('Only administrators can view purchase analytics');
    }

    const [stats, popularCourses, revenueData] = await Promise.all([
      purchaseRepository.getPurchaseStats(undefined, dateRange),
      purchaseRepository.getPopularCourses(10),
      dateRange ? purchaseRepository.getRevenueByPeriod('day', dateRange) : []
    ]);

    return {
      totalPurchases: stats.totalPurchases,
      totalRevenue: stats.totalRevenue,
      averageOrderValue: stats.averageOrderValue,
      popularCourses,
      revenueByDay: revenueData,
      message: 'Purchase analytics retrieved successfully'
    };
  }

  /**
   * Get user purchase statistics
   */
  async getUserPurchaseStats(userId: string) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const stats = await purchaseRepository.getPurchaseStats(userId);

    return {
      totalPurchases: stats.totalPurchases,
      totalSpent: stats.totalRevenue,
      averageSpending: stats.averageOrderValue,
      message: 'User purchase statistics retrieved successfully'
    };
  }

  /**
   * Verify course access for a user
   */
  async verifyCourseAccess(userId: string, courseId: string) {
    if (!userId || !courseId) {
      throw new ValidationError('User ID and Course ID are required');
    }

    const hasAccess = await purchaseRepository.hasUserPurchasedCourse(userId, courseId);

    return {
      hasAccess,
      message: hasAccess ? 'User has access to this course' : 'User does not have access to this course'
    };
  }

  /**
   * Create bundle purchase
   */
  async createBundlePurchase(
    _userId: string,
    _bundleId: string,
    _paymentRef: string,
    _amount: number
  ) {
    // This is a placeholder for bundle purchase functionality
    // In a real implementation, you would:
    // 1. Verify bundle exists
    // 2. Check bundle price
    // 3. Create purchase with bundle item
    // 4. Grant access to all courses in bundle

    throw new BusinessLogicError('Bundle purchases not yet implemented');
  }
}

// Export singleton instance
export const purchaseService = new PurchaseService();
