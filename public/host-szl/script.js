const socket = io('/szl');

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
// --- UI Elements ---
const screens = {
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    review: document.getElementById('review-screen'),
    results: document.getElementById('results-screen')
};
const qrcodeContainer = document.getElementById('qrcode');
const joinUrlText = document.getElementById('join-url');
const playersList = document.getElementById('players-ul');
const playerCount = document.getElementById('player-count');
const gridContainer = document.getElementById('grid-container');
const timerElement = document.getElementById('timer');
const scoreboard = document.getElementById('scoreboard');
const finalScores = document.getElementById('final-scores');
const difficultyLabel = document.getElementById('difficulty-label');
const reviewContainer = document.getElementById('review-container');

let timerInterval = null;

// --- Register as Host ---
socket.emit('join_host');

// --- Auto Fullscreen ---
document.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
    }
}, { once: true });

// --- QR Code ---
fetch('/api/config?lang=szl')
    .then(r => r.json())
    .then(data => {
        new QRCode(qrcodeContainer, {
            text: data.url,
            width: 240,
            height: 240,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });
        joinUrlText.textContent = data.url;
    });

// --- Socket Events ---
socket.on('player_list', (players) => {
    renderPlayerList(players);
    renderScoreboard(players);
});

socket.on('config_updated', (data) => {
    if (data.difficulty) {
        difficultyLabel.textContent = data.difficulty === 'EASY' ? 'LEKO 🌸' : 'CIYNŻKO 🔥';
    }
    // Size and Duration are visual only during game/countdown
});

// For initial sync if needed (though host usually gets config_updated)
socket.on('difficulty_changed', (level) => {
    difficultyLabel.textContent = level === 'EASY' ? 'LEKO 🌸' : 'CIYNŻKO 🔥';
});

socket.on('countdown', (data) => {
    stopLobbyMusic();
    showScreen('game');
    if (data.grid) renderGrid(data.grid);
    showCountdown(data.count);
    playTick();
});

socket.on('game_start', (data) => {
    stopLobbyMusic();
    showScreen('game');
    renderGrid(data.grid);
    showCountdown(0); // "JAZDA!"
    setTimeout(() => hideCountdown(), 800);
    startTimer(data.duration);
});

socket.on('time_update', (time) => {
    renderTime(time);
    if(time <= 10 && time > 0) playTick();
});

socket.on('player_word_count', (data) => {
    const countEl = document.getElementById(`sb-count-${data.playerId}`);
    const lastEl = document.getElementById(`sb-last-${data.playerId}`);

    if (countEl) {
        countEl.textContent = data.count;
        // Animation for score
        countEl.style.transform = 'scale(1.4)';
        setTimeout(() => countEl.style.transform = 'scale(1)', 250);
    }
});

socket.on('game_end', (data) => {
    stopLobbyMusic();
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    showScreen('review');
    runWordReview(data.results);
});

socket.on('back_to_lobby', () => {
    startLobbyMusic();
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    showScreen('lobby');
});

// Start lobby music on first interaction (browser policy)
document.addEventListener('click', () => {
    if(screens.lobby.classList.contains('active')) {
        startLobbyMusic();
    }
}, { once: true });

// --- Helpers ---
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function showCountdown(n) {
    let overlay = document.getElementById('countdown-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'countdown-overlay';
        document.body.appendChild(overlay);
    }
    overlay.textContent = n > 0 ? n : 'JAZDA!';
    overlay.className = 'countdown-active';
    overlay.style.display = 'flex';
}

function hideCountdown() {
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) {
        overlay.classList.add('countdown-fade');
        setTimeout(() => { overlay.remove(); }, 500);
    }
}

function renderPlayerList(players) {
    playersList.innerHTML = '';
    playerCount.textContent = players.length;
    players.forEach(p => {
        const li = document.createElement('li');
        li.id = `p-${p.id}`;
        li.innerHTML = `
            <div class="player-avatar"></div>
            <div class="player-info">
                <span class="player-name">${p.name}</span>
                <span class="word-count">${p.words ? p.words.length : 0} słów</span>
            </div>
        `;
        playersList.appendChild(li);
    });
}

function renderScoreboard(players) {
    scoreboard.innerHTML = '';
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'sb-player';
        div.innerHTML = `
            <span class="sb-name">${p.name}</span>
            <div class="sb-score-row">
                <span class="sb-count" id="sb-count-${p.id}">${p.words ? p.words.length : 0}</span>
                <span class="sb-label">słów</span>
            </div>
            <div class="sb-last" id="sb-last-${p.id}"></div>
        `;
        scoreboard.appendChild(div);
    });
}

function renderGrid(grid) {
    gridContainer.innerHTML = '';
    const size = grid.length;

    // Dynamic sizing for Host (TV)
    let cellSize = '18vh';
    let gapSize = '1.5vh';
    let fontSize = '10vh';

    if (size === 5) {
        cellSize = '14vh';
        gapSize = '1.2vh';
        fontSize = '8vh';
    } else if (size === 6) {
        cellSize = '11.5vh';
        gapSize = '1.0vh';
        fontSize = '6.5vh';
    }

    gridContainer.style.gridTemplateColumns = `repeat(${size}, ${cellSize})`;
    gridContainer.style.gridTemplateRows = `repeat(${size}, ${cellSize})`;
    gridContainer.style.gap = gapSize;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.textContent = grid[r][c];
            cell.style.fontSize = fontSize;
            gridContainer.appendChild(cell);
        }
    }
}

function startTimer(duration) {
    if (timerInterval) clearInterval(timerInterval);
    let time = duration;
    renderTime(time);
    timerInterval = setInterval(() => {
        time--;
        renderTime(time);
        if (time <= 0) { clearInterval(timerInterval); timerInterval = null; }
    }, 1000);
}

function renderTime(time) {
    const min = Math.floor(time / 60).toString().padStart(2, '0');
    const sec = (time % 60).toString().padStart(2, '0');
    timerElement.textContent = `${min}:${sec}`;
}

// ... Review ...
async function runWordReview(results) {
    reviewContainer.innerHTML = '';

    if (!results || results.length === 0) {
        reviewContainer.innerHTML = '<p style="color:#888;font-size:1.5rem;">Niy ma wyników</p>';
        setTimeout(() => { showScreen('results'); renderFinalTable(results || []); }, 2000);
        return;
    }

    const sorted = [...results].sort(() => Math.random() - 0.5);

    const reviewBoard = document.createElement('div');
    reviewBoard.className = 'review-board';

    const playerCols = [];

    sorted.forEach(p => {
        const col = document.createElement('div');
        col.className = 'review-col';
        col.innerHTML = `
            <div class="review-player-header">
                <span class="review-player-name">${p.name}</span>
                <span class="review-player-score" id="rev-score-${p.id}">0</span>
            </div>
            <div class="review-words" id="rev-words-${p.id}"></div>
        `;
        reviewBoard.appendChild(col);
        playerCols.push({ player: p, col });
    });

    reviewContainer.appendChild(reviewBoard);

    const sharedTitle = document.createElement('div');
    sharedTitle.className = 'review-phase-title';
    sharedTitle.textContent = '⚔️ Powtorzajōnce sie słowa';
    reviewContainer.insertBefore(sharedTitle, reviewBoard);

    await delay(800);

    const allSharedWords = new Set();
    sorted.forEach(p => {
        p.words.filter(w => !w.unique).forEach(w => allSharedWords.add(w.word));
    });

    for (const wordStr of allSharedWords) {
        const promises = [];
        for (const { player } of playerCols) {
            const wordData = player.words.find(w => w.word === wordStr && !w.unique);
            if (wordData) {
                promises.push(addWordToReview(player, wordData, 'shared'));
            }
        }
        await Promise.all(promises);
        await delay(400);
    }

    await delay(600);

    sharedTitle.textContent = '⭐ Unikatowe słowa (×2 punkty!)';
    sharedTitle.classList.add('review-phase-unique');
    await delay(800);

    const uniqueQueues = playerCols.map(({ player }) => ({
        player,
        words: player.words.filter(w => w.unique)
    }));

    let hasMore = true;
    let wordIndex = 0;
    while (hasMore) {
        hasMore = false;
        for (const q of uniqueQueues) {
            if (wordIndex < q.words.length) {
                await addWordToReview(q.player, q.words[wordIndex], 'unique');
                await delay(500);
                hasMore = true;
            }
        }
        wordIndex++;
    }

    await delay(1500);

    showScreen('results');
    renderFinalTable(sorted);
}

async function addWordToReview(player, wordData, type) {
    const container = document.getElementById(`rev-words-${player.id}`);
    const scoreEl = document.getElementById(`rev-score-${player.id}`);

    // Show only ONE word at a time
    container.innerHTML = '';

    const wordEl = document.createElement('div');
    wordEl.className = `review-word ${type}`;

    const pts = wordData.points;
    const label = type === 'unique' ? `×2` : '';

    wordEl.innerHTML = `
        <span class="rw-text">${wordData.word.toUpperCase()}</span>
        <span class="rw-pts ${type === 'unique' ? 'rw-unique-pts' : ''}">+${pts} ${label}</span>
    `;

    container.appendChild(wordEl);

    await delay(50);
    wordEl.classList.add('visible');

    const currentScore = parseInt(scoreEl.textContent) || 0;
    animateNumber(scoreEl, currentScore, currentScore + pts, 300);

    scoreEl.classList.add('score-flash');
    setTimeout(() => scoreEl.classList.remove('score-flash'), 400);

    await delay(250);
}

function animateNumber(el, from, to, duration) {
    const start = performance.now();
    const step = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(from + (to - from) * eased);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderFinalTable(results) {
    finalScores.innerHTML = '';
    if (!results || results.length === 0) {
        finalScores.innerHTML = '<p style="color:#888;font-size:1.5rem;">Niy ma wyników</p>';
        return;
    }

    const sorted = results.sort((a, b) => b.score - a.score);

    const table = document.createElement('table');
    table.className = 'results-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>#</th>
                <th>Groczek</th>
                <th>Słowa</th>
                <th>Unikatowe (×2)</th>
                <th style="text-align:right">Wynik</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    sorted.forEach((p, i) => {
        const uniqueCount = p.words.filter(w => w.unique).length;
        const tr = document.createElement('tr');
        if (i === 0) tr.classList.add('winner');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td class="player-name-cell">${p.name}${i === 0 ? ' 👑' : ''}</td>
            <td>${p.words.length}</td>
            <td class="unique-cell">${uniqueCount}</td>
            <td class="score-cell">${p.score}</td>
        `;
        tbody.appendChild(tr);
    });

    finalScores.appendChild(table);
}
