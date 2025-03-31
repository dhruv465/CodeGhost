const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    desktopCapturer,
    screen,
    systemPreferences,
    shell,
    dialog
} = require('electron');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

let overlayWindow = null;
let stealthMode = false;
let ultraStealthMode = false;
let genAI = null;
let generationModel = null;
let apiKey = process.env.GEMINI_API_KEY;
let movementInterval = null;

const geminiModel = 'gemini-1.5-flash';
const MIN_WIDTH = 400;
const MIN_HEIGHT = 150;

// --- Initialize Gemini API ---
function initializeGeminiAPI(key) {
    // (Keep existing initializeGeminiAPI function)
    try {
        if (!key) {
            throw new Error("API key is missing.");
        }
        genAI = new GoogleGenerativeAI(key);
        generationModel = genAI.getGenerativeModel({ model: geminiModel });
        console.log("[Main] Gemini API initialized with model:", geminiModel);
        return true;
    } catch (error) {
        console.error('[Main] Gemini API initialization error:', error);
        dialog.showErrorBox("Gemini Initialization Error", `Failed to initialize Gemini API: ${error.message}. Check your API key (.env file) and network connection.`);
        apiKey = null;
        return false;
    }
}

// --- OCR Text Filtering ---
function filterOcrText(rawText) {
    // (Keep existing filterOcrText function)
     if (!rawText) return "";
    console.log("[Filter] Starting text filtering...");
    const lines = rawText.split('\n');
    const filteredLines = [];
    let problemStarted = false; // Flag to track if problem content has begun

    const commonNoise = [
        /^\s*share\s*$/i, /^\s*feedback\s*$/i, /^\s*submit\s*$/i, /^\s*run\s*code\s*$/i,
        /^\s*runtime:\s*\d+(\.\d+)?\s*ms/i, /^\s*memory:\s*\d+(\.\d+)?\s*mb/i,
        /^\s*beats\s*\d+(\.\d+)?%\s*/i, /^\s*sample\s*\d*\s*$/i,
        /^\s*(accepted|wrong answer|time limit exceeded|runtime error)\s*$/i,
        /^\s*test\s*cases?\s*$/i, /^\s*constraints\s*$/i, /^\s*examples?\s*$/i,
        /^\s*-\s+google\s+chrome$/i, /^\s*\|\s*firefox$/i, /^\s*\|\s*edge$/i, /^\s*\|\s*safari$/i,
        /^\s*problem\s*list\s*$/i, /^\s*submissions\s*$/i, /^\s*discuss\s*$/i, /^\s*solution[s]?\s*$/i,
        /^\s*editorial\s*$/i, /^\s*console\s*$/i, /^\s*notes\s*$/i, /^\s*description\s*$/i,
        /^\s*[★☆♥♡]\s*$/i, // Star/Heart icons
        /^\s*(easy|medium|hard)\s*$/i, // Difficulty tags
        /^\d+\s*\/\s*\d+\s*$/i, // Page numbers like 1 / 3
        /^\s*(like|dislike)\s*$/i, /^\s*\d+\s*(likes|dislikes)\s*$/i,
        /^\s*companies\s*$/i, /^\s*related\s*topics\s*$/i, /^\s*hints?\s*$/i,
        /^\s*language:\s*(python|java|c\+\+|javascript)/i,
        /^\s*auto\s*$/i, /^\s*(copy|copied|save|reset|clear)\s*$/i,
        /^\s*(prev|next)\s*$/i, /^\s*read\s+next\s+next/i,
        /^\s*(sign\s*in|sign\s*up|premium)\s*$/i, // Account/login elements
        /^\s*(q\d+|question\s*\d+)\s*$/i, // Question identifiers Q1, Question 2 etc.
        /^\s*\[.*]$/i, // Lines that are only content within square brackets (often metadata)
        /^\s*\{.*}$/i, // Lines that are only content within curly braces
    ];

     const problemKeywords = [
        /^\s*(problem|task|question)\s*\d*:?/i, /^\s*\d+\.\s+/i,
        /description|statement/i,
        /write a function/i, /implement a class/i, /given an? (array|string|matrix|tree|graph|list)/i, /you are given/i,
        /input:/i, /output:/i, /example\s*\d*:/i, /constraints?:/i
    ];

    for (const line of lines) {
        let trimmedLine = line.trim();
        if (!trimmedLine) continue; // Skip empty lines

        // Skip common noise patterns
        if (commonNoise.some(regex => regex.test(trimmedLine))) continue;

        // Skip lines that look like URLs or common file paths
        if (/^https?:\/\/\S+$/.test(trimmedLine) || /^www\.\S+$/.test(trimmedLine) || /^[a-z]:\\users\\/i.test(trimmedLine)) continue;

        // Skip lines that are likely just numbers, single chars, or very short non-words
        if (/^\d+$/.test(trimmedLine) || /^.$/.test(trimmedLine) || (trimmedLine.length < 4 && !/\w{2,}/.test(trimmedLine))) continue;

        // If problem hasn't started, check if this line looks like the start
        if (!problemStarted && problemKeywords.some(regex => regex.test(trimmedLine))) {
            problemStarted = true;
            console.log(`[Filter] Problem content likely started at line: "${trimmedLine.substring(0, 50)}..."`);
        }

        // Include lines if the problem seems to have started OR if the line itself contains a keyword (catches constraints/examples before main desc)
        if (problemStarted || problemKeywords.some(regex => regex.test(trimmedLine))) {
            filteredLines.push(trimmedLine);
        }
    }

    // Join back, clean up excessive newlines, and trim
    let result = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // If filtering resulted in nothing, return original text
    if (!result && rawText.trim()) {
        console.warn("[Filter] Filtering removed all text, returning original.");
        return rawText.trim();
    }

    console.log("[Filter] Filtering complete. Result snippet:", result.substring(0, 100).replace(/\n/g, "\\n") + "...");
    return result;
}

// --- Random Movement for Ultra-Stealth ---
function startRandomMovements() {
    // (Keep existing startRandomMovements function)
    if (movementInterval) clearInterval(movementInterval);
    console.log("[Stealth] Starting random movements.");
    movementInterval = setInterval(() => {
        if (overlayWindow && !overlayWindow.isDestroyed() && ultraStealthMode) {
            try {
                const bounds = overlayWindow.getBounds();
                if (Math.random() > 0.5) {
                    const deltaX = Math.random() > 0.5 ? 1 : -1;
                    const deltaY = Math.random() > 0.5 ? 1 : -1;
                    const display = screen.getDisplayMatching(bounds);
                    const workArea = display.workArea;
                    let newX = bounds.x + deltaX;
                    let newY = bounds.y + deltaY;
                    newX = Math.max(workArea.x, Math.min(newX, workArea.x + workArea.width - bounds.width));
                    newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - bounds.height));
                    overlayWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
                }
            } catch (error) {
                console.error("[Stealth] Error during random movement:", error);
                stopRandomMovements();
            }
        } else {
             stopRandomMovements();
        }
    }, 3000);
}

function stopRandomMovements() {
    // (Keep existing stopRandomMovements function)
     if (movementInterval) {
        console.log("[Stealth] Stopping random movements.");
        clearInterval(movementInterval);
        movementInterval = null;
    }
}

// --- Create Overlay Window ---
function createOverlayWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const initialWidth = 1040;
    const initialHeight = 1040;
    console.warn(`[Main] Setting initial overlay size to ${initialWidth}x${initialHeight}. This will likely be constrained by screen dimensions (${screenWidth}x${screenHeight}).`);

    const constrainedWidth = Math.min(initialWidth, screenWidth);
    const constrainedHeight = Math.min(initialHeight, screenHeight);
    const initialX = Math.max(0, Math.floor((screenWidth - constrainedWidth) / 2));
    const initialY = Math.max(0, Math.floor((screenHeight - constrainedHeight) / 2));

    overlayWindow = new BrowserWindow({
        width: initialWidth,
        height: initialHeight,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        x: initialX,
        y: initialY,
        transparent: true,
        // --- UPDATED: Show frame and use hiddenInset title bar for macOS controls ---
        frame: true, // Set to true to show the frame
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', // Use inset controls on macOS
        // --- END UPDATED ---
        resizable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false, // Keep no shadow for overlay feel, or set true for standard window
        fullscreenable: true, // Allow fullscreen/maximize
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Platform-specific protections
     if (process.platform === 'darwin') {
        try {
            // --- REMOVED: overlayWindow.setWindowButtonVisibility(false); --- (We want them visible now)
            overlayWindow.setContentProtection(true);
            app.dock.hide(); // Still hide dock icon if desired
            overlayWindow.setAlwaysOnTop(true, 'floating', 2);
            overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        } catch (e) { console.error('Error setting macOS specific window properties:', e); }
    } else if (process.platform === 'win32') {
        // Windows/Linux will use standard frame due to titleBarStyle: 'default'
        try {
            overlayWindow.setContentProtection(true);
            overlayWindow.setSkipTaskbar(true); // Keep off taskbar if desired
            overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            overlayWindow.setVisibleOnAllWorkspaces(true);
        } catch (e) { console.error('Error setting Windows specific window properties:', e); }
    }

    const htmlPath = path.join(__dirname, 'renderer', 'index.html');
    overlayWindow.loadFile(htmlPath);
    console.log(`[Main] Loading overlay HTML from: ${htmlPath}`);

    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    console.log("[Main] Overlay initialized with click-through ENABLED. Use Cmd+T to toggle interaction.");

    overlayWindow.on('closed', () => {
        overlayWindow = null;
        stopRandomMovements();
    });

    overlayWindow.webContents.on('did-finish-load', () => {
         console.log("[Main] Overlay window finished loading.");
         overlayWindow.webContents.send('set-stealth-mode', stealthMode);
         overlayWindow.webContents.send('set-ultra-stealth-mode', ultraStealthMode);
         overlayWindow.webContents.send('set-command-visibility', {
             capture: true, stealthMode: true, ultraStealthMode: true,
             newQuestion: true, toggleOverlay: true, moveControls: true
         });
         overlayWindow.webContents.send('set-click-through-init', true);
    });

    // overlayWindow.webContents.openDevTools({ mode: 'detach' });
    overlayWindow.show();
}

// --- App Lifecycle ---
app.whenReady().then(async () => {
    // (Keep existing permission checks)
    let permissionsGranted = true;
    if (process.platform === 'darwin') {
        const accessibilityStatus = systemPreferences.isTrustedAccessibilityClient(true);
        const screenStatus = systemPreferences.getMediaAccessStatus('screen');

        if (!accessibilityStatus) {
             permissionsGranted = false;
             dialog.showMessageBox({type: 'warning', buttons: ['Open Settings', 'Quit'], defaultId: 0, title: 'Accessibility Permission Required', message: 'CodeGhost needs Accessibility access.', detail: 'Please grant access in System Settings > Privacy & Security > Accessibility, then restart.'})
                .then(({ response }) => { if (response === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); app.quit(); });
            return;
        }
        if (screenStatus !== 'granted') {
            permissionsGranted = false;
             try { const granted = await systemPreferences.askForMediaAccess('screen'); if (!granted) { /* Show dialog and quit */ dialog.showMessageBox({ type: 'warning', buttons: ['Open Settings', 'Quit'], defaultId: 0, title: 'Screen Recording Permission Required', message: 'CodeGhost needs Screen Recording access.', detail: 'Please grant access in System Settings > Privacy & Security > Screen Recording, then restart.'}).then(({ response }) => { if (response === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenRecording'); app.quit(); }); return; } }
             catch (error) { console.error("[Main] Error requesting screen permission:", error); dialog.showErrorBox("Permission Error", "Could not request Screen Recording permission."); app.quit(); return; }
        }
    }

     if (permissionsGranted || process.platform !== 'darwin') {
        createOverlayWindow();
        if (apiKey) { initializeGeminiAPI(apiKey); }
        else { console.warn("[Main] Gemini API key missing."); dialog.showMessageBox({ type: 'info', title: 'API Key Missing', message: 'Gemini API key not found in .env file.', detail: 'AI features disabled.' }); }
        registerShortcuts();
     }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        app.whenReady().then(() => {
             createOverlayWindow();
             if (!genAI && apiKey) initializeGeminiAPI(apiKey);
             registerShortcuts();
         });
    }
});

app.on('will-quit', () => {
    unregisterAllShortcuts();
    stopRandomMovements();
});

// --- Global Shortcuts ---
function registerShortcuts() {
     // (Keep existing shortcuts)
     console.log('[Main] Registering global shortcuts...');
     const shortcuts = {
         'CommandOrControl+Shift+G': async () => { if (overlayWindow && !overlayWindow.isDestroyed()) await captureAndProcess(); },
         'CommandOrControl+S': () => { if (overlayWindow) { stealthMode = !stealthMode; overlayWindow.webContents.send('set-stealth-mode', stealthMode); console.log('[Main] Stealth mode toggled:', stealthMode); } },
         'CommandOrControl+U': () => { if (overlayWindow) { ultraStealthMode = !ultraStealthMode; overlayWindow.webContents.send('set-ultra-stealth-mode', ultraStealthMode); if (ultraStealthMode) startRandomMovements(); else stopRandomMovements(); console.log('[Main] Ultra-stealth mode toggled:', ultraStealthMode); } },
         'CommandOrControl+T': () => {
             if (overlayWindow) overlayWindow.webContents.send('trigger-toggle-click-through');
         },
         'CommandOrControl+Up': () => moveOverlay(0, -20),
         'CommandOrControl+Down': () => moveOverlay(0, 20),
         'CommandOrControl+Left': () => moveOverlay(-20, 0),
         'CommandOrControl+Right': () => moveOverlay(20, 0),
         'CommandOrControl+1': () => positionOverlayPreset('top-right'),
         'CommandOrControl+2': () => positionOverlayPreset('bottom-right'),
         'CommandOrControl+3': () => positionOverlayPreset('bottom-left'),
         'CommandOrControl+4': () => positionOverlayPreset('top-left'),
         'CommandOrControl+Return': () => { if (overlayWindow) overlayWindow.webContents.send('new-question'); },
         'CommandOrControl+Q': () => {
             console.log('[Main] Quit shortcut detected. Quitting app.');
             app.quit();
         }
     };

     let registrationSuccess = true;
     for (const accelerator in shortcuts) {
         try {
             if (!globalShortcut.register(accelerator, shortcuts[accelerator])) {
                 console.warn(`[Main] Failed to register shortcut: ${accelerator}.`);
                 registrationSuccess = false;
             } else { console.log(`[Main] Registered shortcut: ${accelerator}`); }
         } catch (error) { console.error(`[Main] Error registering shortcut ${accelerator}:`, error); registrationSuccess = false; }
     }
     if (!registrationSuccess) dialog.showErrorBox("Shortcut Registration Warning", "One or more global shortcuts could not be registered. They might be in use by another application.");
 }

 function unregisterAllShortcuts() {
     console.log("[Main] Unregistering all global shortcuts.");
     globalShortcut.unregisterAll();
 }

 // --- IPC Handlers ---
 ipcMain.on('capture-code', async () => { await captureAndProcess(); });

 ipcMain.on('toggle-click-through', (event, clickThroughEnabled) => {
    console.log(`[Main] Setting click-through state from renderer: ${clickThroughEnabled}`);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
         try {
             overlayWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
             console.log(`[Main] Overlay mouse events ignored: ${clickThroughEnabled}`);
         }
         catch (error) { console.error("[Main] Error setting ignore mouse events:", error); }
    }
 });

 ipcMain.on('toggle-stealth-mode', (event, isStealth) => { stealthMode = isStealth; });
 ipcMain.on('toggle-ultra-stealth-mode', (event, isUltraStealth) => { ultraStealthMode = isUltraStealth; if (isUltraStealth) startRandomMovements(); else stopRandomMovements(); });
 ipcMain.on('new-question', () => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('new-question'); });
 ipcMain.on('open-external-link', (event, url) => {
     // (Keep existing link handler)
     console.log(`[Main] Received request to open external link: ${url}`);
     if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
          shell.openExternal(url).catch(err => { console.error(`[Main] Failed to open URL "${url}":`, err); dialog.showErrorBox("Link Error", `Could not open link: ${url}`); });
     } else { console.warn(`[Main] Blocked attempt to open invalid URL: ${url}`); }
  });

 // --- Window Movement and Positioning ---
 function moveOverlay(deltaX, deltaY) {
    // (Keep existing moveOverlay function)
     if (overlayWindow && !overlayWindow.isDestroyed()) {
         try {
             const bounds = overlayWindow.getBounds(); const display = screen.getDisplayMatching(bounds); const workArea = display.workArea;
             let newX = bounds.x + deltaX; let newY = bounds.y + deltaY;
             newX = Math.max(workArea.x, Math.min(newX, workArea.x + workArea.width - bounds.width));
             newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - bounds.height));
             overlayWindow.setPosition(newX, newY);
         } catch (error) { console.error("[Main] Error moving overlay:", error); }
     }
 }

 function positionOverlayPreset(position) {
    // (Keep existing positionOverlayPreset function)
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
     try {
         const primaryDisplay = screen.getPrimaryDisplay(); const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
         const [overlayWidth, overlayHeight] = overlayWindow.getSize(); const margin = 30; let x, y;
         switch (position) {
             case 'top-right': x = screenWidth - overlayWidth - margin; y = margin; break;
             case 'bottom-right': x = screenWidth - overlayWidth - margin; y = screenHeight - overlayHeight - margin; break;
             case 'bottom-left': x = margin; y = screenHeight - overlayHeight - margin; break;
             case 'top-left': x = margin; y = margin; break;
             default: x = screenWidth - overlayWidth - margin; y = margin; break;
         }
         x = Math.max(primaryDisplay.workArea.x, Math.min(x, primaryDisplay.workArea.x + screenWidth - overlayWidth));
         y = Math.max(primaryDisplay.workArea.y, Math.min(y, primaryDisplay.workArea.y + screenHeight - overlayHeight));
         overlayWindow.setPosition(x, y); console.log(`[Main] Positioned overlay to: ${position} at (${x}, ${y})`);
     } catch (error) { console.error("[Main] Error positioning overlay:", error); }
 }

 // --- Capture and Process Logic (Main Function) ---
 async function captureAndProcess() {
    // (Keep existing captureAndProcess function)
    console.log('[Capture Flow] Starting captureAndProcess');
    if (!overlayWindow || overlayWindow.isDestroyed()) { console.error('[Capture Flow] Overlay window unavailable.'); dialog.showErrorBox("Error", "Overlay window not found."); return; }
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') { console.error('[Capture Flow] Screen permission denied.'); dialog.showErrorBox("Permission Error", "Screen Recording permission required."); return; }

    overlayWindow.webContents.send('start-processing'); // Show loading UI

    let sources;
    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
        const primarySource = sources.find(s => s.display_id && s.display_id === primaryDisplay.id.toString()) || sources.find(s => s.id.startsWith('screen:0')) || sources[0];
        if (!primarySource) throw new Error('No suitable screen source found.');
        console.log(`[Capture Flow] Using screen source: ${primarySource.name}`);

        const image = primarySource.thumbnail;
        if (!image || image.isEmpty()) throw new Error('Screen capture returned empty image.');
        const dataURL = image.toDataURL();
        console.log("[Capture Flow] Screen captured.");

        // OCR and Filter
        const rawExtractedText = await processImage(dataURL);
        if (!rawExtractedText?.trim()) { console.warn("[Capture Flow] OCR extracted no text."); overlayWindow.webContents.send('update-solution', "Error: No text detected."); return; }
        const filteredText = filterOcrText(rawExtractedText);
        const textForDisplay = filteredText || rawExtractedText;
        overlayWindow.webContents.send('set-question', textForDisplay);

        // AI Call
        if (!generationModel) { console.error("[Capture Flow] Gemini model not initialized."); overlayWindow.webContents.send('update-solution', "Error: AI model not ready."); return; }

         const prompt = `Analyze the following programming problem description, which was extracted via OCR and might contain noise. Focus ONLY on the core problem statement, examples, and constraints.

Problem Description:
\`\`\`text
${textForDisplay}
\`\`\`

Provide a complete and well-structured solution:
1.  **Analysis:** Briefly state the main goal and key requirements/constraints (2-3 sentences).
2.  **Approach:** Clearly describe the algorithm or logic used. Mention data structures.
3.  **Complexity:** Provide Time and Space complexity (e.g., O(N), O(log N), O(1)). Briefly justify.
4.  **Code:** Write a complete, runnable code solution in the most likely language (detect from Python, Java, C++, JavaScript). Add concise comments for critical logic sections. Enclose the code in a single Markdown block like \`\`\`python ... \`\`\`.
5.  **Explanation:** Briefly connect the code back to the approach.

Structure your entire response clearly using Markdown headings (e.g., ## Analysis, ## Code).`;


        console.log("[Capture Flow] Sending prompt to Gemini...");
        try {
            const result = await generationModel.generateContent(prompt);
            let solutionText = '';
             if (result?.response?.text) { // Check modern response structure
                 solutionText = result.response.text();
             } else if (result?.response?.candidates?.[0]?.content?.parts) { // Check older/alternative structure
                 solutionText = result.response.candidates[0].content.parts.map(part => part.text).join('');
             } else {
                console.error("[Capture Flow] Unexpected Gemini API response structure:", JSON.stringify(result, null, 2));
                throw new Error("Could not parse solution from AI response.");
            }
            console.log("[Capture Flow] Received solution from AI.");
            overlayWindow.webContents.send('update-solution', solutionText);
        } catch (apiError) {
            console.error("[Capture Flow] Gemini API error:", apiError);
            let errorMsg = apiError.message || "Unknown AI error.";
            if (errorMsg.includes('API key') || errorMsg.includes('PERMISSION_DENIED')) errorMsg = "Invalid Gemini API Key.";
            else if (errorMsg.includes('quota')) errorMsg = "Gemini API quota exceeded.";
            else if (errorMsg.includes('fetch') || errorMsg.includes('network')) errorMsg = "Network error contacting AI.";
            dialog.showErrorBox("AI Generation Error", errorMsg);
            overlayWindow.webContents.send('update-solution', `Error from AI: ${errorMsg}`);
        }

    } catch (err) {
        console.error('[Capture Flow] Overall capture/process error:', err);
        dialog.showErrorBox("Capture Error", `An error occurred: ${err.message || 'Unknown error'}`);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('update-solution', `Error: ${err.message}`);
        }
    }
 }

 // --- OCR Processing Logic ---
 async function processImage(imageDataURL) {
    // (Keep existing processImage function)
    console.log("[OCR] Starting OCR processing...");
    let worker = null;
    try {
        console.log("[OCR] Creating Tesseract worker...");
        // Use the imported createWorker directly
        worker = await createWorker('eng', 1, { // OEM 1 = LSTM_ONLY
             // logger: m => console.debug(`[OCR Log] ${m.status}: ${m.progress}`), // Optional detailed logging
             cacheMethod: 'none',
        });
        console.log('[OCR] Worker created and initialized.');

        console.log("[OCR] Recognizing text from image data...");
        const { data } = await worker.recognize(imageDataURL);
        console.log("[OCR] Recognition complete.");
        return data.text;

    } catch (error) {
        console.error('[OCR] Error processing image:', error);
        let detailMessage = error.message || 'Unknown OCR error';
        if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) { detailMessage += "\n\nCould not download language data. Check internet connection."; }
        else if (error.message?.includes('ENOENT')) { detailMessage += "\n\nLanguage data file not found."; }
        dialog.showErrorBox("OCR Error", `OCR failed: ${detailMessage}`);
        throw error; // Re-throw

    } finally {
        if (worker) {
            await worker.terminate();
            console.log("[OCR] Worker terminated.");
        }
    }
 }
