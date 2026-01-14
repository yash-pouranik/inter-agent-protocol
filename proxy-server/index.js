const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const Mapping = require('./models/Mapping');
const Registry = require('./models/Registry');
const { generatePayload, summarizeResponse, decomposeIntent } = require('./services/aiService');

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
    return crypto.createHash('md5').update(intent.toLowerCase().trim()).digest('hex');
}

// Helper: Stream Event
function sendEvent(res, type, data) {
    res.write(JSON.stringify({ type, ...data }) + '\n');
}

// POST /registry/register
app.post('/registry/register', async (req, res) => {
    const { name, url, description } = req.body;
    if (!name || !url || !description) return res.status(400).json({ error: "Missing fields" });

    try {
        await Registry.updateOne(
            { url },
            { name, url, description, lastSeen: new Date() },
            { upsert: true }
        );
        console.log(`[Registry] Registered: ${name} (${url})`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /proxy/execute (Streaming Version)
app.post('/proxy/execute', async (req, res) => {
    let { targetUrl, userIntent } = req.body;

    if (!userIntent) {
        return res.status(400).json({ error: "Missing userIntent" });
    }

    // Set Headers for Streaming
    res.setHeader('Content-Type', 'text/plain'); // OR application/x-ndjson
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        console.log(`\n[Proxy] Received Request: "${userIntent}"`);
        sendEvent(res, "status", { message: "Analyzing Request..." });

        // Mode 1: Direct URL
        if (targetUrl) {
            sendEvent(res, "status", { message: `Target provided: ${targetUrl}. Executing...` });
            const result = await executeSingleRequest(targetUrl, userIntent);
            sendEvent(res, "result", {
                agent: "Direct Target",
                action: "Single Execution",
                summary: result.summary,
                reasoning: result.reasoning,
                result: result.target_response
            });
            sendEvent(res, "done", {});
            return res.end();
        }

        // Mode 2: Auto-Discovery & Orchestration
        sendEvent(res, "status", { message: "Orchestrating Agents..." });

        const agents = await Registry.find({});
        const agentList = agents.map(a => ({ name: a.name, description: a.description, url: a.url }));

        // Decompose
        const tasks = await decomposeIntent(userIntent, agentList);

        if (!tasks || tasks.length === 0) {
            sendEvent(res, "error", { message: "No suitable agents found." });
            return res.end();
        }

        sendEvent(res, "plan", { tasks });

        // Execute Tasks
        for (const task of tasks) {
            const agent = agentList.find(a => a.name === task.agentName);
            if (!agent) {
                sendEvent(res, "error", { message: `Agent ${task.agentName} not found in registry.` });
                continue;
            }

            sendEvent(res, "status", { message: `Contacting ${task.agentName}...` });

            try {
                const stepResult = await executeSingleRequest(agent.url, task.subIntent);

                sendEvent(res, "result", {
                    agent: task.agentName,
                    action: task.subIntent,
                    reasoning: `[Task Logic]: ${task.reasoning}\n[Execution Logic]: ${stepResult.reasoning}`,
                    summary: stepResult.summary,
                    result: stepResult.target_response
                });

            } catch (err) {
                sendEvent(res, "error", { message: `Failed to execute ${task.agentName}: ${err.message}` });
            }
        }

        sendEvent(res, "done", {});
        res.end();

    } catch (error) {
        console.error("Proxy Error:", error);
        sendEvent(res, "error", { message: error.message });
        res.end();
    }
});

// Helper: Execute Single Request
async function executeSingleRequest(targetUrl, userIntent) {
    const intentHash = hashIntent(userIntent);
    const cachedMapping = await Mapping.findOne({ targetUrl, intentHash });

    let payload, endpointPath, method, reasoning;
    let source = "CACHE";

    if (cachedMapping) {
        console.log(`[Proxy -> ${targetUrl}] Cache HIT.`);
        const cachedData = cachedMapping.generatedJsonStructure;
        payload = cachedData.body;
        endpointPath = cachedData.endpoint;
        method = cachedData.method;
        reasoning = cachedData.reasoning || "Cached from previous execution.";
    } else {
        console.log(`[Proxy -> ${targetUrl}] Cache MISS. Introspecting...`);
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

        await Mapping.create({
            targetUrl,
            intentHash,
            generatedJsonStructure: geminiResult
        });
    }

    const executionUrl = targetUrl.replace(/\/$/, '') + endpointPath;
    console.log(`[Proxy -> ${targetUrl}] Executing ${method} to ${executionUrl}`);

    const agentRes = await axios({
        method: method,
        url: executionUrl,
        data: payload
    });

    const summary = await summarizeResponse(userIntent, agentRes.data);

    return {
        source,
        reasoning,
        summary,
        target_response: agentRes.data
    };
}

app.listen(PORT, () => {
    console.log(`Proxy Server running on port ${PORT}`);
});
