# CodeGhost - AI Coding Interview Assistant

CodeGhost is a desktop application that helps candidates during coding interviews by capturing coding problems, using AI to solve them, and displaying solutions in a stealth overlay that's invisible during screen sharing.

## Features

- **Screen Capture**: Capture coding problems directly from your screen (`Cmd+Shift+G`).
- **OCR Processing**: Extract text from captured screenshots using Tesseract.js.
- **AI Solution Generation**: Generate solutions using Gemini AI.
- **Stealth Overlay**: Display solutions in a transparent overlay window that remains invisible during screen sharing.
- **Interaction Toggle**: Temporarily disable click-through to scroll or interact with the overlay (`Cmd+T`).
- **Keyboard Shortcuts**: Quick access with global keyboard shortcuts.

## Anti-Detection Features

CodeGhost includes advanced techniques to help you stay undetected during interviews:

- **Screen Sharing Invisibility**: The overlay uses special techniques to remain invisible to screen recording and sharing software.
- **Stealth Mode**: Toggle with `Cmd+S` for a semi-transparent overlay.
- **Ultra-Stealth Mode**: Toggle with `Cmd+U` for an extra-transparent overlay that's nearly impossible to detect (includes subtle random movements).
- **Webcam Monitoring Evasion**: Position the overlay over your coding area with `Cmd+Arrow Keys` so your eyes don't have to move away from the coding area.
- **Active Tab Protection**: The overlay doesn't steal focus when in click-through mode.
- **Detailed Reasoning**: Solutions include comprehensive comments and reasoning for every step, making it easy to explain your approach.
- **Positioning Presets**: Quickly move the overlay to strategic positions with `Cmd+1`, `Cmd+2`, `Cmd+3`, `Cmd+4`.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A Gemini API Key (set in a `.env` file in the project root: `GEMINI_API_KEY=YOUR_API_KEY_HERE`)

### Installation

1.  Clone the repository:
    ```
    git clone [https://github.com/yourusername/codeghost.git](https://github.com/yourusername/codeghost.git)
    cd codeghost
    ```

2.  Create a `.env` file in the `codeghost` directory and add your Gemini API key:
    ```
    GEMINI_API_KEY=YOUR_ACTUAL_API_KEY
    ```

3.  Install dependencies:
    ```
    npm install
    ```

4.  Start the application:
    ```
    npm start
    ```

### Usage

1.  Launch the application.
2.  Use the "Capture" button or press `Cmd+Shift+G` (or `Ctrl+Shift+G` on Win/Linux) to capture your screen.
3.  The application will process the image, extract text, and generate a solution.
4.  View the solution in the overlay window.
5.  **Scrolling/Interaction**: Press `Cmd+T` (or `Ctrl+T`) to disable click-through. You can now scroll the content panels with your mouse or interact with links. Press `Cmd+T` again to re-enable click-through.
6.  Toggle stealth mode with `Cmd+S` (or `Ctrl+S`).
7.  Toggle ultra-stealth mode with `Cmd+U` (or `Ctrl+U`).
8.  Move the overlay with `Cmd+Arrow Keys` (or `Ctrl+Arrow Keys`).
9.  Use positioning presets `Cmd+1` to `Cmd+4` (or `Ctrl+1` to `Ctrl+4`).
10. Start a new question/clear fields with `Cmd+Enter` (or `Ctrl+Enter`).
11. Quit the application with `Cmd+Q` (or `Ctrl+Q`).

## Keyboard Shortcuts

- **Capture Screen**: `Cmd+Shift+G` / `Ctrl+Shift+G`
- **Toggle Interaction (for Scrolling)**: `Cmd+T` / `Ctrl+T`
- **Toggle Stealth Mode**: `Cmd+S` / `Ctrl+S`
- **Toggle Ultra-Stealth Mode**: `Cmd+U` / `Ctrl+U`
- **Move Overlay**: `Cmd+Arrow Keys` / `Ctrl+Arrow Keys` (Up, Down, Left, Right)
- **Position Presets**: `Cmd+1` (top-right), `Cmd+2` (bottom-right), `Cmd+3` (bottom-left), `Cmd+4` (top-left) / Use `Ctrl` instead of `Cmd` on Win/Linux.
- **New Question / Clear**: `Cmd+Enter` / `Ctrl+Enter`
- **Quit Application**: `Cmd+Q` / `Ctrl+Q`

## Technologies Used

- **Electron**: Cross-platform desktop application framework
- **Tesseract.js**: Optical Character Recognition (OCR) engine
- **Gemini API**: Google's AI model for solution generation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is intended for educational purposes and practice interview preparation only. Please use responsibly and adhere to the terms and policies of any interview platforms or employers.
