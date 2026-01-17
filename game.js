// game.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score");
const uiBest = document.getElementById("best");
const btnStart = document.getElementById("btnStart");
const btnMute = document.getElementById("btnMute");
const btnReset = document.getElementById("btnReset");
const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ovTitle");
const ovText = document.getElementById("ovText");

const W = canvas.width;
const H = canvas.height;

const STORAGE_BEST = "flappyhero_best_v1";

let best = Number(localStorage.getItem(STORAGE_BEST) || 0);
uiBest.textContent = String(best);

let state = "menu"; // menu, playing, gameover
let lastT = 0;

const hero = {
  x: 120,
  y: H/2,
  r: 18,
  vy: 0,
};

const world = {
  gravity: 1500,
  jump: -520,
  speed: 220,          // aumenta col tempo
  maxSpeed: 420,
  spawnEvery: 1.55,    // diminuisce col tempo (più ostacoli)
  minSpawnEvery: 1.05,
  gap: 175,            // si riduce un po' col tempo
  minGap: 130,
  timeAlive: 0,
};

let pipes = [];
let spawnT = 0;
let score = 0;
let muted = false;

// Utility
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function rand(a,b){ return a + Math.random()*(b-a); }

function resetGame() {
  hero.y = H/2;
  hero.vy = 0;

  world.speed = 220;
  world.spawnEvery = 1.55;
  world.gap = 175;
  world.timeAlive = 0;

  pipes = [];
  spawnT = 0;

  score = 0;
  uiScore.textContent = "0";

  hideOverlay();
}

function showOverlay(title, text){
  ovTitle.textContent = title;
  ovText.textContent = text;
  overlay.classList.remove("hidden");
}
function hideOverlay(){ overlay.classList.add("hidden"); }

function start() {
  resetGame();
  state = "playing";
  lastT = performance.now();
  AudioEngine.startBeat();
}

function gameOver() {
  state = "gameover";
  AudioEngine.stopBeat();
  AudioEngine.sfxHit();

  if (score > best) {
    best = score;
    localStorage.setItem(STORAGE_BEST, String(best));
    uiBest.textContent = String(best);
  }
  showOverlay("Game Over", `Punteggio: ${score} (Best: ${best}). Premi Start o R per riprovare.`);
}

function jump() {
  if (state === "menu") start();
  if (state !== "playing") return;
  hero.vy = world.jump;
  AudioEngine.sfxJump();
}

function spawnPipe() {
  const margin = 90;
  const gap = world.gap;
  const centerY = rand(margin + gap/2, H - margin - gap/2);

  pipes.push({
    x: W + 30,
    w: 70,
    gapY: centerY,
    gapH: gap,
    passed: false,
  });
}

function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx+rw);
  const ny = clamp(cy, ry, ry+rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return (dx*dx + dy*dy) <= r*r;
}

function update(dt) {
  if (state !== "playing") return;

  world.timeAlive += dt;

  // difficoltà cresce
  const k = clamp(world.timeAlive / 45, 0, 1); // dopo 45s ~ max
  world.speed = 220 + k * (world.maxSpeed - 220);
  world.spawnEvery = 1.55 - k * (1.55 - world.minSpawnEvery);
  world.gap = 175 - k * (175 - world.minGap);

  // audio accelera
  AudioEngine.setIntensity(k);

  hero.vy += world.gravity * dt;
  hero.y += hero.vy * dt;

  // terreno / soffitto
  if (hero.y + hero.r > H - 40) gameOver();
  if (hero.y - hero.r < 0) { hero.y = hero.r; hero.vy = 0; }

  // spawn tubi
  spawnT += dt;
  if (spawnT >= world.spawnEvery) {
    spawnT = 0;
    spawnPipe();
  }

  // muovi tubi e collisioni
  for (const p of pipes) {
    p.x -= world.speed * dt;

    const topRect = { x: p.x, y: 0, w: p.w, h: p.gapY - p.gapH/2 };
    const botRect = { x: p.x, y: p.gapY + p.gapH/2, w: p.w, h: H - (p.gapY + p.gapH/2) - 40 };

    const hitTop = circleRectCollide(hero.x, hero.y, hero.r, topRect.x, topRect.y, topRect.w, topRect.h);
    const hitBot = circleRectCollide(hero.x, hero.y, hero.r, botRect.x, botRect.y, botRect.w, botRect.h);
    if (hitTop || hitBot) gameOver();

    if (!p.passed && p.x + p.w < hero.x - hero.r) {
      p.passed = true;
      score += 1;
      uiScore.textContent = String(score);
    }
  }

  // rimuovi tubi fuori schermo
  pipes = pipes.filter(p => p.x + p.w > -20);
}

function drawBackground() {
  // semplice gradiente + “stelle”
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, "#07102a");
  g.addColorStop(1, "#050814");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // stelline
  ctx.globalAlpha = 0.18;
  for (let i=0;i<60;i++){
    const x = (i*71) % W;
    const y = (i*131) % (H-80);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();

  // terreno
  ctx.fillStyle = "#0b1635";
  ctx.fillRect(0, H-40, W, 40);

  // tubi (laser/tubi stile “tech”)
  for (const p of pipes) {
    const topH = p.gapY - p.gapH/2;
    const botY = p.gapY + p.gapH/2;
    const botH = H - botY - 40;

    // colonna sopra
    ctx.fillStyle = "#1b2f63";
    ctx.fillRect(p.x, 0, p.w, topH);
    // colonna sotto
    ctx.fillRect(p.x, botY, p.w, botH);

    // “laser edge”
    ctx.fillStyle = "#8fb0ff";
    ctx.fillRect(p.x, topH-6, p.w, 3);
    ctx.fillRect(p.x, botY+3, p.w, 3);
  }

  // Filippo (eroe)
  ctx.beginPath();
  ctx.fillStyle = "#ffcc66";
  ctx.arc(hero.x, hero.y, hero.r, 0, Math.PI*2);
  ctx.fill();

  // occhiolino
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(hero.x+6, hero.y-4, 3, 0, Math.PI*2);
  ctx.fill();

  // testo stato
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "16px system-ui";
  if (state === "menu") {
    ctx.fillText("Tocca o Spazio per iniziare", 90, 80);
  } else if (state === "playing") {
    ctx.fillText(`Velocità: ${Math.round(world.speed)}`, 14, 24);
  } else if (state === "gameover") {
    ctx.fillText("Premi R o Start per riprovare", 85, 80);
  }
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// Input
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); jump(); }
  if (e.key.toLowerCase() === "r") { start(); }
});

canvas.addEventListener("pointerdown", () => jump());

btnStart.addEventListener("click", () => start());
btnMute.addEventListener("click", async () => {
  muted = !muted;
  AudioEngine.setMuted(muted);
  btnMute.textContent = `Audio: ${muted ? "OFF" : "ON"}`;
});

btnReset.addEventListener("click", () => {
  best = 0;
  localStorage.setItem(STORAGE_BEST, "0");
  uiBest.textContent = "0";
});

// Avvio
showOverlay("Flappy Hero", "Premi Start o tocca lo schermo per iniziare.");
requestAnimationFrame((t)=>{ lastT=t; requestAnimationFrame(loop); });
