import { buildContext, saveMemory } from './memory.js';

/**
 * Calls a specific LLM model and returns a plain text response.
 * 
 * @param {Object} params - The parameters for the model call.
 * @param {string} params.model - The model provider ("openai", "gemini", "claude").
 * @param {string} params.prompt - The input text for the model.
 * @param {Object} [params.options] - Optional configuration (e.g., temperature, maxTokens).
 * @returns {Promise<{ success: true, text: string, model: string, tokensUsed?: number } | { success: false, error: string, model: string }>}
 */
export async function callModel({ model, prompt, options = {} }) {
    try {
        const providers = {
            openai: {
                key: process.env.OPENAI_API_KEY,
                url: 'https://api.openai.com/v1/chat/completions',
                method: 'POST',
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                }),
                body: (prompt) => ({
                    model: options.modelName || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt + '\n\nIMPORTANT: Return ONLY plain text. No markdown, no formatting.' }],
                    temperature: options.temperature ?? 0.7,
                }),
                parse: (data) => ({
                    text: data.choices[0].message.content.trim(),
                    tokensUsed: data.usage.total_tokens
                })
            },
            gemini: {
                key: process.env.GOOGLE_API_KEY,
                url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
                method: 'POST',
                headers: () => ({ 'Content-Type': 'application/json' }),
                body: (prompt) => ({
                    contents: [{ parts: [{ text: prompt + '\n\nIMPORTANT: Return ONLY plain text. No markdown, no formatting.' }] }],
                    generationConfig: {
                        temperature: options.temperature ?? 0.7,
                    }
                }),
                parse: (data) => ({
                    text: data.candidates[0].content.parts[0].text.trim(),
                    // Gemini doesn't always provide tokens in the same way, usageMetadata might exist
                    tokensUsed: data.usageMetadata?.totalTokenCount
                })
            },
            claude: {
                key: process.env.ANTHROPIC_API_KEY,
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01'
                }),
                body: (prompt) => ({
                    model: options.modelName || 'claude-3-haiku-20240307',
                    max_tokens: options.maxTokens || 1024,
                    messages: [{ role: 'user', content: prompt + '\n\nIMPORTANT: Return ONLY plain text. No markdown, no formatting.' }],
                    temperature: options.temperature ?? 0.7,
                }),
                parse: (data) => ({
                    text: data.content[0].text.trim(),
                    tokensUsed: data.usage.input_tokens + data.usage.output_tokens
                })
            }
        };

        const config = providers[model.toLowerCase()];
        if (!config) {
            return { success: false, error: `Unsupported model provider: ${model}`, model };
        }

        if (!config.key) {
            return { success: false, error: `API key for ${model} is missing from environment variables.`, model };
        }

        const url = typeof config.url === 'function' ? config.url(config.key) : config.url;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

        const response = await fetch(url, {
            method: config.method,
            headers: config.headers(config.key),
            body: JSON.stringify(config.body(prompt)),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { 
                success: false, 
                error: `API Error (${response.status}): ${errorData.error?.message || response.statusText}`, 
                model 
            };
        }

        const data = await response.json();
        const result = config.parse(data);

        return {
            success: true,
            text: result.text,
            model,
            tokensUsed: result.tokensUsed
        };

    } catch (error) {
        let errorMessage = error.message;
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out';
        }
        return { success: false, error: errorMessage, model };
    }
}

/**
 * Runs an agent task, building context and saving execution memory.
 * 
 * @param {Object} params - The parameters for the agent execution.
 * @param {string} params.agent - The name or ID of the agent.
 * @param {string} params.model - The model provider to use.
 * @param {string} params.task - The task description.
 * @param {Object} [params.context] - Optional additional context.
 * @returns {Promise<{ success: true, response: string, agent: string, timestamp: Date } | { success: false, error: string, agent: string }>}
 */
export async function runAgent({ agent, model, task, context }) {
    // Validate inputs
    if (!agent || typeof agent !== 'string' || agent.trim() === '') {
        return { success: false, error: 'Agent identifier is required and must be a non-empty string.', agent };
    }
    if (!task || typeof task !== 'string' || task.trim() === '') {
        return { success: false, error: 'Task description is required and must be a non-empty string.', agent };
    }

    try {
        console.log(`[Agent: ${agent}] Starting task: "${task}" using model: ${model}`);

        // 1. Build context
        let contextData;
        try {
            contextData = await buildContext({ agent, task, context });
        } catch (ctxError) {
            return { success: false, error: `Failed to build context: ${ctxError.message}`, agent };
        }

        // 2. Combine context + task into prompt
        // Assuming contextData structure based on requirements (agentInfo, taskInfo, history)
        const combinedPrompt = `
Context:
${JSON.stringify(contextData.agentInfo || {})}
Task Info:
${JSON.stringify(contextData.taskInfo || {})}
History:
${JSON.stringify(contextData.history || [])}

Current Task: ${task}
`.trim();

        // 3. Call model
        const result = await callModel({ model, prompt: combinedPrompt });

        if (!result.success) {
            console.error(`[Agent: ${agent}] Model call failed: ${result.error}`);
            return { success: false, error: result.error, agent };
        }

        const responseText = result.text;
        const timestamp = new Date();

        // 4. Save memory (handle errors gracefully)
        try {
            await saveMemory({ 
                agent, 
                model, 
                task, 
                response: responseText, 
                timestamp 
            });
        } catch (memError) {
            console.warn(`[Agent: ${agent}] Warning: Failed to save memory: ${memError.message}`);
            // Do not break the flow, proceed to return response
        }

        console.log(`[Agent: ${agent}] Task completed successfully.`);
        return {
            success: true,
            response: responseText,
            agent,
            timestamp
        };

    } catch (error) {
        console.error(`[Agent: ${agent}] Unexpected error: ${error.message}`);
        return { success: false, error: error.message, agent };
    }
}
