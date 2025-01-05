/**
 * pixi-script.js
 *
 * 1) Creates a PixiJS Application (WebGL) at 500x900.
 * 2) Receives tokens from your backend via WebSocket.
 * 3) For each token:
 *    - Builds a "coin container" with background, sprite, text fields.
 *    - Positions it above the stage (negative y).
 *    - Animates downward with no overlap.
 *    - On click/tap, opens link in a new tab.
 * 4) Uses `PIXI.Texture.fromURL(imageUrl)` with a fallback if the image fails.
 * 5) Uses eventMode instead of the old `interactive` property to avoid deprecation warnings.
 */

// 1. Create the Pixi Application
const app = new PIXI.Application({
  width: 500,
  height: 900,
  backgroundColor: 0x1a1a1a, // same as your old feed container
  antialias: true
});

// Append the Pixi canvas to the DOM
document.body.appendChild(app.view);

// 2. Global feed logic
const FLOW_SPEED = 120;   // px/sec downward speed
const COIN_SPACING = 10;  // spacing so coins don't overlap

// We'll store coins in an array (newest at index 0)
const activeCoins = [];

// 3. WebSocket to your Node server
const socket = new WebSocket("ws://localhost:3000");

socket.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.txType === "create" || data.method === "subscribeNewToken") {
      // Build a container for this new token
      const coinContainer = await createCoinContainer(data);
      // Position above the stage
      coinContainer.y = -coinContainer.height;
      // Add to stage & array
      app.stage.addChild(coinContainer);
      activeCoins.unshift(coinContainer);
    }
  } catch (error) {
    console.error("Error parsing or building coin:", error);
  }
};

/**
 * Creates a Pixi "coin container" with:
 *  - BG rectangle
 *  - Token image (sprite)
 *  - Text fields for name, symbol, desc
 *  - Click/tap => open link
 */
async function createCoinContainer(tokenData) {
  // Gracefully handle missing fields
  const name = tokenData.name || "Unknown";
  const symbol = tokenData.symbol || "Unknown";
  let description = tokenData.description || "No description";
  if (description.length > 20) {
    description = description.substring(0, 20) + "...";
  }

  // If there's a 'mint' property, build the link
  const linkUrl = tokenData.mint
    ? `https://pump.fun/coin/${tokenData.mint}`
    : null;

  // For images, use placeholder if none
  let imageUrl = tokenData.image || "https://via.placeholder.com/88";
  // If IPFS param is present
  if (imageUrl.includes("/ipfs/")) {
    const ipfsHash = imageUrl.split("/ipfs/")[1];
    imageUrl = `https://pump.mypinata.cloud/ipfs/${ipfsHash}`;
  }

  // Standard card size
  const cardWidth = 460;
  const cardHeight = 100;

  // Build the container
  const coinContainer = new PIXI.Container();
  coinContainer.width = cardWidth;
  coinContainer.height = cardHeight;

  // Draw background rectangle
  const bg = new PIXI.Graphics();
  bg.beginFill(0x292929); // dark gray
  bg.drawRoundedRect(0, 0, cardWidth, cardHeight, 8);
  bg.endFill();
  coinContainer.addChild(bg);

  // Load the image via Texture.fromURL()
  let texture;
  try {
    texture = await PIXI.Texture.fromURL(imageUrl);
  } catch (err) {
    console.warn(`Failed to load image: ${imageUrl}`, err);
    // Use placeholder if the IPFS link fails
    texture = PIXI.Texture.from("https://via.placeholder.com/100x100");
  }

  // Create the sprite
  const sprite = new PIXI.Sprite(texture);
  sprite.x = 10;
  sprite.y = 6;
  sprite.width = 88;
  sprite.height = 88;
  coinContainer.addChild(sprite);

  // Create text fields
  const style = new PIXI.TextStyle({
    fontFamily: "Arial",
    fontSize: 16,
    fill: 0xffffff
  });

  const nameText = new PIXI.Text(`Name: ${name}`, style);
  nameText.x = 108;
  nameText.y = 10;
  coinContainer.addChild(nameText);

  const symbolText = new PIXI.Text(`Symbol: ${symbol}`, style);
  symbolText.x = 108;
  symbolText.y = 30;
  coinContainer.addChild(symbolText);

  const descText = new PIXI.Text(`Desc: ${description}`, style);
  descText.x = 108;
  descText.y = 50;
  coinContainer.addChild(descText);

  // Make container clickable using new eventMode
  if (linkUrl) {
    coinContainer.eventMode = "static"; // or 'dynamic', 'auto' etc.
    coinContainer.cursor = "pointer";   // show pointer
    coinContainer.on("pointerdown", () => {
      window.open(linkUrl, "_blank");
    });
  }

  return coinContainer;
}

// 4. Animate via Pixi's built-in ticker
let lastTime = performance.now();

app.ticker.add(() => {
  const now = performance.now();
  const elapsedMs = now - lastTime;
  lastTime = now;

  const distanceToMove = (FLOW_SPEED * elapsedMs) / 1000;

  // Move coins from oldest (end) to newest (start)
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    // Move down
    coin.y += distanceToMove;

    // Collide with coin below
    if (i < activeCoins.length - 1) {
      const belowCoin = activeCoins[i + 1];
      const requiredY = belowCoin.y - coin.height - COIN_SPACING;
      if (coin.y > requiredY) {
        coin.y = requiredY;
      }
    }
  }

  // Remove coins if they fall below
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    if (activeCoins[i].y > app.renderer.height) {
      app.stage.removeChild(activeCoins[i]);
      activeCoins.splice(i, 1);
    }
  }
});
