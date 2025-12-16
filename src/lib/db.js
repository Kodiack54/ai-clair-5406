/**
 * Clair's Database Client
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const { Logger } = require('./logger');

const logger = new Logger('Clair:DB');

let supabase = null;

function getClient() {
  if (!supabase) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
    logger.info('Supabase client initialized');
  }
  return supabase;
}

function from(table) {
  return getClient().from(table);
}

async function testConnection() {
  try {
    const { data, error } = await from('dev_ai_journal')
      .select('id')
      .limit(1);

    if (error) throw error;
    logger.info('Database connection verified');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    return false;
  }
}

module.exports = {
  getClient,
  from,
  testConnection
};
