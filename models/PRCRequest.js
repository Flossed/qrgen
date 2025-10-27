const mongoose = require('mongoose');

const prcRequestSchema = new mongoose.Schema({
    // Citizen who requested this PRC
    citizenId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // EHIC that this PRC is based on
    ehicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EHIC',
        required: true,
        index: true
    },

    // Institution that will approve/reject this request
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HealthcareInstitution',
        required: true,
        index: true
    },

    // Travel Information
    destinationCountry: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 2
    },

    travelStartDate: {
        type: Date,
        required: true
    },

    travelEndDate: {
        type: Date,
        required: true
    },

    // PRC Data (pre-filled from EHIC)
    prcData: {
        // Issuing country
        ic: { type: String, required: true },

        // Card holder information
        fn: { type: String, required: true, maxlength: 40 },
        gn: { type: String, required: true, maxlength: 35 },
        dob: { type: String, required: true },
        hi: { type: String, required: true, maxlength: 20 },

        // Institution information
        in: { type: String, required: true, maxlength: 21 },
        ii: { type: String, required: true, maxlength: 10 },

        // Card information
        ci: { type: String, maxlength: 20 },
        xd: { type: String }, // Card expiry date

        // Validity period (auto-calculated)
        sd: { type: String, required: true }, // Start date
        ed: { type: String, required: true }, // End date
        di: { type: String, required: true }  // Issue date
    },

    // Request status
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },

    // Review information
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

    // Generated PRC reference (if approved)
    prcId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PRC'
    }

}, {
    timestamps: true
});

// Indexes
prcRequestSchema.index({ citizenId: 1, status: 1 });
prcRequestSchema.index({ institutionId: 1, status: 1 });
prcRequestSchema.index({ createdAt: -1 });

// Virtuals
prcRequestSchema.virtual('isPending').get(function() {
    return this.status === 'pending';
});

prcRequestSchema.virtual('isApproved').get(function() {
    return this.status === 'approved';
});

prcRequestSchema.virtual('isRejected').get(function() {
    return this.status === 'rejected';
});

// Static methods
prcRequestSchema.statics.findPendingByInstitution = function(institutionId) {
    return this.find({
        institutionId: institutionId,
        status: 'pending'
    })
    .populate('citizenId', 'firstName lastName email')
    .populate('ehicId')
    .sort({ createdAt: -1 });
};

prcRequestSchema.statics.findByCitizen = function(citizenId) {
    return this.find({ citizenId })
        .populate('institutionId', 'name institutionId country')
        .populate('reviewedBy', 'firstName lastName')
        .sort({ createdAt: -1 });
};

// Instance methods
prcRequestSchema.methods.approve = async function(reviewerId, notes = '') {
    this.status = 'approved';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date();
    this.reviewNotes = notes;
    return this.save();
};

prcRequestSchema.methods.reject = async function(reviewerId, notes) {
    this.status = 'rejected';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date();
    this.reviewNotes = notes;
    return this.save();
};

// Ensure virtuals are included in JSON
prcRequestSchema.set('toJSON', { virtuals: true });
prcRequestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PRCRequest', prcRequestSchema);
