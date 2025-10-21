/**
 * Logger Configuration for PRC Generator Application
 *
 * This module configures the @zandd/app-logger for comprehensive logging
 * throughout the application with appropriate log levels for different environments.
 */

const AppLogger = require('@zandd/app-logger');
const path = require('path');

// Determine log level based on environment
const getLogLevel = () => {
    if (process.env.LOG_LEVEL) {
        return process.env.LOG_LEVEL;
    }

    switch (process.env.NODE_ENV) {
        case 'production':
            return 'info';
        case 'test':
            return 'warn';
        case 'development':
        default:
            return 'trace';
    }
};

// Configure logger options for @zandd/app-logger
const loggerConfig = {
    logTracelevel: getLogLevel(),
    consoleOutput: 'on',
    logPath: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
    dateLocale: 'en-US',
    fileRotation: process.env.LOG_FILE_ROTATION !== 'false',
    maxFileSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d'
};

// Create a logger cache to avoid creating multiple loggers for the same module
const loggerCache = new Map();

// Export logger and helper functions
module.exports = {
    /**
     * Get or create a logger for a specific module
     * @param {string} moduleName - Name of the module for context
     * @returns {AppLogger} Logger instance for the module
     */
    getLogger: (moduleName) => {
        if (!loggerCache.has(moduleName)) {
            loggerCache.set(moduleName, new AppLogger(moduleName, loggerConfig));
        }
        return loggerCache.get(moduleName);
    },

    /**
     * Get the main application logger
     */
    get logger() {
        return module.exports.getLogger('App');
    },

    /**
     * Log function entry with parameters
     * @param {string} functionName - Name of the function
     * @param {object} params - Function parameters to log
     * @param {AppLogger} loggerInstance - Logger instance to use
     */
    logEntry: async (functionName, params = {}, loggerInstance = null) => {
        const logger = loggerInstance || module.exports.logger;
        await logger.trace(`→ Entering ${functionName}`, {
            function: functionName,
            params: sanitizeParams(params)
        });
    },

    /**
     * Log function exit with result
     * @param {string} functionName - Name of the function
     * @param {any} result - Function result to log
     * @param {AppLogger} loggerInstance - Logger instance to use
     */
    logExit: async (functionName, result = null, loggerInstance = null) => {
        const logger = loggerInstance || module.exports.logger;
        await logger.trace(`← Exiting ${functionName}`, {
            function: functionName,
            hasResult: result !== null && result !== undefined
        });
    },

    /**
     * Log exception from try/catch block
     * @param {string} functionName - Name of the function where error occurred
     * @param {Error} error - Error object
     * @param {object} context - Additional context information
     * @param {AppLogger} loggerInstance - Logger instance to use
     */
    logException: async (functionName, error, context = {}, loggerInstance = null) => {
        const logger = loggerInstance || module.exports.logger;
        await logger.exception(`Exception in ${functionName}`, {
            function: functionName,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            },
            context: sanitizeParams(context)
        });
    }
};

/**
 * Sanitize parameters to remove sensitive information from logs
 * @param {object} params - Parameters to sanitize
 * @returns {object} Sanitized parameters
 */
function sanitizeParams(params) {
    if (!params || typeof params !== 'object') {
        return params;
    }

    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'privateKey', 'authorization'];

    for (const key in sanitized) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeParams(sanitized[key]);
        }
    }

    return sanitized;
}
