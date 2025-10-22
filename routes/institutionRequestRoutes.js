const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const HealthcareInstitution = require('../models/HealthcareInstitution');
const InstitutionRequest = require('../models/InstitutionRequest');
const User = require('../models/User');
const { getLogger } = require('../config/logger');
const logger = getLogger('InstitutionRequestRoutes');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check if user is an issuer
const isIssuer = (req, res, next) => {
    if (req.user && req.user.role === 'issuer') {
        return next();
    }
    req.session.error = 'Only issuers can access this page';
    res.redirect('/prc/dashboard');
};

// Middleware to check if user is system admin
const isSystemAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    req.session.error = 'Only system administrators can access this page';
    res.redirect('/prc/dashboard');
};

// GET - Institution selection page (join or create)
router.get('/choose', isAuthenticated, isIssuer, async (req, res) => {
    try {
        // Check if user already has pending requests
        const pendingRequests = await InstitutionRequest.findPendingByUser(req.user._id);

        // Check if user is already assigned to an institution
        const userInstitutions = await HealthcareInstitution.findByAdministrator(req.user._id);

        res.render('institution/choose', {
            title: 'Institution Registration',
            user: req.user,
            pendingRequests: pendingRequests,
            userInstitutions: userInstitutions,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (error) {
        logger.error('Institution choose error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load institution selection',
            user: req.user
        });
    }
});

// GET - Join existing institution page
router.get('/join', isAuthenticated, isIssuer, async (req, res) => {
    try {
        // Get all active institutions
        const institutions = await HealthcareInstitution.find({ isActive: true })
            .sort({ country: 1, name: 1 });

        res.render('institution/join', {
            title: 'Join Existing Institution',
            user: req.user,
            institutions: institutions,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (error) {
        logger.error('Institution join page error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load institutions',
            user: req.user
        });
    }
});

// POST - Submit join request
router.post('/join', [
    body('institutionId')
        .isMongoId()
        .withMessage('Invalid institution selected'),
    body('justification')
        .isLength({ min: 10, max: 500 })
        .withMessage('Justification must be between 10 and 500 characters')
        .trim()
], isAuthenticated, isIssuer, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution-request/join');
        }

        // Check if institution exists
        const institution = await HealthcareInstitution.findById(req.body.institutionId);
        if (!institution || !institution.isActive) {
            req.session.error = 'Selected institution is not available';
            return res.redirect('/institution-request/join');
        }

        // Check if user already has a pending request for this institution
        const existingRequest = await InstitutionRequest.findOne({
            requestedBy: req.user._id,
            institutionId: req.body.institutionId,
            status: 'pending'
        });

        if (existingRequest) {
            req.session.error = 'You already have a pending request for this institution';
            return res.redirect('/institution-request/choose');
        }

        // Create join request
        const request = new InstitutionRequest({
            requestType: 'join',
            requestedBy: req.user._id,
            institutionId: req.body.institutionId,
            justification: req.body.justification
        });

        await request.save();

        logger.debug('Join request created', {
            requestId: request._id,
            userId: req.user._id,
            institutionId: institution._id
        });

        // TODO: Send email notification to institution administrators

        req.session.success = `Join request sent to ${institution.name}. An institution administrator will review your request.`;
        res.redirect('/institution-request/choose');

    } catch (error) {
        logger.error('Join request error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while submitting your request';
        res.redirect('/institution-request/join');
    }
});

// GET - Create new institution page
router.get('/create', isAuthenticated, isIssuer, (req, res) => {
    res.render('institution/create', {
        title: 'Create New Institution',
        user: req.user,
        error: req.session.error,
        success: req.session.success
    });
    delete req.session.error;
    delete req.session.success;
});

// POST - Submit create institution request
router.post('/create', [
    body('institutionName')
        .isLength({ min: 3, max: 21 })
        .withMessage('Institution name must be between 3 and 21 characters (eEHIC schema requirement)')
        .trim(),
    body('institutionCountry')
        .isIn(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'])
        .withMessage('Please select a valid country'),
    body('institutionAddress')
        .optional()
        .isLength({ max: 200 })
        .withMessage('Address must be less than 200 characters')
        .trim(),
    body('institutionContact')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Contact must be less than 100 characters')
        .trim(),
    body('justification')
        .isLength({ min: 20, max: 500 })
        .withMessage('Justification must be between 20 and 500 characters')
        .trim()
], isAuthenticated, isIssuer, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution-request/create');
        }

        // Check if user already has a pending creation request
        const existingRequest = await InstitutionRequest.findOne({
            requestedBy: req.user._id,
            requestType: 'create',
            status: 'pending'
        });

        if (existingRequest) {
            req.session.error = 'You already have a pending institution creation request';
            return res.redirect('/institution-request/choose');
        }

        // Create request
        const request = new InstitutionRequest({
            requestType: 'create',
            requestedBy: req.user._id,
            institutionName: req.body.institutionName,
            institutionCountry: req.body.institutionCountry,
            institutionAddress: req.body.institutionAddress || '',
            institutionContact: req.body.institutionContact || '',
            justification: req.body.justification
        });

        await request.save();

        logger.debug('Institution creation request created', {
            requestId: request._id,
            userId: req.user._id,
            institutionName: req.body.institutionName
        });

        // TODO: Send email notification to system administrators

        req.session.success = 'Institution creation request submitted. A system administrator will review your request.';
        res.redirect('/institution-request/choose');

    } catch (error) {
        logger.error('Create institution request error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while submitting your request';
        res.redirect('/institution-request/create');
    }
});

// GET - My pending requests
router.get('/my-requests', isAuthenticated, isIssuer, async (req, res) => {
    try {
        const requests = await InstitutionRequest.find({ requestedBy: req.user._id })
            .populate('institutionId', 'name country')
            .populate('reviewedBy', 'email firstName lastName')
            .sort({ createdAt: -1 });

        res.render('institution/my-requests', {
            title: 'My Institution Requests',
            user: req.user,
            requests: requests
        });
    } catch (error) {
        logger.error('My requests error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load your requests',
            user: req.user
        });
    }
});

// GET - Institution admin: pending join requests
router.get('/pending-joins', isAuthenticated, isIssuer, async (req, res) => {
    try {
        // Get institutions where user is admin
        const institutions = await HealthcareInstitution.findByAdministrator(req.user._id);

        if (institutions.length === 0) {
            req.session.error = 'You are not an administrator of any institution';
            return res.redirect('/prc/dashboard');
        }

        // Get all pending join requests for these institutions
        const institutionIds = institutions.map(i => i._id);
        const requests = await InstitutionRequest.find({
            institutionId: { $in: institutionIds },
            requestType: 'join',
            status: 'pending'
        })
        .populate('requestedBy', 'email firstName lastName')
        .populate('institutionId', 'name country')
        .sort({ createdAt: -1 });

        res.render('institution/pending-joins', {
            title: 'Pending Join Requests',
            user: req.user,
            requests: requests,
            institutions: institutions
        });
    } catch (error) {
        logger.error('Pending joins error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load pending requests',
            user: req.user
        });
    }
});

// POST - Approve join request (institution admin)
router.post('/approve-join/:requestId', isAuthenticated, isIssuer, async (req, res) => {
    try {
        const request = await InstitutionRequest.findById(req.params.requestId)
            .populate('institutionId')
            .populate('requestedBy');

        if (!request || request.requestType !== 'join') {
            req.session.error = 'Request not found';
            return res.redirect('/institution-request/pending-joins');
        }

        // Check if user is admin of this institution
        if (!request.institutionId.isAdministrator(req.user._id)) {
            req.session.error = 'You are not authorized to approve this request';
            return res.redirect('/institution-request/pending-joins');
        }

        // Approve request
        request.status = 'approved';
        request.reviewedBy = req.user._id;
        request.reviewedAt = Date.now();
        request.reviewNotes = req.body.notes || '';
        await request.save();

        // Add user to institution administrators
        await request.institutionId.addAdministrator(request.requestedBy._id);

        // Update user's institution fields
        const user = await User.findById(request.requestedBy._id);
        user.country = request.institutionId.country;
        user.institutionId = request.institutionId.institutionId;
        user.organization = request.institutionId.name;
        await user.save();

        logger.debug('Join request approved', {
            requestId: request._id,
            approvedBy: req.user._id,
            userId: request.requestedBy._id,
            institutionId: request.institutionId._id
        });

        // TODO: Send email notification to requester

        req.session.success = `Approved ${request.requestedBy.email} to join ${request.institutionId.name}`;
        res.redirect('/institution-request/pending-joins');

    } catch (error) {
        logger.error('Approve join error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while approving the request';
        res.redirect('/institution-request/pending-joins');
    }
});

// POST - Reject join request (institution admin)
router.post('/reject-join/:requestId', [
    body('notes')
        .isLength({ min: 10, max: 500 })
        .withMessage('Rejection reason must be between 10 and 500 characters')
        .trim()
], isAuthenticated, isIssuer, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution-request/pending-joins');
        }

        const request = await InstitutionRequest.findById(req.params.requestId)
            .populate('institutionId')
            .populate('requestedBy');

        if (!request || request.requestType !== 'join') {
            req.session.error = 'Request not found';
            return res.redirect('/institution-request/pending-joins');
        }

        // Check if user is admin of this institution
        if (!request.institutionId.isAdministrator(req.user._id)) {
            req.session.error = 'You are not authorized to reject this request';
            return res.redirect('/institution-request/pending-joins');
        }

        // Reject request
        request.status = 'rejected';
        request.reviewedBy = req.user._id;
        request.reviewedAt = Date.now();
        request.reviewNotes = req.body.notes;
        await request.save();

        logger.debug('Join request rejected', {
            requestId: request._id,
            rejectedBy: req.user._id,
            userId: request.requestedBy._id
        });

        // TODO: Send email notification to requester

        req.session.success = `Rejected join request from ${request.requestedBy.email}`;
        res.redirect('/institution-request/pending-joins');

    } catch (error) {
        logger.error('Reject join error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while rejecting the request';
        res.redirect('/institution-request/pending-joins');
    }
});

// GET - System admin: pending creation requests
router.get('/pending-creations', isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        const requests = await InstitutionRequest.findPendingCreationRequests();

        res.render('institution/pending-creations', {
            title: 'Pending Institution Creation Requests',
            user: req.user,
            requests: requests
        });
    } catch (error) {
        logger.error('Pending creations error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load pending creation requests',
            user: req.user
        });
    }
});

// Helper function to generate unique Institution ID
async function generateUniqueInstitutionId() {
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
        // Generate random ID between 4-10 digits
        // Start with 6 digits as a good middle ground
        const length = Math.floor(Math.random() * 7) + 4; // 4 to 10
        let institutionId = '';

        // First digit should not be 0
        institutionId += Math.floor(Math.random() * 9) + 1;

        // Remaining digits
        for (let i = 1; i < length; i++) {
            institutionId += Math.floor(Math.random() * 10);
        }

        // Check if ID already exists
        const existing = await HealthcareInstitution.findOne({ institutionId });
        if (!existing) {
            return institutionId;
        }

        attempts++;
    }

    // If we couldn't generate a unique ID after max attempts, use timestamp-based approach
    const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    return timestamp;
}

// POST - Approve creation request (system admin)
router.post('/approve-creation/:requestId', [
    body('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes must not exceed 500 characters')
        .trim()
], isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution-request/pending-creations');
        }

        const request = await InstitutionRequest.findById(req.params.requestId)
            .populate('requestedBy');

        if (!request || request.requestType !== 'create') {
            req.session.error = 'Request not found';
            return res.redirect('/institution-request/pending-creations');
        }

        // Generate unique Institution ID automatically
        const generatedInstitutionId = await generateUniqueInstitutionId();

        logger.debug('Generated Institution ID', {
            requestId: request._id,
            institutionId: generatedInstitutionId
        });

        // Create the institution
        const institution = new HealthcareInstitution({
            name: request.institutionName,
            country: request.institutionCountry,
            institutionId: generatedInstitutionId,
            address: request.institutionAddress || '',
            contactEmail: request.requestedBy.email,
            administrators: [request.requestedBy._id],
            createdBy: req.user._id
        });

        await institution.save();

        // Update request
        request.status = 'approved';
        request.reviewedBy = req.user._id;
        request.reviewedAt = Date.now();
        request.reviewNotes = req.body.notes || '';
        request.createdInstitutionId = institution._id;
        request.generatedInstitutionId = institution.institutionId;
        await request.save();

        // Update user's fields
        const user = await User.findById(request.requestedBy._id);
        user.country = institution.country;
        user.institutionId = institution.institutionId;
        user.organization = institution.name;
        await user.save();

        logger.debug('Institution creation request approved', {
            requestId: request._id,
            approvedBy: req.user._id,
            institutionId: institution._id,
            userId: request.requestedBy._id
        });

        // TODO: Send email notification to requester

        req.session.success = `Institution "${institution.name}" created successfully with ID ${institution.institutionId}. ${request.requestedBy.email} assigned as administrator.`;
        res.redirect('/institution-request/pending-creations');

    } catch (error) {
        logger.error('Approve creation error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while approving the request';
        res.redirect('/institution-request/pending-creations');
    }
});

// POST - Reject creation request (system admin)
router.post('/reject-creation/:requestId', [
    body('notes')
        .isLength({ min: 10, max: 500 })
        .withMessage('Rejection reason must be between 10 and 500 characters')
        .trim()
], isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution-request/pending-creations');
        }

        const request = await InstitutionRequest.findById(req.params.requestId)
            .populate('requestedBy');

        if (!request || request.requestType !== 'create') {
            req.session.error = 'Request not found';
            return res.redirect('/institution-request/pending-creations');
        }

        // Reject request
        request.status = 'rejected';
        request.reviewedBy = req.user._id;
        request.reviewedAt = Date.now();
        request.reviewNotes = req.body.notes;
        await request.save();

        logger.debug('Institution creation request rejected', {
            requestId: request._id,
            rejectedBy: req.user._id,
            userId: request.requestedBy._id
        });

        // TODO: Send email notification to requester

        req.session.success = `Rejected institution creation request for "${request.institutionName}" from ${request.requestedBy.email}`;
        res.redirect('/institution-request/pending-creations');

    } catch (error) {
        logger.error('Reject creation error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while rejecting the request';
        res.redirect('/institution-request/pending-creations');
    }
});

module.exports = router;
