const express = require('express');
const router = express.Router();
const { isAuthenticated, isSystemAdmin } = require('../middleware/auth');
const User = require('../models/User');
const HealthcareInstitution = require('../models/HealthcareInstitution');
const InstitutionRequest = require('../models/InstitutionRequest');
const { getLogger } = require('../config/logger');

const logger = getLogger('AdminRoutes');

// GET - Domain Owner Dashboard
router.get('/dashboard', isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        logger.debug('Loading domain owner dashboard', { userId: req.user._id });

        // Get statistics
        const pendingCreations = await InstitutionRequest.countDocuments({
            requestType: 'create',
            status: 'pending'
        });

        const totalInstitutions = await HealthcareInstitution.countDocuments();

        const totalIssuers = await User.countDocuments({ role: 'issuer' });

        // Get recent creation requests (last 5)
        const recentCreationRequests = await InstitutionRequest.find({
            requestType: 'create',
            status: 'pending'
        })
            .populate('requestedBy', 'firstName lastName email')
            .sort({ createdAt: -1 })
            .limit(5);

        // Get recently approved institutions (last 5)
        const recentlyApprovedInstitutions = await HealthcareInstitution.find()
            .sort({ createdAt: -1 })
            .limit(5);

        res.render('admin/dashboard', {
            title: 'Domain Owner Dashboard',
            user: req.user,
            pendingCreations,
            totalInstitutions,
            totalIssuers,
            recentCreationRequests,
            recentlyApprovedInstitutions
        });

    } catch (error) {
        logger.error('Domain owner dashboard error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load dashboard',
            user: req.user
        });
    }
});

// GET - List all institutions
router.get('/institutions', isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        logger.debug('Loading institutions list', { userId: req.user._id });

        const institutions = await HealthcareInstitution.find()
            .populate('administrators', 'firstName lastName email')
            .populate('createdBy', 'firstName lastName email')
            .sort({ createdAt: -1 });

        res.render('admin/institutions', {
            title: 'Manage Institutions',
            user: req.user,
            institutions
        });

    } catch (error) {
        logger.error('Institutions list error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load institutions',
            user: req.user
        });
    }
});

// GET - List all issuers
router.get('/issuers', isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        logger.debug('Loading issuers list', { userId: req.user._id });

        const issuers = await User.find({ role: 'issuer' })
            .sort({ createdAt: -1 });

        res.render('admin/issuers', {
            title: 'Manage Issuers',
            user: req.user,
            issuers
        });

    } catch (error) {
        logger.error('Issuers list error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load issuers',
            user: req.user
        });
    }
});

// GET - Reports
router.get('/reports', isAuthenticated, isSystemAdmin, async (req, res) => {
    try {
        logger.debug('Loading reports', { userId: req.user._id });

        // Gather statistics for reports
        const stats = {
            totalInstitutions: await HealthcareInstitution.countDocuments(),
            totalIssuers: await User.countDocuments({ role: 'issuer' }),
            totalUsers: await User.countDocuments({ role: 'user' }),
            pendingCreationRequests: await InstitutionRequest.countDocuments({
                requestType: 'create',
                status: 'pending'
            }),
            approvedCreationRequests: await InstitutionRequest.countDocuments({
                requestType: 'create',
                status: 'approved'
            }),
            rejectedCreationRequests: await InstitutionRequest.countDocuments({
                requestType: 'create',
                status: 'rejected'
            }),
            pendingJoinRequests: await InstitutionRequest.countDocuments({
                requestType: 'join',
                status: 'pending'
            })
        };

        res.render('admin/reports', {
            title: 'System Reports',
            user: req.user,
            stats
        });

    } catch (error) {
        logger.error('Reports error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load reports',
            user: req.user
        });
    }
});

module.exports = router;
