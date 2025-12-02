import { z } from 'zod';
import { UserType } from '@prisma/client';

/**
 * Centralized validation schemas for the application
 * Following Zod best practices for type-safe validation
 */

// Common validation patterns
const emailSchema = z.string()
  .email('Invalid email format')
  .min(1, 'Email is required')
  .max(255, 'Email must be less than 255 characters');

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const userTypeSchema = z.nativeEnum(UserType, {
  errorMap: () => ({ message: 'User type must be either STUDENT or MENTOR' })
});

// Auth schemas
export const registerSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Full name can only contain letters and spaces'),
  email: emailSchema,
  password: passwordSchema,
  userType: userTypeSchema,
}); // Removed .strict() to allow extra fields from frontend

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  userType: userTypeSchema.optional(),
}).strict();

// Enhanced login schema for email-based authentication (no phone support)
export const emailLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
}).strict();

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
}).strict();

export const resendOtpSchema = z.object({
  email: emailSchema,
}).strict();

export const forgotPasswordSchema = z.object({
  email: emailSchema,
}).strict();

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ["newPassword"],
});

// Course schemas
export const createCourseSchema = z.object({
  courseName: z.string()
    .min(3, 'Course name must be at least 3 characters')
    .max(200, 'Course name must be less than 200 characters'),
  token: z.coerce.number()
    .min(0, 'Token cannot be negative')
    .max(999999, 'Token is too high')
    .default(0),
  price: z.coerce.number()
    .min(0, 'Price cannot be negative')
    .max(999999, 'Price is too high'),
  instructor: z.string()
    .min(2, 'Instructor name must be at least 2 characters')
    .max(100, 'Instructor name must be less than 100 characters'),
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters')
    .optional(),
  imageUrl: z.string()
    .url('Invalid image URL')
    .max(500, 'Image URL must be less than 500 characters'),
  category: z.enum([
    'PROGRAMMING',
    'WEB_DEVELOPMENT',
    'MOBILE_DEVELOPMENT',
    'DATA_SCIENCE',
    'ARTIFICIAL_INTELLIGENCE',
    'CLOUD_COMPUTING',
    'CYBERSECURITY',
    'DESIGN',
    'BUSINESS',
    'MARKETING',
    'OTHER'
  ]),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'])
    .default('BEGINNER'),
  durationHours: z.coerce.number()
    .min(1, 'Duration must be at least 1 hour')
    .max(1000, 'Duration is too long')
    .optional(),
  language: z.string()
    .min(2, 'Language must be at least 2 characters')
    .max(50, 'Language must be less than 50 characters')
    .default('English'),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  learningPathId: z.string()
    .max(100, 'Learning path ID must be less than 100 characters')
    .optional(),
}).strict();

// Update schema - allows partial updates and strips unknown fields
export const updateCourseSchema = createCourseSchema.partial().extend({
  mentorId: z.string()
    .min(1, 'Mentor ID is required')
    .max(100, 'Mentor ID is too long')
    .optional(),
}).strip();

export const courseIdSchema = z.object({
  id: z.string()
    .min(1, 'Course ID is required')
    .max(50, 'Course ID is too long'),
});

// Payment schemas
export const checkoutSchema = z.object({
  amount: z.number()
    .min(1, 'Amount must be greater than 0')
    .max(999999, 'Amount is too high'),
  courseId: z.string()
    .min(1, 'Course ID is required')
    .max(50, 'Course ID is too long'),
}).strict();

export const paymentVerificationSchema = z.object({
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
}).strict();

// Purchase schemas
export const savePurchaseSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  paymentRef: z.string().min(1, 'Payment reference is required'),
}).strict();

export const purchaseStatusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
});

// Common schemas
export const paginationSchema = z.object({
  page: z.number()
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.number()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(10),
});

export const userIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

// Type exports for TypeScript
// Mentor invitation schemas
export const inviteMentorSchema = z.object({
  email: emailSchema,
}).strict();

export const verifyInviteSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const mentorSetupSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
  password: passwordSchema,
  expertise: z.array(z.string()).min(1, 'At least one area of expertise is required'),
  experience: z.number().int().min(0).max(50).optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  twitter: z.string().url('Invalid Twitter URL').optional().or(z.literal('')),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  tagline: z.string().max(200, 'Tagline must be less than 200 characters').optional(),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  image: z.string().url('Invalid image URL').optional().or(z.literal('')),
}).strict();

export const updateMentorProfileSchema = z.object({
  expertise: z.array(z.string()).optional(),
  experience: z.number().int().min(0).max(50).optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  twitter: z.string().url('Invalid Twitter URL').optional().or(z.literal('')),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  tagline: z.string().max(200, 'Tagline must be less than 200 characters').optional(),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
}).strict();

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PaymentVerificationInput = z.infer<typeof paymentVerificationSchema>;
export type SavePurchaseInput = z.infer<typeof savePurchaseSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type InviteMentorInput = z.infer<typeof inviteMentorSchema>;
export type VerifyInviteInput = z.infer<typeof verifyInviteSchema>;
export type MentorSetupInput = z.infer<typeof mentorSetupSchema>;
export type UpdateMentorProfileInput = z.infer<typeof updateMentorProfileSchema>;
