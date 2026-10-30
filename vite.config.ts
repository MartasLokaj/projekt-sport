import { defineConfig } from 'vite';

// Vite runs inside our own HTTPS server (see server/index.ts).
// Two pages: host/index.html (big screen) and controller/index.html (phone).
export default defineConfig({
  appType: 'mpa',
});
