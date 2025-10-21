# PRC QR Generator - Project Outline and Specifications

## Project Overview

The PRC QR Generator is a comprehensive web application that simulates a European healthcare institution's EHIC (European Health Insurance Card) issuance system. It generates electronic EHIC Provisional Replacement Certificates (ePRCs) with QR codes containing EHIC data in an EIDAS-compliant format.

### Purpose
1. **Generate ePRCs with QR codes** for testing verification systems
2. **Demonstrate the flow** for creating material-based Verifiable Credentials
3. **Provide a playground** for users to experiment with PRC concepts
4. **Ensure cryptographic integrity** through self-contained, tamper-resistant documents

## Technical Architecture

### Technology Stack
- **Runtime**: Node.js 20.19.0
- **Package Manager**: npm 10.8.2
- **Framework**: Express.js 4.21.2
- **Database**: MongoDB with Mongoose 8.0.3
- **View Engine**: EJS 3.1.10
- **Authentication**: bcrypt 5.1.1 + express-session 1.18.2
- **Styling**: Bootstrap 5.3.0 with responsive mobile-first design

### eEHIC Compliance Components
- **JWT Generation**: jsonwebtoken 9.0.2 with RS256/384/512 algorithms
- **QR Code Pipeline**: JWT → ZLIB (pako 2.1.0) → Base45 (base45 2.0.0) → QR Code (qrcode 1.5.4)
- **PDF Generation**: PDFKit 0.17.2 following Decision S2 specifications
- **Schema Validation**: AJV 8.12.0 with ajv-formats 2.1.1
- **Email Distribution**: Nodemailer 7.0.6

### Security Features
- **RSA Certificate Management**: 2048/3072/4096-bit keys
- **Kid Format**: EESSI:x5t#S256:[SHA-256 thumbprint]
- **Role-based Access Control**: User/Issuer/Admin roles
- **Session Security**: Encrypted sessions with MongoDB storage

## Application Structure

### Directory Organization (MVC Pattern)
```
qrgen/
├── config/                     # Configuration files
├── controllers/                # MVC Controllers (no separate routes)
├── documentation/              # Project documentation
├── models/                     # Mongoose data models
├── public/                     # Static assets
│   ├── css/                   # Stylesheets
│   ├── js/                    # Client-side JavaScript
│   ├── img/                   # Images
│   └── lang/                  # Translation files
├── schemas/                    # JSON Schema definitions
├── services/                   # Business logic and middleware
├── test/                      # Unit and integration tests
├── views/                     # EJS templates
└── index.js                   # Main application entry point
```

### Core Models

#### User Model
```javascript
{
  fullName: String,
  email: String (unique),
  password: String (hashed),
  role: Enum ['user', 'issuer', 'admin'],
  institutionName: String,      // For issuers
  institutionId: String,        // For issuers
  countryCode: String,          // For issuers
  loginAttempts: Number,
  accountLocked: Boolean,
  createdAt: Date,
  lastLoginAt: Date
}
```

#### Certificate Model
```javascript
{
  name: String,
  algorithm: Enum ['RS256', 'RS384', 'RS512'],
  keySize: Number [2048, 3072, 4096],
  publicKey: String,
  privateKey: String (encrypted),
  thumbprint: String,           // SHA-256
  kid: String,                  // EESSI:x5t#S256:thumbprint
  status: Enum ['pending', 'active', 'revoked'],
  purpose: String,
  usageCount: Number,
  createdBy: ObjectId,
  expiresAt: Date,
  createdAt: Date
}
```

#### PRC Model
```javascript
{
  // eEHIC Data Fields
  ic: String,      // Issuing country
  fn: String,      // Family name
  gn: String,      // Given name
  dob: Date,       // Date of birth
  hi: String,      // Health insurance ID
  in: String,      // Institution name
  ii: String,      // Institution ID
  ci: String,      // Card ID (optional)
  xd: Date,        // Card expiry (optional)
  sd: Date,        // Start date
  ed: Date,        // End date
  di: Date,        // Issue date

  // System Fields
  jti: String,     // JWT ID
  status: Enum ['draft', 'active', 'revoked'],
  createdBy: ObjectId,
  certificateUsed: ObjectId,
  qrCodeData: String,
  pdfBuffer: Buffer,
  emailSent: Boolean,
  createdAt: Date
}
```

## Multi-Phase Generation Workflow

### Phase 1: Data Input & Validation
- **Form Fields**: All eEHIC required and optional fields
- **Real-time Validation**: Field format, business rules, date logic
- **Institution Auto-fill**: From user profile for issuers
- **Business Rules**: Date relationships, field length limits

### Phase 2: JWT Creation & Preview
- **Certificate Selection**: Active RSA certificates for signing
- **Payload Construction**: eessi:prc:1.0 schema compliance
- **JWT Generation**: RS256/384/512 with proper headers
- **Validation**: Schema validation and JWT verification

### Phase 3: QR Code Generation
- **Pipeline**: JWT → ZLIB compression → Base45 encoding → QR Code
- **Optimization**: Alphanumeric mode, error correction level L
- **Statistics**: Compression ratios, QR version calculation
- **Testing**: Round-trip verification (decode back to JWT)

### Phase 4: PDF Generation & Email
- **PDF Layout**: Decision S2 specification compliance
- **QR Embedding**: Minimum 6cm² area requirement
- **Email Distribution**: HTML/text templates with attachments
- **Document Storage**: Secure PDF buffer storage

## Security Implementation

### RSA Certificate Management
- **Key Generation**: Cryptographically secure random generation
- **Storage**: Private keys encrypted at rest
- **Thumbprint**: SHA-256 calculation for Kid generation
- **Lifecycle**: Creation, activation, usage tracking, revocation

### Authentication & Authorization
- **Password Security**: bcrypt hashing with salt rounds
- **Session Management**: Secure cookie settings, MongoDB storage
- **Role-based Access**:
  - **Users**: View own documents
  - **Issuers**: Generate PRCs, manage certificates
  - **Admins**: Full system access, user management

### Data Validation
- **JSON Schema**: AJV validation for eEHIC payload structure
- **Business Rules**: Date logic, field relationships, length constraints
- **Input Sanitization**: XSS prevention, SQL injection protection

## User Interface Design

### Responsive Mobile-First Architecture
- **Framework**: Bootstrap 5.3.0 with custom CSS variables
- **Breakpoints**: Mobile-first responsive design
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### Key UI Components
- **Progress Indicators**: 4-phase workflow visualization
- **Form Validation**: Real-time feedback with error highlighting
- **Certificate Cards**: Status badges, usage statistics, action buttons
- **QR Code Display**: Interactive zoom, download options

### Navigation Structure
- **Public**: Login, Register, Information pages
- **Authenticated**: Dashboard, Profile, PRC Generation
- **Issuers**: Certificate Management, Institution settings
- **Admins**: User Management, System Reports, Analytics

## eEHIC Technical Compliance

### JWT Structure
```json
{
  "header": {
    "alg": "RS256|RS384|RS512",
    "typ": "JWT",
    "kid": "EESSI:x5t#S256:[thumbprint]"
  },
  "payload": {
    "jti": "unique_token_id",
    "sid": "eessi:prc:1.0",
    "prc": {
      // eEHIC data fields
    }
  }
}
```

### QR Code Pipeline
1. **JWT**: Signed token with eEHIC payload
2. **ZLIB**: Maximum compression (level 9)
3. **Base45**: RFC-compliant encoding for QR alphanumeric mode
4. **QR Code**: Error correction level L, optimal version selection

### PDF Specification Compliance
- **Format**: A4 size with 50pt margins
- **Layout**: Decision S2 structured sections
- **QR Placement**: Centered, minimum 6cm² area
- **Fonts**: Standard system fonts for compatibility
- **Metadata**: PDF/A compliance considerations

## Development & Testing

### Test Coverage Requirements
- **Framework**: Mocha with Chai assertions
- **Coverage**: nyc (Istanbul) targeting 100%
- **Types**: Unit tests, integration tests, end-to-end tests
- **CI/CD**: Automated testing on commits

### API Endpoints Structure
```
Authentication:
POST /auth/login
POST /auth/register
POST /auth/logout

PRC Generation:
GET  /prc/generate?phase=1-4
POST /prc/phase1 (data input)
POST /prc/phase2/generate-jwt
POST /prc/phase3/generate-qr
POST /prc/phase4/generate-pdf
POST /prc/phase4/send-email

Certificate Management:
GET  /certificates
POST /certificates/create
GET  /certificates/:id
POST /certificates/:id/activate
POST /certificates/:id/revoke
DELETE /certificates/:id

Administration:
GET  /admin/users
GET  /admin/reports
POST /admin/maintenance
```

## Configuration Management

### Environment Variables
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/qrgen
MONGODB_DB_NAME=qrgen

# Security
SESSION_SECRET=cryptographically_secure_secret
JWT_SECRET=jwt_signing_secret

# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password
GMAIL_USER=optional_gmail
GMAIL_PASS=optional_gmail_app_password

# Application
PORT=3000
NODE_ENV=development|production
FROM_EMAIL=noreply@prcgenerator.eu
ADMIN_EMAIL=admin@prcgenerator.eu
```

## Deployment Considerations

### Production Readiness
- **Environment Configuration**: Separate dev/staging/production configs
- **Database Security**: Connection encryption, access controls
- **SSL/TLS**: HTTPS enforcement, security headers
- **Logging**: Structured logging with @zandd/app-logger
- **Monitoring**: Application health checks, performance metrics

### Scalability Considerations
- **Database Indexing**: Optimized queries for certificates, users, PRCs
- **Session Storage**: MongoDB session store for horizontal scaling
- **File Storage**: Consider cloud storage for PDF buffers in production
- **Caching**: Redis consideration for session and certificate caching

## Compliance & Legal

### GDPR Considerations
- **Data Minimization**: Only collect necessary eEHIC fields
- **Consent Management**: Clear consent flows for data processing
- **Right to Erasure**: User account deletion workflows
- **Data Portability**: Export functionality for user data

### Healthcare Data Security
- **Encryption**: Data at rest and in transit
- **Audit Logging**: Comprehensive action logging
- **Access Controls**: Role-based permissions
- **Data Retention**: Configurable retention policies

## Future Enhancements

### Planned Features
- **Multi-language Support**: i18n implementation with public/lang files
- **Advanced Analytics**: Usage statistics, performance dashboards
- **Batch Processing**: Bulk PRC generation capabilities
- **API Documentation**: OpenAPI/Swagger integration
- **Mobile App**: Native mobile application development

### Integration Possibilities
- **Healthcare Systems**: HL7 FHIR integration
- **Identity Providers**: SAML/OAuth integration
- **Document Management**: External storage system integration
- **Notification Systems**: SMS, push notification capabilities

---

## Development Status

### Completed Components ✅
- [x] Application framework and MVC structure
- [x] User authentication and role-based access control
- [x] RSA certificate generation and management
- [x] 4-phase PRC generation workflow
- [x] JWT creation with eEHIC schema validation
- [x] QR code generation pipeline (JWT→ZLIB→Base45→QR)
- [x] PDF generation according to Decision S2 specifications
- [x] Email distribution system
- [x] Responsive mobile-first UI
- [x] Certificate management interface
- [x] Dashboard and navigation

### Ready for Implementation
The application framework is complete and ready for deployment. All core eEHIC compliance requirements have been implemented according to the technical specifications. The system provides a comprehensive solution for generating, managing, and distributing Provisional Replacement Certificates with cryptographically secure QR codes.

---

*Generated with Claude Code - eEHIC Compliant PRC Generator v1.0.0*
*Last Updated: {{ current_date }}*