// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose specific IPC channels to the renderer process for security
// This acts as a bridge and limits what the renderer can access directly.
contextBridge.exposeInMainWorld('electronAPI', {
    // Sending messages from Renderer to Main
    send: (channel, data) => {
        // Whitelist channels renderer can send to
        let validSendChannels = [
            'capture-code',
            'toggle-click-through',
            'toggle-stealth-mode',
            'toggle-ultra-stealth-mode',
            'new-question',
            'content-size-changed', // If you use dynamic resizing
            'open-external-link'
        ];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
             console.warn(`[Preload] Blocked attempt to send on invalid channel: ${channel}`);
        }
    },
    // Receiving messages from Main to Renderer
    on: (channel, func) => {
        // Whitelist channels renderer can receive from
        let validReceiveChannels = [
            'start-processing',
            'set-question',
            'update-solution',
            'set-stealth-mode',
            'set-ultra-stealth-mode',
            'new-question',
            'set-command-visibility',
             'set-api-key' // Channel to receive API key securely
        ];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender`
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        } else {
            console.warn(`[Preload] Blocked attempt to listen on invalid channel: ${channel}`);
        }
    },
    // Function specifically to receive the API key (if needed in renderer, though better handled in main)
     receiveApiKey: (callback) => {
         ipcRenderer.on('set-api-key', (event, apiKey) => callback(apiKey));
     }
});

console.log("[Preload] Script loaded successfully.");