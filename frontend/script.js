/**
 * script.js
 * 
 * Shows coins from top to bottom, left-aligned, with new coins above older coins.
 * Smooth downward motion. No overlap. No vertical jitter.
 * 
 * The server paces the arrival of new tokens (1 every X seconds).
 * We simply animate them down in real time.
 */

const feedContainer = document.getElementById("feed-container");

// We'll track all active coins in an array.
const activeCoins = [];

// Speed in px per second for coin downward motion
const FLOW_SPEED = 70;

// Vertical gap so coins never overlap
const COIN_SPACING = 10;

// WebSocket: connect to backend
const websocket = new WebSocket("ws://localhost:3000");

// When server sends a new coin, create it at the top
websocket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    // We only handle new token events
    if (data.txType === "create" || data.method === "subscribeNewToken") {
      createCoinElement(data);
    }
  } catch (error) {
    console.error("Error parsing message from server:", error);
  }
};

/**
 * Create a new coin card (DOM element) and position it
 * ABOVE the container (e.g., negative y) so it enters from the top.
 */
function createCoinElement(data) {
  // Create the anchor (the card)
  const tokenCard = document.createElement("a");
  tokenCard.classList.add("coin-card");
  tokenCard.href = data.mint ? `https://pump.fun/coin/${data.mint}` : "#";
  tokenCard.target = "_blank";

  // Check if image has IPFS in it, rewrite to pinata
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

  // Add to feed container so we can measure it
  feedContainer.appendChild(tokenCard);

  // Place it off the top (negative top so it enters from above)
  // We'll find the topmost coin and place this new one above it
  let newCoinY = -tokenCard.offsetHeight;

  // We want the newest coin to appear above the existing top coin.
  // activeCoins[0] is the "most recently added" in our approach 
  // if we unshift it into the array. So let’s do that:
  const coinObject = {
    element: tokenCard,
    y: newCoinY
  };

  // Absolutely position so we can move it with top
  tokenCard.style.position = "absolute";
  tokenCard.style.left = "0px"; // left align
  tokenCard.style.top = `${coinObject.y}px`;

  // Insert at the front of the array
  activeCoins.unshift(coinObject);
}

/**
 * Animate loop: 
 *   1) move coins downward
 *   2) enforce spacing so coins don't overlap
 *   3) remove coins that exit the bottom
 */
let lastTimestamp = 0;
function animateCoins(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  const distanceToMove = (FLOW_SPEED * deltaMs) / 1000;

  // Because we put newest coin at index 0, the coin with index 1 is "older" (below).
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    // Move it downward
    coin.y += distanceToMove;

    // Ensure it doesn't overlap the coin below it (i+1 in the array)
    if (i < activeCoins.length - 1) {
      const belowCoin = activeCoins[i + 1];
      const requiredY = belowCoin.y - coin.element.offsetHeight - COIN_SPACING;
      // If we’re about to collide, push the current coin up
      if (coin.y > requiredY) {
        coin.y = requiredY;
      }
    }

    // Update DOM
    coin.element.style.top = `${coin.y}px`;
  }

  // Remove coins that are completely out of the container
  const containerHeight = feedContainer.offsetHeight;
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    if (coin.y > containerHeight) {
      // Remove from DOM
      coin.element.remove();
      // Remove from array
      activeCoins.splice(i, 1);
    }
  }

  requestAnimationFrame(animateCoins);
}

// Kick off the animation
requestAnimationFrame(animateCoins);
