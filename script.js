
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CONFIGURATION ---
    const GOOGLE_SHEET_ID = '1ZMEfBGZQHGf-UVvNJj8D7cOhQ3M2Z2cYNBrNMT4pnn0';
    const BASE_OPENSHEET_URL = `https://opensheet.elk.sh/${GOOGLE_SHEET_ID}/`;
    const AVAILABLE_LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "The Password"];
    const CUSTOM_WORD_LISTS_KEY = 'popar_custom_word_lists';
    const COUNTDOWN_TIME = 60; // seconds
    const MEDIAPIPE_HANDS_CONFIG = {
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1635986972/${file}`
    };
    const HANDS_OPTIONS = {
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        useCpuInference: true
    };

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
        stopwatchBtn: document.getElementById('stopwatch-btn'),
        countdownBtn: document.getElementById('countdown-btn'),
        noTimerBtn: document.getElementById('no-timer-btn'),
        mainMenuBtn: document.getElementById('main-menu-btn'),
        bgmVolumeSlider: document.getElementById('bgm-volume'),
        sfxVolumeSlider: document.getElementById('sfx-volume'),
        finalScore: document.getElementById('final-score'),
        handStatus: document.getElementById('hand-status'),
        videoContainer: document.querySelector('.video-container'),
        wordContainer: document.getElementById('word-container'),
        imagePlaceholder: document.getElementById('image-placeholder'),
        wordImage: document.getElementById('word-image'),
        feedback: document.getElementById('feedback'),
        startScreenTitle: document.getElementById('start-screen-title'),
        startScreenDescription: document.getElementById('start-screen-description'),
        installButton: document.getElementById('install-button'),
    };

    // --- 3. AUDIO ELEMENTS ---
    const audio = {
        backgroundMusic: document.getElementById('backgroundMusic'),
        buttonClick: document.getElementById('buttonClickSound'),
        popBubble: document.getElementById('popBubbleSound'),
        correctAnswer: document.getElementById('correctAnswerSound'),
        wrongAnswer: document.getElementById('wrongAnswerSound'),
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
        correctLetter: "",
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
    };

    const hands = new Hands(MEDIAPIPE_HANDS_CONFIG);
    hands.setOptions(HANDS_OPTIONS);
    hands.onResults(onHandResults);

    // --- 5. CORE FUNCTIONS ---

    // --- 5a. UI & Drawing Functions ---
    const showScreen = (screen) => {
        [ui.cameraPermissionScreen, ui.levelSelectionScreen, ui.startScreen, ui.gameOverScreen, ui.customWordsScreen].forEach(s => s.style.display = 'none');
        
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

    const createLetterBubbles = (options) => {
        const { width: canvasWidth, height: canvasHeight } = ui.outputCanvas;
        const bubbleRadius = Math.min(canvasWidth, canvasHeight) * 0.05;

        const positions = shuffleArray([
            { x: canvasWidth * 0.25, y: canvasHeight * 0.3 },
            { x: canvasWidth * 0.5, y: canvasHeight * 0.3 },
            { x: canvasWidth * 0.75, y: canvasHeight * 0.3 },
        ]);

        state.letterBubbles = options.map((letter, i) => ({
            x: positions[i].x,
            y: positions[i].y,
            radius: bubbleRadius,
            letter,
            isCorrect: letter === state.correctLetter,
            createdAt: Date.now(),
            popped: false,
        }));
    };

    const drawLetterBubbles = () => {
        state.letterBubbles.forEach(bubble => {
            if (bubble.popped) return;
            const { ctx } = ui;
            const age = Date.now() - bubble.createdAt;
            const pulseScale = 1 + 0.05 * Math.sin(age / 300);
            const floatOffset = Math.sin(age / 1000) * 5;

            ctx.save();
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y + floatOffset, bubble.radius * pulseScale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.font = `bold ${bubble.radius * 0.8}px Comic Sans MS, Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.scale(-1, 1);
            ctx.fillText(bubble.letter, -bubble.x, bubble.y + floatOffset);
            ctx.restore();
        });
    };
    
    const showFeedback = (message, isCorrect) => {
        ui.feedback.textContent = message;
        ui.feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
        ui.feedback.style.opacity = 1;
        setTimeout(() => { ui.feedback.style.opacity = 0; }, 1500);
    };

    // --- 5b. Audio Functions ---
    const playSound = (sound) => {
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => {
                if (e.name !== 'AbortError') {
                    console.error("Audio playback failed:", e);
                }
            });
        }
    };

    const initializeAudio = () => {
        audio.backgroundMusic.volume = ui.bgmVolumeSlider.value;
        playSound(audio.backgroundMusic);
    };
    
    const setSfxVolume = (volume) => {
        [audio.buttonClick, audio.popBubble, audio.correctAnswer, audio.wrongAnswer].forEach(s => {
            if (s) s.volume = volume;
        });
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

    const parseWordsInput = (text) => {
        return text
            .split(/[\n,]/)
            .map(w => w.trim())
            .filter(w => w.length > 1)
            .map(w => ({ Word: w }));
    };

    const renderCustomListManager = () => {
        const lists = getCustomWordLists();
        const names = Object.keys(lists);
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
            chip.className = 'word-chip';
            const thumbHtml = entry.picture ? `<img class="word-chip-thumb" src="${entry.picture}" alt="">` : '';
            chip.innerHTML = `${thumbHtml}<span>${entry.word}</span>`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-word-btn';
            removeBtn.textContent = '✕';
            removeBtn.setAttribute('aria-label', `Remove ${entry.word}`);
            removeBtn.onclick = () => {
                state.pendingWords.splice(index, 1);
                renderWordChips();
            };

            chip.appendChild(removeBtn);
            ui.wordChipContainer.appendChild(chip);
        });
    };

    const clearPendingImage = () => {
        state.pendingImageDataUrl = null;
        ui.singleWordImageInput.value = '';
        ui.pendingImagePreview.style.display = 'none';
    };

    const handleAddWord = () => {
        const word = ui.singleWordInput.value.trim();
        if (word.length > 1) {
            state.pendingWords.push({ word, picture: state.pendingImageDataUrl });
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
        ui.customListNameInput.value = '';
        ui.customListWordsInput.value = '';
        ui.singleWordInput.value = '';
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
        state.pendingWords = words.map(w => ({ word: w.Word, picture: w.Picture || null }));
        clearPendingImage();
        ui.customListNameInput.value = name;
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

        resetCustomWordForm();
        renderCustomListManager();
    };

    const fetchWords = async (sheetName) => {
        // --- Custom offline word lists take priority: no internet required ---
        const customLists = getCustomWordLists();
        if (customLists[sheetName]) {
            console.log(`Loading custom word list "${sheetName}" from local storage.`);
            return customLists[sheetName]
                .map(row => ({ word: row.Word?.toUpperCase(), picture: row.Picture }))
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
            const words = data.map(row => ({ word: row.Word?.toUpperCase(), picture: row.Picture })).filter(item => item.word && item.word.length > 1);

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
                    const words = localWords[sheetName].map(row => ({ word: row.Word?.toUpperCase(), picture: row.Picture })).filter(item => item.word && item.word.length > 1);

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
    
    const generateQuestionData = (wordData) => {
        const word = wordData.word;
        const missingIndex = Math.floor(Math.random() * (word.length - 2)) + 1;
        const correctLetter = word[missingIndex];
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const incorrectLetters = [];
        while (incorrectLetters.length < 2) {
            const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
            if (randomLetter !== correctLetter && !incorrectLetters.includes(randomLetter)) {
                incorrectLetters.push(randomLetter);
            }
        }
        return {
            word,
            missingIndex,
            correctLetter,
            options: shuffleArray([correctLetter, ...incorrectLetters]),
            picture: wordData.picture
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
        state.timerValue = state.timerMode === 'countdown' ? COUNTDOWN_TIME : 0;
        updateTimerDisplay();
    };

    // --- 5e. Camera & MediaPipe ---
    const initCamera = async () => {
        if (state.cameraInitialized) return;
        initializeAudio();

        const processVideo = async () => {
            // Ensure the video is playing before sending frames
            if (!ui.videoElement.paused && !ui.videoElement.ended) {
                await hands.send({ image: ui.videoElement });
            }
            requestAnimationFrame(processVideo);
        };

        try {
            // Simplified constraints for better mobile compatibility
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            ui.videoElement.srcObject = stream;

            ui.videoElement.onloadedmetadata = () => {
                ui.videoElement.play();
                state.videoAspectRatio = ui.videoElement.videoWidth / ui.videoElement.videoHeight;
                updateCanvasSize();
                state.cameraInitialized = true;
                showLevelSelectionScreen();
                processVideo(); // Start the processing loop
            };
        } catch (err) {
            console.error("Failed to acquire camera feed: ", err);
            alert(`Failed to acquire camera feed: ${err.name}: ${err.message}`);
        }
    };
    
    function onHandResults(results) {
        const { ctx, outputCanvas } = ui;
        ctx.save();
        ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        ctx.drawImage(results.image, 0, 0, outputCanvas.width, outputCanvas.height);

        state.multiHandLandmarks = results.multiHandLandmarks || [];

        if (state.multiHandLandmarks.length > 0) {
            ui.handStatus.textContent = "Yes";
            for (const landmarks of state.multiHandLandmarks) {
                window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
                window.drawLandmarks(ctx, landmarks, { color: '#FF0000', radius: 3 });
            }
            if (state.gameActive && !state.waitingForNextQuestion) {
                checkBubbleCollision();
            }
        } else {
            ui.handStatus.textContent = "No";
        }

        drawLetterBubbles();
        ctx.restore();
    }
    
    // --- 5f. Game Logic ---
    const loadQuestion = (question) => {
        state.currentWord = question.word;
        state.correctLetter = question.correctLetter;
        state.waitingForNextQuestion = false;
        
        displayWord(question.word, question.missingIndex);
    
        if (question.picture) {
            const wordContainerHeight = ui.wordContainer.offsetHeight;
            ui.imagePlaceholder.style.height = `${wordContainerHeight * 1.5}px`;
            ui.imagePlaceholder.style.width = `${ui.wordContainer.offsetWidth}px`;
            ui.imagePlaceholder.style.display = 'flex';
            
            ui.wordImage.style.display = 'none'; // Hide image until it's loaded
            ui.wordImage.src = question.picture;
            ui.wordImage.onload = () => {
                ui.wordImage.style.display = 'block';
            };
        } else {
            ui.imagePlaceholder.style.display = 'none';
            ui.wordImage.src = '';
        }
    
        createLetterBubbles(question.options);
        ui.questionCounter.textContent = `${state.currentQuestionIndex + 1}/${state.selectedQuestions.length}`;
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

    const handleBubblePop = (bubble) => {
        bubble.popped = true;
        state.waitingForNextQuestion = true;
        playSound(audio.popBubble);

        if (bubble.isCorrect) {
            state.score++;
            ui.score.textContent = state.score;
            showFeedback("Correct! 🎉", true);
            playSound(audio.correctAnswer);
        } else {
            showFeedback("Try again! 🤔", false);
            playSound(audio.wrongAnswer);
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

    const startGame = async () => {
        playSound(audio.buttonClick);
        if (!state.selectedLevelName) {
            alert("Please choose a level.");
            return;
        }

        ui.startScreenTitle.textContent = `Loading ${state.selectedLevelName}...`;
        ui.startScreenDescription.textContent = 'Fetching quiz words...';
        ui.startBtn.style.display = 'none';

        const words = await fetchWords(state.selectedLevelName);
        if (words.length === 0) {
            ui.startScreenTitle.textContent = 'Error!';
            ui.startScreenDescription.textContent = 'Could not load words for this level.';
            ui.startBtn.textContent = 'Back to Levels';
            ui.startBtn.onclick = showLevelSelectionScreen;
            ui.startBtn.style.display = 'block';
            return;
        }

        state.selectedQuestions = shuffleArray(words.map(generateQuestionData)).slice(0, 10);
        state.score = 0;
        state.currentQuestionIndex = 0;
        state.gameActive = true;
        ui.score.textContent = state.score;
        ui.mainMenuBtn.style.display = 'block';
        
        resetTimer();
        startTimer();

        showScreen(null); // Hide all major screens
        loadQuestion(state.selectedQuestions[0]);
    };

    const endGame = () => {
        state.gameActive = false;
        stopTimer();
        ui.finalScore.textContent = state.score;
        document.querySelector('#game-over p').innerHTML = `Your score: <span id="final-score">${state.score}</span>/${state.selectedQuestions.length}`;
        showScreen(ui.gameOverScreen);
        ui.mainMenuBtn.style.display = 'none';
    };
    
    const selectLevel = (levelName) => {
        state.selectedLevelName = levelName;
        ui.startScreenTitle.textContent = `✏️ PopAR Kit 2.0 - ${levelName} ✏️`;
        ui.startScreenDescription.textContent = 'Use your index finger to pop the correct letter bubble!';
        ui.startBtn.textContent = 'Start Quiz';
        ui.startBtn.onclick = startGame;
        ui.startBtn.style.display = 'block'; // Ensure the start button is visible
        showScreen(ui.startScreen);
    };
    
    const showLevelSelectionScreen = () => {
        state.gameActive = false;
        state.letterBubbles = [];
        ui.wordContainer.innerHTML = '';
        ui.imagePlaceholder.style.display = 'none';
        ui.wordImage.style.display = 'none';
        ui.feedback.textContent = '';
        ui.mainMenuBtn.style.display = 'none';
        ui.timerContainer.style.display = 'none';
        resetTimer();
        
        // Populate the preset level dropdown
        ui.levelSelect.innerHTML = '<option value="" disabled selected>Select a level...</option>';
        AVAILABLE_LEVELS.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            ui.levelSelect.appendChild(option);
        });

        // Populate custom word list buttons
        ui.customLevelButtonsContainer.innerHTML = '';
        const customListNames = Object.keys(getCustomWordLists());
        customListNames.forEach(level => {
            const button = document.createElement('button');
            button.className = 'btn';
            button.textContent = level;
            button.onclick = () => { playSound(audio.buttonClick); selectLevel(level); };
            ui.customLevelButtonsContainer.appendChild(button);
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
            if (level) selectLevel(level);
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
        
        ui.bgmVolumeSlider.addEventListener('input', (e) => audio.backgroundMusic.volume = e.target.value);
        ui.sfxVolumeSlider.addEventListener('input', (e) => setSfxVolume(e.target.value));
    };

    // --- 7. INITIALIZATION ---
    const main = () => {
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
            if (ui.levelSelectionScreen.style.display === 'flex') {
                ui.installButton.hidden = false;
            }
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
        });

        setupEventListeners();
        updateCanvasSize();
        setSfxVolume(ui.sfxVolumeSlider.value);
        showScreen(ui.cameraPermissionScreen);
    };

    main();
});
