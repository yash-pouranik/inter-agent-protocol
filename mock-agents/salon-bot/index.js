const express = require('express');
const app = express();
const PORT = 3001;

app.use(express.json());

// Documentation Endpoint
app.get('/docs', (req, res) => {
    res.send(`
        API Documentation for SalonBot:
        -------------------------------
        Goal: Book salon appointments.
        
        Endpoint: POST /bookings/create
        Description: Creates a new appointment.
        Required JSON Body:
        - "service_code": String (e.g., "HCUT" for Haircut, "MANI" for Manicure)
        - "slot_time_24h": String (Format "HH:MM", e.g., "17:00")
        
        Example Payload:
        { "service_code": "HCUT", "slot_time_24h": "14:30" }
    `);
});

// Booking Endpoint
app.post('/bookings/create', (req, res) => {
    const { service_code, slot_time_24h } = req.body;

    if (!service_code || !slot_time_24h) {
        return res.status(400).json({ 
            error: "Missing required fields: service_code, slot_time_24h" 
        });
    }

    if (service_code !== "HCUT" && service_code !== "MANI") {
        return res.status(400).json({ error: "Invalid service_code. Available: HCUT, MANI" });
    }

    // Simulate booking success
    console.log(`[SalonBot] Booking confirmed: ${service_code} at ${slot_time_24h}`);
    res.json({
        status: "CONFIRMED",
        booking_id: "SB-" + Math.floor(Math.random() * 10000),
        message: `Your ${service_code} is booked for ${slot_time_24h}`
    });
});

app.listen(PORT, () => {
    console.log(`SalonBot listening on port ${PORT}`);
});
