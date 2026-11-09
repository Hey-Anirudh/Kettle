// Preload: expose a minimal, safe API to the renderer.
// contextIsolation is off in this app, so this simply provides window.ipcRenderer
// (which App.jsx expects) instead of leaving it undefined.
const { ipcRenderer } = require('electron');

window.ipcRenderer = ipcRenderer;
