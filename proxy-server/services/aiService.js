const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Model Constants
// using llama-3.3-70b-versatile for high intelligence tasks
// using llama-3.1-8b-instant for fast tasks
const SMART_MODEL = "llama-3.3-70b-versatile";
const FAST_MODEL = "llama-3.1-8b-instant";

async function generatePayload(userIntent, apiDocs) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Act as an API integration expert.
                    
                    API Documentation: ${apiDocs}
                    
                    Task: Convert the User Intent into a VALID JSON Payload for the API.
                    
                    Output Format (JSON Only):
                    {
                        "reasoning": "Explain WHY you chose this endpoint and payload in 1 sentence.",
                        "endpoint": "/path/to/resource",
                        "method": "POST",
                        "body": { ...payload fields... }
                    }`
                },
                {
                    role: "user",
                    content: `User Intent: "${userIntent}"`
                }
            ],
            model: SMART_MODEL,
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error("Groq Payload Error:", error);
        throw error;
    }
}

async function summarizeResponse(userIntent, apiResponse) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Act as a helpful AI assistant.
                    Task: Write a friendly, natural language summary of the result.
                    Keep it short (1-2 sentences).`
                },
                {
                    role: "user",
                    content: `User Intent: "${userIntent}"
                    System Response: ${JSON.stringify(apiResponse)}`
                }
            ],
            model: FAST_MODEL,
            temperature: 0.5
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Groq Summary Error:", error);
        return "Action completed.";
    }
}

async function decomposeIntent(userIntent, availableAgents) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Act as a Strategic Orchestrator.
                    
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
                        }
                    ]
                    
                    Only return the JSON Array.` // Groq JSON mode handles the rest often, but explicitly asking helps
                },
                {
                    role: "user",
                    content: `User Intent: "${userIntent}"`
                }
            ],
            model: SMART_MODEL,
            temperature: 0.1,
            response_format: { type: "json_object" }
            /* Note: Groq JSON mode usually requires the object to be the root. 
               If it returns an object wrapper { "tasks": [...] }, we might need to adjust.
               But usually Prompting for Array matches best if we control the schema.
               Safest is to fallback to text parsing if JSON mode is strict about Object root.
               Let's try standard JSON mode first as { "tasks": [...] } structure if needed, 
               but here we try direct array. If Groq errors on Array root in JSON mode, 
               we will switch strictly to { tasks: [] }.
            */
        });

        // Safety: If Groq enforces object root for json_object mode
        // We'll trust it returns what we asked or a wrapped object.
        // Let's inspect the content.
        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);

        // If it wrapped it in a key like "tasks" or "result", extract it.
        if (parsed.tasks && Array.isArray(parsed.tasks)) return parsed.tasks;
        if (Array.isArray(parsed)) return parsed;

        // If it returns a single object that looks like a task, wrap it.
        if (parsed.agentName) return [parsed];

        return [];

    } catch (error) {
        console.error("Groq Decomposition Error:", error);
        return [];
    }
}

module.exports = { generatePayload, summarizeResponse, decomposeIntent };
