# QR Code Generator
## Abstract 
This application will simulates a european healthcare Insititutions EHIC issuance application which can issue electronic EHIC Profisional replacement Certificates that are regular PRCS extended with a QR code whic contains the EHIC in a EIDAS compliant way.

The purpose of the application is to:
1. have an application which can generate ePRC's with a QR code for testing the verifier. 
2. allowing users to see and understand the flow for creating material based Verifiable Credentials.
3. be a playground for users to play around with the concept of PRC. 

For this we use the specifications of the eEhic which defines the data specification of the payload of the ehic and the technical envelop. 
The important design decision is to create a self contained document which is cryptographicall sealed and can prove in a 
none repudaited way the information concerning the issuer of the document and the information in the document, which is due to the sealing tamper resistant. 

## Referenced documentation: 
1. eEHIC - Technical Specifications.pdf



# Software stack and used formats.
Used programming if : CommonJS.
## Used NPM modules
- node.js :  20.19.0
- npm : 10.8.2
- mongodb with mongoose :  8.0.3
- @zandd/app-logger : 1.1.1
- ajv : 8.12.0
- ajv-formats : 2.1.1
- axios : 1.6.2 
- base45 : 2.0.0 
- bcrypt : 5.1.1 
- body-parser : 1.20.2 
- crypto : 1.0.1 
- ejs : 3.1.9 
- express : 4.18.2 
- express-session : 1.17.3 
- html5-qrcode : 2.3.8 
- jsonwebtoken : 9.0.2 
- jsqr : 1.4.0 
- mongoose : 8.0.3 
- multer : 2.0.2 
- node-qr-image : 0.0.1 
- nodemailer : 7.0.6 
- pako : 2.1.0 
- pdfkit : 0.17.2 
- qrcode : 1.5.4 
- qrcode-generator : 2.0.4 
- qrcode-reader : 1.0.4 
- sharp : 0.34.4  
- nodemon : 3.0.2



# Functionality: 
The application will have the following functionalities. 
##  User management according to : 
##  Citzens Dashboard from which a citizen can request the PRC. see passed request, and request reissuance of past requests.
##  Health Care Dashboard from which a Clerk from the insitution can see the EHIC requests and is able to approve, issue and revoke.
## Admin dashboard from which an Administrator can see the usage, post maintenance banners. Create Reports based on KPI's, manage users 

### Request PRC flow:
#### Requirements. 
1. the citizen has an account, can access his account, and has a complete profile set up which contains the personal information of an EHIC.
2. the citizen has chosen a Healthcare insitution and is registered and know by an ID. 

#### Flow Citizen EHIC request flow 
1. the citizen log on to the system
2. after successfull login the citizen sees its dashboard, he can see past requested EHIC's and can request a new one. 
3. upon requesting the EHIC , the citizen needs to identify to which country he will travel for which he requires the EHIC and the travel to and return date.
4. based on the choice made the system can warn if the receiving coutrny supports ehic or not
5. the citizen receive a status message the the request was done, and that he will receive the outcome within 10 working days. An email is sent to the users email box stating that the 
  

Data from the PRC comes from 3 sources 
1. profile of the user for all user related data.  has a relation with the healthcare institution 1:1, and a relation with the ehic created for the user 1:many
2. profile of the chosen healthcare institution for all the healtcare related information. has a relation with the user 1:1, and a relation with the ehic created for the insitution 1:many
3. the list of EHIC's which are entitlements for which the data of the QR code can be generated. see abov for the relations.

in the proces after requestin gthe EHIC first an Ehic request is checked to see if it is a valid request, aftwer which the ehic is created. 


## Template
For the file structure use:   E:\_Applications\___Claude\TEMPLATE as a template to create. 

### Directory structure : 
* .git : a local git repository
* config : which contains a json file which contains all the configurable items in the project.
* controllers : which according to MVC pattern contains the all the controllers that manage the project every endpoint * including API endpoint will have a separate controller in this directory. (there is no separate route directory.)
* documentation : for all the documents created during this creation process, excluding Readme.md and changelog.md which are in the root of the projectdirectory. 
* models : containing the MODELS fromthe MVC pattern which are all created in mongoose
* public : containing all the static content required on serverside
*public\CSS for stylesheets, 
* public\js for clientside javascript, 
* public\img for images used in the project, 
* public\lang for all the translated text files used in the application ( purpose to support multilingual applications)
* services : for all the middleware and business logic created which is to contain the bulk of the processing and business logic and is * called from the controllers.
* test : for all unit and integration tests created using mocha, nyc, chai in a tdd approach should have 100% coverage
* views : containing the VIEW in the MCV pattern which are EJS files 
*         the EJS files do not contain:
*         - CSS this will go in the public/css subdirectory.
*         - javascript this goes in the public/js subdirectory where the javascript file bares the same name as the view * file and is included in the ejs file at the end. 
*         The ejs file does contain: 
*         - templates for header, footer and any other reocurring page elements that make up the style of the application.
*         
* The main file will be called index.js
* there is a showChangeCounts.js in the root to be copied from the template, which is a helper function for stats.
* there is a updateVersions.js in the root to be copied from the template, which is a helper function for stats.


---

# Version History

## Version 1.1.0 - Comprehensive Logging Enhancement

**Release Date**: October 20, 2025

### Overview
Enhanced the PRC Generator application with comprehensive logging capabilities using the @zandd/app-logger package. This enhancement provides detailed visibility into application behavior, function execution flow, and error tracking across all layers of the application.

### New Features

#### 1. Centralized Logger Configuration
- **Location**: `/config/logger.js`
- **Features**:
  - Module-based logger instances with caching
  - Environment-aware log levels (trace/debug/info/warn/error/exception)
  - Configurable file rotation and retention policies
  - Automatic parameter sanitization for sensitive data (passwords, tokens, keys)
  - Helper functions for standardized logging patterns

#### 2. Logger Configuration Options
```javascript
{
  logTracelevel: 'trace|debug|info|warn|error|exception',  // Environment-based default
  consoleOutput: 'on',                                      // Colorized console output
  logPath: './logs/',                                       // Log file directory
  dateLocale: 'en-US',                                      // Date formatting
  fileRotation: true,                                       // Daily file rotation
  maxFileSize: '20m',                                       // Maximum file size
  maxFiles: '14d'                                           // Retention period
}
```

#### 3. Comprehensive Logging Implementation

**Main Application (index.js)**:
- Application initialization and configuration logging
- MongoDB connection status and events
- Route registration tracking
- Server startup information
- Error handling with full context
- 404 request logging

**JWT Service (jwtService.js)**:
- Function entry/exit tracing for all methods
- Schema loading and compilation status
- JWT generation with certificate details
- Payload validation results
- Business rules validation tracking
- Exception handling with full error context

#### 4. Standardized Logging Patterns

**Function Entry Logging**:
```javascript
logEntry('functionName', { param1, param2 }, logger);
```

**Function Exit Logging**:
```javascript
logExit('functionName', { result }, logger);
```

**Exception Logging**:
```javascript
logException('functionName', error, { context }, logger);
```

**Debug Information**:
```javascript
logger.debug('Operation description', { relevant, data });
```

#### 5. Security Features
- **Automatic Sanitization**: Sensitive fields (password, token, secret, apiKey, privateKey, authorization) are automatically redacted
- **Structured Logging**: All logs include contextual metadata for better analysis
- **Error Stack Traces**: Full stack traces included in exception logs for debugging

### Log Output Format
```
DD.MM.YYYY, HH:MM:SS | LEVEL | Message | {"metadata": "object"}
```

Example:
```
20.10.2025, 10:50:08 | TRACE | → Entering JWTService.generateJWT | {"function":"JWTService.generateJWT","params":{"certificateKid":"EESSI:x5t#S256:abc123"}}
20.10.2025, 10:50:08 | DEBUG | Validating payload against schema |
20.10.2025, 10:50:08 | INFO  | JWT generated successfully | {"kid":"EESSI:x5t#S256:abc123","algorithm":"RS256"}
20.10.2025, 10:50:08 | TRACE | ← Exiting JWTService.generateJWT | {"function":"JWTService.generateJWT","hasResult":true}
```

### Log Levels
1. **TRACE** (5): Function entry/exit, detailed execution flow
2. **DEBUG** (6): Debug information, intermediate states
3. **INFO** (3): Important application events, successful operations
4. **WARN** (2): Warning conditions, potential issues
5. **ERROR** (1): Error conditions requiring attention
6. **EXCEPTION** (0): Critical exceptions with full context

### Environment Configuration

**Development Mode**:
- Log Level: `trace`
- Console Output: Enabled with colors
- File Logging: Optional (configurable)

**Production Mode**:
- Log Level: `info`
- Console Output: Enabled without colors
- File Logging: Enabled with rotation

**Environment Variables**:
```bash
LOG_LEVEL=trace|debug|info|warn|error|exception
LOG_DIR=./logs
LOG_FILE_ROTATION=true|false
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
```

### Benefits

1. **Debugging**: Complete function execution flow visibility
2. **Performance Monitoring**: Trace operation sequences and identify bottlenecks
3. **Error Tracking**: Full context for exceptions including stack traces
4. **Audit Trail**: Comprehensive record of all system operations
5. **Security**: Automatic sanitization of sensitive data
6. **Compliance**: Detailed logging for regulatory requirements

### Technical Implementation

**Dependencies Added**:
- `@zandd/app-logger@1.1.1` - Winston-based logging with custom levels

**Files Modified**:
- `/config/logger.js` - New logger configuration module
- `/index.js` - Application initialization logging
- `/services/jwtService.js` - Complete JWT service logging

**Files Pending Enhancement**:
- `/services/qrCodeService.js` - QR code generation logging
- `/services/pdfService.js` - PDF generation logging
- `/services/emailService.js` - Email service logging
- `/routes/*.js` - Route handler logging
- `/models/*.js` - Model operation logging
- `/middleware/*.js` - Middleware execution logging

### Usage Example

```javascript
const { getLogger, logEntry, logExit, logException } = require('../config/logger');
const logger = getLogger('ServiceName');

async function myFunction(param1, param2) {
    logEntry('myFunction', { param1, param2 }, logger);

    try {
        logger.debug('Processing operation', { step: 1 });
        const result = await performOperation();
        logger.info('Operation completed successfully', { resultId: result.id });

        logExit('myFunction', { success: true }, logger);
        return result;
    } catch (error) {
        logException('myFunction', error, { param1, param2 }, logger);
        throw error;
    }
}
```

### Future Enhancements
- Complete logging implementation across all remaining services, routes, and models
- Log aggregation and analysis dashboard
- Performance metrics extraction from logs
- Automated alerting based on error patterns
- Integration with external monitoring tools (e.g., ELK Stack, Datadog)

---

*This version enhances application observability and maintainability through comprehensive, structured logging at all layers of the application stack.*

---

## Version 1.2.0 - Security Vulnerability Scanning with Trivy

**Release Date**: October 20, 2025

### Overview
Integrated Trivy security scanning to provide comprehensive vulnerability detection, secret scanning, and misconfiguration identification across the entire application stack. This enhancement ensures continuous security monitoring and compliance with healthcare data protection requirements.

### New Features

#### 1. Trivy Integration
- **Tool**: Aqua Security Trivy - comprehensive security scanner
- **Capabilities**:
  - Vulnerability detection in dependencies
  - Secret detection (API keys, passwords, tokens)
  - Misconfiguration detection
  - Multiple output formats (table, JSON, SARIF)

#### 2. GitHub Actions Workflow
**Location**: `.github/workflows/trivy-bulletproof.yml`

**Automated Scanning**:
- **Push/PR triggers**: Scan on every push to master/main
- **Scheduled scans**: Daily at 2 AM UTC
- **Manual dispatch**: On-demand scanning with email option

**Workflow Features**:
- Multi-format report generation (SARIF, JSON, Table)
- Vulnerability counting and categorization
- HTML email reports with statistics
- GitHub Security tab integration
- Artifact uploads (30-day retention)
- Workflow summary with severity breakdown

#### 3. NPM Security Scripts
**Location**: `package.json` scripts section

```json
{
  "security:scan": "trivy fs . --config trivy.yaml",
  "security:scan:json": "trivy fs . --format json --output reports/trivy-report.json",
  "security:scan:sarif": "trivy fs . --format sarif --output reports/trivy-results.sarif",
  "security:scan:critical": "trivy fs . --severity CRITICAL,HIGH --exit-code 1",
  "security:scan:full": "Generate all report formats",
  "security:update": "trivy image --download-db-only"
}
```

#### 4. Configuration Files

**trivy.yaml** - Main configuration:
- Scan settings (vulnerabilities, secrets, misconfigurations)
- Severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- Skip patterns (node_modules, .git, logs, reports)
- Output format preferences
- Timeout and cache settings

**.trivyignore** - Vulnerability exceptions:
- Format for documenting accepted vulnerabilities
- Requires justification comments
- Subject to security review

#### 5. Comprehensive Documentation
**Location**: `documentation/TRIVY-SECURITY.md`

**Content**:
- Installation instructions (Windows/Linux/macOS)
- Local scanning guide
- NPM scripts usage
- GitHub Actions workflow details
- Configuration options
- Report format explanations
- Remediation procedures
- Best practices for healthcare compliance

### Security Features

#### Vulnerability Detection
- **Dependencies**: NPM package vulnerabilities
- **Direct**: Package-lock.json analysis
- **Transitive**: Full dependency tree scanning
- **Severity Levels**: CRITICAL, HIGH, MEDIUM, LOW

#### Secret Scanning
Detects exposed secrets:
- API keys
- Passwords
- Private keys (RSA certificates)
- JWT secrets
- Database credentials
- SMTP credentials

#### Misconfiguration Detection
Identifies security misconfigurations:
- Insecure configurations
- Weak security settings
- Missing security headers
- Improper access controls

### Report Generation

#### Report Formats

**Table Format** (`trivy-report.txt`):
```
┌────────────────────┬──────────────┬──────────┬────────┐
│      Library       │ Vulnerability│ Severity │  Status│
├────────────────────┼──────────────┼──────────┼────────┤
│ package@version    │ CVE-2024-xxx │ CRITICAL │ Fixed  │
└────────────────────┴──────────────┴──────────┴────────┘
```

**JSON Format** (`trivy-report.json`):
- Machine-readable format
- Automation-friendly
- Full vulnerability details

**SARIF Format** (`trivy-results.sarif`):
- GitHub Security tab integration
- Code scanning alerts
- Line-level vulnerability mapping

### Email Notifications

**Scheduled & Manual Scans**:
- HTML formatted email reports
- Vulnerability statistics table
- Severity-based prioritization
- Conditional messaging (critical alerts)
- Detailed report attachments
- Direct workflow link

**Email Template Features**:
- Color-coded severity levels
- Application information section
- Scan metadata
- Actionable recommendations

### Healthcare Compliance

#### Zero Tolerance Policy
Given healthcare data sensitivity (eEHIC):
- **CRITICAL vulnerabilities**: Immediate remediation required
- **HIGH vulnerabilities**: Fix within 1 week
- **MEDIUM vulnerabilities**: Fix within 1 month
- **LOW vulnerabilities**: Fix when convenient

#### Audit Trail
- All scans logged and stored
- 30-day artifact retention
- Vulnerability history tracking
- Remediation documentation

#### Regular Scanning
- **Daily**: Automated GitHub Actions scan
- **On-commit**: Pre-commit security check recommended
- **Pre-release**: Mandatory full security audit

### Integration Points

#### GitHub Security Tab
- SARIF upload to Security tab
- Vulnerability alerts in code view
- Integration with Dependabot
- Security policy enforcement

#### CI/CD Pipeline
- Automated scanning on push/PR
- Fail-fast on critical vulnerabilities
- Report generation for review
- Artifact archival

### Usage Workflow

#### Development
```bash
# Before commit
npm run security:scan:critical

# Full audit
npm run security:scan:full
```

#### Pre-Release
```bash
# Update database
npm run security:update

# Comprehensive scan
npm run security:scan:full

# Review all reports in reports/ directory
```

#### Continuous Monitoring
- GitHub Actions runs daily
- Email notifications for findings
- Security tab monitoring
- Regular dependency updates

### Benefits

1. **Proactive Security**: Early vulnerability detection
2. **Compliance**: Healthcare data protection requirements
3. **Automation**: No manual intervention needed
4. **Visibility**: Clear reporting and tracking
5. **Accountability**: Audit trail for compliance
6. **Integration**: Seamless GitHub workflow
7. **Education**: Security awareness through reporting

### Configuration Requirements

#### GitHub Secrets (Optional - for email)
```yaml
SMTP_SERVER: smtp.example.com
SMTP_PORT: 587
SMTP_USERNAME: your-email@example.com
SMTP_PASSWORD: your-app-password
SECURITY_EMAIL: security-team@example.com
SMTP_FROM_EMAIL: security@example.com
```

#### Local Setup
```bash
# Install Trivy (Windows)
choco install trivy

# Verify installation
trivy version

# Run first scan
npm run security:scan
```

### Remediation Process

1. **Identify**: Review scan reports
2. **Prioritize**: CRITICAL > HIGH > MEDIUM > LOW
3. **Update**: `npm update [package-name]`
4. **Test**: Verify application functionality
5. **Verify**: Re-scan to confirm fix
6. **Document**: Update security log

### Future Enhancements

- Integration with SIEM systems
- Automated remediation for low-risk updates
- Security dashboard development
- Compliance reporting automation
- Custom vulnerability policies
- Integration with issue tracking

### Files Added/Modified

**New Files**:
- `.github/workflows/trivy-bulletproof.yml` - GitHub Actions workflow
- `.trivyignore` - Vulnerability exception list
- `trivy.yaml` - Trivy configuration
- `documentation/TRIVY-SECURITY.md` - Comprehensive documentation

**Modified Files**:
- `package.json` - Added security scanning scripts
- `documentation/PRD.md` - This version history entry

### Compliance Notes

This security scanning implementation addresses:
- **GDPR**: Data protection requirements
- **HIPAA**: Healthcare data security (where applicable)
- **eEHIC**: European healthcare standards
- **OWASP**: Top 10 security risks
- **CWE**: Common weakness enumeration

---

*This version establishes a robust security framework ensuring continuous vulnerability monitoring and compliance with healthcare data protection standards.*
