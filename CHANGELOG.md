# Changelog

All notable changes to the PRC QR Generator project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4] - 2025-10-27

### Added
- **Elliptic Curve P-256 (ES256) Certificate Support**
  - Added ES256 algorithm support alongside existing RSA algorithms
  - Implemented EC key pair generation with P-256 curve (prime256v1/secp256r1)
  - Added `curve` field to Certificate model for EC algorithms
  - Made `keySize` optional (only required for RSA algorithms)
  - Created `generateECKeyPair()` static method in Certificate model
  - ES256 provides equivalent security to 3072-bit RSA with smaller keys (256-bit)
  - Faster key generation: 1-2 seconds for EC vs 2-10 seconds for RSA

- **Enhanced PDF Generation**
  - Replicated eEHIC-compliant PDF format from qrscanapp
  - Proper Helvetica fonts with correct sizing (12pt bold titles, 9pt fields, 8pt footer)
  - Numbered fields (1-9) matching eEHIC specifications
  - Boxed layout with 0.5pt line weight for cleaner appearance
  - Side-by-side field arrangements for optimal space utilization
  - Signature box with embedded high-quality QR code
  - Notes section with eEHIC specifications and disclaimers
  - Generation timestamp footer
  - Refactored `addPRCContent()` method to match qrscanapp format
  - Created `addQRCodeInSignatureBox()` method for QR code embedding

- **High-Quality QR Code Generation**
  - Implemented optimal QR code generation using Sharp library
  - SVG-first generation for vector quality
  - Sharp-based PNG conversion at 3x resolution for crisp output
  - Automatic QR version optimization to find smallest scannable code
  - Created `generateOptimalQRCodeImage()` method
  - Created `findOptimalQRVersion()` method for optimization
  - Centered QR code placement in signature boxes with proper sizing
  - Fallback to standard generation if Sharp is unavailable

- **Email Distribution System**
  - Added `POST /prc/:id/send-email` route for sending PRCs via email
  - Email validation with express-validator
  - Comprehensive permission checks (admin, generator, citizen owner)
  - Status checks to prevent sending revoked PRCs
  - Integration with EmailService for professional email delivery
  - Email includes PDF attachment and embedded QR code image
  - Professional HTML email template with PRC details
  - Plain text fallback for email clients without HTML support
  - Updates PRC metadata with email information
  - Added `emailSent`, `emailSentAt`, and `emailRecipient` fields to PRC model

- **Certificate Management UI Improvements**
  - Updated certificate creation form with algorithm optgroups
  - Dynamic form fields that switch between RSA key size and EC curve
  - Automatic field display based on selected algorithm
  - Updated algorithm information section with EC details
  - Improved preview functionality for EC certificates
  - Progress messages now reflect algorithm type (RSA vs EC)

- **Dependencies**
  - Added Sharp 0.34.4 for high-quality image processing (73 packages total)

### Changed
- Certificate model schema to support both RSA and EC algorithms
- Certificate validation to accept ES256 algorithm
- Certificate creation logic to conditionally generate RSA or EC keys
- Certificate storage to include curve field for EC certificates
- PRC model schema to include email metadata fields
- PDF generation pipeline to use new layout format
- QR code generation to prioritize optimal method with Sharp

### Fixed
- JSON parsing error when sending PRC emails (route was missing)
- Server returning 404 HTML instead of JSON for email endpoint
- Frontend JavaScript attempting to parse HTML as JSON
- Certificate search now properly matches institution ID
- Email sending now returns proper JSON responses

### Technical Details

#### Models Modified
- `models/Certificate.js`
  - Added `curve` field (String, optional, for EC algorithms)
  - Modified `keySize` to be conditionally required
  - Updated `algorithm` enum to include 'ES256'
  - Added `generateECKeyPair()` static method

- `models/PRC.js`
  - Added `emailSent` field (Boolean)
  - Added `emailSentAt` field (Date)
  - Added `emailRecipient` field (String)

#### Routes Modified
- `routes/certRoutes.js`
  - Updated validation to accept ES256 algorithm
  - Updated validation to make keySize optional
  - Added curve field validation
  - Implemented conditional key generation (RSA vs EC)
  - Certificate creation now stores curve for EC certificates

- `routes/prcRoutes.js`
  - Added `POST /:id/send-email` route (lines 1305-1437)
  - Implemented email validation with express-validator
  - Added permission checks for email sending
  - Added status checks to prevent sending revoked PRCs
  - Integration with EmailService
  - PRC metadata updates after email sent

#### Services Modified
- `services/qrCodeService.js`
  - Added `generateOptimalQRCodeImage()` method (lines 98-156)
  - Added `findOptimalQRVersion()` method (lines 158-197)
  - Updated `generateQRCodeImage()` to try optimal method first
  - SVG to PNG conversion at 3x resolution using Sharp
  - Automatic fallback to standard generation

- `services/pdfService.js`
  - Completely refactored `addPRCContent()` method (lines 58-318)
  - Changed fonts to Helvetica family with proper sizing
  - Implemented boxed layout with numbered fields
  - Added `addQRCodeInSignatureBox()` method (lines 320-391)
  - Improved visual hierarchy and spacing
  - Added notes section and footer with timestamps

#### Views Modified
- `views/certificates/create.ejs`
  - Updated page title from "Create New RSA Certificate" to "Create New Certificate"
  - Added algorithm optgroups (RSA Algorithms / Elliptic Curve Algorithms)
  - Added ES256 option in dropdown
  - Created dynamic `keySizeContainer` and `curveContainer` fields
  - Added JavaScript functions for algorithm switching
  - Updated preview function to handle EC certificates
  - Updated progress messages for algorithm-specific generation
  - Added EC algorithm information to help section

### Closed Issues
- #1 - Add EC P-256 Certificates, Improve PDF Layout, and Fix Email Functionality (merged)

### Pending Issues
None

### Security Notes
- EC keys use industry-standard P-256 curve
- Private keys continue to be stored encrypted
- No breaking changes to existing RSA certificate security
- Email validation prevents invalid recipient addresses
- Permission checks ensure only authorized users can send emails

### Migration Notes
- No database migration required (new fields are optional)
- Existing RSA certificates continue to work unchanged
- Email functionality requires SMTP configuration in `.env` to work
- Sharp dependency auto-installs with `npm install`
- Backward compatible with all existing features

### Commit History
```
c7adce6 feat: Add EC P-256 certificates, improve PDF layout, and fix email functionality
79fd7d1 Merge pull request #1 from Flossed/feature/ec-certificates-pdf-email
```

---

## [0.0.3] - Previous Release

### Features
- PRC request and approval workflow
- Certificate management for institutions
- Institution registration and management
- User onboarding process
- JWT-based authentication
- Role-based access control
- PDF generation with QR codes
- Multi-phase PRC generation
- Dashboard for citizens and issuers
- Profile management with avatars

### Technical Stack
- Express.js 4.21.2
- MongoDB with Mongoose 8.0.3
- PDFKit 0.17.2
- QRCode 1.5.4
- Bootstrap 5.3.0
- EJS templates

---

## [0.0.2] - Initial Release

### Features
- Basic application structure
- User authentication
- Database models
- Initial routing

---

## Version History

- **0.0.4** (2025-10-27) - EC certificates, improved PDF, email system
- **0.0.3** (Previous) - PRC workflow, institution management
- **0.0.2** (Initial) - Basic application structure

---

**Note:** This changelog follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
