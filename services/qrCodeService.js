const base45 = require('base45');
const pako = require('pako');
const QRCode = require('qrcode');
const { getLogger } = require('../config/logger');

const logger = getLogger('QRCodeService');

class QRCodeService {
    /**
     * Generate QR code data from JWT following eEHIC specifications:
     * JWT → ZLIB compression → Base45 encoding → QR Code
     * @param {string} jwt - The signed JWT
     * @returns {Promise<string>} - Base45 encoded string for QR code
     */
    async generateQRCode(jwt) {
        try {
            logger.debug('Starting QR code generation pipeline', { jwtLength: jwt.length });

            // Step 1: JWT is already encoded as base64 triplet (header.payload.signature)
            const encodedJWT = jwt;

            // Step 2: Compress using ZLIB (UTF-8 encoding)
            logger.debug('Compressing JWT with ZLIB');
            const compressed = pako.deflate(encodedJWT, {
                level: 9, // Maximum compression
                to: 'string'
            });
            logger.debug('JWT compressed', { compressedLength: compressed.length });

            // Step 3: Encode compressed data using Base45
            logger.debug('Encoding with Base45');
            const base45Encoded = base45.encode(compressed);
            logger.debug('Base45 encoding complete', { encodedLength: base45Encoded.length });

            // Validate that the result uses only alphanumeric characters (QR alphanumeric mode)
            const alphanumericPattern = /^[0-9A-Z $%*+\-./:]+$/;
            if (!alphanumericPattern.test(base45Encoded)) {
                throw new Error('Base45 encoded string contains invalid characters for QR alphanumeric mode');
            }

            logger.debug('QR code data generation completed successfully');
            return base45Encoded;

        } catch (error) {
            logger.error('QR code generation error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }

    /**
     * Generate QR code image from base45 data
     * @param {string} base45Data - Base45 encoded data
     * @param {Object} options - QR code options
     * @returns {Promise<Buffer>} - QR code image as PNG buffer
     */
    async generateQRCodeImage(base45Data, options = {}) {
        try {
            logger.debug('Generating QR code image', { dataLength: base45Data.length });

            // Default options following eEHIC specifications
            const qrOptions = {
                errorCorrectionLevel: 'L', // Low error correction for maximum data capacity
                type: 'png',
                margin: 4,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 512, // Minimum 6cm² area recommended
                ...options
            };

            // Determine optimal QR code version based on data length
            const version = this.calculateOptimalVersion(base45Data, qrOptions.errorCorrectionLevel);
            logger.debug('Optimal QR code version calculated', { version });

            // Generate QR code as PNG buffer
            const qrCodeBuffer = await QRCode.toBuffer(base45Data, qrOptions);
            logger.debug('QR code image generated', { bufferSize: qrCodeBuffer.length });

            return qrCodeBuffer;

        } catch (error) {
            logger.error('QR code image generation error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to generate QR code image: ${error.message}`);
        }
    }

    /**
     * Generate QR code as SVG string
     * @param {string} base45Data - Base45 encoded data
     * @param {Object} options - QR code options
     * @returns {Promise<string>} - QR code as SVG string
     */
    async generateQRCodeSVG(base45Data, options = {}) {
        try {
            const qrOptions = {
                errorCorrectionLevel: 'L',
                margin: 4,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                ...options
            };

            const svgString = await QRCode.toString(base45Data, {
                type: 'svg',
                ...qrOptions
            });

            return svgString;

        } catch (error) {
            logger.error('QR code SVG generation error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to generate QR code SVG: ${error.message}`);
        }
    }

    /**
     * Decode QR code data back to JWT
     * @param {string} base45Data - Base45 encoded QR code data
     * @returns {Promise<string>} - Original JWT
     */
    async decodeQRCode(base45Data) {
        try {
            logger.debug('Starting QR code decoding pipeline', { dataLength: base45Data.length });

            // Step 1: Decode Base45
            logger.debug('Decoding Base45');
            const compressedData = base45.decode(base45Data);
            logger.debug('Base45 decoded', { compressedDataLength: compressedData.length });

            // Step 2: Decompress using ZLIB
            logger.debug('Decompressing with ZLIB');
            const jwt = pako.inflate(compressedData, { to: 'string' });
            logger.debug('ZLIB decompressed', { jwtLength: jwt.length });

            logger.debug('QR code decoding completed successfully');
            return jwt;

        } catch (error) {
            logger.error('QR code decoding error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to decode QR code: ${error.message}`);
        }
    }

    /**
     * Calculate optimal QR code version for given data
     * @param {string} data - Data to encode
     * @param {string} errorCorrectionLevel - Error correction level (L, M, Q, H)
     * @returns {number} - QR code version (1-40)
     */
    calculateOptimalVersion(data, errorCorrectionLevel = 'L') {
        // QR code capacity table for alphanumeric mode with different error correction levels
        const capacityTable = {
            'L': [25, 47, 77, 114, 154, 195, 224, 279, 335, 395, 468, 535, 619, 667, 758, 854, 938, 1046, 1153, 1249, 1352, 1460, 1588, 1704, 1853, 1990, 2132, 2223, 2369, 2520, 2677, 2840, 3009, 3183, 3351, 3537, 3729, 3927, 4087, 4296],
            'M': [20, 38, 61, 90, 122, 154, 178, 221, 262, 311, 366, 419, 483, 528, 600, 656, 734, 816, 909, 970, 1035, 1134, 1248, 1326, 1451, 1542, 1637, 1732, 1839, 1994, 2113, 2238, 2369, 2506, 2632, 2780, 2894, 3054, 3220, 3391],
            'Q': [16, 29, 47, 67, 87, 108, 125, 157, 189, 221, 259, 296, 352, 376, 426, 470, 531, 574, 644, 702, 742, 823, 890, 963, 1041, 1094, 1172, 1263, 1322, 1429, 1499, 1618, 1700, 1787, 1867, 1966, 2071, 2181, 2298, 2420],
            'H': [10, 20, 35, 50, 64, 84, 93, 122, 143, 174, 200, 227, 259, 283, 321, 365, 408, 452, 493, 557, 587, 640, 672, 744, 779, 864, 910, 958, 1016, 1080, 1150, 1226, 1307, 1394, 1431, 1530, 1591, 1658, 1774, 1852]
        };

        const capacities = capacityTable[errorCorrectionLevel] || capacityTable['L'];
        const dataLength = data.length;

        // Find the smallest version that can accommodate the data
        for (let version = 0; version < capacities.length; version++) {
            if (capacities[version] >= dataLength) {
                return version + 1; // Versions are 1-indexed
            }
        }

        // If data is too large for any version
        throw new Error(`Data too large for QR code (${dataLength} characters). Maximum capacity for error correction level ${errorCorrectionLevel} is ${capacities[capacities.length - 1]} characters.`);
    }

    /**
     * Validate QR code data format
     * @param {string} data - Data to validate
     * @returns {boolean} - True if valid for QR alphanumeric mode
     */
    validateQRData(data) {
        // QR alphanumeric mode supports: 0-9, A-Z, space, $, %, *, +, -, ., /, :
        const alphanumericPattern = /^[0-9A-Z $%*+\-./:]*$/;
        return alphanumericPattern.test(data);
    }

    /**
     * Get QR code statistics
     * @param {string} base45Data - Base45 encoded data
     * @param {string} errorCorrectionLevel - Error correction level
     * @returns {Object} - QR code statistics
     */
    getQRCodeStats(base45Data, errorCorrectionLevel = 'L') {
        try {
            const version = this.calculateOptimalVersion(base45Data, errorCorrectionLevel);
            const isValid = this.validateQRData(base45Data);

            // Calculate module count (size) for the version
            const moduleCount = 17 + (version * 4);

            return {
                dataLength: base45Data.length,
                version: version,
                moduleCount: moduleCount,
                size: `${moduleCount}x${moduleCount}`,
                errorCorrectionLevel: errorCorrectionLevel,
                isValidFormat: isValid,
                estimatedImageSize: `${moduleCount * 4}px x ${moduleCount * 4}px` // Rough estimate
            };
        } catch (error) {
            return {
                error: error.message,
                dataLength: base45Data.length,
                isValidFormat: this.validateQRData(base45Data)
            };
        }
    }

    /**
     * Test the complete QR code pipeline
     * @param {string} jwt - Input JWT
     * @returns {Promise<Object>} - Test results
     */
    async testPipeline(jwt) {
        try {
            logger.debug('Testing complete QR code pipeline');

            // Encode
            const encoded = await this.generateQRCode(jwt);

            // Decode
            const decoded = await this.decodeQRCode(encoded);

            // Verify
            const isValid = jwt === decoded;

            const stats = this.getQRCodeStats(encoded);

            return {
                success: isValid,
                originalLength: jwt.length,
                encodedLength: encoded.length,
                compressionRatio: (jwt.length / encoded.length).toFixed(2),
                qrStats: stats,
                pipeline: {
                    jwt: jwt.substring(0, 100) + '...',
                    encoded: encoded.substring(0, 100) + '...',
                    decoded: decoded.substring(0, 100) + '...'
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new QRCodeService();