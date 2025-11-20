import nodemailer from 'nodemailer';

interface SendEmailOptions {
  email: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async (options: SendEmailOptions) => {
  // Configuration for Render.com compatibility
  // Try port 465 with SSL first (more reliable on Render)
  const port = parseInt(process.env.EMAIL_SERVER_PORT || '465');
  const isSecure = port === 465;

  // 1) Create a transporter with Render-compatible settings
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
    port: port,
    secure: isSecure, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
    // Longer timeout for Render's network
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // TLS configuration for better compatibility
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3',
      minVersion: 'TLSv1',
    },
    // Debug logging in development
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development',
  });

  // 2) Verify connection before sending (helps catch issues early)
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified');
  } catch (verifyError) {
    console.error('❌ SMTP verification failed:', verifyError);
    throw new Error(`Email service unavailable: ${verifyError instanceof Error ? verifyError.message : 'Unknown error'}`);
  }

  // 3) Define the email options
  const mailOptions = {
    from: process.env.EMAIL_FROM || `"Skillyug" <${process.env.EMAIL_SERVER_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.text,
    html: options.html, // For HTML emails
  };

  // 4) Actually send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return info;
  } catch (sendError) {
    console.error('❌ Email send failed:', sendError);
    throw new Error(`Failed to send email: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`);
  }
};
