const express = require('express');
const router = express.Router();
const PRC = require('../models/PRC');
const Certificate = require('../models/Certificate');
const { isAuthenticated } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getLogger, logEntry, logExit, logException } = require('../config/logger');

const logger = getLogger('PRCRoutes');

// Services
const JWTService = require('../services/jwtService');
const QRCodeService = require('../services/qrCodeService');
const PDFService = require('../services/pdfService');
const EmailService = require('../services/emailService');

// Dashboard page (explicit route)
router.get('/dashboard', isAuthenticated, async (req, res) => {
    logEntry('GET /dashboard', { userId: req.user._id, username: req.user.username }, logger);

    try {
        logger.debug('Fetching recent PRCs for user', { userId: req.user._id, role: req.user.role });

        // Get recent PRCs for the user
        const recentPRCs = await PRC.find({ generatedBy: req.user._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('certificateId', 'name');

        logger.debug('Recent PRCs fetched', { count: recentPRCs.length });

        // Get user's certificates if they're an issuer
        let certificates = [];
        if (req.user.role === 'issuer' || req.user.role === 'admin') {
            logger.debug('Fetching certificates for issuer/admin', { role: req.user.role });

            if (req.user.role === 'admin') {
                certificates = await Certificate.find({ isActive: true }).sort({ createdAt: -1 }).limit(5);
                logger.debug('Admin certificates fetched', { count: certificates.length });
            } else {
                certificates = await Certificate.findByIssuer(req.user.country, req.user.institutionId);
                logger.debug('Issuer certificates fetched', {
                    count: certificates.length,
                    country: req.user.country,
                    institutionId: req.user.institutionId
                });
            }
        }

        logger.debug('Dashboard loaded successfully', {
            userId: req.user._id,
            prcCount: recentPRCs.length,
            certCount: certificates.length
        });

        res.render('dashboard', {
            title: 'Dashboard',
            user: req.user,
            recentPRCs: recentPRCs,
            certificates: certificates
        });

        logExit('GET /dashboard', null, logger);

    } catch (error) {
        logException('GET /dashboard', error, { userId: req.user._id }, logger);
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load dashboard'
        });
    }
});

// Home page (redirects to dashboard for authenticated users)
router.get('/', isAuthenticated, async (req, res) => {
    logEntry('GET /', { userId: req.user._id, username: req.user.username }, logger);
    logger.debug('Redirecting home page to dashboard');
    res.redirect('/prc/dashboard');
    logExit('GET /', null, logger);
});

// Phase 1: Data Input Form
router.get('/create', isAuthenticated, (req, res) => {
    res.render('prc/phases/phase1-data-input', {
        title: 'Create PRC - Data Input',
        user: req.user,
        step: 1,
        totalSteps: 4,
        prcSession: req.session.prcData || {}
    });
});

// Phase 1: Process Data Input
router.post('/create', isAuthenticated, [
    // Validation rules based on eEHIC schema
    body('ic')
        .isIn(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'])
        .withMessage('Please select a valid country'),
    body('fn')
        .isLength({ min: 1, max: 40 })
        .withMessage('Family name is required and must be less than 40 characters')
        .trim(),
    body('gn')
        .isLength({ min: 1, max: 35 })
        .withMessage('Given name is required and must be less than 35 characters')
        .trim(),
    body('dob')
        .matches(/^[0-9]{4}-(0[0-9]|1[0-2]|00)-(0[0-9]|[1-2][0-9]|3[0-1]|00)$/)
        .withMessage('Date of birth must be in format YYYY-MM-DD (use 00 for unknown day/month)'),
    body('hi')
        .isLength({ min: 1, max: 20 })
        .withMessage('Personal identification number is required and must be less than 20 characters')
        .trim(),
    body('in')
        .isLength({ min: 1, max: 21 })
        .withMessage('Institution name is required and must be less than 21 characters')
        .trim(),
    body('ii')
        .isLength({ min: 4, max: 10 })
        .withMessage('Institution ID must be between 4 and 10 characters')
        .matches(/^\d+$/)
        .withMessage('Institution ID must contain only digits'),
    body('ci')
        .optional()
        .isLength({ max: 20 })
        .withMessage('Card ID must be less than 20 characters')
        .matches(/^\d*$/)
        .withMessage('Card ID must contain only digits'),
    body('sd')
        .isISO8601()
        .withMessage('Start date must be a valid date'),
    body('ed')
        .isISO8601()
        .withMessage('End date must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.sd)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),
    body('xd')
        .optional()
        .isISO8601()
        .withMessage('Expiry date must be a valid date'),
    body('di')
        .isISO8601()
        .withMessage('Issuance date must be a valid date')
        .custom((value, { req }) => {
            const issueDate = new Date(value);
            const startDate = new Date(req.body.sd);
            const endDate = new Date(req.body.ed);

            if (issueDate < startDate || issueDate > endDate) {
                throw new Error('Issuance date must be between start and end dates');
            }
            return true;
        })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Check if it's an AJAX request
            if (req.headers['content-type'] === 'application/json') {
                return res.json({
                    success: false,
                    errors: errors.array().map(err => ({
                        field: err.param,
                        message: err.msg
                    }))
                });
            }
            return res.render('prc/phases/phase1-data-input', {
                title: 'Create PRC - Data Input',
                error: errors.array()[0].msg,
                formData: req.body,
                user: req.user,
                step: 1,
                totalSteps: 4,
                prcSession: { formData: req.body }
            });
        }

        // Additional business validation
        const { ii, in: institutionName } = req.body;
        if ((ii.length + institutionName.length) > 25) {
            if (req.headers['content-type'] === 'application/json') {
                return res.json({
                    success: false,
                    errors: [{
                        field: 'ii',
                        message: 'Combined institution ID and name length must not exceed 25 characters'
                    }]
                });
            }
            return res.render('prc/phases/phase1-data-input', {
                title: 'Create PRC - Data Input',
                error: 'Combined institution ID and name length must not exceed 25 characters',
                formData: req.body,
                user: req.user,
                step: 1,
                totalSteps: 4,
                prcSession: { formData: req.body }
            });
        }

        // Store data in session for next phase
        req.session.prcData = req.body;

        // Return JSON for AJAX requests
        if (req.headers['content-type'] === 'application/json') {
            return res.json({ success: true });
        }

        // Regular redirect for form submissions
        res.redirect('/prc/generate');

    } catch (error) {
        logger.error('Phase 1 error', { error: error.message, stack: error.stack });

        if (req.headers['content-type'] === 'application/json') {
            return res.json({
                success: false,
                errors: [{
                    field: 'general',
                    message: 'An error occurred while processing the data. Please try again.'
                }]
            });
        }

        res.render('prc/phases/phase1-data-input', {
            title: 'Create PRC - Data Input',
            error: 'An error occurred while processing the data. Please try again.',
            formData: req.body,
            user: req.user,
            step: 1,
            totalSteps: 4,
            prcSession: { formData: req.body }
        });
    }
});

// Phase 2: JWT Generation and QR Code Creation
router.get('/generate', isAuthenticated, async (req, res) => {
    try {
        logger.debug('GET /generate - Start', {
            hasSession: !!req.session.prcData,
            userRole: req.user.role
        });

        if (!req.session.prcData) {
            logger.debug('No session data, redirecting to create');
            return res.redirect('/prc/create');
        }

        // Get available certificates for signing
        let certificates = [];
        if (req.user.role === 'admin') {
            logger.debug('Fetching certificates for admin');
            certificates = await Certificate.find({ isActive: true });
        } else if (req.user.role === 'issuer') {
            logger.debug('Fetching certificates for issuer', {
                country: req.user.country,
                institutionId: req.user.institutionId
            });
            certificates = await Certificate.findByIssuer(req.user.country, req.user.institutionId);
        }

        logger.debug('Certificates found', { count: certificates.length });

        if (certificates.length === 0) {
            logger.debug('No certificates, showing error page');
            return res.render('errorPage', {
                title: 'No Certificates Available',
                error: 'No Certificates Available',
                message: 'No active certificates are available for signing. Please create a certificate first.',
                user: req.user
            });
        }

        logger.debug('Rendering phase2-jwt-creation template');
        res.render('prc/phases/phase2-jwt-creation', {
            title: 'Create PRC - Generate JWT & QR Code',
            user: req.user,
            prcData: req.session.prcData,
            prcSession: { formData: req.session.prcData },
            certificates: certificates,
            step: 2,
            totalSteps: 4
        });
    } catch (error) {
        logger.error('Phase 2 error', { error: error.message, stack: error.stack });
        try {
            res.status(500).render('errorPage', {
                title: 'Internal Server Error',
                error: 'Internal Server Error',
                message: 'Could not load generation page',
                user: req.user
            });
        } catch (renderError) {
            logger.error('Failed to render error page', { error: renderError.message });
            res.status(500).send('Internal Server Error');
        }
    }
});

// Phase 2: Process JWT Generation
router.post('/generate', isAuthenticated, [
    body('certificateId')
        .isMongoId()
        .withMessage('Please select a valid certificate'),
    body('revocationUrl')
        .optional()
        .isURL()
        .withMessage('Revocation URL must be a valid URL')
], async (req, res) => {
    try {
        if (!req.session.prcData) {
            return res.redirect('/create');
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const certificates = req.user.role === 'admin' ?
                await Certificate.find({ isActive: true }) :
                await Certificate.findByIssuer(req.user.country, req.user.institutionId);

            return res.render('prc/phases/phase2-jwt-creation', {
                title: 'Create PRC - Generate JWT & QR Code',
                error: errors.array()[0].msg,
                user: req.user,
                prcData: req.session.prcData,
                prcSession: { formData: req.session.prcData },
                certificates: certificates,
                formData: req.body,
                step: 2,
                totalSteps: 4
            });
        }

        const { certificateId, revocationUrl } = req.body;

        // Get the certificate
        const certificate = await Certificate.findById(certificateId);
        if (!certificate || !certificate.isValid) {
            throw new Error('Invalid or expired certificate');
        }

        // Check permissions
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                throw new Error('You do not have permission to use this certificate');
            }
        }

        // Generate unique JTI
        const jti = uuidv4();

        // Create JWT payload
        const payload = {
            jti: jti,
            sid: 'eessi:prc:1.0',
            prc: {
                ic: req.session.prcData.ic,
                fn: req.session.prcData.fn,
                gn: req.session.prcData.gn,
                dob: req.session.prcData.dob,
                hi: req.session.prcData.hi,
                in: req.session.prcData.in,
                ii: req.session.prcData.ii,
                sd: req.session.prcData.sd,
                ed: req.session.prcData.ed,
                di: req.session.prcData.di
            }
        };

        // Add optional fields
        if (req.session.prcData.ci) {
            payload.prc.ci = req.session.prcData.ci;
        }
        if (req.session.prcData.xd) {
            payload.prc.xd = req.session.prcData.xd;
        }
        if (revocationUrl) {
            payload.rid = revocationUrl;
        }

        // Generate JWT
        const jwt = await JWTService.generateJWT(payload, certificate);

        // Validate JWT against schema
        const isValid = await JWTService.validateJWT(payload);
        if (!isValid) {
            throw new Error('Generated JWT does not conform to schema');
        }

        // Generate QR Code
        const qrCodeData = await QRCodeService.generateQRCode(jwt);

        // Store generation results in session
        req.session.generationResult = {
            jwt: jwt,
            qrCodeData: qrCodeData,
            certificateId: certificateId,
            jti: jti
        };

        res.redirect('/preview');

    } catch (error) {
        logger.error('JWT Generation error', { error: error.message, stack: error.stack });
        const certificates = req.user.role === 'admin' ?
            await Certificate.find({ isActive: true }) :
            await Certificate.findByIssuer(req.user.country, req.user.institutionId);

        res.render('prc/phases/phase2-jwt-creation', {
            title: 'Create PRC - Generate JWT & QR Code',
            error: error.message || 'An error occurred during generation',
            user: req.user,
            prcData: req.session.prcData,
            prcSession: { formData: req.session.prcData },
            certificates: certificates,
            formData: req.body,
            step: 2,
            totalSteps: 4
        });
    }
});

// Phase 3: Preview and PDF Generation
router.get('/preview', isAuthenticated, async (req, res) => {
    try {
        if (!req.session.prcData || !req.session.generationResult) {
            return res.redirect('/create');
        }

        // Generate PDF preview
        const pdfBuffer = await PDFService.generatePDF(req.session.prcData, req.session.generationResult.qrCodeData);

        res.render('prc/phases/phase3-qr-generation', {
            title: 'Create PRC - Preview & PDF',
            user: req.user,
            prcData: req.session.prcData,
            generationResult: req.session.generationResult,
            step: 3,
            totalSteps: 4
        });
    } catch (error) {
        logger.error('Preview error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not generate PDF preview',
            user: req.user
        });
    }
});

// Download PDF preview
router.get('/preview/download', isAuthenticated, async (req, res) => {
    try {
        if (!req.session.prcData || !req.session.generationResult) {
            return res.redirect('/create');
        }

        const pdfBuffer = await PDFService.generatePDF(req.session.prcData, req.session.generationResult.qrCodeData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="PRC_${req.session.prcData.fn}_${req.session.prcData.gn}_preview.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        logger.error('PDF download error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Could not generate PDF' });
    }
});

// Phase 4: Finalization and Email
router.get('/finalize', isAuthenticated, (req, res) => {
    if (!req.session.prcData || !req.session.generationResult) {
        return res.redirect('/create');
    }

    res.render('prc/phases/phase4-pdf-email', {
        title: 'Create PRC - Finalize & Email',
        user: req.user,
        prcData: req.session.prcData,
        step: 4,
        totalSteps: 4
    });
});

// Phase 4: Process Finalization
router.post('/finalize', isAuthenticated, [
    body('email')
        .optional()
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),
    body('action')
        .isIn(['save', 'save_and_email'])
        .withMessage('Invalid action')
], async (req, res) => {
    try {
        if (!req.session.prcData || !req.session.generationResult) {
            return res.redirect('/create');
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('prc/phases/phase4-pdf-email', {
                title: 'Create PRC - Finalize & Email',
                error: errors.array()[0].msg,
                user: req.user,
                prcData: req.session.prcData,
                formData: req.body,
                step: 4,
                totalSteps: 4
            });
        }

        const { email, action } = req.body;

        // Generate final PDF
        const pdfBuffer = await PDFService.generatePDF(req.session.prcData, req.session.generationResult.qrCodeData);

        // Generate QR code image
        const qrCodeImage = await QRCodeService.generateQRCodeImage(req.session.generationResult.qrCodeData);

        // Create PRC document in database
        const prcData = {
            jti: req.session.generationResult.jti,
            sid: 'eessi:prc:1.0',
            prcData: {
                ic: req.session.prcData.ic,
                fn: req.session.prcData.fn,
                gn: req.session.prcData.gn,
                dob: req.session.prcData.dob,
                hi: req.session.prcData.hi,
                in: req.session.prcData.in,
                ii: req.session.prcData.ii,
                sd: new Date(req.session.prcData.sd),
                ed: new Date(req.session.prcData.ed),
                di: new Date(req.session.prcData.di)
            },
            jwt: req.session.generationResult.jwt,
            qrCodeData: req.session.generationResult.qrCodeData,
            qrCodeImage: qrCodeImage,
            pdfBuffer: pdfBuffer,
            certificateId: req.session.generationResult.certificateId,
            generatedBy: req.user._id,
            status: 'generated'
        };

        // Add optional fields
        if (req.session.prcData.ci) {
            prcData.prcData.ci = req.session.prcData.ci;
        }
        if (req.session.prcData.xd) {
            prcData.prcData.xd = new Date(req.session.prcData.xd);
        }

        const prc = new PRC(prcData);
        await prc.save();

        // Increment certificate usage
        const certificate = await Certificate.findById(req.session.generationResult.certificateId);
        await certificate.incrementUsage();

        // Send email if requested
        if (action === 'save_and_email' && email) {
            try {
                await EmailService.sendPRC(email, prc);
                await prc.markAsSent(email);
            } catch (emailError) {
                logger.error('Email sending error', { error: emailError.message, stack: emailError.stack });
                // Continue even if email fails
            }
        }

        // Clear session data
        delete req.session.prcData;
        delete req.session.generationResult;

        res.redirect(`/prc/${prc._id}?success=PRC generated successfully`);

    } catch (error) {
        logger.error('Finalization error', { error: error.message, stack: error.stack });
        res.render('prc/phases/phase4-pdf-email', {
            title: 'Create PRC - Finalize & Email',
            error: 'An error occurred while finalizing the PRC. Please try again.',
            user: req.user,
            prcData: req.session.prcData,
            formData: req.body,
            step: 4,
            totalSteps: 4
        });
    }
});

// View PRC details
router.get('/:id', isAuthenticated, async (req, res) => {
    logEntry('GET /:id', { prcId: req.params.id, userId: req.user._id }, logger);

    try {
        // Validate if the ID looks like a valid ObjectId
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            logger.warn('Invalid PRC ID format', { prcId: req.params.id, userId: req.user._id });
            return res.status(404).render('errorPage', {
                title: 'Not Found',
                error: 'Not Found',
                message: 'PRC not found - invalid ID format'
            });
        }

        logger.debug('Fetching PRC', { prcId: req.params.id });
        const prc = await PRC.findById(req.params.id)
            .populate('certificateId', 'name algorithm')
            .populate('generatedBy', 'username fullName');

        if (!prc) {
            logger.warn('PRC not found', { prcId: req.params.id, userId: req.user._id });
            return res.status(404).render('errorPage', {
                title: 'Not Found',
                error: 'Not Found',
                message: 'PRC not found'
            });
        }

        // Check permissions
        if (req.user.role !== 'admin' && prc.generatedBy._id.toString() !== req.user._id.toString()) {
            logger.warn('PRC access denied', {
                prcId: req.params.id,
                userId: req.user._id,
                prcOwner: prc.generatedBy._id
            });
            return res.status(403).render('errorPage', {
                title: 'Access Denied',
                error: 'Access Denied',
                message: 'You do not have permission to view this PRC'
            });
        }

        logger.debug('PRC loaded successfully', {
            prcId: prc._id,
            userId: req.user._id,
            holderName: prc.holderFullName
        });

        res.render('prc/view', {
            title: `PRC: ${prc.holderFullName}`,
            prc: prc,
            user: req.user,
            success: req.query.success
        });

        logExit('GET /prc/:id', null, logger);

    } catch (error) {
        logException('GET /prc/:id', error, { prcId: req.params.id, userId: req.user._id }, logger);
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load PRC'
        });
    }
});

// Download PRC PDF
router.get('/:id/download', isAuthenticated, async (req, res) => {
    try {
        const prc = await PRC.findById(req.params.id);

        if (!prc) {
            return res.status(404).json({ error: 'PRC not found' });
        }

        // Check permissions
        if (req.user.role !== 'admin' && prc.generatedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="PRC_${prc.prcData.fn}_${prc.prcData.gn}.pdf"`);
        res.send(prc.pdfBuffer);
    } catch (error) {
        logger.error('PRC download error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
