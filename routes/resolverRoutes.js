const express = require('express');
const router = express.Router();
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const HealthcareInstitution = require('../models/HealthcareInstitution');
const { getLogger } = require('../config/logger');

const logger = getLogger('ResolverRoutes');

/**
 * Resolver API Routes
 * Mimics EBSI DID Registry format for issuer resolution
 * Allows external verification tools to resolve issuer certificates
 */

/**
 * GET /api/v1/identifiers/:did
 * Resolve a DID to get the DID Document with verification methods
 * Follows W3C DID Core Data Model and EBSI conventions
 */
router.get('/identifiers/:did', async (req, res) => {
    try {
        const { did } = req.params;
        const validAt = req.query['valid-at'] || new Date().toISOString();

        logger.info('Resolving DID', { did, validAt });

        // Parse DID to extract issuer identifier
        // Expected format: did:local:{issuerId} or did:ebsi:{issuerId}
        const didParts = did.split(':');
        if (didParts.length < 3) {
            logger.warn('Invalid DID format', { did });
            return res.status(400).json({
                error: 'Invalid DID format',
                message: 'DID must be in format did:method:identifier'
            });
        }

        const method = didParts[1];
        const identifier = didParts.slice(2).join(':');

        // Find certificate by identifier (certificate ID or user ID)
        let certificate = null;
        let issuer = null;
        let institution = null;

        // Try to find by certificate ID
        try {
            certificate = await Certificate.findById(identifier)
                .populate('userId', 'firstName lastName email username country institutionId')
                .populate('institutionId', 'name institutionId country');

            if (certificate) {
                issuer = certificate.userId;
                institution = certificate.institutionId;
            }
        } catch (err) {
            // Not a valid ObjectId, continue
        }

        // If not found by certificate ID, try by user ID
        if (!certificate) {
            try {
                issuer = await User.findById(identifier)
                    .populate('institutionId', 'name institutionId country');

                if (issuer) {
                    institution = issuer.institutionId;
                    // Get active certificate for this user
                    certificate = await Certificate.findOne({
                        userId: issuer._id,
                        status: 'active'
                    }).sort({ createdAt: -1 });
                }
            } catch (err) {
                // Not found
            }
        }

        // If still not found, try by username or institution ID
        if (!issuer) {
            issuer = await User.findOne({ username: identifier })
                .populate('institutionId', 'name institutionId country');

            if (issuer) {
                institution = issuer.institutionId;
                certificate = await Certificate.findOne({
                    userId: issuer._id,
                    status: 'active'
                }).sort({ createdAt: -1 });
            }
        }

        // Check if issuer was found
        if (!issuer) {
            logger.warn('DID not found', { did, identifier });
            return res.status(404).json({
                error: 'DID not found',
                message: `No issuer found for identifier: ${identifier}`
            });
        }

        // Check if certificate exists and is valid at requested time
        if (!certificate) {
            logger.warn('No active certificate found for issuer', { did, issuerId: issuer._id });
            return res.status(404).json({
                error: 'Certificate not found',
                message: 'No active certificate found for this issuer'
            });
        }

        const validAtDate = new Date(validAt);
        const certificateCreatedAt = new Date(certificate.createdAt);

        if (validAtDate < certificateCreatedAt) {
            logger.warn('Certificate not valid at requested time', {
                did,
                validAt,
                certificateCreatedAt
            });
            return res.status(404).json({
                error: 'Certificate not valid',
                message: `Certificate was not valid at ${validAt}`
            });
        }

        // Generate W3C DID Document
        const didDocument = generateDIDDocument(did, certificate, issuer, institution);

        logger.info('DID resolved successfully', {
            did,
            certificateId: certificate._id,
            issuerId: issuer._id
        });

        // Return DID Document in EBSI format
        res.json(didDocument);

    } catch (error) {
        logger.error('Error resolving DID', {
            error: error.message,
            stack: error.stack,
            did: req.params.did
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to resolve DID'
        });
    }
});

/**
 * GET /api/v1/issuers/:issuerId
 * Alternative endpoint for resolving issuers by ID
 * More user-friendly than full DID format
 */
router.get('/issuers/:issuerId', async (req, res) => {
    try {
        const { issuerId } = req.params;

        logger.info('Resolving issuer', { issuerId });

        // Find issuer by ID, username, or institution ID
        let issuer = null;
        let institution = null;
        let certificate = null;

        // Try by ObjectId first
        try {
            issuer = await User.findById(issuerId)
                .populate('institutionId', 'name institutionId country');

            if (issuer) {
                institution = issuer.institutionId;
                certificate = await Certificate.findOne({
                    userId: issuer._id,
                    status: 'active'
                }).sort({ createdAt: -1 });
            }
        } catch (err) {
            // Not a valid ObjectId
        }

        // Try by username
        if (!issuer) {
            issuer = await User.findOne({ username: issuerId })
                .populate('institutionId', 'name institutionId country');

            if (issuer) {
                institution = issuer.institutionId;
                certificate = await Certificate.findOne({
                    userId: issuer._id,
                    status: 'active'
                }).sort({ createdAt: -1 });
            }
        }

        if (!issuer) {
            logger.warn('Issuer not found', { issuerId });
            return res.status(404).json({
                error: 'Issuer not found',
                message: `No issuer found with identifier: ${issuerId}`
            });
        }

        if (!certificate) {
            logger.warn('No active certificate found for issuer', { issuerId, issuerDbId: issuer._id });
            return res.status(404).json({
                error: 'Certificate not found',
                message: 'No active certificate found for this issuer'
            });
        }

        // Generate DID for this issuer
        const did = `did:local:${issuer._id}`;

        // Generate W3C DID Document
        const didDocument = generateDIDDocument(did, certificate, issuer, institution);

        logger.info('Issuer resolved successfully', {
            issuerId,
            issuerDbId: issuer._id,
            certificateId: certificate._id
        });

        res.json(didDocument);

    } catch (error) {
        logger.error('Error resolving issuer', {
            error: error.message,
            stack: error.stack,
            issuerId: req.params.issuerId
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to resolve issuer'
        });
    }
});

/**
 * Generate W3C DID Document following EBSI conventions
 * @param {string} did - The DID identifier
 * @param {Object} certificate - Certificate document
 * @param {Object} issuer - User/issuer document
 * @param {Object} institution - Healthcare institution document
 * @returns {Object} W3C DID Document
 */
function generateDIDDocument(did, certificate, issuer, institution) {
    // Extract public key from certificate
    const publicKeyPem = certificate.publicKey;

    // Convert PEM to JWK format (simplified - in production use crypto library)
    const publicKeyJwk = convertPemToJwk(publicKeyPem, certificate.algorithm);

    // Generate verification method ID
    const verificationMethodId = `${did}#${certificate._id}`;

    // Build DID Document following W3C DID Core Data Model
    const didDocument = {
        '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://w3id.org/security/suites/jws-2020/v1'
        ],
        id: did,
        controller: [did],
        verificationMethod: [
            {
                id: verificationMethodId,
                type: 'JsonWebKey2020',
                controller: did,
                publicKeyJwk: publicKeyJwk
            }
        ],
        authentication: [verificationMethodId],
        assertionMethod: [verificationMethodId],
        // Additional metadata (optional, EBSI-inspired)
        metadata: {
            issuer: {
                name: issuer.firstName && issuer.lastName
                    ? `${issuer.firstName} ${issuer.lastName}`
                    : issuer.username,
                email: issuer.email,
                country: issuer.country
            },
            institution: institution ? {
                name: institution.name,
                institutionId: institution.institutionId,
                country: institution.country
            } : null,
            certificate: {
                id: certificate._id.toString(),
                name: certificate.name,
                algorithm: certificate.algorithm,
                createdAt: certificate.createdAt,
                expiresAt: certificate.expiresAt,
                status: certificate.status
            }
        }
    };

    return didDocument;
}

/**
 * Convert PEM public key to JWK format
 * Simplified version - for production use proper crypto library
 * @param {string} pemKey - PEM formatted public key
 * @param {string} algorithm - Certificate algorithm (P-256, secp256k1, RSA-2048)
 * @returns {Object} JWK formatted public key
 */
function convertPemToJwk(pemKey, algorithm) {
    // This is a simplified implementation
    // In production, use a library like 'node-jose' or 'jose' for proper conversion

    const crypto = require('crypto');

    try {
        // Create key object from PEM
        const keyObject = crypto.createPublicKey({
            key: pemKey,
            format: 'pem'
        });

        // Export as JWK
        const jwk = keyObject.export({ format: 'jwk' });

        // Map algorithm to curve/key type
        if (algorithm === 'P-256' || algorithm === 'secp256r1') {
            return {
                kty: 'EC',
                crv: 'P-256',
                x: jwk.x,
                y: jwk.y
            };
        } else if (algorithm === 'secp256k1') {
            return {
                kty: 'EC',
                crv: 'secp256k1',
                x: jwk.x,
                y: jwk.y
            };
        } else if (algorithm && algorithm.startsWith('RSA')) {
            return {
                kty: 'RSA',
                n: jwk.n,
                e: jwk.e
            };
        } else {
            // Default to EC P-256
            return {
                kty: jwk.kty || 'EC',
                crv: jwk.crv || 'P-256',
                x: jwk.x,
                y: jwk.y
            };
        }
    } catch (error) {
        logger.error('Error converting PEM to JWK', {
            error: error.message,
            algorithm
        });

        // Fallback - return placeholder JWK
        return {
            kty: 'EC',
            crv: 'P-256',
            x: 'placeholder_x',
            y: 'placeholder_y'
        };
    }
}

module.exports = router;
