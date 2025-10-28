const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getLogger } = require('../config/logger');

const logger = getLogger('EHICPDFService');

class EHICPDFService {
    /**
     * Generate EHIC PDF document according to eEHIC specifications
     * @param {Object} ehicData - EHIC data object
     * @param {Object} options - PDF generation options
     * @returns {Promise<Buffer>} - PDF as buffer
     */
    async generatePDF(ehicData, options = {}) {
        try {
            logger.debug('Starting EHIC PDF generation', { ehicId: ehicData._id });

            // Create new PDF document (A4 format)
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                ...options
            });

            // Collect PDF chunks
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));

            // Add content to PDF
            await this.addEHICContent(doc, ehicData);

            // Finalize the PDF
            doc.end();

            // Wait for PDF to be complete
            return new Promise((resolve, reject) => {
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    logger.debug('EHIC PDF generated successfully', { bufferSize: pdfBuffer.length });
                    resolve(pdfBuffer);
                });
                doc.on('error', reject);
            });

        } catch (error) {
            logger.error('EHIC PDF generation error', { error: error.message, stack: error.stack });
            throw new Error(`Failed to generate EHIC PDF: ${error.message}`);
        }
    }

    /**
     * Add EHIC content to PDF document
     * @param {PDFDocument} doc - PDF document
     * @param {Object} ehicData - EHIC data
     */
    async addEHICContent(doc, ehicData) {
        // Page dimensions
        const pageWidth = doc.page.width;
        const margin = doc.page.margins.left;
        const contentWidth = pageWidth - (margin * 2);

        // Colors
        const primaryColor = '#000000';
        const grayColor = '#666666';
        const blueColor = '#003399';

        // Move up to reduce top margin
        doc.moveUp(2.5);

        // === MAIN TITLE ===
        doc.font('Helvetica-Bold').fontSize(14)
            .fillColor(blueColor)
            .text('EUROPEAN HEALTH INSURANCE CARD', { align: 'center' });

        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(12)
            .fillColor(primaryColor)
            .text('(eEHIC)', { align: 'center' });

        doc.moveDown(0.3);
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text('Card Issuer: European Union', { align: 'center' });

        doc.moveDown(1.5);

        // === CARD ISSUER COUNTRY ===
        const currentY1 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('1. Card Issuer Country', margin, currentY1);

        doc.rect(margin, currentY1 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.cardIssuerCountry || 'N/A', margin + 5, currentY1 + 23);

        doc.moveDown(3);

        // === PERSONAL IDENTIFICATION NUMBER ===
        const currentY2 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('2. Personal Identification Number', margin, currentY2);

        doc.rect(margin, currentY2 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.personalIdNumber || 'N/A', margin + 5, currentY2 + 23);

        doc.moveDown(3);

        // === FAMILY NAME ===
        const currentY3 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('3. Surname / Family Name', margin, currentY3);

        doc.rect(margin, currentY3 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.familyName || 'N/A', margin + 5, currentY3 + 23);

        doc.moveDown(3);

        // === GIVEN NAME ===
        const currentY4 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('4. Forename(s) / Given Name(s)', margin, currentY4);

        doc.rect(margin, currentY4 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.givenName || 'N/A', margin + 5, currentY4 + 23);

        doc.moveDown(3);

        // === DATE OF BIRTH ===
        const currentY5 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('5. Date of Birth', margin, currentY5);

        doc.rect(margin, currentY5 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(this.formatDate(ehicData.dateOfBirth) || 'N/A', margin + 5, currentY5 + 23);

        doc.moveDown(3);

        // === INSTITUTION ID ===
        const currentY6 = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('6. Identification Number of the Institution', margin, currentY6);

        doc.rect(margin, currentY6 + 18, contentWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.institutionId || 'N/A', margin + 5, currentY6 + 23);

        doc.moveDown(3);

        // === CARD IDENTIFICATION NUMBER (SIDE BY SIDE WITH EXPIRY DATE) ===
        const currentY7 = doc.y;
        const leftBoxWidth = contentWidth * 0.6;
        const rightBoxWidth = contentWidth * 0.38;
        const rightBoxX = margin + leftBoxWidth + contentWidth * 0.02;

        // Card ID
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('7. Card Identification Number', margin, currentY7);

        doc.rect(margin, currentY7 + 18, leftBoxWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(ehicData.cardId || 'N/A', margin + 5, currentY7 + 23);

        // Expiry Date
        doc.font('Helvetica-Bold').fontSize(10)
            .fillColor(primaryColor)
            .text('8. Expiry Date', rightBoxX, currentY7);

        doc.rect(rightBoxX, currentY7 + 18, rightBoxWidth, 25).stroke();
        doc.font('Helvetica').fontSize(12)
            .text(this.formatDate(ehicData.expiryDate) || 'N/A', rightBoxX + 5, currentY7 + 23);

        doc.moveDown(4);

        // === ISSUANCE INFORMATION ===
        doc.moveDown(2);
        doc.font('Helvetica-Oblique').fontSize(9)
            .fillColor(grayColor)
            .text(`Card issued on: ${this.formatDate(ehicData.issuanceDate)}`, { align: 'center' });

        if (ehicData.reviewedBy && ehicData.reviewedAt) {
            doc.text(`Approved on: ${this.formatDate(ehicData.reviewedAt)}`, { align: 'center' });
        }

        // === FOOTER ===
        doc.moveDown(2);
        const footerY = doc.page.height - 100;
        doc.font('Helvetica-Oblique').fontSize(8)
            .fillColor(grayColor)
            .text('This card certifies entitlement to healthcare benefits during a stay in another EU/EEA country or Switzerland.',
                  margin, footerY, { align: 'center', width: contentWidth });

        doc.moveDown(0.5);
        doc.text('Present this card to any healthcare provider in the EU/EEA or Switzerland.',
                 { align: 'center', width: contentWidth });

        doc.moveDown(1);
        doc.font('Helvetica').fontSize(7)
            .fillColor(grayColor)
            .text('Regulation (EC) No 883/2004 and Regulation (EC) No 987/2009', { align: 'center' });

        logger.debug('EHIC content added to PDF successfully');
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @returns {string} - Formatted date
     */
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date; // Return as-is if invalid

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();

        return `${day}/${month}/${year}`;
    }

    /**
     * Save EHIC PDF to file system
     * @param {Object} ehicData - EHIC data
     * @returns {Promise<string>} - Path to saved PDF
     */
    async saveEHICPDF(ehicData) {
        try {
            logger.debug('Saving EHIC PDF to file system', { ehicId: ehicData._id });

            // Generate PDF buffer
            const pdfBuffer = await this.generatePDF(ehicData);

            // Create pdfs directory if it doesn't exist
            const pdfsDir = path.join(__dirname, '..', 'pdfs', 'ehic');
            if (!fs.existsSync(pdfsDir)) {
                fs.mkdirSync(pdfsDir, { recursive: true });
                logger.debug('Created EHIC PDFs directory', { path: pdfsDir });
            }

            // Generate filename
            const filename = `ehic_${ehicData.citizenId}_${Date.now()}.pdf`;
            const filePath = path.join(pdfsDir, filename);

            // Write PDF to file
            fs.writeFileSync(filePath, pdfBuffer);

            logger.info('EHIC PDF saved successfully', {
                ehicId: ehicData._id,
                filePath: filePath,
                fileSize: pdfBuffer.length
            });

            return filePath;

        } catch (error) {
            logger.error('Error saving EHIC PDF', {
                error: error.message,
                stack: error.stack,
                ehicId: ehicData._id
            });
            throw error;
        }
    }
}

module.exports = new EHICPDFService();
