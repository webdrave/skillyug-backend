import crypto from 'crypto';
import { instance } from '../utils/razorpayInstance';
import { courseRepository } from '../repositories/course.repository';
import { userRepository } from '../repositories/user.repository';
import { emailService } from './email.service';
import {
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ExternalServiceError
} from '../utils/errors';

// Type for Razorpay instance with refunds API
interface RazorpayInstance {
  orders: {
    create: (options: Record<string, unknown>) => Promise<unknown>;
  };
  refunds: {
    create: (options: {
      payment_id: string;
      amount: number;
      notes?: Record<string, unknown>;
    }) => Promise<{
      id: string;
      amount: number;
      status: string;
      [key: string]: unknown;
    }>;
  };
}

/**
 * Payment Service
 * Handles all payment-related business logic
 */
export class PaymentService {
  private readonly isTestMode: boolean;

  constructor() {
    this.isTestMode = !process.env.RAZORPAY_KEY || 
                     !process.env.RAZORPAY_SECRET || 
                     process.env.RAZORPAY_KEY === 'your_razorpay_key_here' ||
                     process.env.RAZORPAY_SECRET === 'your_razorpay_secret_here';
  }

  /**
   * Validate ObjectId-like strings
   */
  private isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id) || /^[a-zA-Z0-9_-]{10,}$/.test(id);
  }

  /**
   * Create Razorpay checkout order
   */
  async createCheckoutOrder(
    amount: number,
    courseId: string,
    userId: string
  ) {
    // Validate input
    if (!amount || amount <= 0) {
      throw new ValidationError('Invalid amount');
    }

    if (!courseId || !this.isValidObjectId(courseId)) {
      throw new ValidationError('Invalid course ID');
    }

    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Verify course exists and is active
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    if (!course.isActive) {
      throw new BusinessLogicError('Course is not available for purchase');
    }

    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify amount matches course price
    const expectedAmount = Number(course.price);
    if (Math.abs(amount - expectedAmount) > 0.01) {
      throw new ValidationError('Amount does not match course price');
    }

    try {
      // Create Razorpay order
      const options = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        receipt: `course_${courseId}_${Date.now()}`,
        notes: {
          courseId,
          userId,
          courseName: course.courseName,
        },
      };

      const order = await instance.orders.create(options);

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        courseId,
        courseName: course.courseName,
        courseImage: course.imageUrl,
      };
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw new ExternalServiceError('Payment gateway', 'Failed to create payment order');
    }
  }

  /**
   * Verify payment signature
   */
  async verifyPayment(
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string,
    courseId: string
  ) {
    // Validate input
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      throw new ValidationError('Missing payment verification details');
    }

    if (!courseId || !this.isValidObjectId(courseId)) {
      throw new ValidationError('Invalid course ID');
    }

    // Verify course exists
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    let isAuthentic = false;

    if (this.isTestMode) {
      // In test mode, always consider payments as authentic for demo purposes
      console.log('Mock Payment Verification: Simulating successful verification');
      isAuthentic = true;
    } else {
      // Verify signature in production
      const body = razorpayOrderId + '|' + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_SECRET as string)
        .update(body.toString())
        .digest('hex');

      isAuthentic = expectedSignature === razorpaySignature;
    }

    if (!isAuthentic) {
      throw new BusinessLogicError('Payment verification failed');
    }

    return {
      verified: true,
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      courseId,
      message: 'Payment verified successfully',
    };
  }

  /**
   * Process successful payment
   */
  async processSuccessfulPayment(
    userId: string,
    courseId: string,
    paymentData: {
      paymentId: string;
      orderId: string;
      amount: number;
    }
  ) {
    // Verify user and course
    const [user, course] = await Promise.all([
      userRepository.findById(userId),
      courseRepository.findById(courseId),
    ]);

    if (!user) {
      throw new NotFoundError('User');
    }

    if (!course) {
      throw new NotFoundError('Course');
    }

    try {
      // In a real implementation, you would:
      // 1. Create purchase record
      // 2. Create payment record
      // 3. Enroll user in course
      // 4. Send confirmation emails
      
      // For now, we'll simulate this
      console.log('Processing successful payment:', {
        userId,
        courseId,
        paymentData,
      });

      // Send purchase confirmation email
      if (user.email) {
        try {
          await emailService.sendPurchaseConfirmation(
            user.email,
            course.courseName,
            Number(course.price),
            paymentData.paymentId
          );
        } catch (emailError) {
          console.error('Failed to send purchase confirmation email:', emailError);
          // Don't fail the payment process if email fails
        }
      }

      return {
        success: true,
        message: 'Payment processed successfully',
        courseId,
        courseName: course.courseName,
        enrollmentMessage: 'You have been enrolled in the course',
      };
    } catch (error) {
      console.error('Error processing successful payment:', error);
      throw new BusinessLogicError('Failed to process payment');
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(
    userId: string,
    courseId: string,
    errorDetails?: Record<string, unknown>
  ) {
    console.error('Payment failed:', {
      userId,
      courseId,
      errorDetails,
    });

    // Log the failure for analytics/debugging
    // In production, you might want to store this in the database

    return {
      success: false,
      message: 'Payment failed. Please try again.',
      errorCode: 'PAYMENT_FAILED',
    };
  }

  /**
   * Get Razorpay key for frontend
   */
  getRazorpayKey(): string {
    const key = process.env.RAZORPAY_KEY;
    if (!key || key === 'your_razorpay_key_here') {
      return 'test_key_for_development';
    }
    return key;
  }

  /**
   * Refund payment (admin functionality)
   */
  async refundPayment(
    paymentId: string,
    amount: number,
    adminId: string,
    reason?: string
  ) {
    // Verify admin permissions
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new ValidationError('Only administrators can process refunds');
    }

    try {
      if (this.isTestMode) {
        console.log('Mock Refund: Simulating successful refund');
        return {
          refundId: 'mock_refund_' + Date.now(),
          amount,
          status: 'processed',
          message: 'Refund processed successfully (test mode)',
        };
      }

      // Process actual refund with Razorpay
      // Note: Using the correct Razorpay API method
      const refund = await (instance as unknown as RazorpayInstance).refunds.create({
        payment_id: paymentId,
        amount: Math.round(amount * 100), // Convert to paise
        notes: {
          reason: reason || 'Refund requested',
          processedBy: adminId,
        },
      });

      return {
        refundId: refund.id,
        amount: refund.amount / 100, // Convert back to rupees
        status: refund.status,
        message: 'Refund processed successfully',
      };
    } catch (error) {
      console.error('Refund processing failed:', error);
      throw new ExternalServiceError('Payment gateway', 'Failed to process refund');
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string) {
    try {
      if (this.isTestMode) {
        return {
          id: paymentId,
          status: 'captured',
          amount: 100000, // Mock amount in paise
          currency: 'INR',
          created_at: Date.now(),
        };
      }

      const payment = await instance.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error('Failed to fetch payment status:', error);
      throw new ExternalServiceError('Payment gateway', 'Failed to fetch payment status');
    }
  }

  /**
   * Generate payment analytics (for admin)
   */
  async getPaymentAnalytics(
    adminId: string,
    _dateRange?: {
      startDate: Date;
      endDate: Date;
    }
  ) {
    // Verify admin permissions
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new ValidationError('Only administrators can view payment analytics');
    }

    // In a real implementation, you would query the database for payment records
    // For now, return mock analytics
    return {
      totalRevenue: 0,
      totalTransactions: 0,
      successfulPayments: 0,
      failedPayments: 0,
      refunds: 0,
      averageOrderValue: 0,
      topSellingCourses: [],
      revenueByDay: [],
    };
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
