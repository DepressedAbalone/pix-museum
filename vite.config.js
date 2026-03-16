import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5174 },
  define: {
    'process.env.GEMINI_KEY': JSON.stringify(process.env.VITE_GEMINI_KEY || ''),
  }
});
