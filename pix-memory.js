// ==================== PIX MEMORY ====================
// Pix's understanding of the user — stored in localStorage.
// Structured in layers: identity, traits, moments, relationship.

import { GoogleGenAI } from '@google/genai';

const MEMORY_KEY = 'pix_memory';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// ==================== STORAGE ====================
function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY)) || createEmpty();
  } catch { return createEmpty(); }
}

function saveMemory(mem) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
}

function createEmpty() {
  return {
    identity: { name: null, firstVisit: Date.now(), visitCount: 0 },
    traits: [],
    moments: [],
    relationship: {
      totalConversations: 0,
      totalStoriesStarted: 0,
      totalStoriesCompleted: 0,
      quizEngagement: 'unknown',
      prefersBrief: null,
      lastInteraction: null,
    },
  };
}

let memory = loadMemory();

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
  const moment = {
    timestamp: Date.now(),
    type: 'quiz_answer',
    exhibit: exhibitTitle,
    data: { question, userAnswer, correctAnswer, wasCorrect, pctOff },
  };
  memory.moments.push(moment);
  // Update quiz engagement
  memory.relationship.quizEngagement = 'high'; // they're answering quizzes
  trimMoments();
  saveMemory(memory);

  // Async: extract insight
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

  // Async: extract what the user seemed interested in
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

  // This is very revealing — the angle they chose shows what they care about
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

  // Extract personality insights from conversation
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
// Direct extraction — no queue, just call Gemini immediately.
// Extracts MULTIPLE insights from a single interaction.

async function extractInsights(interactionDescription) {
  if (!ai) {
    console.warn('[PixMemory] No AI — skipping extraction');
    return;
  }

  const existingTraits = memory.traits.map(t => `- ${t.trait} (${Math.round(t.confidence * 100)}%)`).join('\n') || 'None yet';

  try {
    console.log('[PixMemory] Extracting from:', interactionDescription.slice(0, 100));

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Analyze this user interaction and extract what we learned about them.

INTERACTION:
${interactionDescription}

EXISTING KNOWLEDGE ABOUT THIS USER:
${existingTraits}
Name: ${memory.identity.name || 'unknown'}
Visit count: ${memory.identity.visitCount}

Extract ALL of the following that apply (output as many as relevant):

1. FACTS: Concrete things the user stated (e.g., "admires Tesla", "interested in space", "is 12 years old", "from California")
2. INTERESTS: Topics/themes they seem drawn to (e.g., "fascinated by failure stories", "loves engineering details")
3. PERSONALITY: How they think or communicate (e.g., "an optimist in guesses", "asks deep questions", "prefers brief answers")
4. NOTABLE MOMENTS: Specific memorable things they said or did

Output a JSON array. Each item is one insight:
[
  {"type": "fact", "text": "what we learned", "evidence": "exact quote or action that shows this"},
  {"type": "interest", "text": "the interest", "evidence": "what they said/did"},
  {"type": "personality", "text": "the trait", "evidence": "what they said/did"},
  {"type": "moment", "text": "notable observation", "evidence": "context"}
]

If the interaction reveals NOTHING new, output: []
Be specific. "They talked about inventions" is too vague. "They specifically asked about Tesla's rivalry with Edison — drawn to conflict/rivalry narratives" is good.`,
      config: {
        temperature: 0.3,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        systemInstruction: 'Extract specific, actionable insights about the user. Be concrete, not generic. Output valid JSON array.',
      },
    });

    let content = result.text.trim();
    if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    let insights;
    try { insights = JSON.parse(content); } catch {
      // Try basic repair: strip trailing commas, fix unclosed brackets
      let fixed = content.replace(/,\s*([}\]])/g, '$1');
      const open = (fixed.match(/\[/g) || []).length;
      const close = (fixed.match(/\]/g) || []).length;
      if (open > close) fixed += ']'.repeat(open - close);
      insights = JSON.parse(fixed);
    }
    if (!Array.isArray(insights) || insights.length === 0) {
      console.log('[PixMemory] No new insights extracted');
      return;
    }

    console.log(`[PixMemory] Extracted ${insights.length} insights`);

    for (const insight of insights) {
      if (!insight.text) continue;

      if (insight.type === 'fact' || insight.type === 'interest' || insight.type === 'personality') {
        // Add or update trait
        const existing = memory.traits.find(t =>
          t.trait.toLowerCase().includes(insight.text.toLowerCase().slice(0, 20)) ||
          insight.text.toLowerCase().includes(t.trait.toLowerCase().slice(0, 20))
        );
        if (existing) {
          existing.confidence = Math.min(1, existing.confidence + 0.15);
          existing.evidence.push(insight.evidence || insight.text);
          if (existing.evidence.length > 5) existing.evidence = existing.evidence.slice(-5);
          existing.lastUpdated = Date.now();
          console.log('[PixMemory] Updated:', existing.trait, '→', existing.confidence);
        } else {
          memory.traits.push({
            trait: insight.text,
            type: insight.type,
            confidence: 0.6,
            evidence: [insight.evidence || insight.text],
            addedAt: Date.now(),
            lastUpdated: Date.now(),
          });
          console.log('[PixMemory] New trait:', insight.text);
        }
      }

      if (insight.type === 'moment') {
        memory.moments.push({
          timestamp: Date.now(),
          type: 'insight',
          data: { text: insight.text, evidence: insight.evidence },
        });
        console.log('[PixMemory] Moment:', insight.text);
      }
    }

    // Trim traits to 20 max
    if (memory.traits.length > 20) {
      memory.traits.sort((a, b) => b.confidence - a.confidence);
      memory.traits = memory.traits.slice(0, 20);
    }

    trimMoments();
    saveMemory(memory);
  } catch (e) {
    console.error('[PixMemory] Extraction failed:', e.message, e);
  }
}

function extractInsightFromQuiz(exhibit, question, userAnswer, correctAnswer, wasCorrect, pctOff) {
  extractInsights(`QUIZ ANSWER during story about "${exhibit}":
Question: "${question}"
User's answer: ${userAnswer}
Correct answer: ${correctAnswer}
Result: ${wasCorrect ? 'Correct!' : `Wrong${pctOff ? ` (${pctOff}% off)` : ''}`}`);
}

function extractInsightFromStory(exhibit, screenTexts) {
  extractInsights(`STORY COMPLETED: "${exhibit}"
The user read all 6 chapters about this exhibit.
Story content: ${(screenTexts || []).join(' ').slice(0, 400)}`);
}

function extractInsightFromAngle(exhibit, angle) {
  extractInsights(`ANGLE CHOSEN: The user was exploring "${exhibit}" and chose to go deeper into: "${angle.title || angle}"
Description of chosen angle: ${angle.description || 'N/A'}
This reveals what aspect of the topic interests them most.`);
}

function extractInsightFromConversation(context, transcript) {
  extractInsights(`VOICE CONVERSATION with Pix (context: ${context}):
${transcript.slice(0, 500)}

Pay close attention to what the USER said (lines starting with "User said:"). Extract any facts, interests, or personality traits revealed by their words.`);
}

// ==================== MEMORY FOR PROMPTS ====================
// Generate a concise memory summary for Pix's system prompts
export function getMemorySummary() {
  const m = memory;
  const parts = [];

  if (m.identity.name) {
    parts.push(`Their name is ${m.identity.name}.`);
  }

  parts.push(`They've visited ${m.identity.visitCount} times, started ${m.relationship.totalStoriesStarted} stories, completed ${m.relationship.totalStoriesCompleted}.`);

  if (m.traits.length > 0) {
    const topTraits = m.traits
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(t => `${t.trait} (${Math.round(t.confidence * 100)}% confident)`);
    parts.push(`What I know about them: ${topTraits.join('; ')}`);
  }

  const recentInsights = m.moments
    .filter(m => m.type === 'insight')
    .slice(-3)
    .map(m => m.data.text);
  if (recentInsights.length > 0) {
    parts.push(`Recent observations: ${recentInsights.join('. ')}`);
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
  // Keep max 50 moments (oldest get dropped, but insights are preserved longer)
  if (memory.moments.length > 50) {
    // Separate insights from regular moments
    const insights = memory.moments.filter(m => m.type === 'insight');
    const regular = memory.moments.filter(m => m.type !== 'insight');
    // Keep last 10 insights + last 40 regular
    memory.moments = [
      ...insights.slice(-10),
      ...regular.slice(-40),
    ].sort((a, b) => a.timestamp - b.timestamp);
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
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    #memory-debug-card {
      background: #0a1520; border: 1px solid #2a4a6a;
      border-radius: 6px; max-width: 600px; width: 100%;
      max-height: 80vh; overflow-y: auto; padding: 24px;
      font-family: 'Courier New', monospace; font-size: 12px;
      color: #8abaea; line-height: 1.6;
    }
    #memory-debug-card h3 { color: #4a9aff; margin: 16px 0 8px; font-size: 13px; letter-spacing: 1px; }
    #memory-debug-card .trait { margin: 4px 0; padding: 6px 8px; background: rgba(74,154,255,0.06); border-left: 2px solid; }
    #memory-debug-card .trait.high { border-color: #4aff6a; }
    #memory-debug-card .trait.mid { border-color: #ffa040; }
    #memory-debug-card .trait.low { border-color: #ff6060; }
    #memory-debug-card .moment { margin: 2px 0; color: #6a8aaa; font-size: 11px; }
    #memory-debug-card .moment.insight { color: #c0a0ff; }
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
  const overlay = document.createElement('div');
  overlay.id = 'memory-debug-overlay';

  const traitsHTML = m.traits.length > 0
    ? m.traits.sort((a, b) => b.confidence - a.confidence).map(t => {
        const level = t.confidence > 0.7 ? 'high' : t.confidence > 0.4 ? 'mid' : 'low';
        return `<div class="trait ${level}">
          <strong>${t.trait}</strong> (${Math.round(t.confidence * 100)}%)
          <div style="color:#4a6a8a;font-size:10px;margin-top:2px;">Evidence: ${t.evidence.slice(-2).join(' | ')}</div>
        </div>`;
      }).join('')
    : '<div style="color:#4a6a8a;">No traits learned yet.</div>';

  const momentsHTML = m.moments.length > 0
    ? m.moments.slice(-20).reverse().map(mo => {
        const time = new Date(mo.timestamp).toLocaleString();
        const isInsight = mo.type === 'insight';
        let text = '';
        if (mo.type === 'quiz_answer') text = `Quiz (${mo.exhibit}): ${mo.data.wasCorrect ? '✓' : '✗'} ${mo.data.question?.slice(0, 60)}`;
        else if (mo.type === 'story_start') text = `Started: ${mo.exhibit}`;
        else if (mo.type === 'story_complete') text = `Completed: ${mo.exhibit}`;
        else if (mo.type === 'angle_choice') text = `Chose angle: ${mo.data.angle} (${mo.exhibit})`;
        else if (mo.type === 'conversation') text = `Conversation: ${mo.data.snippet?.slice(0, 60)}...`;
        else if (mo.type === 'exhibit_created') text = `Created exhibit: ${mo.data.title}`;
        else if (mo.type === 'insight') text = `💡 ${mo.data.text}`;
        else text = `${mo.type}`;
        return `<div class="moment ${isInsight ? 'insight' : ''}">${time} — ${text}</div>`;
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
    <h3>TRAITS (what Pix believes about the user)</h3>
    ${traitsHTML}
    <h3>MOMENTS (last 20)</h3>
    ${momentsHTML}
  </div>`;

  document.body.appendChild(overlay);
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
