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
        .isIn(['2048', '3072', '4096'])
        .withMessage('Key size must be 2048, 3072, or 4096 bits'),
    body('algorithm')
        .isIn(['RS256', 'RS384', 'RS512'])
        .withMessage('Algorithm must be RS256, RS384, or RS512'),
    body('validUntil')
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
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
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
            validUntil,
            institutionName,
            country,
            institutionId
        } = req.body;

        // Determine issuer information
        let issuerInfo;
        if (req.user.role === 'admin') {
            // Admin can create certificates for any institution
            issuerInfo = {
                country: country,
                institutionId: institutionId,
                institutionName: institutionName
            };
        } else {
            // Issuer can only create certificates for their own institution
            issuerInfo = {
                country: req.user.country,
                institutionId: req.user.institutionId,
                institutionName: req.user.organization || `Institution ${req.user.institutionId}`
            };
        }

        // Generate RSA key pair
        const { publicKey, privateKey } = await Certificate.generateKeyPair(parseInt(keySize));

        // Calculate thumbprint
        const thumbprint = Certificate.calculateThumbprint(publicKey);

        // Generate kid
        const kid = Certificate.generateKid(thumbprint);

        // Create a basic X.509 certificate (simplified for demo)
        const cert = crypto.createSign('SHA256');
        const certData = {
            subject: `CN=${name}, O=${issuerInfo.institutionName}, C=${issuerInfo.country}`,
            issuer: `CN=PRC Generator CA, O=PRC Generator, C=EU`,
            serialNumber: Date.now().toString(),
            notBefore: new Date().toISOString(),
            notAfter: new Date(validUntil).toISOString()
        };

        // This is a simplified certificate - in production, use proper X.509 generation
        const x509Certificate = `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`;

        // Create certificate document
        const certificate = new Certificate({
            name,
            description,
            keySize: parseInt(keySize),
            algorithm,
            publicKey,
            privateKey,
            x509Certificate,
            thumbprint,
            kid,
            issuer: issuerInfo,
            validUntil: new Date(validUntil),
            createdBy: req.user._id
        });

        await certificate.save();

        res.redirect('/certificates?success=Certificate created successfully');

    } catch (error) {
        logger.error('Certificate creation error', { error: error.message, stack: error.stack });
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

        // Check if certificate is not expired
        if (certificate.isExpired) {
            return res.status(400).json({ error: 'Cannot activate expired certificate' });
        }

        certificate.isActive = true;
        await certificate.save();

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

module.exports = router;