/**
 * pixi-script.js
 *
 * 1) Creates a PixiJS Application (500x900).
 * 2) Receives refined tokens from server (with `name`, `symbol`, `image`, `description`, `mint`).
 * 3) For each token:
 *    - Builds a "coin container" (rect BG, image, text).
 *    - Calculates `pumpFunUrl = "https://pump.fun/coin/" + mint`.
 *    - On hover:
 *        - Shows the pumpFunUrl in a small text tooltip.
 *        - Lightens BG color to indicate hover.
 *    - On click => window.open(pumpFunUrl).
 * 4) Animates them downward with collision logic.
 */

////////////////////////////////////////
// Create Pixi Application
////////////////////////////////////////

const app = new PIXI.Application({
  width: 500,
  height: 900,
  backgroundColor: 0x1a1a1a,
  antialias: true
});
document.body.appendChild(app.view);

////////////////////////////////////////
// Global Config
////////////////////////////////////////

const FLOW_SPEED = 120;       // px/sec for downward movement
const COIN_SPACING = 10;      // gap between coins
const activeCoins = [];       // array of coin containers (newest at index 0)

// Connect to your Node backend
const socket = new WebSocket("ws://localhost:3000");

socket.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data); 
    // e.g. { name, symbol, image, description, mint }

    // Create the container for this new token
    const coinContainer = await createCoinContainer(data);

    // Place above the canvas so it drops in
    coinContainer.y = -coinContainer.height;

    // Add to stage & array
    app.stage.addChild(coinContainer);
    activeCoins.unshift(coinContainer);

  } catch (error) {
    console.error("Error parsing incoming token data:", error);
  }
};

/**
 * Creates a coin container with:
 *  - BG rectangle
 *  - Token image
 *  - Text fields
 *  - A tooltip showing the final "pump.fun/coin/<mint>" URL
 *  - Hover highlight
 *  - Click => open link
 */
async function createCoinContainer(data) {
  // Basic fields
  const name = data.name || "Unknown";
  const symbol = data.symbol || "Unknown";
  const description = data.description || "";
  // Build the pumpFun URL from `mint`
  const mint = data.mint || null;
  const pumpFunUrl = mint 
    ? `https://pump.fun/coin/${mint}`
    : null;

  // Card size
  const cardWidth = 460;
  const cardHeight = 100;

  // Container
  const container = new PIXI.Container();
  container.width = cardWidth;
  container.height = cardHeight;

  // Background
  const bg = new PIXI.Graphics();
  bg.beginFill(0x292929); // dark gray
  bg.drawRoundedRect(0, 0, cardWidth, cardHeight, 8);
  bg.endFill();
  container.addChild(bg);

  // Attempt to load image
  let imageUrl = data.image || "https://via.placeholder.com/88";
  if (imageUrl.includes("/ipfs/")) {
    const ipfsHash = imageUrl.split("/ipfs/")[1];
    imageUrl = `https://pump.mypinata.cloud/ipfs/${ipfsHash}`;
  }
  let sprite;
  try {
    const texture = await PIXI.Texture.fromURL(imageUrl);
    sprite = new PIXI.Sprite(texture);
  } catch {
    sprite = new PIXI.Sprite.from("https://via.placeholder.com/88");
  }
  sprite.x = 10;
  sprite.y = 6;
  sprite.width = 88;
  sprite.height = 88;
  container.addChild(sprite);

  // Main text style
  const style = new PIXI.TextStyle({
    fontFamily: "Arial",
    fontSize: 16,
    fill: 0xffffff
  });

  // Basic text fields
  const nameText = new PIXI.Text(`Name: ${name}`, style);
  nameText.x = 108;
  nameText.y = 10;
  container.addChild(nameText);

  const symbolText = new PIXI.Text(`Symbol: ${symbol}`, style);
  symbolText.x = 108;
  symbolText.y = 30;
  container.addChild(symbolText);

  const descText = new PIXI.Text(`Desc: ${description}`, style);
  descText.x = 108;
  descText.y = 50;
  container.addChild(descText);

  ////////////////////////////////////////
  // 1) Hover highlight
  ////////////////////////////////////////

  container.eventMode = "dynamic";
  container.cursor = "pointer";

  container.on("pointerover", () => {
    bg.tint = 0x666666; // lighten background
  });

  container.on("pointerout", () => {
    bg.tint = 0xffffff; // reset tint
  });

  ////////////////////////////////////////
  // 2) PumpFun URL tooltip
  ////////////////////////////////////////

  // We'll show the full URL, or a shortened version if it's too long
  let urlToShow = pumpFunUrl || "";
  if (urlToShow.length > 35) {
    // e.g. "https://pump.fun/coin/9gxwHahe..." 
    urlToShow = urlToShow.slice(0, 35) + "...";
  }

  const urlStyle = new PIXI.TextStyle({
    fontFamily: "Arial",
    fontSize: 12,
    fill: 0xffff00 // maybe a bright color for the tooltip
  });
  const urlTooltip = new PIXI.Text(urlToShow, urlStyle);
  // Place near bottom right or so
  urlTooltip.x = 108;
  urlTooltip.y = 70;
  // Start hidden
  urlTooltip.visible = false;
  container.addChild(urlTooltip);

  // Show tooltip on hover, hide on out
  container.on("pointerover", () => {
    urlTooltip.visible = !!pumpFunUrl; // only if we have a valid URL
  });
  container.on("pointerout", () => {
    urlTooltip.visible = false;
  });

  ////////////////////////////////////////
  // 3) Click => open PumpFun URL
  ////////////////////////////////////////
  if (pumpFunUrl) {
    container.on("pointerdown", () => {
      window.open(pumpFunUrl, "_blank");
    });
  }

  return container;
}

// Animation loop
let lastTime = performance.now();

app.ticker.add(() => {
  const now = performance.now();
  const deltaMs = now - lastTime;
  lastTime = now;

  const distance = (FLOW_SPEED * deltaMs) / 1000;

  // Move coins from bottom to top
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    coin.y += distance;

    // Collision
    if (i < activeCoins.length - 1) {
      const belowCoin = activeCoins[i + 1];
      const requiredY = belowCoin.y - coin.height - COIN_SPACING;
      if (coin.y > requiredY) {
        coin.y = requiredY;
      }
    }
  }

  // Remove offscreen coins
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    if (activeCoins[i].y > app.renderer.height) {
      app.stage.removeChild(activeCoins[i]);
      activeCoins.splice(i, 1);
    }
  }
});
