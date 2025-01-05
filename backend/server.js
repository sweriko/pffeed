/**
 * server.js
 *
 * 1) Subscribes to PumpPortal (or your data source).
 * 2) Queues "create" token events, enriches them with IPFS metadata.
 * 3) Every BROADCAST_INTERVAL_MS, pops an event -> broadcasts to clients.
 * 4) Logs how many KB + how many messages were sent per minute.
 * 5) Also logs the exact JSON being sent to the frontend/user each time.
 */

const WebSocket = require("ws");
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = 3000;

// Example PumpPortal WebSocket endpoint
const API_URL = "wss://pumpportal.fun/api/data";
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/"
];

// Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running at http://localhost:${PORT}`);
});

// WebSocket server for your frontend
const wss = new WebSocket.Server({ server });

// Global queue for new "create" events
const eventQueue = [];

// Broadcast interval: e.g. 2 seconds
const BROADCAST_INTERVAL_MS = 2000;

// ====== 1) Byte counters for logging ======
let bytesSentThisMinute = 0;
let messagesThisMinute = 0;

// ====== 2) Log how many KB + messages every minute ======
setInterval(() => {
  const kbSent = bytesSentThisMinute / 1024;
  console.log(
    `[BANDWIDTH] Sent ${kbSent.toFixed(2)} KB / ${messagesThisMinute} messages in the last minute.`
  );
  // Reset counters
  bytesSentThisMinute = 0;
  messagesThisMinute = 0;
}, 60_000);

/**
 * Broadcast data to all connected clients
 * and measure how many bytes we send.
 * Now also logs the JSON being sent.
 */
function broadcastToClients(data) {
  // Convert data -> JSON
  const messageString = JSON.stringify(data);

  // ====== NEW: Log the JSON message ======
  console.log("[BROADCAST] Sending to clients:", messageString);

  // Calculate byte size of the JSON
  const messageBytes = Buffer.byteLength(messageString, "utf8");

  // Send to each connected client
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
      // Track bandwidth usage
      bytesSentThisMinute += messageBytes;
      messagesThisMinute++;
    }
  });
}

// ====== 3) Schedule broadcasting from the queue ======
setInterval(() => {
  if (eventQueue.length > 0) {
    const nextEvent = eventQueue.shift();
    broadcastToClients(nextEvent);
  }
}, BROADCAST_INTERVAL_MS);

// ====== 4) Connect to PumpPortal WebSocket ======
let pumpPortalSocket;

function connectWebSocket() {
  pumpPortalSocket = new WebSocket(API_URL);

  pumpPortalSocket.on("open", () => {
    console.log("[INFO] Connected to PumpPortal API");
    pumpPortalSocket.send(JSON.stringify({ method: "subscribeNewToken" }));
  });

  pumpPortalSocket.on("message", async (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.txType === "create") {
        console.log("[INFO] New Token Event:", JSON.stringify(parsed, null, 2));
        const enrichedData = await enrichTokenData(parsed);
        eventQueue.push(enrichedData);
      }
    } catch (err) {
      console.error("[ERROR] Failed to process message:", err);
    }
  });

  pumpPortalSocket.on("close", (code, reason) => {
    console.warn(`[WARNING] PumpPortal closed (code=${code}), reason=${reason}`);
    console.log("[INFO] Reconnecting in 5 seconds...");
    setTimeout(connectWebSocket, 5000);
  });

  pumpPortalSocket.on("error", (err) => {
    console.error("[ERROR] PumpPortal WebSocket error:", err);
  });
}
connectWebSocket();

/**
 * Enrich token data with IPFS metadata
 */
async function enrichTokenData(tokenData) {
  if (!tokenData.uri) {
    console.warn("[WARNING] Token data has no URI. Skipping enrichment.");
    return tokenData;
  }

  let metadata;
  for (const gateway of IPFS_GATEWAYS) {
    const adjustedUri = tokenData.uri.replace("https://ipfs.io/ipfs/", gateway);
    try {
      console.log(`[INFO] Fetching metadata: ${adjustedUri}`);
      const response = await axios.get(adjustedUri);
      metadata = response.data;
      break;
    } catch (err) {
      console.warn(`[WARNING] Failed to fetch from ${gateway}: ${err.message}`);
    }
  }

  if (!metadata) {
    console.error("[ERROR] Could not fetch metadata after multiple attempts.");
    return tokenData;
  }

  const { name, symbol, description, image } = metadata;
  const processedImage = processMetadataImage(image);

  return {
    ...tokenData,
    name: name || tokenData.metadata_name,
    symbol: symbol || tokenData.metadata_symbol,
    description: description || "",
    image: processedImage
  };
}

/**
 * Convert IPFS link to pump.mypinata.cloud
 */
function processMetadataImage(imageUrl) {
  if (!imageUrl) return "";
  const parts = imageUrl.split("/ipfs/");
  if (parts.length === 2) {
    const hash = parts[1];
    return `https://pump.mypinata.cloud/ipfs/${hash}?img-width=256&img-dpr=2&img-onerror=redirect`;
  }
  return imageUrl;
}

// ====== 5) When a client connects ======
wss.on("connection", (socket) => {
  console.log("[INFO] Client connected");
  socket.on("close", () => console.log("[INFO] Client disconnected"));
});
