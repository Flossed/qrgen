const nodemailer = require('nodemailer');
const { getLogger } = require('../config/logger');

const logger = getLogger('EmailService');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    /**
     * Initialize email transporter based on environment configuration
     */
    async initializeTransporter() {
        try {
            // Check if SMTP configuration is provided
            if (!process.env.SMTP_HOST && !process.env.GMAIL_USER) {
                logger.debug('No SMTP configuration found. Email functionality will be disabled.');
                logger.debug('Please set one of the following:');
                logger.debug('  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (for custom SMTP)');
                logger.debug('  - GMAIL_USER, GMAIL_PASS (for Gmail)');
                this.transporter = null;
                return;
            }

            const emailConfig = {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };

            // Use Gmail if configured
            if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
                logger.debug('Initializing Gmail SMTP service');
                emailConfig.service = 'gmail';
                emailConfig.auth = {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASS
                };
                delete emailConfig.host;
                delete emailConfig.port;
                delete emailConfig.secure;
            } else {
                logger.debug('Initializing custom SMTP service', {
                    host: emailConfig.host,
                    port: emailConfig.port,
                    secure: emailConfig.secure
                });
            }

            this.transporter = nodemailer.createTransport(emailConfig);

            // Verify the connection
            logger.debug('Verifying SMTP connection');
            await this.transporter.verify();
            logger.debug('Email service initialized successfully');

        } catch (error) {
            logger.error('Email service initialization error', { error: error.message });
            logger.error('Email functionality will be disabled');
            // Don't throw error to prevent app from crashing
            this.transporter = null;
        }
    }

    /**
     * Send PRC document via email
     * @param {string} recipientEmail - Recipient email address
     * @param {Object} prc - PRC document object
     * @param {Object} options - Email options
     * @returns {Promise<Object>} - Email sending result
     */
    async sendPRC(recipientEmail, prc, options = {}) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            if (!recipientEmail || !prc) {
                throw new Error('Recipient email and PRC document are required');
            }

            // Prepare email content
            const emailSubject = options.subject ||
                `Your PRC Document - ${prc.prcData.gn} ${prc.prcData.fn}`;

            const emailText = this.generateTextContent(prc);
            const emailHtml = this.generateHtmlContent(prc);

            // Prepare attachments
            const attachments = [];

            // Add PDF attachment
            if (prc.pdfBuffer) {
                attachments.push({
                    filename: `PRC_${prc.prcData.fn}_${prc.prcData.gn}.pdf`,
                    content: prc.pdfBuffer,
                    contentType: 'application/pdf'
                });
            }

            // Add QR code image attachment
            if (prc.qrCodeImage) {
                attachments.push({
                    filename: `QR_Code_${prc.jti}.png`,
                    content: prc.qrCodeImage,
                    contentType: 'image/png',
                    cid: 'qrcode' // For embedding in HTML
                });
            }

            // Email options
            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: recipientEmail,
                subject: emailSubject,
                text: emailText,
                html: emailHtml,
                attachments: attachments,
                headers: {
                    'X-Priority': '3',
                    'X-MSMail-Priority': 'Normal',
                    'X-Mailer': 'PRC Generator v1.0.0'
                }
            };

            // Send email
            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('PRC email sent successfully', {
                messageId: result.messageId,
                recipient: recipientEmail,
                prcId: prc._id,
                response: result.response
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: recipientEmail
            };

        } catch (error) {
            logger.error('Email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Generate plain text email content
     * @param {Object} prc - PRC document
     * @returns {string} - Plain text content
     */
    generateTextContent(prc) {
        const data = prc.prcData;
        const validityPeriod = `${this.formatDate(data.sd)} to ${this.formatDate(data.ed)}`;

        return `
Dear ${data.gn} ${data.fn},

Your Provisional Replacement Certificate (PRC) has been generated and is attached to this email.

PRC Details:
- Card Holder: ${data.gn} ${data.fn}
- Date of Birth: ${this.formatDate(data.dob)}
- Personal ID: ${data.hi}
- Issuing Country: ${this.getCountryName(data.ic)}
- Institution: ${data.in} (${data.ii})
- Validity Period: ${validityPeriod}
- Issue Date: ${this.formatDate(data.di)}

The attached PDF contains a QR code that can be used for verification purposes. Please keep this document safe and present it when receiving healthcare services in other EU/EEA countries.

Important Notes:
- This PRC is valid only for the specified period
- Present this document along with your ID when seeking medical treatment
- The QR code contains encrypted information for verification by healthcare providers

For any questions or concerns, please contact your health insurance institution.

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
        `.trim();
    }

    /**
     * Generate HTML email content
     * @param {Object} prc - PRC document
     * @returns {string} - HTML content
     */
    generateHtmlContent(prc) {
        const data = prc.prcData;
        const validityPeriod = `${this.formatDate(data.sd)} to ${this.formatDate(data.ed)}`;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your PRC Document</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #0066CC;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
        }
        .prc-details {
            background-color: white;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .detail-row {
            margin: 8px 0;
            display: flex;
            justify-content: space-between;
        }
        .detail-label {
            font-weight: bold;
            color: #555;
        }
        .detail-value {
            color: #333;
        }
        .qr-section {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            background-color: white;
            border-radius: 5px;
        }
        .footer {
            background-color: #333;
            color: white;
            padding: 15px;
            text-align: center;
            font-size: 12px;
            border-radius: 0 0 5px 5px;
        }
        .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 10px;
            border-radius: 5px;
            margin: 15px 0;
        }
        @media (max-width: 600px) {
            .detail-row {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Provisional Replacement Certificate</h1>
        <p>European Health Insurance Card</p>
    </div>

    <div class="content">
        <p>Dear <strong>${data.gn} ${data.fn}</strong>,</p>

        <p>Your Provisional Replacement Certificate (PRC) has been generated and is attached to this email as a PDF document.</p>

        <div class="prc-details">
            <h3>PRC Details</h3>
            <div class="detail-row">
                <span class="detail-label">Card Holder:</span>
                <span class="detail-value">${data.gn} ${data.fn}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date of Birth:</span>
                <span class="detail-value">${this.formatDate(data.dob)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Personal ID:</span>
                <span class="detail-value">${data.hi}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Issuing Country:</span>
                <span class="detail-value">${this.getCountryName(data.ic)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Institution:</span>
                <span class="detail-value">${data.in} (${data.ii})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Validity Period:</span>
                <span class="detail-value">${validityPeriod}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Issue Date:</span>
                <span class="detail-value">${this.formatDate(data.di)}</span>
            </div>
        </div>

        ${prc.qrCodeImage ? `
        <div class="qr-section">
            <h4>QR Code for Verification</h4>
            <img src="cid:qrcode" alt="QR Code" style="max-width: 200px; height: auto;">
            <p style="font-size: 12px; color: #666;">
                This QR code contains encrypted information for verification by healthcare providers.
            </p>
        </div>
        ` : ''}

        <div class="warning">
            <h4>Important Notes:</h4>
            <ul>
                <li>This PRC is valid only for the specified period</li>
                <li>Present this document along with your ID when seeking medical treatment</li>
                <li>The QR code contains encrypted information for verification by healthcare providers</li>
                <li>Keep this document safe and do not share it with unauthorized persons</li>
            </ul>
        </div>

        <p>For any questions or concerns, please contact your health insurance institution.</p>

        <p>Best regards,<br>
        <strong>PRC Generator System</strong></p>
    </div>

    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
        `.trim();
    }

    /**
     * Send notification email to admin
     * @param {Object} prc - PRC document
     * @param {Object} user - User who generated the PRC
     * @returns {Promise<Object>} - Email result
     */
    async sendAdminNotification(prc, user) {
        try {
            const adminEmail = process.env.ADMIN_EMAIL;
            if (!adminEmail || !this.transporter) {
                return { success: false, message: 'Admin email not configured' };
            }

            const mailOptions = {
                from: {
                    name: 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: adminEmail,
                subject: `New PRC Generated - ${prc.prcData.gn} ${prc.prcData.fn}`,
                text: `
A new PRC has been generated:

Card Holder: ${prc.prcData.gn} ${prc.prcData.fn}
Generated by: ${user.fullName} (${user.email})
Institution: ${prc.prcData.in} (${prc.prcData.ii})
Country: ${this.getCountryName(prc.prcData.ic)}
Generated at: ${new Date().toLocaleString()}
PRC ID: ${prc._id}
                `,
                html: `
<h2>New PRC Generated</h2>
<p><strong>Card Holder:</strong> ${prc.prcData.gn} ${prc.prcData.fn}</p>
<p><strong>Generated by:</strong> ${user.fullName} (${user.email})</p>
<p><strong>Institution:</strong> ${prc.prcData.in} (${prc.prcData.ii})</p>
<p><strong>Country:</strong> ${this.getCountryName(prc.prcData.ic)}</p>
<p><strong>Generated at:</strong> ${new Date().toLocaleString()}</p>
<p><strong>PRC ID:</strong> ${prc._id}</p>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: result.messageId };

        } catch (error) {
            logger.error('Admin notification error', { error: error.message, stack: error.stack });
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     * @param {string} recipientEmail - Recipient email address
     * @param {string} resetToken - Password reset token
     * @param {Object} user - User object
     * @returns {Promise<Object>} - Email sending result
     */
    async sendPasswordReset(recipientEmail, resetToken, user) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            if (!recipientEmail || !resetToken) {
                throw new Error('Recipient email and reset token are required');
            }

            // Generate reset URL
            const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/reset-password/${resetToken}`;

            // Email options
            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: recipientEmail,
                subject: 'Password Reset Request',
                text: `
Dear ${user.firstName} ${user.lastName},

You have requested to reset your password for your PRC Generator account.

Please click the following link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email and your password will remain unchanged.

For security reasons, we recommend:
- Using a strong, unique password
- Not sharing your password with anyone
- Changing your password regularly

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Request</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #0066CC;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #0066CC;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
        }
        .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 10px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .footer {
            background-color: #333;
            color: white;
            padding: 15px;
            text-align: center;
            font-size: 12px;
            border-radius: 0 0 5px 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Password Reset Request</h1>
    </div>

    <div class="content">
        <p>Dear <strong>${user.firstName} ${user.lastName}</strong>,</p>

        <p>You have requested to reset your password for your PRC Generator account.</p>

        <p>Please click the button below to reset your password:</p>

        <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
        </p>

        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px; border-radius: 3px;">
            ${resetUrl}
        </p>

        <div class="warning">
            <h4>Important:</h4>
            <ul>
                <li>This link will expire in <strong>1 hour</strong></li>
                <li>If you did not request this password reset, please ignore this email</li>
                <li>Your password will remain unchanged if you don't click the link</li>
            </ul>
        </div>

        <h4>Security Recommendations:</h4>
        <ul>
            <li>Use a strong, unique password</li>
            <li>Don't share your password with anyone</li>
            <li>Change your password regularly</li>
        </ul>

        <p>Best regards,<br>
        <strong>PRC Generator System</strong></p>
    </div>

    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            // Send email
            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Password reset email sent successfully', {
                messageId: result.messageId,
                recipient: recipientEmail,
                userId: user._id,
                response: result.response
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: recipientEmail
            };

        } catch (error) {
            logger.error('Password reset email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send password reset email: ${error.message}`);
        }
    }

    /**
     * Test email configuration
     * @returns {Promise<Object>} - Test result
     */
    async testEmailConfiguration() {
        try {
            if (!this.transporter) {
                return { success: false, error: 'Email transporter not initialized' };
            }

            await this.transporter.verify();
            return { success: true, message: 'Email configuration is valid' };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        try {
            if (typeof date === 'string') {
                date = new Date(date);
            }
            return date.toLocaleDateString('en-GB'); // DD/MM/YYYY format
        } catch (error) {
            return date.toString();
        }
    }

    /**
     * Send institution join request notification to administrators
     * @param {Array} admins - Array of administrator user objects
     * @param {Object} requester - User who requested to join
     * @param {Object} institution - Institution object
     * @param {string} justification - Requester's justification
     * @returns {Promise<Object>} - Email sending result
     */
    async sendInstitutionJoinRequest(admins, requester, institution, justification) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            if (!admins || admins.length === 0) {
                throw new Error('No administrators found');
            }

            const adminEmails = admins.map(admin => admin.email).join(', ');
            const reviewUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/institution-request/pending-joins`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: adminEmails,
                subject: `New Join Request - ${institution.name}`,
                text: `
Dear Administrator,

A new request to join your institution has been submitted.

Institution: ${institution.name} (${institution.country})
Institution ID: ${institution.institutionId}

Requester Information:
Name: ${requester.firstName} ${requester.lastName}
Email: ${requester.email}

Justification:
${justification}

Please review and approve or reject this request at:
${reviewUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Join Request</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0066CC; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #0066CC; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>New Institution Join Request</h1>
    </div>
    <div class="content">
        <p>Dear Administrator,</p>
        <p>A new request to join your institution has been submitted.</p>
        <div class="info-box">
            <h3>Institution</h3>
            <p><strong>${institution.name}</strong> (${institution.country})<br>
            Institution ID: ${institution.institutionId}</p>
        </div>
        <div class="info-box">
            <h3>Requester Information</h3>
            <p><strong>Name:</strong> ${requester.firstName} ${requester.lastName}<br>
            <strong>Email:</strong> ${requester.email}</p>
        </div>
        <div class="info-box">
            <h3>Justification</h3>
            <p>${justification}</p>
        </div>
        <p style="text-align: center;">
            <a href="${reviewUrl}" class="button">Review Request</a>
        </p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Institution join request email sent successfully', {
                messageId: result.messageId,
                recipients: adminEmails,
                institutionId: institution._id
            });

            return {
                success: true,
                messageId: result.messageId,
                recipients: adminEmails
            };

        } catch (error) {
            logger.error('Join request email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send join request email: ${error.message}`);
        }
    }

    /**
     * Send join approval notification to requester
     * @param {Object} requester - User who requested to join
     * @param {Object} institution - Institution object
     * @param {string} notes - Optional approval notes
     * @returns {Promise<Object>} - Email sending result
     */
    async sendJoinApproval(requester, institution, notes = '') {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            const dashboardUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/prc/dashboard`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: requester.email,
                subject: `Join Request Approved - ${institution.name}`,
                text: `
Dear ${requester.firstName} ${requester.lastName},

Your request to join ${institution.name} has been approved!

Institution: ${institution.name} (${institution.country})
Institution ID: ${institution.institutionId}

You are now an administrator of this institution and can start generating PRCs.

${notes ? `Administrator Notes:\n${notes}\n\n` : ''}
Access your dashboard at:
${dashboardUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Join Request Approved</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .success-badge { background-color: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin: 15px 0; border: 1px solid #c3e6cb; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Join Request Approved</h1>
    </div>
    <div class="content">
        <p>Dear <strong>${requester.firstName} ${requester.lastName}</strong>,</p>
        <div class="success-badge">
            <strong>Congratulations!</strong> Your request to join ${institution.name} has been approved.
        </div>
        <div class="info-box">
            <h3>Institution Details</h3>
            <p><strong>${institution.name}</strong> (${institution.country})<br>
            Institution ID: ${institution.institutionId}</p>
        </div>
        <p>You are now an administrator of this institution and can start generating PRCs for your patients.</p>
        ${notes ? `<div class="info-box"><h3>Administrator Notes</h3><p>${notes}</p></div>` : ''}
        <p style="text-align: center;">
            <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
        </p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Join approval email sent successfully', {
                messageId: result.messageId,
                recipient: requester.email,
                institutionId: institution._id
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: requester.email
            };

        } catch (error) {
            logger.error('Join approval email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send join approval email: ${error.message}`);
        }
    }

    /**
     * Send join rejection notification to requester
     * @param {Object} requester - User who requested to join
     * @param {Object} institution - Institution object
     * @param {string} reason - Rejection reason
     * @returns {Promise<Object>} - Email sending result
     */
    async sendJoinRejection(requester, institution, reason) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            const requestsUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/institution-request/my-requests`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: requester.email,
                subject: `Join Request Declined - ${institution.name}`,
                text: `
Dear ${requester.firstName} ${requester.lastName},

Your request to join ${institution.name} has been declined.

Institution: ${institution.name} (${institution.country})
Institution ID: ${institution.institutionId}

Reason for Rejection:
${reason}

If you have questions or would like to discuss this decision, please contact the institution directly.

You can view all your requests at:
${requestsUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Join Request Declined</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #0066CC; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .warning-box { background-color: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 15px 0; border: 1px solid #f5c6cb; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Join Request Declined</h1>
    </div>
    <div class="content">
        <p>Dear <strong>${requester.firstName} ${requester.lastName}</strong>,</p>
        <p>Your request to join ${institution.name} has been declined.</p>
        <div class="info-box">
            <h3>Institution</h3>
            <p><strong>${institution.name}</strong> (${institution.country})<br>
            Institution ID: ${institution.institutionId}</p>
        </div>
        <div class="warning-box">
            <h3>Reason for Rejection</h3>
            <p>${reason}</p>
        </div>
        <p>If you have questions or would like to discuss this decision, please contact the institution directly.</p>
        <p style="text-align: center;">
            <a href="${requestsUrl}" class="button">View My Requests</a>
        </p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Join rejection email sent successfully', {
                messageId: result.messageId,
                recipient: requester.email,
                institutionId: institution._id
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: requester.email
            };

        } catch (error) {
            logger.error('Join rejection email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send join rejection email: ${error.message}`);
        }
    }

    /**
     * Send institution creation request notification to system administrators
     * @param {Array} systemAdmins - Array of system administrator user objects
     * @param {Object} requester - User who requested to create institution
     * @param {Object} institutionData - Requested institution data
     * @returns {Promise<Object>} - Email sending result
     */
    async sendInstitutionCreationRequest(systemAdmins, requester, institutionData) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            if (!systemAdmins || systemAdmins.length === 0) {
                throw new Error('No system administrators found');
            }

            const adminEmails = systemAdmins.map(admin => admin.email).join(', ');
            const reviewUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/institution-request/pending-creations`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: adminEmails,
                subject: `New Institution Creation Request - ${institutionData.institutionName}`,
                text: `
Dear System Administrator,

A new request to create an institution has been submitted.

Requested Institution:
Name: ${institutionData.institutionName}
Country: ${institutionData.institutionCountry}
${institutionData.institutionAddress ? `Address: ${institutionData.institutionAddress}\n` : ''}${institutionData.institutionContact ? `Contact: ${institutionData.institutionContact}\n` : ''}
Requester Information:
Name: ${requester.firstName} ${requester.lastName}
Email: ${requester.email}

Justification:
${institutionData.justification}

Please review this request and assign an Institution ID (4-10 digits) if approved:
${reviewUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Institution Creation Request</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>New Institution Creation Request</h1>
    </div>
    <div class="content">
        <p>Dear System Administrator,</p>
        <p>A new request to create an institution has been submitted.</p>
        <div class="info-box">
            <h3>Requested Institution</h3>
            <p><strong>Name:</strong> ${institutionData.institutionName}<br>
            <strong>Country:</strong> ${institutionData.institutionCountry}
            ${institutionData.institutionAddress ? `<br><strong>Address:</strong> ${institutionData.institutionAddress}` : ''}
            ${institutionData.institutionContact ? `<br><strong>Contact:</strong> ${institutionData.institutionContact}` : ''}
            </p>
        </div>
        <div class="info-box">
            <h3>Requester Information</h3>
            <p><strong>Name:</strong> ${requester.firstName} ${requester.lastName}<br>
            <strong>Email:</strong> ${requester.email}</p>
        </div>
        <div class="info-box">
            <h3>Justification</h3>
            <p>${institutionData.justification}</p>
        </div>
        <p style="text-align: center;">
            <a href="${reviewUrl}" class="button">Review Request</a>
        </p>
        <p><small><em>Please assign an Institution ID (4-10 digits) if approved.</em></small></p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Institution creation request email sent successfully', {
                messageId: result.messageId,
                recipients: adminEmails
            });

            return {
                success: true,
                messageId: result.messageId,
                recipients: adminEmails
            };

        } catch (error) {
            logger.error('Creation request email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send creation request email: ${error.message}`);
        }
    }

    /**
     * Send creation approval notification to requester
     * @param {Object} requester - User who requested to create institution
     * @param {Object} institution - Created institution object
     * @param {string} notes - Optional approval notes
     * @returns {Promise<Object>} - Email sending result
     */
    async sendCreationApproval(requester, institution, notes = '') {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            const dashboardUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/prc/dashboard`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: requester.email,
                subject: `Institution Creation Approved - ${institution.name}`,
                text: `
Dear ${requester.firstName} ${requester.lastName},

Your request to create ${institution.name} has been approved!

Institution: ${institution.name} (${institution.country})
Assigned Institution ID: ${institution.institutionId}

You have been assigned as the administrator of this institution and can now start generating PRCs.

${notes ? `System Administrator Notes:\n${notes}\n\n` : ''}
Access your dashboard at:
${dashboardUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Institution Creation Approved</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .success-badge { background-color: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin: 15px 0; border: 1px solid #c3e6cb; }
        .highlight { background-color: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Institution Creation Approved</h1>
    </div>
    <div class="content">
        <p>Dear <strong>${requester.firstName} ${requester.lastName}</strong>,</p>
        <div class="success-badge">
            <strong>Congratulations!</strong> Your request to create ${institution.name} has been approved.
        </div>
        <div class="info-box">
            <h3>Institution Details</h3>
            <p><strong>${institution.name}</strong> (${institution.country})</p>
            <div class="highlight">
                <strong>Assigned Institution ID:</strong> <span style="font-size: 1.2em; color: #155724;">${institution.institutionId}</span>
            </div>
        </div>
        <p>You have been assigned as the administrator of this institution and can now start generating PRCs for your patients.</p>
        ${notes ? `<div class="info-box"><h3>System Administrator Notes</h3><p>${notes}</p></div>` : ''}
        <p style="text-align: center;">
            <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
        </p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Creation approval email sent successfully', {
                messageId: result.messageId,
                recipient: requester.email,
                institutionId: institution._id
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: requester.email
            };

        } catch (error) {
            logger.error('Creation approval email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send creation approval email: ${error.message}`);
        }
    }

    /**
     * Send creation rejection notification to requester
     * @param {Object} requester - User who requested to create institution
     * @param {string} institutionName - Name of requested institution
     * @param {string} reason - Rejection reason
     * @returns {Promise<Object>} - Email sending result
     */
    async sendCreationRejection(requester, institutionName, reason) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not available. Please check configuration.');
            }

            const requestsUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/institution-request/my-requests`;

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'PRC Generator System',
                    address: process.env.FROM_EMAIL || 'noreply@prcgenerator.eu'
                },
                to: requester.email,
                subject: `Institution Creation Request Declined - ${institutionName}`,
                text: `
Dear ${requester.firstName} ${requester.lastName},

Your request to create ${institutionName} has been declined by the system administrator.

Reason for Rejection:
${reason}

If you have questions or would like to discuss this decision, please contact the system administrator.

You can view all your requests at:
${requestsUrl}

Best regards,
PRC Generator System

---
This email was generated automatically. Please do not reply to this email.
Generated on: ${new Date().toLocaleString()}
                `.trim(),
                html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Institution Creation Request Declined</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background-color: #0066CC; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .warning-box { background-color: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 15px 0; border: 1px solid #f5c6cb; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Institution Creation Request Declined</h1>
    </div>
    <div class="content">
        <p>Dear <strong>${requester.firstName} ${requester.lastName}</strong>,</p>
        <p>Your request to create <strong>${institutionName}</strong> has been declined by the system administrator.</p>
        <div class="warning-box">
            <h3>Reason for Rejection</h3>
            <p>${reason}</p>
        </div>
        <p>If you have questions or would like to discuss this decision, please contact the system administrator.</p>
        <p style="text-align: center;">
            <a href="${requestsUrl}" class="button">View My Requests</a>
        </p>
        <p>Best regards,<br><strong>PRC Generator System</strong></p>
    </div>
    <div class="footer">
        <p>This email was generated automatically. Please do not reply to this email.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.debug('Creation rejection email sent successfully', {
                messageId: result.messageId,
                recipient: requester.email
            });

            return {
                success: true,
                messageId: result.messageId,
                recipient: requester.email
            };

        } catch (error) {
            logger.error('Creation rejection email sending error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to send creation rejection email: ${error.message}`);
        }
    }

    /**
     * Get country name from country code
     */
    getCountryName(countryCode) {
        const countries = {
            'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia',
            'CY': 'Cyprus', 'CZ': 'Czech Republic', 'DK': 'Denmark', 'EE': 'Estonia',
            'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
            'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia',
            'LT': 'Lithuania', 'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands',
            'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
            'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden', 'IS': 'Iceland',
            'LI': 'Liechtenstein', 'NO': 'Norway', 'CH': 'Switzerland', 'UK': 'United Kingdom'
        };
        return countries[countryCode] || countryCode;
    }
}

module.exports = new EmailService();