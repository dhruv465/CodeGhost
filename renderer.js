const { ipcRenderer, desktopCapturer } = require('electron');
const { createWorker, createScheduler } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const { permission } = require('process');

// DOM Elements
const captureBtn = document.getElementById('capture-btn');
const toggleOverlayBtn = document.getElementById('toggle-overlay-btn');
const statusElement = document.getElementById('status');
const capturedTextElement = document.getElementById('captured-text');
const apiKeyInput = document.getElementById('api-key');
const saveApiKeyBtn = document.getElementById('save-api-key');

// Video elements for screen capture
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasContext = canvasElement.getContext('2d');

// Variables
let apiKey = localStorage.getItem('gemini-api-key') || '';
let isCapturing = false;
let selectedSourceId = null;
let ocrWorker = null;
let genAI = null;
let generationModel = null;
let isStealthMode = false;

// Initialize
async function initialize() {
  try {
    updateStatus('Starting initialization...');
    
    // Set API key from storage
    apiKeyInput.value = apiKey;
    
    if (apiKey) {
      const success = initializeGeminiAPI(apiKey);
      if (!success) {
        updateStatus('Warning: Failed to initialize Gemini API with saved key');
      }
    }
    
    // Enable the capture button - we'll handle OCR on-demand
    captureBtn.disabled = false;
    
    updateStatus('Ready! Use Cmd+Shift+C to capture screen or click Capture button');
    updateShortcutInfo();
  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus('Error during initialization: ' + error.message);
  }
}

// Initialize Gemini API
function initializeGeminiAPI(key) {
  try {
    genAI = new GoogleGenerativeAI(key);
    generationModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    updateStatus('Gemini API initialized');
    return true;
  } catch (error) {
    console.error('Gemini API initialization error:', error);
    updateStatus('Error initializing Gemini API: ' + error.message);
    return false;
  }
}

// Capture screen function
function captureScreen() {
  if (isCapturing) return;
  
  isCapturing = true;
  updateStatus('Preparing to capture screen...');
  
  desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 100, height: 100 } })
    .then(sources => {
      updateStatus(`Found ${sources.length} screen sources`);
      
      for (const source of sources) {
        updateStatus(`Processing source: ${source.name}`);
        if (source.name === 'Entire Screen' || source.name === 'Screen 1') {
          selectedSourceId = source.id;
          
          navigator.mediaDevices.getUserMedia({
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
          }).then(stream => {
            updateStatus('Screen capture stream acquired');
            videoElement.srcObject = stream;
            videoElement.onloadedmetadata = () => {
              updateStatus('Video stream ready, taking screenshot');
              videoElement.play();
              takeScreenshot();
            };
          }).catch(error => {
            isCapturing = false;
            console.error('Media access error:', error);
            updateStatus('Error accessing media: ' + error.message);
          });
          
          return;
        }
      }
      
      isCapturing = false;
      updateStatus('No screen source found. Please try again.');
    })
    .catch(error => {
      isCapturing = false;
      console.error('Screen capture error:', error);
      updateStatus('Error capturing screen: ' + error.message);
    });
}

// Event Listeners
captureBtn.addEventListener('click', () => {
  if (!isCapturing) {
    captureScreen();
  }
});

toggleOverlayBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-overlay');
});

saveApiKeyBtn.addEventListener('click', () => {
  const newApiKey = apiKeyInput.value.trim();
  if (newApiKey) {
    apiKey = newApiKey;
    localStorage.setItem('gemini-api-key', apiKey);
    updateStatus('API key saved to local storage');
    initializeGeminiAPI(apiKey);
  } else {
    updateStatus('Please enter a valid API key');
  }
});

// Listen for stealth mode changes
ipcRenderer.on('stealth-mode-changed', (event, enabled) => {
  isStealthMode = enabled;
  updateStatus(enabled ? 'Stealth mode activated (Cmd+B to toggle)' : 'Stealth mode deactivated');
});

// Listen for SET_SOURCE event from main process
ipcRenderer.on('SET_SOURCE', async (event, sourceId) => {
  try {
    updateStatus('Starting screen capture...');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        }
      }
    });
    handleStream(stream);
  } catch (e) {
    handleError(e);
  }
});

// Listen for CAPTURE_SELECTION event from main process
ipcRenderer.on('CAPTURE_SELECTION', async (event, sourceId) => {
  try {
    updateStatus('Please select the area with the coding problem...');
    
    // Create region selection UI if not exists
    createSelectionUI();
    
    // Show selection UI
    document.getElementById('selection-container').style.display = 'block';
    
    // Enable capture mode
    startAreaSelectionMode(sourceId);
  } catch (e) {
    handleError(e);
  }
});

// Take screenshot from video stream
async function takeScreenshot() {
  updateStatus('Taking screenshot...');
  
  // Set canvas size
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  // Draw video frame on canvas
  canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  
  // Get screenshot as data URL
  const screenshot = canvasElement.toDataURL('image/png');
  
  // Stop the video stream
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
  }
  
  updateStatus('Screenshot captured, processing with OCR...');
  
  // Process screenshot with OCR and generate solution
  await processScreenshot(screenshot);
  
  isCapturing = false;
}

// Process screenshot with Tesseract OCR and generate solution
async function processScreenshot(screenshot) {
  updateStatus('Processing image with OCR...');
  
  try {
    // Create a new worker on demand for this processing
    const worker = await createWorker({
      logger: progress => {
        updateStatus(`OCR progress: ${Math.floor((progress.progress || 0) * 100)}%`);
      }
    });
    
    updateStatus('OCR worker created, recognizing text...');
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    const { data } = await worker.recognize(screenshot);
    const extractedText = data.text;
    
    // Terminate worker after use
    await worker.terminate();
    
    // Update UI with extracted text and send to AI for solution generation
    capturedTextElement.textContent = extractedText;
    
    // Send to AI for solution generation if text is detected
    if (extractedText.trim()) {
      updateStatus('OCR successful. Sending to Gemini API...');
      generateSolution(extractedText);
    } else {
      updateStatus('No text detected in screenshot. Please try again.');
    }
  } catch (error) {
    console.error('OCR processing error:', error);
    updateStatus('OCR processing failed: ' + error.message);
  }
}

// Generate solution using Gemini API
async function generateSolution(problemText) {
  if (!genAI || !generationModel) {
    updateStatus('Gemini API not initialized. Please enter a valid API key.');
    return;
  }
  
  try {
    updateStatus('Generating solution...');
    
    const prompt = `You are an AI coding assistant helping a candidate during a coding interview. 
    Analyze this problem and provide a complete solution with explanation:
    
    ${problemText}
    
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
    
    const result = await generationModel.generateContent(prompt);
    const solution = result.response.text();
    
    // Send solution to overlay window
    ipcRenderer.send('ai-result', solution);
    
    updateStatus('Solution generated successfully');
  } catch (error) {
    console.error('AI generation error:', error);
    updateStatus('Error generating solution: ' + error.message);
  }
}

// Helper function to update status
function updateStatus(message) {
  statusElement.textContent = `Status: ${message}`;
  console.log(`[CodeGhost] ${message}`);
}

// Update shortcut information
function updateShortcutInfo() {
  const platform = navigator.platform.includes('Mac') ? 'Mac' : 'Windows/Linux';
  const cmdKey = platform === 'Mac' ? 'Cmd' : 'Ctrl';
  
  const shortcutInfo = document.querySelector('.shortcut-info');
  if (shortcutInfo) {
    shortcutInfo.innerHTML = `
      <h3>Keyboard Shortcuts:</h3>
      <p>Capture Screen: <strong>${cmdKey}+Shift+C</strong></p>
      <p>Toggle Overlay: <strong>${cmdKey}+Shift+X</strong></p>
      <p>Toggle Stealth Mode: <strong>${cmdKey}+B</strong> (extra invisible during screen sharing)</p>
      <p>Move Overlay: <strong>${cmdKey}+Arrow Keys</strong> (Up, Down, Left, Right)</p>
      <p>Position Presets: <strong>${cmdKey}+1</strong> (top), <strong>${cmdKey}+2</strong> (right), <strong>${cmdKey}+3</strong> (bottom), <strong>${cmdKey}+4</strong> (left)</p>
    `;
  }
}

// Function to create the selection UI
function createSelectionUI() {
  // Only create if it doesn't exist
  if (document.getElementById('selection-container')) return;
  
  const selectionContainer = document.createElement('div');
  selectionContainer.id = 'selection-container';
  selectionContainer.style.position = 'fixed';
  selectionContainer.style.top = '0';
  selectionContainer.style.left = '0';
  selectionContainer.style.width = '100%';
  selectionContainer.style.height = '100%';
  selectionContainer.style.backgroundColor = 'rgba(0,0,0,0.3)';
  selectionContainer.style.zIndex = '9999';
  selectionContainer.style.cursor = 'crosshair';
  selectionContainer.style.display = 'none';
  
  // Selection box
  const selectionBox = document.createElement('div');
  selectionBox.id = 'selection-box';
  selectionBox.style.position = 'absolute';
  selectionBox.style.border = '2px dashed #4CAF50';
  selectionBox.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
  selectionBox.style.display = 'none';
  
  // Instructions
  const instructions = document.createElement('div');
  instructions.id = 'selection-instructions';
  instructions.style.position = 'fixed';
  instructions.style.top = '10px';
  instructions.style.left = '50%';
  instructions.style.transform = 'translateX(-50%)';
  instructions.style.backgroundColor = 'rgba(0,0,0,0.7)';
  instructions.style.color = 'white';
  instructions.style.padding = '10px 20px';
  instructions.style.borderRadius = '5px';
  instructions.style.fontFamily = 'Arial, sans-serif';
  instructions.style.zIndex = '10000';
  instructions.innerText = 'Click and drag to select the coding problem area. Press Escape to cancel.';
  
  selectionContainer.appendChild(selectionBox);
  selectionContainer.appendChild(instructions);
  document.body.appendChild(selectionContainer);
}

// Function to start area selection mode
function startAreaSelectionMode(sourceId) {
  const selectionContainer = document.getElementById('selection-container');
  const selectionBox = document.getElementById('selection-box');
  
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  
  // Set up the selection box drawing
  selectionContainer.onmousedown = (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
    selectionBox.style.display = 'block';
  };
  
  selectionContainer.onmousemove = (e) => {
    if (!isSelecting) return;
    
    // Calculate the box size
    const width = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);
    
    // Calculate the box position
    const left = e.clientX < startX ? e.clientX : startX;
    const top = e.clientY < startY ? e.clientY : startY;
    
    // Update the box
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  };
  
  selectionContainer.onmouseup = async (e) => {
    if (!isSelecting) return;
    isSelecting = false;
    
    // Get the final coordinates
    const width = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);
    
    if (width < 20 || height < 20) {
      // Selection too small, ignore it
      selectionBox.style.display = 'none';
      return;
    }
    
    const left = e.clientX < startX ? e.clientX : startX;
    const top = e.clientY < startY ? e.clientY : startY;
    
    // Hide selection UI
    selectionContainer.style.display = 'none';
    
    // Capture the selected area
    try {
      updateStatus('Capturing selected area...');
      await captureSelectedArea(sourceId, left, top, width, height);
    } catch (error) {
      handleError(error);
    }
  };
  
  // Allow canceling with escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectionContainer.style.display = 'none';
      isSelecting = false;
      updateStatus('Selection canceled');
    }
  }, { once: true });
}

// Function to capture the selected area
async function captureSelectedArea(sourceId, left, top, width, height) {
  try {
    // Get the screen as a stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        }
      }
    });
    
    // Set up video element to display the stream
    if (!videoElement) {
      videoElement = document.getElementById('video') || document.createElement('video');
      videoElement.style.display = 'none';
      document.body.appendChild(videoElement);
    }
    
    videoElement.srcObject = stream;
    await videoElement.play();
    
    // Set up canvas to capture the selected area
    if (!canvasElement) {
      canvasElement = document.getElementById('canvas') || document.createElement('canvas');
      canvasElement.style.display = 'none';
      document.body.appendChild(canvasElement);
    }
    
    // Draw only the selected portion to the canvas
    canvasElement.width = width;
    canvasElement.height = height;
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, left, top, width, height, 0, 0, width, height);
    
    // Stop the stream
    stream.getTracks().forEach(track => track.stop());
    
    // Convert canvas to image data
    const imageData = canvasElement.toDataURL('image/png');
    
    // Process the captured image (OCR, AI generation, etc.)
    processImage(imageData);
  } catch (error) {
    handleError(error);
  }
}

// Process the captured image
// Replace the processImage function in renderer.js with this implementation
async function processImage(imageData) {
  updateStatus('Processing captured image...');
  
  try {
    // 1. Process the image with Tesseract OCR
    updateStatus('Performing OCR on captured area...');
    
    // Create a new worker for this processing
    const worker = await createWorker({
      logger: progress => {
        updateStatus(`OCR progress: ${Math.floor((progress.progress || 0) * 100)}%`);
      }
    });
    
    // Initialize OCR engine
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Perform OCR on the image
    const { data } = await worker.recognize(imageData);
    const extractedText = data.text;
    
    // Terminate worker after use to free resources
    await worker.terminate();
    
    // Update UI with the extracted text
    if (capturedTextElement) {
      capturedTextElement.innerText = extractedText;
    }
    
    // If no text was detected, notify the user
    if (!extractedText.trim()) {
      updateStatus('No text detected in the captured area. Please try again.');
      ipcRenderer.send('ai-result', "Error: No text was detected in the captured area. Please try selecting a different area with clearer text.");
      return;
    }
    
    // 2. Send the extracted code to Gemini for solution generation
    updateStatus('Text extracted successfully. Generating solution...');
    
    if (!generationModel) {
      updateStatus('Error: AI model not initialized. Please check your API key.');
      ipcRenderer.send('ai-result', "Error: AI service not initialized. Please check your API key in settings.");
      return;
    }
    
    // Create prompt for the AI
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
    
    Format your response in a concise but thorough way that enables the user to understand and explain every aspect of the solution.`;
    
    // Generate solution using Gemini API
    const result = await generationModel.generateContent(prompt);
    const solution = result.response.text();
    
    // 3. Send the solution to the overlay window
    ipcRenderer.send('ai-result', solution);
    
    updateStatus('Solution generated and sent to overlay window!');
  } catch (error) {
    console.error('Error processing captured image:', error);
    updateStatus('Error: ' + error.message);
    ipcRenderer.send('ai-result', `Error processing: ${error.message}`);
  }
}

function handleStream(stream) {
  updateStatus('Screen capture started');
  videoElement.srcObject = stream;
  videoElement.onloadedmetadata = () => {
    videoElement.play();
    captureFrame();
  };
}

function captureFrame() {
  updateStatus('Processing capture...');
  const context = canvasElement.getContext('2d');
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  
  // Stop video tracks
  videoElement.srcObject.getTracks().forEach(track => track.stop());
  
  // For demonstration, we'll just use a placeholder OCR result
  const ocrResult = "function example() {\n  console.log('This is a test code from OCR');\n}";
  capturedTextElement.textContent = ocrResult;
  updateStatus('OCR completed');
  
  // Send OCR result to main process
  ipcRenderer.send('ocr-result', ocrResult);
}

function handleError(e) {
  updateStatus(`Error: ${e.message}`);
  console.error('Error handling media devices:', e);
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
  updateStatus('DOM loaded, initializing application...');
  initialize();
});


function handleOCRError(error, overlayWindow) {
  console.error('OCR or AI error:', error);
}

let errorMessage = "An error occurred while processig your request";

if (error.message && error.message.includes("API key")) {
  errorMessage = "Invalid API key. Please check your settings.";
} else if (error.message && error.message.includes("network")) {
  errorMessage = "Network error. Please check your internet connection";

} else if (error.message && error.message.includes(permission) ) {
  errorMessage = "Permission denied. Please check your system settings";
} else if (error.message && error.message.includes("timeout")) {
  errorMessage = "Request timed out. Please try again later";
} else if (error.name === "AbortError") {
  errorMessage = "Request aborted. Please try again";
}

if (overlayWindow) {
  overlayWindow.webContents.send('update-solution',
    `Error: ${errorMessage} \n \n Details: ${error.stack || error.message  }`
  )
  return errorMessage;
}