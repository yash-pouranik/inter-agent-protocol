const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini (User must provide API key in .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generatePayload(userIntent, apiDocs) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Act as an API integration expert.
            
            Based on the User Intent and the provided Target API Documentation, generate a valid JSON object describing the API call to be made.
            
            User Intent: "${userIntent}"
            
            Target API Documentation:
            """
            ${apiDocs}
            """
            
            Output Format (JSON Only):
            {
                "reasoning": "Explain WHY you chose this endpoint and payload in 1 sentence. Start with 'I detected...'",
                "endpoint": "/path/to/resource",
                "method": "POST",
                "body": { ...payload fields... }
            }

            Rules:
            1. Output MUST be valid JSON only.
            2. Do NOT include markdown code blocks (like \`\`\`json).
            3. Do NOT include any explanation or extra text outside the JSON.
            4. If the user intent is missing information required by the API, use reasonable defaults or best guesses based on the intent (e.g. if "tomorrow", calculate the date).
            5. Ensure data types match the documentation (e.g. integers for numbers).
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up potential markdown formatting if Gemini adds it despite instructions
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("Gemini Generation Error:", error);
        throw new Error("Failed to generate payload via Gemini.");
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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini Summary Error:", error);
        return "I completed the request, but couldn't summarize the result. Please check the raw data.";
    }
}

module.exports = { generatePayload, summarizeResponse };
