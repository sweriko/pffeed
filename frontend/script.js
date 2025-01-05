const feedContainer = document.getElementById("feed-container");

// Queue to store incoming coins
const coinQueue = [];

// Interval for adding coins to the feed (e.g., 1 coin every 1 second)
const DISPLAY_INTERVAL = 1000; // in milliseconds

// Function to add a coin to the UI
function displayCoin(data) {
  const tokenCard = document.createElement("a");
  tokenCard.classList.add("coin-card");
  tokenCard.href = `https://pump.fun/coin/${data.mint}`; // Construct Pumpfun URL using mint
  tokenCard.target = "_blank"; // Open link in a new tab

  // Transform image URL to use Pump.fun's Pinata gateway
  if (data.image && data.image.includes("/ipfs/")) {
    const ipfsHash = data.image.split("/ipfs/")[1];
    data.image = `https://pump.mypinata.cloud/ipfs/${ipfsHash}`;
  }

  const imageUrl = data.image || "https://via.placeholder.com/88";
  const name = data.name || "Unknown";
  const symbol = data.symbol || "Unknown";
  let description = data.description || "No description provided.";

  // Truncate description to 20 characters
  if (description.length > 20) {
    description = description.substring(0, 20) + "...";
  }

  tokenCard.innerHTML = `
    <div class="image-container">
      <img src="${imageUrl}" alt="${name}" class="coin-image" />
    </div>
    <div class="metadata">
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Symbol:</strong> ${symbol}</p>
      <p><strong>Description:</strong> ${description}</p>
    </div>
  `;

  feedContainer.prepend(tokenCard); // Add new tokens to the top of the feed

  // Limit the feed to the most recent 20 entries
  if (feedContainer.children.length > 20) {
    feedContainer.removeChild(feedContainer.lastChild);
  }
}

// Function to process the coin queue
function processQueue() {
  if (coinQueue.length > 0) {
    const nextCoin = coinQueue.shift(); // Remove the first coin from the queue
    displayCoin(nextCoin);
  }
}

// Start processing the queue at the specified interval
setInterval(processQueue, DISPLAY_INTERVAL);

// WebSocket to receive new coins
const websocket = new WebSocket("ws://localhost:3000"); // Connect to backend server

websocket.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data);

    // Add received coin to the queue
    if (data.method === "subscribeNewToken" || data.txType === "create") {
      coinQueue.push(data);
    }
  } catch (error) {
    console.error("Error parsing message from server:", error);
  }
};
