# Pix Museum

An interactive museum where every exhibit tells the story of humans — from the Big Bang to bubble tea to SpaceX. Pix, a persistent AI companion, guides visitors through stories with comic panels, voice narration, and quizzes, building a relationship that remembers what you find fascinating.

## Run locally

```bash
# Install dependencies
npm install

# Add your Gemini API key
echo "VITE_GEMINI_KEY=your_key_here" > .env.local

# Start dev server
npx vite
```

## Data storage

All user data (exploration history, custom exhibits, diary entries) is stored locally in the browser via localStorage and IndexedDB. No server-side storage is used.
