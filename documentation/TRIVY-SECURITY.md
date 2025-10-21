# Trivy Security Scanning Documentation
## PRC QR Generator - Security Vulnerability Management

### Overview
The PRC QR Generator uses [Trivy](https://aquasecurity.github.io/trivy/) - a comprehensive security scanner by Aqua Security - to identify vulnerabilities, secrets, and misconfigurations in the codebase and dependencies.

### Table of Contents
1. [Installation](#installation)
2. [Local Scanning](#local-scanning)
3. [NPM Scripts](#npm-scripts)
4. [GitHub Actions Workflow](#github-actions-workflow)
5. [Configuration](#configuration)
6. [Reports](#reports)
7. [Remediation](#remediation)
8. [Best Practices](#best-practices)

---

## Installation

### Windows Installation

#### Option 1: Using Chocolatey
```powershell
choco install trivy
```

#### Option 2: Using Scoop
```powershell
scoop install trivy
```

#### Option 3: Manual Download
1. Download from [Trivy Releases](https://github.com/aquasecurity/trivy/releases)
2. Extract to a directory (e.g., `C:\Program Files\trivy`)
3. Add to PATH environment variable

### Verify Installation
```bash
trivy version
```

---

## Local Scanning

### Quick Scan
Run a basic security scan:
```bash
npm run security:scan
```

### Full Scan with All Report Formats
Generate comprehensive reports in multiple formats:
```bash
npm run security:scan:full
```
This creates:
- `reports/trivy-report.txt` - Human-readable table format
- `reports/trivy-report.json` - Machine-readable JSON format
- `reports/trivy-results.sarif` - SARIF format for code analysis tools

### Critical Vulnerabilities Only
Scan for CRITICAL and HIGH severity issues (fails on findings):
```bash
npm run security:scan:critical
```

### Update Vulnerability Database
Keep Trivy's vulnerability database up-to-date:
```bash
npm run security:update
```

---

## NPM Scripts

### Available Scripts

| Script | Description | Exit Code |
|--------|-------------|-----------|
| `security:scan` | Standard scan with trivy.yaml config | 0 (always) |
| `security:scan:json` | Generate JSON report | 0 (always) |
| `security:scan:sarif` | Generate SARIF report for GitHub | 0 (always) |
| `security:scan:critical` | Scan for CRITICAL/HIGH, fail on findings | 1 (on findings) |
| `security:scan:full` | Generate all report formats | 0 (always) |
| `security:update` | Update vulnerability database | 0 (always) |

### Example Usage
```bash
# Run standard scan
npm run security:scan

# Run full scan before commit
npm run security:scan:full

# Check for critical issues before release
npm run security:scan:critical
```

---

## GitHub Actions Workflow

### Automated Scanning
The repository includes a comprehensive GitHub Actions workflow that:

#### Triggers
- **Push** to `master` or `main` branches
- **Pull Requests** to `master` or `main` branches
- **Scheduled** daily at 2 AM UTC
- **Manual** workflow dispatch with email option

#### Workflow Features
1. **Multi-Format Scanning**
   - SARIF format for GitHub Security tab
   - Table format for human reading
   - JSON format for automation

2. **Email Reports** (scheduled runs only)
   - HTML formatted email with vulnerability summary
   - Attachments: Text report, JSON report, summary
   - Conditional priority based on findings

3. **Artifact Uploads**
   - All reports uploaded as workflow artifacts
   - 30-day retention period
   - Easy download for review

4. **GitHub Security Integration**
   - SARIF results uploaded to Security tab
   - Vulnerability alerts in code view
   - Integration with Dependabot

### Workflow Configuration

#### Required Secrets (for email notifications)
```yaml
secrets:
  SMTP_SERVER: smtp.example.com
  SMTP_PORT: 587  # Optional, defaults to 587
  SMTP_USERNAME: your-email@example.com
  SMTP_PASSWORD: your-app-password
  SMTP_FROM_EMAIL: security@example.com  # Optional
  SECURITY_EMAIL: security-team@example.com
```

#### Manual Workflow Dispatch
1. Go to Actions tab in GitHub
2. Select "Trivy Security Scan (Bulletproof)"
3. Click "Run workflow"
4. Choose to send email report (yes/no)
5. Click "Run workflow" to execute

---

## Configuration

### trivy.yaml
Main configuration file with customizable settings:

```yaml
scan:
  security-checks:
    - vuln      # Vulnerabilities in dependencies
    - secret    # Secret detection (API keys, passwords)
    - config    # Misconfiguration detection

  severity:
    - CRITICAL
    - HIGH
    - MEDIUM
    - LOW

vulnerability:
  ignore-unfixed: false  # Report all, even unfixed

skip:
  dirs:
    - node_modules
    - .git
    - logs
    - reports
```

### .trivyignore
Ignore specific vulnerabilities after review:

```
# Format: CVE-ID or package-name
# Always add justification comments

CVE-2024-12345  # False positive, not exploitable in our use case
npm-package@1.0.0  # No fix available, risk accepted
```

**IMPORTANT**: Only add to `.trivyignore` after proper security review and risk assessment.

---

## Reports

### Report Locations
All reports are generated in the `reports/` directory:

```
reports/
├── trivy-report.txt       # Human-readable table
├── trivy-report.json      # Machine-readable JSON
├── trivy-results.sarif    # SARIF for GitHub
└── summary.txt            # Workflow summary
```

### Report Formats

#### Table Format (.txt)
```
┌────────────────────┬──────────────┬──────────┬────────┐
│      Library       │ Vulnerability│ Severity │  Status│
├────────────────────┼──────────────┼──────────┼────────┤
│ jsonwebtoken@9.0.2 │ CVE-2024-xxx │ CRITICAL │ Fixed  │
└────────────────────┴──────────────┴──────────┴────────┘
```

#### JSON Format (.json)
```json
{
  "SchemaVersion": 2,
  "ArtifactName": ".",
  "ArtifactType": "filesystem",
  "Results": [
    {
      "Target": "package-lock.json",
      "Vulnerabilities": [...]
    }
  ]
}
```

#### SARIF Format (.sarif)
Standard format for code analysis tools, integrated with GitHub Security.

---

## Remediation

### Priority Levels

#### 🔴 CRITICAL - Immediate Action Required
- **Timeframe**: Fix within 24 hours
- **Action**: Update dependency or apply hotfix
- **Escalation**: Notify security team

#### 🟠 HIGH - Urgent
- **Timeframe**: Fix within 1 week
- **Action**: Schedule update in next sprint
- **Review**: Assess impact on production

#### 🟡 MEDIUM - Important
- **Timeframe**: Fix within 1 month
- **Action**: Include in regular maintenance
- **Monitor**: Track in issue tracker

#### 🟢 LOW - Informational
- **Timeframe**: Fix when convenient
- **Action**: Include in dependency updates
- **Document**: Note in security log

### Remediation Steps

1. **Identify Vulnerability**
   ```bash
   npm run security:scan
   # Review reports/trivy-report.txt
   ```

2. **Check for Updates**
   ```bash
   npm outdated
   npm update [package-name]
   ```

3. **Test Application**
   ```bash
   npm test
   npm run dev
   # Verify all functionality
   ```

4. **Verify Fix**
   ```bash
   npm run security:scan:critical
   # Should pass with no CRITICAL/HIGH
   ```

5. **Document Resolution**
   - Update `.trivyignore` if accepting risk
   - Create GitHub issue if no fix available
   - Document in security log

---

## Best Practices

### Development Workflow

#### Before Committing
```bash
# Run security scan
npm run security:scan:critical

# If issues found:
# 1. Review findings
# 2. Update dependencies
# 3. Retest
# 4. Re-scan
```

#### Before Releasing
```bash
# Full security audit
npm run security:scan:full

# Review all reports
# Document any accepted risks
# Update security documentation
```

#### Regular Maintenance
- **Daily**: Automated GitHub Actions scan
- **Weekly**: Review scan results
- **Monthly**: Update all dependencies
- **Quarterly**: Security audit and review

### Healthcare Data Compliance

Given that this application handles healthcare data (eEHIC):

1. **Zero Tolerance for CRITICAL**
   - No CRITICAL vulnerabilities in production
   - Immediate patching required

2. **Regular Audits**
   - Monthly security reviews
   - Compliance documentation
   - Audit trail maintenance

3. **Data Protection**
   - Secret scanning enabled
   - Configuration validation
   - Access control verification

4. **Incident Response**
   - Document all vulnerabilities
   - Track remediation status
   - Report to compliance team

### Secret Management

Trivy scans for exposed secrets:

- API keys
- Passwords
- Private keys
- Tokens
- Database credentials

**Never commit secrets to the repository!**

Use environment variables or secure secret management:
```javascript
// ❌ BAD
const apiKey = "sk-1234567890abcdef";

// ✅ GOOD
const apiKey = process.env.API_KEY;
```

---

## Troubleshooting

### Common Issues

#### Trivy Command Not Found
```bash
# Windows: Add to PATH
# Check installation: trivy version
```

#### Database Update Failed
```bash
# Clear cache and retry
trivy image --clear-cache
npm run security:update
```

#### Too Many Findings
```bash
# Focus on CRITICAL/HIGH first
npm run security:scan:critical

# Review and prioritize
# Update dependencies systematically
```

#### False Positives
```bash
# Add to .trivyignore with justification
# Example:
CVE-2024-12345  # False positive: not applicable to our use case
```

---

## Additional Resources

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

## Support

For security concerns or questions:
- **Internal**: Contact security team
- **External**: Create GitHub issue
- **Urgent**: Follow incident response protocol

---

**Last Updated**: October 20, 2025
**Version**: 1.1.0
**Maintained by**: PRC QR Generator Security Team
