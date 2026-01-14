const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper: Retry Wrapper
async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (error.message.includes('429') || error.message.includes('quota')) {
                console.warn(`[Gemini] Rate limited. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }
    throw new Error(`Operation failed after ${maxRetries} retries due to rate limiting.`);
}

async function generatePayload(userIntent, apiDocs) {
    try {
        // Use standard Flash model (Higher quotas)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Act as an API integration expert.
            
            User Intent: "${userIntent}"
            API Documentation: ${apiDocs}
            
            Task: Convert the User Intent into a VALID JSON Payload for the API.
            
            Output Format (JSON Only):
            {
                "reasoning": "Explain WHY you chose this endpoint and payload in 1 sentence. Start with 'I detected...'",
                "endpoint": "/path/to/resource",
                "method": "POST",
                "body": { ...payload fields... }
            }
        `;

        return await retryOperation(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        });

    } catch (error) {
        console.error("Gemini Payload Error:", error);
        throw error;
    }
}

async function summarizeResponse(userIntent, apiResponse) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Act as a helpful AI assistant.
            
            User Original Intent: "${userIntent}"
            Target System Response (JSON): ${JSON.stringify(apiResponse)}
            
            Task: Write a friendly, natural language summary of the result for the user. 
            - Confirm if the action was successful.
            - Mention key details (like time, IDs, etc.) if resolved.
            - If it failed, explain why kindly.
            - Keep it short (1-2 sentences).
        `;

        return await retryOperation(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

    } catch (error) {
        console.error("Gemini Summary Error:", error);
        return "Action completed (Summary unavailable).";
    }
}

async function decomposeIntent(userIntent, availableAgents) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Act as a Strategic Orchestrator.
            
            User Intent: "${userIntent}"
            
            Available Agents:
            ${JSON.stringify(availableAgents, null, 2)}
            
            Task: 
            1. Analyze the intent. Is it a single action or multiple actions?
            2. Break it down into clear sub-tasks.
            3. For EACH sub-task, select the best agent.
            
            Output Format (JSON Array):
            [
                {
                    "agentName": "Name of agent",
                    "subIntent": "Specific instruction for this agent",
                    "reasoning": "Why this agent for this part"
                },
                ...
            ]
            
            Example: "I want a haircut and a book"
            Result:
            [
                { "agentName": "SalonBot", "subIntent": "Book haircut", "reasoning": "..." },
                { "agentName": "LibraryBot", "subIntent": "Borrow book", "reasoning": "..." }
            ]
            
            If NO agent matches a part, return an empty list or omit that part.
        `;

        return await retryOperation(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        });

    } catch (error) {
        console.error("Gemini Decomposition Error:", error);
        return [];
    }
}

module.exports = { generatePayload, summarizeResponse, decomposeIntent };
