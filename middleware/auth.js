const User = require('../models/User');
const { getLogger } = require('../config/logger');

const logger = getLogger('AuthMiddleware');

// Middleware to load user from session
const loadUser = async (req, res, next) => {
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            if (user) {
                req.user = user;
                res.locals.user = user;
                res.locals.isAuthenticated = true;
            } else {
                // User not found, clear session
                req.session.destroy();
                res.locals.isAuthenticated = false;
            }
        } catch (error) {
            logger.error('Error loading user', { error: error.message, userId: req.session.userId });
            res.locals.isAuthenticated = false;
        }
    } else {
        res.locals.isAuthenticated = false;
    }
    next();
};

// Middleware to require authentication
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/auth/login');
    }
};

// Middleware to require admin role
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    } else {
        return res.status(403).render('errorPage', {
            error: 'Access Denied',
            message: 'You do not have permission to access this resource.'
        });
    }
};

// Middleware to check if user can manage certificates
const canManageCertificates = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'issuer')) {
        return next();
    } else {
        return res.status(403).render('errorPage', {
            error: 'Access Denied',
            message: 'You do not have permission to manage certificates.'
        });
    }
};

module.exports = {
    loadUser,
    isAuthenticated,
    isAdmin,
    canManageCertificates
};