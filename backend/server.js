/**
 * server.js
 *
 * 1) Subscribes to PumpPortal (or your data source).
 * 2) Enriches each token with IPFS metadata.
 * 3) Keeps only necessary fields (name, symbol, image, description, mint).
 * 4) Truncates 'description' to 35 chars max, adding "..." if truncated.
 *    Also removes any line breaks/paragraph formatting -> single line.
 * 5) Broadcasts refined data to the frontend via WebSocket every 2s.
 * 6) Logs bandwidth usage (KB/min) and message count.
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

// Serve static files from ../frontend (which uses PixiJS)
app.use(express.static(path.join(__dirname, "../frontend")));

const server = app.listen(PORT, () => {
  console.log(`[INFO] Server running at http://localhost:${PORT}`);
});

// WebSocket for frontend clients
const wss = new WebSocket.Server({ server });

// Queue for new token events
const eventQueue = [];

// Broadcast interval (e.g., 2 seconds)
const BROADCAST_INTERVAL_MS = 700;

// ====== Bandwidth Logging ======
let bytesSentThisMinute = 0;
let messagesThisMinute = 0;

setInterval(() => {
  const kbSent = bytesSentThisMinute / 1024;
  console.log(
    `[BANDWIDTH] Sent ${kbSent.toFixed(2)} KB / ${messagesThisMinute} messages in the last minute.`
  );
  bytesSentThisMinute = 0;
  messagesThisMinute = 0;
}, 60_000);

/**
 * Broadcast minimal data to all clients,
 * ensuring the description is truncated to 35 chars
 * and line breaks are removed.
 */
function broadcastToClients(refinedData) {
  const messageString = JSON.stringify(refinedData);

  console.log("[BROADCAST] Sending refined data:", messageString);

  const messageBytes = Buffer.byteLength(messageString, "utf8");

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
      bytesSentThisMinute += messageBytes;
      messagesThisMinute++;
    }
  });
}

// Periodically send from the queue
setInterval(() => {
  if (eventQueue.length > 0) {
    const nextEvent = eventQueue.shift();
    broadcastToClients(nextEvent);
  }
}, BROADCAST_INTERVAL_MS);

// ===== PumpPortal Connection =====
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

        // 1) Enrich token with IPFS data
        const enriched = await enrichTokenData(parsed);

        // 2) Refine + truncate
        const singleLineDesc = (enriched.description || "")
          // Replace line breaks with spaces:
          .replace(/\r?\n|\r/g, " ")
          // Also remove extra tabs, etc.:
          .replace(/\s+/g, " ")
          .trim();

        let finalDesc = singleLineDesc;
        if (finalDesc.length > 35) {
          finalDesc = finalDesc.slice(0, 35) + "...";
        }

        const refined = {
          name: enriched.name || "Unknown",
          symbol: enriched.symbol || "Unknown",
          image: enriched.image || "",
          description: finalDesc,
          mint: enriched.mint
        };

        // 3) Queue for broadcasting
        eventQueue.push(refined);
      }
    } catch (err) {
      console.error("[ERROR] Parsing PumpPortal message:", err);
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
    console.warn("[WARNING] No URI in token data. Skipping enrichment.");
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
    console.error("[ERROR] Could not fetch metadata after attempts. Returning original data.");
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

// Log client connections
wss.on("connection", (socket) => {
  console.log("[INFO] Client connected");
  socket.on("close", () => console.log("[INFO] Client disconnected"));
});
