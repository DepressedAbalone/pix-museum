import { GoogleGenAI } from '@google/genai';
import { getCustomSections, generateExhibitInSection } from './custom-museum.js';

// ==================== CONFIG ====================
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// ==================== STATE ====================
let isOpen = false;
let chatHistory = [];
let pendingExhibit = null; // exhibit data waiting for confirmation
let isGenerating = false;
let _exhibitMeta = null;

// ==================== SOUND EFFECTS ====================
let sfxCtx = null;
function ensureSfx() {
  if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sfxCtx.state === 'suspended') sfxCtx.resume();
  return sfxCtx;
}

function playTone(freq, dur, type, vol, attack) {
  const ctx = ensureSfx();
  const osc = ctx.createOscillator(); osc.type = type || 'sine'; osc.frequency.value = freq;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.15, t + (attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t + dur);
}

function playNoise(dur, freq, type, vol) {
  const ctx = ensureSfx();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 1000;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t); src.stop(t + dur);
}

const sfx = {
  open: () => {
    playTone(200, 0.3, 'sine', 0.1);
    setTimeout(() => playTone(400, 0.2, 'sine', 0.08), 100);
    setTimeout(() => playTone(600, 0.15, 'sine', 0.06), 180);
  },
  close: () => {
    playTone(600, 0.2, 'sine', 0.06);
    setTimeout(() => playTone(300, 0.3, 'sine', 0.08), 80);
  },
  suggest: () => {
    playTone(800, 0.1, 'square', 0.06);
    setTimeout(() => playTone(1000, 0.1, 'square', 0.06), 80);
    setTimeout(() => playTone(1200, 0.15, 'square', 0.06), 160);
  },
  confirm: () => {
    playTone(523, 0.15, 'sine', 0.1);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 120);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.1), 240);
  },
  working: () => {
    playNoise(0.3, 800, 'bandpass', 0.05);
    playTone(100, 0.5, 'sawtooth', 0.04);
  },
  done: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.08), i * 100));
  },
  chat: () => {
    playTone(600 + Math.random() * 400, 0.08, 'square', 0.04);
  },
};

// ==================== JSON REPAIR (handles truncated output) ====================
function repairJSON(str) {
  try { return JSON.parse(str); } catch (_) {}
  let s = str;
  // Close unterminated strings
  const quotes = (s.match(/(?<!\\)"/g) || []).length;
  if (quotes % 2 !== 0) s += '"';
  // Close open brackets/braces
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  s = s.replace(/,\s*$/, '');
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  try { return JSON.parse(s); } catch (_) {}
  throw new SyntaxError('Could not repair JSON: ' + str.slice(0, 100));
}

// ==================== BUILD USER CONTEXT ====================
function buildContext() {
  let explored = [];
  try {
    const raw = localStorage.getItem('invention_museum_stories');
    if (raw) {
      const data = JSON.parse(raw);
      for (const [id, ex] of Object.entries(data.exhibits || {})) {
        const meta = _exhibitMeta?.[id];
        if (meta && ex.stories?.length) explored.push(meta.title);
      }
    }
  } catch {}
  const customSections = getCustomSections?.() || [];
  const customExhibits = customSections.flatMap(s => (s.exhibits || []).map(e => e.title));
  return { explored, customExhibits };
}

// ==================== UI ====================
function injectUI() {
  if (document.getElementById('gen-machine')) return;

  const MW = 400, MH = 580; // machine dimensions

  const style = document.createElement('style');
  style.textContent = `
    /* gen-toggle is now in #museum-nav — just style the active state */
    #gen-toggle.active {
      background: rgba(80, 144, 208, 0.3) !important;
      border-color: rgba(80, 144, 208, 0.5) !important;
    }

    #gen-machine {
      position: fixed; top: 60px; right: 12px; z-index: 50;
      width: ${MW}px; height: ${MH}px;
      transition: opacity 0.25s, transform 0.25s;
    }
    #gen-machine.hidden { opacity: 0; pointer-events: none; transform: translateY(20px) scale(0.95); }

    /* Canvas is the machine body */
    #gen-body-canvas {
      position: absolute; top: 0; left: 0; width: ${MW}px; height: ${MH}px;
      pointer-events: none;
    }

    /* Screen (embedded in machine) — overlaid on canvas */
    #gen-screen {
      position: absolute; top: 96px; left: 50px;
      width: ${MW - 100}px; height: 220px;
      background: #040a12; border: 2px solid #1a3050;
      border-radius: 4px; overflow-y: auto;
      font-family: 'Courier New', monospace; font-size: 13px;
      color: #6a9aca; line-height: 1.5; padding: 8px 10px;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.5), 0 0 4px rgba(74,154,255,0.1);
    }
    #gen-screen::-webkit-scrollbar { width: 3px; }
    #gen-screen::-webkit-scrollbar-thumb { background: #1a3050; }

    .gen-msg { margin-bottom: 6px; }
    .gen-msg.machine { color: #4a9aff; }
    .gen-msg.machine::before { content: '> '; color: #2a5a8a; }
    .gen-msg.user { color: #8aaa8a; }
    .gen-msg.user::before { content: '$ '; color: #4a7a4a; }

    .gen-idea {
      display: block; width: 100%; text-align: left;
      padding: 6px 8px; margin-bottom: 3px;
      background: rgba(74,154,255,0.06); border: 1px solid rgba(74,154,255,0.15);
      color: #8abaea; font-size: 12px; font-family: 'Courier New', monospace;
      cursor: pointer; border-radius: 2px; transition: all 0.15s;
    }
    .gen-idea:hover { background: rgba(74,154,255,0.12); border-color: #4a9aff; }
    .gen-idea-title { font-weight: 700; color: #4a9aff; }
    .gen-idea-desc { color: #5a7a9a; font-size: 11px; margin-top: 1px; }

    /* Input slot (embedded in machine) */
    #gen-input-slot {
      position: absolute; top: 330px; left: 50px;
      width: ${MW - 100}px; height: 26px;
      display: flex; gap: 4px;
    }
    #gen-input {
      flex: 1; padding: 4px 8px;
      background: #0a1520; border: 2px solid #1a3050; border-radius: 2px;
      color: #8abaea; font-family: 'Courier New', monospace; font-size: 13px;
      outline: none;
    }
    #gen-input:focus { border-color: #2a5a8a; box-shadow: 0 0 6px rgba(74,154,255,0.2); }
    #gen-input::placeholder { color: #1a3050; }
    #gen-send {
      width: 28px; background: #1a2a3a; border: 2px solid #2a4a6a; border-radius: 2px;
      color: #4a9aff; font-size: 13px; cursor: pointer;
    }
    #gen-send:hover { background: #2a3a4a; border-color: #4a9aff; }

    /* Buttons (positioned over canvas-drawn button shapes) */
    #gen-btn-ideas {
      position: absolute; top: 400px; left: 46px;
      width: ${(MW - 92 - 12) / 2}px; height: 42px;
      background: transparent; border: none; cursor: pointer;
      color: transparent; font-size: 0;
    }
    #gen-btn-build {
      position: absolute; top: 400px; right: 46px;
      width: ${(MW - 92 - 12) / 2}px; height: 42px;
      background: transparent; border: none; cursor: pointer;
      color: transparent; font-size: 0;
    }

    /* Lights (positioned over canvas-drawn lights) */
    .gen-light-hit { position: absolute; width: 16px; height: 16px; border-radius: 50%; }

    /* Working scanline */
    #gen-scanline {
      position: absolute; top: 92px; left: 50px;
      width: ${MW - 100}px; height: 3px; overflow: hidden;
      pointer-events: none;
    }
    #gen-scanline.active .gen-scanfill {
      width: 30%; height: 100%;
      background: linear-gradient(90deg, transparent, #ffa040, transparent);
      animation: genScan 1.2s ease infinite;
    }
    .gen-scanfill { width: 0; height: 100%; }
    @keyframes genScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
    @keyframes genPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  `;
  document.head.appendChild(style);

  // Toggle button is now in #museum-nav (index.html)
  const toggle = document.getElementById('gen-toggle');

  // Machine container
  const machine = document.createElement('div');
  machine.id = 'gen-machine';
  machine.className = 'hidden';

  // Canvas for machine body
  const canvas = document.createElement('canvas');
  canvas.id = 'gen-body-canvas';
  canvas.width = MW * 2; canvas.height = MH * 2; // 2x for retina
  canvas.style.width = MW + 'px'; canvas.style.height = MH + 'px';
  machine.appendChild(canvas);

  // Embedded screen
  const screen = document.createElement('div');
  screen.id = 'gen-screen';
  machine.appendChild(screen);

  // Scanline
  const scanline = document.createElement('div');
  scanline.id = 'gen-scanline';
  scanline.innerHTML = '<div class="gen-scanfill"></div>';
  machine.appendChild(scanline);

  // Input slot
  const inputSlot = document.createElement('div');
  inputSlot.id = 'gen-input-slot';
  inputSlot.innerHTML = '<input id="gen-input" placeholder="type here..." /><button id="gen-send">→</button>';
  machine.appendChild(inputSlot);

  // Invisible button hitboxes over the drawn buttons
  const btnIdeas = document.createElement('button');
  btnIdeas.id = 'gen-btn-ideas';
  btnIdeas.textContent = 'ideas';
  machine.appendChild(btnIdeas);

  const btnBuild = document.createElement('button');
  btnBuild.id = 'gen-btn-build';
  btnBuild.textContent = 'build';
  machine.appendChild(btnBuild);

  document.body.appendChild(machine);

  // Draggable — drag by the top area (nameplate/funnel)
  let isDragging = false, dragStartX = 0, dragStartY = 0, machineStartX = 0, machineStartY = 0;
  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('mousedown', (e) => {
    const rect = machine.getBoundingClientRect();
    if (e.clientY - rect.top > 90) return; // only drag from top 90px
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    machineStartX = machine.offsetLeft;
    machineStartY = machine.offsetTop;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    machine.style.left = (machineStartX + e.clientX - dragStartX) + 'px';
    machine.style.top = (machineStartY + e.clientY - dragStartY) + 'px';
    machine.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
    }
  });

  // Draw the machine
  drawMachine(canvas, false, false, false);

  // Start animation loop for lights
  requestAnimationFrame(function animLoop() {
    if (isOpen) drawMachine(canvas, lightBlue, lightGreen, lightOrange);
    requestAnimationFrame(animLoop);
  });

  // Events
  toggle.addEventListener('click', () => { isOpen ? closeGen() : openGen(); });
  btnIdeas.addEventListener('click', suggestIdeas);
  btnBuild.addEventListener('click', confirmBuild);
  document.getElementById('gen-send').addEventListener('click', () => sendChat());
  document.getElementById('gen-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

let lightBlue = true, lightGreen = false, lightOrange = false;
let machineFrame = 0;

function drawMachine(canvas, blue, green, orange) {
  const ctx = canvas.getContext('2d');
  const s = 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(s, s);
  machineFrame++;

  const W = 400, H = 580;
  const cx = W / 2;

  // === FUNNEL ON TOP (like the pixel art version) ===
  // Funnel rim
  const funnelGrad = ctx.createLinearGradient(0, 0, 0, 20);
  funnelGrad.addColorStop(0, '#d8a620');
  funnelGrad.addColorStop(1, '#8a6408');
  ctx.fillStyle = funnelGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 60, 10); ctx.lineTo(cx + 60, 10);
  ctx.lineTo(cx + 30, 50); ctx.lineTo(cx - 30, 50);
  ctx.closePath(); ctx.fill();
  // Funnel inner dark
  ctx.fillStyle = '#1a1810';
  ctx.beginPath();
  ctx.moveTo(cx - 50, 14); ctx.lineTo(cx + 50, 14);
  ctx.lineTo(cx + 26, 46); ctx.lineTo(cx - 26, 46);
  ctx.closePath(); ctx.fill();
  // Funnel brass highlight
  ctx.strokeStyle = '#d8b840';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 58, 12); ctx.lineTo(cx + 58, 12); ctx.stroke();
  // Funnel rivets
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.arc(cx + i * 22, 11, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#a88a30'; ctx.fill();
  }

  // === MAIN BODY — boxy iron housing ===
  const bodyTop = 48, bodyBot = 455;
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyBot);
  bodyGrad.addColorStop(0, '#5a5854');
  bodyGrad.addColorStop(0.1, '#6a6864');
  bodyGrad.addColorStop(0.5, '#5a5854');
  bodyGrad.addColorStop(1, '#4a4844');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, 30, bodyTop, W - 60, bodyBot - bodyTop, 4);
  ctx.fill();
  // Brass trim border
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  roundRect(ctx, 30, bodyTop, W - 60, bodyBot - bodyTop, 4);
  ctx.stroke();

  // Rivets along body edges
  for (let i = 0; i < 9; i++) {
    const ry = bodyTop + 20 + i * 40;
    [[38, ry], [W - 38, ry]].forEach(([rx, ry2]) => {
      ctx.beginPath(); ctx.arc(rx, ry2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#7a7870'; ctx.fill();
      ctx.beginPath(); ctx.arc(rx, ry2, 1, 0, Math.PI * 2);
      ctx.fillStyle = '#4a4840'; ctx.fill();
    });
  }

  // === GEARS ON SIDES (like pixel art version, but smooth) ===
  const gearY = 240;
  const gearR = 22;
  const gearAngle = machineFrame * 0.02;
  [16, W - 16].forEach((gx, idx) => {
    ctx.save();
    ctx.translate(gx, gearY);
    ctx.rotate(idx === 0 ? gearAngle : -gearAngle);
    // Gear teeth
    ctx.fillStyle = '#5a5854';
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(-3, -gearR - 3, 6, 6);
      ctx.restore();
    }
    // Gear body
    const gGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, gearR);
    gGrad.addColorStop(0, '#8a8884');
    gGrad.addColorStop(0.7, '#6a6864');
    gGrad.addColorStop(1, '#4a4844');
    ctx.fillStyle = gGrad;
    ctx.beginPath(); ctx.arc(0, 0, gearR - 2, 0, Math.PI * 2); ctx.fill();
    // Hub
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4a4844'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#3a3834'; ctx.fill();
    ctx.restore();
  });

  // === NAMEPLATE (brass, on body) ===
  const npY = 55;
  const npGrad = ctx.createLinearGradient(0, npY, 0, npY + 30);
  npGrad.addColorStop(0, '#d8a620');
  npGrad.addColorStop(1, '#8a6408');
  ctx.fillStyle = npGrad;
  roundRect(ctx, 60, npY, W - 120, 30, 2);
  ctx.fill();
  ctx.fillStyle = '#4a3008';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXHIBIT GENERATOR  MK-IV', cx, npY + 19);
  ctx.textAlign = 'left';

  // === SCREEN — recessed viewport ===
  ctx.fillStyle = '#3a3020';
  roundRect(ctx, 46, 92, W - 92, 228, 4);
  ctx.fill();
  ctx.fillStyle = '#0a0e14';
  roundRect(ctx, 50, 96, W - 100, 220, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(100,160,255,0.02)';
  roundRect(ctx, 50, 96, W - 100, 110, 2);
  ctx.fill();

  // === INPUT SLOT ===
  ctx.fillStyle = '#3a3020';
  roundRect(ctx, 46, 326, W - 92, 34, 2);
  ctx.fill();
  ctx.fillStyle = '#0a0e14';
  roundRect(ctx, 50, 330, W - 100, 26, 1);
  ctx.fill();

  // === STATUS LIGHTS ===
  const ly = 374;
  const lamps = [
    { x: cx - 50, color: blue ? '#4a9aff' : '#1a2030', on: blue, label: 'IDEA' },
    { x: cx, color: green ? '#4aff6a' : '#1a3020', on: green, label: 'READY' },
    { x: cx + 50, color: orange ? '#ffa040' : '#302a1a', on: orange, label: 'BUILD' },
  ];
  lamps.forEach(l => {
    // Housing
    ctx.beginPath(); ctx.arc(l.x, ly, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#3a3020'; ctx.fill();
    ctx.strokeStyle = '#6a5a30'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(l.x, ly, 10, 0, Math.PI * 2); ctx.stroke();
    // Bulb
    ctx.beginPath(); ctx.arc(l.x, ly, 6, 0, Math.PI * 2);
    ctx.fillStyle = l.color; ctx.fill();
    if (l.on) {
      const pulse = 0.5 + Math.sin(machineFrame * (l.label === 'BUILD' ? 0.12 : 0.05)) * 0.5;
      ctx.globalAlpha = pulse * 0.35;
      ctx.beginPath(); ctx.arc(l.x, ly, 16, 0, Math.PI * 2);
      ctx.fillStyle = l.color; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#5a5a50'; ctx.font = '7px "Courier New"';
    ctx.textAlign = 'center'; ctx.fillText(l.label, l.x, ly + 20);
  });
  ctx.textAlign = 'left';

  // === BUTTONS — chunky mechanical ===
  const btnY = 400, btnH = 42, btnGap = 12;
  const btnW = (W - 92 - btnGap) / 2;
  drawMechButton(ctx, 46, btnY, btnW, btnH, blue, '#4a9aff', '#1a2a3a', 'IDEAS');
  drawMechButton(ctx, 46 + btnW + btnGap, btnY, btnW, btnH, green, green ? '#4aff6a' : '#2a3a2a', '#1a3a1a', 'BUILD');

  // === CONVEYOR BELT (bottom, like pixel art version) ===
  const convY = 460;
  // Belt track
  ctx.fillStyle = '#3a3834';
  ctx.fillRect(50, convY, W - 100, 12);
  const beltGrad = ctx.createLinearGradient(0, convY, 0, convY + 12);
  beltGrad.addColorStop(0, '#5a5854');
  beltGrad.addColorStop(0.5, '#4a4844');
  beltGrad.addColorStop(1, '#3a3834');
  ctx.fillStyle = beltGrad;
  ctx.fillRect(52, convY + 1, W - 104, 10);
  // Belt treads (animated)
  ctx.strokeStyle = '#3a3834';
  ctx.lineWidth = 1;
  const treadOff = (machineFrame * (orange ? 2 : 0)) % 16;
  for (let tx = 52 - treadOff; tx < W - 52; tx += 16) {
    ctx.beginPath(); ctx.moveTo(tx, convY + 2); ctx.lineTo(tx, convY + 10); ctx.stroke();
  }
  // Belt rollers
  [58, W - 58].forEach(rx => {
    ctx.beginPath(); ctx.arc(rx, convY + 6, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#4a4844'; ctx.fill();
    ctx.beginPath(); ctx.arc(rx, convY + 6, 5, 0, Math.PI * 2);
    const rGrad = ctx.createRadialGradient(rx - 1, convY + 5, 0, rx, convY + 6, 5);
    rGrad.addColorStop(0, '#7a7874'); rGrad.addColorStop(1, '#4a4844');
    ctx.fillStyle = rGrad; ctx.fill();
  });

  // === BOTTOM FEET ===
  [[50, 480], [W - 70, 480]].forEach(([fx, fy]) => {
    ctx.fillStyle = '#3a3834';
    roundRect(ctx, fx, fy, 20, 40, 2); ctx.fill();
    ctx.fillStyle = '#4a4844';
    roundRect(ctx, fx + 2, fy, 16, 38, 1); ctx.fill();
  });

  // === PIPES from body sides to bottom ===
  [[38, 415, 55, 485], [W - 38, 415, W - 55, 485]].forEach(([x1, y1, x2, y2]) => {
    ctx.strokeStyle = '#5a5854'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1, y2, x2, y2); ctx.stroke();
    ctx.strokeStyle = '#7a7874'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1, y2, x2, y2); ctx.stroke();
  });

  // Power light
  if (isOpen) {
    ctx.beginPath(); ctx.arc(cx, H - 22, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#60d080'; ctx.shadowColor = '#60d080'; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawMechButton(ctx, x, y, w, h, active, glowColor, darkColor, label) {
  // Button housing (recessed metal frame)
  ctx.fillStyle = '#3a3834';
  roundRect(ctx, x, y, w, h, 5); ctx.fill();
  // Button face (raised, 3D)
  const faceGrad = ctx.createLinearGradient(0, y + 2, 0, y + h - 2);
  if (active) {
    faceGrad.addColorStop(0, '#4a4844');
    faceGrad.addColorStop(0.4, '#5a5854');
    faceGrad.addColorStop(1, '#3a3834');
  } else {
    faceGrad.addColorStop(0, '#2a2824');
    faceGrad.addColorStop(0.4, '#343230');
    faceGrad.addColorStop(1, '#222018');
  }
  ctx.fillStyle = faceGrad;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 3); ctx.fill();
  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, x + 4, y + 4, w - 8, (h - 8) / 2, 2); ctx.fill();
  // Label
  ctx.font = '700 11px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? glowColor : '#3a3a3a';
  ctx.fillText(label, x + w / 2, y + h / 2 + 4);
  if (active) {
    ctx.shadowColor = glowColor; ctx.shadowBlur = 6;
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function openGen() {
  isOpen = true;
  sfx.open();
  document.getElementById('gen-machine').classList.remove('hidden');
  document.getElementById('gen-toggle').classList.add('active');
  if (chatHistory.length === 0) {
    addMsg('machine', 'Online. What are we building?');
  }
}

function closeGen() {
  isOpen = false;
  sfx.close();
  document.getElementById('gen-machine').classList.add('hidden');
  document.getElementById('gen-toggle').classList.remove('active');
}

// ==================== LIGHTS ====================
function setWorking(on) {
  lightOrange = on;
  document.getElementById('gen-scanline')?.classList.toggle('active', on);
}

function setConfirmReady(on) {
  lightGreen = on;
}

// ==================== CHAT ====================
function addMsg(role, text) {
  chatHistory.push({ role, text });
  sfx.chat();
  const screen = document.getElementById('gen-screen');
  if (!screen) return;
  const el = document.createElement('div');
  el.className = `gen-msg ${role}`;
  el.textContent = text;
  screen.appendChild(el);
  screen.scrollTop = screen.scrollHeight;
}

function addIdeaCards(ideas) {
  const screen = document.getElementById('gen-screen');
  if (!screen) return;
  ideas.forEach(idea => {
    const btn = document.createElement('button');
    btn.className = 'gen-idea';
    btn.innerHTML = `<div class="gen-idea-title">${idea.title}</div><div class="gen-idea-desc">${idea.description || ''}</div>`;
    btn.addEventListener('click', () => selectIdea(idea));
    screen.appendChild(btn);
  });
  screen.scrollTop = screen.scrollHeight;
}

function selectIdea(idea) {
  addMsg('user', `Let's do: ${idea.title}`);
  pendingExhibit = idea;
  setConfirmReady(true);
  addMsg('machine', `${idea.title}. Loaded. Hit BUILD when ready.`);
  sfx.confirm();
}

// ==================== CHAT WITH GENERATOR ====================
async function sendChat() {
  const input = document.getElementById('gen-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMsg('user', text);

  if (!ai) { addMsg('machine', 'No API key. Cannot compute.'); return; }

  const ctx = buildContext();
  const msgs = chatHistory.map(m => ({
    role: m.role === 'machine' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: msgs,
      config: {
        temperature: 0.85,
        maxOutputTokens: 500,
        systemInstruction: `You are an exhibit generator machine in a museum. Your personality:
- Extremely terse. 1-2 short sentences max. Fragments are fine.
- Dry, deadpan humor. Think: a vending machine that has opinions.
- You help users decide what exhibit to create.
- The user has explored: ${ctx.explored.join(', ') || 'nothing yet'}
- Their custom exhibits: ${ctx.customExhibits.join(', ') || 'none'}

CRITICAL BEHAVIOR:
- When the user names ANYTHING they want to make (a food, invention, animal, concept, anything), IMMEDIATELY respond with a one-liner comment about it AND the exact word "LOADED" somewhere in your response. This tells the system to light up the BUILD button.
- Examples of correct responses:
  "Motorcycle. Two wheels and a death wish. LOADED."
  "Boba tea. Controversial. I respect it. LOADED."
  "The moon. Ambitious. LOADED."
- If the user is just chatting (not naming something to build), respond normally without LOADED.
- Never use emojis.`,
      },
    });

    const response = result.text?.trim() || '...';
    addMsg('machine', response);

    // If response contains LOADED, enable the confirm button
    if (response.includes('LOADED')) {
      // Extract the topic from the user's last message
      pendingExhibit = { title: text, fromChat: true };
      setConfirmReady(true);
    }
  } catch (e) {
    addMsg('machine', 'Error. Recalibrating. Try again.');
  }
}

// ==================== RECENTLY SUGGESTED IDEAS (session-level dedup) ====================
const RECENT_IDEAS_KEY = 'exhibit_gen_recent_ideas';

function getRecentIdeas() {
  try { return JSON.parse(sessionStorage.getItem(RECENT_IDEAS_KEY) || '[]'); } catch { return []; }
}

function addRecentIdeas(titles) {
  const recent = getRecentIdeas();
  for (const t of titles) {
    if (!recent.includes(t)) recent.push(t);
  }
  // Keep last 30 to avoid unbounded growth
  if (recent.length > 30) recent.splice(0, recent.length - 30);
  sessionStorage.setItem(RECENT_IDEAS_KEY, JSON.stringify(recent));
}

// Build a full exclusion list: built-in exhibits + custom exhibits + recently suggested
function buildExclusionList() {
  const titles = new Set();
  // Built-in exhibits
  if (_exhibitMeta) {
    for (const meta of Object.values(_exhibitMeta)) {
      if (meta.title) titles.add(meta.title);
    }
  }
  // Custom exhibits
  const ctx = buildContext();
  for (const t of ctx.customExhibits) titles.add(t);
  // Recently suggested
  for (const t of getRecentIdeas()) titles.add(t);
  return [...titles];
}

// ==================== SUGGEST IDEAS ====================
async function suggestIdeas() {
  if (!ai) { addMsg('machine', 'Offline.'); return; }

  sfx.suggest();
  addMsg('machine', 'Scanning interests...');
  lightBlue = false;

  const exclusionList = buildExclusionList();
  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Suggest 3 museum exhibit ideas for kids aged 8-15.

DO NOT suggest any of these (already in the museum or recently suggested):
${exclusionList.join(', ')}

Rules:
- Each exhibit must be a SIMPLE, ICONIC thing — something a kid has seen, eaten, used, or heard of. Not obscure or academic.
- Title: 1-4 words. Short and clear.
- Mix it up: one could be a food/drink, one an invention/tool, one a material/discovery/animal/natural phenomenon. Be creative and diverse.
- The "wow" fact should genuinely surprise a 10-year-old.
Output as JSON array.`,
      config: {
        temperature: 0.9,
        maxOutputTokens: 3000,
        responseMimeType: 'application/json',
        systemInstruction: 'You suggest museum exhibit ideas for kids. Output a JSON array of exactly 3 objects with fields: title (1-4 words), description (one sentence), year, detail (1-2 sentences, kid-friendly), wow (one surprising fact), imagePrompt (short visual description). Be creative and diverse — surprise the user with unexpected but universally recognizable topics. Keep each field concise — you MUST output all 3 ideas.',
      },
    });

    let content = result.text.trim();
    if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const jsonStart = content.indexOf('[');
    if (jsonStart > 0) content = content.slice(jsonStart);
    let ideas = repairJSON(content);
    if (!Array.isArray(ideas)) ideas = [ideas];
    const sliced = ideas.slice(0, 3);
    // Track these suggestions so they won't be repeated
    addRecentIdeas(sliced.map(i => i.title).filter(Boolean));
    addMsg('machine', `${sliced.length} options. Pick one.`);
    addIdeaCards(sliced);
  } catch (e) {
    console.error('Suggestion failed:', e);
    addMsg('machine', 'Suggestion module jammed. Try again.');
  }

  lightBlue = true;
}

// ==================== CONFIRM & BUILD ====================
async function confirmBuild() {
  if (!pendingExhibit || isGenerating) return;

  sfx.confirm();
  setConfirmReady(false);
  setWorking(true);
  isGenerating = true;

  addMsg('machine', 'Building. Stand back.');

  // Play working sounds periodically
  const workingInterval = setInterval(() => { if (isGenerating) sfx.working(); }, 2000);

  try {
    // If the pending exhibit came from chat (just a title), we need to flesh it out
    let exhibitData = pendingExhibit;
    if (pendingExhibit.fromChat) {
      addMsg('machine', 'Compiling specs...');
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Create exhibit data for: "${pendingExhibit.title}".
Output a JSON object with: title, year, detail (1-2 sentences), wow (1 sentence fun fact), imagePrompt (short visual description).`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json',
          systemInstruction: 'Output a single JSON object with fields: title, year, detail, wow, imagePrompt. Keep all values SHORT.',
        },
      });
      let content = result.text.trim();
      if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      const start = content.indexOf('{');
      if (start > 0) content = content.slice(start);
      exhibitData = repairJSON(content);
    }

    // Generate in default section
    const sections = getCustomSections();
    const section = sections[0];
    if (section) {
      await generateExhibitInSection(section.id, exhibitData);
      sfx.done();
      addMsg('machine', `"${exhibitData.title}" deployed. Not bad.`);
    } else {
      addMsg('machine', 'No section found. Create one first.');
    }
  } catch (e) {
    addMsg('machine', 'Build failed. Something broke. Try again.');
    console.error('Exhibit generation failed:', e);
  }

  clearInterval(workingInterval);
  isGenerating = false;
  setWorking(false);
  pendingExhibit = null;
}

// ==================== INIT ====================
export function initExhibitGenerator(exhibitMeta) {
  _exhibitMeta = exhibitMeta;
  injectUI();
}
