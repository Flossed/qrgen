const mongoose = require('mongoose');

const institutionRequestSchema = new mongoose.Schema({
    requestType: {
        type: String,
        enum: ['join', 'create'],
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    // For 'join' requests
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HealthcareInstitution',
        required: function() { return this.requestType === 'join'; }
    },

    // For 'create' requests
    institutionName: {
        type: String,
        trim: true,
        maxlength: 21,  // eEHIC schema requirement
        required: function() { return this.requestType === 'create'; }
    },
    institutionCountry: {
        type: String,
        enum: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'UK'],
        required: function() { return this.requestType === 'create'; }
    },
    institutionAddress: {
        type: String,
        trim: true,
        maxlength: 200
    },
    institutionContact: {
        type: String,
        trim: true,
        maxlength: 100
    },
    justification: {
        type: String,
        trim: true,
        maxlength: 500
    },

    // Approval/Rejection info
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

    // For approved 'create' requests
    createdInstitutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HealthcareInstitution'
    },
    generatedInstitutionId: {
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

// Index for querying pending requests
institutionRequestSchema.index({ status: 1, createdAt: -1 });
institutionRequestSchema.index({ requestedBy: 1, status: 1 });
institutionRequestSchema.index({ institutionId: 1, status: 1 });

// Static method to find pending requests for an institution
institutionRequestSchema.statics.findPendingForInstitution = function(institutionId) {
    return this.find({
        institutionId: institutionId,
        requestType: 'join',
        status: 'pending'
    })
    .populate('requestedBy', 'email firstName lastName')
    .sort({ createdAt: -1 });
};

// Static method to find pending requests by user
institutionRequestSchema.statics.findPendingByUser = function(userId) {
    return this.find({
        requestedBy: userId,
        status: 'pending'
    })
    .populate('institutionId', 'name country')
    .sort({ createdAt: -1 });
};

// Static method to find all pending creation requests (for system admin)
institutionRequestSchema.statics.findPendingCreationRequests = function() {
    return this.find({
        requestType: 'create',
        status: 'pending'
    })
    .populate('requestedBy', 'email firstName lastName')
    .sort({ createdAt: -1 });
};

const InstitutionRequest = mongoose.model('InstitutionRequest', institutionRequestSchema);

module.exports = InstitutionRequest;
