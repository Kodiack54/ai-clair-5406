/**
 * AI Service - Routes requests to appropriate AI model
 * Tracks all usage to dev_ai_usage table
 * 
 * Claude (Anthropic) for 3am writing session:
 * - Technical documentation
 * - How-to guides
 * - System schematics
 * - Journal entries (detailed)
 * 
 * OpenAI (GPT-4o-mini) for daytime tasks:
 * - Simple classification
 * - Bug extraction
 * - Quick summaries
 * - Tagging/categorization
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const supabase = require('../../../shared/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// Model configuration
const MODELS = {
  // Claude models (for 3am quality writing)
  claude_haiku: 'claude-3-5-haiku-20241022',
  claude_sonnet: 'claude-sonnet-4-20250514',
  
  // OpenAI models (for daytime tasks)
  gpt_mini: 'gpt-4o-mini'
};

// Pricing per 1M tokens
const PRICING = {
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 }
};

// Task to model mapping
// Heavy 3am writing tasks -> Claude Sonnet
// Everything else -> GPT-4o-mini
const TASK_MODELS = {
  // 3am writing session tasks -> Claude Sonnet (quality matters)
  'technical_docs': 'claude_sonnet',
  'howto_guides': 'claude_sonnet',
  'schematics': 'claude_sonnet',
  'journal_detailed': 'claude_sonnet',
  'conventions': 'claude_sonnet',
  'daily_summary': 'claude_haiku',
  
  // Daytime tasks -> GPT-4o-mini (fast & cheap)
  'journal_quick': 'gpt_mini',
  'classification': 'gpt_mini',
  'bug_extraction': 'gpt_mini',
  'tagging': 'gpt_mini',
  'simple_summary': 'gpt_mini'
};

/**
 * Calculate cost based on model and tokens
 */
function calculateCost(modelId, inputTokens, outputTokens) {
  const pricing = PRICING[modelId] || { input: 3.0, output: 15.0 };
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Track usage to Supabase
 */
async function trackUsage(modelId, inputTokens, outputTokens, taskType, promptPreview) {
  try {
    const cost = calculateCost(modelId, inputTokens, outputTokens);
    
    await supabase.from('dev_ai_usage').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      model: modelId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      request_type: taskType || 'clair_task',
      assistant_name: 'clair',
      prompt_preview: promptPreview?.slice(0, 255)
    });
    
    console.log(`[AI] Tracked: ${modelId} | ${inputTokens}+${outputTokens} tokens | $${cost.toFixed(6)}`);
  } catch (error) {
    console.error('[AI] Failed to track usage:', error.message);
  }
}

/**
 * Call Claude API
 */
async function callClaude(modelKey, prompt, maxTokens = 1000, taskType = null) {
  const modelId = MODELS[modelKey] || MODELS.claude_haiku;
  const startTime = Date.now();
  
  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  
  // Track usage
  await trackUsage(modelId, inputTokens, outputTokens, taskType, prompt);
  
  return {
    content: response.content[0].text,
    model: modelKey,
    modelId: modelId,
    tokens: { input: inputTokens, output: outputTokens },
    responseTime: Date.now() - startTime
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(modelKey, prompt, maxTokens = 1000, taskType = null) {
  const modelId = MODELS[modelKey] || MODELS.gpt_mini;
  const startTime = Date.now();
  
  const response = await openai.chat.completions.create({
    model: modelId,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  
  // Track usage
  await trackUsage(modelId, inputTokens, outputTokens, taskType, prompt);
  
  return {
    content: response.choices[0].message.content,
    model: modelKey,
    modelId: modelId,
    tokens: { input: inputTokens, output: outputTokens },
    responseTime: Date.now() - startTime
  };
}

/**
 * Generate AI response based on task type
 * Automatically routes to the appropriate model
 */
async function generate(taskType, prompt, options = {}) {
  const modelKey = TASK_MODELS[taskType] || 'gpt_mini';
  const maxTokens = options.maxTokens || 1000;
  
  console.log(`[AI] Task: ${taskType} -> Model: ${modelKey}`);
  
  try {
    if (modelKey.startsWith('claude')) {
      return await callClaude(modelKey, prompt, maxTokens, taskType);
    } else {
      return await callOpenAI(modelKey, prompt, maxTokens, taskType);
    }
  } catch (error) {
    console.error(`[AI] Error with ${modelKey}:`, error.message);
    throw error;
  }
}

/**
 * Generate with explicit model choice
 */
async function generateWithModel(modelKey, prompt, options = {}) {
  const maxTokens = options.maxTokens || 1000;
  const taskType = options.taskType || 'custom';
  
  if (modelKey.startsWith('claude')) {
    return await callClaude(modelKey, prompt, maxTokens, taskType);
  } else {
    return await callOpenAI(modelKey, prompt, maxTokens, taskType);
  }
}

module.exports = {
  generate,
  generateWithModel,
  trackUsage,
  calculateCost,
  MODELS,
  TASK_MODELS,
  PRICING
};
