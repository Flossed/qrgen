const mongoose = require('mongoose');

const prcSchema = new mongoose.Schema({
    // JWT Fields
    jti: {
        type: String,
        unique: true,
        required: true
    },
    sid: {
        type: String,
        required: true,
        default: 'eessi:prc:1.0',
        match: /^eessi:prc:\d+\.\d+$/
    },
    rid: {
        type: String,
        format: 'uri'
    },

    // PRC Data
    prcData: {
        // Card issuer country
        ic: {
            type: String,
            required: true,
            enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK']
        },
        // Family name
        fn: {
            type: String,
            required: true,
            maxlength: 40,
            trim: true
        },
        // Given name
        gn: {
            type: String,
            required: true,
            maxlength: 35,
            trim: true
        },
        // Date of birth
        dob: {
            type: String,
            required: true,
            match: /^[0-9]{4}-(0[0-9]|1[0-2]|00)-(0[0-9]|[1-2][0-9]|3[0-1]|00)$/
        },
        // Personal identification number
        hi: {
            type: String,
            required: true,
            maxlength: 20,
            trim: true
        },
        // Institution name
        in: {
            type: String,
            required: true,
            maxlength: 21,
            trim: true
        },
        // Institution identification number
        ii: {
            type: String,
            required: true,
            minlength: 4,
            maxlength: 10,
            trim: true,
            match: /^\d+$/
        },
        // Card identification number (optional)
        ci: {
            type: String,
            maxlength: 20,
            trim: true,
            match: /^\d*$/
        },
        // Start date
        sd: {
            type: Date,
            required: true
        },
        // End date
        ed: {
            type: Date,
            required: true
        },
        // Expiry date (optional)
        xd: {
            type: Date
        },
        // Date of issuance
        di: {
            type: Date,
            required: true,
            default: Date.now
        }
    },

    // Generated artifacts
    jwt: {
        type: String,
        required: true
    },
    qrCodeData: {
        type: String,
        required: true
    },
    qrCodeImage: {
        type: Buffer
    },
    pdfBuffer: {
        type: Buffer
    },

    // Certificate used for signing
    certificateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Certificate',
        required: true
    },

    // Generation metadata
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    generatedAt: {
        type: Date,
        default: Date.now
    },

    // Email tracking
    emailSent: {
        type: Boolean,
        default: false
    },
    emailSentAt: {
        type: Date
    },
    emailRecipient: {
        type: String,
        trim: true,
        lowercase: true
    },

    // Status tracking
    status: {
        type: String,
        enum: ['draft', 'generated', 'sent', 'revoked'],
        default: 'draft'
    },

    // Revocation
    isRevoked: {
        type: Boolean,
        default: false
    },
    revokedAt: {
        type: Date
    },
    revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    revocationReason: {
        type: String,
        trim: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Virtual for checking if PRC is currently valid
prcSchema.virtual('isValid').get(function() {
    const now = new Date();
    return !this.isRevoked &&
           this.prcData.sd <= now &&
           this.prcData.ed > now;
});

// Virtual for checking if PRC is expired
prcSchema.virtual('isExpired').get(function() {
    return this.prcData.ed < new Date();
});

// Virtual for full name
prcSchema.virtual('holderFullName').get(function() {
    return `${this.prcData.gn} ${this.prcData.fn}`;
});

// Virtual for official ID
prcSchema.virtual('officialId').get(function() {
    return `${this.prcData.ic}:${this.prcData.ii}`;
});

// Pre-save middleware to update the updatedAt field
prcSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Pre-save validation for date logic
prcSchema.pre('save', function(next) {
    const errors = [];

    // Validate date relationships
    if (this.prcData.sd >= this.prcData.ed) {
        errors.push('Start date must be before end date');
    }

    if (this.prcData.sd > this.prcData.di) {
        errors.push('Start date must be before or equal to issuance date');
    }

    if (this.prcData.di > this.prcData.ed) {
        errors.push('Issuance date must be before or equal to end date');
    }

    if (this.prcData.xd && this.prcData.xd < this.prcData.ed) {
        errors.push('Expiry date must be after or equal to end date');
    }

    // Validate institution name + institution ID length
    if ((this.prcData.ii.length + this.prcData.in.length) > 25) {
        errors.push('Combined institution ID and name length must not exceed 25 characters');
    }

    if (errors.length > 0) {
        const error = new Error('Validation failed');
        error.details = errors;
        return next(error);
    }

    next();
});

// Instance method to revoke PRC
prcSchema.methods.revoke = function(reason, revokedBy) {
    this.isRevoked = true;
    this.revokedAt = new Date();
    this.revokedBy = revokedBy;
    this.revocationReason = reason;
    this.status = 'revoked';
    return this.save();
};

// Instance method to mark as sent
prcSchema.methods.markAsSent = function(emailRecipient) {
    this.emailSent = true;
    this.emailSentAt = new Date();
    this.emailRecipient = emailRecipient;
    this.status = 'sent';
    return this.save();
};

// Static method to find by JTI
prcSchema.statics.findByJti = function(jti) {
    return this.findOne({ jti });
};

// Static method to find valid PRCs for a person
prcSchema.statics.findValidForPerson = function(ic, hi) {
    const now = new Date();
    return this.find({
        'prcData.ic': ic,
        'prcData.hi': hi,
        isRevoked: false,
        'prcData.sd': { $lte: now },
        'prcData.ed': { $gt: now }
    }).sort({ 'prcData.di': -1 });
};

// Static method to find PRCs by issuer
prcSchema.statics.findByIssuer = function(ic, ii) {
    return this.find({
        'prcData.ic': ic,
        'prcData.ii': ii
    }).sort({ createdAt: -1 });
};

// Index for efficient queries (jti index already created by unique: true)
prcSchema.index({ 'prcData.ic': 1, 'prcData.ii': 1 });
prcSchema.index({ 'prcData.ic': 1, 'prcData.hi': 1 });
prcSchema.index({ generatedBy: 1, createdAt: -1 });
prcSchema.index({ status: 1 });

// Ensure virtual fields are serialized
prcSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        // Remove large buffers from JSON output by default
        delete ret.qrCodeImage;
        delete ret.pdfBuffer;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('PRC', prcSchema);