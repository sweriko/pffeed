/**
 * script.js
 * 
 * Now the coins move at 120px/sec (FASTER).
 * Same logic as before, but with a bigger FLOW_SPEED.
 */

const feedContainer = document.getElementById("feed-container");
const activeCoins = [];

// Increase speed to 120 px/sec
const FLOW_SPEED = 120;

// Spacing so coins do not overlap
const COIN_SPACING = 10;

// WebSocket -> backend
const websocket = new WebSocket("ws://localhost:3000");

websocket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.txType === "create" || data.method === "subscribeNewToken") {
      createCoinElement(data);
    }
  } catch (error) {
    console.error("Error parsing message from server:", error);
  }
};

function createCoinElement(data) {
  const tokenCard = document.createElement("a");
  tokenCard.classList.add("coin-card");
  tokenCard.href = data.mint ? `https://pump.fun/coin/${data.mint}` : "#";
  tokenCard.target = "_blank";

  let imageUrl = data.image || "https://via.placeholder.com/88";
  if (imageUrl.includes("/ipfs/")) {
    const ipfsHash = imageUrl.split("/ipfs/")[1];
    imageUrl = `https://pump.mypinata.cloud/ipfs/${ipfsHash}`;
  }

  const name = data.name || "Unknown";
  const symbol = data.symbol || "Unknown";
  let description = data.description || "No description provided.";
  if (description.length > 20) {
    description = description.substring(0, 20) + "...";
  }

  tokenCard.innerHTML = `
    <img src="${imageUrl}" alt="${name}" class="coin-image" />
    <div class="metadata">
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Symbol:</strong> ${symbol}</p>
      <p><strong>Description:</strong> ${description}</p>
    </div>
  `;

  feedContainer.appendChild(tokenCard);

  // Start it above the container
  const coinObject = {
    element: tokenCard,
    y: -tokenCard.offsetHeight
  };

  // Add the newest coin at the front
  activeCoins.unshift(coinObject);
}

/**
 * Animate the coins:
 *   - Move them down at FLOW_SPEED px/s
 *   - Prevent overlap
 *   - Remove once they exit the bottom
 */
let lastTimestamp = 0;
function animateCoins(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  const distanceToMove = (FLOW_SPEED * deltaMs) / 1000;

  // Move from bottom to top
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    coin.y += distanceToMove;

    // Overlap logic with the coin below
    if (i < activeCoins.length - 1) {
      const belowCoin = activeCoins[i + 1];
      const requiredY = belowCoin.y - coin.element.offsetHeight - COIN_SPACING;
      if (coin.y > requiredY) {
        coin.y = requiredY;
      }
    }

    // Translate down using GPU-friendly transform
    coin.element.style.transform = `translate3d(0, ${coin.y}px, 0)`;
  }

  // Remove coins below the container
  const containerHeight = feedContainer.offsetHeight;
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    if (coin.y > containerHeight) {
      coin.element.remove();
      activeCoins.splice(i, 1);
    }
  }

  requestAnimationFrame(animateCoins);
}

requestAnimationFrame(animateCoins);
