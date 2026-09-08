import { HandLandmarker, PoseLandmarker, FilesetResolver, DrawingUtils } from './mediapipe/vision_bundle.mjs';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CONFIGURATION ---
    const GOOGLE_SHEET_ID = '1ZMEfBGZQHGf-UVvNJj8D7cOhQ3M2Z2cYNBrNMT4pnn0';
    const BASE_OPENSHEET_URL = `https://opensheet.elk.sh/${GOOGLE_SHEET_ID}/`;
    const AVAILABLE_LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "The Password"];
    const TEST_LEVEL_CONTENT_TYPES = {
        'WP (No Pic)': 'words',
        'WP (With Pic)': 'words',
        'SS (No Pic)': 'sentence',
        'SS (With Pic)': 'sentence',
    };
    const TEST_LEVEL_NAMES = Object.keys(TEST_LEVEL_CONTENT_TYPES);
    const CUSTOM_WORD_LISTS_KEY = 'popar_custom_word_lists';
    const SUPER_SENTENCE_LISTS_KEY = 'popar_super_sentence_lists';
    const CAMERA_FLIP_KEY = 'popar_camera_flipped';
    // MediaPipe's GPU (WebGL) delegate is unreliable on a lot of mobile GPU/driver
    // combinations — it can silently produce poor/erratic results instead of throwing,
    // so mobile devices skip it entirely and go straight to the CPU delegate.
    const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const WORD_POWER_DWELL_MS = 3000; // how long to hold a lane to confirm the answer
    const DEFAULT_COUNTDOWN_SECONDS = 60; // default quiz-timer countdown length
    const READY_COUNTDOWN_STEPS = [3, 2, 1];
    const READY_COUNTDOWN_STEP_MS = 700;
    const OBSTACLE_SPAWN_BASE_MS = 2600; // Stay in Lane: average time between falling rocks
    const OBSTACLE_SPAWN_JITTER_MS = 1200;
    const OBSTACLE_FALL_RATIO_PER_SEC = 0.22; // fraction of canvas height fallen per second
    const OBSTACLE_HIT_ZONE_RATIO = 0.8; // rock becomes "live" for hit-detection past this y fraction
    const WASM_PATH = './mediapipe/wasm';
    const HAND_MODEL_PATH = './models/hand_landmarker.task';
    const POSE_MODEL_PATH = './models/pose_landmarker_lite.task';

    // --- 2. UI ELEMENTS ---
    const ui = {
        videoElement: document.getElementById('video-input'),
        outputCanvas: document.getElementById('output-canvas'),
        ctx: document.getElementById('output-canvas').getContext('2d'),
        score: document.getElementById('score'),
        questionCounter: document.getElementById('question-counter'),
        timer: document.getElementById('timer'),
        timerContainer: document.querySelector('.timer-container'),
        cameraPermissionScreen: document.getElementById('camera-permission'),
        levelSelectionScreen: document.getElementById('level-selection-screen'),
        startScreen: document.getElementById('start-screen'),
        gameOverScreen: document.getElementById('game-over'),
        cameraBtn: document.getElementById('camera-btn'),
        startBtn: document.getElementById('start-btn'),
        restartBtn: document.getElementById('restart-btn'),
        sheetNameInput: document.getElementById('sheet-name-input'),
        goBtn: document.getElementById('go-btn'),
        levelSelect: document.getElementById('level-select'),
        playLevelBtn: document.getElementById('play-level-btn'),
        customLevelButtonsContainer: document.getElementById('custom-level-buttons-container'),
        myWordsBtn: document.getElementById('my-words-btn'),
        customWordsScreen: document.getElementById('custom-words-screen'),
        customListContainer: document.getElementById('custom-list-container'),
        customListNameInput: document.getElementById('custom-list-name'),
        customListWordsInput: document.getElementById('custom-list-words'),
        singleWordInput: document.getElementById('single-word-input'),
        singleWordImageInput: document.getElementById('single-word-image'),
        pendingImagePreview: document.getElementById('pending-image-preview'),
        pendingImageThumb: document.getElementById('pending-image-thumb'),
        removePendingImageBtn: document.getElementById('remove-pending-image-btn'),
        addWordBtn: document.getElementById('add-word-btn'),
        wordChipContainer: document.getElementById('word-chip-container'),
        bulkModeToggle: document.getElementById('bulk-mode-toggle'),
        wordEntrySingle: document.getElementById('word-entry-single'),
        saveCustomListBtn: document.getElementById('save-custom-list-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        backToLevelsBtn: document.getElementById('back-to-levels-btn'),
        easyModeBtn: document.getElementById('easy-mode-btn'),
        hardModeBtn: document.getElementById('hard-mode-btn'),
        difficultySettingsSection: document.getElementById('difficulty-settings-section'),
        bubbleMovementSettingsSection: document.getElementById('bubble-movement-settings-section'),
        bubblesRoamBtn: document.getElementById('bubbles-roam-btn'),
        bubblesStillBtn: document.getElementById('bubbles-still-btn'),
        obstacleSettingsSection: document.getElementById('obstacle-settings-section'),
        obstaclesOnBtn: document.getElementById('obstacles-on-btn'),
        obstaclesOffBtn: document.getElementById('obstacles-off-btn'),
        modePointAndPopBtn: document.getElementById('mode-point-and-pop-btn'),
        modeStayInLaneBtn: document.getElementById('mode-stay-in-lane-btn'),
        gameModeHint: document.getElementById('game-mode-hint'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        superSentenceButtonsContainer: document.getElementById('super-sentence-buttons-container'),
        mySentencesBtn: document.getElementById('my-sentences-btn'),
        superSentenceScreen: document.getElementById('super-sentence-screen'),
        superSentenceListContainer: document.getElementById('super-sentence-list-container'),
        superSentenceListNameInput: document.getElementById('super-sentence-list-name'),
        sentenceInput: document.getElementById('sentence-input'),
        sentenceWordPicker: document.getElementById('sentence-word-picker'),
        sentenceWordImageInput: document.getElementById('sentence-word-image'),
        sentencePendingImagePreview: document.getElementById('sentence-pending-image-preview'),
        sentencePendingImageThumb: document.getElementById('sentence-pending-image-thumb'),
        sentenceRemoveImageBtn: document.getElementById('sentence-remove-image-btn'),
        addSentenceBtn: document.getElementById('add-sentence-btn'),
        sentenceChipContainer: document.getElementById('sentence-chip-container'),
        saveSentenceListBtn: document.getElementById('save-sentence-list-btn'),
        cancelSentenceEditBtn: document.getElementById('cancel-sentence-edit-btn'),
        backToLevelsFromSentenceBtn: document.getElementById('back-to-levels-from-sentence-btn'),
        stopwatchBtn: document.getElementById('stopwatch-btn'),
        countdownBtn: document.getElementById('countdown-btn'),
        countdownDurationInput: document.getElementById('countdown-duration-input'),
        noTimerBtn: document.getElementById('no-timer-btn'),
        mainMenuBtn: document.getElementById('main-menu-btn'),
        bgmVolumeSlider: document.getElementById('bgm-volume'),
        sfxVolumeSlider: document.getElementById('sfx-volume'),
        flipCameraToggle: document.getElementById('flip-camera-toggle'),
        finalScore: document.getElementById('final-score'),
        handStatus: document.getElementById('hand-status'),
        handStatusLabel: document.getElementById('hand-status-label'),
        videoContainer: document.querySelector('.video-container'),
        wordContainer: document.getElementById('word-container'),
        imagePlaceholder: document.getElementById('image-placeholder'),
        wordImage: document.getElementById('word-image'),
        feedback: document.getElementById('feedback'),
        startScreenTitle: document.getElementById('start-screen-title'),
        startScreenDescription: document.getElementById('start-screen-description'),
        installButton: document.getElementById('install-button'),
        fullscreenBtn: document.getElementById('fullscreen-btn'),
        updateBtn: document.getElementById('update-btn'),
    };

    // --- 3. AUDIO ---
    // Every sound in the game — short effects AND the background music — is synthesized
    // live with the Web Audio API. No MP3 files at all.
    const audio = {
        buttonClick: 'click',
        popBubble: 'pop',
        correctAnswer: 'correct',
        wrongAnswer: 'wrong',
    };

    let audioCtx = null;
    let sfxMasterGain = null;
    let masterCompressor = null;

    const ensureAudioContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            // A gentle compressor lets individual sounds be mixed louder without
            // harsh clipping when a few of them overlap (e.g. correct-answer's notes).
            masterCompressor = audioCtx.createDynamicsCompressor();
            masterCompressor.threshold.value = -10;
            masterCompressor.knee.value = 12;
            masterCompressor.ratio.value = 6;
            masterCompressor.attack.value = 0.003;
            masterCompressor.release.value = 0.18;
            masterCompressor.connect(audioCtx.destination);

            sfxMasterGain = audioCtx.createGain();
            sfxMasterGain.gain.value = state.sfxVolume;
            sfxMasterGain.connect(masterCompressor);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    };

    const playTone = ({ freq, endFreq, type = 'sine', duration = 0.15, gain = 0.5, delay = 0, destination }) => {
        const ctx = ensureAudioContext();
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (endFreq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);
        }
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
        osc.connect(g);
        g.connect(destination || sfxMasterGain);
        osc.start(t0);
        osc.stop(t0 + duration + 0.03);
    };

    const playNoiseBurst = ({ duration = 0.12, gain = 0.4, filterFreq = 900, delay = 0 }) => {
        const ctx = ensureAudioContext();
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const g = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
        noise.connect(filter);
        filter.connect(g);
        g.connect(sfxMasterGain);
        noise.start(t0);
    };

    const playClickSound = () => {
        playTone({ freq: 760, endFreq: 500, type: 'triangle', duration: 0.07, gain: 0.5 });
    };

    const playPopSound = () => {
        playTone({ freq: 700, endFreq: 170, type: 'sine', duration: 0.13, gain: 0.6 });
        playNoiseBurst({ duration: 0.05, gain: 0.15, filterFreq: 1800 });
    };

    const playCorrectSound = () => {
        // A cheerful little ascending arpeggio: C5, E5, G5, C6.
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            playTone({ freq, type: 'triangle', duration: 0.18, gain: 0.45, delay: i * 0.08 });
        });
    };

    const playWrongSound = () => {
        playTone({ freq: 320, endFreq: 140, type: 'sawtooth', duration: 0.28, gain: 0.4 });
    };

    const playHitSound = () => {
        playNoiseBurst({ duration: 0.16, gain: 0.6, filterFreq: 700 });
        playTone({ freq: 220, endFreq: 70, type: 'sawtooth', duration: 0.2, gain: 0.55 });
    };

    const playCountdownBeepSound = () => {
        playTone({ freq: 440, type: 'sine', duration: 0.11, gain: 0.4 });
    };

    const playCountdownGoSound = () => {
        playTone({ freq: 660, endFreq: 990, type: 'triangle', duration: 0.24, gain: 0.55 });
    };

    const playGameOverSound = () => {
        // A little finishing flourish, longer and grander than the plain correct-answer chime.
        [523.25, 659.25, 783.99, 659.25, 1046.5].forEach((freq, i) => {
            playTone({ freq, type: 'triangle', duration: 0.22, gain: 0.4, delay: i * 0.11 });
        });
    };

    const playSaveSound = () => {
        playTone({ freq: 700, endFreq: 1000, type: 'sine', duration: 0.14, gain: 0.4 });
    };

    // --- 3b. Background music: a bouncy, procedurally-generated, seamlessly-looping tune ---
    const BGM_TEMPO_BPM = 132;
    const BGM_BEAT_SEC = 60 / BGM_TEMPO_BPM; // one quarter note
    const BGM_STEP_SEC = BGM_BEAT_SEC / 2; // one eighth note — the tune's smallest subdivision
    // A bright, playful I - V - vi - IV progression (C - G - Am - F), one bar each.
    const BGM_CHORDS = [
        { root: 130.81, third: 164.81, fifth: 196.00 }, // C major
        { root: 196.00, third: 246.94, fifth: 293.66 }, // G major
        { root: 110.00, third: 130.81, fifth: 164.81 }, // A minor
        { root: 174.61, third: 220.00, fifth: 261.63 }, // F major
    ];
    // A skippy little top-line, 8 eighth-notes per bar. `null` = a rest, which is what
    // gives the tune its bounce instead of playing dead straight.
    const BGM_ARP_PATTERN = ['root', null, 'fifth', 'third', 'root8', 'fifth', 'third', null];
    const BGM_SCHEDULE_AHEAD_SEC = 0.3;
    const BGM_LOOKAHEAD_MS = 60;

    let bgmGain = null;
    let bgmPlaying = false;
    let bgmSchedulerId = null;
    let bgmNextStepTime = 0;
    let bgmStepIndex = 0;

    const scheduleBgmBassNote = (freq, time, dur) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.11, time + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(time);
        osc.stop(time + dur + 0.05);
    };

    const scheduleBgmArpNote = (freq, time, dur) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.13, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(time);
        osc.stop(time + dur + 0.05);
    };

    const scheduleBgmHat = (time, accent) => {
        const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * 0.05));
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(accent ? 0.05 : 0.025, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        noise.connect(filter);
        filter.connect(g);
        g.connect(bgmGain);
        noise.start(time);
    };

    const bgmSchedulerTick = () => {
        if (!bgmPlaying) return;
        while (bgmNextStepTime < audioCtx.currentTime + BGM_SCHEDULE_AHEAD_SEC) {
            const barIndex = Math.floor(bgmStepIndex / 8) % BGM_CHORDS.length;
            const stepInBar = bgmStepIndex % 8;
            const chord = BGM_CHORDS[barIndex];

            // A bouncy bass pluck on the downbeat and the "and" of 2 (steps 0 and 4).
            if (stepInBar === 0 || stepInBar === 4) {
                scheduleBgmBassNote(chord.root, bgmNextStepTime, BGM_STEP_SEC * 1.3);
            }

            const arpNote = BGM_ARP_PATTERN[stepInBar];
            if (arpNote) {
                const octaveUp = arpNote === 'root8';
                const freq = chord[octaveUp ? 'root' : arpNote] * (octaveUp ? 4 : 2);
                scheduleBgmArpNote(freq, bgmNextStepTime, BGM_STEP_SEC * 0.9);
            }

            // A light shaker/hi-hat tick on every eighth note keeps the energy up,
            // with a slightly louder accent on the beat.
            scheduleBgmHat(bgmNextStepTime, stepInBar % 2 === 0);

            bgmNextStepTime += BGM_STEP_SEC;
            bgmStepIndex = (bgmStepIndex + 1) % (BGM_CHORDS.length * 8);
        }
    };

    const startBgm = () => {
        ensureAudioContext();
        if (bgmPlaying) return;
        if (!bgmGain) {
            bgmGain = audioCtx.createGain();
            bgmGain.gain.value = Number(ui.bgmVolumeSlider.value);
            bgmGain.connect(masterCompressor);
        }
        bgmPlaying = true;
        bgmStepIndex = 0;
        bgmNextStepTime = audioCtx.currentTime + 0.1;
        bgmSchedulerTick();
        bgmSchedulerId = setInterval(bgmSchedulerTick, BGM_LOOKAHEAD_MS);
    };

    const setBgmVolume = (volume) => {
        if (bgmGain) bgmGain.gain.value = Number(volume);
    };

    // --- 4. GAME STATE ---
    const state = {
        score: 0,
        currentQuestionIndex: 0,
        gameActive: false,
        letterBubbles: [],
        multiHandLandmarks: [],
        cameraInitialized: false,
        videoAspectRatio: 16 / 9,
        currentWord: "",
        correctAnswer: "",
        selectedQuestions: [],
        waitingForNextQuestion: false,
        selectedLevelName: '',
        timerMode: 'none', // 'none', 'stopwatch', 'countdown'
        timerValue: 0,
        timerInterval: null,
        deferredInstallPrompt: null,
        isInstallable: false,
        pendingWords: [],
        pendingImageDataUrl: null,
        editingListName: null,
        editingPendingWordIndex: -1,
        difficulty: 'easy', // 'easy' or 'hard'
        gameMode: 'pointAndPop', // 'pointAndPop' or 'stayInLane'
        wordZones: [],
        activeZoneIndex: -1,
        lastFrameTime: 0,
        poseLandmarks: null,
        selectedContentType: 'words', // 'words' or 'sentence'
        inputLocked: false,
        countdownInterval: null,
        pendingSentences: [],
        pendingSentenceImageDataUrl: null,
        pendingSentenceSelectedIndex: -1,
        editingSentenceListName: null,
        editingPendingSentenceIndex: -1,
        bubblesRoam: true, // Point and Pop: whether bubbles drift around the screen
        countdownDurationSeconds: DEFAULT_COUNTDOWN_SECONDS,
        obstacles: [], // Stay in Lane: falling rocks the player must dodge
        obstacleSpawnTimer: 0,
        obstaclesEnabled: true, // Stay in Lane: whether falling rocks are on
        sfxVolume: 1, // matches the sfx-volume slider's default
        cameraFlipped: false,
    };

    const GAME_MODE_HINTS = {
        pointAndPop: 'Pop the bubble with the missing letter!',
        stayInLane: 'Move into the lane with the correct word and hold still!',
    };

    let handLandmarker = null;
    let poseLandmarker = null;
    let drawingUtils = null;

    const createLandmarker = async (Klass, vision, modelAssetPath, extraOptions, forceCpu = false) => {
        if (!forceCpu) {
            try {
                return await Klass.createFromOptions(vision, {
                    baseOptions: { modelAssetPath, delegate: 'GPU' },
                    ...extraOptions,
                });
            } catch (gpuError) {
                console.warn(`GPU delegate failed for ${modelAssetPath}, falling back to CPU.`, gpuError);
            }
        }
        return await Klass.createFromOptions(vision, {
            baseOptions: { modelAssetPath, delegate: 'CPU' },
            ...extraOptions,
        });
    };

    const HAND_LANDMARKER_OPTIONS = {
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
    };
    const POSE_LANDMARKER_OPTIONS = {
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
    };

    let visionFileset = null;

    const initLandmarkers = async (forceCpu = false) => {
        visionFileset = visionFileset || await FilesetResolver.forVisionTasks(WASM_PATH);

        handLandmarker = await createLandmarker(HandLandmarker, visionFileset, HAND_MODEL_PATH, HAND_LANDMARKER_OPTIONS, forceCpu);
        poseLandmarker = await createLandmarker(PoseLandmarker, visionFileset, POSE_MODEL_PATH, POSE_LANDMARKER_OPTIONS, forceCpu);

        drawingUtils = new DrawingUtils(ui.ctx);
    };

    // If the GPU delegate keeps throwing mid-stream (common on some mobile GPU drivers,
    // even when landmarker creation itself succeeded), rebuild both landmarkers on CPU.
    let detectionErrorCount = 0;
    let fallingBackToCpu = false;
    const handleDetectionError = async (err) => {
        console.warn('Landmarker detection error:', err);
        detectionErrorCount++;
        if (detectionErrorCount >= 5 && !fallingBackToCpu) {
            fallingBackToCpu = true;
            console.warn('Repeated detection errors — rebuilding hand/pose landmarkers on CPU.');
            try {
                await initLandmarkers(true);
            } catch (rebuildError) {
                console.error('Could not rebuild landmarkers on CPU:', rebuildError);
            }
            detectionErrorCount = 0;
            fallingBackToCpu = false;
        }
    };

    // --- 5. CORE FUNCTIONS ---

    // --- 5a. UI & Drawing Functions ---
    const showScreen = (screen) => {
        [ui.cameraPermissionScreen, ui.levelSelectionScreen, ui.startScreen, ui.gameOverScreen, ui.customWordsScreen, ui.superSentenceScreen].forEach(s => s.style.display = 'none');
        
        ui.installButton.hidden = true;

        if (screen) {
            screen.style.display = 'flex';
            if (screen === ui.levelSelectionScreen && state.isInstallable) {
                ui.installButton.hidden = false;
            }
        }
    };

    const updateCanvasSize = () => {
        const { clientWidth: containerWidth, clientHeight: containerHeight } = ui.videoContainer;
        let canvasWidth, canvasHeight;

        if (containerWidth / containerHeight > state.videoAspectRatio) {
            canvasHeight = containerHeight;
            canvasWidth = containerHeight * state.videoAspectRatio;
        } else {
            canvasWidth = containerWidth;
            canvasHeight = containerWidth / state.videoAspectRatio;
        }

        ui.outputCanvas.width = canvasWidth;
        ui.outputCanvas.height = canvasHeight;
        ui.outputCanvas.style.left = `${(containerWidth - canvasWidth) / 2}px`;
        ui.outputCanvas.style.top = `${(containerHeight - canvasHeight) / 2}px`;
        ui.videoElement.style.width = `${canvasWidth}px`;
        ui.videoElement.style.height = `${canvasHeight}px`;
    };

    const displayWord = (word, missingIndex) => {
        ui.wordContainer.innerHTML = word.split('').map((letter, i) =>
            `<div class="letter-box ${i === missingIndex ? 'missing' : ''}">${i === missingIndex ? '?' : letter}</div>`
        ).join('');
    };

    const displaySpellingWord = (word, revealIndex) => {
        ui.wordContainer.innerHTML = word.split('').map((letter, i) => {
            if (i < revealIndex) return `<div class="letter-box">${letter}</div>`;
            if (i === revealIndex) return `<div class="letter-box missing">?</div>`;
            return `<div class="letter-box pending"></div>`;
        }).join('');
    };

    const displayWordPowerBlank = (question) => {
        const { word, picture } = question;
        // With a picture, the whole word stays hidden — the picture is the only clue.
        // Without a picture, reveal the first letter so the guess is fair among 3 word options.
        ui.wordContainer.innerHTML = word.split('').map((letter, i) => {
            if (!picture && i === 0) return `<div class="letter-box">${letter}</div>`;
            return `<div class="letter-box pending"></div>`;
        }).join('');
    };

    const displaySentenceBlank = (tokens, blankIndex, revealWord) => {
        ui.wordContainer.innerHTML = tokens.map((token, i) => {
            if (i === blankIndex) {
                return revealWord
                    ? `<span class="sentence-word sentence-word-revealed">${revealWord}</span>`
                    : `<span class="sentence-blank">?</span>`;
            }
            return `<span class="sentence-word">${token}</span>`;
        }).join(' ');
    };

    const fitFontSize = (ctx, text, maxWidth, maxFontSize) => {
        let fontSize = maxFontSize;
        ctx.font = `700 ${fontSize}px 'Baloo 2', Arial`;
        while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
            fontSize -= 2;
            ctx.font = `700 ${fontSize}px 'Baloo 2', Arial`;
        }
        return fontSize;
    };

    // Bubbles hold either a single letter or a whole word (Super Sentence), sized to fit either.
    const createBubbles = (options) => {
        const { width: canvasWidth, height: canvasHeight } = ui.outputCanvas;
        const baseRadius = Math.min(canvasWidth, canvasHeight) * 0.05;

        ui.ctx.font = `700 ${baseRadius * 0.7}px 'Baloo 2', Arial`;
        const radii = options.map(label => {
            if (label.length <= 1) return baseRadius;
            const textWidth = ui.ctx.measureText(label).width;
            return Math.max(baseRadius, textWidth / 2 + 18);
        });

        const positions = shuffleArray([
            { x: canvasWidth * 0.25, y: canvasHeight * 0.3 },
            { x: canvasWidth * 0.5, y: canvasHeight * 0.3 },
            { x: canvasWidth * 0.75, y: canvasHeight * 0.3 },
        ]);

        state.letterBubbles = options.map((label, i) => ({
            baseX: positions[i].x,
            baseY: positions[i].y,
            x: positions[i].x,
            y: positions[i].y,
            radius: radii[i],
            phase: Math.random() * Math.PI * 2,
            roamRadius: Math.min(canvasWidth, canvasHeight) * (0.14 + Math.random() * 0.06),
            roamSpeed: 0.75 + Math.random() * 0.5,
            label,
            isCorrect: label === state.correctAnswer,
            createdAt: Date.now(),
            popped: false,
        }));
    };

    // Shared by drawing and collision detection so a bubble is always popped exactly
    // where it visually is, even while it's roaming around.
    const getBubblePosition = (bubble) => {
        const age = Date.now() - bubble.createdAt;
        let x = bubble.baseX;
        let y = bubble.baseY + Math.sin(age / 900 + bubble.phase) * 6;

        if (state.bubblesRoam) {
            const t = (age / 1000) * bubble.roamSpeed;
            x += Math.sin(t + bubble.phase) * bubble.roamRadius;
            y += Math.sin(t * 1.3 + bubble.phase * 1.7) * bubble.roamRadius * 0.6;
        }

        const pad = bubble.radius + 12;
        x = Math.min(Math.max(x, pad), ui.outputCanvas.width - pad);
        y = Math.min(Math.max(y, pad), ui.outputCanvas.height - pad);
        return { x, y };
    };

    const drawLetterBubbles = () => {
        state.letterBubbles.forEach(bubble => {
            if (bubble.popped) return;
            const { ctx } = ui;
            const age = Date.now() - bubble.createdAt;
            const pulseScale = 1 + 0.06 * Math.sin(age / 300 + bubble.phase);
            const { x, y } = getBubblePosition(bubble);
            bubble.x = x;
            bubble.y = y;

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, bubble.radius * pulseScale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = '#3DB8E8';
            ctx.lineWidth = 3;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#26333B';
            const maxTextWidth = bubble.radius * 1.6;
            const fontSize = fitFontSize(ctx, bubble.label, maxTextWidth, bubble.radius * 0.8);
            ctx.font = `700 ${fontSize}px 'Baloo 2', Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.scale(-1, 1);
            ctx.fillText(bubble.label, -x, y);
            ctx.restore();
        });
    };

    const drawWordZones = () => {
        if (!state.wordZones || state.wordZones.length === 0) return;
        const { ctx, outputCanvas } = ui;
        const zoneCount = state.wordZones.length;
        const zoneWidth = outputCanvas.width / zoneCount;

        state.wordZones.forEach((zone, i) => {
            const x = i * zoneWidth;
            const isActive = i === state.activeZoneIndex;
            const progress = isActive ? Math.min(zone.dwellProgress / WORD_POWER_DWELL_MS, 1) : 0;

            ctx.save();
            ctx.fillStyle = isActive ? 'rgba(61, 184, 232, 0.4)' : 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(x, 0, zoneWidth, outputCanvas.height);

            if (i > 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, outputCanvas.height);
                ctx.stroke();
            }

            if (progress > 0) {
                const barHeight = 14;
                ctx.fillStyle = '#3DDC97';
                ctx.fillRect(x + 8, outputCanvas.height - barHeight - 8, (zoneWidth - 16) * progress, barHeight);
            }

            const centerX = x + zoneWidth / 2;
            const centerY = outputCanvas.height / 2;
            const maxTextWidth = zoneWidth - 24;
            const fontSize = fitFontSize(ctx, zone.word, maxTextWidth, Math.min(zoneWidth * 0.16, 32));

            ctx.fillStyle = '#fff';
            ctx.font = `700 ${fontSize}px 'Baloo 2', Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Counter-flip so the word reads correctly under the mirrored canvas
            ctx.scale(-1, 1);
            ctx.fillText(zone.word, -centerX, centerY);
            ctx.restore();
        });

        // A dashed "danger line" so players can see where a falling rock will hit them.
        if (state.obstacles.length > 0) {
            const dangerY = outputCanvas.height * OBSTACLE_HIT_ZONE_RATIO;
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 122, 104, 0.7)';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 8]);
            ctx.beginPath();
            ctx.moveTo(0, dangerY);
            ctx.lineTo(outputCanvas.width, dangerY);
            ctx.stroke();
            ctx.restore();
        }
    };

    // --- 5g-i. Stay in Lane obstacles (falling rocks to dodge) ---
    const updateObstacles = (dt) => {
        if (!state.wordZones || state.wordZones.length === 0) return;
        if (!state.obstaclesEnabled) return;
        const { outputCanvas } = ui;

        state.obstacleSpawnTimer += dt;
        const spawnEvery = OBSTACLE_SPAWN_BASE_MS + (Math.random() - 0.5) * 2 * OBSTACLE_SPAWN_JITTER_MS;
        if (state.obstacleSpawnTimer >= spawnEvery) {
            state.obstacleSpawnTimer = 0;
            const padding = 40;
            state.obstacles.push({
                // A free x position anywhere across the screen — not locked to a lane center —
                // so rocks don't just predictably sit in the middle of each lane.
                x: padding + Math.random() * (outputCanvas.width - padding * 2),
                y: -40,
            });
        }

        const zoneWidth = outputCanvas.width / state.wordZones.length;
        const hitZoneY = outputCanvas.height * OBSTACLE_HIT_ZONE_RATIO;
        let wasHit = false;

        state.obstacles = state.obstacles.filter(rock => {
            rock.y += outputCanvas.height * OBSTACLE_FALL_RATIO_PER_SEC * (dt / 1000);
            if (rock.y > outputCanvas.height + 40) return false; // fell past the bottom

            if (rock.y >= hitZoneY) {
                const rockLane = Math.min(state.wordZones.length - 1, Math.floor(rock.x / zoneWidth));
                if (rockLane === state.activeZoneIndex) {
                    wasHit = true;
                    return false; // consumed by the hit
                }
            }
            return true;
        });

        if (wasHit) handleObstacleHit();
    };

    const handleObstacleHit = () => {
        playHitSound();
        resetWordZoneDwell();
        showFeedback('💥 Watch out!', 'hit');
        ui.videoContainer.classList.remove('hit-shake');
        void ui.videoContainer.offsetWidth;
        ui.videoContainer.classList.add('hit-shake');
        setTimeout(() => ui.videoContainer.classList.remove('hit-shake'), 500);
    };

    const drawObstacles = () => {
        if (!state.obstacles || state.obstacles.length === 0) return;
        const { ctx } = ui;

        state.obstacles.forEach(rock => {
            ctx.save();
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.scale(-1, 1);
            ctx.fillText('🪨', -rock.x, rock.y);
            ctx.restore();
        });
    };

    const showFeedback = (message, variant) => {
        // variant is 'hit' for an obstacle bump, or true/false for a correct/incorrect answer.
        const variantClass = variant === true ? 'correct' : variant === false ? 'incorrect' : variant;
        ui.feedback.textContent = message;
        ui.feedback.className = `feedback ${variantClass}`;
        ui.feedback.style.opacity = 1;
        setTimeout(() => { ui.feedback.style.opacity = 0; }, 1500);

        if (variantClass === 'hit') return; // obstacle hits don't touch the word card

        // A little tactile feedback on the word card: sparkle-pop for correct, shake for wrong.
        const animClass = variantClass === 'correct' ? 'sparkle' : 'shake';
        ui.wordContainer.classList.remove('sparkle', 'shake');
        void ui.wordContainer.offsetWidth; // restart the animation even if the same class is reused
        ui.wordContainer.classList.add(animClass);
        setTimeout(() => ui.wordContainer.classList.remove(animClass), 600);
    };

    // --- 5b. Audio Functions ---
    const playSound = (sound) => {
        if (!sound) return;

        // A synthesized sound effect, keyed by a short string.
        switch (sound) {
            case 'click': playClickSound(); break;
            case 'pop': playPopSound(); break;
            case 'correct': playCorrectSound(); break;
            case 'wrong': playWrongSound(); break;
            case 'hit': playHitSound(); break;
        }
    };

    const initializeAudio = () => {
        ensureAudioContext(); // warm up the audio context on this user gesture
        startBgm();
    };

    const setSfxVolume = (volume) => {
        state.sfxVolume = Number(volume);
        if (sfxMasterGain) {
            sfxMasterGain.gain.value = state.sfxVolume;
        }
    };

    // Some external cameras (e.g. built into a smartboard) show a mirrored feed
    // relative to a normal laptop webcam — this lets the user cancel that mirroring.
    const setCameraFlipped = (flipped) => {
        state.cameraFlipped = flipped;
        ui.videoContainer.classList.toggle('camera-flipped', flipped);
        ui.flipCameraToggle.checked = flipped;
        try {
            localStorage.setItem(CAMERA_FLIP_KEY, flipped ? 'true' : 'false');
        } catch (e) {
            console.warn('Could not save camera flip preference:', e);
        }
    };

    // --- 5c. API & Data Handling ---
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    // --- 5c-i. Custom (offline) Word Lists ---
    const getCustomWordLists = () => {
        try {
            return JSON.parse(localStorage.getItem(CUSTOM_WORD_LISTS_KEY)) || {};
        } catch (e) {
            console.warn('Could not read custom word lists from localStorage:', e);
            return {};
        }
    };

    const saveCustomWordLists = (lists) => {
        try {
            localStorage.setItem(CUSTOM_WORD_LISTS_KEY, JSON.stringify(lists));
            return true;
        } catch (e) {
            console.warn('Could not save custom word lists to localStorage:', e);
            return false;
        }
    };

    // --- 5c-ii. Super Sentence Lists ---
    const getSuperSentenceLists = () => {
        try {
            return JSON.parse(localStorage.getItem(SUPER_SENTENCE_LISTS_KEY)) || {};
        } catch (e) {
            console.warn('Could not read Super Sentence lists from localStorage:', e);
            return {};
        }
    };

    const saveSuperSentenceLists = (lists) => {
        try {
            localStorage.setItem(SUPER_SENTENCE_LISTS_KEY, JSON.stringify(lists));
            return true;
        } catch (e) {
            console.warn('Could not save Super Sentence lists to localStorage:', e);
            return false;
        }
    };

    // --- 5c-iv. Built-in test levels (Word Power + Super Sentence, with/without pictures) ---
    const testLevelIcon = (emoji, bg) => 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="${bg}"/><text x="50" y="64" font-size="52" text-anchor="middle">${emoji}</text></svg>`
    );

    const seedTestLevels = () => {
        const wordLists = getCustomWordLists();
        let wordListsChanged = false;

        // Clean up the old, longer test-level names from an earlier version.
        ['Word Power Test (No Picture)', 'Word Power Test (With Picture)'].forEach(oldName => {
            if (wordLists[oldName]) {
                delete wordLists[oldName];
                wordListsChanged = true;
            }
        });

        if (!wordLists['WP (No Pic)']) {
            wordLists['WP (No Pic)'] = [
                { Word: 'cat' }, { Word: 'sun' }, { Word: 'ball' }, { Word: 'book' }, { Word: 'star' },
            ];
            wordListsChanged = true;
        }

        if (!wordLists['WP (With Pic)']) {
            wordLists['WP (With Pic)'] = [
                { Word: 'cat', Picture: testLevelIcon('🐱', '#DEFBEF') },
                { Word: 'sun', Picture: testLevelIcon('☀️', '#FFF3D6') },
                { Word: 'ball', Picture: testLevelIcon('⚽', '#DFF4FC') },
                { Word: 'book', Picture: testLevelIcon('📖', '#FFE7E3') },
                { Word: 'star', Picture: testLevelIcon('⭐', '#DEFBEF') },
            ];
            wordListsChanged = true;
        }

        if (wordListsChanged) saveCustomWordLists(wordLists);

        const buildSentence = (sentence, blankWord, picture) => {
            const tokens = sentence.trim().split(/\s+/);
            const blankIndex = tokens.findIndex(t => t.replace(/[.,!?]/g, '').toLowerCase() === blankWord.toLowerCase());
            return picture ? { Sentence: sentence, BlankIndex: blankIndex, Picture: picture } : { Sentence: sentence, BlankIndex: blankIndex };
        };

        const sentenceLists = getSuperSentenceLists();
        let sentenceListsChanged = false;

        // Clean up the old, longer test-level names from an earlier version.
        ['Super Sentence Test (No Picture)', 'Super Sentence Test (With Picture)'].forEach(oldName => {
            if (sentenceLists[oldName]) {
                delete sentenceLists[oldName];
                sentenceListsChanged = true;
            }
        });

        if (!sentenceLists['SS (No Pic)']) {
            sentenceLists['SS (No Pic)'] = [
                buildSentence('The cat is sleeping on the mat.', 'cat'),
                buildSentence('I like to eat an apple.', 'apple'),
                buildSentence('She is riding a bike.', 'bike'),
                buildSentence('He is kicking the ball.', 'ball'),
                buildSentence('The sun is shining brightly.', 'sun'),
            ];
            sentenceListsChanged = true;
        }

        if (!sentenceLists['SS (With Pic)']) {
            sentenceLists['SS (With Pic)'] = [
                buildSentence('The cat is sleeping on the mat.', 'cat', testLevelIcon('🐱', '#DEFBEF')),
                buildSentence('I like to eat an apple.', 'apple', testLevelIcon('🍎', '#FFE7E3')),
                buildSentence('She is riding a bike.', 'bike', testLevelIcon('🚲', '#DFF4FC')),
                buildSentence('He is kicking the ball.', 'ball', testLevelIcon('⚽', '#DFF4FC')),
                buildSentence('The sun is shining brightly.', 'sun', testLevelIcon('☀️', '#FFF3D6')),
            ];
            sentenceListsChanged = true;
        }

        if (sentenceListsChanged) saveSuperSentenceLists(sentenceLists);
    };

    const resizeImageToDataUrl = (file, maxDim = 320, quality = 0.75) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > height && width > maxDim) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    } else if (height > maxDim) {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    // Lets users paste a copied picture (e.g. Ctrl+V from a screenshot) straight into
    // a word/sentence text field instead of having to save it as a file first.
    const extractImageFileFromClipboard = (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return null;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                return item.getAsFile();
            }
        }
        return null;
    };

    const parseWordsInput = (text) => {
        return text
            .split(/[\n,]/)
            .map(w => w.trim())
            .filter(w => w.length > 1)
            .map(w => ({ Word: w }));
    };

    const renderCustomListManager = () => {
        const lists = getCustomWordLists();
        const names = Object.keys(lists).filter(name => !TEST_LEVEL_NAMES.includes(name));
        ui.customListContainer.innerHTML = '';

        if (names.length === 0) {
            ui.customListContainer.innerHTML = '<p style="opacity: 0.8;">No word lists yet. Add one below!</p>';
            return;
        }

        names.forEach(name => {
            const item = document.createElement('div');
            item.className = 'custom-list-item' + (name === state.editingListName ? ' editing' : '');
            item.innerHTML = `<span>${name} (${lists[name].length} words)</span>`;

            const editBtn = document.createElement('button');
            editBtn.className = 'edit-list-btn';
            editBtn.textContent = '✏️';
            editBtn.setAttribute('aria-label', `Edit ${name}`);
            editBtn.onclick = () => { playSound(audio.buttonClick); handleEditList(name); };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-list-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.setAttribute('aria-label', `Delete ${name}`);
            deleteBtn.onclick = () => {
                playSound(audio.buttonClick);
                const currentLists = getCustomWordLists();
                delete currentLists[name];
                saveCustomWordLists(currentLists);
                if (state.editingListName === name) handleCancelEdit();
                renderCustomListManager();
            };

            item.appendChild(editBtn);
            item.appendChild(deleteBtn);
            ui.customListContainer.appendChild(item);
        });
    };

    const renderWordChips = () => {
        ui.wordChipContainer.innerHTML = '';
        state.pendingWords.forEach((entry, index) => {
            const chip = document.createElement('div');
            chip.className = 'word-chip' + (index === state.editingPendingWordIndex ? ' editing' : '');
            const thumbHtml = entry.picture ? `<img class="word-chip-thumb" src="${entry.picture}" alt="">` : '';
            chip.innerHTML = `${thumbHtml}<span class="chip-label">${entry.word}</span>`;
            chip.querySelector('.chip-label').onclick = () => handleEditPendingWord(index);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-word-btn';
            removeBtn.textContent = '✕';
            removeBtn.setAttribute('aria-label', `Remove ${entry.word}`);
            removeBtn.onclick = () => {
                state.pendingWords.splice(index, 1);
                if (state.editingPendingWordIndex === index) {
                    state.editingPendingWordIndex = -1;
                    ui.singleWordInput.value = '';
                    clearPendingImage();
                    ui.addWordBtn.textContent = 'Add';
                }
                renderWordChips();
            };

            chip.appendChild(removeBtn);
            ui.wordChipContainer.appendChild(chip);
        });
    };

    // Tapping a pending word chip loads it into the form for editing, WITHOUT removing it
    // from the list yet — so switching to edit a different word never loses it.
    const handleEditPendingWord = (index) => {
        const entry = state.pendingWords[index];
        if (!entry) return;
        state.editingPendingWordIndex = index;

        ui.bulkModeToggle.checked = false;
        setBulkMode(false);
        ui.singleWordInput.value = entry.word;
        if (entry.picture) {
            state.pendingImageDataUrl = entry.picture;
            ui.pendingImageThumb.src = entry.picture;
            ui.pendingImagePreview.style.display = 'flex';
        } else {
            clearPendingImage();
        }

        ui.addWordBtn.textContent = 'Update';
        renderWordChips();
        ui.singleWordInput.focus();
    };

    const clearPendingImage = () => {
        state.pendingImageDataUrl = null;
        ui.singleWordImageInput.value = '';
        ui.pendingImagePreview.style.display = 'none';
    };

    const handleAddWord = () => {
        const word = ui.singleWordInput.value.trim();
        if (word.length > 1) {
            if (state.editingPendingWordIndex >= 0) {
                state.pendingWords[state.editingPendingWordIndex] = { word, picture: state.pendingImageDataUrl };
                state.editingPendingWordIndex = -1;
                ui.addWordBtn.textContent = 'Add';
            } else {
                state.pendingWords.push({ word, picture: state.pendingImageDataUrl });
            }
            renderWordChips();
        }
        ui.singleWordInput.value = '';
        clearPendingImage();
        ui.singleWordInput.focus();
    };

    const setBulkMode = (isBulk) => {
        ui.wordEntrySingle.style.display = isBulk ? 'none' : 'block';
        ui.customListWordsInput.style.display = isBulk ? 'block' : 'none';
    };

    const resetCustomWordForm = () => {
        state.editingListName = null;
        state.editingPendingWordIndex = -1;
        ui.customListNameInput.value = '';
        ui.customListWordsInput.value = '';
        ui.singleWordInput.value = '';
        ui.addWordBtn.textContent = 'Add';
        state.pendingWords = [];
        clearPendingImage();
        renderWordChips();
        ui.bulkModeToggle.checked = false;
        setBulkMode(false);
        ui.saveCustomListBtn.textContent = 'Save List';
        ui.cancelEditBtn.hidden = true;
    };

    const showCustomWordsScreen = () => {
        resetCustomWordForm();
        renderCustomListManager();
        showScreen(ui.customWordsScreen);
    };

    const handleEditList = (name) => {
        const lists = getCustomWordLists();
        const words = lists[name];
        if (!words) return;

        state.editingListName = name;
        state.editingPendingWordIndex = -1;
        state.pendingWords = words.map(w => ({ word: w.Word, picture: w.Picture || null }));
        clearPendingImage();
        ui.customListNameInput.value = name;
        ui.singleWordInput.value = '';
        ui.addWordBtn.textContent = 'Add';
        ui.bulkModeToggle.checked = false;
        setBulkMode(false);
        ui.customListWordsInput.value = '';
        renderWordChips();
        renderCustomListManager();
        ui.saveCustomListBtn.textContent = 'Update List';
        ui.cancelEditBtn.hidden = false;
        ui.customListNameInput.focus();
    };

    const handleCancelEdit = () => {
        resetCustomWordForm();
        renderCustomListManager();
    };

    const handleSaveCustomList = () => {
        playSound(audio.buttonClick);
        const name = ui.customListNameInput.value.trim();
        const words = ui.bulkModeToggle.checked
            ? parseWordsInput(ui.customListWordsInput.value)
            : state.pendingWords.map(w => w.picture ? { Word: w.word, Picture: w.picture } : { Word: w.word });

        if (!name) {
            alert('Please enter a name for your word list.');
            return;
        }
        if (words.length === 0) {
            alert('Please add at least one word (3+ letters).');
            return;
        }

        const lists = getCustomWordLists();
        if (state.editingListName && state.editingListName !== name) {
            delete lists[state.editingListName];
        }
        lists[name] = words;
        const saved = saveCustomWordLists(lists);
        if (!saved) {
            alert('Could not save this word list — storage might be full. Try smaller/fewer pictures, or fewer words.');
            return;
        }

        playSaveSound();
        resetCustomWordForm();
        renderCustomListManager();
    };

    // --- 5c-iii. Super Sentence Builder ---
    const tokenizeSentence = (sentence) => sentence.trim().split(/\s+/).filter(Boolean);

    const renderSentenceWordPicker = () => {
        const tokens = tokenizeSentence(ui.sentenceInput.value);
        ui.sentenceWordPicker.innerHTML = '';
        tokens.forEach((token, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sentence-word-option' + (i === state.pendingSentenceSelectedIndex ? ' selected' : '');
            btn.textContent = token;
            btn.onclick = () => {
                state.pendingSentenceSelectedIndex = state.pendingSentenceSelectedIndex === i ? -1 : i;
                renderSentenceWordPicker();
            };
            ui.sentenceWordPicker.appendChild(btn);
        });
    };

    const clearPendingSentenceImage = () => {
        state.pendingSentenceImageDataUrl = null;
        ui.sentenceWordImageInput.value = '';
        ui.sentencePendingImagePreview.style.display = 'none';
    };

    const renderSentenceChips = () => {
        ui.sentenceChipContainer.innerHTML = '';
        state.pendingSentences.forEach((entry, index) => {
            const tokens = tokenizeSentence(entry.sentence);
            const preview = tokens.map((t, i) => i === entry.blankIndex ? `[${t}]` : t).join(' ');

            const chip = document.createElement('div');
            chip.className = 'word-chip sentence-chip' + (index === state.editingPendingSentenceIndex ? ' editing' : '');
            const thumbHtml = entry.picture ? `<img class="word-chip-thumb" src="${entry.picture}" alt="">` : '';
            chip.innerHTML = `${thumbHtml}<span class="chip-label" title="${preview}">${preview}</span>`;
            chip.querySelector('.chip-label').onclick = () => handleEditPendingSentence(index);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-word-btn';
            removeBtn.textContent = '✕';
            removeBtn.setAttribute('aria-label', 'Remove sentence');
            removeBtn.onclick = () => {
                state.pendingSentences.splice(index, 1);
                if (state.editingPendingSentenceIndex === index) {
                    state.editingPendingSentenceIndex = -1;
                    ui.sentenceInput.value = '';
                    state.pendingSentenceSelectedIndex = -1;
                    renderSentenceWordPicker();
                    clearPendingSentenceImage();
                    ui.addSentenceBtn.textContent = 'Add Sentence';
                }
                renderSentenceChips();
            };

            chip.appendChild(removeBtn);
            ui.sentenceChipContainer.appendChild(chip);
        });
    };

    // Tapping a pending sentence chip loads it into the form for editing, WITHOUT removing
    // it from the list yet — so switching to edit a different sentence never loses it.
    const handleEditPendingSentence = (index) => {
        const entry = state.pendingSentences[index];
        if (!entry) return;
        state.editingPendingSentenceIndex = index;

        ui.sentenceInput.value = entry.sentence;
        state.pendingSentenceSelectedIndex = entry.blankIndex;
        renderSentenceWordPicker();

        if (entry.picture) {
            state.pendingSentenceImageDataUrl = entry.picture;
            ui.sentencePendingImageThumb.src = entry.picture;
            ui.sentencePendingImagePreview.style.display = 'flex';
        } else {
            clearPendingSentenceImage();
        }

        ui.addSentenceBtn.textContent = 'Update Sentence';
        renderSentenceChips();
        ui.sentenceInput.focus();
    };

    const handleAddSentence = () => {
        const sentence = ui.sentenceInput.value.trim();
        const tokens = tokenizeSentence(sentence);
        const blankIndex = state.pendingSentenceSelectedIndex;

        if (tokens.length < 2) {
            alert('Please type a full sentence with at least 2 words.');
            return;
        }
        if (blankIndex < 0 || blankIndex >= tokens.length) {
            alert('Please tap the word in the sentence you want to test.');
            return;
        }

        const newEntry = { sentence, blankIndex, picture: state.pendingSentenceImageDataUrl };
        if (state.editingPendingSentenceIndex >= 0) {
            state.pendingSentences[state.editingPendingSentenceIndex] = newEntry;
            state.editingPendingSentenceIndex = -1;
            ui.addSentenceBtn.textContent = 'Add Sentence';
        } else {
            state.pendingSentences.push(newEntry);
        }
        renderSentenceChips();

        ui.sentenceInput.value = '';
        state.pendingSentenceSelectedIndex = -1;
        renderSentenceWordPicker();
        clearPendingSentenceImage();
        ui.sentenceInput.focus();
    };

    const resetSentenceForm = () => {
        state.editingSentenceListName = null;
        state.editingPendingSentenceIndex = -1;
        ui.superSentenceListNameInput.value = '';
        ui.sentenceInput.value = '';
        ui.addSentenceBtn.textContent = 'Add Sentence';
        state.pendingSentences = [];
        state.pendingSentenceSelectedIndex = -1;
        clearPendingSentenceImage();
        renderSentenceWordPicker();
        renderSentenceChips();
        ui.saveSentenceListBtn.textContent = 'Save List';
        ui.cancelSentenceEditBtn.hidden = true;
    };

    const renderSuperSentenceListManager = () => {
        const lists = getSuperSentenceLists();
        const names = Object.keys(lists).filter(name => !TEST_LEVEL_NAMES.includes(name));
        ui.superSentenceListContainer.innerHTML = '';

        if (names.length === 0) {
            ui.superSentenceListContainer.innerHTML = '<p style="opacity: 0.8;">No sentence lists yet. Add one below!</p>';
            return;
        }

        names.forEach(name => {
            const item = document.createElement('div');
            item.className = 'custom-list-item' + (name === state.editingSentenceListName ? ' editing' : '');
            item.innerHTML = `<span>${name} (${lists[name].length} sentences)</span>`;

            const editBtn = document.createElement('button');
            editBtn.className = 'edit-list-btn';
            editBtn.textContent = '✏️';
            editBtn.setAttribute('aria-label', `Edit ${name}`);
            editBtn.onclick = () => { playSound(audio.buttonClick); handleEditSentenceList(name); };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-list-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.setAttribute('aria-label', `Delete ${name}`);
            deleteBtn.onclick = () => {
                playSound(audio.buttonClick);
                const currentLists = getSuperSentenceLists();
                delete currentLists[name];
                saveSuperSentenceLists(currentLists);
                if (state.editingSentenceListName === name) handleCancelSentenceEdit();
                renderSuperSentenceListManager();
            };

            item.appendChild(editBtn);
            item.appendChild(deleteBtn);
            ui.superSentenceListContainer.appendChild(item);
        });
    };

    const showSuperSentenceScreen = () => {
        resetSentenceForm();
        renderSuperSentenceListManager();
        showScreen(ui.superSentenceScreen);
    };

    const handleEditSentenceList = (name) => {
        const lists = getSuperSentenceLists();
        const entries = lists[name];
        if (!entries) return;

        state.editingSentenceListName = name;
        state.editingPendingSentenceIndex = -1;
        state.pendingSentences = entries.map(e => ({ sentence: e.Sentence, blankIndex: e.BlankIndex, picture: e.Picture || null }));
        ui.superSentenceListNameInput.value = name;
        ui.sentenceInput.value = '';
        ui.addSentenceBtn.textContent = 'Add Sentence';
        state.pendingSentenceSelectedIndex = -1;
        clearPendingSentenceImage();
        renderSentenceWordPicker();
        renderSentenceChips();
        renderSuperSentenceListManager();
        ui.saveSentenceListBtn.textContent = 'Update List';
        ui.cancelSentenceEditBtn.hidden = false;
        ui.superSentenceListNameInput.focus();
    };

    const handleCancelSentenceEdit = () => {
        resetSentenceForm();
        renderSuperSentenceListManager();
    };

    const handleSaveSentenceList = () => {
        playSound(audio.buttonClick);
        const name = ui.superSentenceListNameInput.value.trim();

        if (!name) {
            alert('Please enter a name for your sentence list.');
            return;
        }
        if (state.pendingSentences.length === 0) {
            alert('Please add at least one sentence.');
            return;
        }

        const entries = state.pendingSentences.map(s => ({
            Sentence: s.sentence,
            BlankIndex: s.blankIndex,
            ...(s.picture ? { Picture: s.picture } : {}),
        }));

        const lists = getSuperSentenceLists();
        if (state.editingSentenceListName && state.editingSentenceListName !== name) {
            delete lists[state.editingSentenceListName];
        }
        lists[name] = entries;
        const saved = saveSuperSentenceLists(lists);
        if (!saved) {
            alert('Could not save this sentence list — storage might be full. Try smaller/fewer pictures, or fewer sentences.');
            return;
        }

        playSaveSound();
        resetSentenceForm();
        renderSuperSentenceListManager();
    };

    const getSuperSentencesForList = (name) => {
        const lists = getSuperSentenceLists();
        const entries = lists[name] || [];
        return entries.map(e => ({ sentence: e.Sentence, blankIndex: e.BlankIndex, picture: e.Picture }));
    };

    const fetchWords = async (sheetName) => {
        // --- Custom offline word lists take priority: no internet required ---
        const customLists = getCustomWordLists();
        if (customLists[sheetName]) {
            console.log(`Loading custom word list "${sheetName}" from local storage.`);
            return customLists[sheetName]
                .map(row => ({ word: row.Word, picture: row.Picture }))
                .filter(item => item.word && item.word.length > 1);
        }

        const localStorageKey = `words_${sheetName}`;

        // --- Network-First Approach ---
        try {
            console.log(`Attempting to fetch latest words for ${sheetName} from network.`);
            const response = await fetch(`${BASE_OPENSHEET_URL}${encodeURIComponent(sheetName)}`);
            if (!response.ok) {
                // This will trigger the catch block below
                throw new Error(`Network request failed with status: ${response.status}`);
            }
            const data = await response.json();
            const words = data.map(row => ({ word: row.Word, picture: row.Picture })).filter(item => item.word && item.word.length > 1);

            // If fetch is successful, update localStorage for future offline use.
            try {
                localStorage.setItem(localStorageKey, JSON.stringify(words));
                console.log(`Successfully cached fresh words for ${sheetName} in localStorage.`);
            } catch (e) {
                console.warn(`Could not cache words for ${sheetName} in localStorage:`, e);
            }

            return words; // Return fresh data

        } catch (networkError) {
            console.warn(`Network fetch for ${sheetName} failed. Falling back to local cache.`, networkError);

            // --- Fallback 1: localStorage ---
            try {
                const cachedWords = localStorage.getItem(localStorageKey);
                if (cachedWords) {
                    console.log(`Successfully loaded words for ${sheetName} from localStorage cache.`);
                    return JSON.parse(cachedWords);
                }
            } catch (e) {
                console.warn(`Could not read words for ${sheetName} from localStorage:`, e);
            }

            // --- Fallback 2: Local 'words.json' via Service Worker ---
            console.log(`No localStorage cache for ${sheetName}. Attempting to load from local 'words.json'.`);
            try {
                const response = await fetch('words.json');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const localWords = await response.json();

                if (localWords[sheetName]) {
                    console.log(`Successfully loaded words for ${sheetName} from local 'words.json'.`);
                    const words = localWords[sheetName].map(row => ({ word: row.Word, picture: row.Picture })).filter(item => item.word && item.word.length > 1);

                    // Attempt to warm up localStorage for the next offline session
                    try {
                        localStorage.setItem(localStorageKey, JSON.stringify(words));
                        console.log(`Cached words from 'words.json' for ${sheetName} in localStorage.`);
                    } catch (e) {
                        console.warn(`Could not cache words from 'words.json' for ${sheetName} in localStorage:`, e);
                    }

                    return words;
                } else {
                    throw new Error(`Level '${sheetName}' not found in local 'words.json'.`);
                }
            } catch (localError) {
                console.error(`Fatal: Error fetching words for ${sheetName} from all sources.`, localError);
                alert(`Failed to load words for "${sheetName}". The game cannot continue.`);
                return []; // Return empty array to prevent crash
            }
        }
    };
    
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const generateLetterOptions = (correctLetter) => {
        // Match the decoy letters' case to whatever case the real word was typed in.
        const isLowerCase = correctLetter === correctLetter.toLowerCase() && correctLetter !== correctLetter.toUpperCase();
        const alphabet = isLowerCase ? ALPHABET.toLowerCase() : ALPHABET;
        const incorrectLetters = [];
        while (incorrectLetters.length < 2) {
            const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
            if (randomLetter.toLowerCase() !== correctLetter.toLowerCase() && !incorrectLetters.includes(randomLetter)) {
                incorrectLetters.push(randomLetter);
            }
        }
        return shuffleArray([correctLetter, ...incorrectLetters]);
    };

    const generateQuestionData = (wordData) => {
        const word = wordData.word;
        const hardMode = state.difficulty === 'hard' && !!wordData.picture;

        if (hardMode) {
            return {
                word,
                picture: wordData.picture,
                hardMode: true,
                letterIndex: 0,
                correctAnswer: word[0],
                options: generateLetterOptions(word[0]),
            };
        }

        const missingIndex = Math.floor(Math.random() * (word.length - 2)) + 1;
        const correctAnswer = word[missingIndex];
        return {
            word,
            missingIndex,
            correctAnswer,
            options: generateLetterOptions(correctAnswer),
            picture: wordData.picture,
            hardMode: false,
        };
    };

    const generateWordPowerQuestion = (wordData, allWords) => {
        const word = wordData.word;
        const decoyPool = [...new Set(allWords.map(w => w.word).filter(w => w !== word))];
        const decoys = shuffleArray(decoyPool).slice(0, 2);

        return {
            word,
            picture: wordData.picture,
            wordPowerMode: true,
            correctAnswer: word,
            options: shuffleArray([word, ...decoys]),
        };
    };

    // Strip leading/trailing punctuation so a blank word like "badminton." compares
    // and displays cleanly as "badminton" in bubbles/lanes.
    const cleanSentenceWord = (token) => token.replace(/^[^\w]+|[^\w]+$/g, '');

    const generateSentenceQuestion = (entry, allEntries) => {
        const tokens = tokenizeSentence(entry.sentence);
        const correctAnswer = cleanSentenceWord(tokens[entry.blankIndex]);

        const decoyPool = [...new Set(
            allEntries
                .map(e => cleanSentenceWord(tokenizeSentence(e.sentence)[e.blankIndex]))
                .filter(w => w.toLowerCase() !== correctAnswer.toLowerCase())
        )];
        const decoys = shuffleArray(decoyPool).slice(0, 2);

        return {
            word: correctAnswer,
            sentenceMode: true,
            tokens,
            blankIndex: entry.blankIndex,
            picture: entry.picture,
            wordPowerMode: state.gameMode === 'stayInLane',
            correctAnswer,
            options: shuffleArray([correctAnswer, ...decoys]),
        };
    };

    // --- 5d. Timer Functions ---
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const updateTimerDisplay = () => {
        if (state.timerMode === 'countdown') {
            ui.timer.textContent = formatTime(state.timerValue);
        } else {
            ui.timer.textContent = `${state.timerValue}s`;
        }
    };

    const startTimer = () => {
        if (state.timerMode === 'none' || state.timerInterval) return;

        ui.timerContainer.style.display = 'block';
        
        state.timerInterval = setInterval(() => {
            if (state.timerMode === 'stopwatch') {
                state.timerValue++;
            } else if (state.timerMode === 'countdown') {
                state.timerValue--;
                if (state.timerValue <= 0) {
                    endGame();
                }
            }
            updateTimerDisplay();
        }, 1000);
    };

    const stopTimer = () => {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    };

    const resetTimer = () => {
        stopTimer();
        state.timerValue = state.timerMode === 'countdown' ? state.countdownDurationSeconds : 0;
        updateTimerDisplay();
    };

    // --- 5e. Camera & MediaPipe Tasks Vision ---
    const initCamera = async () => {
        if (state.cameraInitialized) return;
        initializeAudio();

        ui.cameraBtn.disabled = true;
        ui.cameraBtn.textContent = 'Loading...';

        let lastProcessedAt = 0;
        const MIN_PROCESS_INTERVAL_MS = 33; // cap detection at ~30fps so slower/mobile devices stay smooth

        const processVideo = () => {
            // Note: we deliberately do NOT skip frames based on video.currentTime — on some
            // devices/browsers that value doesn't reliably advance every frame, which would
            // silently freeze detection. We throttle by wall-clock time instead (performance.now()
            // always advances), which still keeps tracking smooth on slower/mobile hardware.
            const now = performance.now();
            if (!ui.videoElement.paused && !ui.videoElement.ended && handLandmarker && (now - lastProcessedAt) >= MIN_PROCESS_INTERVAL_MS) {
                lastProcessedAt = now;
                try {
                    // Hand tracking isn't used at all in Stay in Lane, and pose tracking is only
                    // needed during active Stay in Lane gameplay — skipping the unused model each
                    // frame meaningfully cuts compute, which matters most on slower/mobile devices.
                    const needsHand = state.gameMode !== 'stayInLane';
                    const needsPose = poseLandmarker && state.gameActive && state.gameMode === 'stayInLane';
                    const handResults = needsHand ? handLandmarker.detectForVideo(ui.videoElement, now) : { landmarks: [] };
                    const poseResults = needsPose ? poseLandmarker.detectForVideo(ui.videoElement, now) : null;
                    onDetectionResults(handResults, poseResults);
                    detectionErrorCount = 0;
                } catch (detectionError) {
                    handleDetectionError(detectionError);
                }
            }
            requestAnimationFrame(processVideo);
        };

        try {
            const [stream] = await Promise.all([
                navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    },
                }),
                initLandmarkers(IS_MOBILE_DEVICE),
            ]);
            ui.videoElement.srcObject = stream;

            ui.videoElement.onloadedmetadata = () => {
                ui.videoElement.play();
                state.videoAspectRatio = ui.videoElement.videoWidth / ui.videoElement.videoHeight;
                updateCanvasSize();
                state.cameraInitialized = true;
                ui.cameraBtn.disabled = false;
                ui.cameraBtn.textContent = 'Enable Camera';
                showLevelSelectionScreen();
                processVideo(); // Start the processing loop
            };
        } catch (err) {
            console.error("Failed to start the camera or load the tracking models: ", err);
            alert(`Failed to start the camera or load the hand/body tracking models: ${err.name || ''} ${err.message}`);
            ui.cameraBtn.disabled = false;
            ui.cameraBtn.textContent = 'Enable Camera';
        }
    };

    // --- 5e-i. Hand rendering: a cute glove instead of a raw landmark skeleton ---
    const HAND_GLOVE_COLORS = [
        { fill: '#3DB8E8', stroke: '#1C7FA3', cuff: '#8FDCF5' }, // sky — first hand
        { fill: '#FF7A68', stroke: '#D8452F', cuff: '#FFAFA2' }, // coral — second hand
    ];

    const drawHandGlove = (landmarks, handIndex) => {
        const { ctx, outputCanvas: canvas } = ui;
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const indexTip = landmarks[8];

        const wx = wrist.x * canvas.width, wy = wrist.y * canvas.height;
        const mx = middleMcp.x * canvas.width, my = middleMcp.y * canvas.height;
        const dx = mx - wx, dy = my - wy;
        const handLen = Math.hypot(dx, dy) || 1;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        const cx = (wx + mx) / 2;
        const cy = (wy + my) / 2;
        const scale = handLen / 55;
        const colors = HAND_GLOVE_COLORS[handIndex % HAND_GLOVE_COLORS.length];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;

        // Mitten body
        ctx.beginPath();
        ctx.moveTo(-26, 38);
        ctx.quadraticCurveTo(-38, 8, -28, -18);
        ctx.quadraticCurveTo(-22, -44, 0, -48);
        ctx.quadraticCurveTo(22, -44, 28, -18);
        ctx.quadraticCurveTo(38, 8, 26, 38);
        ctx.quadraticCurveTo(0, 52, -26, 38);
        ctx.closePath();
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.strokeStyle = colors.stroke;
        ctx.stroke();

        // Thumb
        ctx.beginPath();
        ctx.ellipse(-32, 8, 11, 19, -0.55, 0, Math.PI * 2);
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.stroke();

        // Cuff
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-28, 32, 56, 16, 8);
        } else {
            ctx.rect(-28, 32, 56, 16);
        }
        ctx.fillStyle = colors.cuff;
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // A small pointer dot at the index fingertip — this is the actual point used
        // for bubble-pop hit-testing, kept visible so aiming still feels precise.
        const tx = indexTip.x * canvas.width, ty = indexTip.y * canvas.height;
        const pointerRadius = Math.max(5, Math.min(10, 7 * scale));
        ctx.beginPath();
        ctx.arc(tx, ty, pointerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.stroke;
        ctx.stroke();
    };

    function onDetectionResults(handResults, poseResults) {
        const { ctx, outputCanvas } = ui;
        const now = performance.now();
        const dt = now - (state.lastFrameTime || now);
        state.lastFrameTime = now;

        ctx.save();
        ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        ctx.drawImage(ui.videoElement, 0, 0, outputCanvas.width, outputCanvas.height);

        state.multiHandLandmarks = handResults.landmarks || [];
        state.poseLandmarks = (poseResults && poseResults.landmarks && poseResults.landmarks[0]) || null;

        const isStayInLane = state.gameMode === 'stayInLane';
        const tracked = isStayInLane ? !!state.poseLandmarks : state.multiHandLandmarks.length > 0;
        ui.handStatusLabel.textContent = isStayInLane ? 'Body' : 'Hand';
        ui.handStatus.textContent = tracked ? 'Yes' : 'No';

        state.multiHandLandmarks.forEach((landmarks, i) => drawHandGlove(landmarks, i));
        if (state.poseLandmarks) {
            drawingUtils.drawConnectors(state.poseLandmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#00BFFF', lineWidth: 3 });
        }

        if (state.gameActive && !state.waitingForNextQuestion && !state.inputLocked) {
            if (isStayInLane) {
                if (state.poseLandmarks) {
                    updateWordPowerZones(dt);
                } else {
                    resetWordZoneDwell();
                }
                updateObstacles(dt);
            } else if (state.multiHandLandmarks.length > 0) {
                checkBubbleCollision();
            }
        }

        if (isStayInLane) {
            drawWordZones();
            drawObstacles();
        } else {
            drawLetterBubbles();
        }
        ctx.restore();
    }

    // --- 5f-i. Ready Countdown (3, 2, 1) ---
    const cancelCountdown = () => {
        if (state.countdownInterval) {
            clearInterval(state.countdownInterval);
            state.countdownInterval = null;
        }
        ui.countdownOverlay.style.display = 'none';
        state.inputLocked = false;
    };

    const runCountdown = (onDone) => {
        state.inputLocked = true;
        let i = 0;

        const showStep = () => {
            ui.countdownOverlay.textContent = READY_COUNTDOWN_STEPS[i];
            ui.countdownOverlay.style.display = 'flex';
            ui.countdownOverlay.classList.remove('pop');
            void ui.countdownOverlay.offsetWidth; // restart the pop animation
            ui.countdownOverlay.classList.add('pop');
            playCountdownBeepSound();
        };

        showStep();
        state.countdownInterval = setInterval(() => {
            i++;
            if (i < READY_COUNTDOWN_STEPS.length) {
                showStep();
            } else {
                clearInterval(state.countdownInterval);
                state.countdownInterval = null;
                ui.countdownOverlay.style.display = 'none';
                state.inputLocked = false;
                playCountdownGoSound();
                onDone();
            }
        }, READY_COUNTDOWN_STEP_MS);
    };

    // --- 5f. Game Logic ---
    const loadQuestion = (question) => {
        state.currentWord = question.word;
        state.waitingForNextQuestion = false;
        ui.wordContainer.classList.remove('answer-correct', 'answer-wrong', 'shake', 'sparkle');

        if (question.wordPowerMode) {
            state.letterBubbles = [];
            setupWordZones(question.options, question.correctAnswer);
        } else {
            state.wordZones = [];
            state.activeZoneIndex = -1;
            state.correctAnswer = question.correctAnswer;
            createBubbles(question.options);
        }

        // Content display: a sentence-with-blank takes priority over the word/spelling display.
        if (question.sentenceMode) {
            displaySentenceBlank(question.tokens, question.blankIndex);
        } else if (question.wordPowerMode) {
            displayWordPowerBlank(question);
        } else if (question.hardMode) {
            displaySpellingWord(question.word, question.letterIndex);
        } else {
            displayWord(question.word, question.missingIndex);
        }

        if (question.picture) {
            const wordContainerHeight = ui.wordContainer.offsetHeight;
            ui.imagePlaceholder.style.height = `${wordContainerHeight * 1.5}px`;
            ui.imagePlaceholder.style.width = `${ui.wordContainer.offsetWidth}px`;
            ui.imagePlaceholder.style.display = 'flex';

            // Avoid re-fetching/flashing the same picture between letters in hard mode
            if (ui.wordImage.src !== question.picture) {
                ui.wordImage.style.display = 'none'; // Hide image until it's loaded
                ui.wordImage.onload = () => {
                    ui.wordImage.style.display = 'block';
                };
                ui.wordImage.onerror = () => {
                    ui.wordImage.style.display = 'none';
                };
                ui.wordImage.src = question.picture;
                // Some images (e.g. data: URLs already decoded once) can be "complete"
                // the instant src is set, without ever firing a fresh 'load' event —
                // catch that case so the picture isn't left hidden on the first question.
                if (ui.wordImage.complete && ui.wordImage.naturalWidth > 0) {
                    ui.wordImage.style.display = 'block';
                }
            } else if (ui.wordImage.complete && ui.wordImage.naturalWidth > 0) {
                ui.wordImage.style.display = 'block';
            }
        } else {
            ui.imagePlaceholder.style.display = 'none';
            ui.wordImage.src = '';
        }

        ui.questionCounter.textContent = `${state.currentQuestionIndex + 1}/${state.selectedQuestions.length}`;

        // Stay in Lane gets a fresh 3-2-1 countdown before every question, so players
        // have time to step back to a neutral spot before the lanes go live.
        if (question.wordPowerMode) {
            runCountdown(() => {});
        }
    };

    const checkBubbleCollision = () => {
        if (state.multiHandLandmarks.length === 0) return;

        for (const landmarks of state.multiHandLandmarks) {
            if (!landmarks?.[8]) continue; // Index finger tip landmark

            const indexFinger = {
                x: landmarks[8].x * ui.outputCanvas.width,
                y: landmarks[8].y * ui.outputCanvas.height,
            };

            for (const bubble of state.letterBubbles) {
                if (bubble.popped) continue;

                const distance = Math.hypot(indexFinger.x - bubble.x, indexFinger.y - bubble.y);
                if (distance < bubble.radius) {
                    handleBubblePop(bubble);
                    return;
                }
            }
        }
    };

    // Show the player what the correct answer actually was, once a question is done —
    // whether they got it right or not.
    const revealAnswer = (question) => {
        if (question.sentenceMode) {
            displaySentenceBlank(question.tokens, question.blankIndex, question.correctAnswer);
        } else {
            displayWord(question.word, -1); // no missing index => every letter shown
        }
    };

    const finishQuestion = (isCorrect) => {
        const question = state.selectedQuestions[state.currentQuestionIndex];
        revealAnswer(question);
        ui.wordContainer.classList.remove('answer-correct', 'answer-wrong');
        ui.wordContainer.classList.add(isCorrect ? 'answer-correct' : 'answer-wrong');

        if (isCorrect) {
            state.score++;
            ui.score.textContent = state.score;
            showFeedback("Correct! 🎉", true);
        } else {
            showFeedback("Try again! 🤔", false);
        }

        setTimeout(() => {
            state.currentQuestionIndex++;
            if (state.currentQuestionIndex < state.selectedQuestions.length) {
                loadQuestion(state.selectedQuestions[state.currentQuestionIndex]);
            } else {
                endGame();
            }
        }, 1500);
    };

    const handleBubblePop = (bubble) => {
        bubble.popped = true;
        state.waitingForNextQuestion = true;
        playSound(audio.popBubble);

        const question = state.selectedQuestions[state.currentQuestionIndex];

        if (bubble.isCorrect) {
            playSound(audio.correctAnswer);

            // Hard mode: more letters left in this word — advance within the same question
            if (question.hardMode && question.letterIndex < question.word.length - 1) {
                showFeedback("Correct! 🎉", true);
                question.letterIndex++;
                question.correctAnswer = question.word[question.letterIndex];
                question.options = generateLetterOptions(question.correctAnswer);

                setTimeout(() => loadQuestion(question), 900);
                return;
            }

            finishQuestion(true);
        } else {
            playSound(audio.wrongAnswer);
            finishQuestion(false);
        }
    };

    // --- 5g. Stay in Lane (lane-based) Logic ---
    const setupWordZones = (options, correctAnswer) => {
        state.wordZones = options.map(word => ({ word, isCorrect: word === correctAnswer, dwellProgress: 0 }));
        state.activeZoneIndex = -1;
    };

    const resetWordZoneDwell = () => {
        if (!state.wordZones) return;
        state.wordZones.forEach(z => z.dwellProgress = 0);
        state.activeZoneIndex = -1;
    };

    const handleWordZoneSelect = (zone) => {
        state.waitingForNextQuestion = true;
        playSound(audio.popBubble);
        playSound(zone.isCorrect ? audio.correctAnswer : audio.wrongAnswer);
        finishQuestion(zone.isCorrect);
    };

    const updateWordPowerZones = (dt) => {
        if (!state.wordZones || state.wordZones.length === 0) return;
        const pose = state.poseLandmarks;
        if (!pose) {
            resetWordZoneDwell();
            return;
        }

        // Use the midpoint between the shoulders as the player's standing x-position.
        const leftShoulder = pose[11];
        const rightShoulder = pose[12];
        if (!leftShoulder || !rightShoulder) {
            resetWordZoneDwell();
            return;
        }
        const avgX = ((leftShoulder.x + rightShoulder.x) / 2) * ui.outputCanvas.width;

        const zoneWidth = ui.outputCanvas.width / state.wordZones.length;
        let zoneIndex = Math.floor(avgX / zoneWidth);
        zoneIndex = Math.max(0, Math.min(state.wordZones.length - 1, zoneIndex));

        if (zoneIndex !== state.activeZoneIndex) {
            state.wordZones.forEach(z => z.dwellProgress = 0);
            state.activeZoneIndex = zoneIndex;
        }

        state.wordZones[zoneIndex].dwellProgress += dt;

        if (state.wordZones[zoneIndex].dwellProgress >= WORD_POWER_DWELL_MS) {
            handleWordZoneSelect(state.wordZones[zoneIndex]);
        }
    };

    const startGame = async () => {
        playSound(audio.buttonClick);
        if (!state.selectedLevelName) {
            alert("Please choose a level.");
            return;
        }

        ui.startScreenTitle.textContent = `Loading ${state.selectedLevelName}...`;
        ui.startScreenDescription.textContent = 'Fetching quiz words...';
        ui.startBtn.style.display = 'none';

        const isStayInLane = state.gameMode === 'stayInLane';
        let buildQuestion;
        let sourceItems;

        if (state.selectedContentType === 'sentence') {
            sourceItems = getSuperSentencesForList(state.selectedLevelName);
            if (sourceItems.length < 3) {
                ui.startScreenTitle.textContent = 'Not Enough Sentences!';
                ui.startScreenDescription.textContent = 'Super Sentence needs at least 3 sentences in a list. Please add more.';
                ui.startBtn.textContent = 'Back to Levels';
                ui.startBtn.onclick = showLevelSelectionScreen;
                ui.startBtn.style.display = 'block';
                return;
            }
            buildQuestion = (entry) => generateSentenceQuestion(entry, sourceItems);
        } else {
            const words = await fetchWords(state.selectedLevelName);
            if (words.length === 0) {
                ui.startScreenTitle.textContent = 'Error!';
                ui.startScreenDescription.textContent = 'Could not load words for this level.';
                ui.startBtn.textContent = 'Back to Levels';
                ui.startBtn.onclick = showLevelSelectionScreen;
                ui.startBtn.style.display = 'block';
                return;
            }

            if (isStayInLane && words.length < 3) {
                ui.startScreenTitle.textContent = 'Not Enough Words!';
                ui.startScreenDescription.textContent = 'Stay in Lane needs at least 3 words in a level. Please add more words or pick another level.';
                ui.startBtn.textContent = 'Back to Levels';
                ui.startBtn.onclick = showLevelSelectionScreen;
                ui.startBtn.style.display = 'block';
                return;
            }

            sourceItems = words;
            buildQuestion = isStayInLane
                ? (wordData) => generateWordPowerQuestion(wordData, words)
                : generateQuestionData;
        }

        state.selectedQuestions = shuffleArray(sourceItems.map(buildQuestion)).slice(0, 10);
        state.score = 0;
        state.currentQuestionIndex = 0;
        state.gameActive = true;
        state.obstacles = [];
        state.obstacleSpawnTimer = 0;
        ui.score.textContent = state.score;
        ui.mainMenuBtn.style.display = 'block';

        resetTimer();
        showScreen(null); // Hide all major screens

        const firstQuestion = state.selectedQuestions[0];
        if (isStayInLane) {
            // Stay in Lane shows its own countdown before every question, including the first.
            startTimer();
            loadQuestion(firstQuestion);
        } else {
            // Point and Pop: show the first question right away (so players can see it),
            // but keep it locked behind a single 3-2-1 countdown before gameplay begins.
            loadQuestion(firstQuestion);
            runCountdown(() => startTimer());
        }
    };

    const endGame = () => {
        state.gameActive = false;
        stopTimer();
        cancelCountdown();
        playGameOverSound();
        ui.finalScore.textContent = state.score;
        document.querySelector('#game-over p').innerHTML = `Your score: <span id="final-score">${state.score}</span>/${state.selectedQuestions.length}`;
        showScreen(ui.gameOverScreen);
        ui.mainMenuBtn.style.display = 'none';
    };

    const selectLevel = (levelName, contentType = 'words') => {
        state.selectedLevelName = levelName;
        state.selectedContentType = contentType;
        ui.startScreenTitle.textContent = `✏️ PopAR Kit 2.0 - ${levelName} ✏️`;
        ui.startScreenDescription.textContent = state.gameMode === 'stayInLane'
            ? 'Move into the left, middle, or right lane with the correct word and hold still!'
            : 'Use your index finger to pop the correct letter or word bubble!';
        ui.startBtn.textContent = 'Start Quiz';
        ui.startBtn.onclick = startGame;
        ui.startBtn.style.display = 'block'; // Ensure the start button is visible
        showScreen(ui.startScreen);
    };

    const showLevelSelectionScreen = () => {
        state.gameActive = false;
        state.letterBubbles = [];
        state.wordZones = [];
        state.activeZoneIndex = -1;
        state.obstacles = [];
        state.obstacleSpawnTimer = 0;
        cancelCountdown();
        ui.wordContainer.innerHTML = '';
        ui.imagePlaceholder.style.display = 'none';
        ui.wordImage.style.display = 'none';
        ui.feedback.textContent = '';
        ui.mainMenuBtn.style.display = 'none';
        ui.timerContainer.style.display = 'none';
        resetTimer();

        ui.difficultySettingsSection.style.display = state.gameMode === 'stayInLane' ? 'none' : 'block';
        ui.bubbleMovementSettingsSection.style.display = state.gameMode === 'stayInLane' ? 'none' : 'block';
        ui.obstacleSettingsSection.style.display = state.gameMode === 'stayInLane' ? 'block' : 'none';

        // Populate the preset level dropdown: the static AVAILABLE_LEVELS first,
        // then the built-in Word Power / Super Sentence test levels.
        ui.levelSelect.innerHTML = '<option value="" disabled selected>Select a level...</option>';
        AVAILABLE_LEVELS.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            ui.levelSelect.appendChild(option);
        });
        TEST_LEVEL_NAMES.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            ui.levelSelect.appendChild(option);
        });

        // Populate custom word list buttons (skip the built-in test levels, shown in Levels instead)
        ui.customLevelButtonsContainer.innerHTML = '';
        const customListNames = Object.keys(getCustomWordLists()).filter(name => !TEST_LEVEL_NAMES.includes(name));
        customListNames.forEach(level => {
            const button = document.createElement('button');
            button.className = 'btn';
            button.textContent = level;
            button.onclick = () => { playSound(audio.buttonClick); selectLevel(level, 'words'); };
            ui.customLevelButtonsContainer.appendChild(button);
        });

        // Populate Super Sentence list buttons (skip the built-in test levels, shown in Levels instead)
        ui.superSentenceButtonsContainer.innerHTML = '';
        const sentenceListNames = Object.keys(getSuperSentenceLists()).filter(name => !TEST_LEVEL_NAMES.includes(name));
        sentenceListNames.forEach(name => {
            const button = document.createElement('button');
            button.className = 'btn';
            button.textContent = name;
            button.onclick = () => { playSound(audio.buttonClick); selectLevel(name, 'sentence'); };
            ui.superSentenceButtonsContainer.appendChild(button);
        });

        showScreen(ui.levelSelectionScreen);
    };

    // --- 6. EVENT LISTENERS ---
    const setupEventListeners = () => {
        window.addEventListener('resize', updateCanvasSize);
        window.addEventListener('orientationchange', updateCanvasSize);
        
        ui.cameraBtn.addEventListener('click', initCamera);
        ui.restartBtn.addEventListener('click', () => { playSound(audio.buttonClick); showLevelSelectionScreen(); });
        ui.mainMenuBtn.addEventListener('click', () => { playSound(audio.buttonClick); showLevelSelectionScreen(); });
        
        const handleCustomLevel = () => {
            playSound(audio.buttonClick);
            const sheetName = ui.sheetNameInput.value.trim();
            if (sheetName) selectLevel(sheetName);
        };
        ui.goBtn.addEventListener('click', handleCustomLevel);
        ui.sheetNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleCustomLevel());

        ui.playLevelBtn.addEventListener('click', () => {
            playSound(audio.buttonClick);
            const level = ui.levelSelect.value;
            if (level) selectLevel(level, TEST_LEVEL_CONTENT_TYPES[level] || 'words');
        });

        ui.myWordsBtn.addEventListener('click', () => { playSound(audio.buttonClick); showCustomWordsScreen(); });
        ui.backToLevelsBtn.addEventListener('click', () => { playSound(audio.buttonClick); showLevelSelectionScreen(); });
        ui.saveCustomListBtn.addEventListener('click', handleSaveCustomList);
        ui.cancelEditBtn.addEventListener('click', () => { playSound(audio.buttonClick); handleCancelEdit(); });

        ui.addWordBtn.addEventListener('click', () => { playSound(audio.buttonClick); handleAddWord(); });
        ui.singleWordInput.addEventListener('keypress', (e) => e.key === 'Enter' && (e.preventDefault(), handleAddWord()));
        ui.bulkModeToggle.addEventListener('change', () => setBulkMode(ui.bulkModeToggle.checked));

        ui.singleWordImageInput.addEventListener('change', async () => {
            const file = ui.singleWordImageInput.files[0];
            if (!file) return;
            try {
                state.pendingImageDataUrl = await resizeImageToDataUrl(file);
                ui.pendingImageThumb.src = state.pendingImageDataUrl;
                ui.pendingImagePreview.style.display = 'flex';
            } catch (e) {
                console.warn('Could not process image:', e);
                alert('Could not load that picture. Please try a different image.');
                clearPendingImage();
            }
        });
        ui.removePendingImageBtn.addEventListener('click', () => { playSound(audio.buttonClick); clearPendingImage(); });

        ui.singleWordInput.addEventListener('paste', async (e) => {
            const file = extractImageFileFromClipboard(e);
            if (!file) return;
            e.preventDefault();
            try {
                state.pendingImageDataUrl = await resizeImageToDataUrl(file);
                ui.pendingImageThumb.src = state.pendingImageDataUrl;
                ui.pendingImagePreview.style.display = 'flex';
            } catch (err) {
                console.warn('Could not process pasted image:', err);
                alert('Could not load that picture. Please try a different image.');
                clearPendingImage();
            }
        });

        ui.mySentencesBtn.addEventListener('click', () => { playSound(audio.buttonClick); showSuperSentenceScreen(); });
        ui.backToLevelsFromSentenceBtn.addEventListener('click', () => { playSound(audio.buttonClick); showLevelSelectionScreen(); });
        ui.saveSentenceListBtn.addEventListener('click', handleSaveSentenceList);
        ui.cancelSentenceEditBtn.addEventListener('click', () => { playSound(audio.buttonClick); handleCancelSentenceEdit(); });

        ui.sentenceInput.addEventListener('input', () => {
            state.pendingSentenceSelectedIndex = -1;
            renderSentenceWordPicker();
        });
        ui.addSentenceBtn.addEventListener('click', () => { playSound(audio.buttonClick); handleAddSentence(); });

        ui.sentenceWordImageInput.addEventListener('change', async () => {
            const file = ui.sentenceWordImageInput.files[0];
            if (!file) return;
            try {
                state.pendingSentenceImageDataUrl = await resizeImageToDataUrl(file);
                ui.sentencePendingImageThumb.src = state.pendingSentenceImageDataUrl;
                ui.sentencePendingImagePreview.style.display = 'flex';
            } catch (e) {
                console.warn('Could not process image:', e);
                alert('Could not load that picture. Please try a different image.');
                clearPendingSentenceImage();
            }
        });
        ui.sentenceRemoveImageBtn.addEventListener('click', () => { playSound(audio.buttonClick); clearPendingSentenceImage(); });

        ui.sentenceInput.addEventListener('paste', async (e) => {
            const file = extractImageFileFromClipboard(e);
            if (!file) return;
            e.preventDefault();
            try {
                state.pendingSentenceImageDataUrl = await resizeImageToDataUrl(file);
                ui.sentencePendingImageThumb.src = state.pendingSentenceImageDataUrl;
                ui.sentencePendingImagePreview.style.display = 'flex';
            } catch (err) {
                console.warn('Could not process pasted image:', err);
                alert('Could not load that picture. Please try a different image.');
                clearPendingSentenceImage();
            }
        });

        [ui.modePointAndPopBtn, ui.modeStayInLaneBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                playSound(audio.buttonClick);
                state.gameMode = btn.id === 'mode-stay-in-lane-btn' ? 'stayInLane' : 'pointAndPop';
                ui.modePointAndPopBtn.classList.toggle('active', state.gameMode === 'pointAndPop');
                ui.modeStayInLaneBtn.classList.toggle('active', state.gameMode === 'stayInLane');
                ui.gameModeHint.textContent = GAME_MODE_HINTS[state.gameMode];
                ui.difficultySettingsSection.style.display = state.gameMode === 'stayInLane' ? 'none' : 'block';
                ui.bubbleMovementSettingsSection.style.display = state.gameMode === 'stayInLane' ? 'none' : 'block';
                ui.obstacleSettingsSection.style.display = state.gameMode === 'stayInLane' ? 'block' : 'none';
            });
        });

        [ui.bubblesRoamBtn, ui.bubblesStillBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                playSound(audio.buttonClick);
                state.bubblesRoam = btn.id === 'bubbles-roam-btn';
                ui.bubblesRoamBtn.classList.toggle('active', state.bubblesRoam);
                ui.bubblesStillBtn.classList.toggle('active', !state.bubblesRoam);
            });
        });

        [ui.obstaclesOnBtn, ui.obstaclesOffBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                playSound(audio.buttonClick);
                state.obstaclesEnabled = btn.id === 'obstacles-on-btn';
                ui.obstaclesOnBtn.classList.toggle('active', state.obstaclesEnabled);
                ui.obstaclesOffBtn.classList.toggle('active', !state.obstaclesEnabled);
                if (!state.obstaclesEnabled) {
                    state.obstacles = [];
                    state.obstacleSpawnTimer = 0;
                }
            });
        });

        [ui.easyModeBtn, ui.hardModeBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                playSound(audio.buttonClick);
                state.difficulty = btn.id === 'hard-mode-btn' ? 'hard' : 'easy';
                ui.easyModeBtn.classList.toggle('active', state.difficulty === 'easy');
                ui.hardModeBtn.classList.toggle('active', state.difficulty === 'hard');
            });
        });

        [ui.stopwatchBtn, ui.countdownBtn, ui.noTimerBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                playSound(audio.buttonClick);
                let mode = btn.id.replace('-btn', '');
                if (mode === 'no-timer') mode = 'none';
                state.timerMode = mode;

                ui.stopwatchBtn.classList.toggle('active', state.timerMode === 'stopwatch');
                ui.countdownBtn.classList.toggle('active', state.timerMode === 'countdown');
                ui.noTimerBtn.classList.toggle('active', state.timerMode === 'none');
            });
        });

        ui.countdownDurationInput.addEventListener('change', () => {
            const minutes = Math.max(1, Math.min(15, Number(ui.countdownDurationInput.value) || 1));
            ui.countdownDurationInput.value = minutes;
            state.countdownDurationSeconds = minutes * 60;
        });
        
        ui.bgmVolumeSlider.addEventListener('input', (e) => setBgmVolume(e.target.value));
        ui.sfxVolumeSlider.addEventListener('input', (e) => setSfxVolume(e.target.value));

        ui.flipCameraToggle.addEventListener('change', () => {
            playSound(audio.buttonClick);
            setCameraFlipped(ui.flipCameraToggle.checked);
        });
    };

    // --- 7. INITIALIZATION ---
    const main = () => {
        seedTestLevels();

        let savedCameraFlip = false;
        try {
            savedCameraFlip = localStorage.getItem(CAMERA_FLIP_KEY) === 'true';
        } catch (e) {
            console.warn('Could not read camera flip preference:', e);
        }
        setCameraFlipped(savedCameraFlip);

        // Service Worker Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
            .then((reg) => {
                console.log('Service worker registered.', reg);
            });
        }

        // PWA Installation
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            state.deferredInstallPrompt = e;
            state.isInstallable = true;
            ui.installButton.hidden = false;
        });

        ui.installButton.addEventListener("click", async () => {
            if (state.deferredInstallPrompt) {
                state.deferredInstallPrompt.prompt();
                const { outcome } = await state.deferredInstallPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                } else {
                    console.log('User dismissed the install prompt');
                }
                state.deferredInstallPrompt = null;
                state.isInstallable = false;
                ui.installButton.hidden = true;
            }
        });

        window.addEventListener('appinstalled', (evt) => {
            console.log('App installed');
            ui.installButton.hidden = true;
        });

        // Fullscreen toggle
        const exitFullscreenIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a2 2 0 0 1-2 2H4"/><path d="M15 3v3a2 2 0 0 0 2 2h3"/><path d="M9 21v-3a2 2 0 0 0-2-2H4"/><path d="M15 21v-3a2 2 0 0 1 2-2h3"/></svg>';
        const enterFullscreenIcon = ui.fullscreenBtn.innerHTML;

        ui.fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });

        document.addEventListener('fullscreenchange', () => {
            ui.fullscreenBtn.innerHTML = document.fullscreenElement ? exitFullscreenIcon : enterFullscreenIcon;
        });

        // Force-update: unregister the service worker and clear all caches, then
        // reload, so a new version loads even where a hard refresh isn't easy (Android).
        ui.updateBtn.addEventListener('click', async () => {
            ui.updateBtn.disabled = true;
            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(reg => reg.unregister()));
                }
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                }
            } catch (e) {
                console.warn('Could not fully clear caches during update:', e);
            } finally {
                location.reload();
            }
        });

        setupEventListeners();
        updateCanvasSize();
        setSfxVolume(ui.sfxVolumeSlider.value);
        showScreen(ui.cameraPermissionScreen);
    };

    main();
});
