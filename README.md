# PRC QR Generator

**Version:** 0.0.4
**Release Date:** October 27, 2025
**Author:** Daniel S.A. Khan (c)
**License:** MIT

A comprehensive eEHIC-compliant Provisional Replacement Certificate (PRC) generator with advanced cryptographic support, high-quality PDF generation, and email distribution capabilities.

## Overview

The PRC QR Generator is a Node.js application designed to generate, manage, and distribute Provisional Replacement Certificates (PRCs) for the European Health Insurance Card (EHIC) system. The application supports multi-phase document generation with JWT signing, QR code embedding, and PDF creation following eEHIC specifications.

## Key Features (v0.0.4)

### 🔐 Cryptographic Certificate Management
- **RSA Certificates**: Support for RS256, RS384, RS512 with 2048/3072/4096-bit keys
- **Elliptic Curve Certificates**: ES256 with P-256 curve (prime256v1/secp256r1)
- Faster key generation for EC (1-2 seconds vs 2-10 seconds for RSA)
- Equivalent security: 256-bit EC ≈ 3072-bit RSA
- Dynamic UI for algorithm selection with automatic field switching

### 📄 eEHIC-Compliant PDF Generation
- Professional PDF layout matching eEHIC specifications
- Proper Helvetica fonts with correct sizing (12pt/9pt/8pt)
- Numbered fields (1-9) with boxed layout
- Side-by-side field arrangements for optimal space utilization
- Embedded high-quality QR codes in signature boxes
- Notes section with eEHIC specifications and disclaimers
- Generation timestamp footer

### 🎨 High-Quality QR Code Generation
- SVG-first generation for vector quality
- Sharp library integration for PNG conversion at 3x resolution
- Automatic QR version optimization for smallest scannable code
- BASE45 encoding with ZLIB compression
- Centered placement in signature boxes with proper sizing
- Fallback to standard generation if Sharp unavailable

### 📧 Email Distribution System
- Professional HTML email templates
- PDF document attachments
- QR code image attachments
- Embedded QR codes in email body
- Plain text fallback for compatibility
- SMTP and Gmail support
- Email metadata tracking (sent status, timestamp, recipient)

### 👥 User Management & Roles
- Multi-role support: Citizens, Issuers, System Administrators (Domain Owners)
- Institution-based access control
- Join request workflow for institutions
- Onboarding process for citizens
- Profile management with avatar upload

### 🏥 Institution Management
- Healthcare institution registration
- Institution creation requests with approval workflow
- Join institution requests for existing institutions
- Domain Owner oversight and management
- Institution-specific certificate management

### 📋 PRC Request & Approval Workflow
- Citizen PRC request submission
- Issuer approval/rejection workflow
- Automatic PDF and QR code generation upon approval
- Email notifications for status updates
- Document history tracking
- Revocation support

### 🔒 Security Features
- JWT-based authentication with secure session management
- Bcrypt password hashing
- Role-based access control (RBAC)
- Certificate thumbprint calculation with SHA-256
- Private key encryption and secure storage
- Input validation with express-validator
- CSRF protection ready

## Technical Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 4.21.2
- **Database:** MongoDB with Mongoose 8.0.3
- **Session Store:** connect-mongo 5.1.0
- **Authentication:** JWT (jsonwebtoken 9.0.2), bcrypt 5.1.1
- **Email:** Nodemailer 7.0.6

### PDF & QR Generation
- **PDF:** PDFKit 0.17.2
- **QR Codes:** qrcode 1.5.4
- **Image Processing:** Sharp 0.34.4
- **Compression:** pako 2.1.0 (ZLIB), base45 2.0.0

### Frontend
- **Template Engine:** EJS 3.1.10
- **CSS Framework:** Bootstrap 5.3.0
- **Icons:** Bootstrap Icons 1.10.5
- **Layouts:** express-ejs-layouts 2.5.1

### Validation & Security
- **Schema Validation:** ajv 8.12.0, ajv-formats 2.1.1
- **Input Validation:** express-validator 7.0.1
- **File Upload:** express-fileupload 1.5.1
- **CORS:** cors 2.8.5

### Development & Testing
- **Testing:** Mocha 10.2.0, Chai 5.2.1
- **Coverage:** NYC 17.1.0
- **Linting:** ESLint 8.50.0
- **Dev Server:** Nodemon 2.0.15

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Flossed/qrgen.git
   cd qrgen
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory:
   ```env
   # Application
   NODE_ENV=development
   PORT=4400
   BASE_URL=http://localhost:4400

   # Database
   MONGODB_URI=mongodb://localhost:27017/prc-generator

   # Session
   SESSION_SECRET=your-secure-session-secret-here

   # Email (Option 1: Custom SMTP)
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=your-email@example.com
   SMTP_PASS=your-password
   SMTP_SECURE=false

   # Email (Option 2: Gmail)
   GMAIL_USER=your-email@gmail.com
   GMAIL_PASS=your-app-password

   # Email Settings
   FROM_NAME=PRC Generator System
   FROM_EMAIL=noreply@prcgenerator.eu
   ADMIN_EMAIL=admin@prcgenerator.eu
   ```

4. **Initialize database**
   ```bash
   npm run setup:domain-owner
   ```

5. **Start the application**
   ```bash
   # Production
   npm start

   # Development (with auto-reload)
   npm run dev
   ```

6. **Access the application**

   Open your browser and navigate to: `http://localhost:4400`

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run setup:domain-owner` - Create initial Domain Owner account
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run security:scan` - Run security vulnerability scan
- `npm run security:scan:full` - Full security scan with multiple report formats

## Configuration

### Email Configuration

The application supports two email configurations:

#### Custom SMTP
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_SECURE=false
```

#### Gmail
```env
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password
```

Note: For Gmail, you need to create an [App Password](https://support.google.com/accounts/answer/185833).

### MongoDB Configuration

Default connection string: `mongodb://localhost:27017/prc-generator`

For production, use a secure MongoDB connection string with authentication:
```env
MONGODB_URI=mongodb://username:password@host:port/database?authSource=admin
```

## User Roles

### Citizen/User
- Request PRC documents
- View personal PRC history
- Download approved PRCs
- Email PRCs to recipients
- Manage profile and avatar

### Issuer (Healthcare Institution Administrator)
- Approve/reject PRC requests
- Generate certificates for institution
- Manage institution members
- View institution-specific reports

### System Administrator (Domain Owner)
- Manage all institutions
- Approve institution creation requests
- Approve institution join requests
- System-wide oversight
- User management

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/logout` - User logout
- `GET /auth/profile` - View profile
- `POST /auth/profile` - Update profile

### PRC Management
- `GET /prc/dashboard` - PRC dashboard
- `GET /prc/create` - PRC creation form
- `POST /prc/create` - Submit PRC request
- `GET /prc/:id` - View PRC details
- `GET /prc/:id/download` - Download PRC PDF
- `POST /prc/:id/send-email` - Send PRC via email
- `GET /prc/history` - View PRC history

### Certificate Management
- `GET /certificates` - List certificates
- `GET /certificates/create` - Certificate creation form
- `POST /certificates/create` - Create new certificate
- `GET /certificates/:id` - View certificate details
- `DELETE /certificates/:id` - Delete certificate

### Institution Management
- `GET /institutions` - List institutions
- `POST /institution-request/create` - Request institution creation
- `POST /institution-request/join` - Request to join institution
- `GET /institution-request/pending-creations` - View pending creation requests
- `GET /institution-request/pending-joins` - View pending join requests

## Database Models

### User
- Personal information (name, email, DOB)
- Authentication credentials (hashed password)
- Role (citizen, issuer, admin)
- Institution affiliation
- Profile settings (avatar, language)

### Certificate
- Cryptographic keys (RSA/EC)
- Algorithm (RS256/RS384/RS512/ES256)
- Key size (RSA) or curve (EC)
- Issuer information
- Validity period
- Usage tracking

### PRC
- Card holder information
- Institution details
- Validity period
- JWT token
- QR code data
- PDF buffer
- Email metadata
- Status (active, revoked)

### PRCRequest
- Citizen information
- Institution details
- Travel dates
- Status (pending, approved, rejected)
- Approval/rejection details

### Institution
- Name and country
- Institution ID
- Contact information
- Status

## Security Considerations

1. **Password Security**
   - Passwords are hashed using bcrypt with salt rounds
   - No plain-text password storage

2. **Session Management**
   - Sessions stored in MongoDB
   - Secure session cookies with httpOnly flag
   - Session timeout configuration

3. **Certificate Security**
   - Private keys stored encrypted in database
   - Thumbprint verification using SHA-256
   - Certificate usage tracking

4. **Input Validation**
   - All user inputs validated with express-validator
   - XSS protection through EJS auto-escaping
   - SQL injection prevention through Mongoose

5. **Access Control**
   - Role-based access control (RBAC)
   - Permission checks on all sensitive routes
   - Institution-based data isolation

## Recent Changes (v0.0.4)

### Added
- ✨ Elliptic Curve P-256 (ES256) certificate support
- ✨ High-quality PDF generation with embedded QR codes
- ✨ Email distribution system for PRC documents
- ✨ Optimal QR code generation using Sharp library
- ✨ Dynamic certificate creation UI with algorithm selection
- ✨ Email metadata tracking (sent status, timestamp, recipient)

### Improved
- 🎨 PDF layout matching eEHIC specifications
- 🎨 QR code quality with 3x resolution rendering
- 🎨 Certificate creation workflow with RSA/EC support
- 🔧 Permission checks for PRC email sending

### Fixed
- 🐛 JSON parsing error when sending PRC emails
- 🐛 Missing `/prc/:id/send-email` route
- 🐛 Certificate search by institution ID

### Technical
- 📦 Added Sharp 0.34.4 for image processing
- 📦 Updated certificate model schema
- 📦 Added email-related fields to PRC model

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or contributions, please visit:
- **Issues:** https://github.com/Flossed/qrgen/issues
- **Repository:** https://github.com/Flossed/qrgen

## Acknowledgments

- eEHIC specifications for PRC format guidelines
- European Commission for EHIC system standards
- Node.js and Express.js communities
- All contributors to the open-source libraries used

---

**Built with ❤️ for healthcare interoperability across Europe**
