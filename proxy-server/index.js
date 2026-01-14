const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const Mapping = require('./models/Mapping');
const { generatePayload } = require('./services/geminiService');

dotenv.config();

const app = express();
const PORT = 3000;
const cors = require('cors');

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent-proxy', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Helper: Hash Intent
function hashIntent(intent) {
    // In a real system, we'd use semantic similarity. 
    // For this mock, we'll simple hash the string to avoid huge keys.
    // Or simpler: just use the string if it's short. Let's use MD5.
    return crypto.createHash('md5').update(intent.toLowerCase().trim()).digest('hex');
}

// POST /proxy/execute
app.post('/proxy/execute', async (req, res) => {
    const { targetUrl, userIntent } = req.body;

    if (!targetUrl || !userIntent) {
        return res.status(400).json({ error: "Missing targetUrl or userIntent" });
    }

    try {
        console.log(`\n[Proxy] Received Request: "${userIntent}" for ${targetUrl}`);

        // Step A: Check Cache
        const intentHash = hashIntent(userIntent);
        const cachedMapping = await Mapping.findOne({ targetUrl, intentHash });

        let payload;
        let source = "CACHE";

        if (cachedMapping) {
            console.log("[Proxy] Cache HIT. Using stored payload structure.");
            // Note: In a real dynamic system, we might need to re-inject dynamic values (like dates) 
            // even if we cached the *structure*. But for this simplified demo, 
            // if the exact intent repeats ("Book haircut at 5pm"), the payload is identical.
            // If the intent changes ("Book haircut at 6pm"), the hash changes, so it's a miss.
            payload = cachedMapping.generatedJsonStructure;
        } else {
            console.log("[Proxy] Cache MISS. Introspecting target...");
            source = "GEMINI";

            // Step B: Introspection
            // We assume the documentation endpoint is at the root /docs or /capabilities
            // In a real world, we might need to discover this.
            // We'll try fetching /docs and /capabilities.
            let docContent = "";
            let apiEndpoint = ""; // We need to determine the actual endpoint from docs or assume logic? 
            // The prompt implies we know the Target Agent URL. 
            // Actually, usually "Target URL" in the request might be the base URL.
            // Let's assume targetUrl provided by client is the BASE URL of the agent (e.g. http://localhost:3001).

            // Try fetching docs
            try {
                const docRes = await axios.get(`${targetUrl}/docs`);
                docContent = typeof docRes.data === 'string' ? docRes.data : JSON.stringify(docRes.data);
            } catch (e1) {
                try {
                    const capRes = await axios.get(`${targetUrl}/capabilities`);
                    docContent = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data);
                } catch (e2) {
                    throw new Error("Could not fetch documentation from target agent.");
                }
            }

            console.log("[Proxy] Docs fetched. Calling Gemini...");

            // Step C: Semantic Translation
            // We need Gemini to give us the specific ENDPOINT URL to call (relative path) + the Body.
            // Wait, the instructions say "generate only the valid JSON payload". 
            // It assumes we know the endpoint? 
            // The instructions say: "Step D: ...call the Target Agent's actual endpoint".

            // Refinement: I should ask Gemini for BOTH the Endpoint path and the Body.
            // Or I can simplify and ask the user to provide the full "execute" url? 
            // No, introspection should find it.
            // FOR SIMPLICITY: The user request sends "targetUrl". 
            // If targetUrl is "http://localhost:3001", we don't know if it's /bookings/create.
            // The DOCS contain the path.
            // I will update the Gemini Prompt to return a structure: { path: "...", method: "...", body: {...} }
            // But the instructions specifically said: "generate only the valid JSON payload required".
            // However, the instructions for TARGET A say "Endpoint: POST /bookings/create".
            // If I only generate the body, I don't know where to post it.
            // I will err on the side of "Senior Architect" and solve this gap.
            // The "Target Agent" might be a complex entity.
            // I'll update the prompt to ask for: { "endpoint": "/...", "method": "POST", "body": { ... } }
            // But let's look at Step D: "Use axios/fetch to call the Target Agent's actual endpoint using the structured JSON".
            // It implies we know the endpoint.
            // Let's assume the Gemini Step returns the *full* config.

            // Updating geminiService.js prompt logic inline here or in the file?
            // I already wrote geminiService.js to return just JSON. 
            // I'll update geminiService.js in a moment to be robust, OR I'll handle it here.
            // Actually, Step C instructions: "generate only the valid JSON payload".
            // Maybe the "targetUrl" in the request IS the endpoint? 
            // Request payload: { "targetUrl": "...", "userIntent": "..." }
            // If I pass "http://localhost:3001", I can't POST to it directly if the endpoint is /bookings/create.
            // I will Update `geminiService` to return { endpoint, method, body }.

            // RE-WRITING LOGIC FOR THIS BLOCK:
            // I'll update the geminiService to just return the body for now to satisfy strict "generate only JSON payload" text,
            // BUT, if I do that, the system fails.
            // I will update the prompt in `geminiService` to return `payload` AND `endpoint`.

            // For now, let's assume I'll mod the file.
            // Let's finish the flow here assuming `payload` contains everything or just body.
            // The safest bet is: The Gemini prompt returns the body, and we assume we have to find the endpoint too.
            // Let's use `multi_replace_file_content` on `geminiService.js` after this file is written.

            // Placeholder for now: assuming `payload` is the body, but where do we send it?
            // I will modify `geminiService.js` to return: { "url_path": "/...", "method": "POST", "payload": { ... } }

            const geminiResult = await generatePayload(userIntent, docContent);
            // geminiResult should be { endpoint: "/...", method: "...", body: {...} }

            payload = geminiResult.body;
            const endpointPath = geminiResult.endpoint;
            const method = geminiResult.method || 'POST';

            // We need to store the FULL config in cache, not just body.
            // Updating `Mapping` schema might be needed or we just store the whole object in `generatedJsonStructure`

            // Step E: Caching
            await Mapping.create({
                targetUrl,
                intentHash,
                generatedJsonStructure: { endpoint: endpointPath, method, body: payload }
            });

            // Execute
            const executionUrl = targetUrl.replace(/\/$/, '') + endpointPath;
            console.log(`[Proxy] Executing ${method} to ${executionUrl}`);

            try {
                const agentRes = await axios({
                    method: method,
                    url: executionUrl,
                    data: payload
                });

                res.json({
                    source: source,
                    target_response: agentRes.data
                });
            } catch (execErr) {
                res.status(502).json({
                    error: "Target Agent Execution Failed",
                    details: execErr.message,
                    input_used: payload
                });
            }
            return; // End of non-cached flow
        }

        // Cached Flow
        const cachedData = cachedMapping.generatedJsonStructure; // { endpoint, method, body }

        // Note on Dynamic Data (Dates):
        // If the user says "tomorrow", cache stores static date calculated at T0.
        // At T+1 (next day), cache is stale logically but valid in DB.
        // A real "Semantic Proxy" would cache the *Concept* (e.g. "params: { date: '{{tomorrow}}' }") and re-evaluate.
        // But for this simplified scope, we assume strict caching of the JSON.
        // We will proceed with using the cached static JSON.

        const executionUrl = targetUrl.replace(/\/$/, '') + cachedData.endpoint;
        console.log(`[Proxy] Executing Cached Request to ${executionUrl}`);

        try {
            const agentRes = await axios({
                method: cachedData.method,
                url: executionUrl,
                data: cachedData.body
            });

            res.json({
                source: source,
                target_response: agentRes.data
            });
        } catch (execErr) {
            res.status(502).json({
                error: "Target Agent Execution Failed (Cached)",
                details: execErr.message
            });
        }

    } catch (error) {
        console.error("Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy Server running on port ${PORT}`);
});
