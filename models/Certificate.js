const mongoose = require('mongoose');
const crypto = require('crypto');

const certificateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    keySize: {
        type: Number,
        required: true,
        enum: [2048, 3072, 4096],
        default: 2048
    },
    algorithm: {
        type: String,
        required: true,
        enum: ['RS256', 'RS384', 'RS512'],
        default: 'RS256'
    },
    publicKey: {
        type: String,
        required: true
    },
    privateKey: {
        type: String,
        required: true
    },
    x509Certificate: {
        type: String,
        required: true
    },
    thumbprint: {
        type: String,
        required: true,
        unique: true
    },
    kid: {
        type: String,
        required: true,
        unique: true
    },
    issuer: {
        country: {
            type: String,
            enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'],
            required: true
        },
        institutionId: {
            type: String,
            required: true,
            trim: true,
            minlength: 4,
            maxlength: 10,
            match: [/^\d+$/, 'Institution ID must contain only digits']
        },
        institutionName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        }
    },
    validFrom: {
        type: Date,
        required: true,
        default: Date.now
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date
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

// Virtual for checking if certificate is expired
certificateSchema.virtual('isExpired').get(function() {
    return this.validUntil < Date.now();
});

// Virtual for checking if certificate is currently valid
certificateSchema.virtual('isValid').get(function() {
    const now = Date.now();
    return this.isActive && this.validFrom <= now && this.validUntil > now;
});

// Virtual for official ID (country:institutionId)
certificateSchema.virtual('officialId').get(function() {
    return `${this.issuer.country}:${this.issuer.institutionId}`;
});

// Pre-save middleware to update the updatedAt field
certificateSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to generate RSA key pair
certificateSchema.statics.generateKeyPair = function(keySize = 2048) {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', {
            modulusLength: keySize,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        }, (err, publicKey, privateKey) => {
            if (err) {
                reject(err);
            } else {
                resolve({ publicKey, privateKey });
            }
        });
    });
};

// Static method to calculate thumbprint
certificateSchema.statics.calculateThumbprint = function(publicKey) {
    // Remove PEM headers and newlines
    const pemHeader = '-----BEGIN PUBLIC KEY-----';
    const pemFooter = '-----END PUBLIC KEY-----';
    const keyData = publicKey
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, '');

    // Calculate SHA-256 hash
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(keyData, 'base64'));
    return hash.digest('base64url');
};

// Static method to generate kid (Key ID)
certificateSchema.statics.generateKid = function(thumbprint) {
    return `EESSI:x5t#S256:${thumbprint}`;
};

// Instance method to increment usage count
certificateSchema.methods.incrementUsage = function() {
    this.usageCount += 1;
    this.lastUsed = new Date();
    return this.save();
};

// Instance method to sign JWT payload
certificateSchema.methods.signJWT = function(payload, options = {}) {
    const jwt = require('jsonwebtoken');

    const signOptions = {
        algorithm: this.algorithm,
        keyid: this.kid,
        ...options
    };

    return jwt.sign(payload, this.privateKey, signOptions);
};

// Instance method to verify JWT
certificateSchema.methods.verifyJWT = function(token, options = {}) {
    const jwt = require('jsonwebtoken');

    const verifyOptions = {
        algorithms: [this.algorithm],
        ...options
    };

    return jwt.verify(token, this.publicKey, verifyOptions);
};

// Static method to find certificate by thumbprint
certificateSchema.statics.findByThumbprint = function(thumbprint) {
    return this.findOne({ thumbprint, isActive: true });
};

// Static method to find certificate by kid
certificateSchema.statics.findByKid = function(kid) {
    return this.findOne({ kid, isActive: true });
};

// Static method to find certificates for an issuer
certificateSchema.statics.findByIssuer = function(country, institutionId) {
    return this.find({
        'issuer.country': country,
        'issuer.institutionId': institutionId,
        isActive: true
    }).sort({ createdAt: -1 });
};

// Ensure virtual fields are serialized
certificateSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        // Remove sensitive private key from JSON output
        delete ret.privateKey;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Certificate', certificateSchema);