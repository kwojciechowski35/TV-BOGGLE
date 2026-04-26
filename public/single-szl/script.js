// ======== MUSIC & SOUND SYNTHESIS ========
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTick() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

let lobbyMusicInterval;
const pentatonic = [329.63, 392.00, 440.00, 523.25, 659.25, 783.99]; // E Minor Pentatonic
function playLobbyNote() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 3);
}

function startLobbyMusic() {
    if(lobbyMusicInterval) clearInterval(lobbyMusicInterval);
    lobbyMusicInterval = setInterval(playLobbyNote, 800);
}

function stopLobbyMusic() {
    clearInterval(lobbyMusicInterval);
}

const socket = io();

// UI Elements
const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen'),
    results: document.getElementById('results-screen')
};

const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const gridContainer = document.getElementById('grid-container');
const currentWordEl = document.getElementById('current-word');
const feedbackToast = document.getElementById('feedback-toast');
const timerText = document.getElementById('timer-text');
const singleScoreEl = document.getElementById('single-score');
const finalSingleScoreEl = document.getElementById('final-single-score');

// Settings Buttons
const startBtn = document.getElementById('start-btn');
const newRoundBtn = document.getElementById('new-round-btn');
const diffEasy = document.getElementById('diff-easy');
const diffHard = document.getElementById('diff-hard');
const size4 = document.getElementById('size-4');
const size5 = document.getElementById('size-5');
const size6 = document.getElementById('size-6');
const time60 = document.getElementById('time-60');
const time120 = document.getElementById('time-120');
const time180 = document.getElementById('time-180');

// App State
let myId = null;
let selectedCells = [];
let savedGrid = []; // Flat array
let gridSize = 4;
let gameDuration = 120;
let isDragging = false;
let cooldown = false;
let cellElements = [];
let myScore = 0;

// ======== INIT ========
socket.on('connect', () => {
    myId = socket.id;
});

// ======== JOIN ========
joinBtn.addEventListener('click', () => {
    const name = nicknameInput.value.trim() || 'Gracz';
    socket.emit('join_player', name);
    showScreen('lobby');
    startLobbyMusic();
});

nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

// ======== SETTINGS ========
if (diffEasy) diffEasy.addEventListener('click', () => socket.emit('set_difficulty', 'EASY'));
if (diffHard) diffHard.addEventListener('click', () => socket.emit('set_difficulty', 'HARD'));
if (size4) size4.addEventListener('click', () => socket.emit('set_grid_size', 4));
if (size5) size5.addEventListener('click', () => socket.emit('set_grid_size', 5));
if (size6) size6.addEventListener('click', () => socket.emit('set_grid_size', 6));
if (time60) time60.addEventListener('click', () => socket.emit('set_duration', 60));
if (time120) time120.addEventListener('click', () => socket.emit('set_duration', 120));
if (time180) time180.addEventListener('click', () => socket.emit('set_duration', 180));

startBtn.addEventListener('click', () => {
    socket.emit('start_game_request');
});
newRoundBtn.addEventListener('click', () => {
    socket.emit('new_round');
    startLobbyMusic();
});

socket.on('config_updated', (data) => {
    if (data.difficulty) updateDiffVisuals(data.difficulty);
    if (data.gridSize) updateSizeVisuals(data.gridSize);
    if (data.gameDuration) updateTimeVisuals(data.gameDuration);
});

socket.on('game_status', (data) => {
    if (data.difficulty) updateDiffVisuals(data.difficulty);
    if (data.gridSize) updateSizeVisuals(data.gridSize);
    if (data.gameDuration) updateTimeVisuals(data.gameDuration);
    if (data.status === 'RESULTS') {
        stopLobbyMusic();
        showScreen('results');
    }
});

// ======== GAME FLOW ========
socket.on('countdown', (data) => {
    stopLobbyMusic();
    showScreen('game');
    myScore = 0;
    if(singleScoreEl) singleScoreEl.textContent = myScore;
    if (data.grid) {
        savedGrid = data.grid.flat();
        gridSize = data.size || Math.sqrt(savedGrid.length);
        renderGrid(data.grid);
    }
    showCountdownOverlay(data.count);
    playTick();
});

socket.on('game_start', (data) => {
    stopLobbyMusic();
    showScreen('game');
    gameDuration = data.duration;
    savedGrid = data.grid.flat();
    gridSize = data.size || Math.sqrt(savedGrid.length);
    renderGrid(data.grid);
    updateTimer(data.duration);
    showCountdownOverlay(0);
    setTimeout(() => hideCountdownOverlay(), 800);
});

socket.on('time_update', (time) => {
    updateTimer(time);
    if (time <= 10 && time > 0) {
        playTick();
    }
});

socket.on('word_result', (data) => {
    showFeedback(data.word, data.valid, data.points, data.reason, data.code);
    if(data.valid) {
        myScore += data.points;
        if(singleScoreEl) singleScoreEl.textContent = myScore;
    }
    clearSelection();
    cooldown = true;
    setTimeout(() => { cooldown = false; }, 350);
});

socket.on('game_end', () => {
    showScreen('results');
    if(finalSingleScoreEl) finalSingleScoreEl.textContent = myScore;
});

socket.on('back_to_lobby', () => {
    showScreen('lobby');
});

// ======== VISUAL UPDATES ========
function updateDiffVisuals(diff) {
    if (diffEasy) diffEasy.classList.toggle('active', diff === 'EASY');
    if (diffHard) diffHard.classList.toggle('active', diff === 'HARD');
}

function updateSizeVisuals(size) {
    if (size4) size4.classList.toggle('active', size === 4);
    if (size5) size5.classList.toggle('active', size === 5);
    if (size6) size6.classList.toggle('active', size === 6);
}

function updateTimeVisuals(dur) {
    if (time60) time60.classList.toggle('active', dur === 60);
    if (time120) time120.classList.toggle('active', dur === 120);
    if (time180) time180.classList.toggle('active', dur === 180);
}

// ======== GRID RENDER & INTERACTION ========
function renderGrid(grid) {
    gridContainer.innerHTML = '';
    cellElements = [];
    const size = grid.length;
    gridSize = size;
    gridContainer.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    let fs = '1.8rem';
    if (size === 5) fs = '1.4rem';
    if (size === 6) fs = '1.1rem';

    const flatGrid = grid.flat();
    flatGrid.forEach((char, index) => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.style.fontSize = fs;
        cell.dataset.index = index;
        cell.textContent = char;

        cell.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(index); });
        cell.addEventListener('mouseenter', () => continueDrag(index));
        cell.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag(index); }, { passive: false });

        gridContainer.appendChild(cell);
        cellElements.push(cell);
    });
}

function startDrag(index) {
    if (cooldown) return;
    isDragging = true;
    selectedCells = [];
    selectCell(index);
}

function continueDrag(index) {
    if (!isDragging || cooldown) return;
    if (selectedCells.includes(index)) {
        if (selectedCells.length > 1 && selectedCells[selectedCells.length - 2] === index) deselectLast();
        return;
    }
    const lastIndex = selectedCells[selectedCells.length - 1];
    if (isAdjacent(lastIndex, index)) selectCell(index);
}

function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    const totalCells = gridSize * gridSize;
    if (selectedCells.length === totalCells) {
        const word = selectedCells.map(idx => savedGrid[idx]).join('');
        socket.emit('submit_word', word);
        clearSelection();
        return;
    }
    if (selectedCells.length >= 3) {
        const word = selectedCells.map(idx => savedGrid[idx]).join('');
        socket.emit('submit_word', word);
    } else {
        clearSelection();
    }
}

function isAdjacent(idx1, idx2) {
    if (idx1 === undefined || idx2 === undefined) return false;
    const r1 = Math.floor(idx1 / gridSize), c1 = idx1 % gridSize;
    const r2 = Math.floor(idx2 / gridSize), c2 = idx2 % gridSize;
    const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc > 0);
}

function selectCell(index) {
    selectedCells.push(index);
    updateVisuals();
}

function deselectLast() {
    selectedCells.pop();
    updateVisuals();
}

function clearSelection() {
    selectedCells = [];
    updateVisuals();
}

function updateVisuals() {
    cellElements.forEach((cell, idx) => cell.classList.toggle('selected', selectedCells.includes(idx)));
    if(currentWordEl) currentWordEl.textContent = selectedCells.map(idx => savedGrid[idx]).join('');
}

document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);
document.addEventListener('touchcancel', endDrag);

gridContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDragging) return;
    const touch = e.touches[0];
    const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    if (elemBelow && elemBelow.classList.contains('grid-cell')) {
        const index = parseInt(elemBelow.dataset.index, 10);
        continueDrag(index);
    }
}, { passive: false });

// ======== HELPERS ========
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function updateTimer(time) {
    const min = Math.floor(time / 60).toString().padStart(2, '0');
    const sec = (time % 60).toString().padStart(2, '0');
    if(timerText) timerText.textContent = `${min}:${sec}`;
}

function showFeedback(word, valid, points, reason, code) {
    if(!feedbackToast) return;
    if (valid) {
        feedbackToast.innerHTML = `<span>+${points}</span> ${word.toUpperCase()}`;
        feedbackToast.className = 'valid';
    } else {
        feedbackToast.textContent = reason || 'Nietrafione';
        feedbackToast.className = code === 'REPEATED' ? 'repeated' : 'invalid';
    }
    feedbackToast.style.opacity = 1;
    setTimeout(() => { if(feedbackToast) feedbackToast.style.opacity = 0; }, 2000);
}

function showCountdownOverlay(n) {
    let overlay = document.getElementById('countdown-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'countdown-overlay';
        document.body.appendChild(overlay);
    }
    overlay.textContent = n > 0 ? n : 'GO!';
    overlay.className = 'countdown-active';
    overlay.style.display = 'flex';
}

function hideCountdownOverlay() {
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) {
        overlay.classList.add('countdown-fade');
        setTimeout(() => { document.body.removeChild(overlay); }, 500);
    }
}
