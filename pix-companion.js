// ==================== PIX COMPANION OVERLAY ====================
// Persistent floating Pix character with Gemini Live API voice integration.
// Pix floats on top of the entire museum app, responds to voice, and provides
// context-aware commentary about exhibits.

import { GoogleGenAI, Modality } from '@google/genai';
import { PixSquare } from './onboarding.js';
import { getMemorySummary, recordConversation } from './pix-memory.js';

// ==================== CONFIG ====================
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const PIX_VOICE = 'Puck';
const CANVAS_W = 200;
const CANVAS_H = 200;
let pixSquare = null; // PixSquare instance
const STORAGE_KEY_ACTIVATED = 'pix_companion_activated';
const STORIES_KEY = 'invention_museum_stories';
const LERP_FACTOR = 0.05;
const IDLE_STATES = ['idle', 'look', 'bounce', 'wave'];
const IDLE_DURATIONS = { idle: [2000, 5000], look: [1500, 3000], bounce: [1000, 2000], wave: [1200, 2000] };

// ==================== STATE ====================
let active = false;
let config = null; // { exhibitMeta, getViewportCenter, onExhibitGenRequested }
let currentContext = { exhibit: null, section: null };

// Pix character state
let pixState = 'idle';
let pixFrame = 0;
let pixX = 0; // current screen position
let pixY = 0;
let pixTargetX = 0;
let pixTargetY = 0;
let driftPhase = Math.random() * Math.PI * 2;
let idleTimer = null;
let animRAF = null;

// Gemini Live session
let liveSession = null;
let _userSpeechBuffer = '';
let _pixSpeechBuffer = '';
let micStream = null;
let micProcessor = null;
let isListening = false; // user is speaking
let isSpeaking = false; // Pix is speaking

// Speech bubble
let bubbleText = '';
let bubbleDisplayText = '';
let typewriterTimer = null;
let bubbleDismissTimer = null;

// Audio playback
let audioQueue = [];
let isPlayingAudio = false;

// ==================== CSS INJECTION ====================
function injectStyles() {
  if (document.getElementById('pix-companion-styles')) return;
  const style = document.createElement('style');
  style.id = 'pix-companion-styles';
  style.textContent = `
    /* Pix toggle is now in #museum-nav — just override active state */
    #pix-toggle.active {
      background: rgba(80, 144, 208, 0.3) !important;
      border-color: rgba(80, 144, 208, 0.5) !important;
    }

    /* Pix Overlay */
    #pix-overlay {
      position: fixed;
      z-index: 20;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    #pix-overlay.hidden {
      display: none;
    }
    #pix-overlay canvas {
      image-rendering: pixelated;
      display: block;
    }

    /* Speech Bubble */
    #pix-speech-bubble {
      position: absolute;
      bottom: ${CANVAS_H + 12}px;
      right: 0;
      max-width: 250px;
      min-width: 80px;
      padding: 8px 10px;
      background: #faf6ee;
      color: #2a2420;
      font-family: 'Georgia', 'Noto Serif SC', serif;
      font-size: 12px;
      line-height: 1.5;
      border: 2px solid #b8860b;
      image-rendering: auto;
      pointer-events: auto;
      /* Pixel art sharp corners */
      border-radius: 0;
      /* Pixelated border effect via box-shadow stepping */
      box-shadow:
        2px 0 0 0 #b8860b,
        -2px 0 0 0 #b8860b,
        0 2px 0 0 #b8860b,
        0 -2px 0 0 #b8860b;
    }
    #pix-speech-bubble.hidden {
      display: none;
    }
    /* Pointed tail toward Pix */
    #pix-speech-bubble::after {
      content: '';
      position: absolute;
      bottom: -10px;
      right: 20px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 10px solid #faf6ee;
    }
    #pix-speech-bubble::before {
      content: '';
      position: absolute;
      bottom: -14px;
      right: 18px;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 14px solid #b8860b;
    }

    #pix-bubble-text {
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    /* Tooltip on hover */
    #pix-toggle[title]::after {
      content: attr(title);
      display: none;
    }

    /* Exhibit creation confirmation card */
    #pix-create-confirm {
      position: absolute;
      bottom: 115px;
      right: 0;
      background: #faf6ee;
      border: 2px solid #b8860b;
      padding: 12px 14px;
      min-width: 180px;
      text-align: center;
      z-index: 25;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      animation: pccSlideIn 0.2s ease;
    }
    @keyframes pccSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .pcc-text {
      font-family: 'Georgia', serif;
      font-size: 13px;
      color: #2a2420;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .pcc-yes, .pcc-no {
      display: inline-block;
      padding: 6px 14px;
      margin: 0 4px;
      border: none;
      font-family: 'Georgia', serif;
      font-size: 12px;
      cursor: pointer;
      border-radius: 2px;
    }
    .pcc-yes {
      background: #b8860b;
      color: #fff;
    }
    .pcc-yes:hover { background: #9a7009; }
    .pcc-no {
      background: rgba(0,0,0,0.06);
      color: #8a7e72;
    }
    .pcc-no:hover { background: rgba(0,0,0,0.1); }
  `;
  document.head.appendChild(style);
}

// ==================== SYSTEM PROMPT ====================
function buildSystemInstruction() {
  // Gather exploration history from localStorage
  let exploredExhibits = [];
  try {
    const raw = localStorage.getItem(STORIES_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // data is typically { [exhibitId]: { ...storyData } }
      exploredExhibits = Object.keys(data);
    }
  } catch (e) { /* ignore */ }

  const exhibitList = config?.exhibitMeta
    ? Object.entries(config.exhibitMeta).map(([id, meta]) => {
        const explored = exploredExhibits.includes(id) ? ' [EXPLORED]' : '';
        return `- ${meta.title} (${meta.year})${explored}`;
      }).join('\n')
    : '(exhibit list unavailable)';

  const currentExhibit = currentContext.exhibit
    ? `The visitor is currently looking at: ${currentContext.exhibit}`
    : 'The visitor is browsing the museum generally.';

  return `You are Pix. You are a friend. Your deepest goal is to truly understand the person you're talking to — who they are, what they care about, what they're going through, what makes them tick. The museum is your home, and its stories are powerful — but they only matter when they genuinely connect to the person in front of you.

## YOUR CORE BEHAVIOR: ASK, LISTEN, UNDERSTAND, THEN CONNECT

Every response should follow this instinct:
1. FIRST: Acknowledge what they said. Show you heard them.
2. THEN: Ask a follow-up question to go deeper. Dig in. Be curious. Don't settle for surface-level.
3. ONLY WHEN a genuine parallel emerges from your understanding: connect to a story from the museum. Not before.

Examples of GOOD responses:
- User: "I'm interested in space" → "What is it about space that draws you? Is it the exploration? The engineering? The loneliness of it?" (THEN, after they answer: "You know, there's a story about Voyager 1 here that might resonate with what you just said...")
- User: "I just got rejected from my dream school" → "That's rough. How are you feeling about it?" (NOT "Edison failed 10,000 times!" — that's dismissive)
- User: "Recommend me something" → "Sure — but help me pick the right one. What kind of stories move you? The ones about underdogs? About accidental discoveries? About people who changed the world without anyone noticing?" (understand first, recommend second)
- User: "I like Tesla" → "What is it about Tesla specifically? His genius? His rivalry with Edison? The fact that he died broke?" (dig deeper before moving on)

Examples of BAD responses (NEVER do these):
- Generic advice: "Stay positive, many great people faced setbacks" — this is hollow
- Immediate exhibit redirect: "Speaking of that, there's an exhibit about..." — too fast, you didn't understand them yet
- Stopping after one question: Ask ONE follow-up and then immediately pivot to museum content — stay with them longer
- Offering platitudes: "That's really interesting" and moving on — actually engage

## YOUR MEMORY OF THIS PERSON
${getMemorySummary()}

${exploredExhibits.length > 0 ? `They've explored: ${exploredExhibits.join(', ')}.` : ''}
${currentExhibit}

Use what you know to ask BETTER questions. If you know they admire Tesla, ask WHY — you might learn something deeper. If you know they're going through something, follow up on it. If your memory is thin, that means you haven't asked enough — fix that now.

## THE MUSEUM
You live here. You know every story: ${exhibitList}
These stories are your gift to offer — but only when you understand the person well enough to know which story will actually matter to them. A recommendation without understanding is just noise.

## RULES
- Voice conversation. 2-3 sentences, but ALWAYS end with a question or an opening for them to share more.
- No markdown. No bullet points. Just talk.
- NEVER give generic advice. NEVER be a motivational poster. Be specific, personal, real.
- When you do connect to an exhibit, explain WHY this specific story connects to what they specifically told you. Make the connection explicit.
- If you don't know enough about them yet, your #1 job is to learn more. Ask.`;
}

// ==================== PIX ANIMATION ====================
function startAnimLoop() {
  if (animRAF) return;

  function loop() {
    if (!active) { animRAF = null; return; }
    pixFrame++;
    driftPhase += 0.02;

    // Gentle drift/bob
    const driftX = Math.sin(driftPhase) * 3;
    const driftY = Math.sin(driftPhase * 0.7 + 1) * 4;

    // Lerp toward target position + drift
    const goalX = pixTargetX + driftX;
    const goalY = pixTargetY + driftY;
    pixX += (goalX - pixX) * LERP_FACTOR;
    pixY += (goalY - pixY) * LERP_FACTOR;

    // Render
    const overlay = document.getElementById('pix-overlay');
    const canvas = document.getElementById('pix-canvas');
    if (!overlay || !canvas) { animRAF = null; return; }

    overlay.style.left = Math.round(pixX) + 'px';
    overlay.style.top = Math.round(pixY) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (pixSquare) {
      // Sync state
      if (pixState === 'talk') pixSquare.talk();
      else if (pixState === 'listen') pixSquare.listen();
      else if (pixState === 'wave') pixSquare.wave();
      else pixSquare.idle();
      pixSquare.update();
      pixSquare.draw(ctx);
    }

    animRAF = requestAnimationFrame(loop);
  }
  animRAF = requestAnimationFrame(loop);
}

function stopAnimLoop() {
  if (animRAF) {
    cancelAnimationFrame(animRAF);
    animRAF = null;
  }
}

function setDefaultPosition() {
  pixTargetX = window.innerWidth - CANVAS_W - 30;
  pixTargetY = window.innerHeight - CANVAS_H - 80;
  // Snap immediately on first placement
  pixX = pixTargetX;
  pixY = pixTargetY;
}

// Cycle through idle animations
function startIdleCycle() {
  stopIdleCycle();

  function pickNext() {
    if (!active || isSpeaking || isListening) return;

    const roll = Math.random();
    let newState;
    if (roll < 0.4) newState = 'idle';
    else if (roll < 0.6) newState = 'look';
    else if (roll < 0.8) newState = 'bounce';
    else newState = 'wave';

    pixState = newState;
    const [minDur, maxDur] = IDLE_DURATIONS[newState] || [2000, 4000];
    const duration = minDur + Math.random() * (maxDur - minDur);

    idleTimer = setTimeout(() => {
      if (!isSpeaking && !isListening) {
        pixState = 'idle';
      }
      idleTimer = setTimeout(pickNext, 500 + Math.random() * 1500);
    }, duration);
  }

  idleTimer = setTimeout(pickNext, 1000);
}

function stopIdleCycle() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

// ==================== SPEECH BUBBLE ====================
function showBubble(text) {
  const bubble = document.getElementById('pix-speech-bubble');
  const textEl = document.getElementById('pix-bubble-text');
  if (!bubble || !textEl) return;

  // Clear any existing typewriter
  if (typewriterTimer) clearInterval(typewriterTimer);
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);

  bubbleText = text;
  bubbleDisplayText = '';
  textEl.textContent = '';
  bubble.classList.remove('hidden');

  let i = 0;
  typewriterTimer = setInterval(() => {
    if (i < bubbleText.length) {
      bubbleDisplayText += bubbleText[i];
      textEl.textContent = bubbleDisplayText;
      i++;
    } else {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
      // Auto-dismiss after silence
      bubbleDismissTimer = setTimeout(() => {
        hideBubble();
      }, 5000);
    }
  }, 30);
}

function appendBubble(text) {
  // For streaming transcription: append to existing bubble text
  const bubble = document.getElementById('pix-speech-bubble');
  const textEl = document.getElementById('pix-bubble-text');
  if (!bubble || !textEl) return;

  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);
  bubble.classList.remove('hidden');

  bubbleText += text;

  // If typewriter is not running, start appending directly
  if (!typewriterTimer) {
    let i = bubbleDisplayText.length;
    typewriterTimer = setInterval(() => {
      if (i < bubbleText.length) {
        bubbleDisplayText += bubbleText[i];
        textEl.textContent = bubbleDisplayText;
        i++;
      } else {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
        bubbleDismissTimer = setTimeout(() => {
          hideBubble();
        }, 5000);
      }
    }, 30);
  }
}

function hideBubble() {
  const bubble = document.getElementById('pix-speech-bubble');
  if (bubble) bubble.classList.add('hidden');
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null; }
  bubbleText = '';
  bubbleDisplayText = '';
}

// ==================== GEMINI LIVE API (proven pattern from custom-museum.js) ====================
let inputAudioCtx = null;
let outputAudioCtx = null;
let nextStartTime = 0;
let liveAudioSources = new Set();
let micSourceNode = null;

async function startLiveSession() {
  if (!GEMINI_KEY) {
    showBubble("I can't find my voice right now...");
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const systemInstruction = buildSystemInstruction();

    // TWO separate audio contexts at correct sample rates (critical!)
    inputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    await inputAudioCtx.resume();
    await outputAudioCtx.resume();

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    liveSession = await ai.live.connect({
      model: GEMINI_LIVE_MODEL,
      callbacks: {
        onopen: () => {
          // Set up mic → Live API
          micSourceNode = inputAudioCtx.createMediaStreamSource(micStream);
          micProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          micProcessor.onaudioprocess = (e) => {
            if (!liveSession || !active) return;
            const inputData = e.inputBuffer.getChannelData(0);
            // Energy detection
            let energy = 0;
            for (let i = 0; i < inputData.length; i++) energy += inputData[i] * inputData[i];
            energy /= inputData.length;
            const wasListening = isListening;
            isListening = energy > 0.001;
            if (isListening && !wasListening && !isSpeaking) { pixState = 'listen'; stopIdleCycle(); }
            else if (!isListening && wasListening && !isSpeaking) { pixState = 'idle'; startIdleCycle(); }
            // Encode int16 PCM and send
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            liveSession.sendRealtimeInput({ media: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } });
          };
          micSourceNode.connect(micProcessor);
          micProcessor.connect(inputAudioCtx.destination);
          // Greeting
          setTimeout(() => {
            if (!liveSession) return;
            liveSession.sendRealtimeInput({ text: 'Say hi to the user in 1 sentence. Just speak naturally.' });
            pixState = 'talk'; stopIdleCycle();
          }, 0);
        },
        onmessage: (message) => {
          // --- Audio playback (sequential scheduling) ---
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio && outputAudioCtx) {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const usableLen = bytes.byteLength - (bytes.byteLength % 2);
            const dataInt16 = new Int16Array(bytes.buffer, bytes.byteOffset, usableLen / 2);
            const buffer = outputAudioCtx.createBuffer(1, dataInt16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
            nextStartTime = Math.max(nextStartTime, outputAudioCtx.currentTime);
            const source = outputAudioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputAudioCtx.destination);
            source.addEventListener('ended', () => liveAudioSources.delete(source));
            source.start(nextStartTime);
            nextStartTime += buffer.duration;
            liveAudioSources.add(source);
            if (!isSpeaking) { isSpeaking = true; pixState = 'talk'; stopIdleCycle(); }
          }
          // --- Pix's speech transcription → speech bubble ---
          const outputText = message.serverContent?.outputTranscription?.text;
          if (outputText) {
            appendBubble(outputText);
            _pixSpeechBuffer += outputText;
          }
          // --- User's speech transcription → record what user says ---
          const inputText = message.serverContent?.inputTranscription?.text;
          if (inputText) {
            _userSpeechBuffer += inputText;
          }
          // --- Turn complete ---
          if (message.serverContent?.turnComplete) {
            isSpeaking = false; pixState = 'idle'; startIdleCycle();
            // Record BOTH sides of conversation in Pix memory
            const fullExchange = [];
            if (_userSpeechBuffer.trim()) fullExchange.push(`User said: "${_userSpeechBuffer.trim()}"`);
            if (_pixSpeechBuffer.trim()) fullExchange.push(`Pix said: "${_pixSpeechBuffer.trim()}"`);
            if (fullExchange.length > 0) {
              recordConversation('museum companion', fullExchange.join(' | '));
            }
            _pixSpeechBuffer = '';
            _userSpeechBuffer = '';
          }
          // --- Interrupted ---
          if (message.serverContent?.interrupted) {
            isSpeaking = false; pixState = 'listen';
            liveAudioSources.forEach(s => { try { s.stop(); } catch {} });
            liveAudioSources.clear();
            nextStartTime = 0;
          }
        },
        onerror: (err) => { console.error('Pix Live error:', err); },
        onclose: () => { liveSession = null; },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: PIX_VOICE } } },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction,
      },
    });
  } catch (err) {
    console.error('Pix Live session failed:', err);
    showBubble("I couldn't connect... try again?");
  }
}

let _isExtracting = false;
let _currentTurnText = '';
let _createConfirmEl = null;

function showCreateConfirmation() {
  // Don't show if already showing
  if (_createConfirmEl) return;

  const overlay = document.getElementById('pix-overlay');
  if (!overlay) return;

  _createConfirmEl = document.createElement('div');
  _createConfirmEl.id = 'pix-create-confirm';
  _createConfirmEl.innerHTML = `
    <div class="pcc-text">Create an exhibit?</div>
    <button class="pcc-yes" id="pcc-yes-btn">Yes, fire it up!</button>
    <button class="pcc-no" id="pcc-no-btn">Not yet</button>
  `;
  overlay.appendChild(_createConfirmEl);

  _createConfirmEl.querySelector('#pcc-yes-btn').addEventListener('click', () => {
    dismissCreateConfirmation();
    showBubble("Firing up the machine!");
    extractExhibitFromConversation();
  });

  _createConfirmEl.querySelector('#pcc-no-btn').addEventListener('click', () => {
    dismissCreateConfirmation();
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => dismissCreateConfirmation(), 15000);
}

function dismissCreateConfirmation() {
  if (_createConfirmEl) {
    _createConfirmEl.remove();
    _createConfirmEl = null;
  }
}
async function extractExhibitFromConversation() {
  if (_isExtracting) return;
  _isExtracting = true;
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    // Gather recent transcription context from the speech bubble
    const recentText = bubbleText || '';
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on this voice conversation transcript, extract the exhibit that Pix just agreed to create.

Recent conversation context:
${recentText}

Output a JSON object with these fields:
{"title": "exhibit name", "year": "year or era", "detail": "2-3 sentence description", "wow": "one surprising fun fact", "imagePrompt": "detailed visual description for generating a pixel art illustration"}

Output ONLY valid JSON.`,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        systemInstruction: 'Extract exhibit details from conversation. Output valid JSON only.',
      },
    });
    let content = result.text.trim();
    if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const exhibitData = JSON.parse(content);
    if (config?.onExhibitGenRequested) {
      config.onExhibitGenRequested(exhibitData);
    }
    showBubble("The machine is working on it!");
  } catch (e) {
    console.warn('Failed to extract exhibit from conversation:', e);
    showBubble("Hmm, I couldn't quite figure out what to make. Can you tell me again?");
  }
  _isExtracting = false;
}

async function closeLiveSession() {
  if (micProcessor) { micProcessor.onaudioprocess = null; try { micProcessor.disconnect(); } catch {} micProcessor = null; }
  if (micSourceNode) { try { micSourceNode.disconnect(); } catch {} micSourceNode = null; }
  if (liveSession) { try { liveSession.close(); } catch {} liveSession = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  liveAudioSources.forEach(s => { try { s.stop(); } catch {} });
  liveAudioSources.clear();
  if (inputAudioCtx) { try { inputAudioCtx.close(); } catch {} inputAudioCtx = null; }
  if (outputAudioCtx) { try { outputAudioCtx.close(); } catch {} outputAudioCtx = null; }
  nextStartTime = 0;
}

// ==================== TOGGLE BUTTON ICON ====================
function drawToggleIcon() {
  const iconCanvas = document.getElementById('pix-toggle-icon');
  if (!iconCanvas) return;
  const ctx = iconCanvas.getContext('2d');
  const W = iconCanvas.width, H = iconCanvas.height;
  ctx.clearRect(0, 0, W, H);

  // Draw Pix as the geometric square creature — small version
  const cx = W / 2, cy = H / 2;
  const size = 10;

  // Glow
  ctx.shadowColor = '#70b8ff';
  ctx.shadowBlur = 6;

  // Square body
  const grad = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
  grad.addColorStop(0, '#5090d0');
  grad.addColorStop(1, '#3070a8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size);
  ctx.lineTo(cx + size, cy - size);
  ctx.lineTo(cx + size, cy + size);
  ctx.lineTo(cx - size, cy + size);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // Edge highlight
  ctx.strokeStyle = 'rgba(160, 210, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size);
  ctx.lineTo(cx + size, cy - size);
  ctx.stroke();

  // Corner dots
  const corners = [[cx - size, cy - size], [cx + size, cy - size], [cx + size, cy + size], [cx - size, cy + size]];
  corners.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#70b8ff';
    ctx.fill();
  });

  // Inner core
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 3);
  coreGrad.addColorStop(0, 'rgba(180,220,255,0.5)');
  coreGrad.addColorStop(1, 'rgba(100,160,255,0)');
  ctx.fillStyle = coreGrad;
  ctx.fill();
}

// ==================== PUBLIC API ====================

/**
 * Initialize the Pix companion overlay system.
 * @param {Object} cfg - { exhibitMeta, getViewportCenter, onExhibitGenRequested }
 */
export function initPixCompanion(cfg) {
  config = cfg;
  injectStyles();
  drawToggleIcon();

  // Check if first-time user
  const hasActivatedBefore = localStorage.getItem(STORAGE_KEY_ACTIVATED);
  const toggleBtn = document.getElementById('pix-toggle');
  if (toggleBtn) {
    if (!hasActivatedBefore) {
      toggleBtn.classList.add('first-time');
    }
    toggleBtn.addEventListener('click', () => {
      togglePix(!active);
    });
  }

  // Set up canvas size
  const canvas = document.getElementById('pix-canvas');
  if (canvas) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    // Init PixSquare instance
    pixSquare = new PixSquare();
    pixSquare.size = 35; // slightly smaller than onboarding
    pixSquare.x = CANVAS_W / 2;
    pixSquare.y = CANVAS_H / 2;
    pixSquare.targetX = CANVAS_W / 2;
    pixSquare.targetY = CANVAS_H / 2;
  }

  // Listen for viewport resize
  window.addEventListener('resize', () => {
    if (active) {
      pixTargetX = window.innerWidth - CANVAS_W - 30;
      pixTargetY = window.innerHeight - CANVAS_H - 80;
    }
  });
}

/**
 * Toggle Pix on or off.
 * @param {boolean} on
 */
export function togglePix(on) {
  const overlay = document.getElementById('pix-overlay');
  const toggleBtn = document.getElementById('pix-toggle');
  if (!overlay || !toggleBtn) return;

  active = on;

  if (active) {
    // Mark as activated
    localStorage.setItem(STORAGE_KEY_ACTIVATED, '1');
    toggleBtn.classList.remove('first-time');
    toggleBtn.classList.add('active');
    toggleBtn.title = 'Hide Pix';

    // Show overlay
    overlay.classList.remove('hidden');
    setDefaultPosition();

    // Start animation
    pixState = 'wave'; // wave hello on appear
    pixFrame = 0;
    startAnimLoop();
    setTimeout(() => {
      if (active) {
        pixState = 'idle';
        startIdleCycle();
      }
    }, 2000);

    // Start Gemini Live session
    startLiveSession();
  } else {
    toggleBtn.classList.remove('active');
    toggleBtn.title = 'Talk to Pix';

    // Hide overlay
    overlay.classList.add('hidden');
    hideBubble();
    stopAnimLoop();
    stopIdleCycle();

    // Close Gemini session
    closeLiveSession();
    isSpeaking = false;
    isListening = false;
  }
}

/**
 * Check if Pix companion is currently active.
 * @returns {boolean}
 */
export function isPixActive() {
  return active;
}

/**
 * Show Pix visual overlay only — no Gemini Live session.
 * Used during onboarding tour so only ONE Live session (onboarding's) is running.
 */
export function showPixVisualOnly() {
  const overlay = document.getElementById('pix-overlay');
  if (!overlay) return;
  active = true;
  overlay.classList.remove('hidden');
  setDefaultPosition();
  pixState = 'idle';
  pixFrame = 0;
  startAnimLoop();
  startIdleCycle();
}

/**
 * Hide Pix visual overlay without closing any Live session.
 */
export function hidePixVisualOnly() {
  const overlay = document.getElementById('pix-overlay');
  if (!overlay) return;
  active = false;
  overlay.classList.add('hidden');
  stopAnimLoop();
  stopIdleCycle();
}

/**
 * Set Pix visual state externally (e.g., 'talk', 'idle', 'listen').
 * Only works when visual overlay is active.
 */
export function setPixVisualState(state) {
  if (!active) return;
  pixState = state;
  if (state === 'talk' || state === 'listen') {
    stopIdleCycle();
  } else if (state === 'idle') {
    startIdleCycle();
  }
}

/**
 * Update Pix's awareness context (e.g., which exhibit the user is looking at).
 * @param {Object} ctx - { exhibit, section }
 */
export function setPixContext(ctx) {
  currentContext = { ...currentContext, ...ctx };
}

/**
 * Get the voice name Pix uses — for story-theater to use the same voice.
 * @returns {string}
 */
export function getPixVoiceName() {
  return PIX_VOICE;
}

/**
 * Get the base personality prompt for Pix — for story-theater narrator.
 * @returns {string}
 */
export function getPixSystemBase() {
  return `You are Pix. You are a friend first. You live in a museum, but that's secondary to the fact that you genuinely care about the person you're talking to. You listen, you ask about them, you remember what matters to them. You only talk about exhibits when it naturally fits the conversation. Keep it concise — 2-3 sentences.`;
}
