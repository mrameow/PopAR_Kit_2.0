# PopAR Kit 2.0

A browser-based Augmented Reality (AR) spelling and vocabulary game for young learners — pop bubbles, dodge obstacles, and complete sentences using nothing but your hand and body movements in front of a webcam.

**Play it now:** https://mrameow.github.io/PopAR_Kit_2.0/

An upgrade from the original [PopAR Kit](https://github.com/mrameow/PopAR), rebuilt with self-hosted AR tracking, full offline support, and two brand-new game modes.

## Features

- **Two interaction modes**
  - 🫧 **Point and Pop** — pop the floating bubble with the correct letter or word using your index finger.
  - 🚶 **Stay in Lane** — walk into the correct lane (left, middle, right) with your whole body and hold still, while dodging falling obstacles.
- **Two content types**
  - 📝 **Word Power** — spell words correctly, with optional pictures for each word (Easy: fill the missing letter, Hard: spell the whole word).
  - 📖 **Super Sentence** — fill in the blank in a full sentence, testing vocabulary in context rather than isolated words.
- **Fully offline word lists** — create, edit, and play your own word lists and sentences with no internet or Google Sheets required. Everything is saved locally in the browser.
- **Adjustable difficulty and settings** — Easy/Hard difficulty, bubble movement (floating or still), obstacle toggle for Stay in Lane, and a configurable countdown timer.
- **All audio synthesized live** — every sound effect and the background music are generated with the Web Audio API, no audio files needed.
- **Installable PWA** — install PopAR Kit 2.0 to your device's home screen and play offline like a native app.
- **Kid-friendly, accessible design** — bright, high-contrast, rounded UI with a soft dark theme, built to be easy to read and use for young learners.

## How to Play

1. Open the [live site](https://mrameow.github.io/PopAR_Kit_2.0/) and allow camera access.
2. Choose a game mode (**Point and Pop** or **Stay in Lane**) and a word list, Super Sentence list, or level.
3. Follow the 3-2-1 countdown, then use your hand or body movement to answer each question.
4. Correct and incorrect answers are shown instantly with color feedback and sound.

## Tech Stack

- Vanilla HTML, CSS, and JavaScript — no build step required.
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (`HandLandmarker` and `PoseLandmarker`), self-hosted for offline use with GPU acceleration and automatic CPU fallback.
- Web Audio API for all sound effects and background music (no audio assets).
- Service worker + Web App Manifest for offline play and installability.

## Running Locally

No build tools needed — just serve the folder with any static file server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser and allow camera access.
