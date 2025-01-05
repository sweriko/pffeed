/**
 * server.js
 * 
 * Broadcasts a new token from the queue every 0.5 seconds (faster feed).
 */

const WebSocket = require("ws");
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = 3000;

const API_URL = "wss://pumpportal.fun/api/data";
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/"
];

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running at http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Global queue of token events
const eventQueue = [];

// Broadcast interval: 1 event every 0.5s
const BROADCAST_INTERVAL_MS = 500;

function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

setInterval(() => {
  if (eventQueue.length > 0) {
    const nextEvent = eventQueue.shift();
    broadcastToClients(nextEvent);
  }
}, BROADCAST_INTERVAL_MS);

// Connect to PumpPortal
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
        const enriched = await enrichTokenData(parsed);
        eventQueue.push(enriched);
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

// Enrich token data with metadata from IPFS
async function enrichTokenData(tokenData) {
  if (!tokenData.uri) {
    console.warn("[WARNING] No URI in token data, skipping.");
    return tokenData;
  }

  let metadata;
  for (const gateway of IPFS_GATEWAYS) {
    const adjustedUri = tokenData.uri.replace("https://ipfs.io/ipfs/", gateway);
    try {
      console.log(`[INFO] Fetching metadata from: ${adjustedUri}`);
      const response = await axios.get(adjustedUri);
      metadata = response.data;
      break;
    } catch (error) {
      console.warn(`[WARNING] Failed to fetch metadata from ${gateway}: ${error.message}`);
    }
  }

  if (!metadata) {
    console.error("[ERROR] Could not fetch metadata after multiple attempts.");
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

// Convert IPFS link to pinata gateway
function processMetadataImage(imageUrl) {
  if (!imageUrl) return "";
  const parts = imageUrl.split("/ipfs/");
  if (parts.length === 2) {
    const hash = parts[1];
    return `https://pump.mypinata.cloud/ipfs/${hash}?img-width=256&img-dpr=2&img-onerror=redirect`;
  }
  return imageUrl;
}

// Handle client connections
wss.on("connection", (socket) => {
  console.log("[INFO] Client connected");
  socket.on("close", () => console.log("[INFO] Client disconnected"));
});
