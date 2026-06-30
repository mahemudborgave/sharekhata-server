const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS  // Gmail App Password (not your login password)
    }
  });
};

const sendOTPEmail = async (toEmail, otp, purpose = 'registration') => {
  const transporter = createTransporter();

  const subject = purpose === 'forgot-password'
    ? 'ShareKhata - Reset Your Password'
    : 'ShareKhata - Verify Your Email';

  const action = purpose === 'forgot-password'
    ? 'reset your password'
    : 'complete your registration';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1d4ed8; font-size: 24px; margin: 0;">ShareKhata</h1>
        <p style="color: #6b7280; margin: 4px 0 0;">Split expenses with friends easily</p>
      </div>

      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="color: #374151; margin: 0 0 16px;">Use the OTP below to ${action}:</p>

        <div style="background: #eff6ff; border: 2px dashed #93c5fd; border-radius: 8px; padding: 20px; text-align: center; margin: 16px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1d4ed8;">${otp}</span>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin: 16px 0 0;">
          This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
      </div>

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"ShareKhata" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  });
};

module.exports = { sendOTPEmail };
