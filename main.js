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
const {
  createWorker
} = require('tesseract.js');
const {
  GoogleGenerativeAI
} = require('@google/generative-ai');
require('dotenv').config(); // Load environment variables from .env

let overlayWindow;
let isScreenSharing = false;
let lastCheckTime = Date.now();
let captureCheckCount = 0;
let stealthMode = false;
let ultraStealthMode = false;
let genAI = null;
let generationModel = null;
let apiKey = process.env.GEMINI_API_KEY; 

// Consistent model choice
const geminiModel = 'gemini-2.0-flash';

// Initialize Gemini API
function initializeGeminiAPI(key) {
  try {
      genAI = new GoogleGenerativeAI(key);
      generationModel = genAI.getGenerativeModel({
          model: geminiModel
      });
      console.log("[Main] Gemini API initialized");
      return true;
  } catch (error) {
      console.error('[Main] Gemini API initialization error:', error);
      dialog.showErrorBox("Gemini Initialization Error", error.message);
      return false;
  }
}

async function checkForScreenSharing() {
  try {
      const sources = await desktopCapturer.getSources({
          types: ['screen']
      });
      if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'granted') {
          const now = Date.now();
          if (now - lastCheckTime < 500) {
              captureCheckCount++;
              if (captureCheckCount > 3) {
                  if (!isScreenSharing) {
                      console.log('Screen sharing likely detected - enabling ultra-stealth mode');
                      isScreenSharing = true;
                      if (overlayWindow) {
                          overlayWindow.webContents.send('set-ultra-stealth-mode', true);
                          startRandomMovements();
                      }
                  }
                  return;
              }
          } else {
              captureCheckCount = 0;
          }
          lastCheckTime = now;
      }
      if (isScreenSharing) {
          const shouldDisable = process.platform !== 'darwin' ||
              systemPreferences.getMediaAccessStatus('screen') !== 'granted';
          if (shouldDisable) {
              console.log('Screen sharing stopped - disabling ultra-stealth mode');
              isScreenSharing = false;
              if (overlayWindow) {
                  overlayWindow.webContents.send('set-ultra-stealth-mode', false);
                  stopRandomMovements();
              }
          }
      }
  } catch (error) {
      console.error('Error checking for screen sharing:', error);
  }
}

let movementInterval = null;

function startRandomMovements() {
  if (movementInterval) clearInterval(movementInterval);
  movementInterval = setInterval(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
          const bounds = overlayWindow.getBounds();
          if (Math.random() > 0.7) {
              overlayWindow.setBounds({
                  x: bounds.x + (Math.random() > 0.5 ? 1 : -1),
                  y: bounds.y + (Math.random() > 0.5 ? 1 : -1),
                  width: bounds.width,
                  height: bounds.height
              });
          }
      }
  }, 2000);
}

function stopRandomMovements() {
  if (movementInterval) {
      clearInterval(movementInterval);
      movementInterval = null;
  }
}

function createOverlayWindow() {
  const {
      width,
      height
  } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
      width: 1040,
      height: 800,
      x: Math.floor(width * 0.7),
      y: Math.floor(height * 0.2),
      transparent: true,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      titleBarStyle: 'hidden',
      webPreferences: {
          contextIsolation: false, // Required for `require` in renderer
          nodeIntegration: true,   // Required for `require` in renderer
          backgroundThrottling: false,
          preload: path.join(__dirname, 'preload.js') // Use preload script
      }
  });

  if (process.platform === 'darwin') {
      try {
          overlayWindow.setWindowButtonVisibility(false);
          overlayWindow.setContentProtection(true);
          app.dock.hide();
          overlayWindow.setAlwaysOnTop(true, 'floating', 2);
      } catch (e) {
          console.error('Error setting macOS screen recording exclusion:', e);
      }
  } else if (process.platform === 'win32') {
      try {
          overlayWindow.setContentProtection(true);
          overlayWindow.setSkipTaskbar(true);
          overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      } catch (e) {
          console.error('Error setting Windows screen recording exclusion:', e);
      }
  }

  overlayWindow.loadFile(path.join(__dirname, 'index.html'));
  overlayWindow.setIgnoreMouseEvents(true, {
      forward: true
  });
  overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
  });
  // Ensure the overlay window is shown
  overlayWindow.show();

  // Show remaining commands when overlay is ready
  overlayWindow.webContents.on('did-finish-load', () => {
      // Send API Key to preload script safely
      overlayWindow.webContents.send('set-api-key', apiKey);

      overlayWindow.webContents.send('set-command-visibility', {
          capture: true,
          toggleOverlay: true,
          stealthMode: true,
          ultraStealthMode: true,
          moveControls: true
      });
  });

  ipcMain.on('content-size-changed', (event, height) => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
          const bounds = overlayWindow.getBounds();
          const displayHeight = screen.getPrimaryDisplay().workAreaSize.height;
          const maxHeight = Math.floor(displayHeight * 0.8);
          const newHeight = Math.min(Math.max(height + 30, 250), maxHeight);
          if (Math.abs(bounds.height - newHeight) > 15) {
              overlayWindow.setBounds({
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: newHeight
              });
              console.log(`Resizing window to height: ${newHeight}px`);
          }
      }
  });

  setInterval(checkForScreenSharing, 1000);
  overlayWindow.webContents.on('did-finish-load', () => {
      overlayWindow.webContents.send('set-ultra-stealth-mode', true);
      overlayWindow.setIgnoreMouseEvents(true, {
          forward: true
      });
  });
}

app.whenReady().then(() => {
  // Check permissions first
  if (process.platform === 'darwin') {
      const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
      const screenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted';

      if (!accessibility) {
           dialog.showMessageBox({
              type: 'warning',
              buttons: ['Open Settings', 'Cancel'],
              title: 'Accessibility Permission Required',
              message: 'CodeGhost needs Accessibility access.',
              detail: 'Please grant access in System Settings > Privacy & Security > Accessibility.'
          }).then(async ({ response }) => {
              if (response === 0) await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
          });
          // Consider quitting or disabling features if permission is essential and denied
      }

      if (!screenRecording) {
           dialog.showMessageBox({
              type: 'warning',
              buttons: ['Open Settings', 'Cancel'],
              title: 'Screen Recording Permission Required',
              message: 'CodeGhost needs Screen Recording access.',
              detail: 'Please grant access in System Settings > Privacy & Security > Screen Recording.'
          }).then(async ({ response }) => {
              if (response === 0) await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenRecording');
          });
           // Consider quitting or disabling features if permission is essential and denied
      }
  }

  createOverlayWindow();

  // Initialize Gemini API after app is ready and .env is loaded
  if (apiKey) {
      initializeGeminiAPI(apiKey);
  } else {
      console.warn("[Main] Gemini API key not found in .env. The application may not function correctly.");
      dialog.showErrorBox("API Key Error", "Gemini API key not found in .env. Please set the GEMINI_API_KEY environment variable in a .env file.");
  }

  // Register global shortcuts
  console.log('[Debug] Attempting to register shortcuts');
  try {
      globalShortcut.register('CommandOrControl+Shift+G', async () => {
          console.log('[Debug] Shortcut CommandOrControl+Shift+G activated');
          if (overlayWindow && !overlayWindow.isDestroyed()) {
               console.log('[Capture Flow] Starting captureAndProcess() via shortcut');
               await captureAndProcess();
          } else {
               console.error('[Debug] Overlay window not available for capture via shortcut');
          }
      });

      globalShortcut.register('CommandOrControl+S', () => {
          if (overlayWindow) {
              stealthMode = !stealthMode;
              overlayWindow.webContents.send('set-stealth-mode', stealthMode);
              console.log('Stealth mode toggled:', stealthMode);
          }
      });

      globalShortcut.register('CommandOrControl+U', () => {
          if (overlayWindow) {
              ultraStealthMode = !ultraStealthMode;
              overlayWindow.webContents.send('set-ultra-stealth-mode', ultraStealthMode);
              console.log('Ultra-stealth mode toggled:', ultraStealthMode);
              if (ultraStealthMode) startRandomMovements();
              else stopRandomMovements();
          }
      });

      globalShortcut.register('CommandOrControl+Up', () => moveOverlay(0, -20));
      globalShortcut.register('CommandOrControl+Down', () => moveOverlay(0, 20));
      globalShortcut.register('CommandOrControl+Left', () => moveOverlay(-20, 0));
      globalShortcut.register('CommandOrControl+Right', () => moveOverlay(20, 0));
      globalShortcut.register('CommandOrControl+1', () => positionOverlayPreset('top'));
      globalShortcut.register('CommandOrControl+2', () => positionOverlayPreset('right'));
      globalShortcut.register('CommandOrControl+3', () => positionOverlayPreset('bottom'));
      globalShortcut.register('CommandOrControl+4', () => positionOverlayPreset('left'));
      globalShortcut.register('CommandOrControl+Return', () => { // Cmd/Ctrl + Enter for new question
           if (overlayWindow) {
               console.log("[Main] Resetting for new question via shortcut");
               overlayWindow.webContents.send('new-question');
           }
       });


  } catch (error) {
      console.error('Failed to register global shortcut:', error);
      dialog.showErrorBox("Shortcut Error", "Failed to register one or more global shortcuts. Check system permissions or potential conflicts.");

  }
});

// IPC Handlers
ipcMain.on('capture-code', () => {
  console.log("[Main] Received 'capture-code' IPC message");
  captureAndProcess();
});

ipcMain.on('set-question', (event, text) => {
  console.log("[Main] Received 'set-question' IPC message:", text.substring(0, 50) + "..."); // Log snippet
  if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('set-question', text);
      if (!overlayWindow.isVisible()) overlayWindow.show(); // Show if hidden
      // Consider adjusting size based on question length?
  }
});

ipcMain.on('ai-result', (event, solution) => {
  console.log("[Main] Received 'ai-result' IPC message:", solution.substring(0, 50) + "..."); // Log snippet
  if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (solution && solution.trim() !== '') {
           if (!overlayWindow.isVisible()) overlayWindow.show();
           // overlayWindow.focus(); // Might be disruptive, test usability
           overlayWindow.webContents.send('start-processing'); // Show loading skeleton
           overlayWindow.webContents.send('update-solution', solution);
      } else {
           console.log('[Main] AI result is empty, not updating overlay.');
           // Optionally send a message indicating no result?
           // overlayWindow.webContents.send('update-solution', "Could not generate a solution.");
      }
  }
});

ipcMain.on('toggle-click-through', (event, clickThrough) => {
   console.log(`[Main] Toggling click-through: ${clickThrough}`);
   if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
   }
});

ipcMain.on('toggle-stealth-mode', (event, isStealth) => {
  stealthMode = isStealth; // Sync state
  console.log(`[Main] Toggling stealth mode via button: ${isStealth}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('set-stealth-mode', isStealth);
  }
});

ipcMain.on('toggle-ultra-stealth-mode', (event, isUltraStealth) => {
  ultraStealthMode = isUltraStealth; // Sync state
  console.log(`[Main] Toggling ultra-stealth mode via button: ${isUltraStealth}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('set-ultra-stealth-mode', isUltraStealth);
      if (isUltraStealth) startRandomMovements();
      else stopRandomMovements();
  }
});

ipcMain.on('new-question', () => {
   console.log("[Main] Received 'new-question' IPC message");
   if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('new-question'); // Forward to overlay
   }
});


function moveOverlay(deltaX, deltaY) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
      const [x, y] = overlayWindow.getPosition();
      overlayWindow.setPosition(x + deltaX, y + deltaY);
  }
}

function positionOverlayPreset(position) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const {
      width,
      height
  } = primaryDisplay.workAreaSize;
  const overlaySize = overlayWindow.getSize();
  let x, y;
  switch (position) {
      case 'top':
          x = Math.floor((width - overlaySize[0]) / 2);
          y = 20;
          break;
      case 'right':
          x = width - overlaySize[0] - 20;
          y = Math.floor((height - overlaySize[1]) / 2);
          break;
      case 'bottom':
          x = Math.floor((width - overlaySize[0]) / 2);
          y = height - overlaySize[1] - 20;
          break;
      case 'left':
          x = 20;
          y = Math.floor((height - overlaySize[1]) / 2);
          break;
      default:
          return;
  }
  overlayWindow.setPosition(x, y);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
      app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (movementInterval) clearInterval(movementInterval);
});

// Capture and Process Logic
async function captureAndProcess() {
  console.log('[Capture Flow] Starting captureAndProcess');

  if (!overlayWindow || overlayWindow.isDestroyed()) {
      console.error('[Capture Flow] Error: Overlay window is not available.');
      return;
  }

   // Check screen recording permission again right before capture
   if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      console.error('[Capture Flow] Error: Screen recording permission denied.');
      dialog.showErrorBox("Permission Error", "Screen Recording permission is required to capture the screen. Please grant access in System Settings.");
      return;
   }


  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  let sources;

  try {
      sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width, height }
      });

      const primarySource = sources.find(source => source.display_id === primaryDisplay.id.toString()) ||
                            sources.find(source => source.name.includes('Screen') || source.name.includes('Display')) ||
                            sources[0];


      if (!primarySource) {
          throw new Error('No suitable screen source found. Available: ' + sources.map(s => s.name).join(', '));
      }
      console.log(`[Capture Flow] Using screen source: ${primarySource.name}`);


      const image = primarySource.thumbnail;
      if (!image || image.isEmpty()) {
          throw new Error('Screen capture returned an empty image.');
      }

      const dataURL = image.toDataURL();
      console.log("[Capture Flow] Captured screen as data URL.");

      // Notify overlay to show loading state *before* OCR/AI
      if (!overlayWindow.isVisible()) overlayWindow.show();
      overlayWindow.webContents.send('start-processing');


      const extractedText = await processImage(dataURL);
      if (!extractedText || !extractedText.trim()) {
           console.warn("[Capture Flow] OCR did not extract any text.");
           overlayWindow.webContents.send('update-solution', "Error: No text detected in the captured area."); // Update overlay with error
           return; // Stop if no text
      }
      console.log("[Capture Flow] OCR extracted text:", extractedText.substring(0, 50) + "...");
      overlayWindow.webContents.send('set-question', extractedText); // Update question panel

      // --- Gemini API Call ---
      if (!generationModel) {
          console.error("[Capture Flow] Gemini API not initialized. Cannot generate solution.");
          overlayWindow.webContents.send('update-solution', "Error: Gemini API not initialized."); // Update overlay
          return;
      }

      const prompt = `You are an AI coding assistant helping a candidate during a coding interview.
Analyze this problem and provide a complete solution with explanation:

${extractedText}

Your response should include:
1. Clear problem understanding and reasoning (2-3 sentences to explain the core challenge)
2. A step-by-step thought process that naturally leads to the solution
3. Algorithm approach with time and space complexity analysis
4. Complete, working code solution with detailed comments for EVERY important line
5. Brief explanation tying everything together

IMPORTANT: Add thorough comments throughout the code that explain your reasoning. For example:
- Add a comment before each function explaining its purpose
- Comment every significant step in the algorithm
- Explain any tricky parts or optimizations

Format your response in a concise but thorough way that enables the user to understand and explain every aspect of the solution. Use markdown for formatting code blocks and explanations where appropriate.`;

      console.log("[Capture Flow] Sending prompt to Gemini API...");
      try {
          const result = await generationModel.generateContent(prompt);
          // Need to access the text response correctly based on the Gemini SDK version
          let solutionText = '';
          if (result.response && typeof result.response.text === 'function') {
               solutionText = result.response.text(); // Common pattern for newer versions
          } else if (result.response && result.response.candidates && result.response.candidates[0].content) {
               // Handle potential different response structures
               const parts = result.response.candidates[0].content.parts;
               solutionText = parts.map(part => part.text).join('');
          } else {
               console.error("[Capture Flow] Unexpected Gemini API response structure:", result);
               throw new Error("Could not parse solution from Gemini API response.");
          }


          console.log("[Capture Flow] Received solution from AI:", solutionText.substring(0, 50) + "...");
          overlayWindow.webContents.send('update-solution', solutionText); // Send final solution
      } catch (apiError) {
          console.error("[Capture Flow] Gemini API error:", apiError);
          dialog.showErrorBox("Gemini API Error", apiError.message || "An unknown error occurred while contacting the Gemini API.");
          overlayWindow.webContents.send('update-solution', `Error from Gemini API: ${apiError.message || 'Unknown API error'}`);
      }

  } catch (err) {
      console.error('[Capture Flow] Overall capture/process error:', err);
      dialog.showErrorBox("Capture Error", err.message || "An unknown error occurred during screen capture or processing.");
       if (overlayWindow && !overlayWindow.isDestroyed()) {
          // Send error message to overlay if it exists
          overlayWindow.webContents.send('update-solution', `Error: ${err.message}`);
      }
  }
}

// OCR Processing Logic
async function processImage(imageData) {
  console.log("[OCR] Starting OCR processing...");
  let worker = null; // Initialize worker as null
   try {
       worker = await createWorker('eng'); // Create and load language in one step
       console.log('[OCR] Worker created and language loaded.');

       // Optional: Set OCR parameters for better accuracy if needed
       // await worker.setParameters({
       //     tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~ ', // Example whitelist
       // });

       const { data } = await worker.recognize(imageData);
       console.log("[OCR] Recognition complete. Extracted text:", data.text.substring(0, 50) + "...");
       return data.text;
   } catch (error) {
       console.error('[OCR] Error processing image:', error);
       dialog.showErrorBox("OCR Error", error.message || "An unknown OCR error occurred.");
       throw error; // Re-throw the error to be caught by captureAndProcess
   } finally {
       if (worker) {
           await worker.terminate();
           console.log("[OCR] Worker terminated.");
       }
   }
}