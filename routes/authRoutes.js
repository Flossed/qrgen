const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const { getLogger, logEntry, logExit, logException } = require('../config/logger');

const logger = getLogger('AuthRoutes');

// Login page
router.get('/login', (req, res) => {
    logEntry('GET /auth/login', { hasSession: !!req.session?.userId }, logger);

    if (req.session && req.session.userId) {
        logger.debug('User already logged in, redirecting to dashboard');
        return res.redirect('/');
    }

    logger.debug('Rendering login page');
    res.render('auth/login', {
        title: 'Login',
        error: req.session.error,
        returnTo: req.session.returnTo
    });
    delete req.session.error;

    logExit('GET /auth/login', null, logger);
});

// Login POST
router.post('/login', [
    body('login').notEmpty().withMessage('Username or email is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    logEntry('POST /auth/login', { login: req.body.login }, logger);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Login validation failed', { errors: errors.array() });
            return res.render('auth/login', {
                title: 'Login',
                error: errors.array()[0].msg,
                login: req.body.login
            });
        }

        const { login, password } = req.body;
        logger.debug('Attempting login', { login });

        // Find user by email or username
        const user = await User.findByLogin(login);
        if (!user) {
            logger.warn('Login failed: user not found', { login });
            return res.render('auth/login', {
                title: 'Login',
                error: 'Invalid credentials',
                login: req.body.login
            });
        }

        logger.debug('User found', { userId: user._id, username: user.username });

        // Check if account is locked
        if (user.isLocked) {
            logger.warn('Login failed: account locked', { userId: user._id });
            return res.render('auth/login', {
                title: 'Login',
                error: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
                login: req.body.login
            });
        }

        // Check if account is active
        if (!user.isActive) {
            logger.warn('Login failed: account inactive', { userId: user._id });
            return res.render('auth/login', {
                title: 'Login',
                error: 'Account is deactivated. Please contact an administrator.',
                login: req.body.login
            });
        }

        // Verify password
        logger.debug('Verifying password');
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            logger.warn('Login failed: invalid password', { userId: user._id });
            await user.incLoginAttempts();
            return res.render('auth/login', {
                title: 'Login',
                error: 'Invalid credentials',
                login: req.body.login
            });
        }

        logger.debug('Login successful', { userId: user._id, username: user.username });

        // Reset login attempts on successful login
        if (user.loginAttempts > 0) {
            await user.resetLoginAttempts();
        }

        // Update last login
        await user.updateLastLogin();

        // Set session
        req.session.userId = user._id;

        // Handle "Remember me" functionality
        if (req.body.rememberMe === 'on' || req.body.rememberMe === true || req.body.rememberMe === 'true') {
            // Set cookie to expire in 30 days
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            logger.debug('Session created with remember me', {
                sessionId: req.sessionID,
                maxAge: '30 days'
            });
        } else {
            // Session expires when browser closes (default behavior)
            req.session.cookie.maxAge = null;
            logger.debug('Session created without remember me', {
                sessionId: req.sessionID,
                maxAge: 'session-only'
            });
        }

        // Redirect to return URL or dashboard
        const redirectTo = req.session.returnTo || '/prc/dashboard';
        delete req.session.returnTo;
        logger.debug('Redirecting after login', { redirectTo });

        logExit('POST /auth/login', { success: true }, logger);
        res.redirect(redirectTo);

    } catch (error) {
        logException('POST /auth/login', error, { login: req.body.login }, logger);
        res.render('auth/login', {
            title: 'Login',
            error: 'An error occurred during login. Please try again.',
            login: req.body.login
        });
    }
});

// Register page
router.get('/register', (req, res) => {
    logEntry('GET /auth/register', { hasSession: !!req.session?.userId }, logger);

    if (req.session && req.session.userId) {
        logger.debug('User already logged in, redirecting');
        return res.redirect('/');
    }

    logger.debug('Rendering register page');
    res.render('auth/register', {
        title: 'Register',
        error: req.session.error
    });
    delete req.session.error;

    logExit('GET /auth/register', null, logger);
});

// Register POST
router.post('/register', [
    body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    body('firstName')
        .isLength({ min: 1, max: 50 })
        .withMessage('First name is required and must be less than 50 characters')
        .trim(),
    body('lastName')
        .isLength({ min: 1, max: 50 })
        .withMessage('Last name is required and must be less than 50 characters')
        .trim(),
    body('organization')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Organization name must be less than 100 characters')
        .trim(),
    body('role')
        .isIn(['user', 'issuer'])
        .withMessage('Invalid role selected')
], async (req, res) => {
    logEntry('POST /auth/register', { username: req.body.username, email: req.body.email, role: req.body.role }, logger);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Registration validation failed', { errors: errors.array() });
            return res.render('auth/register', {
                title: 'Register',
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        const {
            username,
            email,
            password,
            firstName,
            lastName,
            organization,
            role
        } = req.body;

        logger.debug('Registration data validated', { username, email, role });

        // Check if username already exists
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            logger.warn('Registration failed: username exists', { username });
            return res.render('auth/register', {
                title: 'Register',
                error: 'Username already exists',
                formData: req.body
            });
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            logger.warn('Registration failed: email exists', { email });
            return res.render('auth/register', {
                title: 'Register',
                error: 'Email already registered',
                formData: req.body
            });
        }

        // Create new user
        const userData = {
            username,
            email,
            password,
            firstName,
            lastName,
            organization,
            role
        };

        logger.debug('Creating new user', { role });
        const user = new User(userData);
        await user.save();

        logger.debug('User registered successfully', { userId: user._id, username: user.username, role: user.role });

        // Set session
        req.session.userId = user._id;
        logger.debug('Session created', { sessionId: req.sessionID });

        // Redirect to dashboard
        logger.debug('Redirecting to dashboard');
        logExit('POST /auth/register', { success: true }, logger);
        res.redirect('/prc/dashboard');

    } catch (error) {
        logException('POST /auth/register', error, { username: req.body.username, email: req.body.email }, logger);
        res.render('auth/register', {
            title: 'Register',
            error: 'An error occurred during registration. Please try again.',
            formData: req.body
        });
    }
});

// Logout
router.post('/logout', (req, res) => {
    const userId = req.session?.userId;
    logEntry('POST /auth/logout', { userId }, logger);

    req.session.destroy((err) => {
        if (err) {
            logException('POST /auth/logout', err, { userId }, logger);
            logger.error('Session destruction failed', { userId, error: err.message });
        } else {
            logger.debug('User logged out successfully', { userId });
        }

        logger.debug('Redirecting to login page');
        logExit('POST /auth/logout', { success: !err }, logger);
        res.redirect('/auth/login');
    });
});

// Profile page
router.get('/profile', async (req, res) => {
    logEntry('GET /auth/profile', { hasSession: !!req.session?.userId }, logger);

    if (!req.session || !req.session.userId) {
        logger.warn('Profile access denied: no session', { sessionId: req.sessionID });
        return res.redirect('/auth/login');
    }

    try {
        logger.debug('Fetching user profile', { userId: req.session.userId });
        const user = await User.findById(req.session.userId);

        if (!user) {
            logger.warn('Profile access denied: user not found', { userId: req.session.userId });
            return res.redirect('/auth/login');
        }

        logger.debug('Profile loaded successfully', {
            userId: user._id,
            username: user.username,
            role: user.role
        });

        res.render('auth/profile', {
            title: 'Profile',
            user: user,
            success: req.session.success
        });
        delete req.session.success;

        logExit('GET /auth/profile', null, logger);

    } catch (error) {
        logException('GET /auth/profile', error, { userId: req.session.userId }, logger);
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load profile'
        });
    }
});

// Forgot Password page
router.get('/forgot-password', (req, res) => {
    logEntry('GET /auth/forgot-password', {}, logger);

    logger.debug('Rendering forgot password page');
    res.render('auth/forgot-password', {
        title: 'Forgot Password',
        error: req.session.error,
        success: req.session.success
    });
    delete req.session.error;
    delete req.session.success;

    logExit('GET /auth/forgot-password', null, logger);
});

// Forgot Password POST
router.post('/forgot-password', [
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail()
], async (req, res) => {
    logEntry('POST /auth/forgot-password', { email: req.body.email }, logger);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Forgot password validation failed', { errors: errors.array() });
            return res.render('auth/forgot-password', {
                title: 'Forgot Password',
                error: errors.array()[0].msg
            });
        }

        const { email } = req.body;
        logger.debug('Processing forgot password request', { email });

        // For security, don't reveal if email exists or not
        // Just show success message regardless
        const user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            logger.debug('Password reset requested for existing user', {
                userId: user._id,
                email: user.email
            });

            // Generate reset token
            const crypto = require('crypto');
            const resetToken = crypto.randomBytes(32).toString('hex');

            // Hash the token before saving to database
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            // Save hashed token and expiry (1 hour) to user
            user.resetPasswordToken = hashedToken;
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
            await user.save();

            // Send email with unhashed token
            const emailService = require('../services/emailService');
            try {
                await emailService.sendPasswordReset(user.email, resetToken, user);
                logger.debug('Password reset email sent', { userId: user._id, email: user.email });
            } catch (emailError) {
                logger.error('Failed to send password reset email', {
                    error: emailError.message,
                    userId: user._id
                });
                // Don't reveal email failure to user for security
            }
        } else {
            logger.debug('Password reset requested for non-existent email', { email });
        }

        // Always show success message for security
        req.session.success = 'If an account exists with that email, password reset instructions have been sent.';
        logExit('POST /auth/forgot-password', { success: true }, logger);
        res.redirect('/auth/forgot-password');

    } catch (error) {
        logException('POST /auth/forgot-password', error, { email: req.body.email }, logger);
        res.render('auth/forgot-password', {
            title: 'Forgot Password',
            error: 'An error occurred. Please try again.'
        });
    }
});

// Reset Password GET - Display reset password form
router.get('/reset-password/:token', async (req, res) => {
    logEntry('GET /auth/reset-password/:token', { token: req.params.token.substring(0, 10) + '...' }, logger);

    try {
        const { token } = req.params;

        // Hash the token to compare with database
        const crypto = require('crypto');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            logger.warn('Invalid or expired reset token', { token: token.substring(0, 10) + '...' });
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Password reset token is invalid or has expired.',
                tokenValid: false
            });
        }

        logger.debug('Valid reset token, showing reset form', { userId: user._id });
        res.render('auth/reset-password', {
            title: 'Reset Password',
            token: token,
            tokenValid: true
        });
        logExit('GET /auth/reset-password/:token', null, logger);

    } catch (error) {
        logException('GET /auth/reset-password/:token', error, { token: req.params.token.substring(0, 10) }, logger);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            tokenValid: false
        });
    }
});

// Reset Password POST - Process password reset
router.post('/reset-password/:token', [
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match')
], async (req, res) => {
    logEntry('POST /auth/reset-password/:token', { token: req.params.token.substring(0, 10) + '...' }, logger);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Reset password validation failed', { errors: errors.array() });
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: errors.array()[0].msg,
                token: req.params.token,
                tokenValid: true
            });
        }

        const { token } = req.params;
        const { password } = req.body;

        // Hash the token to compare with database
        const crypto = require('crypto');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            logger.warn('Invalid or expired reset token on POST', { token: token.substring(0, 10) + '...' });
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Password reset token is invalid or has expired.',
                tokenValid: false
            });
        }

        // Update password and clear reset token
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        logger.debug('Password reset successfully', { userId: user._id, username: user.username });

        req.session.success = 'Your password has been reset successfully. Please log in with your new password.';
        logExit('POST /auth/reset-password/:token', { success: true }, logger);
        res.redirect('/auth/login');

    } catch (error) {
        logException('POST /auth/reset-password/:token', error, { token: req.params.token.substring(0, 10) }, logger);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred while resetting your password. Please try again.',
            token: req.params.token,
            tokenValid: true
        });
    }
});

// Update Profile POST
router.post('/profile', [
    body('firstName')
        .isLength({ min: 1, max: 50 })
        .withMessage('First name is required and must be less than 50 characters')
        .trim(),
    body('lastName')
        .isLength({ min: 1, max: 50 })
        .withMessage('Last name is required and must be less than 50 characters')
        .trim(),
    body('dateOfBirth')
        .optional({ checkFalsy: true })
        .matches(/^[0-9]{4}-(0[0-9]|1[0-2]|00)-(0[0-9]|[1-2][0-9]|3[0-1]|00)$/)
        .withMessage('Date of birth must be in format YYYY-MM-DD'),
    body('countryOfResidence')
        .optional({ checkFalsy: true })
        .isIn(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'])
        .withMessage('Please select a valid country'),
    body('organization')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Organization name must be less than 100 characters')
        .trim()
], async (req, res) => {
    logEntry('POST /auth/profile', { userId: req.session?.userId }, logger);

    if (!req.session || !req.session.userId) {
        logger.warn('Profile update denied: no session');
        return res.redirect('/auth/login');
    }

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Profile update validation failed', { errors: errors.array() });
            const user = await User.findById(req.session.userId);
            return res.render('auth/profile', {
                title: 'Profile',
                error: errors.array()[0].msg,
                user: user
            });
        }

        const { firstName, lastName, dateOfBirth, countryOfResidence, organization } = req.body;
        logger.debug('Updating user profile', { userId: req.session.userId, firstName, lastName });

        const user = await User.findById(req.session.userId);
        if (!user) {
            logger.warn('Profile update failed: user not found', { userId: req.session.userId });
            return res.redirect('/auth/login');
        }

        // Update fields
        user.firstName = firstName;
        user.lastName = lastName;
        user.dateOfBirth = dateOfBirth || '';
        user.countryOfResidence = countryOfResidence || '';
        user.organization = organization || '';
        user.updatedAt = Date.now();

        // Check if profile is complete (for non-issuer users)
        if (user.role !== 'issuer') {
            user.profileCompleted = !!(user.firstName && user.lastName && user.dateOfBirth && user.countryOfResidence);
        }

        await user.save();

        logger.debug('Profile updated successfully', {
            userId: user._id,
            username: user.username,
            profileCompleted: user.profileCompleted,
            updatedFields: ['firstName', 'lastName', 'dateOfBirth', 'countryOfResidence', 'organization']
        });

        req.session.success = 'Profile updated successfully';
        logExit('POST /auth/profile', { success: true }, logger);
        res.redirect('/auth/profile');

    } catch (error) {
        logException('POST /auth/profile', error, { userId: req.session.userId }, logger);
        const user = await User.findById(req.session.userId);
        res.render('auth/profile', {
            title: 'Profile',
            error: 'An error occurred while updating your profile. Please try again.',
            user: user
        });
    }
});

// Change Password GET - Display change password form
router.get('/change-password', async (req, res) => {
    logEntry('GET /auth/change-password', { userId: req.session?.userId }, logger);

    if (!req.session || !req.session.userId) {
        logger.warn('Change password denied: no session');
        return res.redirect('/auth/login');
    }

    try {
        const user = await User.findById(req.session.userId);
        res.render('auth/change-password', {
            title: 'Change Password',
            user: user,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (error) {
        logException('GET /auth/change-password', error, { userId: req.session.userId }, logger);
        res.status(500).render('errorPage', {
            title: 'Error',
            error: 'Internal Server Error',
            message: 'Could not load change password page'
        });
    }
});

// Change Password POST - Process password change
router.post('/change-password', [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
], async (req, res) => {
    logEntry('POST /auth/change-password', { userId: req.session?.userId }, logger);

    if (!req.session || !req.session.userId) {
        logger.warn('Change password denied: no session');
        return res.redirect('/auth/login');
    }

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Change password validation failed', { errors: errors.array() });
            const user = await User.findById(req.session.userId);
            return res.render('auth/change-password', {
                title: 'Change Password',
                error: errors.array()[0].msg,
                user: user
            });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            logger.warn('Change password failed: user not found', { userId: req.session.userId });
            return res.redirect('/auth/login');
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(req.body.currentPassword);
        if (!isCurrentPasswordValid) {
            logger.warn('Change password failed: incorrect current password', { userId: user._id });
            return res.render('auth/change-password', {
                title: 'Change Password',
                error: 'Current password is incorrect',
                user: user
            });
        }

        // Update password
        user.password = req.body.newPassword;
        await user.save();

        logger.debug('Password changed successfully', {
            userId: user._id,
            username: user.username
        });

        req.session.success = 'Password changed successfully';
        logExit('POST /auth/change-password', { success: true }, logger);
        res.redirect('/auth/profile');

    } catch (error) {
        logException('POST /auth/change-password', error, { userId: req.session.userId }, logger);
        const user = await User.findById(req.session.userId);
        res.render('auth/change-password', {
            title: 'Change Password',
            error: 'An error occurred while changing your password. Please try again.',
            user: user
        });
    }
});

module.exports = router;
