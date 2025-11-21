import { sendEmail } from '../utils/email';
import { ExternalServiceError } from '../utils/errors';

/**
 * Email Service
 * Handles all email-related operations with proper templating
 */
export class EmailService {
  private readonly frontendUrl: string;

  constructor() {
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Send OTP verification email
   */
  async sendOtpEmail(email: string, otp: string): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'Your Skillyug Verification Code',
        text: `Your Skillyug verification code is: ${otp}\n\nThis code will expire in 10 minutes.`,
        html: this.getOtpEmailTemplate(otp),
      });
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      throw new ExternalServiceError('Email service', 'Failed to send verification email');
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'Reset Your Skillyug Password',
        text: `To reset your password, click the following link: ${resetUrl}\n\nThis link will expire in 10 minutes.`,
        html: this.getPasswordResetEmailTemplate(resetUrl),
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new ExternalServiceError('Email service', 'Failed to send password reset email');
    }
  }

  /**
   * Send password change confirmation email
   */
  async sendPasswordChangeConfirmation(email: string): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'Password Updated - Skillyug',
        text: 'Your password has been successfully updated. If you did not make this change, please contact support immediately.',
        html: this.getPasswordChangeConfirmationTemplate(),
      });
    } catch (error) {
      console.error('Failed to send password change confirmation:', error);
      throw new ExternalServiceError('Email service', 'Failed to send confirmation email');
    }
  }

  /**
   * Send welcome email after successful registration
   */
  async sendWelcomeEmail(email: string, fullName: string): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'Welcome to Skillyug!',
        text: `Welcome to Skillyug, ${fullName}! We're excited to have you on board.`,
        html: this.getWelcomeEmailTemplate(fullName),
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't throw error for welcome email as it's not critical
    }
  }

  /**
   * Send purchase confirmation email
   */
  async sendPurchaseConfirmation(
    email: string,
    courseName: string,
    amount: number,
    paymentRef: string
  ): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'Course Purchase Confirmation - Skillyug',
        text: `Thank you for purchasing ${courseName}. Your payment reference is: ${paymentRef}`,
        html: this.getPurchaseConfirmationTemplate(courseName, amount, paymentRef),
      });
    } catch (error) {
      console.error('Failed to send purchase confirmation email:', error);
      // Don't throw error for confirmation email as purchase is already complete
    }
  }

  /**
   * Send mentor invitation email
   */
  async sendMentorInvitationEmail(
    email: string,
    inviteLink: string,
    invitedBy: string
  ): Promise<void> {
    try {
      await sendEmail({
        email,
        subject: 'You\'re Invited to Join Skillyug as a Mentor!',
        text: `${invitedBy} has invited you to join Skillyug as a mentor. Click this link to complete your profile: ${inviteLink}\n\nThis invitation will expire in 48 hours.`,
        html: this.getMentorInvitationTemplate(inviteLink, invitedBy),
      });
    } catch (error) {
      console.error('Failed to send mentor invitation email:', error);
      throw new ExternalServiceError('Email service', 'Failed to send mentor invitation email');
    }
  }

  /**
   * OTP email template
   */
  private getOtpEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 8px; color: #2563eb; text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border: 2px dashed #2563eb; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; text-align: center; }
          .warning { color: #ef4444; margin-top: 20px; font-size: 14px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>Email Verification</h2>
          </div>
          
          <div class="message">
            <p>Thank you for joining Skillyug! Please use the verification code below to complete your registration:</p>
          </div>
          
          <div class="otp-code">${otp}</div>
          
          <div class="message">
            <p>Enter this code in the verification page to activate your account.</p>
            <p class="warning">This code will expire in 10 minutes.</p>
          </div>
          
          <div class="footer">
            <p>If you didn't create an account with Skillyug, please ignore this email.</p>
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Password reset email template
   */
  private getPasswordResetEmailTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; text-align: center; }
          .button { display: inline-block; padding: 15px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .button:hover { background-color: #1d4ed8; }
          .warning { color: #ef4444; margin-top: 20px; font-size: 14px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>Reset Your Password</h2>
          </div>
          
          <div class="message">
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
            
            <p class="warning">This link will expire in 10 minutes.</p>
          </div>
          
          <div class="footer">
            <p>If you didn't request a password reset, please ignore this email.</p>
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Password change confirmation template
   */
  private getPasswordChangeConfirmationTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Updated</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; text-align: center; }
          .success { color: #059669; font-weight: bold; }
          .warning { color: #ef4444; margin-top: 20px; font-size: 14px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>Password Updated</h2>
          </div>
          
          <div class="message">
            <p class="success">Your password has been successfully updated!</p>
            <p>Your account is now secured with your new password.</p>
            <p class="warning">If you did not make this change, please contact our support team immediately.</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Welcome email template
   */
  private getWelcomeEmailTemplate(fullName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Skillyug</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; }
          .button { display: inline-block; padding: 15px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>Welcome to Skillyug!</h2>
          </div>
          
          <div class="message">
            <p>Hello ${fullName},</p>
            <p>Welcome to Skillyug! We're thrilled to have you join our learning community.</p>
            <p>You can now explore our courses and start your learning journey:</p>
            
            <div style="text-align: center;">
              <a href="${this.frontendUrl}/courses" class="button">Explore Courses</a>
            </div>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Happy learning!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Purchase confirmation template
   */
  private getPurchaseConfirmationTemplate(
    courseName: string,
    amount: number,
    paymentRef: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Purchase Confirmation</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; }
          .course-details { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; padding: 15px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>Purchase Confirmed!</h2>
          </div>
          
          <div class="message">
            <p>Thank you for your purchase! Your course is now available in your dashboard.</p>
            
            <div class="course-details">
              <h3>Course Details:</h3>
              <p><strong>Course:</strong> ${courseName}</p>
              <p><strong>Amount:</strong> ₹${amount}</p>
              <p><strong>Payment Reference:</strong> ${paymentRef}</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${this.frontendUrl}/dashboard" class="button">Access Course</a>
            </div>
            
            <p>Happy learning!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Mentor invitation email template
   */
  private getMentorInvitationTemplate(inviteLink: string, invitedBy: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mentor Invitation</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .message { font-size: 16px; line-height: 1.6; color: #374151; text-align: center; }
          .invitation-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px; margin: 30px 0; color: white; }
          .invitation-box h3 { margin-top: 0; font-size: 24px; }
          .button { display: inline-block; padding: 15px 30px; background-color: white; color: #2563eb; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .button:hover { background-color: #f8fafc; }
          .warning { color: #ef4444; margin-top: 20px; font-size: 14px; }
          .features { text-align: left; margin: 20px 0; }
          .features li { margin: 10px 0; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skillyug</div>
            <h2>🎉 You're Invited!</h2>
          </div>
          
          <div class="message">
            <p><strong>${invitedBy}</strong> has invited you to join Skillyug as a mentor!</p>
          </div>

          <div class="invitation-box">
            <h3>Share Your Knowledge</h3>
            <p>Join our growing community of expert mentors and help shape the future of online learning.</p>
          </div>
          
          <div class="message">
            <p>As a Skillyug mentor, you'll be able to:</p>
            <ul class="features">
              <li>Create and publish courses in your area of expertise</li>
              <li>Engage with motivated learners from around the world</li>
              <li>Build your personal brand and professional network</li>
              <li>Earn from your course sales</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="${inviteLink}" class="button">Complete Your Profile</a>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb; font-size: 14px;">${inviteLink}</p>
            
            <p class="warning">This invitation will expire in 48 hours.</p>
          </div>
          
          <div class="footer">
            <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
            <p>&copy; 2024 Skillyug. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Export singleton instance
export const emailService = new EmailService();
