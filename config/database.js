const { MongoClient } = require('mongodb');
const config = require('./keys');

let db = null;
let client = null;
let isConnected = false;

const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    client = new MongoClient(config.mongo.url(), config.mongo.options);
    await client.connect();
    db = client.db('nuke-brand');
    isConnected = true;
    console.log('MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.log('Please check your MongoDB connection string and network connectivity');
    isConnected = false;
    // Don't exit the process, let the app continue without database
    return null;
  }
};

const getDB = () => {
  if (!db || !isConnected) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
};

const isDBConnected = () => {
  return isConnected && db !== null;
};

const closeDB = async () => {
  if (client) {
    await client.close();
    isConnected = false;
    console.log('MongoDB connection closed');
  }
};

module.exports = {
  connectDB,
  getDB,
  closeDB,
  isDBConnected
}; 