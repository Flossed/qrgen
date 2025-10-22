# Domain Owner Setup Guide

## Overview

The Domain Owner (System Administrator) is a specialized administrative account in the PRC Generator system focused exclusively on healthcare institution management. This account does NOT generate or request PRCs - its sole purpose is to manage the institutional framework of the system.

## Purpose

The Domain Owner account is required to:
- **Approve/Reject Institution Creation Requests**: Review and process requests from issuers who want to create new healthcare institutions
- **Manage Healthcare Institutions**: Oversee all registered institutions within the system
- **Monitor Issuer Accounts**: View and manage all issuer accounts affiliated with institutions
- **System Reporting**: Access reports and analytics related to institutional operations

**IMPORTANT**: Domain Owners cannot generate PRCs, request PRCs, or manage certificates. These functions are exclusively reserved for issuers who are affiliated with healthcare institutions.

## Prerequisites

Before running the setup script, ensure:
1. MongoDB is running and accessible
2. Environment variables are configured in `.env` file
3. Node.js dependencies are installed (`npm install`)

## Installation

### Quick Start

Run the following command from the project root directory:

```bash
npm run setup:domain-owner
```

### What the Script Does

The setup script (`scripts/createDomainOwner.js`) will:

1. **Connect to Database**: Establishes connection to MongoDB using your configured connection settings
2. **Check for Existing Admin**: Verifies if a Domain Owner account already exists and prompts for confirmation before creating another
3. **Collect Information**: Interactively prompts for account details
4. **Validate Input**: Ensures all inputs meet security and format requirements
5. **Create Account**: Creates a new user with `role: 'admin'`
6. **Display Confirmation**: Shows account details and privileges

## Interactive Setup Process

### Step-by-Step Prompts

When you run the script, you'll be prompted for the following information:

#### 1. Username
- **Requirements**: 3-50 characters
- **Allowed Characters**: Letters, numbers, and underscores only
- **Example**: `domainadmin`, `system_admin`, `admin123`

#### 2. Email Address
- **Requirements**: Valid email format
- **Example**: `admin@example.com`, `sysadmin@healthcare.org`

#### 3. First Name
- **Requirements**: 1-50 characters
- **Example**: `John`

#### 4. Last Name
- **Requirements**: 1-50 characters
- **Example**: `Doe`

#### 5. Organization (Optional)
- **Requirements**: Up to 100 characters
- **Example**: `PRC System Administration`, `Healthcare IT Department`

#### 6. Password
- **Requirements**:
  - Minimum 8 characters
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one number (0-9)
- **Security**: Password input is masked (displayed as asterisks)
- **Example**: `Admin123!`, `SecurePass2024`

#### 7. Confirm Password
- **Requirements**: Must match the password entered above
- **Security**: Also masked during input

## Sample Execution

```
=== Domain Owner (System Administrator) Setup ===

✓ Connected to database

Please provide the following information:

Username (3-50 characters): domainadmin
Email address: admin@healthcare.org
First Name: Jane
Last Name: Smith
Organization (optional): PRC System

Password requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

Password: ********
Confirm Password: ********

Creating Domain Owner account...

✓ Domain Owner account created successfully!

Account Details:
  Username: domainadmin
  Email: admin@healthcare.org
  Name: Jane Smith
  Role: Domain Owner (System Administrator)
  Account ID: 507f1f77bcf86cd799439011

You can now login with these credentials and:
  • Approve/reject institution creation requests
  • Manage healthcare institutions
  • Monitor issuer accounts
  • Access system reports and analytics

Note: Domain Owners cannot generate PRCs or manage certificates.
```

## Validation & Security

### Input Validation

The script validates all inputs to ensure:
- **Username Uniqueness**: Checks if username already exists in the database
- **Email Uniqueness**: Verifies email is not already registered
- **Format Compliance**: Ensures all fields meet format requirements
- **Password Strength**: Validates password meets security requirements
- **Password Match**: Confirms password and confirmation match

### Security Features

- **Password Masking**: Passwords are never displayed on screen (shown as asterisks)
- **Secure Storage**: Passwords are hashed using bcrypt (cost factor 12) before storage
- **Connection Security**: Uses secure MongoDB connection with authentication
- **Audit Logging**: All operations are logged using @zandd/app-logger

## Error Handling

The script handles various error scenarios:

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Username already exists` | Username is already taken | Choose a different username |
| `Email already registered` | Email is already in use | Use a different email address |
| `Passwords do not match` | Password confirmation doesn't match | Re-enter passwords carefully |
| `Username must be between 3 and 50 characters` | Invalid username length | Provide a username within the valid range |
| `Please enter a valid email address` | Invalid email format | Provide a properly formatted email |
| `Password must be at least 8 characters long` | Password too short | Use a longer password |
| `Password must contain...` | Password doesn't meet complexity requirements | Include uppercase, lowercase, and numbers |
| `MongoDB connection failed` | Database is not accessible | Check MongoDB is running and .env configuration |

### Exit Codes

- **0**: Successful completion
- **1**: Error occurred (check console output for details)

## Post-Setup

### First Login

After creating the Domain Owner account:

1. Navigate to the application URL (default: `http://localhost:3000`)
2. Click on **Login**
3. Enter your Domain Owner credentials
4. You will be redirected to the dashboard

### Administrative Access

As a Domain Owner, you will have access to:

#### Institution Management
- **Pending Creations**: View and approve/reject institution creation requests
  - Access via: `Institutions > Pending Creations`
  - System automatically generates unique Institution IDs upon approval
  - Requester receives email notification with approval/rejection decision

- **All Institutions**: View complete list of registered healthcare institutions
  - Access via: `Institutions > All Institutions`
  - View institution details, administrators, and creation dates

- **All Issuers**: Monitor all issuer accounts in the system
  - Access via: `Institutions > All Issuers`
  - View issuer details and institution affiliations

#### Navigation Menu

The Domain Owner will see a specialized navigation menu:
- **Dashboard**: Statistics on pending requests, institutions, and issuers
  - Recent creation requests
  - Recently approved institutions
  - Quick action buttons
- **Institutions**: Dropdown with administrative options
  - Pending Creations (approve/reject institution creation requests)
  - All Institutions (view all registered institutions)
  - All Issuers (view all issuer accounts)
- **Reports**: System reports and analytics
  - Institution statistics
  - Request statistics (pending, approved, rejected)
  - User distribution

**IMPORTANT**: Domain Owners will NOT see:
- **Generate PRC** menu item (only issuers can generate PRCs)
- **Certificates** menu item (only issuers can manage RSA certificates)

Domain Owners who attempt to access PRC or certificate routes will receive an "Access Denied" error message.

## Institution ID Generation

When approving institution creation requests, the system automatically:

1. **Generates Unique ID**: Creates a random 4-10 digit numeric identifier
2. **Validates Uniqueness**: Ensures the ID doesn't already exist in the database
3. **Complies with eEHIC Schema**: Meets the institution identification requirements
4. **Assigns to Institution**: Links the generated ID to the new institution
5. **Notifies Requester**: Sends email notification to the requesting issuer

### Institution ID Format

- **Length**: 4-10 digits
- **Characters**: Numeric only (0-9)
- **First Digit**: Never 0 (always 1-9)
- **Uniqueness**: Guaranteed unique across all institutions
- **Examples**: `1234`, `567890`, `1234567890`

## Multiple Domain Owners

The system supports multiple Domain Owner accounts. When running the setup script:

- If an admin account already exists, the script will display existing account details
- You will be prompted: `Do you want to create another Domain Owner? (yes/no):`
- Answer `yes` to create an additional admin account
- Answer `no` to cancel the setup

### Use Cases for Multiple Domain Owners

- **Redundancy**: Backup administrator access
- **Team Administration**: Multiple staff managing the system
- **Regional Administration**: Different admins for different regions
- **Shift Coverage**: 24/7 administrative coverage

## Troubleshooting

### Script Doesn't Start

**Problem**: Script exits immediately or shows connection error

**Solutions**:
1. Verify MongoDB is running: `mongod --version`
2. Check `.env` file exists and contains database configuration
3. Test database connection manually
4. Verify Node.js version (requires Node.js 14+)

### Password Input Issues

**Problem**: Cannot see password input or backspace doesn't work

**Solutions**:
1. Ensure terminal supports raw input mode
2. Use PowerShell or Command Prompt on Windows
3. On Linux/Mac, use a standard terminal

### Database Connection Fails

**Problem**: `MongoDB connection failed` error

**Solutions**:
1. Verify MongoDB service is running
2. Check connection string in `.env` file
3. Verify network connectivity to MongoDB server
4. Check MongoDB authentication credentials
5. Ensure database user has proper permissions

### Existing Admin Warning

**Problem**: Script warns that admin already exists

**Solutions**:
1. If you want to create another admin, answer `yes` when prompted
2. If you want to reset the existing admin, manually delete from database first
3. Use the existing admin credentials if you have them

## Security Best Practices

### Password Management

1. **Strong Passwords**: Use complex passwords with 12+ characters
2. **Unique Passwords**: Don't reuse passwords from other systems
3. **Password Storage**: Store credentials securely (e.g., password manager)
4. **Regular Updates**: Change passwords periodically
5. **No Sharing**: Each admin should have their own account

### Account Security

1. **Limit Admin Accounts**: Only create necessary Domain Owner accounts
2. **Monitor Access**: Review admin login activity regularly
3. **Deactivate Unused**: Disable admin accounts that are no longer needed
4. **Audit Trail**: Review logs for administrative actions

### System Security

1. **Keep Updated**: Regularly update Node.js and dependencies
2. **Secure Environment**: Protect `.env` file with proper permissions
3. **HTTPS**: Use SSL/TLS in production environments
4. **Firewall**: Restrict database access to trusted IPs

## Logging

All Domain Owner setup operations are logged using @zandd/app-logger:

### Log Locations

- **Application Logs**: `logs/app-*.log`
- **Error Logs**: `logs/error-*.log`

### Log Levels

- **INFO**: Successful operations (account created, database connected)
- **WARN**: Warnings (existing admin found)
- **ERROR**: Failures (validation errors, database errors)
- **DEBUG**: Detailed operation information

### Sample Log Entry

```json
{
  "timestamp": "2025-10-21T11:49:17.123Z",
  "level": "INFO",
  "logger": "DomainOwnerSetup",
  "message": "Domain Owner created successfully",
  "context": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "domainadmin",
    "email": "admin@healthcare.org"
  }
}
```

## Database Schema

The Domain Owner account is stored in the `users` collection with the following structure:

```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String (hashed),
  firstName: String,
  lastName: String,
  organization: String (optional),
  role: 'admin',
  isActive: true,
  createdAt: Date,
  updatedAt: Date,
  loginAttempts: 0,
  // Other user fields...
}
```

## Related Documentation

- **Institution Registration**: See `Registering Institution.md` for institution creation workflow
- **User Roles**: See application documentation for role-based permissions
- **Email Configuration**: See `.env.example` for email notification setup
- **Deployment Guide**: See deployment documentation for production setup

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review application logs in `logs/` directory
3. Consult the main project documentation
4. Contact the development team

## Version History

- **v1.0.0** (2025-10-21): Initial Domain Owner setup script
  - Interactive CLI interface
  - Password masking
  - Input validation
  - Audit logging
  - Error handling

---

**Note**: This script should only be run during initial system setup or when creating additional Domain Owner accounts. Keep the credentials secure and follow security best practices.
