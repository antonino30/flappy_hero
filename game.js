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
overlay.addEventListener("pointerdown", () => {
  if (state === "menu" || state === "gameover") start();
});

const W = canvas.width;
const H = canvas.height;

const STORAGE_BEST = "flappyhero_best_v2_dragon";
let best = Number(localStorage.getItem(STORAGE_BEST) || 0);
uiBest.textContent = String(best);

let state = "menu"; // menu, playing, gameover
let lastT = 0;

const hero = {
  x: 120,
  y: H / 2,
  r: 18,
  vy: 0,

  // abilità / power state
  shieldHits: 0,
  shieldT: 0,
};

const world = {
  gravity: 1500,
  jump: -520,
  speed: 220,
  maxSpeed: 420,

  spawnEvery: 1.55,
  minSpawnEvery: 1.05,

  gap: 175,
  minGap: 130,

  timeAlive: 0,

  // slow time
  slowT: 0,
};

let pipes = [];
let spawnT = 0;
let score = 0;
let muted = false;

// ----------------- ABILITA' -----------------
const abilities = [
  {
    id: "fire",
    name: "Soffio di fuoco",
    unlockScore: 0,
    cooldown: 6,
    icon: "🔥",
    effect: "Rimuove il prossimo ostacolo davanti a te",
    use(game) {
      const idx = game.pipes.findIndex(p => (p.x + p.w) > (game.hero.x + game.hero.r));
      if (idx >= 0) {
        game.pipes.splice(idx, 1);
        return true;
      }
      return false;
    },
  },
  {
    id: "shield",
    name: "Scudo",
    unlockScore: 10,
    cooldown: 10,
    icon: "🛡️",
    effect: "Ignori 1 collisione (per 1 hit)",
    use(game) {
      game.hero.shieldHits = 1;
      game.hero.shieldT = 4.0;
      return true;
    },
  },
  {
    id: "slow",
    name: "Rallenta tempo",
    unlockScore: 25,
    cooldown: 12,
    icon: "⏳",
    effect: "Rallenta tutto per 3 secondi",
    use(game) {
      game.world.slowT = 3.0;
      return true;
    },
  },
];

let equippedAbilityId = "fire";
const abilityState = {
  unlocked: new Set(["fire"]),
  cooldownLeft: 0, // cooldown dell'abilità equipaggiata
};

function getAbilityById(id) {
  return abilities.find(a => a.id === id);
}

// Utility
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }

function showOverlay(title, text) {
  ovTitle.textContent = title;
  ovText.textContent = text;
  overlay.classList.remove("hidden");
}
function hideOverlay() { overlay.classList.add("hidden"); }

function resetGame() {
  hero.y = H / 2;
  hero.vy = 0;

  hero.shieldHits = 0;
  hero.shieldT = 0;

  world.speed = 220;
  world.spawnEvery = 1.55;
  world.gap = 175;
  world.timeAlive = 0;
  world.slowT = 0;

  pipes = [];
  spawnT = 0;

  score = 0;
  uiScore.textContent = "0";

  abilityState.cooldownLeft = 0;

  hideOverlay();
}

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

function tryUseAbility() {
  if (state !== "playing") return;

  const ab = getAbilityById(equippedAbilityId);
  if (!ab) return;
  if (!abilityState.unlocked.has(ab.id)) return;
  if (abilityState.cooldownLeft > 0) return;

  const ok = ab.use({ hero, world, pipes });
  if (ok) {
    abilityState.cooldownLeft = ab.cooldown;
    AudioEngine.sfxPower();
  }
}

function cycleAbility() {
  const unlocked = abilities.filter(a => abilityState.unlocked.has(a.id));
  if (unlocked.length <= 1) return;

  const i = unlocked.findIndex(a => a.id === equippedAbilityId);
  const next = unlocked[(i + 1) % unlocked.length];
  equippedAbilityId = next.id;
}

function spawnPipe() {
  const margin = 90;
  const gap = world.gap;
  const centerY = rand(margin + gap / 2, H - margin - gap / 2);

  pipes.push({
    x: W + 30,
    w: 70,
    gapY: centerY,
    gapH: gap,
    passed: false,
  });
}

function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return (dx * dx + dy * dy) <= r * r;
}

function update(dt) {
  if (state !== "playing") return;

  // cooldown abilità
  abilityState.cooldownLeft = Math.max(0, abilityState.cooldownLeft - dt);

  // scudo timer (solo visivo)
  hero.shieldT = Math.max(0, hero.shieldT - dt);

  // slow time: se attivo rallenta fisica e scorrimento
  let timeScale = 1.0;
  if (world.slowT > 0) {
    world.slowT = Math.max(0, world.slowT - dt);
    timeScale = 0.65;
  }
  dt = dt * timeScale;

  world.timeAlive += dt;

  // difficoltà cresce
  const k = clamp(world.timeAlive / 45, 0, 1);
  world.speed = 220 + k * (world.maxSpeed - 220);
  world.spawnEvery = 1.55 - k * (1.55 - world.minSpawnEvery);
  world.gap = 175 - k * (175 - world.minGap);

  // audio accelera
  AudioEngine.setIntensity(k);

  // fisica hero
  hero.vy += world.gravity * dt;
  hero.y += hero.vy * dt;

  // terreno / soffitto
  if (hero.y + hero.r > H - 40) {
    if (hero.shieldHits > 0) {
      hero.shieldHits -= 1;
      hero.y = H - 40 - hero.r;
      hero.vy = world.jump * 0.6;
    } else {
      gameOver();
      return;
    }
  }
  if (hero.y - hero.r < 0) {
    hero.y = hero.r;
    hero.vy = 0;
  }

  // spawn pipes
  spawnT += dt;
  if (spawnT >= world.spawnEvery) {
    spawnT = 0;
    spawnPipe();
  }

  // pipes movement + collision
  for (const p of pipes) {
    p.x -= world.speed * dt;

    const topRect = { x: p.x, y: 0, w: p.w, h: p.gapY - p.gapH / 2 };
    const botRect = { x: p.x, y: p.gapY + p.gapH / 2, w: p.w, h: H - (p.gapY + p.gapH / 2) - 40 };

    const hitTop = circleRectCollide(hero.x, hero.y, hero.r, topRect.x, topRect.y, topRect.w, topRect.h);
    const hitBot = circleRectCollide(hero.x, hero.y, hero.r, botRect.x, botRect.y, botRect.w, botRect.h);

    if (hitTop || hitBot) {
      if (hero.shieldHits > 0) {
        hero.shieldHits -= 1;
        hero.vy = Math.min(hero.vy, 120);
      } else {
        gameOver();
        return;
      }
    }

    // score pass
    if (!p.passed && p.x + p.w < hero.x - hero.r) {
      p.passed = true;
      score += 1;
      uiScore.textContent = String(score);

      // sblocca abilità
      for (const a of abilities) {
        if (score >= a.unlockScore) abilityState.unlocked.add(a.id);
      }
    }
  }

  // remove offscreen
  pipes = pipes.filter(p => p.x + p.w > -20);
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#07102a");
  g.addColorStop(1, "#050814");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // stelline
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 60; i++) {
    const x = (i * 71) % W;
    const y = (i * 131) % (H - 80);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();

  // terreno
  ctx.fillStyle = "#0b1635";
  ctx.fillRect(0, H - 40, W, 40);

  // pipes (stile tech)
  for (const p of pipes) {
    const topH = p.gapY - p.gapH / 2;
    const botY = p.gapY + p.gapH / 2;
    const botH = H - botY - 40;

    ctx.fillStyle = "#1b2f63";
    ctx.fillRect(p.x, 0, p.w, topH);
    ctx.fillRect(p.x, botY, p.w, botH);

    // "laser edge"
    ctx.fillStyle = "#8fb0ff";
    ctx.fillRect(p.x, topH - 6, p.w, 3);
    ctx.fillRect(p.x, botY + 3, p.w, 3);
  }

  // draghetto
  drawDragon(hero.x, hero.y, hero.r, hero.shieldHits > 0);

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

  // HUD abilità in basso a destra
  drawAbilityHUD();
}

function drawDragon(x, y, r, shieldOn) {
  // corpo
  ctx.fillStyle = "#ffcc66";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.15, r, 0, 0, Math.PI * 2);
  ctx.fill();

  // pancia
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(x - 2, y + 4, r * 0.6, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // ala
  ctx.fillStyle = "rgba(143,176,255,0.65)";
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 2);
  ctx.quadraticCurveTo(x - 26, y - 20, x - 30, y + 8);
  ctx.quadraticCurveTo(x - 16, y + 2, x - 6, y - 2);
  ctx.fill();

  // occhio
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(x + 8, y - 4, 3, 0, Math.PI * 2);
  ctx.fill();

  // cornetto
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 18);
  ctx.lineTo(x + 8, y - 10);
  ctx.lineTo(x - 1, y - 12);
  ctx.closePath();
  ctx.fill();

  // scudo (se attivo)
  if (shieldOn) {
    ctx.strokeStyle = "rgba(143,176,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawAbilityHUD() {
  const pad = 14;
  const boxW = 210;
  const boxH = 72;
  const x = W - boxW - pad;
  const y = H - boxH - pad - 40; // sopra il terreno

  const ab = getAbilityById(equippedAbilityId);
  if (!ab) return;

  const unlocked = abilityState.unlocked.has(ab.id);

  // box
  ctx.fillStyle = "rgba(15,27,51,0.85)";
  ctx.fillRect(x, y, boxW, boxH);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.strokeRect(x, y, boxW, boxH);

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "14px system-ui";
  ctx.fillText("ABILITÀ (T)", x + 10, y + 18);

  ctx.font = "16px system-ui";
  ctx.fillText(`${ab.icon} ${ab.name}`, x + 10, y + 42);

  ctx.font = "13px system-ui";

  if (!unlocked) {
    ctx.fillStyle = "rgba(255,120,120,0.9)";
    ctx.fillText(`Bloccata: ${ab.unlockScore} pt`, x + 10, y + 62);
    return;
  }

  const cd = abilityState.cooldownLeft;
  if (cd > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(`Cooldown: ${cd.toFixed(1)}s`, x + 10, y + 62);

    // barra cooldown
    const p = 1 - clamp(cd / ab.cooldown, 0, 1);
    ctx.fillStyle = "rgba(143,176,255,0.75)";
    ctx.fillRect(x + 120, y + 54, Math.round(80 * p), 8);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.strokeRect(x + 120, y + 54, 80, 8);
  } else {
    ctx.fillStyle = "rgba(160,255,160,0.9)";
    ctx.fillText("Pronta (E cambia)", x + 10, y + 62);
  }
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ----------------- INPUT -----------------
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (e.code === "Space") { e.preventDefault(); jump(); }
  if (k === "r") start();
  if (k === "t") { e.preventDefault(); tryUseAbility(); }
  if (k === "e") { e.preventDefault(); cycleAbility(); }
});

canvas.addEventListener("pointerdown", () => jump());

btnStart.addEventListener("click", () => start());
btnMute.addEventListener("click", () => {
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
requestAnimationFrame((t) =>
