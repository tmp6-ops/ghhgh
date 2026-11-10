// Game Configuration & Grid Constants
const GRID_SIZE = 20; // 20x20 grid
const CELL_SIZE = 24; // 24 * 20 = 480px width & height

// Canvas & Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreVal = document.getElementById('scoreVal');
const highScoreVal = document.getElementById('highScoreVal');
const snacksVal = document.getElementById('snacksVal');
const speedVal = document.getElementById('speedVal');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const finalScoreVal = document.getElementById('finalScoreVal');
const deathReason = document.getElementById('deathReason');

const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const resumeBtn = document.getElementById('resumeBtn');
const pauseToggleBtn = document.getElementById('pauseToggleBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const difficultySelect = document.getElementById('difficultySelect');
const dPadButtons = document.querySelectorAll('.d-pad-btn');

// Snack definitions with point values, icons, and spawn weights
const SNACK_TYPES = [
  { name: 'Pizza', emoji: '🍕', points: 10, weight: 50 },
  { name: 'Burger', emoji: '🍔', points: 15, weight: 30 },
  { name: 'Donut', emoji: '🍩', points: 20, weight: 15 },
  { name: 'Star', emoji: '⭐', points: 35, weight: 5, bonusSpeed: true }
];

// Difficulty settings
const DIFFICULTY_CONFIG = {
  easy: { baseTickRate: 150, speedIncrement: 1.5, minTickRate: 90, hasBombs: false },
  normal: { baseTickRate: 125, speedIncrement: 2.5, minTickRate: 70, hasBombs: true, maxBombs: 2 },
  hard: { baseTickRate: 95, speedIncrement: 3.5, minTickRate: 50, hasBombs: true, maxBombs: 4 }
};

// Web Audio API Sound Synthesizer (Zero external assets needed!)
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playChomp() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playBonus() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playCrash() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }
}

const sounds = new SoundEffects();

// Particle System for snack consumption burst
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        x: x * CELL_SIZE + CELL_SIZE / 2,
        y: y * CELL_SIZE + CELL_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color || '#ffb703',
        size: Math.random() * 3 + 2,
        life: 1.0,
        decay: Math.random() * 0.05 + 0.04
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(context) {
    for (const p of this.particles) {
      context.save();
      context.globalAlpha = Math.max(0, p.life);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  clear() {
    this.particles = [];
  }
}

const particles = new ParticleSystem();

// Game State Variables
let snake = [];
let direction = 'RIGHT';
let nextDirection = 'RIGHT';
let currentSnack = null;
let bombs = [];
let score = 0;
let highScore = localStorage.getItem('snack_eater_high_score') || 0;
let snacksEaten = 0;
let isPlaying = false;
let isPaused = false;
let gameLoopTimeout = null;
let currentTickRate = 125;

highScoreVal.textContent = highScore;

// Pick a random snack based on weighted probabilities
function getRandomSnack() {
  const rand = Math.random() * 100;
  let accumulated = 0;
  for (const snack of SNACK_TYPES) {
    accumulated += snack.weight;
    if (rand <= accumulated) {
      return snack;
    }
  }
  return SNACK_TYPES[0];
}

// Generate an un-occupied cell for snack or bomb
function getEmptyCell() {
  const occupied = new Set();
  snake.forEach(seg => occupied.add(`${seg.x},${seg.y}`));
  bombs.forEach(b => occupied.add(`${b.x},${b.y}`));
  if (currentSnack) occupied.add(`${currentSnack.x},${currentSnack.y}`);

  const freeSpots = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) {
        freeSpots.push({ x, y });
      }
    }
  }

  if (freeSpots.length === 0) return null;
  return freeSpots[Math.floor(Math.random() * freeSpots.length)];
}

function spawnSnack() {
  const spot = getEmptyCell();
  if (!spot) return;
  const snackType = getRandomSnack();
  currentSnack = {
    ...spot,
    ...snackType
  };
}

function maybeSpawnBomb() {
  const config = DIFFICULTY_CONFIG[difficultySelect.value];
  if (!config.hasBombs) return;
  if (bombs.length >= config.maxBombs) return;

  // Chance to spawn bomb as you eat snacks
  if (snacksEaten > 0 && snacksEaten % 4 === 0 && Math.random() < 0.6) {
    const spot = getEmptyCell();
    if (spot) {
      bombs.push(spot);
    }
  }
}

// Reset and Start Game
function initGame() {
  sounds.init();
  const config = DIFFICULTY_CONFIG[difficultySelect.value];
  currentTickRate = config.baseTickRate;

  // Snake starting segments (center of grid)
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  direction = 'RIGHT';
  nextDirection = 'RIGHT';
  bombs = [];
  score = 0;
  snacksEaten = 0;
  particles.clear();

  updateStats();
  spawnSnack();

  startScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  pauseScreen.classList.remove('active');

  isPlaying = true;
  isPaused = false;
  pauseToggleBtn.textContent = '⏸ Pause';

  if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
  gameLoop();
}

function updateStats() {
  scoreVal.textContent = score;
  snacksVal.textContent = snacksEaten;
  
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('snack_eater_high_score', highScore);
    highScoreVal.textContent = highScore;
  }

  const config = DIFFICULTY_CONFIG[difficultySelect.value];
  const speedMultiplier = (config.baseTickRate / currentTickRate).toFixed(1);
  speedVal.textContent = `${speedMultiplier}x`;
}

// Main Game Update Step
function gameUpdate() {
  direction = nextDirection;

  // Calculate new head coordinate
  const head = { ...snake[0] };
  if (direction === 'UP') head.y -= 1;
  else if (direction === 'DOWN') head.y += 1;
  else if (direction === 'LEFT') head.x -= 1;
  else if (direction === 'RIGHT') head.x += 1;

  // Wall collision check
  if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
    triggerGameOver("Hit the wall!");
    return;
  }

  // Self collision check
  for (let i = 0; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) {
      triggerGameOver("Chomped into your own body!");
      return;
    }
  }

  // Bomb collision check
  for (const bomb of bombs) {
    if (head.x === bomb.x && head.y === bomb.y) {
      triggerGameOver("Boom! Collided with a bomb! 💣");
      return;
    }
  }

  // Add new head
  snake.unshift(head);

  // Check snack collision
  if (currentSnack && head.x === currentSnack.x && head.y === currentSnack.y) {
    score += currentSnack.points;
    snacksEaten++;
    particles.spawn(head.x, head.y, currentSnack.bonusSpeed ? '#ff006e' : '#ffb703');

    if (currentSnack.bonusSpeed) {
      sounds.playBonus();
    } else {
      sounds.playChomp();
    }

    // Accelerate game based on difficulty
    const config = DIFFICULTY_CONFIG[difficultySelect.value];
    currentTickRate = Math.max(config.minTickRate, currentTickRate - config.speedIncrement);

    maybeSpawnBomb();
    spawnSnack();
    updateStats();
  } else {
    // Regular move: remove tail
    snake.pop();
  }
}

// Drawing routines
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }

  // Draw Bombs
  for (const bomb of bombs) {
    ctx.font = `${CELL_SIZE - 4}px 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', bomb.x * CELL_SIZE + CELL_SIZE / 2, bomb.y * CELL_SIZE + CELL_SIZE / 2 + 1);
  }

  // Draw Snack
  if (currentSnack) {
    // Draw subtle glow circle behind snack
    ctx.save();
    ctx.fillStyle = 'rgba(255, 183, 3, 0.2)';
    ctx.beginPath();
    ctx.arc(
      currentSnack.x * CELL_SIZE + CELL_SIZE / 2,
      currentSnack.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 1.7,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    ctx.font = `${CELL_SIZE - 4}px 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      currentSnack.emoji,
      currentSnack.x * CELL_SIZE + CELL_SIZE / 2,
      currentSnack.y * CELL_SIZE + CELL_SIZE / 2 + 1
    );
  }

  // Draw Snake
  for (let i = 0; i < snake.length; i++) {
    const seg = snake[i];
    const isHead = i === 0;

    ctx.save();
    if (isHead) {
      // Glow effect on head
      ctx.shadowColor = '#06d6a0';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#06d6a0';
    } else {
      // Body color gradient along the length
      const gradientFactor = Math.min(1, i / snake.length);
      ctx.fillStyle = gradientFactor > 0.5 ? '#118ab2' : '#0ea5e9';
    }

    const radius = 6;
    const padding = 1.5;
    const x = seg.x * CELL_SIZE + padding;
    const y = seg.y * CELL_SIZE + padding;
    const size = CELL_SIZE - padding * 2;

    roundRect(ctx, x, y, size, size, radius);
    ctx.fill();
    ctx.restore();

    // Draw eyes on the head
    if (isHead) {
      drawEyes(seg.x * CELL_SIZE, seg.y * CELL_SIZE, direction);
    }
  }

  // Draw particle animations
  particles.update();
  particles.draw(ctx);
}

// Draw friendly eyes pointing toward motion direction
function drawEyes(x, y, dir) {
  ctx.save();
  ctx.fillStyle = '#ffffff';

  let eye1 = { x: x + 6, y: y + 6 };
  let eye2 = { x: x + 18, y: y + 6 };

  if (dir === 'DOWN') {
    eye1 = { x: x + 6, y: y + 17 };
    eye2 = { x: x + 18, y: y + 17 };
  } else if (dir === 'LEFT') {
    eye1 = { x: x + 6, y: y + 6 };
    eye2 = { x: x + 6, y: y + 18 };
  } else if (dir === 'RIGHT') {
    eye1 = { x: x + 17, y: y + 6 };
    eye2 = { x: x + 17, y: y + 18 };
  }

  // Eye whites
  ctx.beginPath();
  ctx.arc(eye1.x, eye1.y, 3, 0, Math.PI * 2);
  ctx.arc(eye2.x, eye2.y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(eye1.x, eye1.y, 1.5, 0, Math.PI * 2);
  ctx.arc(eye2.x, eye2.y, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

// Game Loop
function gameLoop() {
  if (!isPlaying || isPaused) return;

  gameUpdate();
  draw();

  if (isPlaying) {
    gameLoopTimeout = setTimeout(gameLoop, currentTickRate);
  }
}

// End Game
function triggerGameOver(reason) {
  isPlaying = false;
  sounds.playCrash();
  if (gameLoopTimeout) clearTimeout(gameLoopTimeout);

  deathReason.textContent = reason;
  finalScoreVal.textContent = score;
  gameOverScreen.classList.add('active');
}

// Pause / Resume Toggle
function togglePause() {
  if (!isPlaying && !isPaused) return;

  if (isPaused) {
    isPaused = false;
    pauseScreen.classList.remove('active');
    pauseToggleBtn.textContent = '⏸ Pause';
    gameLoop();
  } else {
    isPaused = true;
    pauseScreen.classList.add('active');
    pauseToggleBtn.textContent = '▶ Resume';
    if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
  }
}

// Direction Handler with 180-degree turn lock
function setDirection(newDir) {
  if (
    (newDir === 'UP' && direction !== 'DOWN') ||
    (newDir === 'DOWN' && direction !== 'UP') ||
    (newDir === 'LEFT' && direction !== 'RIGHT') ||
    (newDir === 'RIGHT' && direction !== 'LEFT')
  ) {
    nextDirection = newDir;
  }
}

// Event Listeners: Keyboard Navigation
window.addEventListener('keydown', (e) => {
  // Prevent browser scroll with arrows and space
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setDirection('UP');
  else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setDirection('DOWN');
  else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setDirection('LEFT');
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setDirection('RIGHT');
  else if (e.key === ' ' || e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
});

// UI Button Handlers
startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);
resumeBtn.addEventListener('click', togglePause);
pauseToggleBtn.addEventListener('click', togglePause);

function toggleSound() {
  sounds.enabled = !sounds.enabled;
  soundToggleBtn.textContent = sounds.enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
}

soundToggleBtn.addEventListener('click', toggleSound);

// Touch / On-screen D-pad Controls
dPadButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const dir = btn.getAttribute('data-dir');
    if (dir) setDirection(dir);
  });
});

// Initial canvas render placeholder
draw();

