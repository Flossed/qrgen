const express = require('express');
const router = express.Router();
const EHIC = require('../models/EHIC');
const User = require('../models/User');
const HealthcareInstitution = require('../models/HealthcareInstitution');
const { isAuthenticated, blockAdminFromPRC } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { getLogger } = require('../config/logger');

const logger = getLogger('EHICRoutes');

// Block Domain Owners from EHIC routes
router.use(blockAdminFromPRC);

// ==================== CITIZEN ROUTES ====================

// GET - EHIC Request Form
router.get('/request', isAuthenticated, async (req, res) => {
    try {
        logger.debug('Loading EHIC request form', { userId: req.user._id });

        // Check if user is a citizen
        if (req.user.role !== 'citizen' && req.user.role !== 'user') {
            return res.status(403).render('errorPage', {
                title: 'Access Denied',
                error: {
                    status: 403,
                    message: 'Only citizens can request EHIC cards.'
                },
                user: req.user
            });
        }

        // Check if onboarding is complete
        if (!req.user.profileCompleted || !req.user.institutionRegistered) {
            return res.status(400).render('errorPage', {
                title: 'Onboarding Incomplete',
                error: {
                    status: 400,
                    message: 'Please complete your profile and register with a healthcare institution before requesting an EHIC.'
                },
                user: req.user
            });
        }

        // Check if user already has a pending or active EHIC
        const existingEHIC = await EHIC.findOne({
            citizenId: req.user._id,
            status: { $in: ['pending', 'approved'] },
            isValid: true
        }).populate('institution', 'name institutionId country');

        if (existingEHIC) {
            logger.debug('User already has EHIC', {
                userId: req.user._id,
                ehicStatus: existingEHIC.status
            });
            return res.redirect('/ehic/my-ehic');
        }

        // Get user's assigned institution
        const institution = await HealthcareInstitution.findById(req.user.assignedInstitution);
        if (!institution) {
            return res.status(400).render('errorPage', {
                title: 'Institution Not Found',
                error: {
                    status: 400,
                    message: 'Your assigned healthcare institution could not be found.'
                },
                user: req.user
            });
        }

        res.render('ehic/request', {
            title: 'Request EHIC',
            user: req.user,
            institution
        });

    } catch (error) {
        logger.error('EHIC request form error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: {
                status: 500,
                message: 'Could not load EHIC request form'
            },
            user: req.user
        });
    }
});

// POST - Submit EHIC Request
router.post('/request', isAuthenticated, [
    body('expiryDate')
        .isISO8601()
        .withMessage('Expiry date must be a valid date')
        .custom((value) => {
            const expiryDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (expiryDate < today) {
                throw new Error('Expiry date must be in the future');
            }
            return true;
        })
], async (req, res) => {
    try {
        logger.debug('Processing EHIC request', { userId: req.user._id });

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const institution = await HealthcareInstitution.findById(req.user.assignedInstitution);
            return res.render('ehic/request', {
                title: 'Request EHIC',
                error: errors.array()[0].msg,
                user: req.user,
                institution,
                formData: req.body
            });
        }

        // Get institution
        const institution = await HealthcareInstitution.findById(req.user.assignedInstitution);
        if (!institution) {
            logger.warn('Institution not found for citizen EHIC request', {
                assignedInstitution: req.user.assignedInstitution,
                userId: req.user._id
            });
            return res.status(400).render('errorPage', {
                title: 'Institution Not Found',
                error: {
                    status: 400,
                    message: 'Your assigned healthcare institution could not be found.'
                },
                user: req.user
            });
        }

        logger.debug('Creating EHIC for citizen', {
            citizenId: req.user._id,
            institutionMongoId: institution._id,
            institutionId: institution.institutionId,
            institutionName: institution.name,
            country: institution.country
        });

        // Create EHIC request
        const issuanceDate = new Date();
        const expiryDate = new Date(req.body.expiryDate);

        const ehicData = {
            citizenId: req.user._id,
            institutionId: institution.institutionId,
            institution: institution._id,
            cardIssuerCountry: req.user.countryOfResidence,
            familyName: req.user.lastName,
            givenName: req.user.firstName,
            dateOfBirth: req.user.dateOfBirth,
            personalIdNumber: req.user.personalIdNumber,
            expiryDate: expiryDate,
            issuanceDate: issuanceDate,
            // Entitlement dates will be auto-set in pre-save hook
            entitlementStartDate: issuanceDate,
            entitlementEndDate: expiryDate,
            status: 'pending'
        };

        const ehic = new EHIC(ehicData);
        await ehic.save();

        logger.info('EHIC request submitted', {
            ehicId: ehic._id,
            citizenId: req.user._id,
            institutionMongoId: institution._id,
            institutionId: institution.institutionId,
            status: ehic.status
        });

        res.redirect('/ehic/my-ehic?success=EHIC request submitted successfully. Your institution will review it shortly.');

    } catch (error) {
        logger.error('EHIC request submission error', { error: error.message, stack: error.stack });
        const institution = await HealthcareInstitution.findById(req.user.assignedInstitution);
        res.render('ehic/request', {
            title: 'Request EHIC',
            error: 'An error occurred while submitting your EHIC request. Please try again.',
            user: req.user,
            institution,
            formData: req.body
        });
    }
});

// GET - View My EHIC
router.get('/my-ehic', isAuthenticated, async (req, res) => {
    try {
        logger.debug('Loading citizen EHIC view', { userId: req.user._id });

        // Check if user is a citizen
        if (req.user.role !== 'citizen' && req.user.role !== 'user') {
            return res.status(403).render('errorPage', {
                title: 'Access Denied',
                error: {
                    status: 403,
                    message: 'Only citizens can view EHIC cards.'
                },
                user: req.user
            });
        }

        // Get all EHICs for this citizen
        const ehics = await EHIC.find({ citizenId: req.user._id })
            .populate('institution', 'name institutionId country address')
            .populate('reviewedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        // Get active EHIC
        const activeEHIC = ehics.find(e => e.isActive);

        res.render('ehic/my-ehic', {
            title: 'My EHIC',
            user: req.user,
            ehics,
            activeEHIC,
            success: req.query.success
        });

    } catch (error) {
        logger.error('My EHIC view error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: {
                status: 500,
                message: 'Could not load your EHIC information'
            },
            user: req.user
        });
    }
});

// ==================== ISSUER ROUTES ====================

// GET - Pending EHIC Requests (Issuer)
router.get('/pending', isAuthenticated, async (req, res) => {
    try {
        logger.debug('Loading pending EHIC requests', { userId: req.user._id });

        // Check if user is an issuer
        if (req.user.role !== 'issuer') {
            return res.status(403).render('errorPage', {
                title: 'Access Denied',
                error: {
                    status: 403,
                    message: 'Only issuers can review EHIC requests.'
                },
                user: req.user
            });
        }

        // Get issuer's institution
        logger.debug('Looking up institution for issuer', {
            institutionId: req.user.institutionId,
            country: req.user.country
        });

        const institution = await HealthcareInstitution.findOne({
            institutionId: req.user.institutionId,
            country: req.user.country
        });

        if (!institution) {
            logger.warn('Institution not found for issuer', {
                institutionId: req.user.institutionId,
                country: req.user.country
            });
            return res.status(400).render('errorPage', {
                title: 'Institution Not Found',
                error: {
                    status: 400,
                    message: 'Your institution could not be found.'
                },
                user: req.user
            });
        }

        logger.debug('Institution found', {
            institutionMongoId: institution._id,
            institutionId: institution.institutionId,
            name: institution.name
        });

        // Get pending EHIC requests for this institution
        const pendingRequests = await EHIC.findPendingByInstitution(institution._id);

        logger.debug('Pending EHIC requests loaded', {
            count: pendingRequests.length,
            institutionMongoId: institution._id
        });

        res.render('ehic/pending', {
            title: 'Pending EHIC Requests',
            user: req.user,
            institution,
            requests: pendingRequests
        });

    } catch (error) {
        logger.error('Pending EHIC requests error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: {
                status: 500,
                message: 'Could not load pending EHIC requests'
            },
            user: req.user
        });
    }
});

// POST - Approve EHIC Request
router.post('/approve/:id', isAuthenticated, [
    body('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes must not exceed 500 characters')
        .trim()
], async (req, res) => {
    try {
        logger.debug('Approving EHIC request', { ehicId: req.params.id, issuerId: req.user._id });

        // Check if user is an issuer
        if (req.user.role !== 'issuer') {
            return res.status(403).json({ error: 'Only issuers can approve EHIC requests' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        // Get EHIC request
        const ehic = await EHIC.findById(req.params.id)
            .populate('institution', 'institutionId country')
            .populate('citizenId', 'firstName lastName email');

        if (!ehic) {
            return res.status(404).json({ error: 'EHIC request not found' });
        }

        // Verify issuer belongs to the same institution
        if (ehic.institution.institutionId !== req.user.institutionId ||
            ehic.institution.country !== req.user.country) {
            return res.status(403).json({ error: 'You can only approve EHIC requests for your institution' });
        }

        // Check if already reviewed
        if (ehic.status !== 'pending') {
            return res.status(400).json({ error: `EHIC request has already been ${ehic.status}` });
        }

        // Approve EHIC
        await ehic.approve(req.user._id, req.body.notes);

        logger.info('EHIC request approved', {
            ehicId: ehic._id,
            citizenId: ehic.citizenId._id,
            issuerId: req.user._id
        });

        res.json({
            success: true,
            message: 'EHIC request approved successfully',
            citizenName: `${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
        });

    } catch (error) {
        logger.error('EHIC approval error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'An error occurred while approving the EHIC request' });
    }
});

// POST - Reject EHIC Request
router.post('/reject/:id', isAuthenticated, [
    body('notes')
        .notEmpty()
        .withMessage('Rejection reason is required')
        .isLength({ min: 10, max: 500 })
        .withMessage('Rejection reason must be between 10 and 500 characters')
        .trim()
], async (req, res) => {
    try {
        logger.debug('Rejecting EHIC request', { ehicId: req.params.id, issuerId: req.user._id });

        // Check if user is an issuer
        if (req.user.role !== 'issuer') {
            return res.status(403).json({ error: 'Only issuers can reject EHIC requests' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        // Get EHIC request
        const ehic = await EHIC.findById(req.params.id)
            .populate('institution', 'institutionId country')
            .populate('citizenId', 'firstName lastName email');

        if (!ehic) {
            return res.status(404).json({ error: 'EHIC request not found' });
        }

        // Verify issuer belongs to the same institution
        if (ehic.institution.institutionId !== req.user.institutionId ||
            ehic.institution.country !== req.user.country) {
            return res.status(403).json({ error: 'You can only reject EHIC requests for your institution' });
        }

        // Check if already reviewed
        if (ehic.status !== 'pending') {
            return res.status(400).json({ error: `EHIC request has already been ${ehic.status}` });
        }

        // Reject EHIC
        await ehic.reject(req.user._id, req.body.notes);

        logger.info('EHIC request rejected', {
            ehicId: ehic._id,
            citizenId: ehic.citizenId._id,
            issuerId: req.user._id,
            reason: req.body.notes
        });

        res.json({
            success: true,
            message: 'EHIC request rejected',
            citizenName: `${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
        });

    } catch (error) {
        logger.error('EHIC rejection error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'An error occurred while rejecting the EHIC request' });
    }
});

module.exports = router;
