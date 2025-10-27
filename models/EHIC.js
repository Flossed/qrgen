const mongoose = require('mongoose');

const ehicSchema = new mongoose.Schema({
    // Citizen who owns this EHIC
    citizenId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Institution that issued this EHIC
    institutionId: {
        type: String,
        required: true,
        trim: true,
        minlength: 4,
        maxlength: 10,
        match: [/^\d+$/, 'Institution ID must contain only digits']
    },

    // Reference to the HealthcareInstitution
    institution: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HealthcareInstitution',
        required: true
    },

    // Card Issuer Country (from citizen's country of residence)
    cardIssuerCountry: {
        type: String,
        required: true,
        enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK']
    },

    // Citizen information (snapshot at time of EHIC creation)
    familyName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40
    },

    givenName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 35
    },

    dateOfBirth: {
        type: String,
        required: true,
        match: [/^[0-9]{4}-(0[0-9]|1[0-2]|00)-(0[0-9]|[1-2][0-9]|3[0-1]|00)$/, 'Date of birth must be in format YYYY-MM-DD']
    },

    personalIdNumber: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20
    },

    // Card Identification Number (Institution ID + Serial Number)
    // Optional but recommended for EHIC cards
    cardId: {
        type: String,
        trim: true,
        maxlength: 20,
        match: [/^\d*$/, 'Card ID must contain only digits']
    },

    // Entitlement period (optional - will default to issuance and expiry dates)
    // These are primarily for PRC generation, not the EHIC itself
    entitlementStartDate: {
        type: Date,
        required: false
    },

    entitlementEndDate: {
        type: Date,
        required: false
    },

    // EHIC expiry date (typically same as entitlement end date)
    expiryDate: {
        type: Date,
        required: true
    },

    // Date of issuance
    issuanceDate: {
        type: Date,
        required: true,
        default: Date.now
    },

    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'expired', 'revoked'],
        default: 'pending',
        required: true
    },

    // Approval/rejection details
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    reviewedAt: {
        type: Date
    },

    reviewNotes: {
        type: String,
        trim: true,
        maxlength: 500
    },

    // Physical card details (if applicable)
    physicalCardIssued: {
        type: Boolean,
        default: false
    },

    cardSerialNumber: {
        type: String,
        trim: true,
        maxlength: 10
    },

    // Invalidation tracking
    // EHIC becomes invalid if citizen changes institution
    isValid: {
        type: Boolean,
        default: true
    },

    invalidatedAt: {
        type: Date
    },

    invalidationReason: {
        type: String,
        enum: ['expired', 'revoked', 'institution_change', 'citizen_request'],
        trim: true
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
ehicSchema.index({ citizenId: 1, status: 1 });
ehicSchema.index({ institution: 1, status: 1 });
ehicSchema.index({ status: 1, expiryDate: 1 });
ehicSchema.index({ cardId: 1 }, { unique: true, sparse: true });

// Virtual for full name
ehicSchema.virtual('holderFullName').get(function() {
    return `${this.givenName} ${this.familyName}`;
});

// Virtual to check if EHIC is expired
ehicSchema.virtual('isExpired').get(function() {
    if (this.expiryDate) {
        return new Date() > this.expiryDate;
    }
    return false;
});

// Virtual to check if EHIC is active and valid
ehicSchema.virtual('isActive').get(function() {
    return this.status === 'approved' && this.isValid && !this.isExpired;
});

// Method to approve EHIC
ehicSchema.methods.approve = async function(reviewerId, notes) {
    this.status = 'approved';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date();
    if (notes) {
        this.reviewNotes = notes;
    }
    return await this.save();
};

// Method to reject EHIC
ehicSchema.methods.reject = async function(reviewerId, notes) {
    this.status = 'rejected';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date();
    this.reviewNotes = notes || 'Request rejected';
    return await this.save();
};

// Method to revoke EHIC
ehicSchema.methods.revoke = async function(reason, notes) {
    this.status = 'revoked';
    this.isValid = false;
    this.invalidatedAt = new Date();
    this.invalidationReason = reason;
    if (notes) {
        this.reviewNotes = notes;
    }
    return await this.save();
};

// Method to invalidate EHIC (e.g., when citizen changes institution)
ehicSchema.methods.invalidate = async function(reason) {
    this.isValid = false;
    this.invalidatedAt = new Date();
    this.invalidationReason = reason;
    return await this.save();
};

// Static method to find active EHIC for a citizen
ehicSchema.statics.findActiveByCitizen = async function(citizenId) {
    return await this.findOne({
        citizenId: citizenId,
        status: 'approved',
        isValid: true,
        expiryDate: { $gt: new Date() }
    })
    .populate('institution', 'name institutionId country')
    .sort({ issuanceDate: -1 });
};

// Static method to find pending EHIC requests for an institution
ehicSchema.statics.findPendingByInstitution = async function(institutionId) {
    return await this.find({
        institution: institutionId,
        status: 'pending'
    })
    .populate('citizenId', 'firstName lastName email username')
    .sort({ createdAt: -1 });
};

// Static method to check if citizen has active EHIC
ehicSchema.statics.hasActiveEHIC = async function(citizenId) {
    const activeEHIC = await this.findActiveByCitizen(citizenId);
    return !!activeEHIC;
};

// Pre-save middleware to set default entitlement dates and auto-expire
ehicSchema.pre('save', function(next) {
    // Set default entitlement dates if not provided
    if (!this.entitlementStartDate && this.issuanceDate) {
        this.entitlementStartDate = this.issuanceDate;
    }
    if (!this.entitlementEndDate && this.expiryDate) {
        this.entitlementEndDate = this.expiryDate;
    }

    // Auto-expire based on expiryDate
    if (this.expiryDate && new Date() > this.expiryDate && this.status === 'approved') {
        this.status = 'expired';
    }
    next();
});

// Ensure virtuals are included in JSON output
ehicSchema.set('toJSON', { virtuals: true });
ehicSchema.set('toObject', { virtuals: true });

const EHIC = mongoose.model('EHIC', ehicSchema);

module.exports = EHIC;
