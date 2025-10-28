const { getLogger } = require('../config/logger');
const logger = getLogger('OnboardingMiddleware');

/**
 * Middleware to check if user has completed onboarding
 * For citizens: checks profile and institution registration
 * For issuers: checks are handled separately
 * Blocks access to PRC creation if onboarding is incomplete
 */
const checkOnboardingComplete = (req, res, next) => {
    // Skip check for admins
    if (!req.user || req.user.role === 'admin') {
        return next();
    }

    // Skip check for issuers (they have separate onboarding)
    if (req.user.role === 'issuer') {
        return next();
    }

    // Check if profile is completed
    if (!req.user.profileCompleted) {
        logger.warn('PRC creation blocked: profile incomplete', {
            userId: req.user._id,
            email: req.user.email
        });
        req.session.error = 'Please complete your profile before requesting a PRC. Go to Profile and fill in all required fields (First Name, Last Name, Date of Birth, Country of Residence).';
        return res.redirect('/prc/dashboard');
    }

    // Check if institution is registered
    if (!req.user.institutionRegistered || !req.user.assignedInstitution) {
        logger.warn('PRC creation blocked: institution not registered', {
            userId: req.user._id,
            email: req.user.email
        });
        req.session.error = 'Please register with a healthcare institution before requesting a PRC.';
        return res.redirect('/prc/dashboard');
    }

    // Onboarding complete
    logger.debug('Onboarding check passed', {
        userId: req.user._id,
        personalId: req.user.personalIdNumber
    });
    next();
};

/**
 * Middleware to check if issuer has completed onboarding
 * Blocks access to PRC approval if onboarding is incomplete
 * Steps: 1) Institution setup, 2) Profile completion, 3) Certificate creation
 */
const checkIssuerOnboarding = (req, res, next) => {
    // Only apply to issuers
    if (!req.user || req.user.role !== 'issuer') {
        return next();
    }

    // Check if institution is set up (created or joined) - STEP 1
    if (!req.user.institutionSetupCompleted || !req.user.country || !req.user.institutionId) {
        logger.warn('Issuer action blocked: institution not set up', {
            userId: req.user._id,
            email: req.user.email
        });
        req.session.error = 'Please complete institution setup before managing PRCs. You need to create or join an institution first.';
        return res.redirect('/prc/dashboard');
    }

    // Check if profile is completed - STEP 2
    if (!req.user.profileCompleted) {
        logger.warn('Issuer action blocked: profile incomplete', {
            userId: req.user._id,
            email: req.user.email
        });
        req.session.error = 'Please complete your profile before managing PRCs. Go to Profile and fill in all required fields including institution establishment date.';
        return res.redirect('/prc/dashboard');
    }

    // Check if certificate is created - STEP 3
    if (!req.user.certificateCreated) {
        logger.warn('Issuer action blocked: certificate not created', {
            userId: req.user._id,
            email: req.user.email
        });
        req.session.error = 'Please create a signing certificate before managing PRCs. Go to Certificates to create one.';
        return res.redirect('/prc/dashboard');
    }

    // Onboarding complete
    logger.debug('Issuer onboarding check passed', {
        userId: req.user._id,
        institutionId: req.user.institutionId
    });
    next();
};

module.exports = {
    checkOnboardingComplete,
    checkIssuerOnboarding
};
