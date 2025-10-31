# Issuer Resolver API Documentation

## Overview

The Issuer Resolver API provides a standardized way to resolve issuer certificates and verification methods, following the EBSI (European Blockchain Services Infrastructure) format. This allows external verification tools to validate credentials issued by healthcare institutions in your system.

## Purpose

This API enables:
- **Decentralized Identifier (DID) Resolution**: Resolve issuer DIDs to DID Documents containing verification methods
- **Issuer Verification**: Retrieve public keys and metadata for credential verification
- **Interoperability**: Use EBSI-compatible verification tools with your local issuer registry
- **Standards Compliance**: Follow W3C DID Core Data Model specifications

## Endpoints

### 1. Resolve DID (W3C Standard Format)

Resolve a Decentralized Identifier (DID) to get the full DID Document.

**Endpoint:** `GET /api/v1/identifiers/:did`

**Parameters:**
- `did` (path parameter, required): The DID to resolve
  - Format: `did:method:identifier`
  - Examples:
    - `did:local:507f1f77bcf86cd799439011` (by certificate or user ID)
    - `did:local:john.doe` (by username)
    - `did:ebsi:zdctFFPeCn5nXWUDXr29SVY` (EBSI-style)

- `valid-at` (query parameter, optional): ISO 8601 timestamp
  - Returns the DID Document as it was valid at that specific time
  - Default: current time (`now`)
  - Example: `?valid-at=2025-01-15T10:30:00Z`

**Response Format:**

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1"
  ],
  "id": "did:local:507f1f77bcf86cd799439011",
  "controller": [
    "did:local:507f1f77bcf86cd799439011"
  ],
  "verificationMethod": [
    {
      "id": "did:local:507f1f77bcf86cd799439011#cert123",
      "type": "JsonWebKey2020",
      "controller": "did:local:507f1f77bcf86cd799439011",
      "publicKeyJwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "dZFz7Le3c5TwmlwXjk0SitZU6I5qkj26fLMuOYu7inw",
        "y": "yluk8rfmE0tof-krCzeBA90OxAXN1FajbMvJ4EhUyh0"
      }
    }
  ],
  "authentication": [
    "did:local:507f1f77bcf86cd799439011#cert123"
  ],
  "assertionMethod": [
    "did:local:507f1f77bcf86cd799439011#cert123"
  ],
  "metadata": {
    "issuer": {
      "name": "Dr. John Doe",
      "email": "john.doe@healthinst.eu",
      "country": "BE"
    },
    "institution": {
      "name": "Belgian Health Institute",
      "institutionId": "12345678",
      "country": "BE"
    },
    "certificate": {
      "id": "cert123",
      "name": "Healthcare Issuer Certificate",
      "algorithm": "P-256",
      "createdAt": "2025-01-01T00:00:00Z",
      "expiresAt": "2026-01-01T00:00:00Z",
      "status": "active"
    }
  }
}
```

**Status Codes:**
- `200 OK`: DID resolved successfully
- `400 Bad Request`: Invalid DID format
- `404 Not Found`: DID not found or not valid at requested time
- `500 Internal Server Error`: Server error during resolution

**Example Requests:**

```bash
# Resolve by user/certificate ID
curl http://localhost:4400/api/v1/identifiers/did:local:507f1f77bcf86cd799439011

# Resolve by username
curl http://localhost:4400/api/v1/identifiers/did:local:john.doe

# Resolve at specific time
curl "http://localhost:4400/api/v1/identifiers/did:local:507f1f77bcf86cd799439011?valid-at=2025-01-15T10:30:00Z"
```

---

### 2. Resolve Issuer (Simplified Format)

Alternative endpoint with a more user-friendly URL structure.

**Endpoint:** `GET /api/v1/issuers/:issuerId`

**Parameters:**
- `issuerId` (path parameter, required): The issuer identifier
  - Can be: User ID, Username, or Institution ID
  - Examples: `507f1f77bcf86cd799439011`, `john.doe`

**Response Format:**

Same as the DID resolution endpoint. Returns a complete W3C DID Document.

**Status Codes:**
- `200 OK`: Issuer resolved successfully
- `404 Not Found`: Issuer not found or no active certificate
- `500 Internal Server Error`: Server error during resolution

**Example Requests:**

```bash
# Resolve by user ID
curl http://localhost:4400/api/v1/issuers/507f1f77bcf86cd799439011

# Resolve by username
curl http://localhost:4400/api/v1/issuers/john.doe
```

---

## DID Document Structure

The API returns a W3C DID Document following EBSI conventions:

### Core Fields

- **@context**: JSON-LD context defining terms and types
- **id**: The DID being resolved
- **controller**: Array of DIDs that control this DID (usually self-controlled)
- **verificationMethod**: Array of verification methods (public keys)
  - `id`: Unique identifier for the verification method
  - `type`: Key type (JsonWebKey2020)
  - `controller`: DID that controls this key
  - `publicKeyJwk`: Public key in JWK format
- **authentication**: Methods for authentication
- **assertionMethod**: Methods for making assertions (signing credentials)

### Metadata (Extension)

Additional metadata specific to healthcare issuers:

- **issuer**: Information about the person/entity
  - `name`: Full name
  - `email`: Contact email
  - `country`: ISO country code

- **institution**: Healthcare institution details
  - `name`: Institution name
  - `institutionId`: Unique institution identifier
  - `country`: ISO country code

- **certificate**: Certificate details
  - `id`: Certificate ID
  - `name`: Certificate name
  - `algorithm`: Cryptographic algorithm (P-256, secp256k1, RSA-2048)
  - `createdAt`: Certificate creation date
  - `expiresAt`: Certificate expiration date
  - `status`: Certificate status (active, expired, revoked)

---

## Supported Algorithms

The resolver supports certificates with the following algorithms:

1. **P-256** (secp256r1)
   - NIST P-256 Elliptic Curve
   - Returns JWK with `kty: "EC"`, `crv: "P-256"`

2. **secp256k1**
   - Bitcoin/Ethereum curve
   - Returns JWK with `kty: "EC"`, `crv: "secp256k1"`

3. **RSA-2048** / **RSA-4096**
   - RSA encryption
   - Returns JWK with `kty: "RSA"`

---

## Integration with Verification Tools

### Using with EBSI-Compatible Verifiers

```javascript
// Example: Verify a credential using the resolver
const verifier = require('@cef-ebsi/verifiable-credential');

// Resolve the issuer's DID
const issuerDid = 'did:local:507f1f77bcf86cd799439011';
const resolverUrl = 'http://localhost:4400/api/v1/identifiers/';

const didDocument = await fetch(resolverUrl + issuerDid).then(r => r.json());

// Extract public key from verification method
const verificationMethod = didDocument.verificationMethod[0];
const publicKey = verificationMethod.publicKeyJwk;

// Verify credential signature
const isValid = await verifier.verify(credential, publicKey);
```

### Custom Verification

```javascript
// Example: Extract and use public key directly
const response = await fetch('http://localhost:4400/api/v1/issuers/john.doe');
const didDocument = await response.json();

// Get the public key
const publicKeyJwk = didDocument.verificationMethod[0].publicKeyJwk;

// Get certificate metadata
const certificate = didDocument.metadata.certificate;
const institution = didDocument.metadata.institution;

console.log(`Issuer: ${didDocument.metadata.issuer.name}`);
console.log(`Institution: ${institution.name} (${institution.country})`);
console.log(`Certificate valid until: ${certificate.expiresAt}`);
```

---

## DID Method

This implementation uses a local DID method (`did:local`) for internal resolution. The structure follows EBSI conventions for compatibility with EBSI-based verification tools.

### DID Format

```
did:local:{identifier}
```

Where `{identifier}` can be:
- User/Issuer database ID (MongoDB ObjectId)
- Username
- Certificate ID

### Converting to Production

For production deployment, consider:

1. **Custom Domain DIDs**
   - `did:web:yourdomain.com:issuer:{id}`
   - Resolved via HTTPS at `https://yourdomain.com/.well-known/did.json`

2. **EBSI Integration**
   - Register issuers on EBSI blockchain
   - Use `did:ebsi:{hash}` format
   - Submit DID Documents to EBSI DID Registry

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid DID format",
  "message": "DID must be in format did:method:identifier"
}
```

### 404 Not Found

```json
{
  "error": "DID not found",
  "message": "No issuer found for identifier: john.doe"
}
```

```json
{
  "error": "Certificate not found",
  "message": "No active certificate found for this issuer"
}
```

```json
{
  "error": "Certificate not valid",
  "message": "Certificate was not valid at 2025-01-15T10:30:00Z"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Failed to resolve DID"
}
```

---

## Security Considerations

1. **Public Endpoint**: The resolver API is intentionally public (no authentication required) to allow external verification tools to access it.

2. **Read-Only**: This API only provides read access to public certificate information. No write operations are exposed.

3. **Rate Limiting**: Consider implementing rate limiting in production to prevent abuse.

4. **HTTPS**: Always use HTTPS in production to ensure data integrity during transmission.

5. **Certificate Status**: Always check the certificate `status` and `expiresAt` fields before trusting verification methods.

---

## Testing

### Test Endpoints

```bash
# List all issuers with certificates (requires authentication)
curl http://localhost:4400/certificates

# Resolve a test issuer
curl http://localhost:4400/api/v1/issuers/testuser

# Test with cURL showing full response
curl -v http://localhost:4400/api/v1/identifiers/did:local:testuser
```

### Validation

To validate that the DID Document is correctly formatted:

1. Verify it contains all required W3C DID Core fields
2. Check that `verificationMethod` has valid JWK format
3. Ensure `authentication` and `assertionMethod` reference the verification method
4. Confirm certificate is not expired (`expiresAt` > current time)

---

## Changelog

### Version 0.0.5
- Initial implementation of EBSI-compatible resolver API
- Support for did:local method
- W3C DID Core Data Model compliance
- JWK conversion for P-256, secp256k1, and RSA keys
- Temporal resolution with `valid-at` parameter

---

## Support

For issues or questions about the Resolver API:
- Check application logs for detailed error information
- Review certificate status in the Certificates management interface
- Ensure issuers have active certificates before attempting resolution

---

## Related Documentation

- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [EBSI DID Method Specification](https://hub.ebsi.eu/vc-framework/did/legal-entities)
- [JSON Web Key (JWK) RFC 7517](https://tools.ietf.org/html/rfc7517)
- [Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
