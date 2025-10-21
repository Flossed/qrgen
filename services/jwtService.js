const jwt = require('jsonwebtoken');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs').promises;
const path = require('path');
const { getLogger, logEntry, logExit, logException } = require('../config/logger');

const logger = getLogger('JWTService');

class JWTService {
    constructor() {
        logEntry('JWTService.constructor', {}, logger);

        this.ajv = new Ajv({
            allErrors: true,
            strict: false,
            validateFormats: true,
            validateSchema: false  // Disable schema validation to avoid meta-schema issues
        });
        addFormats(this.ajv);
        this.schema = null;
        this.validateFunction = null;

        logger.debug('AJV instance created with configuration', {
            allErrors: true,
            strict: false,
            validateFormats: true
        });

        this.loadSchema();
        logExit('JWTService.constructor', null, logger);
    }

    /**
     * Load and compile the PRC JSON schema
     */
    async loadSchema() {
        logEntry('JWTService.loadSchema', {}, logger);

        try {
            const schemaPath = path.join(__dirname, '../schemas/schema-prc-v1.json');
            logger.debug('Loading schema from path', { schemaPath });

            const schemaData = await fs.readFile(schemaPath, 'utf8');
            this.schema = JSON.parse(schemaData);

            logger.debug('Schema parsed successfully, compiling...');
            this.validateFunction = this.ajv.compile(this.schema);
            logger.debug('PRC JSON Schema loaded and compiled successfully', {
                schemaId: this.schema.id || this.schema.$id,
                schemaVersion: this.schema.version
            });

            logExit('JWTService.loadSchema', { success: true }, logger);
        } catch (error) {
            logException('JWTService.loadSchema', error, { schemaPath: path.join(__dirname, '../schemas/schema-prc-v1.json') }, logger);

            // Create a fallback validation function that accepts all payloads
            logger.warn('Using fallback validation (accepts all payloads)');
            this.validateFunction = () => true;
            this.schema = null;

            logExit('JWTService.loadSchema', { success: false, fallback: true }, logger);
        }
    }

    /**
     * Generate JWT according to eEHIC specifications
     * @param {Object} payload - The JWT payload
     * @param {Object} certificate - The certificate object with signing key
     * @returns {Promise<string>} - The signed JWT
     */
    async generateJWT(payload, certificate) {
        logEntry('JWTService.generateJWT', {
            hasPayload: !!payload,
            certificateKid: certificate?.kid,
            algorithm: certificate?.algorithm
        }, logger);

        try {
            // Ensure schema is loaded
            if (!this.schema || !this.validateFunction) {
                logger.debug('Schema not loaded, loading now');
                await this.loadSchema();
            }

            // Validate payload against schema
            logger.debug('Validating payload against schema');
            const isValid = this.validateFunction(payload);
            if (!isValid) {
                const errors = this.validateFunction.errors
                    .map(err => `${err.instancePath}: ${err.message}`)
                    .join(', ');
                logger.warn('Payload validation failed', { errors });
                throw new Error(`Payload validation failed: ${errors}`);
            }

            logger.debug('Payload validation successful');

            // Create JWT header
            const header = {
                alg: certificate.algorithm,
                typ: 'JWT',
                kid: certificate.kid
            };

            logger.debug('Creating JWT with header', { header });

            // Sign the JWT
            const token = jwt.sign(payload, certificate.privateKey, {
                algorithm: certificate.algorithm,
                header: header,
                noTimestamp: true // We don't use iat, only the business date 'di'
            });

            logger.debug('JWT generated successfully', {
                kid: certificate.kid,
                algorithm: certificate.algorithm,
                tokenLength: token.length
            });

            logExit('JWTService.generateJWT', { success: true }, logger);
            return token;

        } catch (error) {
            logException('JWTService.generateJWT', error, {
                certificateKid: certificate?.kid
            }, logger);
            throw new Error(`Failed to generate JWT: ${error.message}`);
        }
    }

    /**
     * Validate JWT payload against schema
     * @param {Object} payload - The JWT payload to validate
     * @returns {boolean} - True if valid, false otherwise
     */
    async validateJWT(payload) {
        logEntry('JWTService.validateJWT', { hasPayload: !!payload }, logger);

        try {
            // Ensure schema is loaded
            if (!this.schema || !this.validateFunction) {
                logger.debug('Schema not loaded, loading now');
                await this.loadSchema();
            }

            const isValid = this.validateFunction(payload);
            logger.debug('Payload validation result', { isValid });

            logExit('JWTService.validateJWT', { isValid }, logger);
            return isValid;
        } catch (error) {
            logException('JWTService.validateJWT', error, {}, logger);
            logExit('JWTService.validateJWT', { isValid: false }, logger);
            return false;
        }
    }

    /**
     * Verify JWT signature and decode payload
     * @param {string} token - The JWT to verify
     * @param {Object} certificate - The certificate with public key
     * @returns {Object} - The decoded payload
     */
    verifyJWT(token, certificate) {
        logEntry('JWTService.verifyJWT', {
            tokenLength: token?.length,
            certificateKid: certificate?.kid
        }, logger);

        try {
            const decoded = jwt.verify(token, certificate.publicKey, {
                algorithms: [certificate.algorithm]
            });

            logger.debug('JWT verified successfully', {
                kid: decoded.header?.kid,
                jti: decoded.jti
            });

            logExit('JWTService.verifyJWT', { success: true }, logger);
            return decoded;
        } catch (error) {
            logException('JWTService.verifyJWT', error, {
                certificateKid: certificate?.kid
            }, logger);
            throw new Error(`JWT verification failed: ${error.message}`);
        }
    }

    /**
     * Decode JWT without verification (for inspection purposes)
     * @param {string} token - The JWT to decode
     * @returns {Object} - Object with header, payload, and signature
     */
    decodeJWT(token) {
        logEntry('JWTService.decodeJWT', { tokenLength: token?.length }, logger);

        try {
            const decoded = jwt.decode(token, { complete: true });
            logger.debug('JWT decoded successfully', {
                hasHeader: !!decoded?.header,
                hasPayload: !!decoded?.payload,
                algorithm: decoded?.header?.alg
            });

            logExit('JWTService.decodeJWT', { success: true }, logger);
            return decoded;
        } catch (error) {
            logException('JWTService.decodeJWT', error, {}, logger);
            throw new Error(`Failed to decode JWT: ${error.message}`);
        }
    }

    /**
     * Validate business rules for PRC data
     * @param {Object} prcData - The PRC data to validate
     * @returns {Array} - Array of validation errors, empty if valid
     */
    validateBusinessRules(prcData) {
        logEntry('JWTService.validateBusinessRules', {
            hasPrcData: !!prcData
        }, logger);

        const errors = [];

        try {
            const { dob, sd, ed, di, xd, ii, in: institutionName } = prcData;

            logger.debug('Validating business rules for dates', {
                dob, sd, ed, di, xd
            });

            // Convert string dates to Date objects for comparison
            const dobDate = new Date(dob.replace(/00/g, '01')); // Replace 00 with 01 for comparison
            const sdDate = new Date(sd);
            const edDate = new Date(ed);
            const diDate = new Date(di);

            // Date validation rules from eEHIC spec
            if (dobDate > sdDate) {
                errors.push('Date of birth must be before or equal to start date');
            }

            if (sdDate >= edDate) {
                errors.push('Start date must be before end date');
            }

            if (sdDate > diDate) {
                errors.push('Start date must be before or equal to issuance date');
            }

            if (diDate > edDate) {
                errors.push('Issuance date must be before or equal to end date');
            }

            if (xd) {
                const xdDate = new Date(xd);
                if (xdDate < edDate) {
                    errors.push('Expiry date must be after or equal to end date');
                }
            }

            // Institution name + ID length validation
            if ((ii.length + institutionName.length) > 25) {
                errors.push('Combined institution ID and name length must not exceed 25 characters');
            }

            logger.debug('Business rules validation completed', {
                errorCount: errors.length,
                isValid: errors.length === 0
            });

        } catch (error) {
            logException('JWTService.validateBusinessRules', error, {}, logger);
            errors.push(`Date validation error: ${error.message}`);
        }

        logExit('JWTService.validateBusinessRules', { errorCount: errors.length }, logger);
        return errors;
    }

    /**
     * Format date to ISO 8601 for JWT payload
     * @param {Date|string} date - Date to format
     * @returns {string} - ISO 8601 formatted date (YYYY-MM-DD)
     */
    formatDateForJWT(date) {
        logEntry('JWTService.formatDateForJWT', { dateType: typeof date }, logger);

        if (typeof date === 'string') {
            date = new Date(date);
        }
        const formatted = date.toISOString().split('T')[0];

        logger.trace('Date formatted for JWT', { formatted });
        logExit('JWTService.formatDateForJWT', { formatted }, logger);
        return formatted;
    }

    /**
     * Create the complete JWT payload from PRC data
     * @param {Object} prcData - Raw PRC form data
     * @param {string} jti - Unique token identifier
     * @param {string} revocationUrl - Optional revocation URL
     * @returns {Object} - Complete JWT payload
     */
    createPayload(prcData, jti, revocationUrl = null) {
        logEntry('JWTService.createPayload', {
            jti,
            hasRevocationUrl: !!revocationUrl,
            countryCode: prcData?.ic
        }, logger);

        const payload = {
            jti: jti,
            sid: 'eessi:prc:1.0',
            prc: {
                ic: prcData.ic,
                fn: prcData.fn.trim(),
                gn: prcData.gn.trim(),
                dob: prcData.dob,
                hi: prcData.hi.trim(),
                in: prcData.in.trim(),
                ii: prcData.ii,
                sd: this.formatDateForJWT(prcData.sd),
                ed: this.formatDateForJWT(prcData.ed),
                di: this.formatDateForJWT(prcData.di)
            }
        };

        // Add optional fields
        if (prcData.ci && prcData.ci.trim()) {
            payload.prc.ci = prcData.ci.trim();
            logger.debug('Added optional field: ci');
        }

        if (prcData.xd) {
            payload.prc.xd = this.formatDateForJWT(prcData.xd);
            logger.debug('Added optional field: xd');
        }

        if (revocationUrl) {
            payload.rid = revocationUrl;
            logger.debug('Added revocation URL to payload');
        }

        logger.debug('JWT payload created successfully', {
            jti,
            sid: payload.sid,
            hasOptionalFields: {
                ci: !!payload.prc.ci,
                xd: !!payload.prc.xd,
                rid: !!payload.rid
            }
        });

        logExit('JWTService.createPayload', { success: true }, logger);
        return payload;
    }

    /**
     * Get schema validation errors in human-readable format
     * @returns {Array} - Array of error messages
     */
    getValidationErrors() {
        if (!this.validateFunction || !this.validateFunction.errors) {
            return [];
        }

        return this.validateFunction.errors.map(error => {
            const path = error.instancePath || 'root';
            return `${path}: ${error.message}`;
        });
    }
}

module.exports = new JWTService();
