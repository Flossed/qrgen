const mongoose = require('mongoose');

const healthcareInstitutionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 21  // eEHIC schema requirement
    },
    country: {
        type: String,
        required: true,
        enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK']
    },
    institutionId: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        minlength: 4,
        maxlength: 10,
        match: [/^\d+$/, 'Institution ID must contain only digits']
    },
    sequenceCounter: {
        type: Number,
        default: 0
    },
    administrators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    address: {
        type: String,
        trim: true,
        maxlength: 200
    },
    contactEmail: {
        type: String,
        trim: true,
        lowercase: true
    },
    contactPhone: {
        type: String,
        trim: true,
        maxlength: 50
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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

// Compound index for country + institutionId
healthcareInstitutionSchema.index({ country: 1, institutionId: 1 }, { unique: true });

// Method to generate next personal ID for a user
healthcareInstitutionSchema.methods.generatePersonalId = async function(country) {
    // Increment sequence counter
    this.sequenceCounter += 1;
    await this.save();

    // Format: country-institutionId-padding-sequence
    // Total length up to 20 chars (AN..20)
    const sequenceStr = this.sequenceCounter.toString().padStart(5, '0'); // N5
    const baseId = `${country}-${this.institutionId}-`;
    const paddingLength = 14 - baseId.length - sequenceStr.length;
    const padding = '0'.repeat(Math.max(0, paddingLength));

    return `${baseId}${padding}${sequenceStr}`;
};

// Method to check if user is an administrator
healthcareInstitutionSchema.methods.isAdministrator = function(userId) {
    return this.administrators.some(adminId => adminId.toString() === userId.toString());
};

// Method to add administrator
healthcareInstitutionSchema.methods.addAdministrator = async function(userId) {
    if (!this.isAdministrator(userId)) {
        this.administrators.push(userId);
        await this.save();
    }
};

// Static method to find institutions by country
healthcareInstitutionSchema.statics.findByCountry = function(country) {
    return this.find({ country: country, isActive: true }).sort({ name: 1 });
};

// Static method to find institutions where user is admin
healthcareInstitutionSchema.statics.findByAdministrator = function(userId) {
    return this.find({ administrators: userId, isActive: true }).sort({ name: 1 });
};

const HealthcareInstitution = mongoose.model('HealthcareInstitution', healthcareInstitutionSchema);

module.exports = HealthcareInstitution;
