// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log("[Preload] Script executing.");

// Expose specific IPC channels safely to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Send from Renderer to Main ---
    send: (channel, data) => {
        // Whitelist channels renderer is allowed to SEND ON
        let validSendChannels = [
            'capture-code',             // Request screen capture and processing
            'toggle-click-through',     // Inform main about desired click-through state
            'toggle-stealth-mode',      // Inform main about stealth toggle
            'toggle-ultra-stealth-mode',// Inform main about ultra-stealth toggle
            'new-question',             // Request to clear state
            'open-external-link',       // Request to open a URL
            // 'resize-overlay' // --- REMOVED: No longer needed ---
        ];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
             console.warn(`[Preload] Blocked attempt to send on invalid channel: ${channel}`);
        }
    },

    // --- Receive from Main in Renderer ---
    on: (channel, func) => {
        // Whitelist channels renderer is allowed to LISTEN TO
        let validReceiveChannels = [
            'start-processing',         // Main signals start of capture/AI process
            'set-question',             // Main sends extracted/filtered question text
            'update-solution',          // Main sends the final AI-generated solution
            'set-stealth-mode',         // Main sends current stealth mode state
            'set-ultra-stealth-mode',   // Main sends current ultra-stealth mode state
            'new-question',             // Main confirms/triggers new question state reset
            'set-command-visibility',   // Main sends visibility flags for commands
            'trigger-toggle-click-through', // Main requests renderer to toggle its state
            'set-click-through-init'    // Main sends initial click-through state
        ];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event arg
            const listener = (event, ...args) => func(...args);
            ipcRenderer.on(channel, listener);
             // Return an unsubscribe function
             return () => { ipcRenderer.removeListener(channel, listener); };
        } else {
             console.warn(`[Preload] Blocked attempt to listen on invalid channel: ${channel}`);
              return () => {}; // Return empty unsubscribe function
        }
    },
});

console.log("[Preload] electronAPI exposed.");
