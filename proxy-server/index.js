const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const Mapping = require('./models/Mapping');
const { generatePayload, summarizeResponse } = require('./services/geminiService');

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

        const intentHash = hashIntent(userIntent);
        const cachedMapping = await Mapping.findOne({ targetUrl, intentHash });

        let payload, endpointPath, method, reasoning;
        let source = "CACHE";

        if (cachedMapping) {
            console.log("[Proxy] Cache HIT.");
            const cachedData = cachedMapping.generatedJsonStructure;
            payload = cachedData.body;
            endpointPath = cachedData.endpoint;
            method = cachedData.method;
            reasoning = cachedData.reasoning || "Cached from previous execution.";
        } else {
            console.log("[Proxy] Cache MISS. Introspecting...");
            source = "GEMINI";

            let docContent = "";
            try {
                const docRes = await axios.get(`${targetUrl}/docs`);
                docContent = typeof docRes.data === 'string' ? docRes.data : JSON.stringify(docRes.data);
            } catch (e) {
                try {
                    const capRes = await axios.get(`${targetUrl}/capabilities`);
                    docContent = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data);
                } catch (e2) {
                    throw new Error("Could not fetch documentation from target agent.");
                }
            }

            const geminiResult = await generatePayload(userIntent, docContent);

            payload = geminiResult.body;
            endpointPath = geminiResult.endpoint;
            method = geminiResult.method || 'POST';
            reasoning = geminiResult.reasoning;

            // Cache the FULL structure including reasoning
            await Mapping.create({
                targetUrl,
                intentHash,
                generatedJsonStructure: geminiResult
            });
        }

        // Execute Request
        const executionUrl = targetUrl.replace(/\/$/, '') + endpointPath;
        console.log(`[Proxy] Executing ${method} to ${executionUrl}`);

        try {
            const agentRes = await axios({
                method: method,
                url: executionUrl,
                data: payload
            });

            // Summarize the result (Natural Language)
            const summary = await summarizeResponse(userIntent, agentRes.data);

            res.json({
                source,
                reasoning,
                summary,
                target_response: agentRes.data
            });

        } catch (execErr) {
            res.status(502).json({
                error: "Target Agent Execution Failed",
                reasoning,
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
