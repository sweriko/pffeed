const feedContainer = document.getElementById("feed-container");

// WebSocket connection to the backend server
const websocket = new WebSocket("ws://localhost:3000");

websocket.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data);

    // Handle token creation events
    if (data.method === "subscribeNewToken" || data.txType === "create") {
      addTokenToFeed(data);
    }
  } catch (error) {
    console.error("Error parsing message from server:", error);
  }
};

function addTokenToFeed(data) {
  const tokenCard = document.createElement("div");
  tokenCard.classList.add("coin-card");

  const imageUrl = data.image || "https://via.placeholder.com/88";
  const name = data.name || "Unknown";
  const symbol = data.symbol || "Unknown";
  const description = data.description || "No description provided.";
  const twitter = data.twitter ? `<a href="${data.twitter}" target="_blank">Twitter</a>` : "";
  const website = data.website ? `<a href="${data.website}" target="_blank">Website</a>` : "";

  tokenCard.innerHTML = `
    <div class="image-container">
      <img src="${imageUrl}" alt="${name}" class="coin-image" />
    </div>
    <div class="metadata">
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Symbol:</strong> ${symbol}</p>
      <p><strong>Description:</strong> ${description}</p>
      <p>${twitter} ${website}</p>
    </div>
  `;

  feedContainer.prepend(tokenCard); // Add new tokens to the top of the feed

  // Limit the feed to the most recent 20 entries
  if (feedContainer.children.length > 20) {
    feedContainer.removeChild(feedContainer.lastChild);
  }
}
