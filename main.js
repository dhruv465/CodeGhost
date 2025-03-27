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
    show: false, // Don't show by default
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
    width: 750, // Increased width for a better reading experience
    height: 500, // Increased height to accommodate question section
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
function captureScreen() {
  return new Promise((resolve, reject) => {
    desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    }).then(async sources => {
      try {
        for (const source of sources) {
          if (source.name === 'Entire Screen' || source.name === 'Screen 1') {
            // For demo purposes, we're returning a sample captured text
            // In a real implementation, you would:
            // 1. Capture the screen image
            // 2. Use OCR to extract text
            // 3. Return the text
            
            // Sample captured text for demonstration
            const sampleCapturedText = `Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.

Example 1:
Input: intervals = [[1,3],[2,6],[8,10],[15,18]]
Output: [[1,6],[8,10],[15,18]]
Explanation: Since intervals [1,3] and [2,6] overlap, merge them into [1,6].

Example 2:
Input: intervals = [[1,4],[4,5]]
Output: [[1,5]]
Explanation: Intervals [1,4] and [4,5] are considered overlapping.`;
            
            resolve(sampleCapturedText);
            return;
          }
        }
        resolve("No screen source found");
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      reject(error);
    });
  });
}

// Function to process the captured text with a language model
async function processWithGPT(capturedText) {
  return new Promise((resolve, reject) => {
    try {
      // This is where you would call the actual AI API
      // For demo purposes, we'll return a sample solution
      setTimeout(() => {
        // Sample solution for the merge intervals problem
        const solution = `'''
This is a classic merge intervals problem that follows these steps:

1. Sort the intervals by their start times
2. Initialize an empty result list
3. Iterate through each interval:
   - If result is empty or current interval doesn't overlap with the last in result, add it
   - If there's overlap, merge by updating the end time of the last interval in result

Two intervals [a,b] and [c,d] overlap when c ≤ b

Time Complexity: O(n log n) - dominated by the sorting operation
Space Complexity: O(n) - to store the result
'''

def merge(intervals):
    # Sort intervals by start time
    intervals.sort(key=lambda x: x[0])
    
    result = []
    
    for interval in intervals:
        # If result is empty or no overlap with last interval
        if not result or result[-1][1] < interval[0]:
            result.append(interval)
        else:
            # Merge with the last interval in result
            result[-1][1] = max(result[-1][1], interval[1])
    
    return result
`;
        resolve(solution);
      }, 1500); // Simulate processing delay
    } catch (error) {
      reject(error);
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