import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { emailService } from './email.service';
import { AuthenticationError, BusinessLogicError, ValidationError, NotFoundError, DuplicateError } from '../utils/errors';
import { UserType } from '@prisma/client';
import { UserJwtPayload } from '../types/user';

// Authentication Service - Business logic for auth operations
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || '';
  private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '90d';
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly RESET_TOKEN_EXPIRY_MINUTES = 10;

  constructor() {
    if (!this.JWT_SECRET) throw new Error('JWT_SECRET is required');
  }

  // Generate 6-digit OTP
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hash password
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // Compare password
  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate JWT token
  private generateToken(payload: UserJwtPayload): string {
    return jwt.sign(payload, this.JWT_SECRET, { expiresIn: this.JWT_EXPIRES_IN } as jwt.SignOptions);
  }

  // Verify JWT token
  verifyJwtToken(token: string): UserJwtPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET);
      if (typeof decoded === 'string') throw new AuthenticationError('Invalid token');
      return decoded as UserJwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new AuthenticationError('Token expired');
      if (error instanceof jwt.JsonWebTokenError) throw new AuthenticationError('Invalid token');
      throw error;
    }
  }

  // Register new user
  async register(userData: { fullName: string; email: string; password: string; userType: UserType }) {
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) throw new DuplicateError('User', 'email');

    // Generate OTP and hash password in parallel
    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
    
    const [hashedPassword, hashedOtp] = await Promise.all([
      this.hashPassword(userData.password),
      bcrypt.hash(otp, 10),
    ]);

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 OTP for ${userData.email}: ${otp}`);
    }

    const user = await userRepository.create({
      ...userData,
      password: hashedPassword,
      otp: hashedOtp,
      otpExpires,
      isVerified: false,
    });

    // Send email asynchronously (non-blocking on error)
    emailService.sendOtpEmail(userData.email, otp)
      .catch(error => {
        console.error('Email send failed:', error);
        // Don't throw - user is created, they can resend OTP
      });

    return { user, message: 'Registration successful. Check your email.' };
  }

  // Verify OTP
  async verifyOtp(email: string, otp: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new NotFoundError('User');
    if (user.isVerified) return { message: 'Email already verified' };

    if (!user.otp || !user.otpExpires || new Date() > user.otpExpires) {
      throw new BusinessLogicError('OTP invalid or expired');
    }

    const isValid = await bcrypt.compare(otp, user.otp);
    if (!isValid) throw new ValidationError('Incorrect OTP');

    await userRepository.verifyEmail(email);
    
    // Auto-create MentorProfile for MENTOR users
    if (user.userType === UserType.MENTOR) {
      // Dynamic import to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MentorRepository } = require('../repositories/mentor.repository');
      const mentorRepo = new MentorRepository();
      const existingProfile = await mentorRepo.getMentorProfileByUserId(user.id);
      if (!existingProfile) {
        await mentorRepo.createMentorProfile({
          user: { connect: { id: user.id } },
          expertise: [],
          experience: 0,
        });
      }
    }
    
    return { message: 'Email verified successfully' };
  }

  // Resend OTP
  async resendOtp(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new NotFoundError('User');
    if (user.isVerified) return { message: 'Email already verified' };

    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 OTP for ${email}: ${otp}`);
    }

    // Hash OTP and update DB in parallel with email sending
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    await Promise.all([
      userRepository.setOtp(email, hashedOtp, otpExpires),
      emailService.sendOtpEmail(email, otp).catch(error => {
        console.error('Email send failed:', error);
        throw new BusinessLogicError('Failed to send verification email');
      }),
    ]);

    return { message: 'New OTP sent' };
  }

  // Login user
  async login(email: string, password: string) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user || !user.password) throw new AuthenticationError('Invalid credentials');
    if (!user.isVerified) throw new AuthenticationError('Please verify your email first');

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid credentials');

    const payload: UserJwtPayload = {
      id: user.id,
      email: user.email || '',
      userType: user.userType
    };

    const token = this.generateToken(payload);
    const { password: _, otp, passwordResetToken, passwordResetExpires, ...safeUser } = user;

    return { token, user: safeUser, message: 'Login successful' };
  }

  // Check login credentials - handles verified and unverified users
  async checkLoginCredentials(email: string, password: string) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user || !user.password) throw new AuthenticationError('Invalid credentials');

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid credentials');

    // User is verified - proceed with login
    if (user.isVerified) {
      const payload: UserJwtPayload = {
        id: user.id,
        email: user.email || '',
        userType: user.userType
      };

      const token = this.generateToken(payload);
      const { password: _, otp, passwordResetToken, passwordResetExpires, ...safeUser } = user;

      return { verified: true, token, user: safeUser, message: 'Login successful' };
    }

    // User not verified - generate and send OTP
    const newOtp = this.generateOtp();
    const otpExpires = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 OTP for ${email}: ${newOtp}`);
    }

    const hashedOtp = await bcrypt.hash(newOtp, 10);
    
    // Update DB and send email in parallel
    await Promise.all([
      userRepository.setOtp(email, hashedOtp, otpExpires),
      emailService.sendOtpEmail(email, newOtp).catch(error => {
        console.error('Email send failed:', error);
        throw new BusinessLogicError('Failed to send verification email');
      }),
    ]);

    return {
      needsVerification: true,
      email: user.email,
      message: 'Account not verified. Verification code sent to email.',
      expiresIn: this.OTP_EXPIRY_MINUTES * 60
    };
  }

  // Forgot password
  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Return same message to prevent email enumeration
      return { message: 'If account exists, reset link has been sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpires = new Date(Date.now() + this.RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Update DB and send email in parallel
    await Promise.all([
      userRepository.setPasswordResetToken(email, hashedToken, resetTokenExpires),
      emailService.sendPasswordResetEmail(email, resetUrl).catch(error => {
        console.error('Email send failed:', error);
        throw new BusinessLogicError('Failed to send reset email');
      }),
    ]);

    return { message: 'Password reset link sent.' };
  }

  // Reset password
  async resetPassword(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) throw new ValidationError('Passwords do not match');

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await userRepository.findByPasswordResetToken(hashedToken);
    if (!user) throw new BusinessLogicError('Reset token invalid or expired');

    const hashedPassword = await this.hashPassword(password);
    await userRepository.updatePassword(user.id, hashedPassword);

    return { message: 'Password reset successfully' };
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const userWithPassword = await userRepository.findByEmailWithPassword(user.email!);
    if (!userWithPassword?.password) throw new NotFoundError('User');

    const isCurrentValid = await this.comparePassword(currentPassword, userWithPassword.password);
    if (!isCurrentValid) throw new AuthenticationError('Current password incorrect');

    const hashedPassword = await this.hashPassword(newPassword);
    await userRepository.updatePassword(userId, hashedPassword);

    // Send confirmation email asynchronously (non-blocking)
    emailService.sendPasswordChangeConfirmation(user.email!)
      .catch(error => console.error('Email send failed:', error));

    return { message: 'Password updated successfully' };
  }

  // Get current user
  async getCurrentUser(userId: string) {
    const user = await userRepository.getProfile(userId);
    if (!user) throw new NotFoundError('User');
    return user;
  }

  // Refresh token (placeholder)
  async refreshToken(_refreshToken: string) {
    throw new BusinessLogicError('Refresh token not implemented');
  }

  // Logout (placeholder)
  async logout(_token: string) {
    return { message: 'Logged out' };
  }
}

export const authService = new AuthService();
