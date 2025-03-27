# CodeGhost - AI Coding Interview Assistant

CodeGhost is a desktop application that helps candidates during coding interviews by capturing coding problems, using AI to solve them, and displaying solutions in a stealth overlay that's invisible during screen sharing.

## Features

- **Screen Capture**: Capture coding problems directly from your screen
- **OCR Processing**: Extract text from captured screenshots using Tesseract.js
- **AI Solution Generation**: Generate solutions using Gemini AI
- **Stealth Overlay**: Display solutions in a transparent overlay window that remains invisible during screen sharing
- **Keyboard Shortcuts**: Quick access with global keyboard shortcuts

## Anti-Detection Features

CodeGhost includes advanced techniques to help you stay undetected during interviews:

- **Screen Sharing Invisibility**: The overlay uses special techniques to remain invisible to screen recording and sharing software
- **Ultra-Stealth Mode**: Toggle with `Cmd+B` for an extra-transparent overlay that's nearly impossible to detect 
- **Webcam Monitoring Evasion**: Position the overlay over your coding area with `Cmd+Arrow Keys` so your eyes don't have to move away from the coding area
- **Active Tab Protection**: The stealth mode ensures your cursor focus doesn't change
- **Detailed Reasoning**: Solutions include comprehensive comments and reasoning for every step, making it easy to explain your approach
- **Positioning Presets**: Quickly move the overlay to strategic positions with `Cmd+1`, `Cmd+2`, `Cmd+3`, `Cmd+4`

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/codeghost.git
   cd codeghost
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the application:
   ```
   npm start
   ```

### Usage

1. Enter your Gemini API key in the application settings
2. Use the "Capture Screen" button or press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) to capture your screen
3. The application will process the image, extract text, and generate a solution
4. View the solution in the overlay window
5. Toggle the overlay visibility with `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
6. Toggle ultra-stealth mode with `Ctrl+B` (or `Cmd+B` on Mac)
7. Move the overlay with `Cmd+Arrow Keys` to position it over your coding area

## Keyboard Shortcuts

- **Capture Screen**: `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
- **Toggle Overlay**: `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) 
- **Toggle Stealth Mode**: `Ctrl+B` (or `Cmd+B` on Mac)
- **Move Overlay**: `Cmd+Arrow Keys` (Up, Down, Left, Right)
- **Position Presets**: `Cmd+1` (top), `Cmd+2` (right), `Cmd+3` (bottom), `Cmd+4` (left)

## Technologies Used

- **Electron**: Cross-platform desktop application framework
- **Tesseract.js**: Optical Character Recognition (OCR) engine
- **Gemini API**: Google's AI model for solution generation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is intended for educational purposes and practice interview preparation only. Please use responsibly and adhere to the terms and policies of any interview platforms or employers. 