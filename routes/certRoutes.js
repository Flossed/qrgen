const express = require('express');
const router = express.Router();
const Certificate = require('../models/Certificate');
const { isAuthenticated, canManageCertificates } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { getLogger } = require('../config/logger');

const logger = getLogger('CertRoutes');

// Certificate management page
router.get('/', isAuthenticated, canManageCertificates, async (req, res) => {
    try {
        let certificates;

        // Admins can see all certificates, issuers only see their own
        if (req.user.role === 'admin') {
            certificates = await Certificate.find()
                .populate('createdBy', 'username fullName')
                .sort({ createdAt: -1 });
        } else {
            // For issuers, show only certificates for their institution
            certificates = await Certificate.findByIssuer(req.user.country, req.user.institutionId)
                .populate('createdBy', 'username fullName');
        }

        res.render('certificates/index', {
            title: 'Certificate Management',
            certificates: certificates,
            user: req.user
        });
    } catch (error) {
        logger.error('Certificate list error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load certificates',
            user: req.user
        });
    }
});

// Create new certificate page
router.get('/create', isAuthenticated, canManageCertificates, (req, res) => {
    logger.info('Certificate create page accessed', {
        userId: req.user._id,
        username: req.user.username,
        role: req.user.role
    });
    res.render('certificates/create', {
        title: 'Create New Certificate',
        user: req.user
    });
});

// Create new certificate POST
router.post('/create', isAuthenticated, canManageCertificates, [
    body('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Certificate name is required and must be less than 100 characters')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Description must be less than 500 characters')
        .trim(),
    body('keySize')
        .optional()
        .isIn(['2048', '3072', '4096'])
        .withMessage('Key size must be 2048, 3072, or 4096 bits'),
    body('algorithm')
        .isIn(['RS256', 'RS384', 'RS512', 'ES256'])
        .withMessage('Algorithm must be RS256, RS384, RS512, or ES256'),
    body('curve')
        .optional()
        .isIn(['P-256', 'prime256v1', 'secp256r1'])
        .withMessage('Curve must be P-256, prime256v1, or secp256r1'),
    body('validityDays')
        .optional()
        .isInt({ min: 30, max: 3650 })
        .withMessage('Validity days must be between 30 and 3650'),
    body('validUntil')
        .optional()
        .isISO8601()
        .withMessage('Valid until date must be a valid date')
        .custom((value) => {
            const expiryDate = new Date(value);
            const now = new Date();
            if (expiryDate <= now) {
                throw new Error('Expiry date must be in the future');
            }
            return true;
        }),
    body('institutionName')
        .if((value, { req }) => req.user.role === 'admin')
        .isLength({ min: 1, max: 100 })
        .withMessage('Institution name is required for admin-created certificates')
        .trim(),
    body('country')
        .if((value, { req }) => req.user.role === 'admin')
        .isIn(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'])
        .withMessage('Please select a valid country'),
    body('institutionId')
        .if((value, { req }) => req.user.role === 'admin')
        .isLength({ min: 4, max: 10 })
        .withMessage('Institution ID must be between 4 and 10 characters')
        .matches(/^\d+$/)
        .withMessage('Institution ID must contain only digits')
], async (req, res) => {
    logger.info('POST /certificates/create - Starting certificate creation', {
        userId: req.user._id,
        username: req.user.username,
        role: req.user.role,
        body: { ...req.body, privateKey: undefined } // Don't log private key
    });

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Certificate creation validation failed', {
                errors: errors.array(),
                userId: req.user._id
            });
            return res.render('certificates/create', {
                title: 'Create New Certificate',
                error: errors.array()[0].msg,
                formData: req.body,
                user: req.user
            });
        }

        const {
            name,
            description,
            keySize,
            algorithm,
            curve,
            validityDays,
            validUntil,
            institutionName,
            country,
            institutionId,
            autoActivate
        } = req.body;

        // Calculate validUntil from validityDays if validUntil not provided
        let expiryDate;
        if (validUntil) {
            expiryDate = new Date(validUntil);
        } else if (validityDays) {
            expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays));
        } else {
            // Default to 2 years if neither is provided
            expiryDate = new Date();
            expiryDate.setFullYear(expiryDate.getFullYear() + 2);
        }

        logger.info('Certificate form data extracted', {
            name,
            keySize,
            algorithm,
            validityDays,
            validUntil,
            calculatedExpiryDate: expiryDate,
            institutionName,
            country,
            institutionId
        });

        // Determine issuer information
        let issuerInfo;
        if (req.user.role === 'admin') {
            // Admin can create certificates for any institution
            issuerInfo = {
                country: country,
                institutionId: institutionId,
                institutionName: institutionName
            };
            logger.info('Admin creating certificate for institution', issuerInfo);
        } else {
            // Issuer can only create certificates for their own institution
            issuerInfo = {
                country: req.user.country,
                institutionId: req.user.institutionId,
                institutionName: req.user.organization || `Institution ${req.user.institutionId}`
            };
            logger.info('Issuer creating certificate for own institution', issuerInfo);
        }

        // Generate key pair based on algorithm type
        let publicKey, privateKey;
        if (algorithm === 'ES256') {
            // Generate EC key pair for ES256
            const ecCurve = curve || 'prime256v1'; // Default to prime256v1 (P-256)
            logger.info('Generating EC key pair', { algorithm, curve: ecCurve });
            const keyPair = await Certificate.generateECKeyPair(ecCurve);
            publicKey = keyPair.publicKey;
            privateKey = keyPair.privateKey;
            logger.info('EC key pair generated successfully');
        } else {
            // Generate RSA key pair for RS256/RS384/RS512
            logger.info('Generating RSA key pair', { keySize: parseInt(keySize) });
            const keyPair = await Certificate.generateKeyPair(parseInt(keySize));
            publicKey = keyPair.publicKey;
            privateKey = keyPair.privateKey;
            logger.info('RSA key pair generated successfully');
        }

        // Calculate thumbprint
        logger.info('Calculating thumbprint');
        const thumbprint = Certificate.calculateThumbprint(publicKey);
        logger.info('Thumbprint calculated', { thumbprint });

        // Generate kid
        const kid = Certificate.generateKid(thumbprint);
        logger.info('Kid generated', { kid });

        // Create a basic X.509 certificate (simplified for demo)
        const cert = crypto.createSign('SHA256');
        const certData = {
            subject: `CN=${name}, O=${issuerInfo.institutionName}, C=${issuerInfo.country}`,
            issuer: `CN=PRC Generator CA, O=PRC Generator, C=EU`,
            serialNumber: Date.now().toString(),
            notBefore: new Date().toISOString(),
            notAfter: expiryDate.toISOString()
        };

        logger.info('Certificate data prepared', certData);

        // This is a simplified certificate - in production, use proper X.509 generation
        const x509Certificate = `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`;

        // Determine if certificate should be active
        const shouldBeActive = autoActivate === true || autoActivate === 'true' || autoActivate === 'on';

        logger.info('Creating certificate document in database', {
            autoActivate,
            shouldBeActive
        });

        // Create certificate document
        const certificateData = {
            name,
            description,
            algorithm,
            publicKey,
            privateKey,
            x509Certificate,
            thumbprint,
            kid,
            issuer: issuerInfo,
            validUntil: expiryDate,
            isActive: shouldBeActive,
            createdBy: req.user._id
        };

        // Add keySize for RSA algorithms
        if (algorithm.startsWith('RS')) {
            certificateData.keySize = parseInt(keySize);
        }

        // Add curve for EC algorithms
        if (algorithm.startsWith('ES')) {
            certificateData.curve = curve || 'prime256v1';
        }

        const certificate = new Certificate(certificateData);

        logger.info('Saving certificate to database');
        await certificate.save();
        logger.info('Certificate saved successfully', {
            certificateId: certificate._id,
            name: certificate.name
        });

        // Update user's certificateCreated flag for issuer onboarding
        if (req.user.role === 'issuer' && !req.user.certificateCreated) {
            const User = require('../models/User');
            await User.findByIdAndUpdate(req.user._id, { certificateCreated: true });
            logger.info('Updated issuer certificateCreated flag', {
                userId: req.user._id,
                certificateId: certificate._id
            });
        }

        console.log('✅ Certificate created successfully:', {
            id: certificate._id,
            name: certificate.name,
            issuer: issuerInfo
        });

        // Check if request expects JSON response (from AJAX)
        if (req.headers['content-type'] === 'application/json' || req.xhr || req.accepts('json')) {
            return res.json({
                success: true,
                message: 'Certificate created successfully',
                certificateId: certificate._id
            });
        }

        res.redirect('/certificates?success=Certificate created successfully');

    } catch (error) {
        logger.error('Certificate creation error', {
            error: error.message,
            stack: error.stack,
            userId: req.user._id,
            body: { ...req.body, privateKey: undefined }
        });
        console.error('❌ Certificate creation failed:', error);

        // Check if request expects JSON response (from AJAX)
        if (req.headers['content-type'] === 'application/json' || req.xhr || req.accepts('json')) {
            return res.status(500).json({
                success: false,
                error: error.message || 'An error occurred while creating the certificate. Please try again.'
            });
        }

        res.render('certificates/create', {
            title: 'Create New Certificate',
            error: 'An error occurred while creating the certificate. Please try again.',
            formData: req.body,
            user: req.user
        });
    }
});

// View certificate details
router.get('/:id', isAuthenticated, canManageCertificates, async (req, res) => {
    try {
        const certificate = await Certificate.findById(req.params.id)
            .populate('createdBy', 'username fullName email');

        if (!certificate) {
            return res.status(404).render('errorPage', {
                title: 'Not Found',
                error: 'Not Found',
                message: 'Certificate not found',
                user: req.user
            });
        }

        // Check permissions - issuers can only view certificates for their institution
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                return res.status(403).render('errorPage', {
                    title: 'Access Denied',
                    error: 'Access Denied',
                    message: 'You do not have permission to view this certificate',
                    user: req.user
                });
            }
        }

        res.render('certificates/view', {
            title: `Certificate: ${certificate.name}`,
            certificate: certificate,
            user: req.user
        });
    } catch (error) {
        logger.error('Certificate view error', { error: error.message, stack: error.stack });
        res.status(500).render('errorPage', {
            title: 'Internal Server Error',
            error: 'Internal Server Error',
            message: 'Could not load certificate'
        });
    }
});

// Deactivate certificate
router.post('/:id/deactivate', isAuthenticated, canManageCertificates, async (req, res) => {
    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Check permissions
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        certificate.isActive = false;
        await certificate.save();

        res.json({ success: true, message: 'Certificate deactivated successfully' });
    } catch (error) {
        logger.error('Certificate deactivation error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Activate certificate
router.post('/:id/activate', isAuthenticated, canManageCertificates, async (req, res) => {
    logger.info('POST /:id/activate - Activating certificate', {
        certificateId: req.params.id,
        userId: req.user._id
    });

    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            logger.warn('Certificate not found for activation', { certificateId: req.params.id });
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Check permissions
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                logger.warn('Certificate activation access denied', {
                    certificateId: req.params.id,
                    userId: req.user._id
                });
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Check if certificate is not expired
        if (certificate.isExpired) {
            logger.warn('Attempt to activate expired certificate', {
                certificateId: req.params.id,
                validUntil: certificate.validUntil
            });
            return res.status(400).json({ error: 'Cannot activate expired certificate' });
        }

        certificate.isActive = true;
        await certificate.save();

        logger.info('Certificate activated successfully', {
            certificateId: certificate._id,
            name: certificate.name
        });

        console.log('✅ Certificate activated:', {
            id: certificate._id,
            name: certificate.name
        });

        res.json({ success: true, message: 'Certificate activated successfully' });
    } catch (error) {
        logger.error('Certificate activation error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download public key
router.get('/:id/public-key', isAuthenticated, canManageCertificates, async (req, res) => {
    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Check permissions
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.setHeader('Content-Type', 'application/x-pem-file');
        res.setHeader('Content-Disposition', `attachment; filename="${certificate.name}_public_key.pem"`);
        res.send(certificate.publicKey);
    } catch (error) {
        logger.error('Public key download error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get certificate info (for JWT signing)
router.get('/api/by-institution/:country/:institutionId', isAuthenticated, async (req, res) => {
    try {
        const { country, institutionId } = req.params;

        // Check permissions - users can only access certificates for their institution
        if (req.user.role === 'issuer') {
            if (req.user.country !== country || req.user.institutionId !== institutionId) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const certificates = await Certificate.findByIssuer(country, institutionId);
        const activeCertificates = certificates.filter(cert => cert.isValid);

        if (activeCertificates.length === 0) {
            return res.status(404).json({ error: 'No active certificates found for this institution' });
        }

        // Return the most recent active certificate
        const certificate = activeCertificates[0];

        res.json({
            id: certificate._id,
            name: certificate.name,
            kid: certificate.kid,
            algorithm: certificate.algorithm,
            thumbprint: certificate.thumbprint,
            validUntil: certificate.validUntil,
            officialId: certificate.officialId
        });
    } catch (error) {
        logger.error('Certificate API error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete certificate
router.delete('/:id', isAuthenticated, canManageCertificates, async (req, res) => {
    logger.info('DELETE /certificates/:id - Deleting certificate', {
        certificateId: req.params.id,
        userId: req.user._id,
        username: req.user.username,
        role: req.user.role
    });

    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            logger.warn('Certificate not found for deletion', { certificateId: req.params.id });
            return res.status(404).json({
                success: false,
                error: 'Certificate not found'
            });
        }

        // Check permissions - issuers can only delete certificates for their institution
        if (req.user.role === 'issuer') {
            if (certificate.issuer.country !== req.user.country ||
                certificate.issuer.institutionId !== req.user.institutionId) {
                logger.warn('Certificate deletion access denied', {
                    certificateId: req.params.id,
                    userId: req.user._id,
                    certificateIssuer: certificate.issuer
                });
                return res.status(403).json({
                    success: false,
                    error: 'You do not have permission to delete this certificate'
                });
            }
        }

        // Check if certificate has been used
        if (certificate.usageCount > 0) {
            logger.warn('Attempt to delete certificate with usage', {
                certificateId: req.params.id,
                usageCount: certificate.usageCount
            });
            return res.status(400).json({
                success: false,
                error: `Cannot delete certificate that has been used ${certificate.usageCount} time(s). Please deactivate it instead.`
            });
        }

        await Certificate.findByIdAndDelete(req.params.id);

        logger.info('Certificate deleted successfully', {
            certificateId: req.params.id,
            name: certificate.name,
            deletedBy: req.user._id
        });

        console.log('✅ Certificate deleted:', {
            id: certificate._id,
            name: certificate.name
        });

        res.json({
            success: true,
            message: 'Certificate deleted successfully'
        });

    } catch (error) {
        logger.error('Certificate deletion error', {
            error: error.message,
            stack: error.stack,
            certificateId: req.params.id,
            userId: req.user._id
        });
        console.error('❌ Certificate deletion failed:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while deleting the certificate'
        });
    }
});

module.exports = router;