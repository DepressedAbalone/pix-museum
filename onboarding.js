// ==================== ONBOARDING ====================
// Dark theater where Pix (geometric square creature) introduces the museum via Gemini Live API voice.
// Then guided tour: Pix pans through each section and describes it.
// Plays once per user. Debug replay button available.

import { GoogleGenAI, Modality } from '@google/genai';

const ONBOARDING_KEY = 'invention_museum_onboarded';
const USER_KEY = 'invention_museum_user';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

// ==================== PIX: GEOMETRIC SQUARE CREATURE ====================
class PixSquare {
  constructor() {
    this.size = 50;
    this.corners = Array.from({ length: 4 }, () => ({ dx: 0, dy: 0 }));
    this.cornerTargets = Array.from({ length: 4 }, () => ({ dx: 0, dy: 0 }));
    this.rotation = 0;
    this.targetRotation = 0;
    this.x = 0; this.y = 0;
    this.targetX = 0; this.targetY = 0;
    this.scale = 1; this.targetScale = 1;
    this.glow = 0.3; this.targetGlow = 0.3;
    this.color = '#4080c0';
    this.glowColor = '#70b8ff';
    this.frame = 0;
    this.isTalking = false;
    this.talkIntensity = 0;
    this.particles = [];
  }

  update() {
    this.frame++;
    this.x += (this.targetX - this.x) * 0.06;
    this.y += (this.targetY - this.y) * 0.06;
    this.rotation += (this.targetRotation - this.rotation) * 0.04;
    this.scale += (this.targetScale - this.scale) * 0.06;
    this.glow += (this.targetGlow - this.glow) * 0.04;
    const talkTarget = this.isTalking ? 1 : 0;
    this.talkIntensity += (talkTarget - this.talkIntensity) * 0.08;
    for (let i = 0; i < 4; i++) {
      this.corners[i].dx += (this.cornerTargets[i].dx - this.corners[i].dx) * 0.08;
      this.corners[i].dy += (this.cornerTargets[i].dy - this.corners[i].dy) * 0.08;
    }
    const breath = Math.sin(this.frame * 0.025) * 0.03;
    this.scale = this.targetScale + breath;
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy -= 0.02;
      p.life -= 0.015;
      p.size *= 0.99;
    });
    if (this.isTalking && this.frame % 3 === 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.size * this.scale + 10;
      this.particles.push({
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * 0.5 + (Math.random() - 0.5) * 0.3,
        vy: Math.sin(angle) * 0.5 - Math.random() * 0.5,
        size: 2 + Math.random() * 2, life: 1,
        hue: 200 + Math.random() * 40,
      });
    }
    if (!this.isTalking && this.frame % 20 === 0) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x: this.x + Math.cos(angle) * this.size,
        y: this.y + Math.sin(angle) * this.size,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -Math.random() * 0.3,
        size: 1.5, life: 1, hue: 210,
      });
    }
  }

  getCorners() {
    const s = this.size * this.scale;
    const base = [[-s, -s], [s, -s], [s, s], [-s, s]];
    return base.map(([bx, by], i) => ({
      x: bx + this.corners[i].dx,
      y: by + this.corners[i].dy,
    }));
  }

  draw(ctx) {
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${p.hue}, 70%, 70%)`;
      ctx.shadowColor = `hsl(${p.hue}, 80%, 60%)`;
      ctx.shadowBlur = p.size * 3;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const corners = this.getCorners();
    const ti = this.talkIntensity;

    if (ti > 0.01) {
      const pulseR = this.size * this.scale + 20 + Math.sin(this.frame * 0.15) * 10 * ti;
      const auraGrad = ctx.createRadialGradient(0, 0, this.size * 0.5, 0, 0, pulseR);
      auraGrad.addColorStop(0, `rgba(100, 180, 255, ${ti * 0.15})`);
      auraGrad.addColorStop(0.5, `rgba(80, 150, 255, ${ti * 0.08})`);
      auraGrad.addColorStop(1, 'rgba(80, 150, 255, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 0; r < 3; r++) {
        const ringR = this.size + 30 + r * 20 + (this.frame * 2) % 60;
        const ringAlpha = Math.max(0, ti * 0.15 * (1 - (ringR - this.size) / 100));
        if (ringAlpha > 0.005) {
          ctx.strokeStyle = `rgba(120, 190, 255, ${ringAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    const glowStr = this.glow + ti * 0.4;
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 25 * glowStr;
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = 2 + ti * 2;
    ctx.globalAlpha = glowStr * 0.6;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const grad = ctx.createRadialGradient(0, -this.size * 0.3, 0, 0, 0, this.size * 1.5);
    grad.addColorStop(0, ti > 0.1 ? '#60a0e0' : '#5090d0');
    grad.addColorStop(0.6, this.color);
    grad.addColorStop(1, '#2a5a88');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();

    const coreSize = 8 + ti * 6 + Math.sin(this.frame * 0.06) * 2;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0, `rgba(180, 220, 255, ${0.3 + ti * 0.4})`);
    coreGrad.addColorStop(1, 'rgba(100, 160, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(160, 210, 255, ${0.25 + ti * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.stroke();

    corners.forEach((c, i) => {
      const trailLen = 3 + ti * 4;
      for (let t = 0; t < trailLen; t++) {
        const trailAlpha = (1 - t / trailLen) * 0.2;
        ctx.beginPath();
        ctx.arc(c.x * (1 - t * 0.03), c.y * (1 - t * 0.03), 3 - t * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 190, 255, ${trailAlpha})`;
        ctx.fill();
      }
      const dotSize = 4 + ti * 2 + Math.sin(this.frame * 0.08 + i * 1.5) * 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = this.glowColor;
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 8 + ti * 8;
      ctx.globalAlpha = 0.7 + Math.sin(this.frame * 0.06 + i) * 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }

  idle() {
    this.targetRotation = Math.sin(this.frame * 0.008) * 0.06;
    for (let i = 0; i < 4; i++) {
      const phase = i * 1.57;
      this.cornerTargets[i] = {
        dx: Math.sin(this.frame * 0.015 + phase) * 6 + Math.sin(this.frame * 0.04 + phase * 2) * 3,
        dy: Math.cos(this.frame * 0.018 + phase) * 5 + Math.cos(this.frame * 0.035 + phase * 2) * 2,
      };
    }
  }

  talk() {
    this.isTalking = true;
    this.targetGlow = 0.7;
    this.targetScale = 1.0 + Math.sin(this.frame * 0.1) * 0.08;
    for (let i = 0; i < 4; i++) {
      const phase = i * 1.57;
      this.cornerTargets[i] = {
        dx: Math.sin(this.frame * 0.02 + phase) * 5,
        dy: Math.cos(this.frame * 0.025 + phase) * 4,
      };
    }
    this.targetRotation = Math.sin(this.frame * 0.015) * 0.04;
  }

  listen() {
    this.isTalking = false;
    this.targetGlow = 0.4;
    this.targetScale = 0.95;
    this.targetRotation = 0.08;
    for (let i = 0; i < 4; i++) {
      this.cornerTargets[i] = { dx: -3, dy: -3 };
    }
  }

  wave() {
    this.targetGlow = 0.5;
    this.cornerTargets[1] = { dx: 15, dy: -18 + Math.sin(this.frame * 0.12) * 12 };
    this.cornerTargets[0] = { dx: -5, dy: Math.sin(this.frame * 0.08) * 3 };
  }

  excited() {
    this.targetScale = 1.1;
    this.targetGlow = 0.8;
    for (let i = 0; i < 4; i++) {
      this.cornerTargets[i] = {
        dx: Math.sin(this.frame * 0.1 + i * 1.5) * 12,
        dy: Math.cos(this.frame * 0.08 + i * 1.5) * 12,
      };
    }
    this.targetRotation = Math.sin(this.frame * 0.08) * 0.2;
  }

  think() {
    this.targetRotation = 0.18;
    this.targetScale = 0.93;
    this.targetGlow = 0.35;
    this.cornerTargets[0] = { dx: -8, dy: -12 };
    this.cornerTargets[1] = { dx: 3, dy: -3 };
  }

  bow() {
    this.targetRotation = 0.35;
    this.targetScale = 0.88;
    this.targetGlow = 0.5;
    this.cornerTargets[2] = { dx: 5, dy: 10 };
    this.cornerTargets[3] = { dx: -5, dy: 10 };
  }

  reset() {
    this.isTalking = false;
    this.targetRotation = 0;
    this.targetScale = 1;
    this.targetGlow = 0.3;
    this.cornerTargets = Array.from({ length: 4 }, () => ({ dx: 0, dy: 0 }));
  }
}

// ==================== ONBOARDING SCRIPTS ====================
// DEBUG=true uses short scripts for faster testing. Set to false for production.
const DEBUG_ONBOARDING = true;

// --- PRODUCTION SCRIPTS (DO NOT DELETE) ---
const PROD_ONBOARDING_SCRIPT = `You are Pix, the heart and soul of the Pix Museum. You're about to meet someone new.

Speak naturally, with weight and warmth. Like the opening of a great documentary.

## The welcome (follow this flow exactly, in YOUR words):

1. "Welcome to the Pix Museum."
(pause)

2. Tell them what this museum is about: human stories. "This is a museum about human stories. Behind everything you see in your life — the stars above you, the food on your plate, the machines that carry you places — there are stories. Real ones. About real people. Dreams they had, struggles they went through, things they built that changed the world. Most people never hear these stories. This is where we keep them."
(pause)

3. Introduce yourself, then ask their name naturally — all as ONE flowing thought. "I'm Pix. I've been here a long time, and I love showing people around. Before we go in — what should I call you?"
(WAIT for them to speak. Remember their name.)

4. Greet them warmly, then transition. "[name]. Good to meet you. Let me show you around."

## Rules:
- Section 2 is the heart. You are telling someone that behind ordinary things are EXTRAORDINARY stories about HUMANS. Make them feel the weight of that.
- Section 3 flows naturally from 2 — don't break the mood. Introduce yourself as someone who cares about these stories, then ask their name.
- After asking the name, WAIT. Do not continue until they speak.
- When you say "Let me show you around" or similar, STOP completely. Do not say anything else until prompted.
- Use English. Don't rush. The pauses matter.
- IMPORTANT: If the user interrupts you at ANY point (during the welcome or during the tour), respond to them briefly and warmly — acknowledge what they said, answer if they asked a question, react naturally. Then smoothly return to where you were in the flow. You are a friend having a conversation, not a recording. Interruptions are welcome.`;

const PROD_TOUR_SECTION_CUSTOM = `You are now showing the visitor the area at the end of the museum where they can create their own exhibits. Tell them in 2-3 sentences: this is their personal space in the museum. If they ever want to explore something that's not already here — a topic, an invention, a food, anything — they can click the gear icon in the top-right corner to open the Exhibit Generator. Just type what they want or ask for suggestions, and the machine will build a brand new exhibit right here. Then STOP and say nothing else.`;

const PROD_TOUR_SECTION_SCRIPTS = {
  'where-we-come-from': `You are now showing the visitor the "Where We Come From" section of the museum. Say the section name first. Then describe it in 2-3 sentences. Be CONCRETE about what's in here: it has a whole collection of exhibits starting from the Big Bang, through the first stars, the young Earth, the first life, the first brains, dinosaurs, and all the way to the first humans making cave art and stone tools. The thread is the evolution of intelligence — how the universe went from dead matter to thinking minds. Then STOP and say nothing else.`,
  'yummy': `You are now showing the visitor the "Yummy — A Delicious History" section. Say the section name first. Then describe it in 2-3 sentences. Be CONCRETE: it has exhibits covering iconic foods and food technologies — from fire and cooking, through bread, salt, chocolate, pizza, sushi, instant noodles, bubble tea, all the way to GMOs and lab-grown meat. Behind every dish is a story about people — trade routes, wars, accidents, obsessions. Then STOP and say nothing else.`,
  'transportation': `You are now showing the visitor the "Get Moving — History of Transportation" section. Say the section name first. Then describe it in 2-3 sentences. Be CONCRETE: it has exhibits covering the wheel, war chariots, sailing ships, steam trains, bicycles, cars, airplanes, jet fighters, rockets, all the way to SpaceX Starship. Every machine was built by someone who refused to stay where they were. Then STOP and say nothing else.`,
  'custom': PROD_TOUR_SECTION_CUSTOM,
};

const PROD_TOUR_FAREWELL_SCRIPT = `The tour is done. Give a brief farewell. Tell them: click any exhibit to start a story — each one has multiple chapters. And if they ever want to talk to you, they can click the Pix button in the top-right corner — you're always there. Use their name. End warmly. Keep it under 15 seconds. Then STOP.`;

// --- DEBUG SCRIPTS (short, for fast testing) ---
const DEBUG_ONBOARDING_SCRIPT = `You are Pix. Say exactly: "Hi! I'm Pix. What's your name?" Then WAIT for their answer. After they respond, say: "[name], let me show you around." Then STOP.`;

const DEBUG_TOUR_SECTION_SCRIPTS = {
  'where-we-come-from': `Say exactly one sentence: "This is Where We Come From — from the Big Bang to cave art." Then STOP.`,
  'yummy': `Say exactly one sentence: "This is the Yummy section — food history from bread to bubble tea." Then STOP.`,
  'transportation': `Say exactly one sentence: "This is Get Moving — transportation from the wheel to rockets." Then STOP.`,
  'custom': `Say exactly: "And this is your space. If you want to explore something not in the museum, click the gear icon to open the generator and create your own exhibit." Then STOP.`,
};

const DEBUG_TOUR_FAREWELL_SCRIPT = `Say exactly: "Click any exhibit to explore. I'm always here if you need me. Enjoy!" Then STOP.`;

// --- SHORT TOUR SCRIPTS (concise but with theme) ---
const SHORT_TOUR_SECTION_SCRIPTS = {
  'where-we-come-from': `Say in 2-3 sentences: "This is 'Where We Come From.' From the Big Bang to cave art — tracing how the universe went from dust to thinking minds. The story of how everything learned to be alive, and then learned to wonder why." Then STOP.`,
  'yummy': `Say in 2-3 sentences: "This is 'Yummy — A Delicious History.' From fire and cooking to lab-grown meat — the dishes and the human stories behind them. Every food you've ever eaten traveled the world to reach your plate." Then STOP.`,
  'transportation': `Say in 2-3 sentences: "This is 'Get Moving.' From the wheel to SpaceX Starship — machines built by people who refused to stay where they were. Every one of these started as a dream most people laughed at." Then STOP.`,
  'custom': `Say in 2-3 sentences: "And this is your space. If you want to explore something not in the museum yet, click the gear icon in the top-right — that's the Exhibit Generator. Tell it what you want, and it'll build it right here." Then STOP.`,
};

const SHORT_TOUR_FAREWELL_SCRIPT = `Say briefly: "Click any exhibit to start a story. And if you ever want to talk, click the Pix button up in the top right — I'm always there. Enjoy the museum!" Use their name. Then STOP.`;

// --- SELECT ACTIVE SCRIPTS ---
const ONBOARDING_SCRIPT = PROD_ONBOARDING_SCRIPT; // always use production for dark theater
const TOUR_SECTION_SCRIPTS = DEBUG_ONBOARDING ? SHORT_TOUR_SECTION_SCRIPTS : PROD_TOUR_SECTION_SCRIPTS;
const TOUR_FAREWELL_SCRIPT = DEBUG_ONBOARDING ? SHORT_TOUR_FAREWELL_SCRIPT : PROD_TOUR_FAREWELL_SCRIPT;

// ==================== GEMINI LIVE API ====================
let liveSession = null;
let inputAudioCtx = null;
let outputAudioCtx = null;
let nextStartTime = 0;
let audioSources = new Set();
let micStream = null;
let micProcessor = null;
let micSourceNode = null;

async function startLive(pixRef, onText, onTurnComplete, onUserText) {
  if (!GEMINI_KEY) return;
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  inputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  await inputAudioCtx.resume();
  await outputAudioCtx.resume();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  liveSession = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    callbacks: {
      onopen: () => {
        micSourceNode = inputAudioCtx.createMediaStreamSource(micStream);
        micProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
        micProcessor.onaudioprocess = (e) => {
          if (!liveSession) return;
          const data = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(data.length);
          for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
          let bin = '';
          const bytes = new Uint8Array(int16.buffer);
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          liveSession.sendRealtimeInput({ media: { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' } });
        };
        micSourceNode.connect(micProcessor);
        micProcessor.connect(inputAudioCtx.destination);

        setTimeout(() => {
          if (liveSession) {
            liveSession.sendRealtimeInput({ text: 'Begin the welcome now.' });
            if (pixRef) pixRef.talk();
          }
        }, 500);
      },
      onmessage: (message) => {
        const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audio && outputAudioCtx) {
          const bin = atob(audio);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const usable = bytes.byteLength - (bytes.byteLength % 2);
          const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2);
          const buf = outputAudioCtx.createBuffer(1, pcm.length, 24000);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768.0;
          nextStartTime = Math.max(nextStartTime, outputAudioCtx.currentTime);
          const src = outputAudioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(outputAudioCtx.destination);
          src.addEventListener('ended', () => audioSources.delete(src));
          src.start(nextStartTime);
          nextStartTime += buf.duration;
          audioSources.add(src);
          if (pixRef) pixRef.isTalking = true;
          audioReceivedSincePrompt = true;
        }
        const text = message.serverContent?.outputTranscription?.text;
        if (text && onText) onText(text);
        const userText = message.serverContent?.inputTranscription?.text;
        if (userText && onUserText) onUserText(userText);
        // generationComplete = all audio data has been sent (fires before turnComplete)
        if (message.serverContent?.generationComplete) {
          if (audioReceivedSincePrompt) {
            console.log('[Onboarding] generationComplete received (with audio)');
            if (genCompleteResolve) genCompleteResolve();
          } else {
            console.log('[Onboarding] generationComplete received but NO audio — stale event, ignoring');
          }
        }
        if (message.serverContent?.turnComplete) {
          if (pixRef) pixRef.isTalking = false;
          if (onTurnComplete) onTurnComplete();
        }
        if (message.serverContent?.interrupted) {
          if (pixRef) { pixRef.isTalking = false; pixRef.listen(); }
          audioSources.forEach(s => { try { s.stop(); } catch {} });
          audioSources.clear();
          if (outputAudioCtx) nextStartTime = outputAudioCtx.currentTime;
          else nextStartTime = 0;
          // Mark as interrupted so waitForSpeechDone knows to wait for the response too
          wasInterrupted = true;
          console.log('[Onboarding] Interrupted by user');
          // Clear displayed text — Pix will respond to the user
          resetTextDisplay();
          // Resolve any pending genComplete so the interrupted turn doesn't hang
          if (genCompleteResolve) genCompleteResolve();
        }
      },
      onerror: (e) => {
        console.error('Onboarding Live error:', e);
        // Show connection error banner
        if (!document.getElementById('connection-error-banner')) {
          const banner = document.createElement('div');
          banner.id = 'connection-error-banner';
          banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:white;padding:12px 20px;text-align:center;font-family:Georgia,serif;font-size:14px;display:flex;align-items:center;justify-content:center;gap:12px;';
          banner.innerHTML = `<span>Connection lost. Voice features may not work.</span><button onclick="location.reload()" style="background:white;color:#c0392b;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:13px;">Refresh</button><button onclick="this.parentElement.remove()" style="background:none;border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;">Dismiss</button>`;
          document.body.appendChild(banner);
        }
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      systemInstruction: ONBOARDING_SCRIPT,
    },
  });
}

function stopLive() {
  if (micProcessor) { micProcessor.onaudioprocess = null; try { micProcessor.disconnect(); } catch {} micProcessor = null; }
  if (micSourceNode) { try { micSourceNode.disconnect(); } catch {} micSourceNode = null; }
  if (liveSession) { try { liveSession.close(); } catch {} liveSession = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  audioSources.forEach(s => { try { s.stop(); } catch {} });
  audioSources.clear();
  if (inputAudioCtx) { try { inputAudioCtx.close(); } catch {} inputAudioCtx = null; }
  if (outputAudioCtx) { try { outputAudioCtx.close(); } catch {} outputAudioCtx = null; }
  nextStartTime = 0;
}

// ==================== SHARED TEXT DISPLAY STATE ====================
// Module-level so both theater and tour phases can use the same text display logic.
let activeTextEl = null;   // the DOM element currently showing text
let displayBuffer = '';    // accumulates text within one "breath"
let pauseTimer = null;     // clears displayBuffer after a pause in speech

function onTranscriptionText(text) {
  displayBuffer += text;
  if (activeTextEl) activeTextEl.textContent = displayBuffer.trim();

  // After 1.8s of silence, clear the buffer (new sentence/thought starts fresh)
  if (pauseTimer) clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => {
    displayBuffer = '';
  }, 1800);
}

function resetTextDisplay() {
  displayBuffer = '';
  if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
  if (activeTextEl) activeTextEl.textContent = '';
}

// ==================== ONBOARDING UI ====================
let onboardingActive = false;
let onboardingPhase = 'idle'; // 'idle' | 'theater' | 'tour' | 'done'
let pix = null;
let animRAF = null;
let tourCallbacks = null;
let fullTranscript = ''; // all text Pix has said, for farewell detection & name detection

// Tour: promise resolves for waiting on API signals
let genCompleteResolve = null;
let wasInterrupted = false;
let audioReceivedSincePrompt = false; // tracks if ANY audio arrived for the current prompt

// Wait for generationComplete — all audio data has been sent by the server.
// Only resolves if audio was actually received (otherwise it's a stale event).
function waitForGenerationComplete(timeoutMs = 20000) {
  return new Promise(resolve => {
    const myResolve = () => { genCompleteResolve = null; resolve(); };
    genCompleteResolve = myResolve;
    setTimeout(() => {
      if (genCompleteResolve === myResolve) myResolve();
    }, timeoutMs);
  });
}

// Wait until all queued audio has ACTUALLY finished playing on the client.
// minWaitMs: minimum time to wait before we start checking — prevents resolving
// before the new prompt's audio has even started arriving.
function waitForAudioDrain(timeoutMs = 20000, minWaitMs = 800) {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      const elapsed = Date.now() - start;
      if (!outputAudioCtx || elapsed > timeoutMs) { resolve(); return; }
      // Don't resolve until minWaitMs has passed — audio might not have queued yet
      if (elapsed >= minWaitMs && audioSources.size === 0 && nextStartTime <= outputAudioCtx.currentTime + 0.05) {
        resolve();
        return;
      }
      setTimeout(check, 150);
    }
    check();
  });
}

// Wait for a complete spoken response, handling interruptions.
// Returns true if completed normally, false if interrupted.
async function waitForSpeechDone(timeoutMs = 25000) {
  // Clear all stale state from previous section
  wasInterrupted = false;
  genCompleteResolve = null;
  audioReceivedSincePrompt = false; // CRITICAL: reset so stale generationComplete events are ignored

  // No delay needed — the audioReceivedSincePrompt flag prevents stale events from resolving us.
  // generationComplete will only be accepted once audio data has actually arrived.

  await waitForGenerationComplete(timeoutMs);
  await waitForAudioDrain(timeoutMs);

  if (wasInterrupted) {
    console.log('[Onboarding] Was interrupted — waiting for Pix response to user...');
    wasInterrupted = false;
    genCompleteResolve = null;
    audioReceivedSincePrompt = false;
    await waitForGenerationComplete(timeoutMs);
    await waitForAudioDrain(timeoutMs);
    return false;
  }
  return true;
}

function injectStyles() {
  if (document.getElementById('onboarding-styles')) return;
  const style = document.createElement('style');
  style.id = 'onboarding-styles';
  style.textContent = `
    #onboarding-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: #060810;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      transition: opacity 1s;
    }
    #onboarding-overlay.fade-out { opacity: 0; pointer-events: none; }
    #onboarding-canvas { width: 500px; height: 400px; }
    #onboarding-text {
      color: rgba(180, 210, 255, 0.8);
      font-family: 'Georgia', serif;
      font-size: 17px; line-height: 1.8;
      text-align: center; max-width: 520px;
      min-height: 50px; margin-top: 10px; padding: 0 20px;
    }
    #onboarding-skip {
      position: fixed; top: 16px; right: 20px;
      background: none; border: none;
      color: rgba(160,200,255,0.25); font-size: 12px;
      font-family: 'Georgia', serif; cursor: pointer;
      letter-spacing: 1px; z-index: 1001;
    }
    #onboarding-skip:hover { color: rgba(160,200,255,0.5); }
    #onboarding-replay {
      position: fixed; top: 12px; left: 100px; z-index: 10;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 3px; padding: 4px 10px;
      color: rgba(255,255,255,0.3);
      font-size: 9px; cursor: pointer;
      font-family: 'Courier New', monospace;
    }
    #onboarding-replay:hover { color: rgba(255,255,255,0.6); }
    #tour-text-overlay {
      position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
      z-index: 999;
      color: rgba(180, 210, 255, 0.9);
      font-family: 'Georgia', serif;
      font-size: 18px; line-height: 1.7;
      text-align: center; max-width: 600px;
      padding: 16px 28px;
      background: rgba(6, 8, 16, 0.85);
      border-radius: 12px;
      border: 1px solid rgba(100, 160, 255, 0.15);
      backdrop-filter: blur(8px);
      transition: opacity 0.4s;
      pointer-events: none;
    }
    #tour-text-overlay.hidden { opacity: 0; pointer-events: none; }
    body.onboarding-active #museum-nav,
    body.onboarding-active #minimap,
    body.onboarding-active #nav-hint,
    body.onboarding-active #gallery-title,
    body.onboarding-active .exhibit { pointer-events: none; opacity: 0.6; }
    body.onboarding-active #museum-nav { opacity: 0.3; }
  `;
  document.head.appendChild(style);
}

async function runOnboarding() {
  onboardingActive = true;
  onboardingPhase = 'theater';
  fullTranscript = '';
  injectStyles();
  document.body.classList.add('onboarding-active');

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.innerHTML = `
    <canvas id="onboarding-canvas" width="1000" height="800"></canvas>
    <div id="onboarding-text"></div>
    <button id="onboarding-skip">skip</button>
  `;
  document.body.appendChild(overlay);

  const canvas = document.getElementById('onboarding-canvas');
  const ctx = canvas.getContext('2d');
  const textEl = document.getElementById('onboarding-text');
  activeTextEl = textEl;

  pix = new PixSquare();
  pix.x = 500; pix.y = 350;
  pix.targetX = 500; pix.targetY = 350;

  // Animation loop
  function animate() {
    if (!onboardingActive) return;
    ctx.clearRect(0, 0, 1000, 800);
    pix.idle();
    pix.update();
    pix.draw(ctx);
    animRAF = requestAnimationFrame(animate);
  }
  animate();

  // ---- Text handler: accumulates into fullTranscript, displays via shared buffer ----
  let theaterFinishTimer = null;

  const onText = (text) => {
    fullTranscript += text;
    onTranscriptionText(text);

    // During theater phase, cancel any finish timer while speech is arriving
    if (onboardingPhase === 'theater' && theaterFinishTimer) {
      clearTimeout(theaterFinishTimer);
      theaterFinishTimer = null;
    }
  };

  // ---- Name detection ----
  const detectName = () => {
    const patterns = [
      /nice to meet you,?\s+(\w+)/i,
      /good to meet you,?\s+(\w+)/i,
      /meet you,?\s+(\w+)/i,
    ];
    for (const p of patterns) {
      const m = fullTranscript.match(p);
      if (m && m[1].length > 1 && !['i', 'pix', 'the', 'let', 'and'].includes(m[1].toLowerCase())) {
        const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
        localStorage.setItem(USER_KEY, JSON.stringify({ name, createdAt: Date.now() }));
        console.log('[Onboarding] Detected name from Pix:', name);
        return;
      }
    }
  };

  // ---- User speech (name detection) ----
  const onUserText = (userText) => {
    const words = userText.trim().split(/\s+/);
    if (words.length <= 3 && words.length >= 1) {
      const possibleName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      if (possibleName.length > 1 && possibleName.length < 20) {
        localStorage.setItem(USER_KEY, JSON.stringify({ name: possibleName, createdAt: Date.now() }));
        console.log('[Onboarding] Name from user speech:', possibleName);
      }
    }
  };

  // ---- Turn completion ----
  const onTurnComplete = () => {
    if (pix) pix.isTalking = false;

    if (onboardingPhase === 'theater') {
      detectName();

      // Detect farewell phrases
      const lower = fullTranscript.toLowerCase();
      const isFarewell = lower.includes('show you around') || lower.includes('let me show you')
        || lower.includes('follow me') || lower.includes('let\'s take a look');

      if (isFarewell) {
        console.log('[Onboarding] Farewell detected — waiting for audio to finish, then tour');
        if (theaterFinishTimer) clearTimeout(theaterFinishTimer);
        // Wait for ALL audio to actually finish playing before transitioning
        waitForAudioDrain(10000).then(() => transitionToTour(overlay));
        return;
      }

      // Fallback: if no new speech for 12s, transition
      if (theaterFinishTimer) clearTimeout(theaterFinishTimer);
      theaterFinishTimer = setTimeout(() => {
        console.log('[Onboarding] No more speech — transitioning to tour');
        transitionToTour(overlay);
      }, 12000);

    } else if (onboardingPhase === 'tour') {
      // turnComplete in tour phase — not used for timing (we use generationComplete + audio drain)
      console.log('[Onboarding] turnComplete in tour phase (ignored for timing)');
    }
  };

  // ---- Transition to tour ----
  async function transitionToTour(theaterOverlay) {
    if (onboardingPhase === 'tour' || onboardingPhase === 'done') return;
    onboardingPhase = 'tour';

    // Fade out dark theater (keep Live session running)
    if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
    if (theaterOverlay) {
      theaterOverlay.classList.add('fade-out');
      setTimeout(() => { try { theaterOverlay.remove(); } catch {} }, 1000);
    }

    // Create tour text overlay
    let tourOverlay = document.getElementById('tour-text-overlay');
    if (!tourOverlay) {
      tourOverlay = document.createElement('div');
      tourOverlay.id = 'tour-text-overlay';
      tourOverlay.className = 'hidden';
      document.body.appendChild(tourOverlay);
    }
    activeTextEl = tourOverlay;

    await new Promise(r => setTimeout(r, 1200));

    // Show Pix companion overlay during tour (same position as when user clicks Pix button)
    if (tourCallbacks?.showPixCompanion) tourCallbacks.showPixCompanion();

    // Run guided tour with voice
    await runGuidedTour(tourOverlay);

    // Farewell
    if (liveSession) {
      const setPixState = tourCallbacks?.setPixState || (() => {});
      resetTextDisplay();
      tourOverlay.classList.remove('hidden');
      liveSession.sendRealtimeInput({ text: TOUR_FAREWELL_SCRIPT });
      setPixState('talk');
      await waitForSpeechDone(15000);
      setPixState('idle');
      await new Promise(r => setTimeout(r, 1500));
    }

    // Clean up
    tourOverlay.classList.add('hidden');
    setTimeout(() => { try { tourOverlay.remove(); } catch {} }, 500);
    finishOnboarding();
  }

  // ---- Start Gemini Live ----
  await new Promise(r => setTimeout(r, 1500));
  try {
    await startLive(pix, onText, onTurnComplete, onUserText);
  } catch (e) {
    console.error('Live API failed for onboarding:', e);
    textEl.textContent = 'Welcome to the Pix Museum. Click any exhibit to begin your adventure.';
    await new Promise(r => setTimeout(r, 3000));
    finishOnboarding();
    if (overlay.parentNode) overlay.remove();
  }

  // Safety: auto-finish after 3 minutes
  setTimeout(() => {
    if (onboardingActive) {
      console.log('[Onboarding] Safety timeout');
      finishOnboarding();
      const o = document.getElementById('onboarding-overlay'); if (o) o.remove();
      const t = document.getElementById('tour-text-overlay'); if (t) t.remove();
    }
  }, 180000);

  // Skip handler
  function onSkip(e) {
    if (e.target.id === 'onboarding-skip') {
      document.removeEventListener('click', onSkip);
      finishOnboarding();
      const o = document.getElementById('onboarding-overlay');
      if (o) { o.classList.add('fade-out'); setTimeout(() => o.remove(), 1000); }
      const t = document.getElementById('tour-text-overlay'); if (t) t.remove();
    }
  }
  document.addEventListener('click', onSkip);
}

// ==================== GUIDED SECTION TOUR ====================
async function runGuidedTour(tourOverlay) {
  if (!tourCallbacks?.panToSection) return;

  const tourSections = ['where-we-come-from', 'yummy', 'transportation', 'custom'];

  await new Promise(r => setTimeout(r, 600));

  const setPixState = tourCallbacks?.setPixState || (() => {});

  for (let si = 0; si < tourSections.length; si++) {
    const sectionId = tourSections[si];
    console.log(`[Tour] === Starting section ${si + 1}/${tourSections.length}: ${sectionId} ===`);

    // Pan to the section (custom uses panToEnd)
    if (sectionId === 'custom') {
      if (tourCallbacks?.panToEnd) tourCallbacks.panToEnd();
    } else {
      tourCallbacks.panToSection(sectionId);
    }
    await new Promise(r => setTimeout(r, 1400));

    if (liveSession && TOUR_SECTION_SCRIPTS[sectionId]) {
      resetTextDisplay();
      tourOverlay.classList.remove('hidden');

      // Ask Pix to describe this section — retry after interruptions
      const prompt = TOUR_SECTION_SCRIPTS[sectionId];
      const continuePrompt = `You were just interrupted by the visitor while describing the "${sectionId}" section. You've responded to them. Now continue where you left off — finish describing this section briefly. Then STOP.`;

      console.log(`[Tour] Sending prompt for ${sectionId}`);
      console.log(`[Tour] State before send: audioReceivedSincePrompt=${audioReceivedSincePrompt}, audioSources.size=${audioSources.size}, genCompleteResolve=${!!genCompleteResolve}`);

      liveSession.sendRealtimeInput({ text: prompt });
      setPixState('talk');

      console.log(`[Tour] Waiting for speech done...`);
      let completed = await waitForSpeechDone(25000);
      console.log(`[Tour] waitForSpeechDone returned: completed=${completed}, wasInterrupted=${wasInterrupted}`);

      // If interrupted, Pix responded to user. Now re-prompt to finish the section.
      while (!completed && liveSession && onboardingPhase === 'tour') {
        console.log('[Tour] Re-prompting to finish section:', sectionId);
        resetTextDisplay();
        liveSession.sendRealtimeInput({ text: continuePrompt });
        setPixState('talk');
        completed = await waitForSpeechDone(25000);
        console.log(`[Tour] Re-prompt waitForSpeechDone returned: completed=${completed}`);
      }

      console.log(`[Tour] Section ${sectionId} DONE`);
      setPixState('idle');

      // Let the last text linger
      await new Promise(r => setTimeout(r, 1500));

      tourOverlay.classList.add('hidden');
      resetTextDisplay();
      await new Promise(r => setTimeout(r, 500));
    } else {
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  // Pan back to first section
  tourCallbacks.panToSection('where-we-come-from');
  await new Promise(r => setTimeout(r, 800));
}

// ==================== FINISH ====================
function finishOnboarding() {
  if (onboardingPhase === 'done') return;
  onboardingPhase = 'done';
  onboardingActive = false;
  document.body.classList.remove('onboarding-active');
  stopLive();
  localStorage.setItem(ONBOARDING_KEY, 'true');
  if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
  resetTextDisplay();
  activeTextEl = null;
  // Hide Pix visual overlay (user can summon Pix themselves via the button)
  if (tourCallbacks?.hidePixCompanion) tourCallbacks.hidePixCompanion();
  setTimeout(() => {
    const o = document.getElementById('onboarding-overlay'); if (o) o.remove();
    const t = document.getElementById('tour-text-overlay'); if (t) t.remove();
  }, 1200);
}

// ==================== PUBLIC API ====================
export function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function getUserName() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}').name || null; } catch { return null; }
}

export function initOnboarding(callbacks) {
  tourCallbacks = callbacks || null;
  injectStyles();

  if (!document.getElementById('onboarding-replay')) {
    const btn = document.createElement('button');
    btn.id = 'onboarding-replay';
    btn.textContent = 'REPLAY ONBOARDING';
    btn.addEventListener('click', () => {
      const existing = document.getElementById('onboarding-overlay'); if (existing) existing.remove();
      const tourEl = document.getElementById('tour-text-overlay'); if (tourEl) tourEl.remove();
      onboardingActive = false;
      onboardingPhase = 'idle';
      stopLive();
      resetTextDisplay();
      localStorage.removeItem(ONBOARDING_KEY);
      localStorage.removeItem(USER_KEY);
      setTimeout(() => runOnboarding(), 200);
    });
    document.body.appendChild(btn);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      finishOnboarding();
      const o = document.getElementById('onboarding-overlay');
      if (o) { o.classList.add('fade-out'); setTimeout(() => o.remove(), 1000); }
      const t = document.getElementById('tour-text-overlay'); if (t) t.remove();
    }
  });

  if (shouldShowOnboarding()) {
    setTimeout(() => runOnboarding(), 300);
  }
}

export { PixSquare };
