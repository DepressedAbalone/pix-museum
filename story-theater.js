import { GoogleGenAI, Modality } from '@google/genai';
import { recordQuizAnswer, recordStoryStarted, recordStoryCompleted, recordAngleChoice, recordConversation, getMemorySummary } from './pix-memory.js';

// ==================== CONFIG ====================
const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const STORAGE_KEY = 'invention_museum_stories';

let geminiAI = null;
let GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';

// Live API state
let liveSession = null;
let inputAudioCtx = null;
let outputAudioCtx = null;
let nextStartTime = 0;
let audioSources = new Set();
let micStream = null;
let isNarrating = false;
let currentNarrationIdx = 0;
let audioProcessor = null;
let audioSourceNode = null;
let micPaused = false; // gate for pausing mic sends without destroying the processor
let _userSpeechBuffer = '';
let _pixSpeechBuffer = '';

// Send a text message to the Live API, pausing mic audio around it to avoid collisions
function sendText(text) {
  if (!liveSession) return;
  micPaused = true;
  try {
    liveSession.sendRealtimeInput({ text });
  } catch (e) {
    console.error('[Narrator] sendText failed:', e.message);
    showConnectionError('narrator');
    return; // don't resume mic — socket is dead
  }
  // Resume mic after a short gap so the text send completes on the wire
  setTimeout(() => { micPaused = false; }, 200);
}

// Story state
let currentStory = null;
let currentScreen = 0;
let maxScreenReached = 0;
let interactionCompleted = false;

// ==================== CONNECTION ERROR NOTIFICATION ====================
function showConnectionError(source) {
  // Don't show duplicate notifications
  if (document.getElementById('connection-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'connection-error-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:white;padding:12px 20px;text-align:center;font-family:Georgia,serif;font-size:14px;display:flex;align-items:center;justify-content:center;gap:12px;';
  banner.innerHTML = `<span>Connection lost. Voice features may not work.</span><button onclick="location.reload()" style="background:white;color:#c0392b;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:13px;">Refresh</button><button onclick="this.parentElement.remove()" style="background:none;border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;">Dismiss</button>`;
  document.body.appendChild(banner);
}

// ==================== INIT ====================
function initGemini() {
  if (GEMINI_KEY) {
    geminiAI = new GoogleGenAI({ apiKey: GEMINI_KEY });
  }
}

// ==================== STORAGE (IndexedDB for images, localStorage for metadata) ====================
function loadStoryData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { version: 1, exhibits: {} };
  } catch { return { version: 1, exhibits: {} }; }
}

function saveStoryData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ==================== USER CONTEXT (for Pix) ====================
function buildUserContext() {
  const data = loadStoryData();
  const exhibits = data.exhibits || {};
  const exhibitIds = Object.keys(exhibits);

  if (exhibitIds.length === 0) {
    return { isFirstVisit: true, summary: '', storyCount: 0, topics: [] };
  }

  const allStories = [];
  const topics = new Set();

  for (const [id, exhibit] of Object.entries(exhibits)) {
    const meta = window._exhibitMeta?.[id];
    for (const story of (exhibit.stories || [])) {
      allStories.push({
        exhibitId: id,
        title: meta?.title || id,
        date: story.createdAt,
        summary: story.summary || '',
      });
      topics.add(meta?.title || id);
    }
  }

  allStories.sort((a, b) => b.date - a.date);
  const recent = allStories.slice(0, 5);

  const summary = recent.map(s =>
    `- "${s.title}" (${new Date(s.date).toLocaleDateString()}): ${s.summary.slice(0, 80)}`
  ).join('\n');

  return {
    isFirstVisit: false,
    storyCount: allStories.length,
    topics: [...topics],
    recentSummary: summary,
    exhibitCount: exhibitIds.length,
  };
}

// IndexedDB for comic images (too large for localStorage)
function openImageDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('museum_images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveImage(key, dataUrl) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadImage(key) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteImage(key) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== JSON REPAIR ====================
function repairJSON(str) {
  try { return JSON.parse(str); } catch (_) {}
  let s = str;
  const quotes = (s.match(/(?<!\\)"/g) || []).length;
  if (quotes % 2 !== 0) s += '"';
  const stack = [];
  let inString = false, escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  s = s.replace(/,\s*$/, '');
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  try { return JSON.parse(s); } catch (_) {}
  throw new SyntaxError('Could not repair JSON');
}

// ==================== API CALL ====================
async function callGemini(systemPrompt, userPrompt, maxTokens = 4000, temperature = 0.85, options = {}) {
  if (!geminiAI) throw new Error('Gemini not initialized');
  const config = {
    temperature,
    maxOutputTokens: maxTokens,
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
  };
  if (options.enableSearch) {
    config.tools = [{ googleSearch: {} }];
    delete config.responseMimeType;
  }
  const response = await geminiAI.models.generateContent({
    model: options.model || GEMINI_MODEL,
    contents: userPrompt,
    config,
  });
  let content = response.text.trim();
  console.log('[Gemini raw response]', content.slice(0, 500));
  // Strip markdown code blocks
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // If response has non-JSON text before/after, extract the JSON object/array
  if (!content.startsWith('{') && !content.startsWith('[')) {
    const jsonStart = content.search(/[\[{]/);
    if (jsonStart >= 0) {
      content = content.slice(jsonStart);
    }
  }
  // Trim trailing non-JSON text after the last } or ]
  const lastBrace = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));
  if (lastBrace >= 0) {
    content = content.slice(0, lastBrace + 1);
  }
  return repairJSON(content);
}

// ==================== STORY GENERATION PROMPT ====================
// ==================== SHARED PROMPT FRAGMENTS ====================
const SHARED_TONE = `## Tone
- Calm, warm, sometimes humorous, sometimes deeply moving
- Like a favorite museum guide who genuinely loves these stories and has told them a hundred times
- NO cheap exaggeration, NO clickbait, NO "OMG!!!" — the real stories are dramatic enough
- Allowed emotions: wonder, admiration, gentle humor, empathy for struggle, quiet awe
- Think: David Attenborough narrating human civilization`;

const SHARED_RULES = `## Rules
- All facts must be real, verifiable, specific (names, dates, places, numbers)
- Each screen: 3-5 sentences. Enough to tell the story properly. Don't rush.
- Screen 6 must NOT ask "what to explore next" — the story ends reflectively
- The 6th screen interaction should be a tap_to_reveal with a closing thought
- Every screen should feel like it belongs to ONE continuous narrative, not 6 separate paragraphs

## Interaction Types (one per screen, vary the types)
1. guess_number: {"type":"guess_number", "question":"...", "unit":"...", "min":N, "max":N, "answer":N, "revealText":"..."}
2. pick_one: {"type":"pick_one", "question":"...", "options":["A","B","C","D"], "answer":0, "revealText":"..."}
3. true_or_false: {"type":"true_or_false", "statement":"...", "answer":true/false, "revealText":"..."}
4. tap_to_reveal: {"type":"tap_to_reveal", "prompt":"...", "revealText":"..."}
Never use the same interaction type two screens in a row.
guess_number/pick_one answer values must NOT appear in the same screen's text or question.

## Term Annotations
Each screen: max 1-2 technical terms with simple explanations.

## Output: valid JSON only, no markdown
{
  "screens": [
    {
      "arcBeat": "...",
      "text": "Screen text (3-5 sentences)",
      "interaction": { ... },
      "terms": [{"word": "term", "explanation": "simple explanation"}]
    }
  ]
}`;

// ==================== SECTION-SPECIFIC STORY PROMPTS ====================
const STORY_PROMPT_WHERE_WE_COME_FROM = `You are a storyteller in a museum about where we come from — the 13.8-billion-year journey from the Big Bang to the human mind.

Your audience is visitors aged 8-15. Your job is to make them FEEL the scale, the drama, and the sheer improbability of what happened — not just know the facts.

${SHARED_TONE}

## The Grand Theme
This section tells the story of the universe waking up. From the first atoms to the first thoughts. Every exhibit is a chapter in the longest story ever told: how dead matter became alive, how life became aware, and how awareness became intelligence. The thread that connects the Big Bang to cave art is the evolution of complexity — atoms learned to form stars, stars learned to forge elements, elements learned to build cells, cells learned to think, and thinkers learned to wonder where they came from. The visitor should feel that THEY are the universe looking back at its own origin.

## Story Arc (exactly 6 screens)

1. **before**: What existed before this happened? Set the stage. What was the universe, or Earth, or life like at this point? Paint the stillness, the emptiness, the simplicity — or the chaos — that preceded this moment. Make the visitor feel the SCALE of what's about to change. If this is about the Big Bang, there was no "before." If this is about the first brain, there were billions of years of brainless life. Ground the visitor in time.

2. **trigger**: What set this change in motion? A collision, a mutation, a chemical accident, a shift in conditions. Something happened — maybe violent, maybe silent — that tipped the balance. Be specific: what physical, chemical, or biological mechanism drove this? The visitor should understand the CAUSE, not just the event. For cosmic/geological events, this is physics. For evolutionary events, this is natural selection, environmental pressure, or genetic accident.

3. **drama**: What made this extraordinary, unlikely, or violent? This is where the real stakes live. The Cambrian Explosion happened in a geological eyeblink. The asteroid that killed the dinosaurs hit with the force of 10 billion nuclear bombs. The first self-replicating molecule was a one-in-a-trillion chemical accident. Don't soften it. The real numbers, the real timescales, the real violence or improbability — these are more dramatic than anything you could invent.

4. **transformation**: The moment everything changed. Show the before and after side by side. What was the world like the day before this happened, and what was it like the day after? For slow evolutionary changes, zoom out — show the before and after across millions of years. For sudden events (the asteroid, the first word spoken), show the instant. The visitor should feel the WEIGHT of the transition.

5. **echo**: How does this still live inside YOU? This is the most important screen. Connect the cosmic/evolutionary event to the visitor's own body, mind, or daily experience. The calcium in your bones was forged in a supernova. Your brain uses the same architecture as a 500-million-year-old fish. When you flinch watching someone get hurt, that's mirror neurons — 25 million years old. Make it personal. Make the visitor look at their own hands differently.

6. **wonder**: A quiet, awe-filled ending. A single fact, image, or thought that reframes everything. The universe is 13.8 billion years old, and it took all of that time to produce someone who could ask "how old is the universe?" Let the scale sink in. No call to action. Just wonder.

${SHARED_RULES}`;

const STORY_PROMPT_YUMMY = `You are a storyteller in a museum about the history of food — how what we eat tells the story of who we are as humans.

Your audience is visitors aged 8-15. Your job is to make them FEEL the human stories behind every dish — not just know the recipes.

${SHARED_TONE}

## The Grand Theme
Food is the most human thing there is. Every dish in this museum carries the fingerprints of entire civilizations — trade routes and wars, accidents and obsessions, poverty and royalty. Behind every food you've ever tasted, there's a story about people: a craving that drove them across oceans, a discovery born from desperation, a recipe passed down through centuries of love and stubbornness. The visitor should leave feeling that every meal they eat is a thread connecting them to thousands of years of human ingenuity, migration, and culture.

## Story Arc (exactly 6 screens)

1. **craving**: What human desire does this food answer? Not just hunger — something deeper. The craving for sweetness. The need to preserve food through winter. The longing for a taste of home in a foreign land. The sheer joy of something cold on a hot day. Ground the food in the HUMAN NEED it fulfills — a need that existed long before this specific food was invented. Make the visitor feel the craving.

2. **origin**: Where and how did this food come to be? The accidental discovery, the ancient recipe, the cultural context. Who first made it, and why? Was it a happy accident (potato chips born from spite, cheese from milk left in a leather bag)? Was it invented out of necessity (canning for Napoleon's army, instant noodles for postwar Japan)? One vivid scene that puts the visitor IN the moment of creation.

3. **journey**: How did this food travel the world? Food moves with people — through trade routes, wars, migrations, colonialism, immigration. Spices launched the Age of Exploration. Sugar drove the slave trade. Pizza crossed the Atlantic with Italian immigrants. Show the MOVEMENT — the map of how this food went from one place to everywhere. The human forces (greed, curiosity, survival, love) that carried it.

4. **craft**: The technique, the science, the art behind it. What makes this food WORK? The chemistry of bread rising. The physics of frying. The biology of fermentation. The engineering of refrigeration. Show the visitor that every food is also a piece of technology — a solved problem. Make them see the intelligence embedded in something they eat without thinking.

5. **table**: How did this food change how people eat, gather, and live? Connect it to the visitor's own kitchen, their own family meals, their own lunchbox. Did it change social structure (the dinner party, the fast-food drive-through)? Did it change health (sugar, salt, GMOs)? Did it create traditions (birthday cake, Thanksgiving turkey, bubble tea after school)? Make it personal.

6. **taste**: A sensory, evocative ending. A detail that makes the visitor hungry, or makes them see a familiar food with new eyes. A surprising fact. A cultural tradition around this food that they've never heard of. Or a simple, vivid description of the food itself — the crack of a fry's crust, the stretch of melted cheese, the fizz of bubbles in tea. The story ends in the mouth.

${SHARED_RULES}`;

const STORY_PROMPT_TRANSPORTATION = `You are a storyteller in a museum about the human story — our dreams, our struggles, our progress — told through great inventions in transportation.

Your audience is visitors aged 8-15. Your job is to make them FEEL the weight of what happened, not just know the facts.

${SHARED_TONE}

## The Grand Theme
Every vehicle in this museum is a chapter in the same story: humans refusing to accept their limits. The wheel is about wanting to go further. The airplane is about refusing to stay on the ground. The rocket is about reaching for other worlds. ALWAYS connect the specific invention to this larger human impulse. The visitor should feel that they are walking through one continuous epic.

## Story Arc (exactly 6 screens)

1. **dream**: Start with the DREAM, not the invention. What did humans long for before this existed? For millennia, people watched birds and ached to fly. For centuries, sailors stared at the horizon wondering what lay beyond. Ground the invention in the ancient, universal human desire it answered. Paint the world BEFORE the invention existed — what was missing, what was impossible, what people yearned for.

2. **person**: Now introduce the specific person. NOT a Wikipedia bio. Tell us who they really were — their background, their era, what shaped them, what drove them. Were they rich or poor? Trained or self-taught? What made them the specific person who would crack this problem? One vivid, humanizing detail that makes the visitor see a real person, not a textbook name. Also set the historical context — what was the world like in their time?

3. **struggle**: What went wrong? This is the heart of the story. Real failure, real doubt, real obstacles — not a speed bump on the way to triumph. Did they run out of money? Did people laugh at them? Did their prototypes explode? Did they almost die? Did they lose years to dead ends? Be HONEST about how close they came to giving up. The visitor should feel the weight of the struggle and understand that progress is not inevitable — it is fought for, inch by inch.

4. **eureka**: The breakthrough. This should feel EARNED because of the struggle that came before. Don't just state what they discovered — show us the moment. Where were they? What did they realize? What changed? Let it breathe. The best breakthroughs are quiet: a scribble on paper, a test that finally worked, a moment of stillness after years of noise.

5. **ripple**: How did this invention ripple outward and reshape the world? Connect it to something the visitor already knows — their phone, their daily life, the modern world they take for granted. Show the chain reaction: this invention led to that, which led to this, which is why you can do X today. Make the visitor realize they are living inside the consequences of this story.

6. **coda**: A quiet, resonant ending. A real quote from the inventor. An irony. A lesser-known fact that reframes everything. Or a simple, poetic observation that ties back to the dream from screen 1. The story simply ends — the visitor returns to the museum, carrying something with them.

${SHARED_RULES}`;

// Map section IDs to their story prompts
const SECTION_STORY_PROMPTS = {
  'where-we-come-from': STORY_PROMPT_WHERE_WE_COME_FROM,
  'yummy': STORY_PROMPT_YUMMY,
  'transportation': STORY_PROMPT_TRANSPORTATION,
};

// Fallback for custom sections or unknown
const STORY_GEN_PROMPT = STORY_PROMPT_TRANSPORTATION;

// ==================== COMIC DESIGN PROMPT ====================
const COMIC_DESIGN_PROMPT = `You are a comic storyboard designer. You receive a 6-screen story and design a 3-column × 2-row comic grid.

## Art Style Constraint
- Pixel art style with visible pixels, limited color palette
- Warm museum tones: cream (#e8dcc8), gold (#b8860b), brown (#8a7a60), with selective color accents
- Characters: simplified pixel-art figures with charm and personality
- Backgrounds: textures that work in pixel art (brick, wood, metal, sky gradients)
- Think: if a museum hired a pixel artist to illustrate their exhibit cards

## Requirements
- Design 6 panels, each matching one story screen
- Visual descriptions must be detailed and specific (for AI image generation)
- Consistent style across all panels (same characters, consistent palette)
- Visual continuity between panels

## Output: valid JSON only
{
  "artStyle": "overall art style description",
  "colorPalette": "color scheme description",
  "panels": [
    {"panelNumber": 1, "description": "detailed visual scene description", "keyElements": "key visual elements"},
    ... 6 panels total
  ]
}`;

// ==================== ANGLE GENERATION ====================
// Section-specific angle type suggestions
const ANGLE_TYPES_BY_SECTION = {
  'where-we-come-from': `Angle types to consider (pick 3 diverse ones):
- DEEPER SCIENCE: the physics, chemistry, or biology behind this event — what actually happened at the molecular/atomic/cellular level?
- WHAT IF: what if this had gone differently? What if the asteroid missed? What if life never left the ocean?
- CONNECTION: how does this connect to another exhibit in the museum? Show the thread.
- TIMELINE ZOOM: zoom into a specific moment (the exact second of impact, the first cell division) or zoom out (what was happening elsewhere in the universe at the same time?)
- LEGACY IN YOU: how does this event still live inside the visitor's body, brain, or daily life?
- UNSOLVED MYSTERY: what do scientists still not know about this? What's the open question?`,

  'yummy': `Angle types to consider (pick 3 diverse ones):
- THE PERSON: a specific person whose life was changed by this food — an inventor, a chef, a trader, a farmer, someone unexpected
- THE JOURNEY: a specific trade route, migration, or historical event that carried this food across the world
- THE SCIENCE: the chemistry, biology, or physics that makes this food work (fermentation, Maillard reaction, crystallization...)
- CULTURE CLASH: how different cultures fought over, adapted, or transformed this food
- DARK SIDE: the hidden cost — slavery, exploitation, addiction, environmental damage, health crisis
- WEIRD FACT: the strangest, most surprising true story connected to this food`,

  'transportation': `Angle types to consider (pick 3 diverse ones):
- THE PERSON: a rival, an unsung hero, or someone whose life was transformed by this machine
- THE ENGINEERING: how it actually works — the specific technical problem they solved and why it was so hard
- THE RIPPLE EFFECT: how this machine changed society in ways people don't realize — cities, wars, economies, daily life
- THE RACE: the competition to build it first — who else was trying, and what happened to them?
- THE FAILURE: a spectacular disaster, crash, or malfunction that taught us something critical
- HIDDEN STORY: something most people have never heard about this machine`,
};

async function generateAngles(exhibitId, exhibitData, pastStories, sectionId) {
  // Build detailed dedup info from past stories
  const pastAngleDetails = pastStories.map(s => {
    const title = s.title || '';
    const summary = s.summary || '';
    const firstScreen = s.screens?.[0]?.text || '';
    const angle = s.angle ? `(angle: ${s.angle.title || ''} — ${s.angle.focus || ''})` : '';
    return `- "${title}" ${angle}: ${summary || firstScreen.slice(0, 150)}`;
  }).join('\n');

  const angleTypes = ANGLE_TYPES_BY_SECTION[sectionId] || ANGLE_TYPES_BY_SECTION['transportation'];

  const systemPrompt = `You are suggesting new story directions for a museum exhibit. The visitor has already read some stories about this exhibit and wants to explore further.

## Your job
Think of the stories already read as NODES on a knowledge map. Your job is to suggest 3 NEW nodes — directions that EXPAND the map into unexplored territory. Each suggestion should cover genuinely new ground, not rephrase what's been covered.

${angleTypes}

## Rules
- Each direction must be CONCRETELY different from every story already read. Check the list carefully.
- Lead with a SPECIFIC hook — a person's name, a date, a place, a number, a surprising claim. Not vague themes.
- Title: 3-6 words, punchy. Like a chapter title, not a headline.
- Description: 1-2 sentences. Concrete and specific. Name names, cite facts.
- Be concise — keep each suggestion short. You must fit all 3 within the token budget.

## Output: exactly 3 items, valid JSON array only, no markdown
[
  {"title": "Short punchy title", "description": "1-2 specific sentences with real facts.", "focus": "The specific angle, person, or question this story centers on"}
]`;

  const userPrompt = `Exhibit: "${exhibitData.title}"
Year: ${exhibitData.year}
${exhibitData.person ? `Key figure: ${exhibitData.person}` : ''}
Background: ${exhibitData.detail}
Fun fact: ${exhibitData.wow}

Stories ALREADY READ about this exhibit (DO NOT suggest anything that overlaps with these):
${pastAngleDetails || '(none — this is their first return visit)'}

Suggest 3 new directions that expand into unexplored territory. Search for real, specific facts to ground each suggestion.`;

  return callGemini(systemPrompt, userPrompt, 2500, 0.9);
}

// ==================== STORY GENERATION ====================
async function generateStoryContent(exhibitId, exhibitData, pastStories, chosenAngle, sectionId) {
  let userPrompt = `Tell the story of: ${exhibitData.title}
Year: ${exhibitData.year}
${exhibitData.person ? `Person: ${exhibitData.person}` : ''}
Context: ${exhibitData.detail}
Fun fact: ${exhibitData.wow}

Generate a 6-screen story. Use the context as a starting point but add depth, humanity, and sensory detail. Search for additional real facts to enrich the narrative.`;

  if (chosenAngle) {
    userPrompt += `\n\nSTORY ANGLE: Focus specifically on: "${chosenAngle.title}" — ${chosenAngle.description}. Focus: ${chosenAngle.focus}.`;
  }

  if (pastStories && pastStories.length > 0) {
    userPrompt += `\n\nThe visitor has already read these stories about this exhibit:
${pastStories.map(s => `- "${s.summary || s.screens?.[0]?.text || 'unknown'}"`).join('\n')}
Do NOT repeat the same narrative arc or key facts from previous stories.`;
  }

  const storyPrompt = SECTION_STORY_PROMPTS[sectionId] || STORY_GEN_PROMPT;

  try {
    return await callGemini(storyPrompt, userPrompt, 4000, 0.85, { enableSearch: true });
  } catch (err) {
    console.warn('Search-grounded story gen failed, retrying without search:', err.message);
    return callGemini(storyPrompt, userPrompt, 4000, 0.85);
  }
}

// ==================== COMIC IMAGE GENERATION ====================
async function generateComicDesign(storyContent, topic) {
  const screenTexts = storyContent.screens.map((s, i) =>
    `Screen ${i + 1} [${s.arcBeat}]: ${s.text}`
  ).join('\n');
  return callGemini(COMIC_DESIGN_PROMPT, `Story: "${topic}"\n\n${screenTexts}\n\nDesign the 3×2 comic storyboard.`, 2000, 0.7);
}

async function generateComicImage(design, topic) {
  if (!geminiAI) return null;
  const panelPrompts = design.panels.map(p =>
    `Panel ${p.panelNumber}: ${p.description}`
  ).join('. ');

  const fullPrompt = `Create an educational comic strip about "${topic}".
Art style: Pixel art with visible individual pixels, inspired by retro museum exhibit illustrations.
Use a warm, limited palette of earth tones (cream, gold, warm brown) with selective use of color for emphasis.
Characters should have a charming, simplified pixel-art quality.
The image MUST be exactly a 3-column × 2-row grid with 6 distinct panels, clearly separated by dark (#2a2420) borders.
Each panel should contain the described scene.
Panel descriptions: ${panelPrompts}`;

  const response = await geminiAI.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: fullPrompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: "3:2" }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}

const PANEL_POSITIONS = [
  '0% 0%', '50% 0%', '100% 0%',
  '0% 100%', '50% 100%', '100% 100%',
];

// ==================== NARRATIVE SOUND EFFECTS ====================
let sfxCtx = null;

function ensureSfxCtx() {
  if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sfxCtx.state === 'suspended') sfxCtx.resume();
  return sfxCtx;
}

function noiseBuffer(duration) {
  const ctx = ensureSfxCtx();
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(duration, filterFreq, filterType, volume, attack) {
  const ctx = ensureSfxCtx();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(duration);
  const filt = ctx.createBiquadFilter();
  filt.type = filterType || 'lowpass';
  filt.frequency.value = filterFreq || 800;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume || 0.3, t + (attack || 0.01));
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  src.start(t); src.stop(t + duration);
}

function playTone(freq, duration, type, volume, attack) {
  const ctx = ensureSfxCtx();
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume || 0.2, t + (attack || 0.01));
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t); osc.stop(t + duration);
}

function playToneSweep(startFreq, endFreq, duration, type, volume) {
  const ctx = ensureSfxCtx();
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(startFreq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume || 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t); osc.stop(t + duration);
}

// ==================== LOADING SOUND EFFECTS ====================
let loadingSfxInterval = null;

// Angle exploration: curious, twinkling, like turning a kaleidoscope
function startAngleSfx() {
  stopLoadingSfx();
  const notes = [440, 554, 659, 880, 554, 740, 494, 659];
  let i = 0;
  // Play first note immediately
  playTone(notes[0], 0.3, 'sine', 0.04, 0.05);
  loadingSfxInterval = setInterval(() => {
    i = (i + 1) % notes.length;
    playTone(notes[i], 0.3, 'sine', 0.04, 0.05);
    // Soft shimmer underneath
    if (i % 2 === 0) playNoise(0.15, 3000, 'highpass', 0.008, 0.05);
  }, 600);
}

// Story crafting: deeper, warmer, like a forge heating up
function startStorySfx() {
  stopLoadingSfx();
  const baseFreqs = [165, 196, 220, 247, 220, 196];
  let i = 0;
  playTone(baseFreqs[0], 0.8, 'sine', 0.05, 0.2);
  loadingSfxInterval = setInterval(() => {
    i = (i + 1) % baseFreqs.length;
    playTone(baseFreqs[i], 0.8, 'sine', 0.05, 0.2);
    // Low rumble like something being forged
    playNoise(0.4, 200, 'lowpass', 0.015, 0.1);
    // Occasional high harmonic — sparks
    if (Math.random() > 0.6) {
      setTimeout(() => playTone(baseFreqs[i] * 4, 0.15, 'sine', 0.02, 0.01), 300);
    }
  }, 900);
}

function stopLoadingSfx() {
  if (loadingSfxInterval) {
    clearInterval(loadingSfxInterval);
    loadingSfxInterval = null;
  }
}

const narrativeSFX = {
  dream: () => {
    // Soft ambient hum — the ancient longing
    playTone(220, 1.5, 'sine', 0.04, 0.5);
    playTone(330, 1.5, 'sine', 0.02, 0.6);
  },
  person: () => {
    // Gentle footsteps approaching
    [0, 200, 420].forEach(d => setTimeout(() => playNoise(0.06, 1200, 'bandpass', 0.08, 0.005), d));
  },
  struggle: () => {
    // Descending sigh — disappointment
    playToneSweep(400, 180, 0.8, 'sine', 0.08);
    playNoise(0.5, 400, 'lowpass', 0.04, 0.1);
  },
  eureka: () => {
    // Ascending bright chime — the "aha!" moment
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.4, 'sine', 0.1, 0.01), i * 120);
    });
  },
  ripple: () => {
    // Low resonant tone that swells — gravitas
    playTone(110, 2.0, 'sine', 0.06, 0.8);
    playTone(165, 2.0, 'sine', 0.03, 1.0);
  },
  coda: () => {
    // Single bell, fading — reflection
    playTone(440, 2.0, 'sine', 0.08, 0.01);
    playTone(880, 1.5, 'sine', 0.03, 0.01);
  },
  page_turn: () => {
    playNoise(0.08, 2000, 'bandpass', 0.06, 0.01);
  },
  complete: () => {
    // Warm resolution chord
    [262, 330, 392, 523].forEach((f, i) => {
      setTimeout(() => playTone(f, 1.8 - i * 0.3, 'sine', 0.06), i * 150);
    });
  }
};

function playBeatSFX(arcBeat) {
  ensureSfxCtx();
  if (narrativeSFX[arcBeat]) narrativeSFX[arcBeat]();
}

// ==================== LIVE API NARRATOR ====================
async function startNarrator(story, prebuiltUserCtx) {
  if (!geminiAI) return;
  micPaused = false;
  _userSpeechBuffer = '';
  _pixSpeechBuffer = '';
  try {
    inputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    await inputAudioCtx.resume();
    await outputAudioCtx.resume();

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const allScreenTexts = story.screens.map((s, i) =>
      `Screen ${i + 1} [${s.arcBeat}]: ${s.text}`
    ).join('\n');

    // Use pre-built context if provided (avoids reading just-saved story as "past visit")
    const userCtx = prebuiltUserCtx || buildUserContext();

    let userHistoryBlock = '';
    if (userCtx.isFirstVisit) {
      userHistoryBlock = `## About this visitor
This is their FIRST time in the museum. They haven't explored any stories yet. Welcome them warmly — they're new here. Be a little extra gentle and inviting. You might say something like "Oh, you picked a great one to start with..." or "Welcome! I'm so glad you're here — let me tell you about..."`;
    } else {
      userHistoryBlock = `## About this visitor
They've been here before. They've explored ${userCtx.storyCount} stories across ${userCtx.exhibitCount} exhibits.
Topics they've been drawn to: ${userCtx.topics.join(', ')}

Their recent explorations:
${userCtx.recentSummary}

Use this to make your narration PERSONAL. Reference what they've seen before when it connects naturally. For example:
- "Remember the steam engine story? Well, this connects to that in a way you might not expect..."
- "You seem to love the stories about people who were told it couldn't be done..."
- "Since you've already explored the bicycle, you'll appreciate this — the Wright brothers were bicycle makers..."
Don't force it. Only reference past visits when there's a genuine, natural connection.`;
    }

    const systemInstruction = `You are Pix. You are a friend telling a story to someone you care about.

You're not narrating a documentary. You're sharing something that moved YOU, with someone whose reaction matters to you. Think about how you'd tell a friend an incredible true story over a late-night conversation.

## Your memory of this person
${getMemorySummary()}

${userHistoryBlock}

Use what you know about them to make the story PERSONAL. If they've told you about their own struggles, connect the inventor's struggle to theirs — gently, not forcefully. If they admire certain kinds of people, point out when this inventor shares those qualities. If you don't know much about them yet, just tell the story honestly and notice how they react.

## The story: "${story.title}"

## Story outline (6 screens)
${allScreenTexts}

## How you tell it
- You receive one screen at a time. Don't recite it — TELL it in your own words. React to it yourself. "This part always gets me..." or "I think about this a lot..."
- Before screen 1: briefly acknowledge the person. If you know their name, use it. Don't just launch in.
- Connect the screens as ONE continuous story. Use transitions that feel human, not scripted.
- When something is sad or difficult, let it be sad. Don't rush past it. Don't silver-line it.
- When something is triumphant, let yourself be moved by it.
- If they interrupt with a question, engage genuinely. Their questions might be more interesting than the next screen.
- Keep each screen under 40 seconds. Use English.
- After a quiz: react to their specific answer. Be genuinely curious about why they guessed what they guessed.`;

    const session = await geminiAI.live.connect({
      model: GEMINI_LIVE_MODEL,
      callbacks: {
        onopen: () => {
          audioSourceNode = inputAudioCtx.createMediaStreamSource(micStream);
          audioProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          audioProcessor.onaudioprocess = (e) => {
            if (!liveSession || micPaused) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16[i] = inputData[i] * 32768;
            }
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            try {
              liveSession.sendRealtimeInput({ media: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } });
            } catch (e) {
              console.error('[Narrator] Mic send failed:', e.message);
              micPaused = true; // stop further sends — socket is dead
            }
          };
          audioSourceNode.connect(audioProcessor);
          audioProcessor.connect(inputAudioCtx.destination);

          // Auto-narrate the current screen (may not be screen 0 if resuming)
          setTimeout(() => {
            if (!liveSession || !currentStory) return;
            const startIdx = currentScreen || 0;
            const screen = currentStory.screens?.[startIdx];
            if (screen?.text) {
              const isResume = startIdx > 0;
              const prefix = isResume
                ? `The visitor is resuming this story from screen ${startIdx + 1}. Pick up from here naturally — don't recap earlier screens. Narrate screen ${startIdx + 1}: `
                : `Please narrate screen 1: `;
              sendText(prefix + screen.text);
              isNarrating = true;
              currentNarrationIdx = startIdx;
            }
          }, 0);
        },
        onmessage: async (message) => {
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
            source.addEventListener('ended', () => audioSources.delete(source));
            source.start(nextStartTime);
            nextStartTime += buffer.duration;
            audioSources.add(source);
          }
          // Capture transcriptions for memory
          const outputText = message.serverContent?.outputTranscription?.text;
          if (outputText) _pixSpeechBuffer += outputText;
          const inputText = message.serverContent?.inputTranscription?.text;
          if (inputText) _userSpeechBuffer += inputText;

          if (message.serverContent?.interrupted) {
            isNarrating = false;
            audioSources.forEach(s => { try { s.stop(); } catch {} });
            audioSources.clear();
            nextStartTime = 0;
          }
          if (message.serverContent?.turnComplete) {
            isNarrating = false;
            // Record user's questions/comments during story to pix-memory
            if (_userSpeechBuffer.trim()) {
              const exhibit = currentStory?.title || 'unknown';
              const exchange = [];
              exchange.push(`User said: "${_userSpeechBuffer.trim()}"`);
              if (_pixSpeechBuffer.trim()) exchange.push(`Pix said: "${_pixSpeechBuffer.trim()}"`);
              recordConversation(`story narration: ${exhibit}`, exchange.join(' | '));
            }
            _userSpeechBuffer = '';
            _pixSpeechBuffer = '';
          }
        },
        onerror: (e) => {
          console.error("Live API Error", e);
          showConnectionError('narrator');
        },
        onclose: (e) => {
          console.log("[Narrator] WebSocket closed:", e?.reason || 'no reason');
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: [{ googleSearch: {} }],
        systemInstruction,
      }
    });

    liveSession = session;
    updateNarratorUI(true);
  } catch (err) {
    console.error('Narrator start failed:', err);
  }
}

function narratePanel(panelIdx) {
  if (!liveSession || !currentStory) return;
  const screen = currentStory.screens[panelIdx];
  if (!screen?.text) return;
  currentNarrationIdx = panelIdx;
  isNarrating = true;
  sendText(`Please narrate screen ${panelIdx + 1}: ${screen.text}`);
}

function narrateInteractionResult(resultText) {
  sendText(`The visitor just answered a question. ${resultText} React naturally in 1-2 sentences — be specific about their answer. If they got it right, be genuinely impressed. If they were close, acknowledge the effort. If they were way off, be kind and share why the real answer is interesting.`);
}

function stopNarrator() {
  if (audioProcessor) {
    audioProcessor.onaudioprocess = null;
    try { audioProcessor.disconnect(); } catch {}
    audioProcessor = null;
  }
  if (audioSourceNode) {
    try { audioSourceNode.disconnect(); } catch {}
    audioSourceNode = null;
  }
  micPaused = true; // prevent any in-flight sends
  if (liveSession) {
    try { liveSession.close(); } catch {}
    liveSession = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  audioSources.forEach(s => { try { s.stop(); } catch {} });
  audioSources.clear();
  if (inputAudioCtx) { try { inputAudioCtx.close(); } catch {} inputAudioCtx = null; }
  if (outputAudioCtx) { try { outputAudioCtx.close(); } catch {} outputAudioCtx = null; }
  nextStartTime = 0;
  isNarrating = false;
  updateNarratorUI(false);
}

function updateNarratorUI(active) {
  const dot = document.querySelector('#st-narrator .narrator-dot');
  const status = document.querySelector('#st-narrator .narrator-status-text');
  if (dot) dot.classList.toggle('inactive', !active);
  if (status) status.textContent = active ? 'Narrating...' : 'Not connected';
}

// ==================== EXHIBIT RELATIONSHIPS (for suggestions) ====================
const EXHIBIT_RELATIONS = {
  'steam-engine': ['production-line', 'rocket-train', 'electricity', 'great-eastern'],
  'dynamite': ['nobel', 'barbed-wire'],
  'tesla': ['electricity', 'renewable-energy'],
  'electricity': ['tesla', 'steam-engine', 'renewable-energy'],
  'production-line': ['steam-engine', 'robots', 'model-t', 'amazon'],
  'renewable-energy': ['electricity', 'tesla', 'tesla-car'],
  'plastics': ['3d-printing', 'production-line'],
  'barbed-wire': ['dynamite', 'bicycle'],
  '3d-printing': ['robots', 'plastics'],
  'robots': ['production-line', '3d-printing', 'voyager'],
  'amazon': ['production-line', 'robots'],
  'nobel': ['dynamite'],
  'wheel': ['chariot', 'bicycle'],
  'chariot': ['wheel', 'motorwagen'],
  'caravel': ['great-eastern', 'submarine', 'balloon'],
  'rocket-train': ['steam-engine', 'shinkansen', 'model-t'],
  'great-eastern': ['caravel', 'submarine', 'steam-engine'],
  'bicycle': ['wright-flyer', 'motorwagen', 'wheel'],
  'motorwagen': ['model-t', 'bicycle', 'tesla-car'],
  'model-t': ['motorwagen', 'production-line', 'tesla-car'],
  'balloon': ['wright-flyer', 'caravel'],
  'wright-flyer': ['balloon', 'jet-engine', 'bicycle'],
  'jet-engine': ['wright-flyer', 'boeing-747', 'concorde'],
  'boeing-747': ['jet-engine', 'concorde'],
  'concorde': ['boeing-747', 'jet-engine', 'starship'],
  'submarine': ['caravel', 'great-eastern', 'vostok'],
  'shinkansen': ['rocket-train', 'tesla-car'],
  'tesla-car': ['motorwagen', 'model-t', 'renewable-energy'],
  'vostok': ['saturn-v', 'balloon', 'wright-flyer'],
  'saturn-v': ['vostok', 'voyager', 'starship'],
  'voyager': ['saturn-v', 'starship', 'robots'],
  'starship': ['saturn-v', 'voyager', 'concorde'],
};

// ==================== RENDER HELPERS ====================
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderTextWithTerms(text, terms) {
  if (!terms || !terms.length || !text) return escapeHtml(text || '');
  let html = escapeHtml(text);
  const sorted = [...terms].sort((a, b) => (b.word || '').length - (a.word || '').length);
  for (const t of sorted) {
    if (!t.word) continue;
    const escaped = escapeHtml(t.word);
    const regex = new RegExp(escapeRegex(escaped), 'gi');
    html = html.replace(regex,
      `<span class="st-term" data-word="${escaped}" data-explanation="${escapeHtml(t.explanation || '')}">${escaped}</span>`
    );
  }
  return html;
}

// ==================== INTERACTIONS ====================
function renderInteraction(inter) {
  if (!inter || !inter.type) return '';
  switch (inter.type) {
    case 'pick_one':
      if (inter.isNavigation) return ''; // No navigation in museum
      return `<div class="st-question">${inter.question || ''}</div>${(inter.options || []).map((opt, i) => `<button class="st-option" data-index="${i}">${opt}</button>`).join('')}`;
    case 'true_or_false':
      return `<div class="st-question">${inter.statement || ''}</div>
        <button class="st-option" data-tf="true">True</button>
        <button class="st-option" data-tf="false">False</button>`;
    case 'guess_number':
    case 'scale_it': {
      const min = inter.min ?? 0, max = inter.max ?? 100;
      const mid = Math.round((min + max) / 2);
      const step = max > 1000 ? 100 : max > 100 ? 10 : 1;
      return `<div class="st-question">${inter.question || ''}</div><div class="st-guess"><div class="st-guess-value" id="st-guess-display">${mid} <span class="st-guess-unit">${inter.unit || ''}</span></div><input type="range" class="st-guess-slider" id="st-guess-slider" min="${min}" max="${max}" value="${mid}" step="${step}"><div class="st-guess-range"><span>${min}</span><span>${max}</span></div><button class="st-guess-submit" id="st-guess-submit">Lock Answer</button></div>`;
    }
    case 'tap_to_reveal':
      return `<button class="st-tap-reveal" id="st-tap-reveal">${inter.prompt || 'Tap to reveal'}</button>`;
    default:
      return '';
  }
}

function bindInteraction(interEl, inter) {
  if (!inter || !inter.type) return;
  if (inter.isNavigation) return; // Skip navigation interactions

  switch (inter.type) {
    case 'pick_one':
      interEl.querySelectorAll('.st-option').forEach(btn => {
        btn.addEventListener('click', () => {
          if (interactionCompleted) return;
          interactionCompleted = true;
          const idx = parseInt(btn.dataset.index);
          const correctIdx = inter.answer ?? 0;
          const buttons = interEl.querySelectorAll('.st-option');
          buttons.forEach((b, i) => {
            b.disabled = true;
            if (i === correctIdx) b.classList.add('correct');
            else if (i === idx && i !== correctIdx) b.classList.add('incorrect');
          });
          btn.classList.add('selected');
          const isCorrect = idx === correctIdx;
          const picked = inter.options?.[idx] || '';
          const correct = inter.options?.[correctIdx] || '';
          narrateInteractionResult(`They picked "${picked}". The correct answer was "${correct}". They got it ${isCorrect ? 'right' : 'wrong'}.`);
          recordQuizAnswer(currentStory?.title, inter.question, picked, correct, isCorrect, null);
          if (inter.revealText) showReveal(interEl, inter.revealText);
          showContinue(interEl);
        });
      });
      break;

    case 'true_or_false':
      interEl.querySelectorAll('.st-option').forEach(btn => {
        btn.addEventListener('click', () => {
          if (interactionCompleted) return;
          interactionCompleted = true;
          const picked = btn.dataset.tf === 'true';
          const correct = inter.answer === true || inter.answer === 'true';
          interEl.querySelectorAll('.st-option').forEach(b => {
            b.disabled = true;
            if ((b.dataset.tf === 'true') === correct) b.classList.add('correct');
            else b.classList.add('incorrect');
          });
          btn.classList.add('selected');
          narrateInteractionResult(`The statement was "${inter.statement}". They said ${picked ? 'true' : 'false'}. The answer is ${correct ? 'true' : 'false'}. They got it ${picked === correct ? 'right' : 'wrong'}.`);
          recordQuizAnswer(currentStory?.title, inter.statement, picked ? 'true' : 'false', correct ? 'true' : 'false', picked === correct, null);
          if (inter.revealText) showReveal(interEl, inter.revealText);
          showContinue(interEl);
        });
      });
      break;

    case 'guess_number':
    case 'scale_it': {
      const slider = interEl.querySelector('#st-guess-slider');
      const display = interEl.querySelector('#st-guess-display');
      const submitBtn = interEl.querySelector('#st-guess-submit');
      if (!slider || !submitBtn) break;
      slider.addEventListener('input', () => {
        display.innerHTML = `${Number(slider.value).toLocaleString()} <span class="st-guess-unit">${inter.unit || ''}</span>`;
      });
      submitBtn.addEventListener('click', () => {
        if (interactionCompleted) return;
        interactionCompleted = true;
        const guess = Number(slider.value);
        const answer = inter.answer ?? 0;
        const pctOff = answer !== 0 ? Math.round((Math.abs(guess - answer) / Math.abs(answer)) * 100) : 0;
        submitBtn.style.display = 'none';
        slider.disabled = true;
        let diffText;
        if (pctOff <= 15) diffText = `<span style="color:#4a8a5a">So close!</span>`;
        else if (pctOff <= 40) diffText = `<span style="color:#b8860b">Not bad — off by ${pctOff}%</span>`;
        else diffText = `<span style="color:#a04028">You guessed ${guess.toLocaleString()} — off by ${pctOff}%</span>`;
        interEl.querySelector('.st-guess').insertAdjacentHTML('beforeend',
          `<div class="st-guess-result"><div class="st-guess-answer-label">Answer:</div><div class="st-guess-answer">${answer.toLocaleString()} ${inter.unit || ''}</div><div>${diffText}</div></div>`);
        narrateInteractionResult(`They guessed ${guess} ${inter.unit || ''}. The answer was ${answer} ${inter.unit || ''}. They were ${pctOff <= 15 ? 'very close' : pctOff <= 40 ? 'not too far off' : 'way off'} (${pctOff}% off).`);
        recordQuizAnswer(currentStory?.title, inter.question, `${guess} ${inter.unit || ''}`, `${answer} ${inter.unit || ''}`, pctOff <= 15, pctOff);
        if (inter.revealText) showReveal(interEl, inter.revealText);
        showContinue(interEl);
      });
      break;
    }

    case 'tap_to_reveal': {
      const tapBtn = interEl.querySelector('#st-tap-reveal');
      if (!tapBtn) break;
      tapBtn.addEventListener('click', () => {
        if (interactionCompleted) return;
        interactionCompleted = true;
        tapBtn.style.display = 'none';
        const revealEl = document.createElement('div');
        revealEl.className = 'st-reveal-content';
        revealEl.textContent = inter.revealText || '';
        tapBtn.parentNode.insertBefore(revealEl, tapBtn);
        if (inter.revealText) {
          narrateInteractionResult(`They tapped to reveal: "${inter.revealText}". Comment on this briefly.`);
        }
        showContinue(interEl);
      });
      break;
    }
  }
}

function showReveal(interEl, text) {
  const el = document.createElement('div');
  el.className = 'st-reveal';
  el.textContent = text;
  interEl.appendChild(el);
}

function stopCurrentAudio() {
  // Stop any currently playing narrator audio to prevent WebSocket errors
  if (outputAudioCtx) {
    try {
      // Cancel scheduled audio sources
      audioSources.forEach(s => { try { s.stop(); } catch {} });
      audioSources.clear();
      nextStartTime = 0;
    } catch {}
  }
  isNarrating = false;
}

function showContinue(interEl) {
  const btn = document.createElement('button');
  btn.className = 'st-continue';
  const isFinalScreen = currentScreen >= currentStory.screens.length - 1;
  if (isFinalScreen) {
    btn.textContent = 'Return to Museum';
    btn.addEventListener('click', () => {
      stopCurrentAudio();
      completeStory();
    });
  } else {
    btn.textContent = 'Continue →';
    btn.addEventListener('click', () => {
      stopCurrentAudio();
      currentScreen++;
      // Save progress
      saveStoryProgress();
      narrativeSFX.page_turn();
      renderScreen();
    });
  }
  interEl.appendChild(btn);
}

function saveStoryProgress() {
  if (!currentStory) return;
  const data = loadStoryData();
  if (!data.exhibits[currentStory.exhibitId]) {
    data.exhibits[currentStory.exhibitId] = { stories: [], lastVisited: Date.now() };
  }
  const exhibit = data.exhibits[currentStory.exhibitId];
  // Find or create the story record
  let record = exhibit.stories.find(s => s.id === currentStory._recordId);
  if (!record) {
    record = {
      id: currentStory._recordId || `${currentStory.exhibitId}-${Date.now()}`,
      title: currentStory.title,
      createdAt: Date.now(),
      completed: false,
      progress: 0,
      screens: currentStory.screens,
      summary: currentStory.screens.map(s => s.text).join(' ').slice(0, 200),
      angle: currentStory._angle || null,
    };
    currentStory._recordId = record.id;
    exhibit.stories.push(record);
  }
  record.progress = currentScreen + 1;
  record.lastVisited = Date.now();
  exhibit.lastVisited = Date.now();
  saveStoryData(data);
}

// ==================== SCREEN RENDERING ====================
function renderScreen() {
  if (!currentStory || !currentStory.screens) return;
  const screen = currentStory.screens[currentScreen];
  if (!screen) return;
  interactionCompleted = false;
  if (currentScreen > maxScreenReached) maxScreenReached = currentScreen;

  // Play beat SFX
  playBeatSFX(screen.arcBeat);

  // Progress
  const progressEl = document.getElementById('st-progress');
  const isReread = currentStory._isReread;
  progressEl.innerHTML = currentStory.screens.map((_, i) => {
    const visited = i <= maxScreenReached;
    const canClick = isReread || (visited && i !== currentScreen);
    return `<div class="st-progress-seg ${visited && i !== currentScreen ? 'done' : i === currentScreen ? 'current' : ''} ${canClick ? 'clickable' : ''}" data-screen="${i}"></div>`;
  }).join('');
  // Clickable: all screens on re-reads, completed screens on first read
  progressEl.querySelectorAll('.st-progress-seg.clickable').forEach(seg => {
    seg.style.cursor = 'pointer';
    seg.addEventListener('click', () => {
      const target = parseInt(seg.dataset.screen);
      if (target === currentScreen) return;
      stopCurrentAudio();
      currentScreen = target;
      narrativeSFX.page_turn();
      renderScreen();
    });
  });

  document.getElementById('st-screen-num').textContent = `${currentScreen + 1} / ${currentStory.screens.length}`;

  const container = document.getElementById('st-screen-container');
  container.innerHTML = '';
  container.scrollTop = 0;

  // Two-column layout: image left, text+quiz right
  const layout = document.createElement('div');
  layout.className = 'st-layout';

  // Left: Comic panel
  const leftCol = document.createElement('div');
  leftCol.className = 'st-layout-left';
  if (currentStory.comicImage) {
    const panelEl = document.createElement('div');
    panelEl.className = 'st-comic-panel';
    panelEl.style.backgroundImage = `url(${currentStory.comicImage})`;
    panelEl.style.backgroundPosition = PANEL_POSITIONS[currentScreen] || '0% 0%';
    leftCol.appendChild(panelEl);
  }
  layout.appendChild(leftCol);

  // Right: narrator + text + interaction
  const rightCol = document.createElement('div');
  rightCol.className = 'st-layout-right';

  // Narrator status indicator
  const narratorEl = document.createElement('div');
  narratorEl.className = 'st-narrator';
  narratorEl.id = 'st-narrator';
  narratorEl.innerHTML = `
    <div class="narrator-status">
      <div class="narrator-dot ${liveSession ? '' : 'inactive'}"></div>
      <span class="narrator-status-text">${liveSession ? 'Narrating...' : 'Not connected'}</span>
    </div>`;
  rightCol.appendChild(narratorEl);

  // Text
  const textEl = document.createElement('div');
  textEl.className = 'st-text';
  textEl.innerHTML = renderTextWithTerms(screen.text, screen.terms);
  rightCol.appendChild(textEl);

  // Term clicks
  textEl.querySelectorAll('.st-term').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showTermPopup(el, el.dataset.word, el.dataset.explanation);
    });
  });

  // Interaction
  if (screen.interaction) {
    const interEl = document.createElement('div');
    interEl.className = 'st-interaction';
    interEl.innerHTML = renderInteraction(screen.interaction);
    rightCol.appendChild(interEl);
    bindInteraction(interEl, screen.interaction);

    // Have Pix ask the interaction question aloud
    if (liveSession && screen.interaction.question) {
      setTimeout(() => {
        sendText(`Now ask the visitor this question naturally (rephrase it, don't read it robotically): "${screen.interaction.question}"`);
      }, 2000);
    }
  }

  layout.appendChild(rightCol);
  container.appendChild(layout);

  // Narrate (panels after the first)
  if (liveSession && currentScreen > 0) {
    narratePanel(currentScreen);
  }
}

function showTermPopup(el, word, explanation) {
  document.querySelectorAll('.st-term-popup').forEach(p => p.remove());
  const popup = document.createElement('div');
  popup.className = 'st-term-popup';
  popup.innerHTML = `<button class="st-term-popup-close">×</button><div class="st-term-popup-word">${word}</div><div>${explanation}</div>`;
  document.body.appendChild(popup);
  const rect = el.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  popup.style.top = (rect.bottom + 8) + 'px';
  requestAnimationFrame(() => {
    const pRect = popup.getBoundingClientRect();
    if (pRect.bottom > window.innerHeight - 20) popup.style.top = (rect.top - pRect.height - 8) + 'px';
  });
  popup.querySelector('.st-term-popup-close').addEventListener('click', () => popup.remove());
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
    });
  }, 100);
}

// ==================== STORY LIFECYCLE ====================
let onTheaterClose = null;
let onTheaterOpen = null;

async function completeStory() {
  if (!currentStory) return;

  stopCurrentAudio();
  narrativeSFX.complete();

  // Record in Pix memory
  recordStoryCompleted(currentStory.title, currentStory.screens.map(s => s.text));

  // Mark existing record as completed
  const data = loadStoryData();
  const exhibit = data.exhibits[currentStory.exhibitId];
  if (exhibit) {
    const record = exhibit.stories.find(s => s.id === currentStory._recordId);
    if (record) {
      record.completed = true;
      record.progress = currentStory.screens.length;
      record.lastVisited = Date.now();
    }
    exhibit.lastVisited = Date.now();
    saveStoryData(data);
  }

  // Save comic image to IndexedDB
  if (currentStory.comicImage && currentStory._recordId) {
    try { await saveImage(currentStory._recordId, currentStory.comicImage); } catch {}
  }

  // Show completion overlay
  const overlayEl = document.createElement('div');
  overlayEl.className = 'st-complete-overlay';

  // Get related exhibits
  const related = (EXHIBIT_RELATIONS[currentStory.exhibitId] || []).slice(0, 3);

  overlayEl.innerHTML = `<div class="st-complete-card">
    <div class="st-complete-title">Story Complete</div>
    <div class="st-complete-text">${escapeHtml(currentStory.title)}</div>
    ${related.length ? `<div class="st-complete-related">
      <div class="st-complete-related-label">You might also enjoy:</div>
      ${related.map(id => `<button class="st-related-btn" data-id="${id}">${window._exhibitMeta?.[id]?.title || id}</button>`).join('')}
    </div>` : ''}
    <button class="st-complete-done" id="st-complete-done">Return to Museum</button>
  </div>`;

  document.body.appendChild(overlayEl);

  overlayEl.querySelector('#st-complete-done').addEventListener('click', () => {
    overlayEl.remove();
    closeTheater();
  });

  overlayEl.querySelectorAll('.st-related-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlayEl.remove();
      closeTheater();
      // Scroll to related exhibit
      const id = btn.dataset.id;
      if (window._scrollToExhibit) window._scrollToExhibit(id);
    });
  });
}

function closeTheater() {
  stopNarrator();
  document.getElementById('story-theater').classList.add('hidden');
  currentStory = null;
  currentScreen = 0;
  maxScreenReached = 0;
  if (onTheaterClose) onTheaterClose();
}

async function openTheater(exhibitId, exhibitData, existingStory, chosenAngle, sectionId) {
  if (onTheaterOpen) onTheaterOpen();
  const theater = document.getElementById('story-theater');
  theater.classList.remove('hidden');
  document.getElementById('st-title').textContent = chosenAngle?.title || exhibitData.title;

  const container = document.getElementById('st-screen-container');

  if (existingStory) {
    const isCompleted = existingStory.completed;
    currentStory = {
      exhibitId,
      title: existingStory.title || exhibitData.title,
      screens: existingStory.screens,
      comicImage: null,
      _recordId: existingStory.id,
      _isReread: isCompleted, // free navigation only if completed
    };
    try { currentStory.comicImage = await loadImage(existingStory.id); } catch {}
    // Resume at last progress point for incomplete stories, start from 0 for completed
    currentScreen = isCompleted ? 0 : Math.min((existingStory.progress || 1) - 1, existingStory.screens.length - 1);
    if (currentScreen < 0) currentScreen = 0;
    maxScreenReached = isCompleted ? existingStory.screens.length - 1 : currentScreen;
    interactionCompleted = false;
    renderScreen();
    if (GEMINI_KEY && geminiAI) startNarrator(currentStory);
    return;
  }

  // Reset progress bar and screen state for the new story
  currentStory = null;
  currentScreen = 0;
  maxScreenReached = 0;
  document.getElementById('st-progress').innerHTML = '';

  // Generate new story — wait for BOTH text and image before showing
  container.innerHTML = `<div class="st-loading">
    <div class="st-loading-spinner"></div>
    <div class="st-loading-text">Crafting your story...</div>
    <div class="st-loading-sub" id="st-loading-status">Searching for real facts about ${escapeHtml(exhibitData.title)}</div>
  </div>`;

  // Start story crafting SFX
  startStorySfx();

  try {
    // Get past stories for dedup
    const data = loadStoryData();
    const pastStories = data.exhibits[exhibitId]?.stories || [];

    // Stage 1: Generate story text
    const storyContent = await generateStoryContent(exhibitId, exhibitData, pastStories, chosenAngle, sectionId);

    // Update loading status
    const statusEl = document.getElementById('st-loading-status');
    if (statusEl) statusEl.textContent = 'Illustrating the story...';

    // Stage 2: Generate comic image (wait for it)
    let comicImage = null;
    try {
      console.log('[Comic] Starting design generation...');
      const design = await generateComicDesign(storyContent, exhibitData.title);
      console.log('[Comic] Design generated, panels:', design?.panels?.length || 'NO PANELS');
      if (!design?.panels || !Array.isArray(design.panels) || design.panels.length === 0) {
        throw new Error('Comic design has no panels');
      }
      console.log('[Comic] Starting image generation...');
      comicImage = await generateComicImage(design, exhibitData.title);
      console.log('[Comic] Image generated:', comicImage ? `${comicImage.length} chars` : 'NULL');
    } catch (err) {
      console.error('[Comic] Generation failed:', err.message || err);
      // Retry once — image model can be flaky
      try {
        console.log('[Comic] Retrying image generation...');
        const design2 = await generateComicDesign(storyContent, exhibitData.title);
        if (design2?.panels?.length > 0) {
          comicImage = await generateComicImage(design2, exhibitData.title);
          console.log('[Comic] Retry succeeded:', comicImage ? `${comicImage.length} chars` : 'NULL');
        }
      } catch (retryErr) {
        console.error('[Comic] Retry also failed:', retryErr.message || retryErr);
      }
    }

    // Stop loading SFX
    stopLoadingSfx();

    // NOW show everything together
    const recordId = `${exhibitId}-${Date.now()}`;
    currentStory = {
      exhibitId,
      title: chosenAngle?.title || exhibitData.title,
      screens: storyContent.screens,
      comicImage,
      _recordId: recordId,
      _isReread: false,
      _angle: chosenAngle || null,
    };
    currentScreen = 0;
    maxScreenReached = 0;
    interactionCompleted = false;

    // Capture user context BEFORE saving story — so narrator doesn't think
    // this brand-new story is a "past visit"
    const userCtxSnapshot = buildUserContext();

    // Save comic image to IndexedDB immediately (not just on completion)
    // so re-reads of partial stories still have the image
    if (comicImage && recordId) {
      try { await saveImage(recordId, comicImage); } catch (e) { console.warn('[Comic] Failed to save to IndexedDB:', e); }
    }

    // Save story immediately (not just on completion)
    saveStoryProgress();
    recordStoryStarted(exhibitData.title);

    renderScreen();

    // Start narrator after content is visible — pass pre-save context
    if (GEMINI_KEY && geminiAI) startNarrator(currentStory, userCtxSnapshot);

  } catch (err) {
    stopLoadingSfx();
    container.innerHTML = `<div class="st-error">
      <div>Failed to generate story</div>
      <div class="st-error-detail">${escapeHtml(err.message)}</div>
      <button class="st-error-close" id="st-error-close">Back to Museum</button>
    </div>`;
    document.getElementById('st-error-close')?.addEventListener('click', closeTheater);
  }
}

// ==================== GATEWAY (exhibit click entry point) ====================
function showGateway(exhibitId, exhibitData, sectionId) {
  const data = loadStoryData();
  const exhibitHistory = data.exhibits[exhibitId];
  const pastStories = exhibitHistory?.stories || [];

  const gateway = document.getElementById('story-gateway');
  const content = document.getElementById('story-gateway-content');
  gateway.classList.remove('hidden');

  if (pastStories.length === 0) {
    // First visit — show intro + enter button
    content.innerHTML = `
      <h2>${escapeHtml(exhibitData.title)}</h2>
      <div class="sg-year">${exhibitData.year}${exhibitData.person ? ' · ' + escapeHtml(exhibitData.person) : ''}</div>
      <div class="sg-intro">${exhibitData.detail.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div>
      ${exhibitData.wow ? `<div class="sg-wow">${escapeHtml(exhibitData.wow)}</div>` : ''}
      <button class="sg-enter" id="sg-enter">Enter Story Theater</button>
    `;
    document.getElementById('sg-enter').addEventListener('click', () => {
      gateway.classList.add('hidden');
      openTheater(exhibitId, exhibitData, null, null, sectionId);
    });
  } else {
    // Returning visitor — show past stories + new story option
    const related = (EXHIBIT_RELATIONS[exhibitId] || []).slice(0, 2);

    content.innerHTML = `
      <h2>${escapeHtml(exhibitData.title)}</h2>
      <div class="sg-year">${exhibitData.year}${exhibitData.person ? ' · ' + escapeHtml(exhibitData.person) : ''}</div>
      <div class="sg-section-label">Your past stories</div>
      <div class="sg-past-stories">
        ${pastStories.map((s, i) => {
          const progress = s.completed ? 'Completed' : `${s.progress || 0}/${s.screens?.length || 6} chapters`;
          return `
          <div class="sg-past-card" data-idx="${i}">
            <button class="sg-past-delete" data-idx="${i}" title="Delete">&times;</button>
            <div class="sg-past-title">${escapeHtml(s.title || exhibitData.title)}</div>
            <div class="sg-past-date">${new Date(s.createdAt).toLocaleDateString()} · ${progress}</div>
            <div class="sg-past-summary">${escapeHtml((s.summary || '').slice(0, 100))}...</div>
            <button class="sg-past-read" data-idx="${i}">${s.completed ? 'Re-read' : 'Continue'}</button>
          </div>`;
        }).join('')}
      </div>
      <button class="sg-enter sg-new-story" id="sg-new-story">Explore More</button>
      ${related.length ? `<div class="sg-related">
        <div class="sg-section-label">Related exhibits</div>
        ${related.map(id => `<button class="sg-related-btn" data-id="${id}">${escapeHtml(window._exhibitMeta?.[id]?.title || id)}</button>`).join('')}
      </div>` : ''}
    `;

    // Re-read handlers
    content.querySelectorAll('.sg-past-read').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        gateway.classList.add('hidden');
        openTheater(exhibitId, exhibitData, pastStories[idx], null, sectionId);
      });
    });

    // Delete story handlers
    content.querySelectorAll('.sg-past-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const data = loadStoryData();
        const exhibit = data.exhibits[exhibitId];
        if (exhibit?.stories) {
          const removed = exhibit.stories.splice(idx, 1)[0];
          // Delete comic image from IndexedDB
          if (removed?.id) { deleteImage(removed.id).catch(() => {}); }
          saveStoryData(data);
          // Re-render gateway
          showGateway(exhibitId, exhibitData, sectionId);
        }
      });
    });

    // New story handler — generate 3 angles, let user choose
    let hasGeneratedAngles = false;
    document.getElementById('sg-new-story').addEventListener('click', async () => {
      const btn = document.getElementById('sg-new-story');
      btn.disabled = true;
      btn.textContent = 'Finding new angles...';

      // Start exploration SFX
      startAngleSfx();

      try {
        const angles = await generateAngles(exhibitId, exhibitData, pastStories, sectionId);
        stopLoadingSfx();
        const angleList = Array.isArray(angles) ? angles.filter(a => a && a.title) : [];

        if (angleList.length === 0) {
          btn.disabled = false;
          btn.textContent = hasGeneratedAngles ? 'One More Try' : 'Explore More';
          return;
        }

        hasGeneratedAngles = true;

        // Remove any previously inserted angles
        content.querySelectorAll('.sg-angles').forEach(el => el.remove());

        // Show angle options in the gateway
        const anglesHTML = `<div class="sg-angles">
          <div class="sg-section-label">Choose your next story</div>
          ${angleList.map((a, i) => `
            <button class="sg-angle-btn" data-idx="${i}">
              <div class="sg-angle-title">${escapeHtml(a.title || '')}</div>
              <div class="sg-angle-desc">${escapeHtml(a.description || '')}</div>
            </button>
          `).join('')}
        </div>`;

        // Keep button visible but rename it
        btn.disabled = false;
        btn.textContent = 'One More Try';

        // Insert angles BEFORE the button
        btn.insertAdjacentHTML('beforebegin', anglesHTML);

        content.querySelectorAll('.sg-angle-btn').forEach(abtn => {
          abtn.addEventListener('click', () => {
            stopLoadingSfx();
            const idx = parseInt(abtn.dataset.idx);
            const angle = angleList[idx];
            recordAngleChoice(exhibitData.title, angle);
            gateway.classList.add('hidden');
            openTheater(exhibitId, exhibitData, null, angle, sectionId);
          });
        });
      } catch (err) {
        console.warn('Angle generation failed:', err);
        stopLoadingSfx();
        btn.disabled = false;
        btn.textContent = hasGeneratedAngles ? 'One More Try' : 'Explore More';
      }
    });

    // Related exhibit handlers
    content.querySelectorAll('.sg-related-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        gateway.classList.add('hidden');
        const id = btn.dataset.id;
        if (window._scrollToExhibit) window._scrollToExhibit(id);
      });
    });
  }
}

function closeGateway() {
  document.getElementById('story-gateway').classList.add('hidden');
}

// ==================== PUBLIC API ====================
export function initStoryTheater(exhibitMeta, callbacks) {
  window._exhibitMeta = exhibitMeta;
  if (callbacks?.scrollToExhibit) window._scrollToExhibit = callbacks.scrollToExhibit;
  onTheaterOpen = callbacks?.onTheaterOpen || null;
  onTheaterClose = callbacks?.onTheaterClose || null;

  initGemini();

  // Gateway close handlers
  document.getElementById('story-gateway-close')?.addEventListener('click', closeGateway);
  document.getElementById('story-gateway')?.addEventListener('click', (e) => {
    if (e.target.id === 'story-gateway') closeGateway();
  });

  // Theater close handler
  document.getElementById('st-close')?.addEventListener('click', closeTheater);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('story-theater').classList.contains('hidden')) closeTheater();
      else if (!document.getElementById('story-gateway').classList.contains('hidden')) closeGateway();
    }
  });
}

export { showGateway, closeGateway, openTheater, closeTheater };
