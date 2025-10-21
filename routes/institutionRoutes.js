const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const HealthcareInstitution = require('../models/HealthcareInstitution');
const User = require('../models/User');
const { getLogger } = require('../config/logger');
const logger = getLogger('InstitutionRoutes');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/auth/login');
};

// GET - List healthcare institutions for selection
router.get('/list', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/auth/login');
        }

        // User must have completed profile first
        if (!user.profileCompleted) {
            req.session.error = 'Please complete your profile first before selecting a healthcare institution';
            return res.redirect('/auth/profile');
        }

        // Get institutions for user's country of residence
        const institutions = await HealthcareInstitution.findByCountry(user.countryOfResidence);

        res.render('institution/list', {
            title: 'Select Healthcare Institution',
            user: user,
            institutions: institutions,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (error) {
        logger.error('Institution list error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load institutions',
            user: req.user
        });
    }
});

// POST - Select a healthcare institution
router.post('/select', [
    body('institutionId')
        .isMongoId()
        .withMessage('Invalid institution selected')
], isAuthenticated, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.session.error = errors.array()[0].msg;
            return res.redirect('/institution/list');
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/auth/login');
        }

        // Check if user already has an institution
        if (user.assignedInstitution && user.institutionRegistered) {
            req.session.error = 'You are already registered with a healthcare institution. Please cancel your current registration first.';
            return res.redirect('/prc/dashboard');
        }

        const institution = await HealthcareInstitution.findById(req.body.institutionId);
        if (!institution || !institution.isActive) {
            req.session.error = 'Selected institution is not available';
            return res.redirect('/institution/list');
        }

        // Verify institution is in user's country
        if (institution.country !== user.countryOfResidence) {
            req.session.error = 'Selected institution is not in your country of residence';
            return res.redirect('/institution/list');
        }

        // Generate personal ID
        const personalId = await institution.generatePersonalId(user.countryOfResidence);

        // Update user
        user.assignedInstitution = institution._id;
        user.personalIdNumber = personalId;
        user.institutionRegistered = true;
        user.updatedAt = Date.now();
        await user.save();

        logger.debug('User registered with institution', {
            userId: user._id,
            institutionId: institution._id,
            personalId: personalId
        });

        req.session.success = `Successfully registered with ${institution.name}. Your Personal ID: ${personalId}`;
        res.redirect('/prc/dashboard');

    } catch (error) {
        logger.error('Institution selection error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while registering with the institution';
        res.redirect('/institution/list');
    }
});

// POST - Cancel institution registration
router.post('/cancel', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/auth/login');
        }

        if (!user.assignedInstitution) {
            req.session.error = 'You are not registered with any healthcare institution';
            return res.redirect('/prc/dashboard');
        }

        // Clear institution assignment
        user.assignedInstitution = null;
        user.personalIdNumber = null;
        user.institutionRegistered = false;
        user.updatedAt = Date.now();
        await user.save();

        logger.debug('User cancelled institution registration', {
            userId: user._id
        });

        req.session.success = 'Healthcare institution registration cancelled successfully';
        res.redirect('/prc/dashboard');

    } catch (error) {
        logger.error('Institution cancellation error', { error: error.message, stack: error.stack });
        req.session.error = 'An error occurred while cancelling registration';
        res.redirect('/prc/dashboard');
    }
});

module.exports = router;
