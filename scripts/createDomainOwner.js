/**
 * Script to create the Domain Owner (System Administrator)
 *
 * This script creates the initial system administrator account
 * which has full privileges to:
 * - Approve/reject institution creation requests
 * - Generate institution IDs
 * - Manage all system settings
 *
 * Usage: node scripts/createDomainOwner.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const User = require('../models/User');
const { getLogger } = require('../config/logger');

const logger = getLogger('DomainOwnerSetup');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Hide password input
function questionSecret(query) {
    return new Promise(resolve => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        stdout.write(query);
        stdin.resume();
        stdin.setRawMode(true);
        stdin.setEncoding('utf8');

        let password = '';

        stdin.on('data', function onData(char) {
            char = char.toString('utf8');

            switch (char) {
                case '\n':
                case '\r':
                case '\u0004': // Ctrl-D
                    stdin.setRawMode(false);
                    stdin.removeListener('data', onData);
                    stdout.write('\n');
                    resolve(password);
                    break;
                case '\u0003': // Ctrl-C
                    process.exit();
                    break;
                case '\u007f': // Backspace
                case '\b':
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        stdout.clearLine();
                        stdout.cursorTo(0);
                        stdout.write(query + '*'.repeat(password.length));
                    }
                    break;
                default:
                    password += char;
                    stdout.write('*');
                    break;
            }
        });
    });
}

async function createDomainOwner() {
    try {
        logger.info('=== Domain Owner Setup ===');
        console.log('\n=== Domain Owner (System Administrator) Setup ===\n');

        // Connect to MongoDB
        logger.debug('Connecting to MongoDB');
        let mongoUri;

        if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_CLUSTER && process.env.DB_NAME) {
            mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
        } else if (process.env.MONGODB_URI) {
            mongoUri = process.env.MONGODB_URI;
        } else {
            mongoUri = 'mongodb://192.168.129.197:27017/prcgen';
        }

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        logger.info('MongoDB connected successfully');
        console.log('✓ Connected to database\n');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log('⚠️  A Domain Owner (admin) account already exists:');
            console.log(`   Username: ${existingAdmin.username}`);
            console.log(`   Email: ${existingAdmin.email}`);
            console.log(`   Created: ${existingAdmin.createdAt.toLocaleString()}\n`);

            const overwrite = await question('Do you want to create another Domain Owner? (yes/no): ');
            if (overwrite.toLowerCase() !== 'yes' && overwrite.toLowerCase() !== 'y') {
                console.log('\nSetup cancelled.');
                rl.close();
                await mongoose.connection.close();
                process.exit(0);
            }
            console.log('');
        }

        // Collect domain owner information
        console.log('Please provide the following information:\n');

        const username = await question('Username (3-50 characters): ');
        if (!username || username.length < 3 || username.length > 50) {
            throw new Error('Username must be between 3 and 50 characters');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            throw new Error('Username can only contain letters, numbers, and underscores');
        }

        // Check if username already exists
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            throw new Error('Username already exists');
        }

        const email = await question('Email address: ');
        if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            throw new Error('Please enter a valid email address');
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            throw new Error('Email already registered');
        }

        const firstName = await question('First Name: ');
        if (!firstName || firstName.length < 1 || firstName.length > 50) {
            throw new Error('First name is required and must be less than 50 characters');
        }

        const lastName = await question('Last Name: ');
        if (!lastName || lastName.length < 1 || lastName.length > 50) {
            throw new Error('Last name is required and must be less than 50 characters');
        }

        const organization = await question('Organization (optional): ');

        console.log('\nPassword requirements:');
        console.log('- Minimum 8 characters');
        console.log('- At least one uppercase letter');
        console.log('- At least one lowercase letter');
        console.log('- At least one number\n');

        const password = await questionSecret('Password: ');
        if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            throw new Error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }

        const confirmPassword = await questionSecret('Confirm Password: ');
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }

        // Create domain owner
        console.log('\nCreating Domain Owner account...');
        logger.debug('Creating admin user', { username, email });

        const domainOwner = new User({
            username,
            email,
            password,
            firstName,
            lastName,
            organization: organization || undefined,
            role: 'admin',
            isActive: true
        });

        await domainOwner.save();

        logger.info('Domain Owner created successfully', {
            userId: domainOwner._id,
            username: domainOwner.username,
            email: domainOwner.email
        });

        console.log('\n✓ Domain Owner account created successfully!\n');
        console.log('Account Details:');
        console.log(`  Username: ${domainOwner.username}`);
        console.log(`  Email: ${domainOwner.email}`);
        console.log(`  Name: ${domainOwner.fullName}`);
        console.log(`  Role: Domain Owner (System Administrator)`);
        console.log(`  Account ID: ${domainOwner._id}\n`);

        console.log('You can now login with these credentials and:');
        console.log('  • Approve/reject institution creation requests');
        console.log('  • Generate institution IDs');
        console.log('  • Manage system settings');
        console.log('  • Access all administrative functions\n');

        rl.close();
        await mongoose.connection.close();
        logger.info('Domain Owner setup completed');
        process.exit(0);

    } catch (error) {
        logger.error('Domain Owner setup failed', { error: error.message, stack: error.stack });
        console.error('\n❌ Error:', error.message);
        console.error('\nSetup failed. Please try again.\n');

        rl.close();
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the script
createDomainOwner();
