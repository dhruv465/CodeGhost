// Note: We no longer need require('dotenv').config() here as the key
// will be sent from the main process via preload.js for security.
// We also remove direct access to 'fs' or 'localStorage' for the API key here.

const { ipcRenderer } = require('electron'); // Only require ipcRenderer

// We don't need these in the renderer anymore if main handles capture/OCR/AI
// const { createWorker } = require('tesseract.js');
// const { GoogleGenerativeAI } = require('@google/generative-ai');

// Remove references to elements that might not exist in index.html
// const captureBtn = document.getElementById('capture-btn');
// const toggleOverlayBtn = document.getElementById('toggle-overlay-btn');
// const statusElement = document.getElementById('status');
// const capturedTextElement = document.getElementById('captured-text');
// const apiKeyInput = document.getElementById('api-key');
// const saveApiKeyBtn = document.getElementById('save-api-key');
// let videoElement = document.getElementById('video');
// let canvasElement = document.getElementById('canvas');
// let canvasContext = canvasElement ? canvasElement.getContext('2d') : null;

// State variables managed by index.html's script or received from main
// let apiKey = ''; // Received via IPC/preload
// let isCapturing = false; // State managed by main process
// let selectedSourceId = null; // State managed by main process
// let genAI = null; // Initialized in main process
// let generationModel = null; // Initialized in main process
// let isStealthMode = false; // Synced via IPC

// --- Simplified Renderer Logic ---
// The renderer (index.html) is now primarily responsible for displaying
// information received from the main process and sending user interaction events.

// Elements from index.html (ensure these IDs exist in your index.html)
const questionContent = document.getElementById('question-content');
const theoryContent = document.getElementById('theory-content');
const codeText = document.getElementById('code-text'); // This should be the <pre><code> block
const questionSection = document.getElementById('question-section');
const theorySection = document.getElementById('theory-section');
const codeSectionWrapper = document.querySelector('.code-wrapper'); // Wrapper for code block + copy button
const mainContainer = document.getElementById('main-container');
const contentPanelElement = document.querySelector('.content-panel');
const copyBtn = document.getElementById('copy-btn');


// State for index.html UI
let isLoading = false;
let currentStealthMode = false;
let currentUltraStealthMode = false;
let clickThroughEnabled = true; // Assume initially click-through

// --- UI Update Functions ---

function showLoading() {
    isLoading = true;
    if (questionSection) questionSection.classList.add('loading');
    if (theorySection) theorySection.classList.add('loading');
    if (codeSectionWrapper) codeSectionWrapper.classList.add('loading'); // Use wrapper for skeleton
    if(contentPanelElement) {
        contentPanelElement.classList.remove('collapsed'); // Ensure panel is visible
        contentPanelElement.classList.add('expanded');
    }

}

function hideLoading() {
    isLoading = false;
     if (questionSection) questionSection.classList.remove('loading');
     if (theorySection) theorySection.classList.remove('loading');
     if (codeSectionWrapper) codeSectionWrapper.classList.remove('loading');
}

// Simple language detection based on keywords (can be improved)
function detectLanguage(code) {
     if (!code) return 'plaintext';
     code = code.toLowerCase(); // Case-insensitive check

     // Prioritize more specific keywords
     if (/\b(import\s+(react|vue|angular)|class\s+\w+\s+extends\s+(React\.Component|Vue))\b/.test(code)) return 'javascript'; // JSX/Frameworks
     if (/\b(public\s+static\s+void\s+main|System\.out\.println|import\s+java\.)\b/.test(code)) return 'java';
     if (/\b(#include|std::|cout|cin|int\s+main\s*\()\b/.test(code)) return 'cpp';
     if (/\b(namespace|class\s+\w+\s*:\s*|Console\.WriteLine|using\s+System)\b/.test(code)) return 'csharp';
     if (/\b(def\s+\w+\s*\(.*\):|import\s+\w+(\s+as\s+\w+)?|print\(|for\s+\w+\s+in\s+)\b/.test(code)) return 'python';
     if (/\b(func\s+\w+\s*\(.*\)|package\s+main|fmt\.Println|import\s+\()\b/.test(code)) return 'go';
     if (/\b(fn\s+\w+\s*\(.*\)|let\s+mut|println!|use\s+std::)\b/.test(code)) return 'rust';
     if (/\b(function\s+\w+\s*\(.*\)|const\s+|let\s+|document\.getElementById|console\.log)\b/.test(code)) return 'javascript';
     if (/\b(def\s+\w+|puts|require|class\s+\w+\s*<\s*\w+)\b/.test(code)) return 'ruby';
     if (/\b(interface\s+\w+|type\s+\w+\s*=|export\s+const|import\s+\{.*\}\s+from)\b/.test(code)) return 'typescript';


     return 'plaintext'; // Default
 }


// Parse solution into theory and code (improved robustness)
function parseSolution(solution) {
    if (!solution) return { theory: 'No solution provided.', code: '', language: 'plaintext' };

    solution = solution.trim();
    let theory = '';
    let code = '';
    let language = 'plaintext';

    // Common patterns for code blocks (Markdown, specific comments)
    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/; // Markdown code blocks
    const pythonCommentBlockRegex = /^(['"]{3})([\s\S]*?)\1\s*([\s\S]*)/; // Python docstring start
    const jsJavaCommentBlockRegex = /^\/\*([\s\S]*?)\*\/\s*([\s\S]*)/; // JS/Java block comment start

    let match;

    if ((match = solution.match(codeBlockRegex))) {
        // Found Markdown code block
        language = match[1] || detectLanguage(match[2]); // Use language hint or detect
        code = match[2].trim();
        // Try to extract theory from text before the code block
        const potentialTheory = solution.substring(0, solution.indexOf(match[0])).trim();
        if (potentialTheory) {
            theory = potentialTheory;
        } else {
            theory = "Explanation (if any) should precede the code block.";
        }

    } else if ((match = solution.match(pythonCommentBlockRegex))) {
        // Found Python docstring at the beginning
        theory = match[2].trim();
        code = match[3].trim();
        language = 'python'; // Assume Python
    } else if ((match = solution.match(jsJavaCommentBlockRegex))) {
        // Found JS/Java block comment at the beginning
        theory = match[1].trim();
        code = match[2].trim();
        language = detectLanguage(code || ''); // Detect language from code part
         if (language === 'plaintext' && (code.includes('class') || code.includes('System.'))) language = 'java'; // Heuristic for Java
         else if (language === 'plaintext' && (code.includes('function') || code.includes('const'))) language = 'javascript'; // Heuristic for JS
    } else {
        // No clear separator, assume mostly code or split heuristically
        // This is less reliable. Could try splitting by first blank line etc.
        code = solution; // Default to all code if no structure found
        theory = 'Could not automatically separate explanation from code.';
        language = detectLanguage(code);
    }

     // Fallback if code is empty but theory isn't
     if (!code && theory) {
        code = theory; // Assume the "theory" was actually the code
        theory = 'Could not automatically separate explanation from code.';
        language = detectLanguage(code);
     }


    return { theory: theory || "No explanation provided.", code: code || "", language: language || 'plaintext' };
}


// --- IPC Event Handlers (Receiving from Main) ---

ipcRenderer.on('start-processing', () => {
    console.log("[Overlay] Received 'start-processing'");
    if (questionContent) questionContent.textContent = 'Processing screenshot...'; // Update status
    if (theoryContent) theoryContent.innerHTML = ''; // Clear previous
    if (codeText) codeText.textContent = ''; // Clear previous code
    showLoading();
});

ipcRenderer.on('set-question', (event, text) => {
    console.log("[Overlay] Received 'set-question'");
    hideLoading(); // Hide loading if we only got the question
    if (questionContent) {
        questionContent.textContent = text || 'Waiting for capture...';
    }
     // Ensure panel is visible when question is set
     if (contentPanelElement) {
        contentPanelElement.classList.remove('collapsed');
        contentPanelElement.classList.add('expanded');
    }
    // Reset other fields
    if (theoryContent) theoryContent.innerHTML = '';
    if (codeText) codeText.textContent = '';
    if (hljs && codeText) { // Clear previous highlighting
        codeText.className = ''; // Remove language class
        hljs.highlightElement(codeText); // Re-highlight empty block (or apply default)
    }
});

ipcRenderer.on('update-solution', (event, solution) => {
    console.log("[Overlay] Received 'update-solution'");
    hideLoading(); // Data received, hide skeletons

    const { theory, code, language } = parseSolution(solution);

    if (theoryContent) {
        // Basic Markdown link handling (make clickable)
        theoryContent.innerHTML = theory
            .replace(/</g, "<") // Basic XSS prevention
            .replace(/>/g, ">")
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="#" data-url="$2" class="external-link">$1</a>'); // Basic link format [text](url)
    }
    if (codeText) {
        codeText.textContent = code; // Set the raw code
         // Apply language class for highlight.js
         codeText.className = `language-${language}`; // Remove previous classes and set new one
        if (hljs) {
            try {
                hljs.highlightElement(codeText); // Apply highlighting
            } catch (e) {
                console.error("Highlight.js error:", e);
                codeText.className = 'language-plaintext'; // Fallback
                hljs.highlightElement(codeText);
            }
        }
    }

    // Ensure panel stays visible
    if (contentPanelElement) {
       contentPanelElement.classList.remove('collapsed');
       contentPanelElement.classList.add('expanded');
   }

   // Add event listeners for newly created links
    addLinkListeners();

    // Optional: Adjust window size based on content
    // Be careful with this, might cause layout shifts
    // setTimeout(updateContentSize, 150); // Delay slightly for rendering
});


ipcRenderer.on('set-stealth-mode', (event, isStealth) => {
    console.log(`[Overlay] Setting stealth mode: ${isStealth}`);
    currentStealthMode = isStealth;
    document.body.style.opacity = isStealth ? (currentUltraStealthMode ? 0.4 : 0.7) : 1.0; // Adjust based on ultra mode too
});

ipcRenderer.on('set-ultra-stealth-mode', (event, isUltraStealth) => {
    console.log(`[Overlay] Setting ultra-stealth mode: ${isUltraStealth}`);
    currentUltraStealthMode = isUltraStealth;
    document.body.style.opacity = isUltraStealth ? 0.4 : (currentStealthMode ? 0.7 : 1.0); // Adjust based on normal stealth
});

ipcRenderer.on('new-question', () => {
     console.log("[Overlay] Received 'new-question'");
     if (questionContent) questionContent.textContent = 'Waiting for code capture...';
     if (theoryContent) theoryContent.innerHTML = '';
     if (codeText) codeText.textContent = '';
     if (codeText && hljs) { // Clear highlighting
          codeText.className = '';
          hljs.highlightElement(codeText);
     }
     hideLoading(); // Ensure loading state is off
     // Keep panel expanded or collapse? User preference might be needed.
     // if (contentPanelElement) contentPanelElement.classList.add('collapsed');
 });


// --- UI Interaction Event Handlers (Sending to Main) ---

document.addEventListener('DOMContentLoaded', () => {
    const commandBar = document.querySelector('.cmd-bar-container'); // Get the whole bar

     // Command Bar Buttons
     if (commandBar) {
        commandBar.addEventListener('click', (event) => {
            const commandElement = event.target.closest('.cmd.command'); // Find the clicked command button
            if (commandElement) {
                const command = commandElement.dataset.command;
                console.log(`[Overlay] Command button clicked: ${command}`);
                switch (command) {
                    case 'capture':
                        ipcRenderer.send('capture-code');
                        break;
                    case 'stealthMode':
                         // Toggle state locally first for immediate feedback (optional)
                         // currentStealthMode = !currentStealthMode;
                         // document.body.style.opacity = currentStealthMode ? 0.7 : 1.0;
                        ipcRenderer.send('toggle-stealth-mode', !currentStealthMode); // Send desired *new* state
                        break;
                    case 'ultraStealthMode':
                         // Toggle state locally first (optional)
                         // currentUltraStealthMode = !currentUltraStealthMode;
                         // document.body.style.opacity = currentUltraStealthMode ? 0.4 : (currentStealthMode ? 0.7 : 1.0);
                        ipcRenderer.send('toggle-ultra-stealth-mode', !currentUltraStealthMode); // Send desired *new* state
                        break;
                    case 'newQuestion':
                        ipcRenderer.send('new-question');
                        break;
                    case 'toggleOverlay': // This button toggles click-through
                         clickThroughEnabled = !clickThroughEnabled;
                         ipcRenderer.send('toggle-click-through', clickThroughEnabled);
                         // Optionally provide visual feedback on the button
                         commandElement.style.backgroundColor = clickThroughEnabled ? '' : 'rgba(255, 0, 0, 0.3)';
                         break;
                    // 'moveControls' and 'Pos' don't trigger IPC, they are visual cues for global shortcuts
                }
            }
        });
     }

    // Copy Button
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const codeToCopy = codeText ? codeText.textContent : '';
            if (navigator.clipboard && codeToCopy) {
                navigator.clipboard.writeText(codeToCopy)
                    .then(() => {
                        copyBtn.classList.add('success');
                        copyBtn.innerHTML = '✓ Copied!'; // Just text, remove SVG to avoid duplication
                        setTimeout(() => {
                            copyBtn.classList.remove('success');
                            // Restore original content (including SVG)
                            copyBtn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                                </svg>
                                Copy
                            `;
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        copyBtn.textContent = '❌ Error';
                        setTimeout(() => {
                             copyBtn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                                </svg>
                                Copy
                            `;
                        }, 1500);
                    });
            } else {
                 console.warn("Clipboard API not available or no code to copy.");
            }
        });
    }

     // Initial setup
     console.log("[Overlay] Renderer loaded.");
     // Request initial state if needed, though main process usually sends it on load
});

// Function to add listeners to dynamically created links
function addLinkListeners() {
    const links = document.querySelectorAll('.external-link');
    links.forEach(link => {
        // Remove old listener before adding new one to prevent duplicates
        link.removeEventListener('click', handleLinkClick);
        link.addEventListener('click', handleLinkClick);
    });
}

function handleLinkClick(event) {
    event.preventDefault(); // Prevent default browser navigation
    const url = event.target.dataset.url;
    if (url) {
        ipcRenderer.send('open-external-link', url); // Ask main process to open securely
        console.log(`[Overlay] Requesting to open external link: ${url}`);
    }
}


// Optional: Function to request window resize based on content
// function updateContentSize() {
//     // Be cautious with frequent resizing
//     const desiredHeight = mainContainer ? mainContainer.scrollHeight + 30 : 600; // Add padding
//     ipcRenderer.send('content-size-changed', desiredHeight);
// }

// No need for the API key saving logic or capture logic here anymore
// Removed initialize(), initializeGeminiAPI(), captureScreen(), takeScreenshot(), processImage() etc.
// Removed direct event listeners for captureBtn, toggleOverlayBtn, saveApiKeyBtn