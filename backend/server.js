/**
 * server.js
 * 
 * 1) Serves static files from /frontend
 * 2) Connects to PumpPortal WebSocket API
 * 3) Holds events in a global queue
 * 4) Broadcasts them to all clients at regular intervals so 
 *    that every user sees the same sequence in real-time.
 */

const WebSocket = require("ws");
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = 3000;

// PumpPortal WebSocket
const API_URL = "wss://pumpportal.fun/api/data";
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/"
];

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Start server
const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running at http://localhost:${PORT}`);
});

// WebSocket for our frontend clients
const wss = new WebSocket.Server({ server });

// A global queue of “new token” events
const eventQueue = [];

// Broadcast frequency: one new event from the queue every 1 second
const BROADCAST_INTERVAL_MS = 1000;

function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Periodically pop from our local queue => broadcast to all clients
setInterval(() => {
  if (eventQueue.length > 0) {
    const nextEvent = eventQueue.shift();
    broadcastToClients(nextEvent);
  }
}, BROADCAST_INTERVAL_MS);

// Connect to PumpPortal WebSocket
let pumpPortalSocket;
function connectWebSocket() {
  pumpPortalSocket = new WebSocket(API_URL);

  pumpPortalSocket.on("open", () => {
    console.log("[INFO] Connected to PumpPortal API");
    pumpPortalSocket.send(JSON.stringify({ method: "subscribeNewToken" }));
  });

  pumpPortalSocket.on("message", async (message) => {
    try {
      const parsedMessage = JSON.parse(message.toString());
      if (parsedMessage.txType === "create") {
        console.log("[INFO] New Token Event:", JSON.stringify(parsedMessage, null, 2));
        const enrichedData = await enrichTokenData(parsedMessage);
        // Add to our queue
        eventQueue.push(enrichedData);
      }
    } catch (error) {
      console.error("[ERROR] Failed to process message:", error);
    }
  });

  pumpPortalSocket.on("close", (code, reason) => {
    console.warn(`[WARNING] WebSocket closed. Code: ${code}, Reason: ${reason}`);
    console.log("[INFO] Reconnecting in 5 seconds...");
    setTimeout(connectWebSocket, 5000);
  });

  pumpPortalSocket.on("error", (error) => {
    console.error("[ERROR] WebSocket error:", error);
  });
}
connectWebSocket();

/**
 * Enrich the token data with metadata from its URI.
 */
async function enrichTokenData(tokenData) {
  if (!tokenData.uri) {
    console.warn("[WARNING] Token has no URI. Skipping enrichment.");
    return tokenData;
  }

  let metadata;
  for (const gateway of IPFS_GATEWAYS) {
    const adjustedUri = tokenData.uri.replace("https://ipfs.io/ipfs/", gateway);
    try {
      console.log(`[INFO] Fetching metadata from: ${adjustedUri}`);
      const response = await axios.get(adjustedUri);
      metadata = response.data;
      break; // Found metadata, stop
    } catch (error) {
      console.warn(`[WARNING] Failed to fetch metadata from ${gateway}: ${error.message}`);
    }
  }

  if (!metadata) {
    console.error("[ERROR] Could not fetch metadata from any gateway.");
    return tokenData; 
  }

  const { name, symbol, description, image, twitter, website } = metadata;
  const processedImage = processMetadataImage(image);

  return {
    ...tokenData,
    name: name || tokenData.metadata_name,
    symbol: symbol || tokenData.metadata_symbol,
    description: description || "",
    image: processedImage,
    twitter: twitter || null,
    website: website || null
  };
}

/**
 * Convert IPFS image link to a Pinata-based gateway link
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

// Frontend WebSocket connection
wss.on("connection", (socket) => {
  console.log("[INFO] Client connected");
  socket.on("close", () => console.log("[INFO] Client disconnected"));
});
