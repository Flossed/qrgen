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
            title: 'Access Denied',
            error: {
                status: 403,
                message: 'You do not have permission to access this resource.'
            },
            user: req.user
        });
    }
};

// Middleware to check if user can manage certificates (issuers and admins)
const canManageCertificates = (req, res, next) => {
    if (req.user && (req.user.role === 'issuer' || req.user.role === 'admin')) {
        return next();
    } else {
        return res.status(403).render('errorPage', {
            title: 'Access Denied',
            error: {
                status: 403,
                message: 'You do not have permission to manage certificates.'
            },
            user: req.user
        });
    }
};

// Middleware to block admin users from PRC routes (Domain Owner should not generate PRCs)
const blockAdminFromPRC = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        logger.warn('Domain Owner attempted to access PRC route', {
            userId: req.user._id,
            route: req.originalUrl
        });
        return res.status(403).render('errorPage', {
            title: 'Access Denied',
            error: {
                status: 403,
                message: 'Domain Owners cannot generate or request PRCs. Your role is to manage healthcare institutions.'
            },
            user: req.user
        });
    }
    return next();
};

// Middleware to require issuer role
const isIssuer = (req, res, next) => {
    if (req.user && req.user.role === 'issuer') {
        return next();
    } else {
        logger.warn('Non-issuer attempted to access issuer-only route', {
            userId: req.user?._id,
            role: req.user?.role,
            route: req.originalUrl
        });
        return res.status(403).render('errorPage', {
            title: 'Access Denied',
            error: {
                status: 403,
                message: 'This resource is only available to issuers.'
            },
            user: req.user
        });
    }
};

// Middleware to require system admin role (Domain Owner)
const isSystemAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    } else {
        logger.warn('Non-admin attempted to access admin-only route', {
            userId: req.user?._id,
            role: req.user?.role,
            route: req.originalUrl
        });
        return res.status(403).render('errorPage', {
            title: 'Access Denied',
            error: {
                status: 403,
                message: 'This resource is only available to Domain Owners (System Administrators).'
            },
            user: req.user
        });
    }
};

module.exports = {
    loadUser,
    isAuthenticated,
    isAdmin,
    canManageCertificates,
    blockAdminFromPRC,
    isIssuer,
    isSystemAdmin
};