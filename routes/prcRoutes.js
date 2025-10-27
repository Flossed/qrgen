const express = require('express');
const router = express.Router();
const PRC = require('../models/PRC');
const Certificate = require('../models/Certificate');
const EHIC = require('../models/EHIC');
const { isAuthenticated, blockAdminFromPRC } = require('../middleware/auth');
const { checkOnboardingComplete } = require('../middleware/onboarding');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getLogger, logEntry, logExit, logException } = require('../config/logger');

const logger = getLogger('PRCRoutes');

// Services
const JWTService = require('../services/jwtService');
const QRCodeService = require('../services/qrCodeService');
const PDFService = require('../services/pdfService');
const EmailService = require('../services/emailService');

// Apply blockAdminFromPRC middleware to all routes in this router
// Domain Owners cannot generate or request PRCs
router.use(blockAdminFromPRC);

// Dashboard page (explicit route)
router.get('/dashboard', isAuthenticated, async (req, res) => {
    logEntry('GET /dashboard', { userId: req.user._id, username: req.user.username }, logger);

    try {
        logger.debug('Fetching recent PRCs for user', { userId: req.user._id, role: req.user.role });

        // Get recent PRCs for the user
        let recentPRCs = [];
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            // Citizens see PRCs that were generated for them
            // First, get PRCs directly linked via citizenId
            recentPRCs = await PRC.find({ citizenId: req.user._id })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('certificateId', 'name')
                .populate('generatedBy', 'firstName lastName');

            // Also get PRCs linked through approved PRC requests
            const PRCRequest = require('../models/PRCRequest');
            const approvedRequests = await PRCRequest.find({
                citizenId: req.user._id,
                status: 'approved',
                prcId: { $exists: true, $ne: null }
            })
                .populate('prcId')
                .sort({ createdAt: -1 })
                .limit(5);

            // Add PRCs from requests that aren't already in the list
            const existingPRCIds = new Set(recentPRCs.map(p => p._id.toString()));
            for (const request of approvedRequests) {
                if (request.prcId && !existingPRCIds.has(request.prcId._id.toString())) {
                    // Populate the PRC fully
                    const prc = await PRC.findById(request.prcId._id)
                        .populate('certificateId', 'name')
                        .populate('generatedBy', 'firstName lastName');
                    if (prc) {
                        recentPRCs.push(prc);
                        existingPRCIds.add(prc._id.toString());
                    }
                }
            }

            // Sort combined list and limit to 5
            recentPRCs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            recentPRCs = recentPRCs.slice(0, 5);
        } else {
            // Issuers/admins see PRCs they generated
            recentPRCs = await PRC.find({ generatedBy: req.user._id })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('certificateId', 'name');
        }

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

        // Check if citizen has active EHIC (for onboarding display) and get EHIC data
        let hasActiveEHIC = false;
        let citizenEHICs = [];
        let activeEHIC = null;
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            hasActiveEHIC = await EHIC.hasActiveEHIC(req.user._id);
            // Get all EHICs for the citizen to display in dashboard
            citizenEHICs = await EHIC.find({ citizenId: req.user._id })
                .populate('institution', 'name institutionId country address')
                .populate('reviewedBy', 'firstName lastName')
                .sort({ createdAt: -1 })
                .limit(5);
            activeEHIC = citizenEHICs.find(e => e.isActive);
            logger.debug('Checked for active EHIC', {
                userId: req.user._id,
                hasActiveEHIC,
                totalEHICs: citizenEHICs.length,
                hasActive: !!activeEHIC
            });
        }

        // Get pending EHIC requests and PRC requests for issuers
        let pendingEHICRequests = [];
        let pendingPRCRequests = [];
        let issuerInstitution = null;
        if (req.user.role === 'issuer' && req.user.institutionId && req.user.country) {
            logger.debug('Fetching pending requests for issuer', {
                institutionId: req.user.institutionId,
                country: req.user.country
            });

            const HealthcareInstitution = require('../models/HealthcareInstitution');
            const PRCRequest = require('../models/PRCRequest');

            issuerInstitution = await HealthcareInstitution.findOne({
                institutionId: req.user.institutionId,
                country: req.user.country
            });

            if (issuerInstitution) {
                pendingEHICRequests = await EHIC.findPendingByInstitution(issuerInstitution._id);
                pendingPRCRequests = await PRCRequest.findPendingByInstitution(issuerInstitution._id);
                logger.debug('Pending requests found', {
                    ehicCount: pendingEHICRequests.length,
                    prcCount: pendingPRCRequests.length
                });
            }
        }

        // Build recent activity feed
        const PRCRequest = require('../models/PRCRequest');
        const recentActivity = [];

        // For citizens: their own activities
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            // EHIC requests
            const myEHICRequests = await EHIC.find({ citizenId: req.user._id })
                .populate('institution', 'name')
                .populate('reviewedBy', 'firstName lastName')
                .sort({ createdAt: -1 })
                .limit(10);

            myEHICRequests.forEach(ehic => {
                recentActivity.push({
                    type: 'ehic_request',
                    action: ehic.status === 'approved' ? 'EHIC Approved' :
                            ehic.status === 'rejected' ? 'EHIC Rejected' :
                            'EHIC Requested',
                    description: `EHIC request ${ehic.status} by ${ehic.institution.name}`,
                    status: ehic.status,
                    timestamp: ehic.reviewedAt || ehic.createdAt,
                    details: ehic.reviewNotes || ''
                });
            });

            // PRC requests
            const myPRCRequests = await PRCRequest.find({ citizenId: req.user._id })
                .populate('institutionId', 'name')
                .populate('reviewedBy', 'firstName lastName')
                .sort({ createdAt: -1 })
                .limit(10);

            myPRCRequests.forEach(prc => {
                recentActivity.push({
                    type: 'prc_request',
                    action: prc.status === 'approved' ? 'PRC Approved' :
                            prc.status === 'rejected' ? 'PRC Rejected' :
                            'PRC Requested',
                    description: `PRC for ${prc.destinationCountry} - ${prc.status}`,
                    status: prc.status,
                    timestamp: prc.reviewedAt || prc.createdAt,
                    details: prc.reviewNotes || ''
                });
            });
        }

        // For issuers: review activities
        if (req.user.role === 'issuer' && issuerInstitution) {
            // EHIC reviews
            const reviewedEHICs = await EHIC.find({
                institution: issuerInstitution._id,
                reviewedBy: req.user._id
            })
            .populate('citizenId', 'firstName lastName')
            .sort({ reviewedAt: -1 })
            .limit(10);

            reviewedEHICs.forEach(ehic => {
                recentActivity.push({
                    type: 'ehic_review',
                    action: ehic.status === 'approved' ? 'Approved EHIC' : 'Rejected EHIC',
                    description: `${ehic.status === 'approved' ? 'Approved' : 'Rejected'} EHIC for ${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`,
                    status: ehic.status,
                    timestamp: ehic.reviewedAt,
                    details: ehic.reviewNotes || ''
                });
            });

            // PRC reviews
            const reviewedPRCs = await PRCRequest.find({
                institutionId: issuerInstitution._id,
                reviewedBy: req.user._id
            })
            .populate('citizenId', 'firstName lastName')
            .sort({ reviewedAt: -1 })
            .limit(10);

            reviewedPRCs.forEach(prc => {
                recentActivity.push({
                    type: 'prc_review',
                    action: prc.status === 'approved' ? 'Approved PRC' : 'Rejected PRC',
                    description: `${prc.status === 'approved' ? 'Approved' : 'Rejected'} PRC for ${prc.citizenId.firstName} ${prc.citizenId.lastName}`,
                    status: prc.status,
                    timestamp: prc.reviewedAt,
                    details: prc.reviewNotes || ''
                });
            });

            // Generated PRCs
            recentPRCs.forEach(prc => {
                recentActivity.push({
                    type: 'prc_generated',
                    action: 'PRC Generated',
                    description: `Generated PRC certificate`,
                    status: 'completed',
                    timestamp: prc.createdAt,
                    details: ''
                });
            });
        }

        // Sort all activities by timestamp (newest first)
        recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Limit to most recent 15 activities
        const limitedActivity = recentActivity.slice(0, 15);

        logger.debug('Dashboard loaded successfully', {
            userId: req.user._id,
            prcCount: recentPRCs.length,
            certCount: certificates.length,
            hasActiveEHIC,
            pendingEHICCount: pendingEHICRequests.length,
            activityCount: limitedActivity.length
        });

        res.render('dashboard', {
            title: 'Dashboard',
            user: req.user,
            recentPRCs: recentPRCs,
            certificates: certificates,
            hasActiveEHIC: hasActiveEHIC,
            citizenEHICs: citizenEHICs,
            activeEHIC: activeEHIC,
            pendingEHICRequests: pendingEHICRequests,
            pendingPRCRequests: pendingPRCRequests,
            issuerInstitution: issuerInstitution,
            recentActivity: limitedActivity
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
router.get('/create', isAuthenticated, checkOnboardingComplete, async (req, res) => {
    try {
        logger.debug('GET /create - Start', { userId: req.user._id, role: req.user.role });

        // Citizens need an active EHIC to request PRC
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            logger.debug('Checking for active EHIC', { userId: req.user._id });

            const activeEHIC = await EHIC.findActiveByCitizen(req.user._id);

            if (!activeEHIC) {
                logger.debug('No active EHIC found for citizen');
                return res.status(403).render('errorPage', {
                    title: 'EHIC Required',
                    error: {
                        status: 403,
                        message: 'You must have an approved EHIC (European Health Insurance Card) before requesting a PRC. Please request an EHIC first.'
                    },
                    user: req.user
                });
            }

            logger.debug('Active EHIC found, pre-filling PRC data', { ehicId: activeEHIC._id });

            // Pre-fill PRC data from EHIC (validity period will be calculated from travel dates)
            const today = new Date();
            const preFillData = {
                ic: activeEHIC.cardIssuerCountry,
                fn: activeEHIC.familyName,
                gn: activeEHIC.givenName,
                dob: activeEHIC.dateOfBirth,
                hi: activeEHIC.personalIdNumber,
                in: activeEHIC.institution.name,
                ii: activeEHIC.institutionId,
                ci: activeEHIC.cardId || '',
                sd: '', // Will be set from travel start date
                ed: '', // Will be calculated from travel end date
                xd: activeEHIC.expiryDate.toISOString().split('T')[0],
                di: today.toISOString().split('T')[0],
                ehicId: activeEHIC._id.toString()
            };

            logger.debug('PRC validity period calculated', {
                startDate: preFillData.sd,
                endDate: preFillData.ed,
                ehicExpiry: preFillData.xd
            });

            const { ALL_COUNTRIES } = require('../utils/countries');

            return res.render('prc/phases/phase1-data-input', {
                title: 'Create PRC - Data Input',
                user: req.user,
                step: 1,
                totalSteps: 4,
                prcSession: req.session.prcData || { formData: preFillData },
                ehicData: preFillData,
                hasEHIC: true,
                countries: ALL_COUNTRIES
            });
        }

        // Issuers can create PRC without EHIC requirement
        logger.debug('Issuer creating PRC without EHIC requirement');
        const { ALL_COUNTRIES } = require('../utils/countries');

        res.render('prc/phases/phase1-data-input', {
            title: 'Create PRC - Data Input',
            user: req.user,
            step: 1,
            totalSteps: 4,
            prcSession: req.session.prcData || {},
            hasEHIC: false,
            countries: ALL_COUNTRIES
        });

    } catch (error) {
        logger.error('GET /create error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: {
                status: 500,
                message: 'Could not load PRC creation form'
            },
            user: req.user
        });
    }
});

// Phase 1: Process Data Input
router.post('/create', isAuthenticated, checkOnboardingComplete, [
    // Travel fields (required for citizens)
    body('destinationCountry')
        .optional()
        .trim()
        .isLength({ min: 2, max: 2 })
        .withMessage('Please select a valid destination country'),
    body('travelStartDate')
        .optional()
        .isISO8601()
        .withMessage('Travel start date must be a valid date'),
    body('travelEndDate')
        .optional()
        .isISO8601()
        .withMessage('Travel end date must be a valid date')
        .custom((value, { req }) => {
            if (req.body.travelStartDate && value) {
                if (new Date(value) <= new Date(req.body.travelStartDate)) {
                    throw new Error('Travel end date must be after travel start date');
                }
            }
            return true;
        }),

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
        logger.debug('POST /create - Start', { userId: req.user._id, role: req.user.role });

        const { ALL_COUNTRIES } = require('../utils/countries');

        // Citizens need an active EHIC to request PRC
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            logger.debug('Validating EHIC for citizen', { userId: req.user._id });

            const activeEHIC = await EHIC.findActiveByCitizen(req.user._id);

            if (!activeEHIC) {
                logger.warn('Citizen attempted PRC creation without active EHIC', { userId: req.user._id });

                if (req.headers['content-type'] === 'application/json') {
                    return res.status(403).json({
                        success: false,
                        errors: [{
                            field: 'general',
                            message: 'You must have an approved EHIC before requesting a PRC.'
                        }]
                    });
                }

                return res.status(403).render('errorPage', {
                    title: 'EHIC Required',
                    error: {
                        status: 403,
                        message: 'You must have an approved EHIC (European Health Insurance Card) before requesting a PRC. Please request an EHIC first.'
                    },
                    user: req.user
                });
            }

            // Validate travel fields for citizens
            if (!req.body.destinationCountry || !req.body.travelStartDate || !req.body.travelEndDate) {
                logger.warn('Missing travel fields for citizen PRC request', { userId: req.user._id });

                if (req.headers['content-type'] === 'application/json') {
                    return res.status(400).json({
                        success: false,
                        errors: [{
                            field: 'general',
                            message: 'Destination country and travel dates are required'
                        }]
                    });
                }
            }

            // Validate that submitted data matches EHIC
            logger.debug('Validating PRC data matches EHIC', { ehicId: activeEHIC._id });

            const mismatchErrors = [];
            if (req.body.ic !== activeEHIC.cardIssuerCountry) mismatchErrors.push('Country does not match your EHIC');
            if (req.body.fn !== activeEHIC.familyName) mismatchErrors.push('Family name does not match your EHIC');
            if (req.body.gn !== activeEHIC.givenName) mismatchErrors.push('Given name does not match your EHIC');
            if (req.body.hi !== activeEHIC.personalIdNumber) mismatchErrors.push('Personal ID does not match your EHIC');
            if (req.body.ii !== activeEHIC.institutionId) mismatchErrors.push('Institution ID does not match your EHIC');

            if (mismatchErrors.length > 0) {
                logger.warn('PRC data does not match EHIC', {
                    userId: req.user._id,
                    ehicId: activeEHIC._id,
                    errors: mismatchErrors
                });

                if (req.headers['content-type'] === 'application/json') {
                    return res.status(400).json({
                        success: false,
                        errors: mismatchErrors.map(msg => ({ field: 'general', message: msg }))
                    });
                }

                return res.render('prc/phases/phase1-data-input', {
                    title: 'Create PRC - Data Input',
                    error: 'The submitted data does not match your active EHIC: ' + mismatchErrors.join(', '),
                    formData: req.body,
                    user: req.user,
                    step: 1,
                    totalSteps: 4,
                    prcSession: { formData: req.body },
                    hasEHIC: true,
                    countries: ALL_COUNTRIES
                });
            }

            logger.info('PRC data validated against EHIC', { ehicId: activeEHIC._id });
        }

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
            const hasEHIC = req.user.role === 'citizen' || req.user.role === 'user';
            return res.render('prc/phases/phase1-data-input', {
                title: 'Create PRC - Data Input',
                error: errors.array()[0].msg,
                formData: req.body,
                user: req.user,
                step: 1,
                totalSteps: 4,
                prcSession: { formData: req.body },
                hasEHIC: hasEHIC,
                countries: ALL_COUNTRIES
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
            const hasEHIC = req.user.role === 'citizen' || req.user.role === 'user';
            return res.render('prc/phases/phase1-data-input', {
                title: 'Create PRC - Data Input',
                error: 'Combined institution ID and name length must not exceed 25 characters',
                formData: req.body,
                user: req.user,
                step: 1,
                totalSteps: 4,
                prcSession: { formData: req.body },
                hasEHIC: hasEHIC,
                countries: ALL_COUNTRIES
            });
        }

        // Citizens: Create a PRC request for approval
        if (req.user.role === 'citizen' || req.user.role === 'user') {
            const PRCRequest = require('../models/PRCRequest');
            const activeEHIC = await EHIC.findActiveByCitizen(req.user._id);

            if (!activeEHIC) {
                logger.error('No active EHIC found during PRC request creation');
                if (req.headers['content-type'] === 'application/json') {
                    return res.status(403).json({
                        success: false,
                        errors: [{ field: 'general', message: 'No active EHIC found' }]
                    });
                }
            }

            // Create PRC request
            const prcRequest = new PRCRequest({
                citizenId: req.user._id,
                ehicId: activeEHIC._id,
                institutionId: activeEHIC.institution,
                destinationCountry: req.body.destinationCountry,
                travelStartDate: new Date(req.body.travelStartDate),
                travelEndDate: new Date(req.body.travelEndDate),
                prcData: {
                    ic: req.body.ic,
                    fn: req.body.fn,
                    gn: req.body.gn,
                    dob: req.body.dob,
                    hi: req.body.hi,
                    in: req.body.in,
                    ii: req.body.ii,
                    ci: req.body.ci || '',
                    xd: req.body.xd || '',
                    sd: req.body.sd,
                    ed: req.body.ed,
                    di: req.body.di
                },
                status: 'pending'
            });

            await prcRequest.save();

            logger.info('PRC request created', {
                requestId: prcRequest._id,
                citizenId: req.user._id,
                institutionId: activeEHIC.institution
            });

            // Return JSON for AJAX requests
            if (req.headers['content-type'] === 'application/json') {
                return res.json({
                    success: true,
                    message: 'PRC request submitted successfully',
                    requestId: prcRequest._id
                });
            }

            // Redirect to dashboard with success message
            req.flash('success', 'Your PRC request has been submitted and is pending approval from your healthcare institution.');
            return res.redirect('/prc/dashboard');
        }

        // Issuers: Store data in session for direct generation
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

        const { ALL_COUNTRIES } = require('../utils/countries');
        const hasEHIC = req.user.role === 'citizen' || req.user.role === 'user';
        res.render('prc/phases/phase1-data-input', {
            title: 'Create PRC - Data Input',
            error: 'An error occurred while processing the data. Please try again.',
            formData: req.body,
            user: req.user,
            step: 1,
            totalSteps: 4,
            prcSession: { formData: req.body },
            hasEHIC: hasEHIC,
            countries: ALL_COUNTRIES
        });
    }
});

// Phase 2: JWT Generation and QR Code Creation
router.get('/generate', isAuthenticated, checkOnboardingComplete, async (req, res) => {
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
router.post('/generate', isAuthenticated, checkOnboardingComplete, [
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

// PRC History/My Documents (must come before /:id route)
router.get('/history', isAuthenticated, async (req, res) => {
    try {
        let prcs = [];
        let title = 'PRC History';

        if (req.user.role === 'citizen' || req.user.role === 'user') {
            title = 'My Documents';
            // Citizens see PRCs generated for them
            // First, get PRCs directly linked via citizenId
            prcs = await PRC.find({ citizenId: req.user._id })
                .sort({ createdAt: -1 })
                .populate('certificateId', 'name')
                .populate('generatedBy', 'firstName lastName');

            logger.info('PRCs found by citizenId', { count: prcs.length, userId: req.user._id });

            // Also get PRCs linked through approved PRC requests
            const PRCRequest = require('../models/PRCRequest');
            const approvedRequests = await PRCRequest.find({
                citizenId: req.user._id,
                status: 'approved',
                prcId: { $exists: true, $ne: null }
            })
                .populate('prcId')
                .sort({ createdAt: -1 });

            logger.info('Approved PRC requests found', {
                count: approvedRequests.length,
                userId: req.user._id,
                requests: approvedRequests.map(r => ({ id: r._id, prcId: r.prcId ? r.prcId._id : null, status: r.status }))
            });

            // Add PRCs from requests that aren't already in the list
            const existingPRCIds = new Set(prcs.map(p => p._id.toString()));
            for (const request of approvedRequests) {
                logger.info('Processing approved request', {
                    requestId: request._id,
                    hasPrcId: !!request.prcId,
                    prcId: request.prcId ? request.prcId._id : null,
                    alreadyExists: request.prcId ? existingPRCIds.has(request.prcId._id.toString()) : null
                });

                if (request.prcId && !existingPRCIds.has(request.prcId._id.toString())) {
                    // Populate the PRC fully
                    const prc = await PRC.findById(request.prcId._id)
                        .populate('certificateId', 'name')
                        .populate('generatedBy', 'firstName lastName');
                    if (prc) {
                        logger.info('Adding PRC from request', { prcId: prc._id });
                        prcs.push(prc);
                        existingPRCIds.add(prc._id.toString());
                    } else {
                        logger.warn('PRC not found for request', { requestId: request._id, prcId: request.prcId._id });
                    }
                }
            }

            // Sort combined list
            prcs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            logger.info('Final PRC count for citizen', { count: prcs.length });
        } else {
            // Issuers/admins see PRCs they generated
            prcs = await PRC.find({ generatedBy: req.user._id })
                .sort({ createdAt: -1 })
                .populate('certificateId', 'name');
        }

        logger.info('PRC history fetched', {
            userId: req.user._id,
            role: req.user.role,
            count: prcs.length
        });

        res.render('prc/history', {
            title: title,
            user: req.user,
            prcs: prcs
        });

    } catch (error) {
        logger.error('Error fetching PRC history', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Failed to load PRC history',
            user: req.user
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
        // Allow access if: admin, generated by user, or citizen owns the PRC
        let hasAccess = false;
        if (req.user.role === 'admin') {
            hasAccess = true;
        } else if (prc.generatedBy._id.toString() === req.user._id.toString()) {
            hasAccess = true;
        } else if (prc.citizenId && prc.citizenId.toString() === req.user._id.toString()) {
            // Citizen owns this PRC via citizenId
            hasAccess = true;
        } else if (req.user.role === 'citizen' || req.user.role === 'user') {
            // Check if PRC is linked through an approved request
            const PRCRequest = require('../models/PRCRequest');
            const request = await PRCRequest.findOne({
                citizenId: req.user._id,
                prcId: prc._id,
                status: 'approved'
            });
            if (request) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
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
        // Allow access if: admin, generated by user, or citizen owns the PRC
        let hasAccess = false;
        if (req.user.role === 'admin') {
            hasAccess = true;
        } else if (prc.generatedBy.toString() === req.user._id.toString()) {
            hasAccess = true;
        } else if (prc.citizenId && prc.citizenId.toString() === req.user._id.toString()) {
            // Citizen owns this PRC via citizenId
            hasAccess = true;
        } else if (req.user.role === 'citizen' || req.user.role === 'user') {
            // Check if PRC is linked through an approved request
            const PRCRequest = require('../models/PRCRequest');
            const request = await PRCRequest.findOne({
                citizenId: req.user._id,
                prcId: prc._id,
                status: 'approved'
            });
            if (request) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
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

// Send PRC via email
router.post('/:id/send-email', isAuthenticated, [
    body('email')
        .isEmail()
        .withMessage('Valid email address is required')
        .normalizeEmail()
], async (req, res) => {
    logEntry('POST /:id/send-email', {
        userId: req.user._id,
        username: req.user.username,
        prcId: req.params.id,
        recipientEmail: req.body.email
    }, logger);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Email validation failed', {
                errors: errors.array(),
                prcId: req.params.id
            });
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { email: recipientEmail } = req.body;

        // Find PRC
        const prc = await PRC.findById(req.params.id);

        if (!prc) {
            logger.warn('PRC not found for email sending', { prcId: req.params.id });
            return res.status(404).json({
                success: false,
                error: 'PRC not found'
            });
        }

        // Check permissions - same as download route
        let hasAccess = false;
        if (req.user.role === 'admin') {
            hasAccess = true;
        } else if (prc.generatedBy.toString() === req.user._id.toString()) {
            hasAccess = true;
        } else if (prc.citizenId && prc.citizenId.toString() === req.user._id.toString()) {
            hasAccess = true;
        } else if (req.user.role === 'citizen' || req.user.role === 'user') {
            const PRCRequest = require('../models/PRCRequest');
            const request = await PRCRequest.findOne({
                citizenId: req.user._id,
                prcId: prc._id,
                status: 'approved'
            });
            if (request) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            logger.warn('Access denied for PRC email sending', {
                userId: req.user._id,
                prcId: req.params.id
            });
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Check if PRC is active
        if (prc.status === 'revoked') {
            logger.warn('Attempt to email revoked PRC', { prcId: req.params.id });
            return res.status(400).json({
                success: false,
                error: 'Cannot send revoked PRC'
            });
        }

        logger.info('Sending PRC via email', {
            prcId: prc._id,
            recipient: recipientEmail,
            senderId: req.user._id
        });

        // Send email using EmailService
        const emailResult = await EmailService.sendPRC(recipientEmail, prc);

        if (emailResult.success) {
            // Update PRC with email sent info
            prc.emailSent = true;
            prc.emailSentAt = new Date();
            prc.emailRecipient = recipientEmail;
            await prc.save();

            logger.info('PRC email sent successfully', {
                prcId: prc._id,
                messageId: emailResult.messageId,
                recipient: recipientEmail
            });

            console.log('✅ PRC email sent:', {
                prcId: prc._id,
                recipient: recipientEmail,
                messageId: emailResult.messageId
            });

            return res.json({
                success: true,
                message: 'Email sent successfully',
                messageId: emailResult.messageId
            });
        } else {
            throw new Error('Email sending failed');
        }

    } catch (error) {
        logger.error('PRC email sending error', {
            error: error.message,
            stack: error.stack,
            prcId: req.params.id,
            userId: req.user._id
        });

        console.error('❌ PRC email sending failed:', error);

        return res.status(500).json({
            success: false,
            error: `Failed to send email: ${error.message}`
        });
    }
});

// Approve PRC Request
router.post('/requests/:id/approve', isAuthenticated, async (req, res) => {
    try {
        const PRCRequest = require('../models/PRCRequest');
        const prcRequest = await PRCRequest.findById(req.params.id)
            .populate('citizenId', 'firstName lastName email')
            .populate('ehicId')
            .populate('institutionId');

        if (!prcRequest) {
            return res.status(404).json({ success: false, error: 'PRC request not found' });
        }

        // Verify issuer has permission
        if (req.user.role !== 'issuer') {
            return res.status(403).json({ success: false, error: 'Only issuers can approve PRC requests' });
        }

        if (prcRequest.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'PRC request is not pending' });
        }

        // Approve the request
        await prcRequest.approve(req.user._id);

        // Generate the actual PRC document
        const JWTService = require('../services/jwtService');
        const QRCodeService = require('../services/qrCodeService');
        const PDFService = require('../services/pdfService');
        const Certificate = require('../models/Certificate');
        const { v4: uuidv4 } = require('uuid');

        // Get an active certificate for the issuer's institution
        logger.info('Searching for active certificate', {
            country: prcRequest.ehicId.cardIssuerCountry,
            institutionId: prcRequest.institutionId.institutionId
        });

        // First, let's see ALL certificates for this institution
        const allCerts = await Certificate.find({
            'issuer.country': prcRequest.ehicId.cardIssuerCountry,
            'issuer.institutionId': prcRequest.institutionId.institutionId
        });

        logger.info('All certificates found for institution', {
            country: prcRequest.ehicId.cardIssuerCountry,
            institutionId: prcRequest.institutionId.institutionId,
            institutionName: prcRequest.institutionId.name,
            count: allCerts.length,
            certificates: allCerts.map(c => ({
                id: c._id,
                name: c.name,
                isActive: c.isActive,
                issuerCountry: c.issuer.country,
                issuerInstitutionId: c.issuer.institutionId
            }))
        });

        const certificate = await Certificate.findOne({
            'issuer.country': prcRequest.ehicId.cardIssuerCountry,
            'issuer.institutionId': prcRequest.institutionId.institutionId,
            isActive: true
        }).sort({ createdAt: -1 });

        if (!certificate) {
            logger.error('No active certificate found for PRC generation', {
                country: prcRequest.ehicId.cardIssuerCountry,
                institutionId: prcRequest.institutionId.institutionId,
                institutionName: prcRequest.institutionId.name,
                totalCertsForInstitution: allCerts.length,
                activeCertsForInstitution: allCerts.filter(c => c.isActive).length
            });
            return res.status(500).json({
                success: false,
                error: 'No active certificate available for signing. Please ensure your institution has an active certificate.'
            });
        }

        logger.info('Active certificate found', {
            certificateId: certificate._id,
            name: certificate.name,
            institution: certificate.issuer.institutionName
        });

        // Prepare JWT payload according to eEHIC PRC schema
        const jti = uuidv4();

        // Build the prc object with all required fields
        const prcObject = {
            ic: prcRequest.prcData.ic,
            fn: prcRequest.prcData.fn,
            gn: prcRequest.prcData.gn,
            dob: prcRequest.prcData.dob,
            hi: prcRequest.prcData.hi,
            in: prcRequest.prcData.in,
            ii: prcRequest.prcData.ii,
            sd: prcRequest.prcData.sd,
            ed: prcRequest.prcData.ed,
            di: prcRequest.prcData.di
        };

        // Add optional fields to prc object
        if (prcRequest.prcData.ci) {
            prcObject.ci = prcRequest.prcData.ci;
        }
        if (prcRequest.prcData.xd) {
            prcObject.xd = prcRequest.prcData.xd;
        }

        // Create payload with prc nested object
        const payload = {
            jti: jti,
            sid: 'eessi:prc:1.0',
            prc: prcObject
        };

        logger.info('JWT payload prepared', {
            jti,
            sid: payload.sid,
            prcFields: Object.keys(prcObject)
        });

        // Generate JWT
        const jwt = await JWTService.generateJWT(payload, certificate);

        // Generate QR Code
        const qrCodeData = await QRCodeService.generateQRCode(jwt);
        const qrCodeImage = await QRCodeService.generateQRCodeImage(qrCodeData);

        // Generate PDF
        const pdfBuffer = await PDFService.generatePDF(prcRequest.prcData, qrCodeData);

        // Create PRC document
        const prcData = {
            jti: jti,
            sid: 'eessi:prc:1.0',
            prcData: {
                ic: prcRequest.prcData.ic,
                fn: prcRequest.prcData.fn,
                gn: prcRequest.prcData.gn,
                dob: prcRequest.prcData.dob,
                hi: prcRequest.prcData.hi,
                in: prcRequest.prcData.in,
                ii: prcRequest.prcData.ii,
                ci: prcRequest.prcData.ci || undefined,
                xd: prcRequest.prcData.xd ? new Date(prcRequest.prcData.xd) : undefined,
                sd: new Date(prcRequest.prcData.sd),
                ed: new Date(prcRequest.prcData.ed),
                di: new Date(prcRequest.prcData.di)
            },
            jwt: jwt,
            qrCodeData: qrCodeData,
            qrCodeImage: qrCodeImage,
            pdfBuffer: pdfBuffer,
            certificateId: certificate._id,
            generatedBy: req.user._id,
            citizenId: prcRequest.citizenId._id,
            status: 'generated'
        };

        const prc = new PRC(prcData);
        await prc.save();

        // Link PRC to the request
        prcRequest.prcId = prc._id;
        await prcRequest.save();

        // Increment certificate usage
        await certificate.incrementUsage();

        logger.info('PRC request approved and PRC generated', {
            requestId: prcRequest._id,
            prcId: prc._id,
            reviewerId: req.user._id,
            citizenId: prcRequest.citizenId._id
        });

        return res.json({
            success: true,
            message: 'PRC request approved and PRC generated successfully',
            prcId: prc._id
        });

    } catch (error) {
        logger.error('Error approving PRC request', { error: error.message, stack: error.stack });
        return res.status(500).json({ success: false, error: 'Failed to approve PRC request' });
    }
});

// Reject PRC Request
router.post('/requests/:id/reject', isAuthenticated, async (req, res) => {
    try {
        const PRCRequest = require('../models/PRCRequest');
        const { notes } = req.body;

        if (!notes || notes.length < 10) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required (minimum 10 characters)' });
        }

        const prcRequest = await PRCRequest.findById(req.params.id)
            .populate('citizenId', 'firstName lastName email');

        if (!prcRequest) {
            return res.status(404).json({ success: false, error: 'PRC request not found' });
        }

        // Verify issuer has permission
        if (req.user.role !== 'issuer') {
            return res.status(403).json({ success: false, error: 'Only issuers can reject PRC requests' });
        }

        if (prcRequest.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'PRC request is not pending' });
        }

        // Reject the request
        await prcRequest.reject(req.user._id, notes);

        logger.info('PRC request rejected', {
            requestId: prcRequest._id,
            reviewerId: req.user._id,
            citizenId: prcRequest.citizenId._id,
            notes
        });

        return res.json({
            success: true,
            message: 'PRC request rejected'
        });

    } catch (error) {
        logger.error('Error rejecting PRC request', { error: error.message, stack: error.stack });
        return res.status(500).json({ success: false, error: 'Failed to reject PRC request' });
    }
});

module.exports = router;
