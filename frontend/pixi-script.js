/**
 * pixi-script.js
 *
 * 1) Creates a PixiJS Application (width=500, height=window.innerHeight).
 * 2) Receives new tokens, displays them.
 * 3) Strobe overlay triggers at y=700 if the coin has a decision.
 * 4) Shortened strobe duration (800ms), increased frequency (15).
 */

////////////////////////////////////////
// Create Pixi Application
////////////////////////////////////////

const app = new PIXI.Application({
  // Width stays 500, but height is the full window
  width: 500,
  height: window.innerHeight,
  backgroundColor: 0x1a1a1a,
  antialias: true
});

document.body.appendChild(app.view);

////////////////////////////////////////
// Global Config
////////////////////////////////////////

const STROBE_LINE = 700;       // lowered from 500
const FLOW_SPEED = 120;        // px/sec
const COIN_SPACING = 10;       // gap between coins

// Strobe changes
const STROBE_DURATION = 800;   // shorter (was 1500)
const STROBE_FREQUENCY = 15;   // higher flicker rate (was 5)
const STROBE_OPACITY = 0.6;    // overlay alpha during flicker
const FINAL_OPACITY = 0.8;     // overlay alpha after strobe

// Active coins + decisions
const activeCoins = [];
const coinIdToContainer = {};
let coinDecisions = {};

// Connect to the Node backend
const socket = new WebSocket("ws://localhost:3000");

socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === "newToken") {
      createAndAddCoin(data);
    } else if (data.type === "decisionBundle") {
      Object.assign(coinDecisions, data.decisions);
    }
  } catch (err) {
    console.error("[ERROR] Parsing server message:", err);
  }
};

function createAndAddCoin(data) {
  const container = createCoinContainer(data);
  container.y = -container.height; 
  app.stage.addChild(container);
  activeCoins.unshift(container);
  coinIdToContainer[data.coinId] = container;
}

/**
 * Creates one coin container with an overlay for strobing.
 */
function createCoinContainer(data) {
  const { coinId, name, symbol, description, image, mint } = data;
  const cardWidth = 460;
  const cardHeight = 100;

  // Container
  const container = new PIXI.Container();
  container.width = cardWidth;
  container.height = cardHeight;

  // Strobe flags
  container._coinId = coinId;
  container._strobeActive = false;
  container._strobeStartTime = 0;
  container._finalColor = 0xffffff;

  // BG
  const bg = new PIXI.Graphics();
  bg.beginFill(0x292929);
  bg.drawRoundedRect(0, 0, cardWidth, cardHeight, 8);
  bg.endFill();
  container.addChild(bg);

  // Image
  let imageUrl = image || "https://via.placeholder.com/88";
  if (imageUrl.includes("/ipfs/")) {
    const ipfsHash = imageUrl.split("/ipfs/")[1];
    imageUrl = `https://pump.mypinata.cloud/ipfs/${ipfsHash}`;
  }
  let sprite;
  try {
    sprite = PIXI.Sprite.from(imageUrl);
  } catch (err) {
    console.error("[ERROR] Loading image => using placeholder:", err);
    sprite = PIXI.Sprite.from("https://via.placeholder.com/88");
  }
  sprite.x = 10;
  sprite.y = 6;
  sprite.width = 88;
  sprite.height = 88;
  container.addChild(sprite);

  // Text
  const style = new PIXI.TextStyle({ fontFamily: "Arial", fontSize: 16, fill: 0xffffff });
  const nameText = new PIXI.Text(`Name: ${name || "Unknown"}`, style);
  nameText.x = 108; 
  nameText.y = 10;
  container.addChild(nameText);

  const symbolText = new PIXI.Text(`Symbol: ${symbol || "Unknown"}`, style);
  symbolText.x = 108; 
  symbolText.y = 30;
  container.addChild(symbolText);

  const descText = new PIXI.Text(`Desc: ${description || ""}`, style);
  descText.x = 108;
  descText.y = 50;
  container.addChild(descText);

  // Hover highlight
  container.eventMode = "dynamic";
  container.cursor = "pointer";
  container.on("pointerover", () => bg.tint = 0x666666);
  container.on("pointerout", () => bg.tint = 0xffffff);

  // PumpFun URL tooltip
  const pumpFunUrl = mint ? `https://pump.fun/coin/${mint}` : null;
  let urlToShow = pumpFunUrl || "";
  if (urlToShow.length > 35) {
    urlToShow = urlToShow.slice(0, 35) + "...";
  }
  const urlStyle = new PIXI.TextStyle({ fontFamily: "Arial", fontSize: 12, fill: 0xffff00 });
  const urlTooltip = new PIXI.Text(urlToShow, urlStyle);
  urlTooltip.x = 108; 
  urlTooltip.y = 70;
  urlTooltip.visible = false;
  container.addChild(urlTooltip);

  container.on("pointerover", () => (urlTooltip.visible = !!pumpFunUrl));
  container.on("pointerout", () => (urlTooltip.visible = false));

  if (pumpFunUrl) {
    container.on("pointerdown", () => {
      window.open(pumpFunUrl, "_blank");
    });
  }

  // STROBE OVERLAY
  const overlay = new PIXI.Graphics();
  overlay.beginFill(0xffffff); // white fill => tint shows clearly
  overlay.drawRect(0, 0, cardWidth, cardHeight);
  overlay.endFill();
  overlay.alpha = 0; 
  container.addChild(overlay);
  container._strobeOverlay = overlay;

  return container;
}

// Ticker
let lastTime = performance.now();
app.ticker.add(() => {
  const now = performance.now();
  const deltaMs = now - lastTime;
  lastTime = now;

  const distance = (FLOW_SPEED * deltaMs) / 1000;
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const coin = activeCoins[i];
    coin.y += distance;

    // collision
    if (i < activeCoins.length - 1) {
      const below = activeCoins[i + 1];
      const requiredY = below.y - coin.height - COIN_SPACING;
      if (coin.y > requiredY) {
        coin.y = requiredY;
      }
    }

    maybeTriggerStrobe(coin, now);

    if (coin.y > app.renderer.height) {
      app.stage.removeChild(coin);
      activeCoins.splice(i, 1);
      delete coinIdToContainer[coin._coinId];
    }
  }
});

/**
 * Strobe logic - toggles overlay tint between red/green
 * once the coin crosses STROBE_LINE and has a known decision.
 */
function maybeTriggerStrobe(coin, currentTime) {
  const overlay = coin._strobeOverlay;
  if (!overlay) return;

  if (coin._strobeActive) {
    // Strobing in progress
    const elapsed = currentTime - coin._strobeStartTime;
    if (elapsed < STROBE_DURATION) {
      const phase = Math.floor((elapsed / 1000) * STROBE_FREQUENCY) % 2;
      overlay.alpha = STROBE_OPACITY;
      if (phase === 0) {
        overlay.tint = 0xff0000;
      } else {
        overlay.tint = 0x00ff00;
      }
    } else {
      // Strobe ends => final color
      overlay.tint = coin._finalColor;
      overlay.alpha = FINAL_OPACITY;
    }
  } else {
    // Not strobing yet
    const cId = coin._coinId;
    if (coinDecisions[cId] && coin.y > STROBE_LINE) {
      const decision = coinDecisions[cId]; // "yes" or "no"
      coin._finalColor = (decision === "yes") ? 0x00ff00 : 0xff0000;
      coin._strobeActive = true;
      coin._strobeStartTime = currentTime;
    }
  }
}

// Draw the lowered strobe line at y=700
const lineGfx = new PIXI.Graphics();
lineGfx.lineStyle(2, 0xffffff, 0.4);
lineGfx.moveTo(0, STROBE_LINE);
lineGfx.lineTo(app.renderer.width, STROBE_LINE);
app.stage.addChild(lineGfx);
