const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const packageJson = require('./package.json');
require('dotenv').config();

// Initialize logger
const { logger, getLogger, logEntry, logExit, logException } = require('./config/logger');
const appLogger = getLogger('App');

logEntry('main', { version: packageJson.version, nodeEnv: process.env.NODE_ENV });

const app = express();
const PORT = process.env.PORT || 4400;

appLogger.info('Initializing PRC Generator Application', {
    version: packageJson.version,
    nodeVersion: process.version,
    platform: process.platform,
    port: PORT
});

// View engine setup
const expressLayouts = require('express-ejs-layouts');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MongoDB connection with retry logic
appLogger.trace('Configuring MongoDB connection');
let mongoUri;
if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_CLUSTER && process.env.DB_NAME) {
  mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
  appLogger.info('Using MongoDB Atlas with individual env variables', { cluster: process.env.DB_CLUSTER, database: process.env.DB_NAME });
} else if (process.env.MONGODB_URI) {
  mongoUri = process.env.MONGODB_URI;
  appLogger.info('Using MONGODB_URI environment variable');
} else if (process.env.NODE_ENV === 'production') {
  appLogger.error('Production environment but no database credentials found!');
  process.exit(1);
} else {
  mongoUri = 'mongodb://192.168.129.197:27017/prcgen';
  appLogger.info('Using local MongoDB (development mode)', { uri: 'mongodb://192.168.129.197:27017/prcgen' });
}

// MongoDB options
const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

appLogger.debug('Attempting MongoDB connection', { options: mongoOptions });
mongoose.connect(mongoUri, mongoOptions)
  .then(() => {
    appLogger.info('MongoDB connected successfully', {
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port
    });
  })
  .catch(err => {
    logException('mongooseConnect', err, { mongoOptions }, appLogger);
    appLogger.error('MongoDB connection failed - exiting application');
    process.exit(1);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  logException('mongooseConnectionError', err, {}, appLogger);
});

mongoose.connection.on('disconnected', () => {
  appLogger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  appLogger.info('MongoDB reconnected successfully');
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'prc-generator-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri,
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: {
    secure: false, // Allow HTTP cookies since SSL termination happens at load balancer/proxy
    httpOnly: true,
    maxAge: null // Session cookie - expires when browser is closed
  }
}));

// Cache control middleware - prevent caching of authenticated content
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Application mode configuration
const APP_MODE = (process.env.MODE || 'DEBUG').toUpperCase();
appLogger.info(`Application running in ${APP_MODE} mode`, { mode: APP_MODE });

// Make mode and version available to all views
app.use((req, res, next) => {
  res.locals.appMode = APP_MODE;
  res.locals.isDebugMode = APP_MODE === 'DEBUG';
  res.locals.isProductionMode = APP_MODE === 'PRODUCTION';
  res.locals.appVersion = packageJson.version;
  next();
});

// Request logging middleware - log ALL incoming requests
app.use((req, res, next) => {
  appLogger.debug('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')?.substring(0, 100)
  });
  next();
});

// Load user middleware
appLogger.trace('Loading authentication middleware');
const { loadUser } = require('./middleware/auth');
app.use(loadUser);

// Authentication routes (no auth required)
appLogger.trace('Registering authentication routes');
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// Main application routes (auth required)
appLogger.trace('Registering PRC routes');
const prcRoutes = require('./routes/prcRoutes');
app.use('/prc', prcRoutes);

// EHIC routes (European Health Insurance Card)
appLogger.trace('Registering EHIC routes');
const ehicRoutes = require('./routes/ehicRoutes');
app.use('/ehic', ehicRoutes);

// Root redirect
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        // Redirect based on user role (will be populated by loadUser middleware)
        if (req.user && req.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
    }
    res.redirect('/prc/dashboard');
});

// Certificate management routes
appLogger.trace('Registering certificate routes');
const certRoutes = require('./routes/certRoutes');
app.use('/certificates', certRoutes);

// Institution routes
appLogger.trace('Registering institution routes');
const institutionRoutes = require('./routes/institutionRoutes');
app.use('/institution', institutionRoutes);

// Institution request routes
appLogger.trace('Registering institution request routes');
const institutionRequestRoutes = require('./routes/institutionRequestRoutes');
app.use('/institution-request', institutionRequestRoutes);

// Admin routes (Domain Owner)
appLogger.trace('Registering admin routes');
const adminRoutes = require('./routes/adminRoutes');
app.use('/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logException('expressErrorHandler', err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, appLogger);

  res.status(500).render('errorPage', {
    title: 'Error',
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
  });
});

// 404 handler - must be LAST middleware after all routes
app.use((req, res) => {
  appLogger.warn('Route not found - 404', {
    url: req.originalUrl,
    path: req.path,
    method: req.method,
    ip: req.ip,
    query: req.query,
    params: req.params,
    userAgent: req.get('user-agent')?.substring(0, 100),
    referer: req.get('referer'),
    userId: req.session?.userId
  });

  res.status(404).render('unknown', {
    title: '404 Not Found',
    url: req.originalUrl
  });
});

app.listen(PORT, () => {
  appLogger.info(`PRC Generator Server started successfully`, {
    url: `http://localhost:${PORT}`,
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
    mode: APP_MODE
  });

  logExit('main');
});

module.exports = app;