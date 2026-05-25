const redis = require('redis');
const log = require('./logger');

let client = null;

/**
 * Initialize Redis client
 */
const init = async (redisConfig = {}) => {
  const host = redisConfig.host || process.env.REDIS_HOST || 'localhost';
  const port = redisConfig.port || process.env.REDIS_PORT || 6379;
  const db = redisConfig.db || process.env.REDIS_DB || 0;

  client = redis.createClient({
    host,
    port,
    db
  });

  client.on('error', (err) => {
    log.l(`Redis Client Error: ${err}`);
  });

  client.on('connect', () => {
    log.l('Connected to Redis');
  });

  await client.connect();
  return client;
};

/**
 * Get Redis client instance
 */
const getClient = () => {
  if (!client) {
    throw new Error('Redis client not initialized. Call init() first.');
  }
  return client;
};

/**
 * Set value in Redis
 */
const set = async (key, value, expirySeconds = null) => {
  const client = getClient();
  if (expirySeconds) {
    await client.setEx(key, expirySeconds, JSON.stringify(value));
  } else {
    await client.set(key, JSON.stringify(value));
  }
};

/**
 * Get value from Redis
 */
const get = async (key) => {
  const client = getClient();
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
};

/**
 * Delete value from Redis
 */
const del = async (key) => {
  const client = getClient();
  await client.del(key);
};

/**
 * Check if key exists
 */
const exists = async (key) => {
  const client = getClient();
  return await client.exists(key);
};

/**
 * Get all keys matching pattern
 */
const keys = async (pattern = '*') => {
  const client = getClient();
  return await client.keys(pattern);
};

/**
 * Close Redis connection
 */
const close = async () => {
  if (client) {
    await client.quit();
    log.l('Redis connection closed');
  }
};

module.exports = {
  init,
  getClient,
  set,
  get,
  del,
  exists,
  keys,
  close
};
