import { GoogleGenAI } from '@google/genai';

// ==================== CONFIG ====================
const GEMINI_MODEL = 'gemini-3-flash-preview';
const STORAGE_KEY = 'invention_museum_stories';
const DIARY_KEY = 'invention_museum_diary';

let geminiAI = null;
let GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';

function initGemini() {
  if (GEMINI_KEY && !geminiAI) {
    geminiAI = new GoogleGenAI({ apiKey: GEMINI_KEY });
  }
}

async function callGemini(systemPrompt, userPrompt) {
  if (!geminiAI) throw new Error('Gemini not initialized');
  const response = await geminiAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { temperature: 0.85, maxOutputTokens: 1000, systemInstruction: systemPrompt },
  });
  return response.text.trim();
}

// ==================== STORAGE ====================
function loadStoryData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { version: 1, exhibits: {} };
  } catch { return { version: 1, exhibits: {} }; }
}

function loadDiaryData() {
  try {
    return JSON.parse(localStorage.getItem(DIARY_KEY)) || { entries: {} };
  } catch { return { entries: {} }; }
}

function saveDiaryData(data) {
  localStorage.setItem(DIARY_KEY, JSON.stringify(data));
}

// ==================== GROUP STORIES BY DATE ====================
function groupStoriesByDate() {
  const data = loadStoryData();
  const byDate = {};

  for (const [exhibitId, exhibit] of Object.entries(data.exhibits || {})) {
    for (const story of (exhibit.stories || [])) {
      const date = new Date(story.createdAt).toISOString().slice(0, 10); // "2026-03-15"
      if (!byDate[date]) byDate[date] = [];
      const meta = window._exhibitMeta?.[exhibitId];
      byDate[date].push({
        exhibitId,
        exhibitTitle: meta?.title || exhibitId,
        storyTitle: story.title,
        summary: story.summary || '',
        completed: story.completed,
        progress: story.progress || 0,
        totalScreens: story.screens?.length || 6,
        createdAt: story.createdAt,
      });
    }
  }

  // Sort dates descending (most recent first)
  const sorted = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  return { byDate, sortedDates: sorted };
}

// ==================== DIARY ENTRY GENERATION ====================
async function generateDiaryEntry(dateStr, stories) {
  initGemini();
  if (!geminiAI) return null;

  const storyList = stories.map(s => {
    const parts = [`"${s.exhibitTitle}"`];
    if (s.storyTitle) parts.push(`— story: "${s.storyTitle}"`);
    if (s.summary) parts.push(`(${s.summary.slice(0, 80)})`);
    parts.push(s.completed ? '[completed]' : `[in progress: ${s.progress}/${s.totalScreens} chapters]`);
    return `- ${parts.join(' ')}`;
  }).join('\n');

  const systemPrompt = `You are Pix, a mysterious geometric creature who writes diary entries about what the user explored at The Invention Museum. Write with calm warmth — like a thoughtful friend reflecting on the day. Not formal, not hyper.

Rules:
- Reference specific exhibits and stories the user explored
- Notice patterns (did they explore related things? jump between eras? spend time on one topic?)
- Keep it 2-4 sentences, like a quick journal note
- Sound genuinely interested in what they found
- Never use bullet points or headers — just flowing text
- Write in English`;

  const userPrompt = `Write a diary entry for ${formatDateNice(dateStr)}. The user explored these exhibits/stories:

${storyList}

Write a short, warm diary entry from Pix's perspective.`;

  try {
    return await callGemini(systemPrompt, userPrompt);
  } catch (e) {
    console.error('Diary generation failed:', e);
    return null;
  }
}

// ==================== DATE FORMATTING ====================
function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';

  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ==================== HTML / OVERLAY ====================
function injectDiaryHTML() {
  if (document.getElementById('diary-overlay')) return;
  const html = `
    <div id="diary-overlay" class="hidden">
      <div id="diary-inner">
        <div class="diary-header">
          <button id="diary-close">&times;</button>
          <h2>Your Museum Diary</h2>
          <div class="diary-subtitle">by Pix</div>
          <div class="diary-danger-zone">
            <button id="diary-delete-stories" class="diary-danger-btn">Delete All Stories</button>
            <button id="diary-delete-all" class="diary-danger-btn">Delete All Data</button>
          </div>
        </div>
        <div id="diary-content"></div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== RENDER ====================
async function renderDiary() {
  const content = document.getElementById('diary-content');
  if (!content) return;

  const { byDate, sortedDates } = groupStoriesByDate();

  if (sortedDates.length === 0) {
    content.innerHTML = `
      <div class="diary-empty">
        <div class="diary-empty-icon">&#128214;</div>
        <div>No stories yet.</div>
        <div>Explore the museum and come back — I'll keep notes for us!</div>
      </div>
    `;
    return;
  }

  const diary = loadDiaryData();
  const daysNeedingGeneration = [];

  // Build HTML for each day
  let html = '';
  for (const dateStr of sortedDates) {
    const stories = byDate[dateStr];
    const entry = diary.entries[dateStr];

    html += `<div class="diary-day" data-date="${dateStr}">`;
    html += `<div class="diary-date">${escapeHtml(formatDateNice(dateStr))}</div>`;

    // Story list
    html += `<div class="diary-stories">`;
    for (const s of stories) {
      html += `<div class="diary-story-item">
        <div class="diary-story-dot"></div>
        <div>
          <span class="diary-story-exhibit">${escapeHtml(s.exhibitTitle)}</span>
          ${s.storyTitle ? `<span class="diary-story-title"> — ${escapeHtml(s.storyTitle)}</span>` : ''}
          <span class="diary-story-progress" style="color:${s.completed ? '#4a8a5a' : '#b8860b'}; font-size:10px; margin-left:6px;">${s.completed ? '✓ completed' : `${s.progress}/${s.totalScreens} chapters`}</span>
        </div>
      </div>`;
    }
    html += `</div>`;

    // Diary entry
    if (entry?.text) {
      html += `<div class="diary-entry">${escapeHtml(entry.text)}</div>`;
    } else {
      html += `<div class="diary-entry-loading" id="diary-loading-${dateStr}">Pix is writing...</div>`;
      daysNeedingGeneration.push(dateStr);
    }

    html += `</div>`;
  }

  content.innerHTML = html;

  // Generate missing entries (lazy, in parallel)
  if (daysNeedingGeneration.length > 0) {
    initGemini();
    // Generate sequentially to avoid rate limits, but don't block the UI
    for (const dateStr of daysNeedingGeneration) {
      generateAndInsert(dateStr, byDate[dateStr], diary);
    }
  }
}

async function generateAndInsert(dateStr, stories, diary) {
  const el = document.getElementById(`diary-loading-${dateStr}`);
  const text = await generateDiaryEntry(dateStr, stories);

  if (text) {
    // Save to localStorage
    diary.entries[dateStr] = { text, generatedAt: Date.now() };
    saveDiaryData(diary);

    // Update the DOM
    if (el) {
      el.className = 'diary-entry';
      el.textContent = text;
    }
  } else if (el) {
    el.textContent = 'Could not generate entry — try again later.';
  }
}

// ==================== PUBLIC API ====================
// ==================== DELETE HELPERS ====================
async function clearAllImages() {
  try {
    const req = indexedDB.open('museum_images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to clear IndexedDB images:', e);
  }
}

function setupDangerButtons() {
  const deleteStoriesBtn = document.getElementById('diary-delete-stories');
  const deleteAllBtn = document.getElementById('diary-delete-all');

  let storiesClickCount = 0, allClickCount = 0;
  let storiesTimer = null, allTimer = null;

  deleteStoriesBtn?.addEventListener('click', () => {
    storiesClickCount++;
    if (storiesClickCount === 1) {
      deleteStoriesBtn.textContent = 'Confirm?';
      deleteStoriesBtn.style.color = '#ff4444';
      storiesTimer = setTimeout(() => { storiesClickCount = 0; deleteStoriesBtn.textContent = 'Delete All Stories'; deleteStoriesBtn.style.color = ''; }, 3000);
    } else if (storiesClickCount >= 2) {
      clearTimeout(storiesTimer);
      localStorage.removeItem('invention_museum_stories');
      clearAllImages();
      storiesClickCount = 0;
      deleteStoriesBtn.textContent = 'Done!';
      deleteStoriesBtn.style.color = '#4a8a5a';
      setTimeout(() => { deleteStoriesBtn.textContent = 'Delete All Stories'; deleteStoriesBtn.style.color = ''; }, 2000);
      renderDiary();
    }
  });

  deleteAllBtn?.addEventListener('click', () => {
    allClickCount++;
    if (allClickCount === 1) {
      deleteAllBtn.textContent = 'Confirm?';
      deleteAllBtn.style.color = '#ff4444';
      allTimer = setTimeout(() => { allClickCount = 0; deleteAllBtn.textContent = 'Delete All Data'; deleteAllBtn.style.color = ''; }, 3000);
    } else if (allClickCount >= 2) {
      clearTimeout(allTimer);
      // Clear all localStorage keys matching the patterns
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('invention_museum') || key.startsWith('pix_memory') || key.startsWith('exhibit_gen'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      // Clear the entire IndexedDB database
      clearAllImages();
      allClickCount = 0;
      deleteAllBtn.textContent = 'Done!';
      deleteAllBtn.style.color = '#4a8a5a';
      setTimeout(() => { deleteAllBtn.textContent = 'Delete All Data'; deleteAllBtn.style.color = ''; }, 2000);
      renderDiary();
    }
  });
}

export function initDiary() {
  injectDiaryHTML();

  // Use the existing diary button from index.html
  document.getElementById('diary-btn')?.addEventListener('click', openDiary);
  document.getElementById('diary-close')?.addEventListener('click', closeDiary);
  document.getElementById('diary-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'diary-overlay') closeDiary();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('diary-overlay')?.classList.contains('hidden')) {
      closeDiary();
    }
  });

  setupDangerButtons();
}

export function openDiary() {
  const overlay = document.getElementById('diary-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderDiary();
}

export function closeDiary() {
  const overlay = document.getElementById('diary-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
}
