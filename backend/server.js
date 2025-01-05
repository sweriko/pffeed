const WebSocket = require("ws");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
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
app.use(express.static("../frontend"));

// Start server
const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running at http://localhost:${PORT}`);
});

// WebSocket for frontend clients
const wss = new WebSocket.Server({ server });

// Connect to PumpPortal WebSocket API
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
        broadcastToClients(enrichedData);
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

// Broadcast data to connected clients
function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Enrich token data with metadata from `uri`
async function enrichTokenData(tokenData) {
  if (!tokenData.uri) {
    console.warn("[WARNING] Token data has no URI. Skipping enrichment.");
    return tokenData;
  }

  let metadata;
  for (const gateway of IPFS_GATEWAYS) {
    const adjustedUri = tokenData.uri.replace("https://ipfs.io/ipfs/", gateway);
    try {
      console.log(`[INFO] Fetching metadata from: ${adjustedUri}`);
      const response = await axios.get(adjustedUri);
      metadata = response.data;
      break; // Stop trying other gateways if successful
    } catch (error) {
      console.warn(`[WARNING] Failed to fetch metadata from ${gateway}: ${error.message}`);
    }
  }

  if (!metadata) {
    console.error("[ERROR] Failed to fetch metadata after multiple attempts.");
    return tokenData; // Return original data if fetching fails
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

// Process metadata image for alternate gateways
function processMetadataImage(imageUrl) {
  if (!imageUrl) return "";
  const parts = imageUrl.split("/ipfs/");
  if (parts.length === 2) {
    const hash = parts[1];
    return `https://pump.mypinata.cloud/ipfs/${hash}?img-width=256&img-dpr=2&img-onerror=redirect`;
  }
  return imageUrl; // Return original URL if not an IPFS link
}

// WebSocket connection for clients
wss.on("connection", (socket) => {
  console.log("[INFO] Client connected");
  socket.on("close", () => console.log("[INFO] Client disconnected"));
});

// Start the WebSocket connection
connectWebSocket();
