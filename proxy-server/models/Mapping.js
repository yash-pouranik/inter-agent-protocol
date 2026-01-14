const mongoose = require('mongoose');

const mappingSchema = new mongoose.Schema({
    targetUrl: {
        type: String,
        required: true
    },
    intentHash: {
        type: String,
        required: true
        // In a real app, this would be a hash of the intent category or similar.
        // For this demo, we might store the raw intent string or a simplified version.
        // We will index this compoundly with targetUrl for faster lookups.
    },
    generatedJsonStructure: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 // TTL: Expire after 1 hour to ensure freshness
    }
});

// Composite index to find cache by URL + Intent
mappingSchema.index({ targetUrl: 1, intentHash: 1 });

module.exports = mongoose.model('Mapping', mappingSchema);
