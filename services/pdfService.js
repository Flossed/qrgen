const PDFDocument = require('pdfkit');
const QRCodeService = require('./qrCodeService');
const { getLogger } = require('../config/logger');

const logger = getLogger('PDFService');

class PDFService {
    /**
     * Generate PRC PDF document according to eEHIC specifications
     * @param {Object} prcData - PRC data
     * @param {string} qrCodeData - Base45 encoded QR code data
     * @param {Object} options - PDF generation options
     * @returns {Promise<Buffer>} - PDF as buffer
     */
    async generatePDF(prcData, qrCodeData, options = {}) {
        try {
            logger.debug('Starting PDF generation', { prcDataKeys: Object.keys(prcData) });

            // Create new PDF document (A4 format as per specification)
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                ...options
            });

            // Collect PDF chunks
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));

            // Add content to PDF
            await this.addPRCContent(doc, prcData, qrCodeData);

            // Finalize the PDF
            doc.end();

            // Wait for PDF to be complete
            return new Promise((resolve, reject) => {
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    logger.debug('PDF generated successfully', { bufferSize: pdfBuffer.length });
                    resolve(pdfBuffer);
                });
                doc.on('error', reject);
            });

        } catch (error) {
            logger.error('PDF generation error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }

    /**
     * Add PRC content to PDF document
     * @param {PDFDocument} doc - PDF document
     * @param {Object} prcData - PRC data
     * @param {string} qrCodeData - QR code data
     */
    async addPRCContent(doc, prcData, qrCodeData) {
        // Page dimensions
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 50;
        const contentWidth = pageWidth - (margin * 2);

        // Colors
        const primaryColor = '#0066CC';
        const grayColor = '#666666';
        const lightGrayColor = '#CCCCCC';

        // Add header
        this.addHeader(doc, contentWidth, primaryColor);

        // Move down after header
        doc.moveDown(2);

        // Add title
        doc.fontSize(20)
            .fillColor(primaryColor)
            .text('PROVISIONAL REPLACEMENT CERTIFICATE', margin, doc.y, {
                align: 'center',
                width: contentWidth
            });

        doc.fontSize(16)
            .text('OF THE', margin, doc.y + 10, {
                align: 'center',
                width: contentWidth
            });

        doc.fontSize(18)
            .text('EUROPEAN HEALTH INSURANCE CARD', margin, doc.y + 10, {
                align: 'center',
                width: contentWidth
            });

        doc.moveDown(1);

        // Add subtitle
        doc.fontSize(10)
            .fillColor(grayColor)
            .text('as defined in Annex 2 to Decision No S2', margin, doc.y, {
                align: 'center',
                width: contentWidth
            });

        doc.text('concerning the technical specifications of the European Health Insurance Card', margin, doc.y + 5, {
            align: 'center',
            width: contentWidth
        });

        doc.moveDown(2);

        // Add issuing member state
        this.addSection(doc, 'Issuing Member State', margin, contentWidth, lightGrayColor);
        doc.fontSize(10)
            .fillColor('black')
            .text(`2. ${this.getCountryName(prcData.ic)}`, margin + 10, doc.y + 5);

        doc.moveDown(1);

        // Add card holder information
        this.addSection(doc, 'Card holder-related information', margin, contentWidth, lightGrayColor);

        const holderY = doc.y + 5;
        doc.fontSize(10)
            .fillColor('black')
            .text(`3. Name: ${prcData.fn}`, margin + 10, holderY);

        doc.text(`4. Given name(s): ${prcData.gn}`, margin + 10, holderY + 15);

        doc.text(`5. Date of birth: ${this.formatDate(prcData.dob)}`, margin + 10, holderY + 30);

        doc.text(`6. Personal identification number: ${prcData.hi}`, margin + 10, holderY + 45);

        doc.y = holderY + 70;
        doc.moveDown(1);

        // Add competent institution information
        this.addSection(doc, 'Competent institution-related information', margin, contentWidth, lightGrayColor);

        const instY = doc.y + 5;
        doc.fontSize(10)
            .fillColor('black')
            .text(`7. Identification number of the institution:`, margin + 10, instY);

        doc.text(`${prcData.ii} - ${prcData.in}`, margin + 20, instY + 15);

        doc.y = instY + 40;
        doc.moveDown(1);

        // Add card-related information
        this.addSection(doc, 'Card-related information', margin, contentWidth, lightGrayColor);

        const cardY = doc.y + 5;
        if (prcData.ci) {
            doc.fontSize(10)
                .fillColor('black')
                .text(`8. Identification number of the card: ${prcData.ci}`, margin + 10, cardY);
        }

        const expiryY = prcData.ci ? cardY + 20 : cardY;
        if (prcData.xd) {
            doc.text(`9. Expiry date: ${this.formatDate(prcData.xd)}`, margin + 10, expiryY);
        }

        doc.y = expiryY + 30;
        doc.moveDown(1);

        // Add certificate validity period
        this.addSection(doc, 'Certificate validity period', margin, contentWidth, lightGrayColor);

        const validityY = doc.y + 5;
        doc.fontSize(10)
            .fillColor('black')
            .text(`(a) From: ${this.formatDate(prcData.sd)}`, margin + 10, validityY);

        doc.text(`(b) To: ${this.formatDate(prcData.ed)}`, margin + 10, validityY + 15);

        doc.y = validityY + 40;
        doc.moveDown(1);

        // Add certificate delivery date
        this.addSection(doc, 'Certificate delivery date', margin, contentWidth, lightGrayColor);

        doc.fontSize(10)
            .fillColor('black')
            .text(`(c) ${this.formatDate(prcData.di)}`, margin + 10, doc.y + 5);

        doc.moveDown(2);

        // Add QR code section
        await this.addQRCodeSection(doc, qrCodeData, margin, contentWidth);

        // Add footer
        this.addFooter(doc, margin, contentWidth, grayColor);
    }

    /**
     * Add header to PDF
     */
    addHeader(doc, contentWidth, primaryColor) {
        doc.fontSize(12)
            .fillColor(primaryColor)
            .text('EHIC PDF QR Code PoC', 50, 30, { align: 'left' });

        doc.fontSize(10)
            .fillColor('black')
            .text(`Page 1/1`, 50, 30, {
                align: 'right',
                width: contentWidth
            });
    }

    /**
     * Add section header
     */
    addSection(doc, title, x, width, backgroundColor) {
        const y = doc.y;

        // Add background
        doc.rect(x, y, width, 20)
            .fillColor(backgroundColor)
            .fill();

        // Add text
        doc.fontSize(10)
            .fillColor('black')
            .text(title, x + 5, y + 6);

        doc.y = y + 20;
    }

    /**
     * Add QR code section
     */
    async addQRCodeSection(doc, qrCodeData, margin, contentWidth) {
        // Add section title
        doc.fontSize(12)
            .fillColor('black')
            .text('Signature and/or stamp of the institution:', margin, doc.y, {
                align: 'center',
                width: contentWidth
            });

        doc.moveDown(1);

        try {
            // Generate QR code image (minimum 6cm² area as per specification)
            const qrSize = 170; // Approximately 6cm at 72 DPI
            const qrCodeImage = await QRCodeService.generateQRCodeImage(qrCodeData, {
                width: qrSize,
                height: qrSize,
                margin: 2
            });

            // Calculate position to center the QR code
            const qrX = margin + (contentWidth - qrSize) / 2;
            const qrY = doc.y;

            // Add QR code image
            doc.image(qrCodeImage, qrX, qrY, {
                width: qrSize,
                height: qrSize
            });

            // Update Y position
            doc.y = qrY + qrSize + 10;

        } catch (error) {
            logger.error('Error adding QR code to PDF', { error: error.message, stack: error.stack });
            // Fallback: add text indicating QR code generation failed
            doc.fontSize(10)
                .fillColor('red')
                .text('QR Code generation failed', margin, doc.y, {
                    align: 'center',
                    width: contentWidth
                });
        }
    }

    /**
     * Add footer to PDF
     */
    addFooter(doc, margin, contentWidth, grayColor) {
        // Position footer at bottom of page
        const footerY = doc.page.height - 100;
        doc.y = footerY;

        doc.fontSize(8)
            .fillColor(grayColor)
            .text('Notes and warnings:', margin, doc.y);

        doc.text('All rights applicable to the pre-readable data included in the European card and related to the description, volume, length and',
            margin, doc.y + 10, { width: contentWidth });

        doc.text('validity of the data fields, are applicable to the certificate.',
            margin, doc.y + 5, { width: contentWidth });

        // Add generation timestamp
        doc.text(`Generated on: ${new Date().toLocaleString()}`,
            margin, doc.page.height - 30, {
                align: 'right',
                width: contentWidth
            });
    }

    /**
     * Format date for display (DD/MM/YYYY format as per specification)
     * @param {string|Date} date - Date to format
     * @returns {string} - Formatted date
     */
    formatDate(date) {
        try {
            if (typeof date === 'string') {
                // Handle special case where date might contain '00' for unknown day/month
                if (date.includes('-00-') || date.endsWith('-00')) {
                    // Replace 00 with appropriate values for display
                    const parts = date.split('-');
                    const year = parts[0];
                    const month = parts[1] === '00' ? '01' : parts[1];
                    const day = parts[2] === '00' ? '01' : parts[2];

                    const dateObj = new Date(`${year}-${month}-${day}`);
                    const formatted = dateObj.toLocaleDateString('en-GB'); // DD/MM/YYYY format

                    // Replace back with xx for unknown values
                    return formatted
                        .replace(/01\/01\//, parts[2] === '00' && parts[1] === '00' ? 'xx/xx/' : 'xx/')
                        .replace(/\/01\//, parts[1] === '00' ? '/xx/' : '/')
                        .replace(/^01\//, parts[2] === '00' ? 'xx/' : '');
                }
                date = new Date(date);
            }

            return date.toLocaleDateString('en-GB'); // DD/MM/YYYY format
        } catch (error) {
            logger.error('Date formatting error', { error: error.message, stack: error.stack });
            return date.toString();
        }
    }

    /**
     * Get country name from country code
     * @param {string} countryCode - ISO country code
     * @returns {string} - Country name
     */
    getCountryName(countryCode) {
        const countries = {
            'AT': 'Austria',
            'BE': 'Belgium',
            'BG': 'Bulgaria',
            'HR': 'Croatia',
            'CY': 'Cyprus',
            'CZ': 'Czech Republic',
            'DK': 'Denmark',
            'EE': 'Estonia',
            'FI': 'Finland',
            'FR': 'France',
            'DE': 'Germany',
            'GR': 'Greece',
            'HU': 'Hungary',
            'IE': 'Ireland',
            'IT': 'Italy',
            'LV': 'Latvia',
            'LT': 'Lithuania',
            'LU': 'Luxembourg',
            'MT': 'Malta',
            'NL': 'Netherlands',
            'PL': 'Poland',
            'PT': 'Portugal',
            'RO': 'Romania',
            'SK': 'Slovakia',
            'SI': 'Slovenia',
            'ES': 'Spain',
            'SE': 'Sweden',
            'IS': 'Iceland',
            'LI': 'Liechtenstein',
            'NO': 'Norway',
            'CH': 'Switzerland',
            'UK': 'United Kingdom'
        };

        return countries[countryCode] || countryCode;
    }

    /**
     * Generate PDF with custom template
     * @param {Object} prcData - PRC data
     * @param {string} qrCodeData - QR code data
     * @param {string} templatePath - Path to custom template
     * @returns {Promise<Buffer>} - PDF buffer
     */
    async generateCustomPDF(prcData, qrCodeData, templatePath) {
        // This could be extended to support custom templates
        // For now, use the standard template
        return this.generatePDF(prcData, qrCodeData);
    }

    /**
     * Get PDF metadata
     * @param {Object} prcData - PRC data
     * @returns {Object} - PDF metadata
     */
    getPDFMetadata(prcData) {
        return {
            title: `PRC - ${prcData.gn} ${prcData.fn}`,
            author: 'PRC Generator System',
            subject: 'Provisional Replacement Certificate',
            keywords: 'PRC, EHIC, Health Insurance, eEHIC',
            creator: 'PRC Generator v1.0.0',
            producer: 'PDFKit',
            creationDate: new Date(),
            modDate: new Date()
        };
    }

    /**
     * Validate PDF generation requirements
     * @param {Object} prcData - PRC data
     * @returns {Array} - Array of validation errors
     */
    validatePDFRequirements(prcData) {
        const errors = [];

        if (!prcData) {
            errors.push('PRC data is required');
            return errors;
        }

        // Check required fields
        const requiredFields = ['ic', 'fn', 'gn', 'dob', 'hi', 'in', 'ii', 'sd', 'ed', 'di'];
        for (const field of requiredFields) {
            if (!prcData[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        return errors;
    }
}

module.exports = new PDFService();