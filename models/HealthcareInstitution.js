const mongoose = require('mongoose');

const healthcareInstitutionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
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
    isActive: {
        type: Boolean,
        default: true
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

// Static method to find institutions by country
healthcareInstitutionSchema.statics.findByCountry = function(country) {
    return this.find({ country: country, isActive: true }).sort({ name: 1 });
};

const HealthcareInstitution = mongoose.model('HealthcareInstitution', healthcareInstitutionSchema);

module.exports = HealthcareInstitution;
