# Architectural Scan & Findings Report
## PRC QR Generator Application

**Date**: October 29, 2025
**Version**: 0.0.5
**Scan Type**: Code Quality & Architecture Review
**Triggered By**: Production Error - Null Reference Exception

---

## 1. Executive Summary

This architectural scan was initiated following a production error in the dashboard endpoint (`GET /dashboard`) where the application attempted to access properties on null-referenced citizen objects. The scan revealed systematic issues with null reference handling across multiple route handlers, affecting both EHIC and PRC review workflows.

### Key Findings Summary
- **Critical**: 4 confirmed null-reference vulnerabilities in route handlers
- **High**: 59 instances of Mongoose `.populate()` operations requiring audit
- **Medium**: Insufficient error handling in async/await patterns
- **Low**: Missing data validation guards

### Impact Assessment
- **User Experience**: Dashboard crashes for users with orphaned citizen references
- **Data Integrity**: Indicates potential referential integrity issues in database
- **System Reliability**: Unhandled exceptions causing route failures

---

## 2. Current Error Analysis

### Error Details
```
TypeError: Cannot read properties of null (reading 'firstName')
at E:\_Applications\__ZNDPRODS\qrgen\routes\prcRoutes.js:245:117
```

### Root Cause
The error occurs when:
1. An EHIC or PRC record contains a `citizenId` reference
2. The referenced citizen document has been deleted or is invalid
3. Mongoose's `.populate('citizenId')` returns `null` for the missing reference
4. Code attempts to access `ehic.citizenId.firstName` without null checking

### Affected Code Locations

#### prcRoutes.js:245
```javascript
// Line 237: .populate('citizenId', 'firstName lastName')
// Line 241-250: forEach loop without null check
description: `${ehic.status === 'approved' ? 'Approved' : 'Rejected'} EHIC for ${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
```

#### prcRoutes.js:265
```javascript
// Similar pattern for PRC reviews
description: `${prc.status === 'approved' ? 'Approved' : 'Rejected'} PRC for ${prc.citizenId.firstName} ${prc.citizenId.lastName}`
```

#### ehicRoutes.js:393
```javascript
citizenName: `${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
```

#### ehicRoutes.js:457
```javascript
citizenName: `${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
```

---

## 3. Null Reference Pattern Issues

### Problem Pattern
The codebase demonstrates a consistent pattern of unsafe property access on populated Mongoose references:

```javascript
// UNSAFE PATTERN (Current)
const records = await Model.find()
    .populate('citizenId', 'firstName lastName');

records.forEach(record => {
    // No null check - CRASHES if citizenId is null
    const name = `${record.citizenId.firstName} ${record.citizenId.lastName}`;
});
```

### Recommended Safe Pattern
```javascript
// SAFE PATTERN (Recommended)
const records = await Model.find()
    .populate('citizenId', 'firstName lastName');

records.forEach(record => {
    // Defensive null check
    if (!record.citizenId) {
        console.warn(`Missing citizen reference for record ${record._id}`);
        return; // or provide default value
    }
    const name = `${record.citizenId.firstName} ${record.citizenId.lastName}`;
});
```

### Scope of Issue
- **Files Affected**: 6 route files
- **Total .populate() Calls**: 59 instances
- **Confirmed Vulnerable**: 4 instances
- **Requires Audit**: Remaining 55 instances

---

## 4. Data Integrity Concerns

### Referential Integrity Issues

The presence of null references after `.populate()` indicates deeper data integrity problems:

1. **Orphaned References**: EHIC/PRC records referencing deleted citizens
2. **Cascade Delete Failure**: Deleting citizens should either:
   - Prevent deletion if records reference them (restrict)
   - Automatically delete/update dependent records (cascade)
   - Set references to null with proper handling (set null)

### Database Schema Considerations

#### Current Schema (models/PRCRequest.js & models/EHIC.js)
Review the foreign key constraints and referential actions:

```javascript
// Example from models
citizenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Citizen',
    required: true  // Consider implications if required yet can be null
}
```

### Recommendations

1. **Add Mongoose Middleware**: Prevent citizen deletion if referenced
```javascript
// In Citizen model
citizenSchema.pre('remove', async function(next) {
    const ehicCount = await EHIC.countDocuments({ citizenId: this._id });
    const prcCount = await PRCRequest.countDocuments({ citizenId: this._id });

    if (ehicCount > 0 || prcCount > 0) {
        throw new Error('Cannot delete citizen with active EHIC/PRC records');
    }
    next();
});
```

2. **Data Cleanup Script**: Identify and resolve orphaned records
```javascript
// Script to find orphaned records
const orphanedEHICs = await EHIC.find({ citizenId: null });
const orphanedPRCs = await PRCRequest.find({ citizenId: null });
```

3. **Database Constraints**: Consider adding MongoDB validation rules or application-level constraints

---

## 5. Error Handling Recommendations

### Chapter 5.1: Defensive Programming

#### Immediate Fixes Required

**Priority 1: prcRoutes.js Dashboard Endpoint (Lines 241-270)**
```javascript
// Current Code (UNSAFE)
reviewedEHICs.forEach(ehic => {
    recentActivity.push({
        description: `... ${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
    });
});

// Recommended Fix
reviewedEHICs.forEach(ehic => {
    const citizenName = ehic.citizenId
        ? `${ehic.citizenId.firstName} ${ehic.citizenId.lastName}`
        : 'Unknown Citizen (Record Deleted)';

    recentActivity.push({
        description: `... ${citizenName}`
    });
});
```

**Priority 2: ehicRoutes.js (Lines 393, 457)**
Apply similar null-safe pattern in EHIC route handlers.

### Chapter 5.2: Global Error Handler Enhancement

Review the global error handler to provide better error responses:

```javascript
// Enhanced error middleware
app.use((err, req, res, next) => {
    logger.exception('EXCEPTION', err.message, {
        function: `${req.method} ${req.path}`,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        },
        context: {
            userId: req.user?._id,
            body: req.body,
            params: req.params
        }
    });

    // Don't expose stack traces in production
    const response = {
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    };

    res.status(500).json(response);
});
```

### Chapter 5.3: Try-Catch Audit

Review async route handlers to ensure proper error handling:

```javascript
// Pattern to follow
router.get('/dashboard', async (req, res, next) => {
    try {
        // Route logic here
    } catch (error) {
        next(error); // Pass to error handler
    }
});
```

---

## 6. Code Quality Improvements

### Chapter 6.1: Extract Helper Functions

Reduce code duplication by creating reusable helper functions:

**Example: Safe Citizen Name Formatter**
```javascript
// utils/formatters.js
function formatCitizenName(citizen, fallback = 'Unknown Citizen') {
    if (!citizen || !citizen.firstName || !citizen.lastName) {
        return fallback;
    }
    return `${citizen.firstName} ${citizen.lastName}`;
}

module.exports = { formatCitizenName };
```

**Usage in Routes**
```javascript
const { formatCitizenName } = require('../utils/formatters');

reviewedEHICs.forEach(ehic => {
    recentActivity.push({
        description: `... ${formatCitizenName(ehic.citizenId)}`
    });
});
```

### Chapter 6.2: Input Validation Layer

Ensure consistent validation across all routes:

```javascript
// middleware/validators.js
const { param, validationResult } = require('express-validator');

const validateObjectId = [
    param('id').isMongoId().withMessage('Invalid ID format'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];
```

### Chapter 6.3: Logging Enhancement

Improve logging for better debugging:

```javascript
// Before accessing populated data
if (!ehic.citizenId) {
    logger.warn('Missing citizen reference', {
        ehicId: ehic._id,
        status: ehic.status,
        reviewedAt: ehic.reviewedAt
    });
}
```

---

## 7. Testing Recommendations

### Chapter 7.1: Unit Tests for Null Scenarios

Create tests that specifically cover null reference cases:

```javascript
// test/routes/prcRoutes.test.js
describe('GET /dashboard', () => {
    it('should handle EHICs with deleted citizen references', async () => {
        // Setup: Create EHIC with valid citizen
        const citizen = await Citizen.create({ firstName: 'John', lastName: 'Doe' });
        const ehic = await EHIC.create({ citizenId: citizen._id, status: 'approved' });

        // Delete citizen (creating orphaned reference)
        await Citizen.deleteOne({ _id: citizen._id });

        // Test: Dashboard should not crash
        const response = await request(app)
            .get('/dashboard')
            .expect(200);

        // Verify graceful handling
        expect(response.body).to.not.throw;
    });
});
```

### Chapter 7.2: Integration Test Coverage

Current test configuration (from package.json):
```json
"nyc": {
    "check-coverage": true,
    "lines": 80,
    "statements": 80,
    "functions": 80,
    "branches": 80
}
```

Ensure branch coverage includes:
- Null reference branches
- Error handling paths
- Edge cases with missing data

### Chapter 7.3: Manual Testing Checklist

Before deploying fixes:
- [ ] Test dashboard with orphaned EHIC records
- [ ] Test dashboard with orphaned PRC records
- [ ] Test citizen deletion with active records
- [ ] Test citizen deletion without active records
- [ ] Verify error messages are user-friendly
- [ ] Check logs contain sufficient debugging information

---

## 8. Security Considerations

### Chapter 8.1: Information Disclosure

Current error reveals internal paths:
```
at E:\_Applications\__ZNDPRODS\qrgen\routes\prcRoutes.js:245:117
```

**Recommendation**: Ensure production error handler sanitizes stack traces

### Chapter 8.2: Denial of Service Risk

If many records have null references, the dashboard endpoint could:
- Generate excessive warning logs
- Consume memory building error messages
- Create performance bottlenecks

**Mitigation**:
1. Limit query results (already has `.limit(10)` - good)
2. Add circuit breaker for error scenarios
3. Cache dashboard data for users with problematic records

### Chapter 8.3: Audit Trail

When citizen records are deleted:
- [ ] Log who deleted the record
- [ ] Log timestamp of deletion
- [ ] Log count of affected EHIC/PRC records
- [ ] Consider soft-delete pattern instead of hard delete

---

## 9. Implementation Priority

### Phase 1: Critical Fixes (Immediate - Within 24 hours)

**Priority**: Critical
**Effort**: 2-4 hours

1. **Fix prcRoutes.js:245** - Add null check for EHIC citizen references
2. **Fix prcRoutes.js:265** - Add null check for PRC citizen references
3. **Fix ehicRoutes.js:393** - Add null check in EHIC route
4. **Fix ehicRoutes.js:457** - Add null check in EHIC route
5. **Deploy hotfix** to production

**Success Criteria**: No more null reference errors in dashboard

### Phase 2: Comprehensive Audit (Week 1)

**Priority**: High
**Effort**: 8-16 hours

1. **Audit all 59 .populate() instances** across 6 route files
2. **Add null checks** where populated data is accessed
3. **Extract helper functions** for common patterns
4. **Add unit tests** for null scenarios
5. **Update documentation** with safe patterns

**Success Criteria**: All routes handle null references gracefully

### Phase 3: Data Integrity (Week 2)

**Priority**: High
**Effort**: 8-12 hours

1. **Add Mongoose pre-delete hooks** to prevent orphaned records
2. **Create data cleanup script** to identify existing orphans
3. **Resolve orphaned records** (contact stakeholders for guidance)
4. **Add database constraints** if applicable
5. **Implement soft-delete pattern** for citizens (optional)

**Success Criteria**: No orphaned records in database

### Phase 4: Testing & Monitoring (Week 3)

**Priority**: Medium
**Effort**: 8-12 hours

1. **Add integration tests** for delete workflows
2. **Add monitoring alerts** for null reference errors
3. **Implement dashboard caching** for performance
4. **Add health check endpoint** that validates data integrity
5. **Create runbook** for handling similar issues

**Success Criteria**: Comprehensive test coverage and proactive monitoring

### Phase 5: Long-term Improvements (Month 2)

**Priority**: Medium
**Effort**: 16-24 hours

1. **Refactor route handlers** to use service layer pattern
2. **Implement repository pattern** for database access
3. **Add API response schemas** with TypeScript/JSDoc
4. **Create coding standards document**
5. **Set up pre-commit hooks** for code quality

**Success Criteria**: Improved architecture and code maintainability

---

## 10. Code Review Checklist

Before approving any PR that uses `.populate()`:

- [ ] Does the code check if the populated field is null?
- [ ] Is there a sensible fallback value or error message?
- [ ] Are there unit tests covering the null case?
- [ ] Is the error logged appropriately for debugging?
- [ ] Does the user see a friendly error message (not a crash)?

---

## 11. Monitoring & Alerting

### Recommended Metrics

1. **Error Rate by Route**
   - Alert if dashboard error rate > 1% of requests

2. **Null Reference Count**
   - Track occurrences of null populated fields
   - Alert if trend is increasing

3. **Data Integrity Score**
   - Percentage of records with valid references
   - Alert if score drops below 95%

### Logging Strategy

```javascript
// Add structured logging for null references
if (!record.citizenId) {
    logger.warn('NULL_REFERENCE', 'Populated field is null', {
        collection: 'EHIC',
        recordId: record._id,
        field: 'citizenId',
        impact: 'dashboard_rendering'
    });
}
```

---

## 12. Additional Findings

### Dependency Security
From package.json, security scanning is configured:
```json
"security:scan:critical": "trivy fs . --severity CRITICAL,HIGH --exit-code 1"
```

**Recommendation**: Run security scan after fixes:
```bash
npm run security:scan:full
```

### Code Coverage
Current coverage requirement: 80% across all metrics

**Recommendation**: Ensure new null-check code paths are tested to maintain coverage

---

## 13. Conclusion

This architectural scan revealed systematic null-reference vulnerabilities stemming from insufficient defensive programming around Mongoose's `.populate()` operations. While the immediate fix is straightforward (adding null checks), the underlying issue points to broader concerns about data integrity and referential constraint enforcement.

### Key Takeaways

1. **Immediate Action Required**: 4 critical null-check fixes needed
2. **Systemic Issue**: 59 populate operations require audit
3. **Root Cause**: Lack of referential integrity enforcement at database/application level
4. **Prevention**: Need coding standards and automated checks for safe patterns

### Next Steps

1. **Deploy Phase 1 fixes** immediately to resolve production errors
2. **Schedule Phase 2 audit** within next sprint
3. **Plan Phase 3 data integrity** work with stakeholder input
4. **Establish code review checklist** to prevent recurrence

---

## Appendix A: Affected Files Summary

| File | Populate Count | Confirmed Issues | Priority |
|------|---------------|------------------|----------|
| prcRoutes.js | 30 | 2 | Critical |
| ehicRoutes.js | 7 | 2 | Critical |
| institutionRequestRoutes.js | 10 | TBD | High |
| resolverRoutes.js | 6 | TBD | Medium |
| adminRoutes.js | 3 | TBD | Medium |
| certRoutes.js | 3 | TBD | Medium |

---

## Appendix B: Reference Links

- **Mongoose Populate Documentation**: https://mongoosejs.com/docs/populate.html
- **MongoDB Referential Integrity**: https://www.mongodb.com/docs/manual/core/data-model-design/
- **Express Error Handling**: https://expressjs.com/en/guide/error-handling.html
- **Project Repository**: https://github.com/Flossed/prc-qr-generator

---

**Document Version**: 1.0
**Last Updated**: 2025-10-29
**Next Review**: After Phase 1 completion
