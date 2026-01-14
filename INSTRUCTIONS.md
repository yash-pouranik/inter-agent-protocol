# Inter-Agent Protocol App - Setup and Run Instructions

This guide provides step-by-step instructions to run the Inter-Agent Protocol application, which consists of a Proxy Server, two Mock Agents (SalonBot & LibraryBot), and a Frontend.

## Prerequisites

1.  **Node.js**: Ensure Node.js is installed.
2.  **MongoDB**: Ensure MongoDB is installed and running locally on default port `27017` (or update `.env` accordingly).
3.  **Google Gemini API Key**: Required for the semantic processing in the Proxy Server.

## 1. Setup & Run Proxy Server

The Proxy Server acts as the middleware that interprets user intent and routes it to the correct agent.

1.  Navigate to the `proxy-server` directory:
    ```bash
    cd proxy-server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file (copy from `.env.example`):
    ```bash
    cp .env.example .env
    ```
4.  Edit `.env` and add your **GEMINI_API_KEY**:
    ```env
    GEMINI_API_KEY=your_actual_api_key_here
    MONGODB_URI=mongodb://localhost:27017/ai-agent-proxy
    ```
5.  Start the server:
    ```bash
    npm start
    ```
    *Runs on Port: 3000*

## 2. Setup & Run Mock Agents

These agents simulate external services that the proxy interacts with.

### SalonBot
1.  Open a new terminal.
2.  Navigate to `mock-agents/salon-bot`:
    ```bash
    cd mock-agents/salon-bot
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Start the bot:
    ```bash
    npm start
    ```
    *Runs on Port: 3001*

### LibraryBot
1.  Open a new terminal.
2.  Navigate to `mock-agents/library-bot`:
    ```bash
    cd mock-agents/library-bot
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Start the bot:
    ```bash
    npm start
    ```
    *Runs on Port: 3002*

## 3. Run Frontend

The frontend is a simple HTML interface to interact with the Proxy Server.

1.  Navigate to the `frontend` directory.
2.  Open `index.html` in your browser.
    *   You can simply double-click the file, or serve it using a simple server like `live-server` or Python's `http.server`.
    *   Example using Python:
        ```bash
        cd frontend
        python -m http.server 8080
        ```
        Then visit `http://localhost:8080`.

## 4. How to Test

Once all 3 subsystems (Proxy, SalonBot, LibraryBot) are running and the Frontend is open:

1.  **Check Connections**: Ensure no errors in the terminal consoles for any of the servers.
2.  **Using the Frontend**:
    *   **Scenario 1: Salon Booking**
        *   The **Target Agent URL** should default to `http://localhost:3001`.
        *   Click the **SalonBot** preset button. It fills the intent: "I want to cut my hair at 5pm".
        *   Click **Execute Request**.
        *   **Expected Result**: The 'Result' area should show a JSON response confirming the booking (e.g., `status: "CONFIRMED"`).
    *   **Scenario 2: Library Loan**
        *   Click the **LibraryBot** preset button.
        *   It changes Target Agent URL to `http://localhost:3002` and intent to "Borrow ISBN...".
        *   Click **Execute Request**.
        *   **Expected Result**: A JSON response with `success: true` and a `due_date`.

## Troubleshooting

-   **Proxy Error**: If the proxy fails, check if the `GEMINI_API_KEY` is valid in `proxy-server/.env`.
-   **Connection Refused**: Ensure MongoDB is running.
-   **CORS Issues**: The proxy is configured with `cors`, so calling from `file://` or `localhost` should work.
