/**
 * Clair's Claude Client
 * For documentation generation
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const { Logger } = require('./logger');
const { logAnthropicResponse } = require('./usageLogger');

const logger = new Logger('Clair:Claude');

let client = null;

function getClient() {
  if (!client) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    client = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY
    });
    logger.info('Claude client initialized');
  }
  return client;
}

/**
 * Generate documentation from source content
 */
async function generateDoc(docType, title, sourceContent, projectPath = null) {
  const client = getClient();
  const startTime = Date.now();

  const systemPrompts = {
    howto: `You are Clair, the AI Documentation Manager. Generate a clear, step-by-step how-to guide.
Format with markdown headings, numbered steps, code blocks where appropriate, and troubleshooting tips.`,

    schematic: `You are Clair, the AI Documentation Manager. Generate a system schematic document.
Include component diagrams (in ASCII or markdown tables), data flow explanations, and connection details.`,

    breakdown: `You are Clair, the AI Documentation Manager. Generate a detailed system breakdown.
Explain each component's purpose, location, dependencies, and how they interact.`,

    reference: `You are Clair, the AI Documentation Manager. Generate a technical reference document.
Be concise but comprehensive. Include all relevant details developers need.`,

    guide: `You are Clair, the AI Documentation Manager. Generate an informative guide.
Make it accessible, well-organized, and practical.`
  };

  try {
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: config.MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: `Generate a ${docType} document titled "${title}".

Source content to base this on:
${sourceContent}

Generate comprehensive, well-formatted markdown documentation.`
        }
      ],
      system: systemPrompts[docType] || systemPrompts.reference
    });

    // Log usage
    await logAnthropicResponse(response, 'doc_generation', projectPath, title, startTime);

    return response.content[0].text;
  } catch (error) {
    logger.error('Doc generation failed', { error: error.message, docType, title });
    throw error;
  }
}

/**
 * Summarize knowledge entries for documentation
 */
async function summarizeKnowledge(entries, projectPath = null) {
  const client = getClient();
  const startTime = Date.now();

  try {
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Summarize these knowledge entries into a coherent overview:

${entries.map(e => `- ${e.title}: ${e.summary}`).join('\n')}

Create a brief overview that captures the key points and themes.`
        }
      ],
      system: `You are Clair, the AI Documentation Manager. Create clear, organized summaries.`
    });

    await logAnthropicResponse(response, 'knowledge_summary', projectPath, 'Knowledge Summary', startTime);

    return response.content[0].text;
  } catch (error) {
    logger.error('Knowledge summarization failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  getClient,
  generateDoc,
  summarizeKnowledge
};
