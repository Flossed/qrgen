const { getLogger } = require('../config/logger');
const logger = getLogger('OnboardingMiddleware');

/**
 * Middleware to check if user has completed onboarding
 * Only applies to regular users (not issuers or admins)
 * Blocks access to PRC creation if onboarding is incomplete
 */
const checkOnboardingComplete = (req, res, next) => {
    // Skip check for issuers and admins
    if (!req.user || req.user.role === 'issuer' || req.user.role === 'admin') {
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

module.exports = {
    checkOnboardingComplete
};
