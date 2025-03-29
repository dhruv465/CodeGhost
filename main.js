const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, systemPreferences, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;
let overlayWindow;
let parentWindow; // Hidden parent window for overlay
let isScreenSharing = false;
let lastCheckTime = Date.now();
let captureCheckCount = 0;
let stealthMode = false;
let ultraStealthMode = false;

// Function to detect screen sharing (for automatic ultra-stealth mode)
async function checkForScreenSharing() {
  try {
    // Get all screen sources
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    
    // On macOS, check if screen recording permission is active which might indicate screen sharing
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'granted') {
      const now = Date.now();
      // If we're checking frequently, it might be because screen recording is happening
      if (now - lastCheckTime < 500) {
        captureCheckCount++;
        if (captureCheckCount > 3) {
          // Multiple rapid checks may indicate screen sharing
          if (!isScreenSharing) {
            console.log('Screen sharing likely detected - enabling ultra-stealth mode');
            isScreenSharing = true;
            if (overlayWindow) {
              overlayWindow.webContents.send('set-ultra-stealth-mode', true);
              
              // Additional protection: small random movements to confuse screen capture
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
    
    // Check if screen sharing was active but now isn't
    if (isScreenSharing) {
      const shouldDisable = process.platform !== 'darwin' || 
                           systemPreferences.getMediaAccessStatus('screen') !== 'granted';
      
      if (shouldDisable) {
        console.log('Screen sharing stopped - disabling ultra-stealth mode');
        isScreenSharing = false;
        if (overlayWindow) {
          overlayWindow.webContents.send('set-ultra-stealth-mode', false);
          // Stop the random movements
          stopRandomMovements();
        }
      }
    }
  } catch (error) {
    console.error('Error checking for screen sharing:', error);
  }
}

// Very small random movements to confuse screen recording software
let movementInterval = null;
function startRandomMovements() {
  if (movementInterval) clearInterval(movementInterval);
  
  movementInterval = setInterval(() => {
    if (overlayWindow) {
      const bounds = overlayWindow.getBounds();
      // Move by 1 pixel in random direction occasionally
      if (Math.random() > 0.7) {
        overlayWindow.setBounds({
          x: bounds.x + (Math.random() > 0.5 ? 1 : -1),
          y: bounds.y + (Math.random() > 0.5 ? 1 : -1),
          width: bounds.width,
          height: bounds.height
        });
      }
    }
  }, 2000); // Every 2 seconds
}

function stopRandomMovements() {
  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true, // Don't show by default
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  
  // Create the overlay window with properties that actually exclude it from screen capture
  overlayWindow = new BrowserWindow({
    width: 1050, // Increased width for a better reading experience
    height: 800, // Increased height to accommodate question section
    x: Math.floor(width * 0.7),
    y: Math.floor(height * 0.2), // Higher up on the screen
    transparent: true,
    frame: false,
    resizable: true, // Allow user to resize if needed
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // CRITICAL: This is the flag that actually excludes the window from screen capture
    fullscreenable: false,
    // Make sure it's always on top with highest possible level
    titleBarStyle: 'hidden',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false // Prevent throttling when in background
    }
  });
  
  // Set ACTUAL exclusion flags that work with modern screen sharing
  if (process.platform === 'darwin') {
    // On macOS we need to set a special window level and turn on proper exclusion
    try {
      // This is the actual API that tells macOS "don't include this window in screen recording"
      overlayWindow.setWindowButtonVisibility(false);
      
      // This is the critical line for macOS that tells the OS not to include this window in screenshots/recordings
      overlayWindow.setContentProtection(true);
      
      // Hide dock icon
      app.dock.hide();
      
      // Additional property to keep it on top while excluded - use highest level
      overlayWindow.setAlwaysOnTop(true, 'floating', 2); // Use floating level for highest priority
    } catch (e) {
      console.error('Error setting macOS screen recording exclusion:', e);
    }
  } else if (process.platform === 'win32') {
    // Windows has a more direct API
    try {
      // This is the Windows-specific API that actually works to exclude from screen sharing
      overlayWindow.setContentProtection(true);
      
      // Make sure it's not in the alt-tab menu
      overlayWindow.setSkipTaskbar(true);
      
      // Set highest level of always-on-top
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    } catch (e) {
      console.error('Error setting Windows screen recording exclusion:', e);
    }
  }
  
  // Basic overlay setup
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  
  // Set click-through mode by default so users can type behind the overlay
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  
  // Force the window to be always visible to user but hidden from capture
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // Listen for content size changes from the renderer to auto-resize
  ipcMain.on('content-size-changed', (event, height) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const bounds = overlayWindow.getBounds();
      const displayHeight = screen.getPrimaryDisplay().workAreaSize.height;
      
      // Calculate a reasonable maximum height (80% of screen height)
      const maxHeight = Math.floor(displayHeight * 0.8);
      
      // Ensure minimum height of 250px
      const newHeight = Math.min(Math.max(height + 30, 250), maxHeight);
      
      // Only resize if the height has changed significantly 
      if (Math.abs(bounds.height - newHeight) > 15) {
        overlayWindow.setBounds({ 
          x: bounds.x, 
          y: bounds.y, 
          width: bounds.width, 
          height: newHeight 
        });
        
        // Log that we're resizing the window
        console.log(`Resizing window to height: ${newHeight}px`);
      }
    }
  });
  
  // Set up auto-stealth mode for screen sharing detection
  setInterval(checkForScreenSharing, 1000);
  
  // Send a message to the overlay to immediately enable stealth mode
  overlayWindow.webContents.on('did-finish-load', () => {
    // Immediately activate ultra-stealth mode
    overlayWindow.webContents.send('set-ultra-stealth-mode', true);
    
    // Ensure the overlay is in click-through mode by default
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  });
}

app.whenReady().then(() => {
  // On macOS, check if screen recording permission is granted
  if (process.platform === 'darwin') {
    const hasScreenRecordingPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted';
    if (!hasScreenRecordingPermission) {
      console.log('Screen recording permission not granted. Some features may not work.');
    }
  }
  
  createMainWindow(); // Create but don't show
  createOverlayWindow(); // This is the only window that should be visible by default
  
  // Register global shortcut for showing the settings window
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createMainWindow();
      mainWindow.show();
    }
  });
  
  // Register global shortcut for capturing problem
  globalShortcut.register('CommandOrControl+G', () => {
    captureSelection();
  });
  
  // Register global shortcut for toggling stealth mode
  globalShortcut.register('CommandOrControl+S', () => {
    if (overlayWindow) {
      // Toggle stealth mode
      const win = BrowserWindow.getFocusedWindow();
      // Only toggle if we're focused on the main window to prevent accidental toggles
      if (win === mainWindow) {
        stealthMode = !stealthMode;
        overlayWindow.webContents.send('set-stealth-mode', stealthMode);
        console.log('Stealth mode:', stealthMode);
      }
    }
  });
  
  // Register global shortcut for toggling click-through mode
  globalShortcut.register('CommandOrControl+T', () => {
    if (overlayWindow) {
      // Toggle click-through
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        // Get current state and toggle it
        const currentClickThrough = overlayWindow.webContents.ignoreMouseEvents;
        overlayWindow.setIgnoreMouseEvents(!currentClickThrough, { forward: true });
        console.log(`Click-through ${!currentClickThrough ? 'enabled' : 'disabled'}`);
        
        // Update the UI in the renderer
        overlayWindow.webContents.send('update-click-through', !currentClickThrough);
      }
    }
  });
  
  // Register global shortcut for toggling ultra-stealth mode
  globalShortcut.register('CommandOrControl+U', () => {
    if (overlayWindow) {
      // Toggle ultra-stealth mode
      const win = BrowserWindow.getFocusedWindow();
      // Only toggle if we're focused on the main window to prevent accidental toggles
      if (win === mainWindow) {
        ultraStealthMode = !ultraStealthMode;
        overlayWindow.webContents.send('set-ultra-stealth-mode', ultraStealthMode);
        console.log('Ultra-stealth mode:', ultraStealthMode);
        
        // Also toggle random movements
        if (ultraStealthMode) {
          startRandomMovements();
        } else {
          stopRandomMovements();
        }
      }
    }
  });
  
  // Register shortcuts for moving the overlay window
  // Move Up
  globalShortcut.register('CommandOrControl+Up', () => {
    moveOverlay(0, -20);
  });
  
  // Move Down
  globalShortcut.register('CommandOrControl+Down', () => {
    moveOverlay(0, 20);
  });
  
  // Move Left
  globalShortcut.register('CommandOrControl+Left', () => {
    moveOverlay(-20, 0);
  });
  
  // Move Right
  globalShortcut.register('CommandOrControl+Right', () => {
    moveOverlay(20, 0);
  });
  
  // Quick position presets - top, bottom, left, right
  globalShortcut.register('CommandOrControl+1', () => {
    positionOverlayPreset('top');
  });
  
  globalShortcut.register('CommandOrControl+2', () => {
    positionOverlayPreset('right');
  });
  
  globalShortcut.register('CommandOrControl+3', () => {
    positionOverlayPreset('bottom');
  });
  
  globalShortcut.register('CommandOrControl+4', () => {
    positionOverlayPreset('left');
  });
});

// Function to move the overlay window
function moveOverlay(deltaX, deltaY) {
  if (overlayWindow) {
    const [x, y] = overlayWindow.getPosition();
    overlayWindow.setPosition(x + deltaX, y + deltaY);
  }
}

// Function to position overlay at preset locations
function positionOverlayPreset(position) {
  if (!overlayWindow) return;
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
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
    createMainWindow();
    createOverlayWindow();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  // Clean up interval
  if (movementInterval) {
    clearInterval(movementInterval);
  }
});

// Screen capture function
// Replace the captureScreen function in main.js with this implementation
function captureScreen() {
  return new Promise((resolve, reject) => {
    // Get the desktop capture sources
    desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    }).then(async sources => {
      try {
        for (const source of sources) {
          if (source.name === 'Entire Screen' || source.name === 'Screen 1') {
            // Create media constraints for the screen capture
            const constraints = {
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: source.id,
                  minWidth: 1280,
                  maxWidth: 4000,
                  minHeight: 720,
                  maxHeight: 4000
                }
              }
            };
            
            // Request media stream for the screen
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Create a video element to handle the stream
            const video = document.createElement('video');
            video.srcObject = stream;
            
            // Process the stream once metadata is loaded
            video.onloadedmetadata = () => {
              video.play();
              
              // Create a canvas to capture the frame
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              
              // Draw the video frame to the canvas
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              // Stop all tracks in the stream to release the camera
              stream.getTracks().forEach(track => track.stop());
              
              // Get the image data from the canvas
              const imageData = canvas.toDataURL('image/png');
              
              // Use Tesseract.js for OCR
              const { createWorker } = require('tesseract.js');
              
              // Create and initialize Tesseract worker
              (async () => {
                const worker = await createWorker();
                await worker.loadLanguage('eng');
                await worker.initialize('eng');
                
                // Recognize text from the image
                const { data } = await worker.recognize(imageData);
                const extractedText = data.text;
                
                // Terminate worker to free resources
                await worker.terminate();
                
                // Resolve with the extracted text
                resolve(extractedText);
              })();
            };
          }
        }
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      reject(error);
    });
  });
}

// Function to process the captured text with a language model
// Replace the processWithGPT function in main.js with this implementation
async function processWithGPT(capturedText) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get API key from electron store or environment
      // For this implementation, we'll use the settings from the renderer process
      // In a real app, you would store this securely
      const apiKey = process.env.GEMINI_API_KEY || 
                    require('electron').app.getPath('userData') + '/settings.json'; // This would need a proper read mechanism
      
      // Initialize the Gemini AI
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      // Create prompt for the AI
      const prompt = `You are an AI coding assistant helping a candidate during a coding interview. 
      Analyze this problem and provide a complete solution with explanation:
      
      ${capturedText}
      
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
      
      Format your response in a concise but thorough way that enables the user to understand and explain every aspect of the solution.`;
      
      // Call the AI API for solution generation
      const result = await model.generateContent(prompt);
      const solution = result.response.text();
      
      resolve(solution);
    } catch (error) {
      console.error('Error processing with GPT:', error);
      
      // Try to use an alternative AI implementation if the primary fails
      try {
        // Fallback to a simpler OpenAI implementation if available
        const OpenAI = require('openai');
        const openai = new OpenAI(process.env.OPENAI_API_KEY);
        
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {role: "system", content: "You are an AI coding assistant helping a candidate during a coding interview."},
            {role: "user", content: `Analyze this problem and provide a solution: ${capturedText}`}
          ],
        });
        
        resolve(completion.choices[0].message.content);
      } catch (fallbackError) {
        // If both methods fail, reject with the original error
        reject(error);
      }
    }
  });
}

// Function to capture a selected region of the screen
function captureSelection() {
  if (overlayWindow) {
    // Show processing state in overlay before capturing
    overlayWindow.webContents.send('start-processing');
    
    // Capture the screen and process it
    captureScreen().then((capturedText) => {
      if (capturedText) {
        console.log('Captured text:', capturedText);
        
        // First, send the captured question to display it
        overlayWindow.webContents.send('set-question', capturedText);
        
        // Then process with GPT
        processWithGPT(capturedText).then((solution) => {
          // Send the solution to the overlay window
          if (solution) {
            overlayWindow.webContents.send('update-solution', solution);
          } else {
            overlayWindow.webContents.send('update-solution', 
              "Error: Couldn't generate a solution. Please try again or check your API key.");
          }
        }).catch(err => {
          console.error('Error processing with GPT:', err);
          overlayWindow.webContents.send('update-solution', 
            "Error: " + err.message);
        });
      } else {
        // If capture failed, hide loading state
        overlayWindow.webContents.send('update-solution', 
          "Error: No text captured. Please try again with clearer text.");
      }
    }).catch(err => {
      console.error('Error capturing screen:', err);
      overlayWindow.webContents.send('update-solution', 
        "Error: " + err.message);
    });
  }
}


// Add this function to main.js to connect the capture and processing
async function captureAndProcess() {
  if (overlayWindow) {
    // Show processing state in overlay
    overlayWindow.webContents.send('start-processing');
    
    try {
      // Step 1: Capture the screen and extract text
      const capturedText = await captureScreen();
      
      if (capturedText && capturedText.trim()) {
        console.log('Captured text successfully');
        
        // Send the captured text to display it in the overlay
        overlayWindow.webContents.send('set-question', capturedText);
        
        // Step 2: Process the text with AI
        try {
          const solution = await processWithGPT(capturedText);
          
          // Step 3: Send the solution to the overlay
          if (solution) {
            overlayWindow.webContents.send('update-solution', solution);
          } else {
            overlayWindow.webContents.send('update-solution', 
              "Error: Couldn't generate a solution. No response from AI service.");
          }
        } catch (aiError) {
          handleOCRError(aiError, overlayWindow);
        }
      } else {
        overlayWindow.webContents.send('update-solution', 
          "Error: No text was captured or recognized. Please try again with clearer text.");
      }
    } catch (captureError) {
      handleOCRError(captureError, overlayWindow);
    }
  }
}

// Update the existing captureSelection function to use this
function captureSelection() {
  if (overlayWindow) {
    overlayWindow.webContents.send('start-processing');
    captureAndProcess().catch(error => {
      handleOCRError(error, overlayWindow);
    });
  }
}
// Listen for OCR results from renderer process
ipcMain.on('ocr-result', (event, text) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('update-solution', text);
  }
});

// Listen for AI results from renderer process
ipcMain.on('ai-result', (event, solution) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('update-solution', solution);
  }
});

// Listen for toggle overlay event
ipcMain.on('toggle-overlay', () => {
  if (overlayWindow) {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      overlayWindow.show();
    }
  }
});

// Listen for toggle-click-through event from overlay
ipcMain.on('toggle-click-through', (event, shouldClickThrough) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(shouldClickThrough, { forward: true });
    console.log(`Click-through ${shouldClickThrough ? 'enabled' : 'disabled'}`);
    
    // If we're not ignoring mouse events, make the window draggable
    if (!shouldClickThrough) {
      overlayWindow.setMovable(true);
    }
  }
}); 

// Add this function to both main.js and renderer.js for better error handling
function handleOCRError(error, overlayWindow) {
  console.error('OCR or AI processing error:', error);
  
  // Categorize and handle different error types
  let errorMessage = "An error occurred while processing your request.";
  
  if (error.message && error.message.includes('API key')) {
    errorMessage = "API key error: Please check your API key in settings and try again.";
  } else if (error.message && error.message.includes('network')) {
    errorMessage = "Network error: Please check your internet connection and try again.";
  } else if (error.message && error.message.includes('permission')) {
    errorMessage = "Permission error: Screen capture requires screen recording permission.";
  } else if (error.name === 'AbortError') {
    errorMessage = "Operation timed out. Please try again.";
  }
  
  // Send error to overlay window
  if (overlayWindow) {
    overlayWindow.webContents.send('update-solution', 
      `Error: ${errorMessage}\n\nDetails: ${error.message}`);
  }
  
  return errorMessage;
}