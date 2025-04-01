// Ensure this code runs only in Electron context with preload script
if (window.electronAPI) {

    // Elements
    const questionContent = document.getElementById('question-content');
    const theoryContent = document.getElementById('theory-content');
    const codeBlockContent = document.getElementById('code-block-content');
    const questionSection = document.getElementById('question-section');
    const theorySection = document.getElementById('theory-section');
    const codeSectionWrapper = document.getElementById('code-section-wrapper');
    const mainContainer = document.getElementById('main-container');
    const contentPanelElement = document.querySelector('.content-panel');
    const copyBtn = document.getElementById('copy-btn');
    const copyBtnText = copyBtn ? copyBtn.querySelector('span') : null;
    const copyBtnIcon = copyBtn ? copyBtn.querySelector('svg') : null;
    const commandBarContainer = document.querySelector('.cmd-bar-container');
    const commandBar = document.querySelector('.cmd-bar');
    const toggleBtnElement = document.querySelector('.cmd[data-command="toggleOverlay"]');

    // State
    let isLoading = false;
    let currentStealthMode = false;
    let currentUltraStealthMode = false;
    let clickThroughEnabled = true;

    // --- UI Update Functions ---

    function showLoading() {
        console.log("[Renderer] Showing Loading State");
        isLoading = true;
        if (questionSection) questionSection.classList.add('loading');
        if (theorySection) theorySection.classList.add('loading');
        if (codeSectionWrapper) codeSectionWrapper.classList.add('loading');
        // Expand panel if not already expanded
        if (contentPanelElement && !contentPanelElement.classList.contains('expanded')) {
            contentPanelElement.classList.remove('collapsed');
            contentPanelElement.classList.add('expanded');
        }
        // Clear previous content immediately on load start
        if(questionContent) questionContent.textContent = '';
        if(theoryContent) theoryContent.innerHTML = '';
        if(codeBlockContent) {
             codeBlockContent.textContent = '';
             codeBlockContent.className = 'language-plaintext hljs';
        }
    }

    function hideLoading() {
        console.log("[Renderer] Hiding Loading State");
        isLoading = false;
        if (questionSection) questionSection.classList.remove('loading');
        if (theorySection) theorySection.classList.remove('loading');
        if (codeSectionWrapper) codeSectionWrapper.classList.remove('loading');
    }

    function detectLanguage(code) {
        // (Keep existing detectLanguage function)
        if (!code) return 'plaintext';
        code = code.toLowerCase();
        // Prioritize more specific languages first
        if (/\b(public\s+(class|static|void|enum)|System\.out\.println|import\s+java\.)/i.test(code)) return 'java';
        if (/\b(#include|std::|cout|cin|int\s+main\s*\()/i.test(code)) return 'cpp';
        if (/\b(namespace|class\s+\w+\s*:\s*|Console\.WriteLine|using\s+System)/i.test(code)) return 'csharp';
        if (/\b(def\s+\w+\s*\(.*\):|import\s+\w+|@\w+|async\s+def)/i.test(code)) return 'python';
        if (/\b(function\s+\w+|const\s+|let\s+|var\s+|document\.getElementById|console\.log|=>|import\s+.*\s+from)/i.test(code)) return 'javascript';
        if (/\b(func\s+\w+\s*\(.*\)|package\s+main|fmt\.Println|import\s+\()/i.test(code)) return 'go';
        if (/\b(fn\s+\w+\s*\(.*\)|let\s+mut|println!|use\s+std::)/i.test(code)) return 'rust';
        if (/\b(interface\s+\w+|type\s+\w+\s*=|export\s+(const|let|var|function|class|type|interface)|import\s+\{.*\}\s+from)/i.test(code)) return 'typescript';
        // Less common or fallback
        if (/\b(def\s+\w+|puts|require|class\s+\w+\s*<\s*\w+)/i.test(code)) return 'ruby';
        return 'plaintext';
    }

    function parseSolution(solution) {
        // (Keep existing parseSolution function)
        if (!solution) return { theory: 'No solution provided.', code: '', language: 'plaintext' };

        solution = solution.trim();
        let theory = '';
        let code = '';
        let language = 'plaintext';

        // Regex for Markdown code blocks (captures language hint if present)
        const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/;
        let match;

        if ((match = solution.match(codeBlockRegex))) {
            language = match[1] || detectLanguage(match[2]);
            code = match[2].trim();
            // Theory is everything *before* the first code block
            theory = solution.substring(0, solution.indexOf(match[0])).trim();
            // If theory is empty, check for text *after* the block (less common)
            if (!theory) {
                 const afterBlock = solution.substring(solution.indexOf(match[0]) + match[0].length).trim();
                 if(afterBlock) theory = afterBlock;
            }
            if (!theory) theory = "See code below."; // Default if nothing else found

        } else {
            // No Markdown block, try common explanation keywords to split
            const explanationKeywords = ["Analysis:", "Approach:", "Explanation:", "Reasoning:", "Complexity:", "Solution:", "Algorithm:", "Thought Process:"];
            let splitIndex = -1;
            let keywordFound = "";

            for (const keyword of explanationKeywords) {
                const regex = new RegExp(`^##?\\s*${keyword}`, 'im'); // Match H2/H3 or plain keyword at line start
                const index = solution.search(regex);
                if (index !== -1) {
                    // Prefer the earliest match as the start of the explanation
                    if (splitIndex === -1 || index < splitIndex) {
                        splitIndex = index;
                        keywordFound = keyword;
                    }
                }
            }

            if (splitIndex !== -1) {
                console.log(`[Parse] Splitting theory/code based on keyword: "${keywordFound}" at index ${splitIndex}`);
                theory = solution.substring(splitIndex).trim();
                code = solution.substring(0, splitIndex).trim();
                // If the code part seems empty or trivial, maybe the split was wrong
                if (code.length < 20 && detectLanguage(code) === 'plaintext') {
                     console.warn("[Parse] Potential incorrect split, code part is very short. Re-evaluating.");
                      // Reset and try fallback
                      splitIndex = -1;
                      code = ''; theory = ''; // Reset for fallback
                }
            }

            // Fallback if no keyword split worked or was potentially wrong
            if (splitIndex === -1) {
                const potentialLang = detectLanguage(solution);
                const looksLikeCode = potentialLang !== 'plaintext' || /[{};:\n\s]{5,}/.test(solution);

                if (looksLikeCode && solution.length > 50) { // Heuristic: Assume code if it looks like it and has some length
                    console.log("[Parse] No clear separator, assuming all text is code based on content.");
                    code = solution;
                    theory = 'No explanation section automatically detected.';
                } else {
                     console.log("[Parse] No clear separator or looks short/non-code, assuming all text is theory.");
                     theory = solution;
                     code = '';
                }
            }
            language = detectLanguage(code); // Detect language from the final code part
        }

        // Final check: if code is empty but theory isn't, and theory looks like code, swap
        if (!code && theory && detectLanguage(theory) !== 'plaintext') {
            console.warn("[Parse] Swapping theory and code as theory looked like code.");
            code = theory;
            theory = 'Could not reliably separate explanation from code.';
            language = detectLanguage(code);
        }

        return {
            theory: theory || "No explanation provided.",
            code: code || "",
            language: language || 'plaintext'
        };
    }

    function addLinkListeners() {
        if (!theoryContent) return;
        const links = theoryContent.querySelectorAll('.external-link');
        links.forEach(link => {
            link.removeEventListener('click', handleLinkClick);
            link.addEventListener('click', handleLinkClick);
        });
    }

    function handleLinkClick(event) {
        event.preventDefault();
        const url = event.target.dataset.url;
        if (url) {
            window.electronAPI.send('open-external-link', url);
            console.log(`[Renderer] Requesting to open external link: ${url}`);
        }
    }

    function updateToggleButtonState(isClickThrough) {
        if (toggleBtnElement) {
            toggleBtnElement.style.backgroundColor = isClickThrough ? '' : 'rgba(255, 100, 100, 0.3)';
            toggleBtnElement.style.color = isClickThrough ? '' : '#FFDDDD';
            toggleBtnElement.title = isClickThrough ? 'Click-through ON (Window ignores mouse)' : 'Click-through OFF (Window captures mouse - Scroll enabled)';
        }
    }

    // --- IPC Event listeners (Receiving from Main) ---
    window.electronAPI.on('start-processing', () => {
        showLoading();
    });

    window.electronAPI.on('set-question', (text) => {
        console.log("[Renderer] Received set-question event");
        if (theorySection) theorySection.classList.remove('loading');
        if (codeSectionWrapper) codeSectionWrapper.classList.remove('loading');
        if (questionSection) questionSection.classList.remove('loading');
        if (questionContent) {
            questionContent.textContent = text || 'Waiting for capture...';
        }
        // Ensure panel is expanded when question is set
        if (contentPanelElement) {
            contentPanelElement.classList.remove('collapsed');
            contentPanelElement.classList.add('expanded');
        }
        if (theoryContent) theoryContent.innerHTML = '';
        if (codeBlockContent) {
            codeBlockContent.textContent = '';
            codeBlockContent.className = 'language-plaintext hljs';
        }
    });

    window.electronAPI.on('set-stealth-mode', (isStealth) => {
        console.log(`[Renderer] Setting stealth mode: ${isStealth}`);
        currentStealthMode = isStealth;
        document.body.style.opacity = currentUltraStealthMode ? 0.4 : (currentStealthMode ? 0.7 : 1.0);
    });

    window.electronAPI.on('set-ultra-stealth-mode', (isUltraStealth) => {
        console.log(`[Renderer] Setting ultra-stealth mode: ${isUltraStealth}`);
        currentUltraStealthMode = isUltraStealth;
        document.body.style.opacity = currentUltraStealthMode ? 0.4 : (currentStealthMode ? 0.7 : 1.0);
    });

    window.electronAPI.on('update-solution', (solution) => {
        console.log("[Renderer] Received update-solution event");
        hideLoading(); // Hides loading

        const { theory, code, language } = parseSolution(solution);
        console.log(`[Renderer] Parsed Solution - Lang: ${language}, Theory: ${theory.substring(0,50)}..., Code: ${code.substring(0,50)}...`);

        if (theoryContent) {
             theoryContent.innerHTML = theory
                 .replace(/&/g, "&amp;") // Basic HTML escaping
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;")
                 .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="#" data-url="$2" class="external-link" title="Open link in browser">$1</a>')
                 .replace(/\n/g, "<br>");
            addLinkListeners();
        }

        if (codeBlockContent) {
            codeBlockContent.textContent = code;
            codeBlockContent.className = `language-${language} hljs`;

            try {
                if (code && typeof hljs !== 'undefined') {
                    hljs.highlightElement(codeBlockContent);
                    console.log(`[Renderer] Applied syntax highlighting for language: ${language}`);
                } else if (!code) {
                     console.log("[Renderer] No code content to highlight.");
                }
            } catch (e) {
                console.error("[Renderer] Highlight.js error:", e);
                codeBlockContent.className = 'language-plaintext hljs';
                codeBlockContent.textContent = code; // Show raw code on error
            }
        } else {
            console.error("[Renderer] Code block element (#code-block-content) not found!");
        }
        // Ensure panel is expanded when solution arrives
        if (contentPanelElement) {
           contentPanelElement.classList.remove('collapsed');
           contentPanelElement.classList.add('expanded');
        }
    });

     window.electronAPI.on('trigger-toggle-click-through', () => {
         console.log("[Renderer] Received trigger-toggle-click-through from main");
         clickThroughEnabled = !clickThroughEnabled;
         window.electronAPI.send('toggle-click-through', clickThroughEnabled);
         updateToggleButtonState(clickThroughEnabled);
         console.log(`[Renderer] Click-through toggled via shortcut. Now: ${clickThroughEnabled ? 'ON' : 'OFF'}`);
     });

     window.electronAPI.on('set-click-through-init', (initialState) => {
         console.log(`[Renderer] Received initial click-through state: ${initialState}`);
         clickThroughEnabled = initialState;
         updateToggleButtonState(clickThroughEnabled);
     });

     // *** MODIFIED: Handle panel collapse on 'new-question' ***
     window.electronAPI.on('new-question', () => {
        console.log("[Renderer] Received new-question event (clearing fields & collapsing panel)"); // Updated log

        // Clear content fields
        if (questionContent) questionContent.textContent = 'Waiting for code capture...';
        if (theoryContent) theoryContent.innerHTML = '';
        if (codeBlockContent) {
            codeBlockContent.textContent = '';
            codeBlockContent.className = 'language-plaintext hljs';
        }

        // Collapse the panel
        if (contentPanelElement) {
            contentPanelElement.classList.add('collapsed');
            contentPanelElement.classList.remove('expanded');
        }

        hideLoading(); // Hides loading indicators
     });

     window.electronAPI.on('set-command-visibility', (visibility) => {
         console.log("[Renderer] Setting command visibility:", visibility);
         const commands = document.querySelectorAll('.cmd.command');
         commands.forEach(cmd => {
             const cmdType = cmd.dataset.command;
             if (visibility.hasOwnProperty(cmdType)) {
                 cmd.style.display = visibility[cmdType] ? 'flex' : 'none';
             }
         });
     });


    // --- DOM Event Listeners ---
    document.addEventListener('DOMContentLoaded', () => {

        // Command Bar Click Handling
        if (commandBar) {
            // (Keep existing command bar logic)
            commandBar.addEventListener('click', (event) => {
                const commandElement = event.target.closest('.cmd.command');
                if (commandElement) {
                    const command = commandElement.dataset.command;
                    console.log(`[Renderer] Command button clicked: ${command}`);
                    switch (command) {
                        case 'capture':
                            window.electronAPI.send('capture-code');
                            break;
                        case 'stealthMode':
                            currentStealthMode = !currentStealthMode;
                            window.electronAPI.send('toggle-stealth-mode', currentStealthMode);
                            document.body.style.opacity = currentUltraStealthMode ? 0.4 : (currentStealthMode ? 0.7 : 1.0);
                            break;
                        case 'ultraStealthMode':
                            currentUltraStealthMode = !currentUltraStealthMode;
                            window.electronAPI.send('toggle-ultra-stealth-mode', currentUltraStealthMode);
                            document.body.style.opacity = currentUltraStealthMode ? 0.4 : (currentStealthMode ? 0.7 : 1.0);
                            break;
                        case 'newQuestion':
                            window.electronAPI.send('new-question'); // Send to main process
                            break;
                        case 'toggleOverlay':
                            clickThroughEnabled = !clickThroughEnabled;
                            window.electronAPI.send('toggle-click-through', clickThroughEnabled);
                            updateToggleButtonState(clickThroughEnabled);
                            console.log(`[Renderer] Click-through toggled via button. Now: ${clickThroughEnabled ? 'ON' : 'OFF'}`);
                            break;
                    }
                }
            });
        }

        // Copy Button Logic
        if (copyBtn && codeBlockContent && copyBtnText && copyBtnIcon) {
            // (Keep existing copy button logic)
            const originalButtonHTML = copyBtn.innerHTML; // Store original HTML to restore icon + text

            copyBtn.addEventListener('click', () => {
                const codeToCopy = codeBlockContent.textContent;
                if (navigator.clipboard && codeToCopy) {
                    navigator.clipboard.writeText(codeToCopy)
                        .then(() => {
                            copyBtn.classList.add('success');
                            copyBtn.classList.remove('error');
                            copyBtnText.textContent = 'Copied!';
                            copyBtnIcon.style.display = 'none'; // Hide icon on success
                            setTimeout(() => {
                                copyBtn.classList.remove('success');
                                copyBtn.innerHTML = originalButtonHTML; // Restore original content
                            }, 1500);
                        })
                        .catch(err => {
                            console.error('[Renderer] Failed to copy text: ', err);
                            copyBtn.classList.add('error');
                            copyBtn.classList.remove('success');
                            copyBtnText.textContent = 'Error';
                            copyBtnIcon.style.display = 'inline-block'; // Ensure icon is visible on error
                            setTimeout(() => {
                                copyBtn.classList.remove('error');
                                copyBtn.innerHTML = originalButtonHTML; // Restore original content
                            }, 1500);
                        });
                } else {
                    console.warn("[Renderer] Clipboard API not available or no code to copy.");
                    copyBtn.classList.add('error');
                    copyBtnText.textContent = 'No Code';
                    copyBtnIcon.style.display = 'inline-block'; // Ensure icon is visible
                    setTimeout(() => {
                        copyBtn.classList.remove('error');
                        copyBtn.innerHTML = originalButtonHTML; // Restore original content
                    }, 1500);
                }
            });
        }

        console.log("[Renderer] DOM fully loaded and event listeners attached.");

    }); // End DOMContentLoaded

} else {
     console.error("[Renderer] FATAL: window.electronAPI not found. Preload script failed or contextIsolation is not working as expected.");
}