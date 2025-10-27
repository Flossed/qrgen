/**
 * PRC Schema Mapping Configuration
 *
 * This file defines the mapping between the eEHIC PRC schema (schema-prc-v1.json)
 * and our internal data models (User, HealthcareInstitution).
 *
 * Schema Reference: schemas/schema-prc-v1.json
 *
 * The PRC schema uses abbreviated field names as per the eEHIC specification.
 * This mapping ensures we correctly translate our human-readable field names
 * to the schema-compliant abbreviated format when generating PRCs.
 */

const prcSchemaMapping = {
    /**
     * Citizen/Holder Information Mapping
     * Maps User model fields to PRC schema fields
     */
    citizen: {
        // fn: Family Name (maxLength: 40)
        // Maps to User.lastName
        fn: {
            source: 'user.lastName',
            schemaField: 'fn',
            description: 'Family Name',
            required: true,
            maxLength: 40,
            validation: (value) => {
                if (!value || value.length === 0) {
                    throw new Error('Family name is required');
                }
                if (value.length > 40) {
                    throw new Error('Family name must not exceed 40 characters');
                }
                return value.trim();
            }
        },

        // gn: Given Name (maxLength: 35)
        // Maps to User.firstName
        gn: {
            source: 'user.firstName',
            schemaField: 'gn',
            description: 'Given Name',
            required: true,
            maxLength: 35,
            validation: (value) => {
                if (!value || value.length === 0) {
                    throw new Error('Given name is required');
                }
                if (value.length > 35) {
                    throw new Error('Given name must not exceed 35 characters');
                }
                return value.trim();
            }
        },

        // dob: Date of Birth (format: YYYY-MM-DD or YYYY-00-00)
        // Maps to User.dateOfBirth
        dob: {
            source: 'user.dateOfBirth',
            schemaField: 'dob',
            description: 'Date of Birth',
            required: true,
            format: 'YYYY-MM-DD',
            pattern: /^[0-9]{4}-(0[0-9]|1[0-2]|00)-(0[0-9]|[1-2][0-9]|3[0-1]|00)$/,
            validation: (value) => {
                if (!value) {
                    throw new Error('Date of birth is required');
                }
                if (!prcSchemaMapping.citizen.dob.pattern.test(value)) {
                    throw new Error('Date of birth must be in format YYYY-MM-DD (use 00 for unknown day/month)');
                }
                return value;
            }
        },

        // hi: Holder Identification Number (maxLength: 20)
        // Maps to User.personalIdNumber
        hi: {
            source: 'user.personalIdNumber',
            schemaField: 'hi',
            description: 'Holder Identification Number (Personal ID)',
            required: true,
            maxLength: 20,
            validation: (value) => {
                if (!value || value.length === 0) {
                    throw new Error('Personal identification number is required');
                }
                if (value.length > 20) {
                    throw new Error('Personal identification number must not exceed 20 characters');
                }
                return value.trim();
            }
        },

        // ic: Card Issuer Country (2-letter country code)
        // Maps to User.countryOfResidence for citizens
        // Note: This is the country where the citizen resides and receives healthcare
        ic: {
            source: 'user.countryOfResidence',
            schemaField: 'ic',
            description: 'Card Issuer Country',
            required: true,
            enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'],
            validation: (value) => {
                if (!value) {
                    throw new Error('Card issuer country is required');
                }
                if (!prcSchemaMapping.citizen.ic.enum.includes(value)) {
                    throw new Error(`Invalid country code: ${value}`);
                }
                return value;
            },
            notes: 'For citizens, this represents their country of residence. For issuers generating PRCs, this should match the institution\'s country.'
        }
    },

    /**
     * Institution Information Mapping
     * Maps HealthcareInstitution model fields to PRC schema fields
     */
    institution: {
        // in: Institution Name (maxLength: 21)
        // Maps to HealthcareInstitution.name
        in: {
            source: 'institution.name',
            schemaField: 'in',
            description: 'Institution Name',
            required: true,
            maxLength: 21,
            validation: (value) => {
                if (!value || value.length === 0) {
                    throw new Error('Institution name is required');
                }
                if (value.length > 21) {
                    throw new Error('Institution name must not exceed 21 characters (eEHIC schema requirement)');
                }
                return value.trim();
            },
            notes: 'Combined length of institution name (in) and institution ID (ii) must not exceed 25 characters'
        },

        // ii: Institution Identification Number (4-10 digits)
        // Maps to HealthcareInstitution.institutionId
        ii: {
            source: 'institution.institutionId',
            schemaField: 'ii',
            description: 'Institution Identification Number',
            required: true,
            minLength: 4,
            maxLength: 10,
            pattern: /^\d+$/,
            validation: (value, institutionName) => {
                if (!value || value.length === 0) {
                    throw new Error('Institution ID is required');
                }
                if (!prcSchemaMapping.institution.ii.pattern.test(value)) {
                    throw new Error('Institution ID must contain only digits');
                }
                if (value.length < 4 || value.length > 10) {
                    throw new Error('Institution ID must be between 4 and 10 digits');
                }

                // Validate combined length constraint
                if (institutionName) {
                    const combinedLength = value.length + institutionName.length;
                    if (combinedLength > 25) {
                        throw new Error(`Combined institution ID and name length (${combinedLength}) must not exceed 25 characters`);
                    }
                }

                return value;
            },
            notes: 'Combined length of institution ID (ii) and institution name (in) must not exceed 25 characters'
        },

        // ci: Card Identification Number (optional, maxLength: 20)
        // EHIC card ID = Institution ID (4-10) + Card Serial Number (10)
        // This is optional for PRCs without physical EHIC
        ci: {
            source: null, // Not currently stored in models - generated on demand or optional
            schemaField: 'ci',
            description: 'Card Identification Number',
            required: false,
            maxLength: 20,
            pattern: /^\d*$/,
            validation: (value) => {
                if (!value) {
                    return undefined; // Optional field
                }
                if (!prcSchemaMapping.institution.ci.pattern.test(value)) {
                    throw new Error('Card ID must contain only digits');
                }
                if (value.length > 20) {
                    throw new Error('Card ID must not exceed 20 characters');
                }
                return value;
            },
            notes: 'Optional for PRCs. EHIC card ID = Institution ID (4-10 digits) + Card Serial Number (10 digits). Total max 20 characters.'
        }
    },

    /**
     * Entitlement Period Information
     * These are typically entered during PRC generation, not stored in user profile
     */
    entitlement: {
        // sd: Entitlement Start Date (format: YYYY-MM-DD)
        sd: {
            source: 'prcData.sd', // Entered during PRC generation
            schemaField: 'sd',
            description: 'Entitlement Start Date',
            required: true,
            format: 'YYYY-MM-DD',
            validation: (value) => {
                if (!value) {
                    throw new Error('Start date is required');
                }
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    throw new Error('Start date must be in format YYYY-MM-DD');
                }
                return value;
            }
        },

        // ed: Entitlement End Date (format: YYYY-MM-DD)
        ed: {
            source: 'prcData.ed', // Entered during PRC generation
            schemaField: 'ed',
            description: 'Entitlement End Date',
            required: true,
            format: 'YYYY-MM-DD',
            validation: (value, startDate) => {
                if (!value) {
                    throw new Error('End date is required');
                }
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    throw new Error('End date must be in format YYYY-MM-DD');
                }

                // Validate end date is after start date
                if (startDate && new Date(value) <= new Date(startDate)) {
                    throw new Error('End date must be after start date');
                }

                return value;
            }
        },

        // xd: PRC Expiry Date (optional, format: YYYY-MM-DD)
        xd: {
            source: 'prcData.xd', // Optional, entered during PRC generation
            schemaField: 'xd',
            description: 'PRC Expiry Date',
            required: false,
            format: 'YYYY-MM-DD',
            validation: (value) => {
                if (!value) {
                    return undefined; // Optional field
                }
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    throw new Error('Expiry date must be in format YYYY-MM-DD');
                }
                return value;
            }
        },

        // di: Date of Issuance (format: YYYY-MM-DD)
        di: {
            source: 'currentDate', // Set to current date during PRC generation
            schemaField: 'di',
            description: 'Date of Issuance',
            required: true,
            format: 'YYYY-MM-DD',
            validation: (value, startDate, endDate) => {
                if (!value) {
                    throw new Error('Issuance date is required');
                }
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    throw new Error('Issuance date must be in format YYYY-MM-DD');
                }

                // Validate issuance date is between start and end dates
                const issueDate = new Date(value);
                if (startDate && endDate) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    if (issueDate < start || issueDate > end) {
                        throw new Error('Issuance date must be between start and end dates');
                    }
                }

                return value;
            },
            notes: 'Typically set to the current date when the PRC is generated'
        }
    },

    /**
     * JWT Wrapper Fields
     * These are top-level fields in the JWT payload, not part of the PRC object
     */
    jwt: {
        // jti: Unique token identifier (UUID)
        jti: {
            source: 'generated', // Generated using uuid.v4()
            schemaField: 'jti',
            description: 'Unique token identifier',
            required: false, // Optional in schema
            notes: 'Generated using UUID v4. Uniquely identifies this PRC instance.'
        },

        // sid: Schema ID (e.g., "eessi:prc:1.0")
        sid: {
            source: 'constant',
            schemaField: 'sid',
            description: 'Schema ID',
            required: true,
            pattern: /^eessi:prc:\d+\.\d+$/,
            defaultValue: 'eessi:prc:1.0',
            notes: 'Version/ID number pointing to the JSON schema for the JWT Payload. Format: eessi:prc:Major.Minor'
        },

        // rid: Revocation list ID (URI)
        rid: {
            source: 'prcData.revocationUrl', // Optional, entered during PRC generation
            schemaField: 'rid',
            description: 'Revocation list ID',
            required: false,
            format: 'uri',
            notes: 'Optional URL pointing to revocation list for this PRC'
        }
    }
};

/**
 * Helper function to map User and Institution data to PRC schema format
 *
 * @param {Object} user - User document from MongoDB
 * @param {Object} institution - HealthcareInstitution document from MongoDB
 * @param {Object} prcData - Additional PRC data (entitlement dates, etc.)
 * @returns {Object} PRC data formatted according to schema-prc-v1.json
 */
function mapToPRCSchema(user, institution, prcData) {
    // Validate required data
    if (!user) {
        throw new Error('User data is required for PRC generation');
    }
    if (!institution) {
        throw new Error('Institution data is required for PRC generation');
    }
    if (!prcData) {
        throw new Error('PRC entitlement data is required for PRC generation');
    }

    // Build PRC object according to schema
    const prc = {
        // Citizen information
        ic: prcSchemaMapping.citizen.ic.validation(user.countryOfResidence),
        fn: prcSchemaMapping.citizen.fn.validation(user.lastName),
        gn: prcSchemaMapping.citizen.gn.validation(user.firstName),
        dob: prcSchemaMapping.citizen.dob.validation(user.dateOfBirth),
        hi: prcSchemaMapping.citizen.hi.validation(user.personalIdNumber),

        // Institution information
        in: prcSchemaMapping.institution.in.validation(institution.name),
        ii: prcSchemaMapping.institution.ii.validation(institution.institutionId, institution.name),

        // Entitlement dates
        sd: prcSchemaMapping.entitlement.sd.validation(prcData.sd),
        ed: prcSchemaMapping.entitlement.ed.validation(prcData.ed, prcData.sd),
        di: prcSchemaMapping.entitlement.di.validation(prcData.di, prcData.sd, prcData.ed)
    };

    // Add optional fields if present
    if (prcData.ci) {
        prc.ci = prcSchemaMapping.institution.ci.validation(prcData.ci);
    }
    if (prcData.xd) {
        prc.xd = prcSchemaMapping.entitlement.xd.validation(prcData.xd);
    }

    return prc;
}

/**
 * Helper function to get field mapping information
 *
 * @param {string} schemaField - PRC schema field name (e.g., 'fn', 'gn', 'ic')
 * @returns {Object} Mapping information for the field
 */
function getFieldMapping(schemaField) {
    // Search through all mapping categories
    for (const category of Object.values(prcSchemaMapping)) {
        if (category[schemaField]) {
            return category[schemaField];
        }
    }
    return null;
}

/**
 * Get human-readable description for a schema field
 *
 * @param {string} schemaField - PRC schema field name
 * @returns {string} Human-readable description
 */
function getFieldDescription(schemaField) {
    const mapping = getFieldMapping(schemaField);
    return mapping ? mapping.description : schemaField;
}

module.exports = {
    prcSchemaMapping,
    mapToPRCSchema,
    getFieldMapping,
    getFieldDescription
};
