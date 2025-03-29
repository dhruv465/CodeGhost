# Electron AI Interview Assistant - Project Plan

## Project Overview

The application must strictly avoid using TypeScript or any JavaScript frameworks like React, Angular, or Vue. The app should be completely built using only HTML, Tailwind CSS,  JavaScript, and Electron, ensuring simplicity and maximum control over the desktop-integrated experience.

## Workflow Architecture

```
User triggers screenshot capture → Electron desktopCapturer API captures screen → Screenshot processed by OCR (Tesseract.js) → Text extracted and sent to Gemini API → Gemini generates solutions → Solutions displayed via Electron transparent overlay window (invisible during screen sharing)

Optional: Real-time interviewer audio → Speech-to-text via Whisper/Google API → Transcribed text sent to Gemini API → Solutions displayed in overlay
```

## Tech Stack

| Component                | Technology                                |
| ------------------------ | ----------------------------------------- |
| Frontend/Desktop App     | Electron, HTML, Plain JavaScript          |
| Styling                  | Tailwind CSS                              |
| OCR                      | Tesseract.js                              |
| AI Integration           | Gemini API                                |
| Audio Transcription      | Whisper (OpenAI) or Google Speech-to-Text |
| Packaging & Distribution | Electron-builder                          |
| Code Highlighting        | Highlight.js                              |

## Step-by-Step Implementation Plan

### 1. Setup Electron Application

- Initialize Electron project

```bash
npm init -y
npm install electron tailwindcss postcss autoprefixer vite --save-dev
```

- Configure Electron settings for cross-platform compatibility (Windows/macOS/Linux)

### 2. Create Invisible Overlay

- Configure Electron window properties (transparent, frameless, always-on-top)
- Test invisibility with Zoom, Google Meet, and other screen-sharing tools

### 3. Screen Capture Functionality

- Implement screen capture using Electron desktopCapturer API

### 4. Integrate OCR Module

- Set up and integrate Tesseract.js for efficient text extraction

### 5. AI Solution Generation

- Configure Gemini API integration
- Prompt engineering to get optimized responses

### 6. Displaying AI-generated Solutions

- Implement clear UI structure:
  - Left panel for explanatory text
  - Right panel for highlighted code snippets (using Highlight.js)
- Keyboard shortcuts for interaction

### 7. UI Layout and Command Bar Improvements

- On app launch, display only the command bar showing hotkey for screenshot
- Upon screenshot capture, automatically display overlay with skeleton loading for answer generation
- Show hotkeys for additional interactions (panel movement, reset solution)

### 8. Interaction and Hotkey Commands

- Capture screenshot: `Ctrl+Shift+S` or `Cmd+Shift+S`
- Reset and new chat: `Cmd+Enter` or `Ctrl+Enter`
- Document and display hotkeys clearly on the command bar

### 9. Optional: Real-Time Audio Transcription

- Integrate microphone/audio capture and speech-to-text transcription
- Automate solution generation from audio

### 10. Stealth Testing and Optimizations

- Verify overlay invisibility rigorously
- Optimize window properties based on test feedback

### 11. Packaging & Distribution

- Use Electron-builder for reliable, simple, cross-platform packaging
- Create installers for all supported platforms

## Testing Process

### Step 1: Electron App Initialization

- Verify window properties

### Step 2: Global Shortcuts Testing

- Validate screenshot and reset shortcuts functionality

### Step 3: OCR Functionality

- Test Tesseract.js for accuracy and speed

### Step 4: AI Solution Generation

- Ensure correct integration with Gemini API

### Step 5: Overlay Stealth Verification

- Test with screen-sharing and recording tools

### Step 6: Interaction & Usability

- Validate UI responsiveness and shortcuts interaction

### Step 7: Comprehensive Error Handling

- Simulate errors to test graceful error handling

## Next Steps

- Set up Electron development environment
- Secure API accesses (Gemini API)
- Begin implementation phase 1 (Electron setup, screen capture integration)

## UI Development Prompt:

- Design a minimalist, transparent, stealth-friendly UI for CodeGhost using only HTML, Tailwind CSS, and plain JavaScript. Prominently display AI-generated solutions (left side: explanations, right side: code snippets with Highlight.js). Implement skeleton loaders, structured overlay panel, and dynamic command bar clearly displaying hotkey instructions.

