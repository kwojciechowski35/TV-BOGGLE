const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const ip = require('ip');
const fs = require('fs');
const nspell = require('nspell');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- Configuration ---
const PORT = process.env.PORT || 3000;

// --- Game State (per-language namespace) ---
const games = {
    pl: {
        status: 'LOBBY',
        players: {},
        grid: [],
        timeLeft: 0,
        difficulty: 'EASY',
        gridSize: 4,
        gameDuration: 120,
        vipId: null,
        timer: null
    },
    szl: {
        status: 'LOBBY',
        players: {},
        grid: [],
        timeLeft: 0,
        difficulty: 'EASY',
        gridSize: 4,
        gameDuration: 120,
        vipId: null,
        timer: null
    }
};

// --- Dictionary Loading ---
// Polish dictionary
let spellPL = null;
const allWordsPL = [];

try {
    const fallbackData = fs.readFileSync(path.join(__dirname, 'data', 'slowa.txt'), 'utf8');
    fallbackData.split(/\r?\n/).forEach(line => {
        const w = line.split('/')[0].trim().toLowerCase();
        if (w.length >= 3 && w.length <= 10) {
            allWordsPL.push(w);
        }
    });

    if (!spellPL) {
        const wordSet = new Set(allWordsPL);
        spellPL = { correct: (word) => wordSet.has(word.toLowerCase()) };
    }
} catch (e) {
    console.error('❌ CRITICAL: No Polish dictionary found!');
    spellPL = { correct: () => true };
}

// Silesian dictionary
let spellSZL = null;
const allWordsSZL = []; // normalized (ASCII) forms for grid matching
let szlNormToOriginal = {}; // normalized -> original Silesian form (with diacritics)

try {
    // Load normalized (ASCII) word list - these match what the grid can produce
    const normData = fs.readFileSync(path.join(__dirname, 'data', 'slowa_slaskie_norm.txt'), 'utf8');
    normData.split(/\r?\n/).forEach(line => {
        const w = line.trim().toLowerCase();
        if (w.length >= 3 && w.length <= 10) {
            allWordsSZL.push(w);
        }
    });
    const wordSetSZL = new Set(allWordsSZL);
    spellSZL = { correct: (word) => wordSetSZL.has(word.toLowerCase()) };

    // Load mapping: normalized -> original forms (for display)
    try {
        szlNormToOriginal = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'data', 'slowa_slaskie_map.json'), 'utf8')
        );
    } catch (e2) {
        console.warn('⚠️ No Silesian mapping file, display will use ASCII forms');
    }

    console.log(`✅ Silesian dictionary loaded (${allWordsSZL.length} normalized words).`);
} catch (e) {
    console.error('❌ CRITICAL: No Silesian dictionary found!');
    spellSZL = { correct: () => true };
}

// Helper: get lang-specific dictionary
function getDicts(lang) {
    if (lang === 'szl') return { spell: spellSZL, allWords: allWordsSZL };
    return { spell: spellPL, allWords: allWordsPL };
}

// --- Grid Utils ---
function generateGrid(size, difficulty) {
    let dice = [];
    const totalCells = size * size;

    // Hard 4x4 Dice
    const hardDice4x4 = [
        'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
        'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
        'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
        'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ'
    ];

    if (difficulty === 'HARD' && size === 4) {
        dice = [...hardDice4x4];
    } else if (difficulty === 'HARD') {
        // Reuse 4x4 dice for larger grids to maintain "Hard" distribution
        for (let i = 0; i < totalCells; i++) {
            dice.push(hardDice4x4[i % hardDice4x4.length]);
        }
    } else {
        // EASY: Pool based
        const vowels = 'AAAAAEEEEEIIIIOOOOUUYY';
        const consonants = 'NNSSRRWWKKLLMMTTPPZZDDBB';
        const allChars = vowels + consonants;
        for (let i = 0; i < totalCells; i++) {
            let die = '';
            for (let j = 0; j < 6; j++) {
                die += allChars.charAt(Math.floor(Math.random() * allChars.length));
            }
            dice.push(die);
        }
    }

    // Shuffle
    for (let i = dice.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dice[i], dice[j]] = [dice[j], dice[i]];
    }

    // Roll
    const grid = [];
    for (let i = 0; i < size; i++) {
        const row = [];
        for (let j = 0; j < size; j++) {
            const die = dice[i * size + j];
            row.push(die.charAt(Math.floor(Math.random() * die.length)));
        }
        grid.push(row);
    }
    return grid;
}

function canFormWord(word, grid) {
    word = word.toUpperCase();
    const rows = grid.length;
    const cols = grid[0].length;
    const visited = Array(rows).fill(null).map(() => Array(cols).fill(false));

    function dfs(r, c, idx) {
        if (idx === word.length) return true;

        visited[r][c] = true;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;

                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
                    if (grid[nr][nc] === word[idx]) {
                        if (dfs(nr, nc, idx + 1)) return true;
                    }
                }
            }
        }

        visited[r][c] = false;
        return false;
    }

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (grid[i][j] === word[0]) {
                if (dfs(i, j, 1)) return true;
            }
        }
    }
    return false;
}

function findCheatWords(grid, count, excludeList, allWords) {
    const found = [];
    let attempts = 0;
    const maxAttempts = 5000;

    while (found.length < count && attempts < maxAttempts) {
        attempts++;
        const randWord = allWords[Math.floor(Math.random() * allWords.length)];

        if (excludeList.includes(randWord) || found.includes(randWord)) continue;

        if (canFormWord(randWord, grid)) {
            found.push(randWord);
        }
    }
    return found;
}

// --- Game Control ---
function startGame(lang) {
    const gs = games[lang];
    gs.status = 'COUNTDOWN';
    gs.grid = generateGrid(gs.gridSize, gs.difficulty);
    gs.timeLeft = gs.gameDuration;

    Object.values(gs.players).forEach(p => {
        p.words = [];
        p.score = 0;
    });

    const nsName = lang === 'szl' ? '/szl' : '/';
    const ns = lang === 'szl' ? io.of('/szl') : io;

    let count = 3;
    ns.emit('countdown', { count, grid: gs.grid, size: gs.gridSize });

    const countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
            ns.emit('countdown', { count });
        } else {
            clearInterval(countdownTimer);
            gs.status = 'GAME';
            ns.emit('game_start', {
                grid: gs.grid,
                size: gs.gridSize,
                duration: gs.timeLeft
            });
            ns.to('host').emit('player_list', Object.values(gs.players));
            runGameTimer(lang);
        }
    }, 1000);
}

function runGameTimer(lang) {
    const gs = games[lang];
    const ns = lang === 'szl' ? io.of('/szl') : io;
    if (gs.timer) clearInterval(gs.timer);
    gs.timer = setInterval(() => {
        gs.timeLeft--;
        if (gs.timeLeft <= 0) {
            clearInterval(gs.timer);
            gs.timeLeft = 0;
            endGame(lang);
        } else {
            ns.emit('time_update', gs.timeLeft);
        }
    }, 1000);
}

function endGame(lang) {
    const gs = games[lang];
    const ns = lang === 'szl' ? io.of('/szl') : io;
    gs.status = 'RESULTS';
    const results = calculateFinalScores(lang);
    ns.emit('game_end', { results });
}

function resetToLobby(lang) {
    const gs = games[lang];
    const ns = lang === 'szl' ? io.of('/szl') : io;
    gs.status = 'LOBBY';
    if (gs.timer) clearInterval(gs.timer);
    Object.values(gs.players).forEach(p => {
        p.words = [];
        p.score = 0;
    });
    ns.emit('back_to_lobby');
    ns.emit('player_list', Object.values(gs.players));
}

function calculateFinalScores(lang) {
    const gs = games[lang];
    const wordCounts = {};
    Object.values(gs.players).forEach(p => {
        p.words.forEach(w => {
            wordCounts[w] = (wordCounts[w] || 0) + 1;
        });
    });

    const results = [];
    Object.values(gs.players).forEach(p => {
        let finalScore = 0;
        const wordDetails = [];
        p.words.forEach(w => {
            let pts = Math.max(1, w.length - 2);
            const isUnique = wordCounts[w] === 1;
            if (isUnique) pts *= 2;
            finalScore += pts;
            // Show diacritics for Silesian
            let displayW = w;
            if (lang === 'szl' && szlNormToOriginal[w]) {
                displayW = szlNormToOriginal[w][0];
            }
            wordDetails.push({ word: displayW, points: pts, unique: isUnique });
        });
        p.score = finalScore;
        results.push({ id: p.id, name: p.name, score: finalScore, words: wordDetails });
    });
    return results;
}

// --- Routes ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => res.redirect('/host'));

// Polish routes
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host', 'index.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller', 'index.html')));
app.get('/single', (req, res) => res.sendFile(path.join(__dirname, 'public', 'single', 'index.html')));

// Silesian routes
app.get('/host-szl', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host-szl', 'index.html')));
app.get('/controller-szl', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller-szl', 'index.html')));
app.get('/single-szl', (req, res) => res.sendFile(path.join(__dirname, 'public', 'single-szl', 'index.html')));

app.get('/api/config', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const hostUrl = protocol + '://' + req.get('host');
    const lang = req.query.lang || 'pl';
    const controllerPath = lang === 'szl' ? '/controller-szl' : '/controller';
    const url = `${hostUrl}${controllerPath}`;
    try {
        const qr = await QRCode.toDataURL(url);
        res.json({ ip: hostUrl, port: PORT, qr, url });
    } catch (e) { res.status(500).json({ error: 'QR Error' }); }
});

// --- Socket.io: Polish namespace (default) ---
function setupNamespace(ns, lang) {
    const gs = games[lang];
    const { spell, allWords } = getDicts(lang);

    ns.on('connection', (socket) => {
        const assignVipIfNeeded = () => {
            if (!gs.vipId && Object.keys(gs.players).length > 0) {
                gs.vipId = Object.keys(gs.players)[0];
            }
            ns.emit('vip_update', gs.vipId);
        };

        socket.on('join_host', () => {
            socket.join('host');
            socket.emit('player_list', Object.values(gs.players));
        });

        // VIP ONLY COMMANDS
        socket.on('set_difficulty', (level) => {
            if (socket.id !== gs.vipId) return;
            if (['EASY', 'HARD'].includes(level)) {
                gs.difficulty = level;
                ns.emit('config_updated', { difficulty: gs.difficulty });
            }
        });

        socket.on('set_grid_size', (size) => {
            if (socket.id !== gs.vipId) return;
            const s = parseInt(size);
            if ([4, 5, 6].includes(s)) {
                gs.gridSize = s;
                ns.emit('config_updated', { gridSize: gs.gridSize });
            }
        });

        socket.on('set_duration', (sec) => {
            if (socket.id !== gs.vipId) return;
            const d = parseInt(sec);
            if ([60, 120, 180, 240, 300].includes(d)) {
                gs.gameDuration = d;
                ns.emit('config_updated', { gameDuration: gs.gameDuration });
            }
        });

        socket.on('join_player', (nickname) => {
            const defaultName = lang === 'szl' ? 'Groczek' : 'Gracz';
            const safeName = String(nickname).trim().substring(0, 12) || defaultName;
            gs.players[socket.id] = { id: socket.id, name: safeName, score: 0, words: [] };

            assignVipIfNeeded();

            ns.emit('player_list', Object.values(gs.players));
            socket.emit('game_status', {
                status: gs.status,
                difficulty: gs.difficulty,
                gridSize: gs.gridSize,
                gameDuration: gs.gameDuration,
                playerCount: Object.keys(gs.players).length,
                vipId: gs.vipId
            });

            if (gs.status === 'GAME') {
                socket.emit('game_start', {
                    grid: gs.grid,
                    size: gs.gridSize,
                    duration: gs.timeLeft
                });
            }
        });

        socket.on('submit_word', (word) => {
            const player = gs.players[socket.id];
            if (!player || gs.status !== 'GAME') return;

            const raw = String(word).trim().toLowerCase();

            // CHEAT: All letters selected
            const totalCells = gs.gridSize * gs.gridSize;
            if (raw.length === totalCells) {
                const cheats = findCheatWords(gs.grid, 4, player.words, allWords);

                if (cheats.length > 0) {
                    cheats.forEach(w => {
                        if (!player.words.includes(w)) {
                            player.words.push(w);
                            // Show original form with diacritics for Silesian
                            let displayW = w;
                            if (lang === 'szl' && szlNormToOriginal[w]) {
                                displayW = szlNormToOriginal[w][0];
                            }
                            const estPoints = Math.max(1, w.length - 2);
                            socket.emit('word_result', { word: displayW, valid: true, points: estPoints });
                            ns.to('host').emit('player_word_count', {
                                playerId: socket.id,
                                count: player.words.length,
                                lastWord: displayW
                            });
                        }
                    });
                } else {
                    const noWordsMsg = lang === 'szl' ? 'Niy ma słów' : 'Brak słów';
                    socket.emit('word_result', { word: '???', valid: false, reason: noWordsMsg });
                }
                return;
            }

            if (raw.length < 3) {
                const shortMsg = lang === 'szl' ? 'Za krótkie' : 'Za krótkie';
                socket.emit('word_result', { word: raw, valid: false, reason: shortMsg });
                return;
            }
            if (player.words.includes(raw)) {
                const repeatMsg = lang === 'szl' ? 'Już mosz!' : 'Już masz!';
                socket.emit('word_result', { word: raw, valid: false, reason: repeatMsg, code: 'REPEATED' });
                return;
            }
            if (!spell.correct(raw)) {
                const unknownMsg = lang === 'szl' ? 'Niy znōm tego słowa' : 'Nieznane słowo';
                socket.emit('word_result', { word: raw, valid: false, reason: unknownMsg });
                return;
            }

            // For Silesian: show original form with diacritics if available
            let displayWord = raw;
            if (lang === 'szl' && szlNormToOriginal[raw]) {
                displayWord = szlNormToOriginal[raw][0]; // first original form
            }

            player.words.push(raw);
            const estPoints = Math.max(1, raw.length - 2);
            socket.emit('word_result', { word: displayWord, valid: true, points: estPoints });
            ns.to('host').emit('player_word_count', {
                playerId: socket.id,
                count: player.words.length,
                lastWord: displayWord
            });
        });

        socket.on('start_game_request', () => {
            if (socket.id === gs.vipId && gs.status !== 'GAME') startGame(lang);
        });

        socket.on('new_round', () => {
            if (socket.id === gs.vipId) resetToLobby(lang);
        });

        socket.on('disconnect', () => {
            if (gs.players[socket.id]) {
                delete gs.players[socket.id];
                if (socket.id === gs.vipId) {
                    gs.vipId = null;
                    assignVipIfNeeded();
                }
                ns.emit('player_list', Object.values(gs.players));
            }
        });
    });
}

// Setup Polish (default namespace)
setupNamespace(io, 'pl');

// Setup Silesian (namespaced)
const szlNamespace = io.of('/szl');
setupNamespace(szlNamespace, 'szl');

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`  🇵🇱 Polski:  http://localhost:${PORT}/host`);
    console.log(`  🏔️  Ślōnski: http://localhost:${PORT}/host-szl`);
});
