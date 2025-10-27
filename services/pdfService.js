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
        const margin = doc.page.margins.left;
        const contentWidth = pageWidth - (margin * 2);

        // Colors
        const primaryColor = '#000000';
        const grayColor = '#666666';

        // Move up to reduce top margin (like qrscanapp)
        doc.moveUp(2.5);

        // === MAIN TITLES ===
        doc.font('Helvetica-Bold').fontSize(12)
            .fillColor(primaryColor)
            .text('PROVISIONAL REPLACEMENT CERTIFICATE', { align: 'center' });

        doc.text('OF THE', { align: 'center' });
        doc.text('EUROPEAN HEALTH INSURANCE CARD', { align: 'center' });

        // === SUBTITLES ===
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('(to be presented to a healthcare provider)', { align: 'center' });

        doc.text('(Article 25 of Regulation (EC) No 987/2009)', { align: 'center' });
        doc.moveDown(1);

        // === ISSUING MEMBER STATE LABEL ===
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(primaryColor)
            .text('Issuing Member State', { align: 'right' });
        doc.moveDown(0.5);

        // === FIELDS 1-2: Side by side boxes ===
        const currentY = doc.y;
        const boxHeight = 30;
        const box1Width = contentWidth * 0.48;
        const box2Width = contentWidth * 0.48;
        const box2X = margin + contentWidth * 0.52;

        // Reduced line width for cleaner look
        doc.lineWidth(0.5);

        // Field 1 box (number only)
        doc.rect(margin, currentY, box1Width, boxHeight).stroke();
        doc.font('Helvetica').fontSize(9)
            .fillColor(primaryColor)
            .text('1.', margin + 5, currentY + 10);

        // Field 2 box (country)
        const countryName = this.getCountryName(prcData.ic);
        doc.rect(box2X, currentY, box2Width, boxHeight).stroke();
        doc.text(`2. ${countryName}`, box2X + 5, currentY + 10);

        doc.y = currentY + boxHeight + 10;

        // === CARD HOLDER INFORMATION ===
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Card holder-related information', { align: 'left' });
        doc.moveDown(0.5);

        const holderBoxY = doc.y;
        const holderBoxHeight = 120;

        // Draw outer box
        doc.rect(margin, holderBoxY, contentWidth, holderBoxHeight).stroke();

        // Field 3: Name
        let fieldY = holderBoxY + 5;
        doc.font('Helvetica').fontSize(9)
            .text('3. Name', margin + 5, fieldY);
        doc.rect(margin, fieldY + 15, contentWidth, 20).stroke();
        doc.font('Helvetica-Bold').fontSize(10)
            .text(prcData.fn || '', margin + 5, fieldY + 20);

        // Field 4: Given name(s)
        fieldY += 40;
        doc.font('Helvetica').fontSize(9)
            .text('4. Given name(s)', margin + 5, fieldY);
        doc.rect(margin, fieldY + 15, contentWidth, 20).stroke();
        doc.font('Helvetica-Bold').fontSize(10)
            .text(prcData.gn || '', margin + 5, fieldY + 20);

        // Fields 5 & 6: Date of birth and Personal ID side by side
        fieldY += 40;
        const field5Width = contentWidth * 0.48;
        const field6Width = contentWidth * 0.48;
        const field6X = margin + contentWidth * 0.52;

        doc.font('Helvetica').fontSize(9)
            .text('5. Date of birth', margin + 5, fieldY);
        doc.text('6. Personal identification number', field6X + 5, fieldY);

        doc.rect(margin, fieldY + 15, field5Width, 20).stroke();
        doc.rect(field6X, fieldY + 15, field6Width, 20).stroke();

        doc.font('Helvetica-Bold').fontSize(10)
            .text(this.formatDate(prcData.dob), margin + 5, fieldY + 20);
        doc.text(prcData.hi || '', field6X + 5, fieldY + 20);

        doc.y = holderBoxY + holderBoxHeight + 15;

        // === COMPETENT INSTITUTION ===
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Competent institution', { align: 'left' });
        doc.moveDown(0.5);

        const institutionBoxY = doc.y;
        const institutionBoxHeight = 45;

        doc.rect(margin, institutionBoxY, contentWidth, institutionBoxHeight).stroke();

        doc.font('Helvetica').fontSize(9)
            .fillColor(primaryColor)
            .text('7. Institution', margin + 5, institutionBoxY + 5);

        doc.rect(margin, institutionBoxY + 20, contentWidth, 20).stroke();
        doc.font('Helvetica-Bold').fontSize(10)
            .text(`${prcData.in} (${prcData.ii})`, margin + 5, institutionBoxY + 25);

        doc.y = institutionBoxY + institutionBoxHeight + 15;

        // === CARD INFORMATION ===
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Card-related information', { align: 'left' });
        doc.moveDown(0.5);

        const cardBoxY = doc.y;
        const cardBoxHeight = 45;

        doc.rect(margin, cardBoxY, contentWidth, cardBoxHeight).stroke();

        // Fields 8 & 9 side by side
        const field8Width = contentWidth * 0.48;
        const field9Width = contentWidth * 0.48;
        const field9X = margin + contentWidth * 0.52;

        doc.font('Helvetica').fontSize(9)
            .fillColor(primaryColor)
            .text('8. Card identification number', margin + 5, cardBoxY + 5);
        doc.text('9. Expiry date', field9X + 5, cardBoxY + 5);

        doc.rect(margin, cardBoxY + 20, field8Width, 20).stroke();
        doc.rect(field9X, cardBoxY + 20, field9Width, 20).stroke();

        doc.font('Helvetica-Bold').fontSize(10)
            .text(prcData.ci || '', margin + 5, cardBoxY + 25);
        doc.text(prcData.xd ? this.formatDate(prcData.xd) : '', field9X + 5, cardBoxY + 25);

        doc.y = cardBoxY + cardBoxHeight + 15;

        // === CERTIFICATE VALIDITY & SIGNATURE BOX ===
        const validityBoxY = doc.y;
        const leftBoxWidth = contentWidth * 0.6;
        const signatureBoxWidth = contentWidth * 0.35;
        const signatureBoxX = margin + contentWidth * 0.65;
        const boxesHeight = 160;

        // Left box: Validity period and delivery date
        doc.rect(margin, validityBoxY, leftBoxWidth, boxesHeight).stroke();

        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Certificate validity period and delivery date', margin + 5, validityBoxY + 5);

        // From/To fields
        let validityY = validityBoxY + 25;
        doc.font('Helvetica').fontSize(9)
            .fillColor(primaryColor)
            .text('(a) From', margin + 5, validityY);
        doc.text('(b) To', margin + 5, validityY + 30);

        doc.rect(margin + 60, validityY - 5, leftBoxWidth - 70, 20).stroke();
        doc.rect(margin + 60, validityY + 25, leftBoxWidth - 70, 20).stroke();

        doc.font('Helvetica-Bold').fontSize(10)
            .text(this.formatDate(prcData.sd), margin + 65, validityY);
        doc.text(this.formatDate(prcData.ed), margin + 65, validityY + 30);

        // Delivery date
        validityY += 70;
        doc.font('Helvetica').fontSize(9)
            .fillColor(primaryColor)
            .text('(c) Date', margin + 5, validityY);

        doc.rect(margin + 60, validityY - 5, leftBoxWidth - 70, 20).stroke();
        doc.font('Helvetica-Bold').fontSize(10)
            .text(this.formatDate(prcData.di), margin + 65, validityY);

        // Right box: Signature with QR code
        doc.rect(signatureBoxX, validityBoxY, signatureBoxWidth, boxesHeight).stroke();

        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Signature and/or stamp', signatureBoxX + 5, validityBoxY + 5, {
                width: signatureBoxWidth - 10,
                align: 'center'
            });

        doc.font('Helvetica-Oblique').fontSize(9)
            .text('of the institution', signatureBoxX + 5, validityBoxY + 17, {
                width: signatureBoxWidth - 10,
                align: 'center'
            });

        // Embed QR code in signature box
        await this.addQRCodeInSignatureBox(doc, qrCodeData, signatureBoxX, validityBoxY, signatureBoxWidth, boxesHeight);

        // Move to bottom of boxes for footer section
        doc.y = validityBoxY + boxesHeight + 20;

        // === NOTES AND FOOTER ===
        // Add horizontal separator
        doc.moveTo(margin, doc.y)
            .lineTo(pageWidth - margin, doc.y)
            .stroke();

        doc.moveDown(0.5);

        // Notes title
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(primaryColor)
            .text('Notes and information', margin, doc.y);

        doc.moveDown(0.5);

        // Notes content - matching qrscanapp format
        doc.font('Helvetica').fontSize(9)
            .fillColor(grayColor)
            .text('as defined in Annex 2 to Decision No S2', margin, doc.y, {
                align: 'justify',
                width: contentWidth
            });

        doc.text('concerning the technical specifications of the European Health Insurance Card', margin, doc.y, {
            align: 'justify',
            width: contentWidth
        });

        doc.moveDown(0.5);

        doc.text('All norms applicable to the eye-readable data included in the European Health Insurance Card also apply to this provisional replacement certificate.', margin, doc.y, {
            align: 'justify',
            width: contentWidth
        });

        doc.moveDown(1);

        // Generation timestamp footer
        doc.font('Helvetica').fontSize(8)
            .fillColor(grayColor)
            .text(`Generated on: ${new Date().toLocaleString('en-GB')}`, margin, doc.y, {
                align: 'center',
                width: contentWidth
            });
    }

    /**
     * Add QR code inside signature box (replicated from qrscanapp)
     * Generates optimal high-quality QR code and centers it in the signature box
     * @param {PDFDocument} doc - PDFKit document
     * @param {string} qrCodeData - Base45 encoded QR data
     * @param {number} signatureBoxX - X position of signature box
     * @param {number} signatureBoxY - Y position of signature box
     * @param {number} signatureBoxWidth - Width of signature box
     * @param {number} signatureBoxHeight - Height of signature box
     */
    async addQRCodeInSignatureBox(doc, qrCodeData, signatureBoxX, signatureBoxY, signatureBoxWidth, signatureBoxHeight) {
        try {
            logger.debug('Adding QR code to signature box', {
                boxX: signatureBoxX,
                boxY: signatureBoxY,
                boxWidth: signatureBoxWidth,
                boxHeight: signatureBoxHeight,
                dataLength: qrCodeData.length
            });

            // Generate optimal QR code using the QR service (which uses Sharp for high quality)
            const qrCodeService = require('./qrCodeService');

            // Calculate optimal size based on signature box dimensions
            // Leave 10px padding on each side
            const maxQRSize = Math.min(signatureBoxWidth - 20, signatureBoxHeight - 20);
            const baseSize = 150;
            const qrCodeSize = Math.min(maxQRSize, baseSize);

            logger.debug('QR code size calculated', { maxQRSize, qrCodeSize });

            // Generate high-quality QR code image using optimal generation
            const qrCodeBuffer = await qrCodeService.generateQRCodeImage(qrCodeData, {
                width: qrCodeSize,
                margin: 2,
                useOptimal: true // Use Sharp-based optimal generation
            });

            logger.debug('QR code generated', { bufferSize: qrCodeBuffer.length });

            // Calculate centered position within signature box
            const qrCodeX = signatureBoxX + (signatureBoxWidth - qrCodeSize) / 2;
            const qrCodeY = signatureBoxY + (signatureBoxHeight - qrCodeSize) / 2;

            logger.debug('QR code position calculated', { qrCodeX, qrCodeY });

            // Add QR code image to PDF
            doc.image(qrCodeBuffer, qrCodeX, qrCodeY, {
                width: qrCodeSize,
                height: qrCodeSize,
                fit: [qrCodeSize, qrCodeSize]
            });

            logger.debug('QR code added to signature box successfully');

        } catch (error) {
            logger.error('Failed to add QR code to signature box', {
                error: error.message,
                stack: error.stack
            });

            // Fallback: Add error message in signature box
            doc.font('Helvetica').fontSize(9)
                .fillColor('#FF0000')
                .text('QR Code Generation Failed',
                    signatureBoxX + 20,
                    signatureBoxY + (signatureBoxHeight / 2), {
                        width: signatureBoxWidth - 40,
                        align: 'center'
                    });
        }
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