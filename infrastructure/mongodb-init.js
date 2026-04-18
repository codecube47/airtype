// MongoDB initialization script for AirType
// This script runs when MongoDB container first starts

db = db.getSiblingDB('airtype');

// Create collections
db.createCollection('users');
db.createCollection('user_settings');
db.createCollection('transcriptions');
db.createCollection('usage_metrics');
db.createCollection('subscriptions');

// Create indexes for users collection
db.users.createIndex({ 'googleId': 1 }, { unique: true });
db.users.createIndex({ 'email': 1 });
db.users.createIndex({ 'status': 1 });
db.users.createIndex({ 'createdAt': 1 });

// Create indexes for user_settings collection
db.user_settings.createIndex({ 'userId': 1 }, { unique: true });

// Create indexes for transcriptions collection
db.transcriptions.createIndex({ 'userId': 1 });
db.transcriptions.createIndex({ 'createdAt': -1 });
db.transcriptions.createIndex({ 'userId': 1, 'createdAt': -1 });

// Create indexes for usage_metrics collection
db.usage_metrics.createIndex({ 'userId': 1, 'date': 1 }, { unique: true });

// Create indexes for subscriptions collection
db.subscriptions.createIndex({ 'userId': 1 }, { unique: true });
db.subscriptions.createIndex({ 'stripeCustomerId': 1 });
db.subscriptions.createIndex({ 'status': 1 });

print('AirType database initialized successfully!');
