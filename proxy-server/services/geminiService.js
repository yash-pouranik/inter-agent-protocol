const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini (User must provide API key in .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generatePayload(userIntent, apiDocs) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

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
                "endpoint": "/path/to/resource",
                "method": "POST",
                "body": { ...payload fields... }
            }

            Rules:
            1. Output MUST be valid JSON only.
            2. Do NOT include markdown code blocks (like \`\`\`json).
            3. Do NOT include any explanation or extra text.
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

module.exports = { generatePayload };
