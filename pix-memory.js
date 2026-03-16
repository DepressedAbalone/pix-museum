// ==================== PIX MEMORY ====================
// Pix's understanding of the user — stored in localStorage.
// Three signal types: interests (topics), questions (specific curiosity), rejections (don't want).
// Questions are the most valuable signal — they show exactly what the user wants to know more about.

import { GoogleGenAI } from '@google/genai';

const MEMORY_KEY = 'pix_memory';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// ==================== STORAGE ====================
function loadMemory() {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY)) || createEmpty();
    // Migrate from old format: convert old "traits" to new "interests"
    if (raw.traits && !raw.interests) {
      raw.interests = raw.traits
        .filter(t => t.type === 'interest' || t.type === 'fact')
        .map(t => ({
          topic: t.trait,
          strength: t.confidence,
          evidence: t.evidence || [],
          addedAt: t.addedAt || Date.now(),
          lastReinforced: t.lastUpdated || Date.now(),
        }));
      raw.questions = [];
      raw.rejections = [];
      delete raw.traits;
    }
    // Ensure all fields exist
    if (!raw.interests) raw.interests = [];
    if (!raw.questions) raw.questions = [];
    if (!raw.rejections) raw.rejections = [];
    return raw;
  } catch { return createEmpty(); }
}

function saveMemory(mem) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
}

function createEmpty() {
  return {
    identity: { name: null, firstVisit: Date.now(), visitCount: 0 },
    interests: [],    // { topic, strength (0-1), evidence[], addedAt, lastReinforced }
    questions: [],    // { text, exhibit, context, askedAt }
    rejections: [],   // { topic, reason, rejectedAt }
    moments: [],
    relationship: {
      totalConversations: 0,
      totalStoriesStarted: 0,
      totalStoriesCompleted: 0,
      quizEngagement: 'unknown',
      lastInteraction: null,
    },
  };
}

let memory = loadMemory();

// ==================== DECAY ====================
// Interests lose strength over time. Called on read, not on every tick.
const DECAY_HALF_LIFE_MS = 3 * 60 * 60 * 1000; // 3 hours (within a session, things cool down)

function decayedStrength(interest) {
  const age = Date.now() - interest.lastReinforced;
  const decay = Math.pow(0.5, age / DECAY_HALF_LIFE_MS);
  return interest.strength * decay;
}

// ==================== REJECTION MATCHING ====================
// Check if a topic is rejected. Simple substring match both ways.
function isRejected(topic) {
  const t = topic.toLowerCase();
  return memory.rejections.some(r => {
    const rt = r.topic.toLowerCase();
    return t.includes(rt) || rt.includes(t);
  });
}

// When a rejection comes in, also actively suppress matching interests
function applyRejection(rejectedTopic) {
  const rt = rejectedTopic.toLowerCase();
  for (const interest of memory.interests) {
    const it = interest.topic.toLowerCase();
    if (it.includes(rt) || rt.includes(it)) {
      interest.strength = 0;
      console.log('[PixMemory] Suppressed interest:', interest.topic);
    }
  }
}

// ==================== PUBLIC GETTERS ====================
export function getMemory() {
  return memory;
}

export function getUserName() {
  return memory.identity.name;
}

export function setUserName(name) {
  memory.identity.name = name;
  saveMemory(memory);
}

// Increment visit count (call on page load)
export function recordVisit() {
  memory.identity.visitCount++;
  memory.relationship.lastInteraction = Date.now();
  saveMemory(memory);
}

// ==================== RECORD INTERACTIONS ====================

// Record a quiz answer
export function recordQuizAnswer(exhibitTitle, question, userAnswer, correctAnswer, wasCorrect, pctOff) {
  memory.moments.push({
    timestamp: Date.now(),
    type: 'quiz_answer',
    exhibit: exhibitTitle,
    data: { question, userAnswer, correctAnswer, wasCorrect, pctOff },
  });
  memory.relationship.quizEngagement = 'high';
  trimMoments();
  saveMemory(memory);

  extractInsightFromQuiz(exhibitTitle, question, userAnswer, correctAnswer, wasCorrect, pctOff);
}

// Record a story started
export function recordStoryStarted(exhibitTitle) {
  memory.relationship.totalStoriesStarted++;
  memory.moments.push({
    timestamp: Date.now(),
    type: 'story_start',
    exhibit: exhibitTitle,
    data: {},
  });
  trimMoments();
  saveMemory(memory);
}

// Record a story completed
export function recordStoryCompleted(exhibitTitle, screenTexts) {
  memory.relationship.totalStoriesCompleted++;
  memory.moments.push({
    timestamp: Date.now(),
    type: 'story_complete',
    exhibit: exhibitTitle,
    data: {},
  });
  trimMoments();
  saveMemory(memory);

  extractInsightFromStory(exhibitTitle, screenTexts);
}

// Record an angle choice (what direction the user chose to explore)
export function recordAngleChoice(exhibitTitle, chosenAngle) {
  memory.moments.push({
    timestamp: Date.now(),
    type: 'angle_choice',
    exhibit: exhibitTitle,
    data: { angle: chosenAngle.title || chosenAngle },
  });
  trimMoments();
  saveMemory(memory);

  extractInsightFromAngle(exhibitTitle, chosenAngle);
}

// Record a conversation with Pix
export function recordConversation(context, transcriptSnippet) {
  memory.relationship.totalConversations++;
  memory.moments.push({
    timestamp: Date.now(),
    type: 'conversation',
    data: { context, snippet: transcriptSnippet.slice(0, 300) },
  });
  trimMoments();
  saveMemory(memory);

  if (transcriptSnippet.length > 20) {
    extractInsightFromConversation(context, transcriptSnippet);
  }
}

// Record an exhibit creation (what they chose to build)
export function recordExhibitCreated(title) {
  memory.moments.push({
    timestamp: Date.now(),
    type: 'exhibit_created',
    data: { title },
  });
  trimMoments();
  saveMemory(memory);
}

// ==================== INSIGHT EXTRACTION (Gemini) ====================

async function extractInsights(interactionDescription) {
  if (!ai) {
    console.warn('[PixMemory] No AI — skipping extraction');
    return;
  }

  // Build existing state for context
  const activeInterests = memory.interests
    .filter(i => decayedStrength(i) > 0.1 && !isRejected(i.topic))
    .map(i => `- ${i.topic} (${Math.round(decayedStrength(i) * 100)}%)`)
    .join('\n') || 'None yet';

  const recentQuestions = memory.questions.slice(-5)
    .map(q => `- "${q.text}" (about: ${q.exhibit || q.context})`)
    .join('\n') || 'None yet';

  const rejections = memory.rejections
    .map(r => `- ${r.topic}`)
    .join('\n') || 'None';

  try {
    console.log('[PixMemory] Extracting from:', interactionDescription.slice(0, 100));

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Analyze this user interaction and extract signals useful for recommending content.

INTERACTION:
${interactionDescription}

CURRENT USER STATE:
Active interests: ${activeInterests}
Recent questions: ${recentQuestions}
Rejected topics: ${rejections}
Name: ${memory.identity.name || 'unknown'}

Extract ONLY the following (ignore everything else):

1. INTEREST: A specific TOPIC or SUBJECT they're drawn to. Must be about content, not about how they talk.
   Good: "aerodynamics", "rivalry between inventors", "food history", "space exploration"
   Bad: "uses casual language", "delegates decisions to AI", "uses filler words"

2. QUESTION: A specific question the user asked or curiosity they expressed. These are the MOST valuable signals.
   Good: "How did the Wright brothers solve wing warping?", "Why did early planes have two wings?"
   Bad: (don't fabricate questions — only extract ones actually asked)

3. REJECTION: Something the user EXPLICITLY said they don't want to hear about right now.
   Only extract if the user clearly said "no", "don't", "stop", "not interested" about a specific topic.
   Good: "robotics" (user said "don't talk about robotics")
   Bad: (don't infer rejection from lack of interest — only from explicit statements)

Output a JSON array:
[
  {"type": "interest", "topic": "the specific topic", "evidence": "short quote or action"},
  {"type": "question", "text": "the question they asked", "exhibit": "related exhibit if any"},
  {"type": "rejection", "topic": "what they rejected", "reason": "what they said"}
]

Rules:
- Output [] if nothing new is revealed.
- Do NOT extract communication style, personality, or conversational habits — these are useless for recommendations.
- A question like "how does X work?" during a story about Y is extremely valuable — always capture it.
- Be specific. "interested in science" is too vague. "interested in aerodynamics" is good.
- If the user asks about something DURING a story, that's a stronger signal than passively reading it.`,
      config: {
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
        systemInstruction: 'Extract topic interests, specific questions, and explicit rejections. Nothing else. Output valid JSON array.',
      },
    });

    let content = result.text.trim();
    if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    let insights;
    try { insights = JSON.parse(content); } catch {
      let fixed = content;
      const quoteCount = (fixed.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) fixed += '"';
      fixed = fixed.replace(/,\s*([}\]])/g, '$1');
      fixed = fixed.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
      const opens = (fixed.match(/\[/g) || []).length;
      const closes = (fixed.match(/\]/g) || []).length;
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      if (openBraces > closeBraces) fixed += '}'.repeat(openBraces - closeBraces);
      if (opens > closes) fixed += ']'.repeat(opens - closes);
      try { insights = JSON.parse(fixed); }
      catch { console.warn('[PixMemory] JSON repair failed:', content.slice(0, 200)); return; }
    }

    if (!Array.isArray(insights) || insights.length === 0) {
      console.log('[PixMemory] No new insights extracted');
      return;
    }

    console.log(`[PixMemory] Extracted ${insights.length} insights`);

    for (const insight of insights) {
      if (insight.type === 'interest' && insight.topic) {
        // Skip if rejected
        if (isRejected(insight.topic)) {
          console.log('[PixMemory] Skipped rejected topic:', insight.topic);
          continue;
        }
        // Find existing or create
        const existing = memory.interests.find(i => {
          const a = i.topic.toLowerCase();
          const b = insight.topic.toLowerCase();
          return a.includes(b) || b.includes(a);
        });
        if (existing) {
          existing.strength = Math.min(1, existing.strength + 0.15);
          existing.evidence.push(insight.evidence || insight.topic);
          if (existing.evidence.length > 5) existing.evidence = existing.evidence.slice(-5);
          existing.lastReinforced = Date.now();
          console.log('[PixMemory] Reinforced interest:', existing.topic, '→', existing.strength);
        } else {
          memory.interests.push({
            topic: insight.topic,
            strength: 0.5,
            evidence: [insight.evidence || insight.topic],
            addedAt: Date.now(),
            lastReinforced: Date.now(),
          });
          console.log('[PixMemory] New interest:', insight.topic);
        }
      }

      if (insight.type === 'question' && insight.text) {
        // Dedup: don't store the same question twice
        const isDupe = memory.questions.some(q =>
          q.text.toLowerCase().includes(insight.text.toLowerCase().slice(0, 30)) ||
          insight.text.toLowerCase().includes(q.text.toLowerCase().slice(0, 30))
        );
        if (!isDupe) {
          memory.questions.push({
            text: insight.text,
            exhibit: insight.exhibit || null,
            context: insight.context || null,
            askedAt: Date.now(),
          });
          console.log('[PixMemory] New question:', insight.text);
          // Trim to 20 most recent
          if (memory.questions.length > 20) memory.questions = memory.questions.slice(-20);
        }
      }

      if (insight.type === 'rejection' && insight.topic) {
        const isDupe = memory.rejections.some(r =>
          r.topic.toLowerCase() === insight.topic.toLowerCase()
        );
        if (!isDupe) {
          memory.rejections.push({
            topic: insight.topic,
            reason: insight.reason || null,
            rejectedAt: Date.now(),
          });
          applyRejection(insight.topic);
          console.log('[PixMemory] New rejection:', insight.topic);
        }
      }
    }

    // Trim interests: remove dead ones, keep max 15
    memory.interests = memory.interests.filter(i => decayedStrength(i) > 0.05);
    if (memory.interests.length > 15) {
      memory.interests.sort((a, b) => decayedStrength(b) - decayedStrength(a));
      memory.interests = memory.interests.slice(0, 15);
    }

    trimMoments();
    saveMemory(memory);
  } catch (e) {
    console.error('[PixMemory] Extraction failed:', e.message, e);
  }
}

function extractInsightFromQuiz(exhibit, question, userAnswer, correctAnswer, wasCorrect, pctOff) {
  extractInsights(`QUIZ during story about "${exhibit}":
Question: "${question}"
User answered: ${userAnswer} (correct: ${correctAnswer}, ${wasCorrect ? 'got it right' : `wrong${pctOff ? ` by ${pctOff}%` : ''}`})`);
}

function extractInsightFromStory(exhibit, screenTexts) {
  extractInsights(`STORY COMPLETED: User finished all chapters about "${exhibit}".
Story summary: ${(screenTexts || []).join(' ').slice(0, 400)}`);
}

function extractInsightFromAngle(exhibit, angle) {
  extractInsights(`ANGLE CHOSEN: User was exploring "${exhibit}" and chose to go deeper into: "${angle.title || angle}"
Description: ${angle.description || 'N/A'}
Focus: ${angle.focus || 'N/A'}`);
}

function extractInsightFromConversation(context, transcript) {
  extractInsights(`VOICE CONVERSATION (context: ${context}):
${transcript.slice(0, 500)}

The lines with "User said:" are what the user actually said. Pay special attention to any QUESTIONS the user asked — these are the most valuable signals. Also watch for explicit rejections ("don't", "no", "stop talking about").`);
}

// ==================== MEMORY FOR PROMPTS ====================
export function getMemorySummary() {
  const m = memory;
  const parts = [];

  if (m.identity.name) {
    parts.push(`Their name is ${m.identity.name}.`);
  }

  parts.push(`They've visited ${m.identity.visitCount} times, started ${m.relationship.totalStoriesStarted} stories, completed ${m.relationship.totalStoriesCompleted}.`);

  // Recent questions — THE most important signal. Put first.
  const recentQs = m.questions.slice(-5);
  if (recentQs.length > 0) {
    parts.push(`IMPORTANT — Questions they asked (this is what they're MOST curious about — prioritize these over general interests when suggesting what to explore next): ${recentQs.map(q => `"${q.text}"${q.exhibit ? ` (during ${q.exhibit})` : ''}`).join('; ')}`);
  }

  // Rejections — must respect these
  if (m.rejections.length > 0) {
    parts.push(`Topics they DON'T want right now (do NOT suggest these): ${m.rejections.map(r => r.topic).join(', ')}`);
  }

  // Active interests (decayed, non-rejected) — secondary to questions
  const activeInterests = m.interests
    .map(i => ({ ...i, effective: decayedStrength(i) }))
    .filter(i => i.effective > 0.1 && !isRejected(i.topic))
    .sort((a, b) => b.effective - a.effective)
    .slice(0, 5);
  if (activeInterests.length > 0) {
    parts.push(`General topics they've shown interest in: ${activeInterests.map(i => i.topic).join(', ')}`);
  }

  const recentExhibits = m.moments
    .filter(m => m.type === 'story_complete' || m.type === 'story_start')
    .slice(-5)
    .map(m => m.exhibit);
  if (recentExhibits.length > 0) {
    parts.push(`Recently explored: ${[...new Set(recentExhibits)].join(', ')}`);
  }

  return parts.join('\n');
}

// ==================== TRIM ====================
function trimMoments() {
  if (memory.moments.length > 50) {
    memory.moments = memory.moments.slice(-50);
  }
}

// ==================== DEBUG UI ====================
export function addMemoryDebugButton() {
  if (document.getElementById('memory-debug-btn')) return;

  const style = document.createElement('style');
  style.textContent = `
    #memory-debug-btn {
      position: fixed; top: 12px; left: 240px; z-index: 10;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 3px; padding: 4px 10px;
      color: rgba(255,255,255,0.3);
      font-size: 9px; cursor: pointer;
      font-family: 'Courier New', monospace;
    }
    #memory-debug-btn:hover { color: rgba(255,255,255,0.6); }
    #memory-debug-overlay {
      position: fixed; inset: 0; z-index: 500;
      background: rgba(0,0,0,0.85);
      overflow-y: scroll;
      padding: 20px;
    }
    #memory-debug-card {
      background: #0a1520; border: 1px solid #2a4a6a;
      border-radius: 6px; max-width: 600px; width: 100%;
      margin: 20px auto; padding: 24px;
      font-family: 'Courier New', monospace; font-size: 12px;
      color: #8abaea; line-height: 1.6;
    }
    #memory-debug-card h3 { color: #4a9aff; margin: 16px 0 8px; font-size: 13px; letter-spacing: 1px; }
    #memory-debug-card .interest { margin: 4px 0; padding: 6px 8px; background: rgba(74,154,255,0.06); border-left: 2px solid #4aff6a; }
    #memory-debug-card .interest.weak { border-color: #ffa040; }
    #memory-debug-card .interest.rejected { border-color: #ff6060; opacity: 0.4; text-decoration: line-through; }
    #memory-debug-card .question { margin: 4px 0; padding: 6px 8px; background: rgba(255,200,50,0.06); border-left: 2px solid #ffc832; }
    #memory-debug-card .rejection { margin: 4px 0; padding: 6px 8px; background: rgba(255,60,60,0.06); border-left: 2px solid #ff4040; }
    #memory-debug-card .moment { margin: 2px 0; color: #6a8aaa; font-size: 11px; }
    #memory-debug-card .close-btn { float: right; background: none; border: none; color: #4a6a8a; font-size: 18px; cursor: pointer; }
    #memory-debug-card .stat { display: inline-block; margin-right: 16px; color: #6a9aca; }
    #memory-debug-card .stat b { color: #4a9aff; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'memory-debug-btn';
  btn.textContent = "PIX'S MEMORY";
  btn.addEventListener('click', showMemoryDebug);
  document.body.appendChild(btn);
}

function showMemoryDebug() {
  const m = loadMemory(); // reload fresh
  // Temporarily set memory for decayedStrength/isRejected to work
  const prevMem = memory;
  memory = m;

  const overlay = document.createElement('div');
  overlay.id = 'memory-debug-overlay';

  // Interests
  const interestsHTML = m.interests.length > 0
    ? m.interests
        .map(i => ({ ...i, effective: decayedStrength(i), rejected: isRejected(i.topic) }))
        .sort((a, b) => b.effective - a.effective)
        .map(i => {
          const cls = i.rejected ? 'rejected' : i.effective < 0.3 ? 'weak' : '';
          return `<div class="interest ${cls}">
            <strong>${i.topic}</strong> (${Math.round(i.effective * 100)}%${i.rejected ? ' — REJECTED' : ''})
            <div style="color:#4a6a8a;font-size:10px;margin-top:2px;">Evidence: ${i.evidence.slice(-2).join(' | ')}</div>
          </div>`;
        }).join('')
    : '<div style="color:#4a6a8a;">No interests learned yet.</div>';

  // Questions
  const questionsHTML = m.questions.length > 0
    ? m.questions.slice().reverse().map(q =>
        `<div class="question">
          "${q.text}"
          <div style="color:#b0903a;font-size:10px;margin-top:2px;">${q.exhibit ? `During: ${q.exhibit}` : q.context || ''} — ${new Date(q.askedAt).toLocaleString()}</div>
        </div>`
      ).join('')
    : '<div style="color:#4a6a8a;">No questions recorded yet.</div>';

  // Rejections
  const rejectionsHTML = m.rejections.length > 0
    ? m.rejections.map(r =>
        `<div class="rejection">
          ${r.topic}
          <div style="color:#aa5050;font-size:10px;margin-top:2px;">${r.reason || 'No reason given'} — ${new Date(r.rejectedAt).toLocaleString()}</div>
        </div>`
      ).join('')
    : '<div style="color:#4a6a8a;">No rejections.</div>';

  // Moments
  const momentsHTML = m.moments.length > 0
    ? m.moments.slice(-20).reverse().map(mo => {
        const time = new Date(mo.timestamp).toLocaleString();
        let text = '';
        if (mo.type === 'quiz_answer') text = `Quiz (${mo.exhibit}): ${mo.data.wasCorrect ? '✓' : '✗'} ${mo.data.question?.slice(0, 60)}`;
        else if (mo.type === 'story_start') text = `Started: ${mo.exhibit}`;
        else if (mo.type === 'story_complete') text = `Completed: ${mo.exhibit}`;
        else if (mo.type === 'angle_choice') text = `Chose angle: ${mo.data.angle} (${mo.exhibit})`;
        else if (mo.type === 'conversation') text = `Conversation: ${mo.data.snippet?.slice(0, 60)}...`;
        else if (mo.type === 'exhibit_created') text = `Created exhibit: ${mo.data.title}`;
        else text = mo.type;
        return `<div class="moment">${time} — ${text}</div>`;
      }).join('')
    : '<div style="color:#4a6a8a;">No moments recorded yet.</div>';

  overlay.innerHTML = `<div id="memory-debug-card">
    <button class="close-btn" id="memory-debug-close">×</button>
    <h3>PIX'S MEMORY</h3>
    <div style="margin-bottom:12px;">
      <span class="stat">Name: <b>${m.identity.name || '?'}</b></span>
      <span class="stat">Visits: <b>${m.identity.visitCount}</b></span>
      <span class="stat">Stories: <b>${m.relationship.totalStoriesCompleted}/${m.relationship.totalStoriesStarted}</b></span>
      <span class="stat">Convos: <b>${m.relationship.totalConversations}</b></span>
    </div>
    <h3>INTERESTS (topics they're drawn to)</h3>
    ${interestsHTML}
    <h3>QUESTIONS (what they specifically asked)</h3>
    ${questionsHTML}
    <h3>REJECTIONS (don't recommend these)</h3>
    ${rejectionsHTML}
    <h3>ACTIVITY LOG (last 20)</h3>
    ${momentsHTML}
  </div>`;

  document.body.appendChild(overlay);
  memory = prevMem; // restore
  document.getElementById('memory-debug-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ==================== INIT ====================
export function initPixMemory() {
  memory = loadMemory();
  recordVisit();
  addMemoryDebugButton();

  // Load user name from onboarding if available
  try {
    const userData = JSON.parse(localStorage.getItem('invention_museum_user') || '{}');
    if (userData.name && !memory.identity.name) {
      memory.identity.name = userData.name;
      saveMemory(memory);
    }
  } catch {}
}
