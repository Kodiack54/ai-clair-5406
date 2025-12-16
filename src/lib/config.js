/**
 * Clair's Configuration
 */

module.exports = {
  PORT: process.env.PORT || 5406,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SUSAN_URL: process.env.SUSAN_URL || 'http://localhost:5403',

  // AI settings
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022',
  MAX_TOKENS: parseInt(process.env.MAX_TOKENS) || 2000
};
