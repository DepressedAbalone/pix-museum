// ==================== CUSTOM MUSEUM MODULE ====================
// Lets users create their own museum sections with AI-generated exhibits,
// guided by Pix — a tamagotchi-style companion character.

import { GoogleGenAI, Modality } from '@google/genai';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// ==================== PIXEL DRAWING PRIMITIVES (local copy) ====================
const P = 3;

function drawPixelCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r)
        ctx.fillRect((cx + x) * P, (cy + y) * P, P, P);
}

function drawPixelEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1)
        ctx.fillRect((cx + x) * P, (cy + y) * P, P, P);
}

function drawPixelRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      ctx.fillRect((x + dx) * P, (y + dy) * P, P, P);
}

function drawPixelLine(ctx, x0, y0, x1, y1, color, thickness = 1) {
  ctx.fillStyle = color;
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  while (true) {
    for (let t = 0; t < thickness; t++) {
      ctx.fillRect((x0 + t) * P, y0 * P, P, P);
      ctx.fillRect(x0 * P, (y0 + t) * P, P, P);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function drawPx(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * P, y * P, P, P);
}

// ==================== STORAGE ====================
const STORAGE_KEY = 'invention_museum_custom';

// Emergency reset: add ?reset-custom to the URL to clear all custom data
if (window.location.search.includes('reset-custom')) {
  localStorage.removeItem(STORAGE_KEY);
  console.warn('Custom museum data cleared via URL parameter');
  window.history.replaceState({}, '', window.location.pathname);
}

function loadCustomData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { sections: [] };
}

function saveCustomData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data || customData));
}

let customData = loadCustomData();

// ==================== PIX CHARACTER (Hoopa-inspired floating blue creature) ====================
// Rugby-shaped head, big cute eyes, cartoon-poop swirl on top, tiny stubby arms, NO legs (floats).
// ~30x35 pixel grid (90x105 real pixels at P=3)

const PIX_W = 30, PIX_H = 35;
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export function drawPix(ctx, state, frame) {
  const s = state || 'idle';
  const f = frame || 0;

  // Colors
  const body = '#5090d0';       // Blue body
  const bodyHi = '#70b0f0';     // Highlight
  const bodyDk = '#3870a8';     // Shadow
  const swirl = '#4080c0';      // Swirl (slightly different blue)
  const swirlHi = '#60a0e0';
  const eye = '#1a1a1a';
  const eyeWhite = '#ffffff';
  const mouth = '#2a4060';
  const cheek = '#f090a0';

  // Float offset — gentle sine bob (Pix always floats, never touches ground)
  const floatY = Math.round(Math.sin(f * 0.08) * 2);
  // Bounce state: more exaggerated bob
  const bounceY = (s === 'bounce') ? Math.round(Math.abs(Math.sin(f * 0.2)) * 4) : 0;
  // Look state: lean to one side
  const lookX = (s === 'look') ? Math.round(Math.sin(f * 0.06) * 2) : 0;
  // Slight horizontal sway for idle
  const floatX = Math.round(Math.sin(f * 0.05) * 0.5);
  const bx = 15 + floatX + lookX; // center X
  const by = 14 + floatY - bounceY; // center Y

  // --- Shadow on ground (faint, moves with float height) ---
  ctx.globalAlpha = 0.12 - floatY * 0.01;
  drawPixelEllipse(ctx, 15, 32, 6, 2, '#000');
  ctx.globalAlpha = 1;

  // --- Poop-swirl on top of head ---
  // Base of swirl (sits on head)
  drawPixelEllipse(ctx, bx, by - 8, 3, 2, swirl);
  // Swirl curl — a tapered spiral going up
  drawPixelRect(ctx, bx + 1, by - 10, 2, 2, swirl);
  drawPixelRect(ctx, bx + 2, by - 12, 2, 2, swirlHi);
  drawPixelRect(ctx, bx + 1, by - 13, 2, 2, swirlHi);
  drawPixelRect(ctx, bx - 1, by - 13, 2, 1, swirl);
  // Tip
  drawPx(ctx, bx, by - 14, swirlHi);
  // Highlight on swirl
  drawPx(ctx, bx + 2, by - 11, '#80c0f0');

  // --- Head/Body (rugby/egg shape — wider horizontally) ---
  drawPixelEllipse(ctx, bx, by, 10, 8, body);
  drawPixelEllipse(ctx, bx, by - 1, 9, 7, bodyHi);
  // Belly sheen
  drawPixelEllipse(ctx, bx, by + 1, 5, 4, '#80c0f0');

  // --- Eyes (BIG cute eyes — key feature) ---
  // Eye whites (large ovals)
  drawPixelEllipse(ctx, bx - 4, by - 1, 3, 3, eyeWhite);
  drawPixelEllipse(ctx, bx + 4, by - 1, 3, 3, eyeWhite);

  if (s === 'talk') {
    // Talking: alternating happy squint and open
    if (f % 8 < 4) {
      // Happy ^_^
      drawPixelRect(ctx, bx - 5, by - 1, 3, 1, eye);
      drawPixelRect(ctx, bx + 3, by - 1, 3, 1, eye);
    } else {
      // Open excited
      drawPixelCircle(ctx, bx - 4, by - 1, 2, eye);
      drawPixelCircle(ctx, bx + 4, by - 1, 2, eye);
      drawPx(ctx, bx - 5, by - 2, eyeWhite); // big shine
      drawPx(ctx, bx - 4, by - 3, eyeWhite);
      drawPx(ctx, bx + 3, by - 2, eyeWhite);
      drawPx(ctx, bx + 4, by - 3, eyeWhite);
    }
  } else if (s === 'listen') {
    // Big wide curious eyes
    drawPixelCircle(ctx, bx - 4, by - 1, 2, eye);
    drawPixelCircle(ctx, bx + 4, by - 1, 2, eye);
    // Extra big shine (curious sparkle)
    drawPx(ctx, bx - 5, by - 2, eyeWhite);
    drawPx(ctx, bx - 4, by - 3, eyeWhite);
    drawPx(ctx, bx - 5, by - 3, eyeWhite);
    drawPx(ctx, bx + 3, by - 2, eyeWhite);
    drawPx(ctx, bx + 4, by - 3, eyeWhite);
    drawPx(ctx, bx + 3, by - 3, eyeWhite);
  } else if (f % 50 < 3) {
    // Blink
    drawPixelRect(ctx, bx - 5, by - 1, 3, 1, eye);
    drawPixelRect(ctx, bx + 3, by - 1, 3, 1, eye);
  } else {
    // Normal big pupils
    drawPixelCircle(ctx, bx - 4, by - 1, 2, eye);
    drawPixelCircle(ctx, bx + 4, by - 1, 2, eye);
    // Shine
    drawPx(ctx, bx - 5, by - 2, eyeWhite);
    drawPx(ctx, bx + 3, by - 2, eyeWhite);
  }

  // --- Mouth ---
  if (s === 'talk') {
    if (f % 6 < 3) {
      // Open mouth
      drawPixelEllipse(ctx, bx, by + 3, 2, 2, mouth);
      drawPixelRect(ctx, bx - 1, by + 2, 2, 1, '#e06070'); // tongue
    } else {
      // Smile
      drawPx(ctx, bx - 2, by + 3, mouth);
      drawPx(ctx, bx - 1, by + 4, mouth);
      drawPx(ctx, bx, by + 4, mouth);
      drawPx(ctx, bx + 1, by + 4, mouth);
      drawPx(ctx, bx + 2, by + 3, mouth);
    }
  } else if (s === 'listen') {
    // Small 'o'
    drawPixelCircle(ctx, bx, by + 3, 1, mouth);
  } else {
    // Default smile (curved)
    drawPx(ctx, bx - 2, by + 3, mouth);
    drawPx(ctx, bx - 1, by + 4, mouth);
    drawPx(ctx, bx, by + 4, mouth);
    drawPx(ctx, bx + 1, by + 4, mouth);
    drawPx(ctx, bx + 2, by + 3, mouth);
  }

  // --- Blush ---
  ctx.globalAlpha = 0.2;
  drawPixelCircle(ctx, bx - 7, by + 2, 2, cheek);
  drawPixelCircle(ctx, bx + 7, by + 2, 2, cheek);
  ctx.globalAlpha = 1;

  // --- Tiny stubby arms (no legs — Pix floats!) ---
  const armWave = (s === 'wave') ? -3 : 0;
  const armTalk = (s === 'talk' && f % 8 < 4) ? -1 : 0;
  // Left arm
  drawPixelRect(ctx, bx - 10, by + armTalk, 2, 3, bodyDk);
  drawPx(ctx, bx - 10, by + 3 + armTalk, body);
  // Right arm
  if (s === 'wave') {
    // Waving
    drawPixelRect(ctx, bx + 9, by - 3 + (f % 2), 2, 3, bodyDk);
    drawPx(ctx, bx + 9, by - 4 + (f % 2), body);
  } else if (s === 'work') {
    // Arms forward
    drawPixelRect(ctx, bx + 9, by - 1, 3, 2, bodyDk);
    drawPixelRect(ctx, bx + 12, by - 2, 2, 2, bodyDk);
  } else {
    drawPixelRect(ctx, bx + 9, by + armTalk, 2, 3, bodyDk);
    drawPx(ctx, bx + 9, by + 3 + armTalk, body);
  }

  // --- Emote particles ---
  if (s === 'talk' && f % 10 < 5) {
    // Musical note / speech sparkles
    drawPx(ctx, bx + 10, by - 6, '#80c0f0');
    drawPx(ctx, bx + 12, by - 8, '#a0d8ff');
    drawPx(ctx, bx + 11, by - 5, '#60a0d0');
  }
  if (s === 'listen') {
    // "?" sparkle
    drawPx(ctx, bx + 10, by - 7, '#f0c848');
    drawPx(ctx, bx + 10, by - 9, '#f0c848');
    drawPx(ctx, bx + 11, by - 10, '#f0c848');
    drawPx(ctx, bx + 10, by - 5, '#f0c848');
  }
  if (s === 'wave' && f % 4 < 2) {
    // Sparkles near hand
    drawPx(ctx, bx + 12, by - 5, '#f0e060');
    drawPx(ctx, bx + 13, by - 7, '#f0e060');
  }
  if (s === 'idle' && f % 60 < 3) {
    // Occasional idle sparkle (zzz or star)
    drawPx(ctx, bx + 9, by - 8, '#a0c0e0');
    drawPx(ctx, bx + 10, by - 10, '#80a0c0');
  }
  if (s === 'look') {
    // "Looking around" — little sparkle dots where Pix is looking
    const lookDir = Math.sin(f * 0.06) > 0 ? 1 : -1;
    drawPx(ctx, bx + lookDir * 12, by - 3, '#d0e0f0');
    drawPx(ctx, bx + lookDir * 13, by - 5, '#a0c0e0');
  }
  if (s === 'bounce') {
    // Happy sparkles during bounce
    if (f % 6 < 3) {
      drawPx(ctx, bx - 8, by - 6, '#f0e060');
      drawPx(ctx, bx + 8, by - 8, '#f0e060');
      drawPx(ctx, bx, by - 12, '#f0c848');
    }
  }
  if ((s === 'walk_r' || s === 'walk_l') && f % 8 < 4) {
    // Motion trail dots behind Pix when walking
    const dir = (s === 'walk_r') ? -1 : 1;
    drawPx(ctx, bx + dir * 10, by + 2, '#a0c0e0');
    drawPx(ctx, bx + dir * 12, by + 1, '#80a0c0');
  }
}

// ==================== PIX ANIMATION & FLOATING ====================
const pixInstances = [];

function createPixInstance(sectionId, sectionX, sectionWidth) {
  const startX = 60;
  return {
    sectionId,
    sectionBaseX: sectionX,
    sectionWidth,
    x: startX,
    y: 540, // floating above the floor
    targetX: startX,
    state: 'idle',
    frame: 0,
    wanderTimer: 0,
    el: null, cvs: null, ctx: null,
    isTalking: false,
  };
}

function updatePixAnimation(pix) {
  pix.frame++;

  if (pix.isTalking) return;

  // Stationary by default. Only walk occasionally.
  if (pix.state === 'walk_r' || pix.state === 'walk_l') {
    // Walking to a target
    const dx = pix.targetX - pix.x;
    if (Math.abs(dx) > 2) {
      pix.x += dx > 0 ? 0.5 : -0.5;
    } else {
      pix.state = 'idle';
      pix.wanderTimer = 600 + Math.floor(Math.random() * 600); // long pause after arriving
    }
    return;
  }

  // Idle behavior — diverse sub-animations
  pix.wanderTimer--;

  if (pix.wanderTimer <= 0 && pix.state === 'idle') {
    // Pick a random idle action or start walking
    const roll = Math.random();
    if (roll < 0.15) {
      // Walk to a new spot (rare)
      const minX = 30;
      const maxX = Math.min(pix.sectionWidth - 60, 400);
      pix.targetX = minX + Math.floor(Math.random() * (maxX - minX));
      pix.state = (pix.targetX > pix.x) ? 'walk_r' : 'walk_l';
    } else if (roll < 0.35) {
      // Wave
      pix.state = 'wave';
      setTimeout(() => { if (!pix.isTalking) pix.state = 'idle'; }, 1500);
      pix.wanderTimer = 200 + Math.floor(Math.random() * 200);
    } else if (roll < 0.55) {
      // Look around (uses 'look' state — same as idle but drawPix checks frame for look anim)
      pix.state = 'look';
      setTimeout(() => { if (!pix.isTalking) pix.state = 'idle'; }, 2000);
      pix.wanderTimer = 250 + Math.floor(Math.random() * 200);
    } else if (roll < 0.70) {
      // Bounce (uses 'bounce' state)
      pix.state = 'bounce';
      setTimeout(() => { if (!pix.isTalking) pix.state = 'idle'; }, 1200);
      pix.wanderTimer = 300 + Math.floor(Math.random() * 200);
    } else {
      // Just stay idle longer
      pix.wanderTimer = 150 + Math.floor(Math.random() * 300);
    }
  }
}

function renderPixFrame(pix) {
  if (!pix.cvs || !pix.ctx) return;
  pix.ctx.clearRect(0, 0, pix.cvs.width, pix.cvs.height);
  drawPix(pix.ctx, pix.state, pix.frame);
  if (pix.el) {
    pix.el.style.left = Math.round(pix.sectionBaseX + pix.x) + 'px';
  }
}

let pixAnimRunning = false;
function startPixAnimLoop() {
  if (pixAnimRunning) return;
  pixAnimRunning = true;
  function loop() {
    for (const pix of pixInstances) {
      updatePixAnimation(pix);
      renderPixFrame(pix);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function stopPixTalking(pix) {
  pix.isTalking = false;
  pix.state = 'idle';
}

function startPixTalking(pix) {
  pix.isTalking = true;
  pix.state = 'listen';
}

function setPixState(pix, state) {
  pix.state = state;
}

// ==================== PIX GEMINI LIVE API (voice chat) ====================
let pixLiveSession = null;
let pixInputAudioCtx = null;
let pixOutputAudioCtx = null;
let pixNextStartTime = 0;
let pixAudioSources = new Set();
let pixMicStream = null;
let pixAudioProcessor = null;
let pixAudioSourceNode = null;

async function startPixLiveSession(sectionId, pixInstance) {
  if (!ai) return;
  if (pixLiveSession) stopPixLiveSession(); // close any existing

  try {
    pixInputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    pixOutputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    await pixInputAudioCtx.resume();
    await pixOutputAudioCtx.resume();
    pixMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sec = customData.sections.find(s => s.id === sectionId);
    const existingExhibits = (sec?.exhibits || []).map(e => e.title).join(', ') || 'none yet';
    const chatHistory = getChatHistory(sectionId);
    const recentChat = chatHistory.slice(-6).map(m => `${m.role === 'pix' ? 'Pix' : 'User'}: ${m.text}`).join('\n');

    const systemInstruction = `You are Pix — a small blue creature who lives in a museum. You're knowledgeable about inventions and history, but you're a FRIEND first.

You're in the user's personal museum section called "${sec?.title || 'My Exhibits'}".
Their current exhibits: ${existingExhibits}.
${recentChat ? `\nRecent conversation:\n${recentChat}` : ''}

## How you talk
- Just talk naturally. NEVER prefix your speech with labels, headers, or stage directions like "**Greeting**" or "[warmly]". Just speak directly.
- Warm, curious, genuinely excited about what the user wants to build
- Concise — 1-3 sentences. You're chatting, not lecturing.
- You help them brainstorm and create exhibits

## Creating exhibits
When the conversation reaches a point where you have a clear idea of what exhibit to create, proactively suggest it. Say something like "Want me to make that into an exhibit?" or "Should I fire up the machine for that?"
When the user confirms, say something like "Alright, firing up the machine!" or "Creating it now!" — use natural speech.
IMPORTANT: Just speak naturally. Do NOT try to say JSON or structured data. The system will handle the technical side automatically when it detects you're creating something.

## Rules
- Keep responses SHORT for voice — under 15 seconds of speech
- Use English
- NEVER use markdown formatting, bold text, or headers
- When confirming exhibit creation, include the phrase "firing up the machine" or "creating it now" so the system knows to start generating`;

    const session = await ai.live.connect({
      model: GEMINI_LIVE_MODEL,
      callbacks: {
        onopen: () => {
          pixAudioSourceNode = pixInputAudioCtx.createMediaStreamSource(pixMicStream);
          pixAudioProcessor = pixInputAudioCtx.createScriptProcessor(4096, 1, 1);
          pixAudioProcessor.onaudioprocess = (e) => {
            if (!pixLiveSession) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            pixLiveSession.sendRealtimeInput({ media: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } });
          };
          pixAudioSourceNode.connect(pixAudioProcessor);
          pixAudioProcessor.connect(pixInputAudioCtx.destination);

          // Pix greets the user
          setTimeout(() => {
            if (!pixLiveSession) return;
            pixLiveSession.sendRealtimeInput({ text: 'Say hi to the user in 1 sentence. No labels or headers, just speak naturally.' });
            if (pixInstance) setPixState(pixInstance, 'talk');
          }, 0);
        },
        onmessage: async (message) => {
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio && pixOutputAudioCtx) {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const usableLen = bytes.byteLength - (bytes.byteLength % 2);
            const dataInt16 = new Int16Array(bytes.buffer, bytes.byteOffset, usableLen / 2);
            const buffer = pixOutputAudioCtx.createBuffer(1, dataInt16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
            pixNextStartTime = Math.max(pixNextStartTime, pixOutputAudioCtx.currentTime);
            const source = pixOutputAudioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(pixOutputAudioCtx.destination);
            source.addEventListener('ended', () => pixAudioSources.delete(source));
            source.start(pixNextStartTime);
            pixNextStartTime += buffer.duration;
            pixAudioSources.add(source);
            // Pix is talking
            if (pixInstance) setPixState(pixInstance, 'talk');
          }
          // Handle audio transcription (outputAudioTranscription side-channel)
          const transcription = message.serverContent?.outputTranscription?.text;
          if (transcription) {
            let txt = transcription;

            // Detect exhibit creation intent via natural language keywords
            const creationPhrases = ['firing up the machine', 'creating it now', 'let me create', 'building it', 'making it now', 'consider it created', 'generating the exhibit', 'here it comes'];
            const lowerTxt = txt.toLowerCase();
            const isCreating = creationPhrases.some(p => lowerTxt.includes(p));

            if (isCreating && !_isGeneratingExhibit) {
              _isGeneratingExhibit = true;
              // Extract exhibit details via a SEPARATE text API call using conversation context
              extractAndCreateExhibit(sectionId, pixInstance).finally(() => {
                _isGeneratingExhibit = false;
              });
            }

            // Display transcription in chat
            if (txt.trim()) {
              // Strip any accidental CREATING_EXHIBIT text
              txt = txt.replace(/CREATING_EXHIBIT[\s\S]*?}/g, '').trim();
              if (!txt) return;

              const history = getChatHistory(sectionId);
              const last = history[history.length - 1];
              if (last && last.role === 'pix' && Date.now() - (last._ts || 0) < 3000) {
                last.text += ' ' + txt.trim();
                last._ts = Date.now();
                const messagesDiv = chatPanel?.querySelector('.pix-chat-messages');
                const lastEl = messagesDiv?.querySelector('.pix-chat-msg:last-child');
                if (lastEl && lastEl.classList.contains('pix')) lastEl.textContent = last.text;
              } else {
                const msg = { role: 'pix', text: txt.trim(), _ts: Date.now() };
                history.push(msg);
                const messagesDiv = chatPanel?.querySelector('.pix-chat-messages');
                if (messagesDiv) {
                  appendMessageEl(messagesDiv, msg);
                  messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
              }
              saveChatHistory(sectionId);
            }
          }
          if (message.serverContent?.interrupted) {
            pixAudioSources.forEach(s => { try { s.stop(); } catch {} });
            pixAudioSources.clear();
            pixNextStartTime = 0;
          }
          if (message.serverContent?.turnComplete) {
            if (pixInstance) setPixState(pixInstance, 'listen');
          }
        },
        onerror: (e) => console.error("Pix Live API Error", e),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        outputAudioTranscription: {},
        systemInstruction,
      }
    });

    pixLiveSession = session;
  } catch (err) {
    console.error('Pix Live session failed:', err);
  }
}

function stopPixLiveSession() {
  if (pixAudioProcessor) { pixAudioProcessor.onaudioprocess = null; try { pixAudioProcessor.disconnect(); } catch {} pixAudioProcessor = null; }
  if (pixAudioSourceNode) { try { pixAudioSourceNode.disconnect(); } catch {} pixAudioSourceNode = null; }
  if (pixLiveSession) { try { pixLiveSession.close(); } catch {} pixLiveSession = null; }
  if (pixMicStream) { pixMicStream.getTracks().forEach(t => t.stop()); pixMicStream = null; }
  pixAudioSources.forEach(s => { try { s.stop(); } catch {} });
  pixAudioSources.clear();
  if (pixInputAudioCtx) { try { pixInputAudioCtx.close(); } catch {} pixInputAudioCtx = null; }
  if (pixOutputAudioCtx) { try { pixOutputAudioCtx.close(); } catch {} pixOutputAudioCtx = null; }
  pixNextStartTime = 0;
}

// ==================== GENERATOR MACHINE DRAWER ====================
export function drawGeneratorMachine(ctx, hover) {
  // ~60x50 pixel grid => 180x150 real pixels at P=3
  const brass = '#b8860b';
  const brassHi = '#d8a620';
  const brassDk = '#8a6408';
  const iron = '#6a6a6a';
  const ironHi = '#8a8a8a';
  const ironDk = '#4a4a4a';
  const wood = '#8a6a40';
  const woodHi = '#a88a58';
  const woodDk = '#6a4a28';

  // --- Wooden base platform ---
  drawPixelRect(ctx, 5, 42, 50, 5, wood);
  drawPixelRect(ctx, 6, 42, 48, 2, woodHi);
  drawPixelRect(ctx, 5, 46, 50, 2, woodDk);
  // Wood grain
  for (let i = 0; i < 8; i++) {
    drawPixelRect(ctx, 8 + i * 6, 43, 4, 1, woodDk);
  }

  // --- Machine body (boxy) ---
  drawPixelRect(ctx, 10, 20, 30, 22, iron);
  drawPixelRect(ctx, 11, 21, 28, 20, ironHi);
  drawPixelRect(ctx, 12, 22, 26, 18, '#787878');
  // Machine front panel details
  drawPixelRect(ctx, 14, 24, 8, 6, ironDk);
  drawPixelRect(ctx, 15, 25, 6, 4, '#3a3a3a');
  // Indicator lights
  drawPixelCircle(ctx, 16, 26, 1, hover ? '#40d040' : '#306030');
  drawPixelCircle(ctx, 20, 26, 1, hover ? '#f0c020' : '#806020');
  // Pressure gauge
  drawPixelCircle(ctx, 30, 27, 3, '#d0c8b0');
  drawPixelCircle(ctx, 30, 27, 2, '#f0e8d0');
  drawPx(ctx, 30, 26, '#c03020');
  drawPx(ctx, 30, 27, '#1a1a1a');

  // --- Brass trim ---
  drawPixelRect(ctx, 10, 20, 30, 1, brass);
  drawPixelRect(ctx, 10, 41, 30, 1, brass);
  drawPixelRect(ctx, 10, 20, 1, 22, brass);
  drawPixelRect(ctx, 39, 20, 1, 22, brass);
  // Brass corner rivets
  for (const [rx, ry] of [[11, 21], [38, 21], [11, 40], [38, 40]]) {
    drawPx(ctx, rx, ry, brassHi);
  }

  // --- Funnel on top ---
  // Funnel base
  drawPixelRect(ctx, 20, 16, 10, 4, brass);
  drawPixelRect(ctx, 21, 17, 8, 2, brassHi);
  // Funnel flare
  drawPixelRect(ctx, 16, 10, 18, 2, brass);
  drawPixelRect(ctx, 17, 11, 16, 1, brassHi);
  // Funnel sides
  drawPixelLine(ctx, 16, 10, 20, 16, brass, 1);
  drawPixelLine(ctx, 33, 10, 29, 16, brass, 1);
  drawPixelLine(ctx, 17, 10, 21, 16, brassHi, 1);
  drawPixelLine(ctx, 32, 10, 28, 16, brassDk, 1);
  // Funnel rim
  drawPixelRect(ctx, 14, 8, 22, 2, brass);
  drawPixelRect(ctx, 15, 8, 20, 1, brassHi);
  // Inner funnel dark
  drawPixelRect(ctx, 18, 10, 14, 2, '#2a2018');

  // --- Gears on sides ---
  const gearOff = hover ? 1 : 0;

  // Left gear
  ctx.save();
  ctx.translate(8 * P, 32 * P);
  if (hover) ctx.rotate(0.3);
  drawPixelCircle(ctx, 0, 0, 5, iron);
  drawPixelCircle(ctx, 0, 0, 4, ironHi);
  drawPixelCircle(ctx, 0, 0, 2, ironDk);
  drawPx(ctx, 0, 0, iron);
  // Gear teeth
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    drawPx(ctx, Math.round(5 * Math.cos(a)), Math.round(5 * Math.sin(a)), ironDk);
  }
  ctx.restore();

  // Right gear (smaller)
  ctx.save();
  ctx.translate(44 * P, 34 * P);
  if (hover) ctx.rotate(-0.4);
  drawPixelCircle(ctx, 0, 0, 4, brass);
  drawPixelCircle(ctx, 0, 0, 3, brassHi);
  drawPixelCircle(ctx, 0, 0, 1, brassDk);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    drawPx(ctx, Math.round(4 * Math.cos(a)), Math.round(4 * Math.sin(a)), brassDk);
  }
  ctx.restore();

  // --- Conveyor belt coming out right side ---
  drawPixelRect(ctx, 40, 38, 18, 3, ironDk);
  drawPixelRect(ctx, 40, 38, 18, 1, ironHi);
  // Conveyor rollers
  for (let i = 0; i < 4; i++) {
    const rx = 42 + i * 4 + gearOff;
    drawPixelCircle(ctx, rx, 40, 1, iron);
  }
  // Conveyor belt texture
  for (let i = 0; i < 6; i++) {
    drawPx(ctx, 41 + i * 3, 39, '#3a3a3a');
  }

  // --- Steam/smoke on hover ---
  if (hover) {
    ctx.globalAlpha = 0.4;
    drawPixelCircle(ctx, 25, 5, 3, '#d8d8d8');
    drawPixelCircle(ctx, 22, 2, 3, '#e0e0e0');
    drawPixelCircle(ctx, 28, 1, 2, '#ddd');
    ctx.globalAlpha = 0.2;
    drawPixelCircle(ctx, 20, -1, 3, '#eee');
    ctx.globalAlpha = 1;

    // Glow from indicator
    ctx.globalAlpha = 0.15;
    drawPixelCircle(ctx, 16, 26, 4, '#40d040');
    ctx.globalAlpha = 1;
  }

  // --- Legs/feet ---
  drawPixelRect(ctx, 12, 47, 3, 3, ironDk);
  drawPixelRect(ctx, 35, 47, 3, 3, ironDk);
}

// ==================== CHAT PANEL ====================
let chatPanel = null;
let chatHistory = {}; // per-section chat history
let activeChatSection = null;

function getChatHistory(sectionId) {
  if (!chatHistory[sectionId]) {
    // Load from custom data
    const sec = customData.sections.find(s => s.id === sectionId);
    chatHistory[sectionId] = sec?.chatHistory || [];
  }
  return chatHistory[sectionId];
}

function saveChatHistory(sectionId) {
  const sec = customData.sections.find(s => s.id === sectionId);
  if (sec) {
    sec.chatHistory = chatHistory[sectionId] || [];
    saveCustomData(customData);
  }
}

function createChatPanel() {
  if (chatPanel) return chatPanel;

  chatPanel = document.createElement('div');
  chatPanel.id = 'pix-chat-panel';
  chatPanel.innerHTML = `
    <div class="pix-chat-header">
      <span class="pix-chat-title">Chat with Pix</span>
      <button class="pix-chat-close">&times;</button>
    </div>
    <div class="pix-chat-messages"></div>
    <div class="pix-chat-input-row">
      <input type="text" class="pix-chat-input" placeholder="Tell Pix what you want to build..." />
      <button class="pix-chat-send">Send</button>
    </div>
  `;

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #pix-chat-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100vh;
      background: #faf6ee;
      z-index: 150;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 24px rgba(0,0,0,0.2);
      font-family: 'Georgia', serif;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }
    #pix-chat-panel.open { transform: translateX(0); }
    .pix-chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      background: rgba(0,0,0,0.02);
    }
    .pix-chat-title {
      font-size: 14px; font-weight: 700; color: #2a2420;
      letter-spacing: 0.5px;
    }
    .pix-chat-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: #8a7e72;
    }
    .pix-chat-close:hover { color: #2a2420; }
    .pix-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .pix-chat-msg {
      max-width: 85%; padding: 10px 14px;
      border-radius: 12px; font-size: 13px; line-height: 1.6;
    }
    .pix-chat-msg.pix {
      align-self: flex-start;
      background: #e8dcc8; color: #2a2420;
      border-bottom-left-radius: 2px;
    }
    .pix-chat-msg.user {
      align-self: flex-end;
      background: #b8860b; color: #fff;
      border-bottom-right-radius: 2px;
    }
    .pix-chat-msg.system {
      align-self: center;
      background: rgba(0,0,0,0.04); color: #8a7e72;
      font-size: 11px; font-style: italic; text-align: center;
    }
    .pix-chat-input-row {
      display: flex; gap: 8px; padding: 12px 16px;
      border-top: 1px solid rgba(0,0,0,0.08);
      background: rgba(0,0,0,0.02);
    }
    .pix-chat-input {
      flex: 1; padding: 10px 14px;
      border: 1px solid rgba(0,0,0,0.12); border-radius: 6px;
      font-family: 'Georgia', serif; font-size: 13px;
      background: #fff; color: #2a2420; outline: none;
    }
    .pix-chat-input:focus { border-color: #b8860b; }
    .pix-chat-send {
      padding: 10px 18px; background: #b8860b; color: #fff;
      border: none; border-radius: 6px; cursor: pointer;
      font-family: 'Georgia', serif; font-size: 13px;
      letter-spacing: 0.5px;
    }
    .pix-chat-send:hover { background: #9a7009; }
    .pix-chat-send:disabled { opacity: 0.5; cursor: default; }

    /* Section creation modal */
    #custom-section-modal {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(30,26,22,0.85); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
    }
    #custom-section-modal.hidden { display: none; }
    .csm-card {
      background: #faf6ee; border-radius: 4px; padding: 32px 36px;
      max-width: 420px; width: 90%; box-shadow: 0 16px 48px rgba(0,0,0,0.3);
      font-family: 'Georgia', serif;
    }
    .csm-card h2 { font-size: 18px; color: #2a2420; margin-bottom: 16px; }
    .csm-card input {
      width: 100%; padding: 12px 14px; border: 1px solid rgba(0,0,0,0.12);
      border-radius: 4px; font-family: 'Georgia', serif; font-size: 14px;
      margin-bottom: 16px; outline: none;
    }
    .csm-card input:focus { border-color: #b8860b; }
    .csm-row { display: flex; gap: 10px; }
    .csm-btn {
      flex: 1; padding: 12px; border: none; border-radius: 4px;
      font-family: 'Georgia', serif; font-size: 14px; cursor: pointer;
      letter-spacing: 0.5px;
    }
    .csm-btn.primary { background: #b8860b; color: #fff; }
    .csm-btn.primary:hover { background: #9a7009; }
    .csm-btn.secondary { background: rgba(0,0,0,0.06); color: #8a7e72; }
    .csm-btn.secondary:hover { background: rgba(0,0,0,0.1); }

    /* Dragging exhibit */
    .exhibit.dragging {
      opacity: 0.7; cursor: grabbing !important; z-index: 100;
    }
    .exhibit.custom-exhibit .exhibit-art { cursor: grab; }
    .exhibit.custom-exhibit.dragging .exhibit-art { cursor: grabbing; }

    /* Generating overlay */
    .pix-generating {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; background: rgba(184,134,11,0.08);
      border-radius: 12px; border-bottom-left-radius: 2px;
      font-size: 12px; color: #8a7e72;
    }
    .pix-gen-spinner {
      width: 14px; height: 14px; border: 2px solid rgba(184,134,11,0.2);
      border-top-color: #b8860b; border-radius: 50%;
      animation: pixSpin 0.8s linear infinite;
    }
    @keyframes pixSpin { to { transform: rotate(360deg); } }

    /* Machine running animation */
    .machine-running .exhibit-art {
      animation: machineShake 0.15s ease infinite alternate;
    }
    @keyframes machineShake {
      0% { transform: translate(0, 0); }
      100% { transform: translate(1px, -1px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(chatPanel);

  // Event listeners
  chatPanel.querySelector('.pix-chat-close').addEventListener('click', closeChatPanel);

  const input = chatPanel.querySelector('.pix-chat-input');
  const sendBtn = chatPanel.querySelector('.pix-chat-send');

  sendBtn.addEventListener('click', () => sendMessage(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  });

  return chatPanel;
}

let activePixInstance = null;

function openChatPanel(sectionId, pixInstance) {
  const panel = createChatPanel();
  activeChatSection = sectionId;
  activePixInstance = pixInstance || null;
  const sec = customData.sections.find(s => s.id === sectionId);
  panel.querySelector('.pix-chat-title').textContent = `Pix — ${sec?.title || 'Custom Section'}`;

  // Render existing messages
  const messagesDiv = panel.querySelector('.pix-chat-messages');
  messagesDiv.innerHTML = '';
  const history = getChatHistory(sectionId);

  if (history.length === 0) {
    // Welcome message
    const welcomeMsg = `Hey! Welcome to "${sec?.title || 'your section'}"! I'm Pix, your museum curator buddy. What kind of exhibits are you thinking about? I can help you brainstorm ideas and then we'll build them together!`;
    history.push({ role: 'pix', text: welcomeMsg });
    saveChatHistory(sectionId);
  }

  history.forEach(msg => appendMessageEl(messagesDiv, msg));

  requestAnimationFrame(() => {
    panel.classList.add('open');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function closeChatPanel() {
  if (chatPanel) {
    chatPanel.classList.remove('open');
    activeChatSection = null;
    stopPixLiveSession();
    if (activePixInstance) {
      stopPixTalking(activePixInstance);
      activePixInstance = null;
    }
  }
}

function appendMessageEl(container, msg) {
  const el = document.createElement('div');
  el.className = `pix-chat-msg ${msg.role}`;
  el.textContent = msg.text;
  container.appendChild(el);
  return el;
}

async function sendMessage(inputEl) {
  const text = inputEl.value.trim();
  if (!text || !activeChatSection) return;
  inputEl.value = '';

  const messagesDiv = chatPanel.querySelector('.pix-chat-messages');
  const history = getChatHistory(activeChatSection);
  const sendBtn = chatPanel.querySelector('.pix-chat-send');

  // Add user message
  const userMsg = { role: 'user', text };
  history.push(userMsg);
  appendMessageEl(messagesDiv, userMsg);
  saveChatHistory(activeChatSection);

  sendBtn.disabled = true;

  // Pix listens while processing
  if (activePixInstance) setPixState(activePixInstance, 'listen');

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  try {
    const sec = customData.sections.find(s => s.id === activeChatSection);
    const sectionTitle = sec?.title || 'Custom Section';
    const existingExhibits = (sec?.exhibits || []).map(e => e.title).join(', ') || 'none yet';

    const systemPrompt = `You are Pix. You're hanging out in the user's personal museum section called "${sectionTitle}".
Their current exhibits: ${existingExhibits}.

You're a friend — warm, curious, a little nerdy. You're here to help them build their museum section. You can:
- Discuss what exhibits they want to create
- Suggest ideas based on their interests
- Help them refine their exhibit ideas

When the user confirms they want to create an exhibit, say something that includes the phrase "firing up the machine" or "creating it now". The system will handle the rest automatically.

Keep your responses concise (2-4 sentences usually). You're chatting, not lecturing.`;

    // Build messages array for Gemini
    const contents = history.map(m => ({
      role: m.role === 'pix' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    if (!ai) {
      throw new Error('Gemini API key not configured. Set VITE_GEMINI_KEY environment variable.');
    }

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 1024,
        temperature: 0.8,
      },
    });

    const response = result.text || '';
    // Pix talks while responding
    if (activePixInstance) setPixState(activePixInstance, 'talk');
    const pixMsg = { role: 'pix', text: response };
    history.push(pixMsg);
    appendMessageEl(messagesDiv, pixMsg);
    setTimeout(() => { if (activePixInstance) setPixState(activePixInstance, 'listen'); }, 3000);
    saveChatHistory(activeChatSection);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Check for exhibit creation intent via keywords
    const lowerResp = response.toLowerCase();
    const creationPhrases = ['firing up the machine', 'creating it now', 'let me create', 'building it', 'making it now', 'consider it created', 'generating the exhibit', 'here it comes'];
    if (creationPhrases.some(p => lowerResp.includes(p)) && !_isGeneratingExhibit) {
      _isGeneratingExhibit = true;
      extractAndCreateExhibit(activeChatSection, activePixInstance).finally(() => {
        _isGeneratingExhibit = false;
      });
    }

  } catch (err) {
    console.error('Pix chat error:', err);
    const errMsg = { role: 'system', text: `Oops: ${err.message}` };
    history.push(errMsg);
    appendMessageEl(messagesDiv, errMsg);
    saveChatHistory(activeChatSection);
  }

  sendBtn.disabled = false;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==================== EXHIBIT GENERATION ====================
// Unused DRAWER_EXAMPLES kept for reference only
const _DRAWER_EXAMPLES_REF = `
EXAMPLE 1 — Steam Engine (100x75 grid). Notice the multi-layer shading, rivet details, mortar lines, material-specific colors:
(ctx, h) => {
  // BRICK FURNACE BASE — individual bricks with mortar
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      const bx = 8 + col*5, by = 52 + row*3;
      const shade = (row+col)%3===0 ? '#a04028' : (row+col)%3===1 ? '#b04830' : '#c05838';
      drawPixelRect(ctx, bx, by, 4, 2, shade);
      drawPx(ctx, bx+4, by, '#d0b898'); // mortar
      drawPx(ctx, bx, by+2, '#d0b898');
    }
  }
  drawPixelRect(ctx, 20, 58, 14, 7, '#1a1008'); // furnace opening
  if (h) {
    drawPixelRect(ctx, 22, 60, 10, 4, '#d04010'); // fire
    for (let i = 0; i < 5; i++) {
      const fx = 23 + i*2;
      drawPx(ctx, fx, 59, '#f0a020');
      drawPx(ctx, fx, 58, i%2?'#f0c848':'#f09020');
    }
  }
  // BOILER — 6 layers of copper shading + rivet rows
  drawPixelEllipse(ctx, 35, 52, 24, 4, '#605030'); // shadow
  drawPixelEllipse(ctx, 35, 46, 24, 10, '#6b4510'); // dark base
  drawPixelEllipse(ctx, 35, 45, 24, 9, '#8b6518');  // mid
  drawPixelEllipse(ctx, 35, 44, 23, 8, '#a57820');  // lighter
  drawPixelEllipse(ctx, 34, 42, 20, 5, '#c89830');  // highlight band
  drawPixelEllipse(ctx, 33, 40, 14, 3, '#d8b040');  // top highlight
  for (let i = 0; i < 8; i++) drawPx(ctx, 26+i*2, 39, '#e8c860'); // specular
  for (let i = 0; i < 9; i++) { // rivet rows
    const rx = 15+i*5;
    drawPx(ctx, rx, 41, '#5a3a08');
    drawPx(ctx, rx, 49, '#5a3a08');
    drawPx(ctx, rx, 40, '#c89830'); // rivet highlight
  }
  // Iron straps
  drawPixelRect(ctx, 14, 44, 1, 6, '#484040');
  drawPixelRect(ctx, 26, 44, 1, 6, '#484040');
  drawPixelRect(ctx, 38, 44, 1, 6, '#484040');
  // CHIMNEY
  drawPixelRect(ctx, 17, 22, 7, 20, '#484040');
  drawPixelRect(ctx, 18, 22, 5, 20, '#585048');
  drawPixelRect(ctx, 19, 23, 3, 18, '#686058'); // highlight
  drawPixelRect(ctx, 15, 20, 11, 3, '#484040'); // cap
  // STEAM (opacity varies with hover)
  ctx.globalAlpha = h ? 0.75 : 0.18;
  drawPixelCircle(ctx, 21, 17, 4, '#d8d8d8');
  drawPixelCircle(ctx, 18, 12, 5, '#e0e0e0');
  drawPixelCircle(ctx, 24, 9, 4, '#d0d0d0');
  drawPixelCircle(ctx, 16, 6, 6, '#e8e8e8');
  ctx.globalAlpha = 1;
}

EXAMPLE 2 — Bicycle (75x60 grid). Notice spoked wheels, diamond frame with highlight lines, chain, leather saddle:
(ctx, h) => {
  ctx.globalAlpha = 0.12;
  drawPixelEllipse(ctx, 37, 56, 30, 3, '#000'); // shadow
  ctx.globalAlpha = 1;
  // Wheels with spokes
  const wr = 12, w1x = 18, w2x = 56, wy = 45;
  for (const wx of [w1x, w2x]) {
    ctx.save();
    ctx.translate(wx * P, wy * P);
    if (h) ctx.rotate(0.3);
    drawPixelCircle(ctx, 0, 0, wr, '#2a2a2a'); // tire outer
    drawPixelCircle(ctx, 0, 0, wr - 1, '#383838');
    drawPixelCircle(ctx, 0, 0, wr - 2, '#dce4e8'); // inner
    for (let i = 0; i < 12; i++) { // 12 spokes
      const a = i * Math.PI / 6;
      drawPixelLine(ctx, Math.round(2*Math.cos(a)), Math.round(2*Math.sin(a)),
        Math.round((wr-2)*Math.cos(a)), Math.round((wr-2)*Math.sin(a)), '#888', 1);
    }
    drawPixelCircle(ctx, 0, 0, 2, '#606060'); // hub
    ctx.restore();
  }
  // Diamond frame (dark + highlight line for each tube)
  const fc = '#1a6030', fh = '#208038';
  drawPixelLine(ctx, 38, 22, 38, 45, fc, 1);
  drawPixelLine(ctx, 39, 22, 39, 45, fh, 1);
  drawPixelLine(ctx, 26, 24, 38, 22, fc, 1);
  drawPixelLine(ctx, 26, 25, 38, 23, fh, 1);
  drawPixelLine(ctx, 26, 24, 34, 42, fc, 1);
  drawPixelLine(ctx, 34, 42, 56, 45, fc, 1);
  drawPixelLine(ctx, 38, 23, 56, 45, fc, 1);
  // Fork
  drawPixelLine(ctx, 26, 28, 18, 45, '#505050', 1);
  drawPixelLine(ctx, 27, 28, 19, 45, '#606060', 1);
  // Handlebars with grips
  drawPixelRect(ctx, 22, 18, 8, 2, '#404040');
  drawPixelRect(ctx, 22, 17, 2, 3, '#2a2a2a');
  drawPixelRect(ctx, 28, 17, 2, 3, '#2a2a2a');
  // Leather saddle
  drawPixelEllipse(ctx, 40, 20, 5, 2, '#3a2210');
  drawPixelEllipse(ctx, 40, 19, 4, 1, '#4a3018');
  // Chain
  ctx.globalAlpha = 0.6;
  drawPixelLine(ctx, 34, 44, 56, 47, '#606060', 1);
  drawPixelLine(ctx, 34, 40, 56, 43, '#606060', 1);
  ctx.globalAlpha = 1;
}`;

// ==================== IMAGE-BASED EXHIBIT GENERATION ====================

async function generateExhibitImage(exhibitData) {
  if (!ai) return null;
  const subject = exhibitData.imagePrompt || exhibitData.title;

  const prompt = `Generate an image of "${subject}" for a museum exhibit.
The image should be a clear, detailed illustration on a pure white background (#FFFFFF).
Style: colorful, slightly stylized illustration suitable for a children's museum.
The subject should be centered and take up most of the frame.
IMPORTANT: The background MUST be pure white so it can be cleanly removed.`;

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: prompt,
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 0.8,
      },
    });

    // Extract image from response
    const parts = result.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const base64 = part.inlineData.data;
        const dataUrl = `data:${part.inlineData.mimeType};base64,${base64}`;
        // Remove white background
        const processedUrl = await removeWhiteBackground(dataUrl);
        return processedUrl || dataUrl;
      }
    }

    console.warn('[ExhibitImageGen] No image in response');
    return null;
  } catch (e) {
    console.error('[ExhibitImageGen] FAILED:', e.message);
    return null;
  }
}

function removeWhiteBackground(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Remove white/near-white pixels
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Check if pixel is white or near-white
        if (r > 240 && g > 240 && b > 240) {
          data[i + 3] = 0; // fully transparent
        } else if (r > 220 && g > 220 && b > 220) {
          // Semi-transparent for near-white (anti-aliasing edges)
          const whiteness = Math.min(r, g, b);
          data[i + 3] = Math.max(0, 255 - Math.round((whiteness - 220) * (255 / 35)));
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function generateExhibit(sectionId, exhibitData, messagesDiv) {
  // Show generating indicator
  const genEl = document.createElement('div');
  genEl.className = 'pix-generating';
  genEl.innerHTML = '<div class="pix-gen-spinner"></div> Generating exhibit art...';
  messagesDiv.appendChild(genEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  const sec = customData.sections.find(s => s.id === sectionId);
  if (!sec) return;

  let imageData = null;

  try {
    if (ai) {
      imageData = await generateExhibitImage(exhibitData);
    }
  } catch (e) {
    console.warn('Exhibit image generation failed:', e);
  }

  // Remove generating indicator
  genEl.remove();

  // Calculate position: place exhibits in a grid within the section
  const existingCount = sec.exhibits.length;
  const col = existingCount % 3;
  const row = Math.floor(existingCount / 3);
  // Leave room for Pix (at x=30) and machine (at x=130)
  const baseX = 260 + col * 250;
  const baseY = 50 + row * 250;

  const exhibitId = 'custom-exhibit-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

  const newExhibit = {
    id: exhibitId,
    title: exhibitData.title || 'Untitled',
    year: exhibitData.year || '?',
    detail: exhibitData.detail || '',
    wow: exhibitData.wow || '',
    imagePrompt: exhibitData.imagePrompt || '',
    drawerCode: null,
    imageData: imageData,
    x: baseX,
    y: baseY,
    gw: 80,
    gh: 60,
  };

  sec.exhibits.push(newExhibit);
  saveCustomData(customData);

  // Notify: re-render
  if (_callbacks?.onExhibitCreated) {
    _callbacks.onExhibitCreated(sectionId, newExhibit);
  }

  // Re-render custom sections
  renderAllCustomContent();

  // Confirmation message
  const history = getChatHistory(sectionId);
  const confirmMsg = { role: 'system', text: `"${newExhibit.title}" has been added to your museum!` };
  history.push(confirmMsg);
  appendMessageEl(messagesDiv, confirmMsg);
  saveChatHistory(sectionId);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==================== EXHIBIT CREATION VIA CONVERSATION CONTEXT ====================
let _isGeneratingExhibit = false;

async function extractAndCreateExhibit(sectionId, pixInstance) {
  // Use the conversation history to extract exhibit details via a separate text Gemini call
  const history = getChatHistory(sectionId);
  const recentChat = history.slice(-10).map(m =>
    `${m.role === 'pix' ? 'Pix' : 'User'}: ${m.text}`
  ).join('\n');

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on this conversation, extract the exhibit that Pix just agreed to create.

Conversation:
${recentChat}

Output a JSON object with these fields:
{"title": "exhibit name", "year": "year or era", "detail": "2-3 sentence description of the invention/topic", "wow": "one surprising fun fact", "imagePrompt": "detailed visual description for generating a pixel art illustration of this subject"}

Output ONLY valid JSON. No markdown, no explanation.`,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        systemInstruction: 'Extract exhibit details from conversation. Output valid JSON only.',
      },
    });

    let content = result.text.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const exhibitData = JSON.parse(content);
    console.log('Extracted exhibit data:', exhibitData);

    // Trigger generation
    await triggerExhibitGeneration(sectionId, exhibitData, pixInstance);
  } catch (e) {
    console.warn('Failed to extract exhibit from conversation:', e);
    // Show error in chat
    const messagesDiv = chatPanel?.querySelector('.pix-chat-messages');
    if (messagesDiv) {
      appendMessageEl(messagesDiv, { role: 'system', text: 'Hmm, had trouble creating that exhibit. Try again?' });
    }
  }
}

// ==================== EXHIBIT GENERATION TRIGGER (from Live API) ====================
let generatorMachineEl = null; // reference to the machine canvas in the active section

async function triggerExhibitGeneration(sectionId, exhibitData, pixInstance) {
  // Set Pix to work state
  if (pixInstance) setPixState(pixInstance, 'work');

  // Animate the generator machine
  if (generatorMachineEl) {
    generatorMachineEl.classList.add('machine-running');
  }

  const messagesDiv = chatPanel?.querySelector('.pix-chat-messages');
  if (!messagesDiv) return;

  await generateExhibit(sectionId, exhibitData, messagesDiv);

  // Stop machine animation
  if (generatorMachineEl) {
    generatorMachineEl.classList.remove('machine-running');
  }

  // Pix celebrates
  if (pixInstance) {
    setPixState(pixInstance, 'wave');
    setTimeout(() => { if (pixInstance) setPixState(pixInstance, 'listen'); }, 2000);
  }
}

// ==================== SECTION CREATION UI ====================
let sectionModal = null;

function createSectionModal() {
  if (sectionModal) return sectionModal;

  sectionModal = document.createElement('div');
  sectionModal.id = 'custom-section-modal';
  sectionModal.className = 'hidden';
  sectionModal.innerHTML = `
    <div class="csm-card">
      <h2>Create a New Section</h2>
      <input type="text" id="csm-name" placeholder="e.g., My Space Collection" maxlength="50" />
      <div class="csm-row">
        <button class="csm-btn secondary" id="csm-cancel">Cancel</button>
        <button class="csm-btn primary" id="csm-create">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(sectionModal);

  sectionModal.querySelector('#csm-cancel').addEventListener('click', () => {
    sectionModal.classList.add('hidden');
  });

  sectionModal.querySelector('#csm-create').addEventListener('click', () => {
    const name = sectionModal.querySelector('#csm-name').value.trim();
    if (!name) return;
    createNewSection(name);
    sectionModal.querySelector('#csm-name').value = '';
    sectionModal.classList.add('hidden');
  });

  sectionModal.querySelector('#csm-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sectionModal.querySelector('#csm-create').click();
    }
  });

  // Close on backdrop click
  sectionModal.addEventListener('click', (e) => {
    if (e.target === sectionModal) sectionModal.classList.add('hidden');
  });

  return sectionModal;
}

function showCreateSectionModal() {
  const modal = createSectionModal();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.querySelector('#csm-name').focus();
  });
}

// Wall color palette for custom sections
const WALL_COLORS = [
  { wall: '#e0d8cc', wallDark: '#d0c8bc', floor: '#b8a888', floorDark: '#9a8868', accent: '#7a6a50' },
  { wall: '#d8e0d8', wallDark: '#c8d0c8', floor: '#8aa888', floorDark: '#6a8868', accent: '#5a7a5a' },
  { wall: '#e0d8e0', wallDark: '#d0c8d0', floor: '#b0a0b0', floorDark: '#908090', accent: '#7a6a7a' },
  { wall: '#e0dcd0', wallDark: '#d0ccb8', floor: '#c4a870', floorDark: '#a88850', accent: '#8a7040' },
  { wall: '#d8dce0', wallDark: '#c8ccd0', floor: '#8a9ea8', floorDark: '#6a8090', accent: '#5a708a' },
];

function createNewSection(title) {
  const sectionId = 'custom-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  const colorSet = WALL_COLORS[customData.sections.length % WALL_COLORS.length];

  const newSection = {
    id: sectionId,
    title,
    createdAt: Date.now(),
    wallColor: colorSet.wall,
    wallColorDark: colorSet.wallDark,
    floorColor: colorSet.floor,
    floorColorDark: colorSet.floorDark,
    accentColor: colorSet.accent,
    exhibits: [],
    chatHistory: [],
  };

  customData.sections.push(newSection);
  saveCustomData(customData);

  if (_callbacks?.onSectionCreated) {
    _callbacks.onSectionCreated(newSection);
  }

  renderAllCustomContent();
}

// ==================== RENDERING ====================
const SECTION_GAP = 100; // gap between sections
const SECTION_BASE_WIDTH = 900; // minimum width per custom section
const PIX_X = 30; // Pix position within section
const PIX_Y = 300;
const MACHINE_X = 130;
const MACHINE_Y = 280;

let _museumCanvas = null;
let _bgCanvas = null;
let _callbacks = null;

// Track elements for drag
let customExhibitElements = [];

export function getCustomSectionWidth() {
  if (customData.sections.length === 0) return 0;
  let total = SECTION_GAP; // initial gap (archway space)
  customData.sections.forEach(sec => {
    const exhibitMaxX = Math.max(SECTION_BASE_WIDTH, ...(sec.exhibits || []).map(e => (e.x || 0) + (e.gw || 80) * P + 50));
    total += exhibitMaxX + SECTION_GAP;
  });
  return total;
}

function getCustomSectionsLayout() {
  // Custom sections start after the main museum content
  const mainMuseumEnd = _callbacks?.getMuseumWidth?.() || 4800;
  const result = [];
  let currentX = mainMuseumEnd;

  customData.sections.forEach((sec, idx) => {
    const exhibitMaxX = Math.max(SECTION_BASE_WIDTH, ...(sec.exhibits || []).map(e => (e.x || 0) + (e.gw || 80) * P + 100));
    result.push({
      ...sec,
      renderX: currentX,
      renderWidth: exhibitMaxX,
    });
    currentX += exhibitMaxX + SECTION_GAP;
  });

  return result;
}

function renderAllCustomContent() {
  if (!_museumCanvas || !_bgCanvas) return;
  renderCustomSections(_museumCanvas, _bgCanvas);
}

export function renderCustomSections(museumCanvas, bgCanvas) {
  _museumCanvas = museumCanvas;
  _bgCanvas = bgCanvas;

  // Remove old custom elements
  museumCanvas.querySelectorAll('.custom-section-el').forEach(el => el.remove());
  customExhibitElements = [];
  pixInstances.length = 0; // Clear old pix instances

  const sectionsLayout = getCustomSectionsLayout();
  if (sectionsLayout.length === 0) return;

  const bg = bgCanvas;
  const bgCtx = bg.getContext('2d');
  // Canvas width is already set by main.js (CANVAS_W includes custom sections)

  const FLOOR_Y = 680;
  const BASEBOARD_H = 8;
  const CANVAS_H = 780;

  sectionsLayout.forEach((sec, idx) => {
    const sx = sec.renderX;
    const sw = sec.renderWidth;

    // --- Draw archway before this section ---
    const archX = sx - SECTION_GAP;
    const archW = SECTION_GAP;
    if (archW > 0) {
      bgCtx.fillStyle = '#3a3430';
      bgCtx.fillRect(archX, 0, archW, CANVAS_H);
      const openW = archW - 20;
      const openX2 = archX + 10;
      bgCtx.fillStyle = '#1a1810';
      bgCtx.fillRect(openX2, 30, openW, FLOOR_Y - 30);
      bgCtx.fillStyle = '#4a4440';
      bgCtx.fillRect(archX, 0, 10, CANVAS_H);
      bgCtx.fillRect(archX + archW - 10, 0, 10, CANVAS_H);
      bgCtx.fillStyle = '#5a5450';
      bgCtx.fillRect(archX + 2, 0, 3, CANVAS_H);
      bgCtx.fillRect(archX + archW - 5, 0, 3, CANVAS_H);
      bgCtx.fillStyle = '#3a3430';
      bgCtx.beginPath();
      bgCtx.ellipse(archX + archW / 2, 30, openW / 2, 25, 0, Math.PI, 0);
      bgCtx.fill();
      bgCtx.fillStyle = '#5a5450';
      bgCtx.fillRect(archX + archW / 2 - 8, 8, 16, 20);
      bgCtx.fillStyle = '#6a6460';
      bgCtx.fillRect(archX + archW / 2 - 6, 10, 12, 16);
      bgCtx.fillStyle = '#2a2420';
      bgCtx.fillRect(archX, FLOOR_Y, archW, CANVAS_H - FLOOR_Y);
    }

    // --- Wall ---
    bgCtx.fillStyle = sec.wallColor;
    bgCtx.fillRect(sx, 0, sw, FLOOR_Y);
    const wallGrad = bgCtx.createLinearGradient(0, 0, 0, FLOOR_Y);
    wallGrad.addColorStop(0, 'rgba(255,255,255,0.03)');
    wallGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    wallGrad.addColorStop(1, 'rgba(0,0,0,0.04)');
    bgCtx.fillStyle = wallGrad;
    bgCtx.fillRect(sx, 0, sw, FLOOR_Y);

    // Crown molding
    bgCtx.fillStyle = sec.accentColor;
    bgCtx.fillRect(sx, 0, sw, 5);
    bgCtx.fillStyle = 'rgba(255,255,255,0.15)';
    bgCtx.fillRect(sx, 1, sw, 1);

    // Baseboard
    bgCtx.fillStyle = sec.accentColor;
    bgCtx.fillRect(sx, FLOOR_Y - BASEBOARD_H, sw, BASEBOARD_H);
    bgCtx.fillStyle = 'rgba(255,255,255,0.1)';
    bgCtx.fillRect(sx, FLOOR_Y - BASEBOARD_H, sw, 1);

    // Floor
    bgCtx.fillStyle = sec.floorColor;
    bgCtx.fillRect(sx, FLOOR_Y, sw, CANVAS_H - FLOOR_Y);
    bgCtx.fillStyle = sec.floorColorDark;
    for (let fy = FLOOR_Y; fy < CANVAS_H; fy += 12) {
      bgCtx.fillRect(sx, fy, sw, 1);
    }
    bgCtx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let fx = sx; fx < sx + sw; fx += 40) {
      bgCtx.fillRect(fx, FLOOR_Y, 1, CANVAS_H - FLOOR_Y);
    }

    // Section title on wall
    bgCtx.save();
    bgCtx.font = '700 28px Georgia, serif';
    bgCtx.fillStyle = 'rgba(0,0,0,0.12)';
    bgCtx.letterSpacing = '8px';
    bgCtx.textAlign = 'left';
    bgCtx.fillText(sec.title.toUpperCase(), sx + 40, 45);
    bgCtx.restore();

    // --- Section title as DOM element ---
    const titleEl = document.createElement('div');
    titleEl.className = 'section-title custom-section-el';
    titleEl.style.left = (sx + 40) + 'px';
    titleEl.style.top = '55px';
    titleEl.textContent = sec.title.toUpperCase();
    museumCanvas.appendChild(titleEl);

    // --- Render custom exhibits ---
    (sec.exhibits || []).forEach(exhibit => {
      renderCustomExhibit(museumCanvas, sec, exhibit, sx);
    });
  });

  // Start Pix animation loop
  startPixAnimLoop();
}

function renderCustomExhibit(museumCanvas, section, exhibit, sectionX) {
  const el = document.createElement('div');
  el.className = 'exhibit custom-section-el custom-exhibit';
  el.style.left = (sectionX + exhibit.x) + 'px';
  el.style.top = exhibit.y + 'px';
  el.dataset.customExhibit = exhibit.id;
  el.dataset.sectionId = section.id;

  const artDiv = document.createElement('div');
  artDiv.className = 'exhibit-art';

  if (exhibit.imageData) {
    // Image-based exhibit
    const img = document.createElement('img');
    img.src = exhibit.imageData;
    img.style.width = (exhibit.gw * P) + 'px';
    img.style.height = (exhibit.gh * P) + 'px';
    img.style.imageRendering = 'auto';
    img.style.objectFit = 'contain';
    img.draggable = false;
    img.alt = exhibit.title;
    artDiv.appendChild(img);
  } else if (exhibit.drawerCode) {
    // Legacy drawer code support
    const cvs = document.createElement('canvas');
    cvs.width = exhibit.gw * P;
    cvs.height = exhibit.gh * P;
    cvs.style.width = (exhibit.gw * P) + 'px';
    cvs.style.height = (exhibit.gh * P) + 'px';
    cvs.style.imageRendering = 'pixelated';
    const ctx = cvs.getContext('2d');
    try {
      const fn = new Function('ctx', 'h', 'drawPixelRect', 'drawPixelCircle', 'drawPixelEllipse', 'drawPixelLine', 'drawPx', 'P',
        'return (' + exhibit.drawerCode + ')(ctx, h)');
      fn(ctx, false, drawPixelRect, drawPixelCircle, drawPixelEllipse, drawPixelLine, drawPx, P);
    } catch (e) {
      drawPlaceholderExhibit(ctx, exhibit);
    }
    artDiv.appendChild(cvs);
  } else {
    // Placeholder
    const cvs = document.createElement('canvas');
    cvs.width = exhibit.gw * P;
    cvs.height = exhibit.gh * P;
    cvs.style.width = (exhibit.gw * P) + 'px';
    cvs.style.height = (exhibit.gh * P) + 'px';
    cvs.style.imageRendering = 'pixelated';
    const ctx = cvs.getContext('2d');
    drawPlaceholderExhibit(ctx, exhibit);
    artDiv.appendChild(cvs);
  }

  el.appendChild(artDiv);

  // Shadow
  const shadow = document.createElement('div');
  shadow.className = 'exhibit-shadow';
  el.appendChild(shadow);

  // Label
  const label = document.createElement('div');
  label.className = 'exhibit-label';
  label.innerHTML = `<h3>${exhibit.title}</h3><div class="year">${exhibit.year}</div>`;
  el.appendChild(label);

  museumCanvas.appendChild(el);

  // Click to show exhibit detail
  artDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    showCustomExhibitDetail(exhibit);
  });

  // Drag functionality for repositioning
  setupDrag(el, section.id, exhibit.id, sectionX);

  customExhibitElements.push({ el, sectionId: section.id, exhibitId: exhibit.id });
}

function drawPlaceholderExhibit(ctx, exhibit) {
  const gw = exhibit.gw, gh = exhibit.gh;
  // Frame
  drawPixelRect(ctx, 1, 1, gw - 2, gh - 2, '#e8dcc8');
  drawPixelRect(ctx, 2, 2, gw - 4, gh - 4, '#f0e8d8');
  // Border
  drawPixelRect(ctx, 0, 0, gw, 1, '#b8860b');
  drawPixelRect(ctx, 0, gh - 1, gw, 1, '#b8860b');
  drawPixelRect(ctx, 0, 0, 1, gh, '#b8860b');
  drawPixelRect(ctx, gw - 1, 0, 1, gh, '#b8860b');
  // Center icon (star)
  const cx = Math.floor(gw / 2), cy = Math.floor(gh / 2);
  drawPixelCircle(ctx, cx, cy, 5, '#d8b040');
  drawPixelCircle(ctx, cx, cy, 3, '#e8c860');
  drawPx(ctx, cx, cy, '#f0d878');
  // Title hint
  const titleLen = Math.min(exhibit.title.length, gw - 10);
  for (let i = 0; i < titleLen; i++) {
    drawPx(ctx, Math.floor(gw / 2 - titleLen / 2) + i, cy + 10, '#8a7a60');
  }
}

function showCustomExhibitDetail(exhibit) {
  // Use the same story gateway as built-in exhibits
  // Import showGateway dynamically to avoid circular deps
  import('./story-theater.js').then(({ showGateway }) => {
    const exhibitData = {
      title: exhibit.title,
      year: exhibit.year || '?',
      person: exhibit.person || '',
      detail: exhibit.detail || '',
      wow: exhibit.wow || '',
      tagline: exhibit.detail?.slice(0, 60) || '',
    };
    showGateway(exhibit.id, exhibitData);
  });
}

// ==================== DRAG TO REPOSITION ====================
function setupDrag(el, sectionId, exhibitId, sectionX) {
  let isDragging = false;
  let startMX = 0, startMY = 0;
  let startEX = 0, startEY = 0;

  const artEl = el.querySelector('.exhibit-art');

  artEl.addEventListener('mousedown', (e) => {
    // Only drag with left button
    if (e.button !== 0) return;
    e.stopPropagation();
    isDragging = true;
    startMX = e.clientX;
    startMY = e.clientY;
    startEX = parseInt(el.style.left);
    startEY = parseInt(el.style.top);
    el.classList.add('dragging');
    e.preventDefault();
  });

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startMX;
    const dy = e.clientY - startMY;
    el.style.left = (startEX + dx) + 'px';
    el.style.top = (startEY + dy) + 'px';
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('dragging');

    // Update position in data
    const sec = customData.sections.find(s => s.id === sectionId);
    const exhibit = sec?.exhibits?.find(e => e.id === exhibitId);
    if (exhibit) {
      exhibit.x = parseInt(el.style.left) - sectionX;
      exhibit.y = parseInt(el.style.top);
      saveCustomData(customData);
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ==================== SOUND EFFECT FOR CUSTOM EXHIBITS ====================
function playCustomExhibitSFX() {
  // Generic "museum bell" chime for custom exhibits
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;

    [523, 659, 784].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.5);
    });
  } catch (e) { /* audio not available */ }
}

// ==================== EXPORTS ====================
export function getCustomSections() {
  return customData.sections;
}

export async function generateExhibitInSection(sectionId, exhibitData) {
  const messagesDiv = document.createElement('div'); // dummy container for status msgs
  await generateExhibit(sectionId, exhibitData, messagesDiv);
}

export function initCustomMuseum(callbacks) {
  _callbacks = callbacks;
  customData = loadCustomData();

  // Ensure a default "My Exhibits" section always exists
  if (customData.sections.length === 0) {
    customData.sections.push({
      id: 'custom-my-exhibits',
      title: 'My Exhibits',
      createdAt: Date.now(),
      wallColor: '#e4dcd0',
      exhibits: [],
      chatHistory: [],
    });
    saveCustomData();
  }

  // Wire the existing "+" button from index.html
  document.getElementById('add-section-btn')?.addEventListener('click', showCreateSectionModal);

  createSectionModal();

  return {
    getSections: () => customData.sections,
    getWidth: getCustomSectionWidth,
  };
}
