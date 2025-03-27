# Electron AI Interview Assistant - Project Plan

## Project Overview

The project will be developed as desktop application software using Electron and JavaScript (explicitly avoiding TypeScript). The UI should be minimalist and directly implemented using local HTML/CSS/JavaScript files, explicitly avoiding React or other frontend frameworks, to ensure simplicity and a fully desktop-integrated experience.

## Workflow Architecture

```
User triggers screenshot capture → Electron desktopCapturer API captures screen → Screenshot processed by Tesseract.js (OCR) → Text extracted and sent to Gemini  API →  generates solutions → Solutions displayed via Electron transparent overlay window (invisible during screen sharing)

Optional: Real-time interviewer audio → Speech-to-text via Whisper/Google API → Transcribed text sent to  → Solutions displayed in overlay
```

The goal is to create an Electron desktop application named **CodeGhost**, which aids candidates during coding interviews by capturing coding problems, using AI to solve them, and displaying solutions in a stealth overlay, invisible to screen-sharing software.

## Tech Stack

| Component                | Technology                                |
| ------------------------ | ----------------------------------------- |
| Frontend/Desktop App     | Electron (JavaScript)                     |
| OCR                      | Tesseract.js                              |
| AI Integration           | Gemini API                         |
| Audio Transcription      |  (Gemini) or Google Speech-to-Text |
| Packaging & Distribution | Electron-builder                          |

- **Frontend/Desktop App:** Electron (JavaScript)
- **OCR:** Tesseract.js
- **AI Integration:** Gemini API 
- **Audio Transcription (Optional):** Whisper (Gemini) or Google Cloud Speech-to-Text

## Step-by-Step Implementation Plan

### 1. Setup Electron Application

- Initialize Electron project

```bash
npm init -y
npm install electron --save-dev
```

- Create basic Electron structure:

**main.js**

```javascript
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
  win.setIgnoreMouseEvents(true);
}

app.whenReady().then(createWindow);
```

**index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CodeGhost Overlay</title>
  <style>
    body { background-color: rgba(0,0,0,0); color: white; }
  </style>
</head>
<body>
  <div id="solution"></div>
  <script src="renderer.js"></script>
</body>
</html>
```

- Configure Electron settings for cross-platform compatibility (Windows/macOS/Linux)

### 2. Create Invisible Overlay

- Configure Electron window properties as shown above
- Test invisibility with Zoom, Google Meet, and other screen-sharing tools

### 3. Screen Capture Functionality

- Implement screen capturing:
  - Utilize Electron's `desktopCapturer` API
  - Save screenshot locally or keep in memory for OCR processing

### 4. Integrate OCR Module

- Install and configure Tesseract.js
- Develop functionality to process screenshots
- Extract clear text from images

### 5. AI Solution Generation

- Set up Gemini API key and endpoint integration
- Send OCR-extracted text as prompts to 
- Retrieve and format AI responses (code solutions, explanations, complexity analysis)

### 6. Displaying AI-generated Solutions

- Render solutions clearly within Electron overlay window
- Allow user control with keyboard shortcuts for convenience:
  - Capture screenshot
  - Submit to AI
  - Hide/show overlay instantly

### 7. Optional: Real-Time Audio Transcription

- Integrate microphone/audio capture with Electron/Node.js
- Implement speech-to-text transcription
- Convert interviewer audio questions to text
- Automate AI solution retrieval from transcribed audio

### 8. Stealth Testing and Optimizations

- Verify overlay invisibility with popular screen-sharing platforms (Zoom, Google Meet, Microsoft Teams, Slack, Discord).
- Utilize built-in screen recording software (QuickTime, OBS Studio, Windows Game Bar) to test invisibility thoroughly.
- Conduct controlled tests with external participants to confirm the overlay remains undetectable during live interactions.
- Optimize Electron window properties and transparency settings based on test outcomes.

### 9. Packaging & Distribution

- Use Electron-builder for packaging due to its simplicity, wide community support, and robust documentation, making it ideal for rapid development and reliable builds.
- Create installers for Windows, macOS, and Linux
- Use Electron-builder or Electron-forge for packaging
- Create installers for Windows, macOS, and Linux

## Timeline and Milestones

- **Week 1:** Electron app setup and overlay implementation
  - **Risk:** Compatibility issues across OS. **Mitigation:** Allocate extra time for cross-platform testing.
- **Week 2:** Screenshot capture and OCR integration
  - **Risk:** OCR accuracy issues. **Mitigation:** Experiment with image processing techniques to improve accuracy.
- **Week 3:** AI Integration and solution rendering
  - **Risk:** API rate limits or latency. **Mitigation:** Implement caching and batch requests strategically.
- **Week 4:** Optional audio transcription integration
  - **Risk:** Speech-to-text transcription inaccuracies. **Mitigation:** Evaluate and select the most reliable transcription API.
- **Week 5:** Testing, optimization, and stealth verification
  - **Risk:** Detection by screen-sharing platforms. **Mitigation:** Continuously iterate stealth techniques based on thorough testing.
- **Week 6:** Packaging, documentation, and deployment
  - **Risk:** Packaging and installer issues. **Mitigation:** Early-stage test builds and extensive user documentation.

## Resources Needed

- Electron official documentation
- Gemini API documentation
- Tesseract.js library
- Whisper or Google Speech-to-Text API (optional)

## Next Steps

- **UI Development Prompt:**

  - Design a minimalist, transparent, and stealth-friendly UI for the Electron app named **CodeGhost**. Ensure the UI prominently displays the AI-generated coding solutions and explanations. Utilize HTML/CSS/JavaScript (Electron compatible), keeping in mind the invisibility requirement for seamless integration during coding interviews. Optimize readability, simplicity, and responsiveness.

- Set up Electron development environment

- Secure Gemini API access

- Begin implementation phase 1 (Electron setup and overlay creation)

---

This plan outlines a clear, step-by-step approach to build a fully functional, invisible AI-powered coding interview assistant using Electron and JavaScript/TypeScript.

