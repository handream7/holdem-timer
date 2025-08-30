// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyABiutWTHs7ZQntghKODX8UDxo1z-DrfUE",
    authDomain: "holdemtimer-7087b.firebaseapp.com",
    projectId: "holdemtimer-7087b",
    storageBucket: "holdemtimer-7087b.firebasestorage.app",
    messagingSenderId: "636076250331",
    appId: "1:636076250331:web:dda5f604639166165e28fe",
    measurementId: "G-YX3PE5CYQK"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const gamesCollection = db.collection('games');

// 전역 변수
let currentGameId = null;
let timerInterval = null;
let unsubscribe = null;
let isSeeking = false;
let lastPlayedLevelIndex = -1; // 마지막으로 소리를 재생한 레벨 인덱스
let isSoundOn = true; // 소리 켜짐/꺼짐 상태

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    currentGameId = params.get('game');
    if (currentGameId) {
        joinGame(currentGameId);
    } else {
        showPage('landing-page');
        loadGameList();
    }
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('create-game-btn').addEventListener('click', () => { showPage('settings-page'); populateBlindSettings(); });
    document.getElementById('play-button').addEventListener('click', createNewGame);
    document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
    document.getElementById('next-level-btn').addEventListener('click', () => changeLevel(1));
    document.getElementById('prev-level-btn').addEventListener('click', () => changeLevel(-1));
    document.getElementById('apply-all-durations-btn').addEventListener('click', applyAllDurations);
    document.getElementById('go-home-btn').addEventListener('click', goHome);
    document.getElementById('time-plus-btn').addEventListener('click', () => adjustTime(10));
    document.getElementById('time-minus-btn').addEventListener('click', () => adjustTime(-10));
    document.getElementById('heads-up-btn').addEventListener('click', setHeadsUp);
    document.getElementById('sound-toggle-btn').addEventListener('click', toggleSound);
    
    // 업데이트 버튼 이벤트 리스너 추가
    document.getElementById('update-data-btn').addEventListener('click', handleUpdateData);

    const timeSlider = document.getElementById('time-slider');
    timeSlider.addEventListener('mousedown', () => { isSeeking = true; });
    timeSlider.addEventListener('touchstart', () => { isSeeking = true; });
    timeSlider.addEventListener('input', () => { if (isSeeking) seekTime(timeSlider.value, false); });
    timeSlider.addEventListener('change', () => { seekTime(timeSlider.value, true); isSeeking = false; });
    timeSlider.addEventListener('mouseup', () => { if (isSeeking) isSeeking = false; });
    timeSlider.addEventListener('touchend', () => { if (isSeeking) isSeeking = false; });
}

function handleUpdateData() {
    console.log("Update button clicked!");
    // TODO: 추후 이 곳에 외부 API로부터 데이터를 가져오는 로직을 추가합니다.
    alert("데이터 업데이트 기능은 현재 개발 중입니다.");
}

function toggleSound() {
    isSoundOn = !isSoundOn;
    const soundBtn = document.getElementById('sound-toggle-btn');
    soundBtn.textContent = isSoundOn ? '소리 끄기' : '소리 켜기';
    const levelupSound = document.getElementById('levelup-sound');
    if (isSoundOn && levelupSound.paused) {
        levelupSound.play().then(() => levelupSound.pause()).catch(()=>{});
    }
}

function playSound(type) {
    if (!isSoundOn) return;
    const sound = (type === 'break') 
        ? document.getElementById('break-sound')
        : document.getElementById('levelup-sound');
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(error => console.error("오디오 재생 오류:", error));
    }
}

function updateTimerUI(gameData) {
    if (!gameData || !gameData.startTime) return;
    if (timerInterval) clearInterval(timerInterval);
    const update = () => {
        const schedule = buildSchedule(gameData.settings);
        const { currentLevelIndex, timeLeftInLevel, elapsedSeconds } = calculateCurrentState(gameData, schedule);
        if (currentLevelIndex !== lastPlayedLevelIndex) {
            if (lastPlayedLevelIndex !== -1) {
                const newLevel = schedule[currentLevelIndex];
                if (newLevel.isBreak) {
                    playSound('break');
                } else {
                    playSound('levelup');
                }
            }
            lastPlayedLevelIndex = currentLevelIndex;
        }
        displayTime(timeLeftInLevel, document.getElementById('timer-label'));
        displayLevelInfo(schedule, currentLevelIndex);
        displayTime(elapsedSeconds, document.getElementById('total-time-info'), true);
        calculateAndDisplayChipInfo(gameData, schedule, currentLevelIndex);
        calculateAndDisplayNextBreak(elapsedSeconds, schedule, currentLevelIndex);
        const players = gameData.players || 0;
        const totalPlayers = gameData.totalPlayers || 0;
        document.getElementById('players-info').textContent = `${players}/${totalPlayers}`;
        document.getElementById('play-pause-btn').textContent = gameData.isPaused ? '>' : '||';
        if (!isSeeking) {
            const currentLevelDuration = schedule[currentLevelIndex].duration * 60;
            const progress = currentLevelDuration > 0 ? 1 - (timeLeftInLevel / currentLevelDuration) : 0;
            document.getElementById('time-slider').value = progress;
        }
    };
    update();
    if (!gameData.isPaused) {
       timerInterval = setInterval(update, 1000);
    }
}

function goHome() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    window.location.href = window.location.pathname;
}

function joinGame(gameId) {
    showPage('timer-page');
    lastPlayedLevelIndex = -1;
    if (unsubscribe) unsubscribe();
    unsubscribe = gamesCollection.doc(gameId).onSnapshot(doc => {
        if (doc.exists) {
            updateTimerUI(doc.data());
        } else {
            alert("존재하지 않는 게임입니다.");
            window.location.href = window.location.pathname;
        }
    });
    startFetchingRealtimeData();
}

function startFetchingRealtimeData() {
    try {
        const data = generateMockData(); 
        updateRealtimeDataTable(data);

    } catch (error) {
        console.error("데이터 로딩 중 오류 발생:", error);
    }
}
function updateRealtimeDataTable(data) {
    const tableBody = document.getElementById('realtime-data-tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    data.forEach(player => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.rank}</td>
            <td>${player.name}</td>
            <td>${player.buyIn}</td>
            <td>${player.rebuy1}</td>
            <td>${player.rebuy2}</td>
            <td><button class="out-btn" data-player-rank="${player.rank}">Out</button></td>
        `;
        tableBody.appendChild(row);
    });
    tableBody.querySelectorAll('.out-btn').forEach(button => {
        button.addEventListener('click', handleOutButtonClick);
    });
}

function handleOutButtonClick(event) {
    const playerRank = event.target.dataset.playerRank;
    console.log(`Player ${playerRank} is Out!`);
    const button = event.target;
    button.disabled = true;
    button.textContent = 'Outed';
    button.closest('tr').style.opacity = '0.5';
    // When using a real backend, you would send an update request here.
}

function generateMockData() {
    const mockPlayers = [
        { rank: 1, name: `Player_1`, buyIn: '1', rebuy1: '1', rebuy2: '0'},
        { rank: 2, name: `Player_2`, buyIn: '1', rebuy1: '0', rebuy2: '0'},
        { rank: 3, name: `Player_3`, buyIn: '1', rebuy1: '1', rebuy2: '1'},
        { rank: 4, name: `Player_4`, buyIn: '1', rebuy1: '0', rebuy2: '0'},
        { rank: 5, name: `Player_5`, buyIn: '1', rebuy1: '0', rebuy2: '0'}
    ];
    return mockPlayers;
}
function loadGameList() {
    const gameListDiv = document.getElementById('game-list');
    if (!gameListDiv) return;
    gamesCollection.orderBy('startTime', 'desc').onSnapshot(snapshot => {
        gameListDiv.innerHTML = '';
        if (snapshot.empty) {
            gameListDiv.innerHTML = '<p>생성된 게임이 없습니다.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const gameData = doc.data();
            if (gameData.startTime) {
                const link = document.createElement('a');
                link.href = `?game=${doc.id}`;
                link.textContent = `${formatTimestamp(gameData.startTime)} 생성`;
                gameListDiv.appendChild(link);
            }
        });
    }, error => {
        console.error("Error fetching game list: ", error);
        gameListDiv.innerHTML = '<p>게임 목록을 불러오는 데 실패했습니다.</p>';
    });
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "시간 정보 없음";
    const date = timestamp.toDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const week = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = week[date.getDay()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day}(${dayOfWeek}) ${hours}:${minutes}`;
}

function showPage(pageId) {
    document.querySelectorAll('.page-container').forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById(pageId).style.display = 'block';
}

async function createNewGame() {
    const settings = captureSettings();
    try {
        const docRef = await gamesCollection.add({
            settings: settings,
            startTime: firebase.firestore.FieldValue.serverTimestamp(),
            isPaused: false,
            pauseTime: null,
            totalPauseDuration: 0,
            players: 0,
            totalPlayers: 0,
            totalChips: 0,
        });
        window.location.href = `?game=${docRef.id}`;
    } catch (error) {
        console.error("Error creating new game: ", error);
        alert("게임을 생성하는 데 실패했습니다.");
    }
}

function calculateCurrentState(gameData, schedule) {
    const now = Date.now();
    const startTime = gameData.startTime.toDate().getTime();
    const totalPauseDuration = gameData.totalPauseDuration || 0;
    let elapsedSeconds;
    if (gameData.isPaused) {
        const pauseTime = gameData.pauseTime ? gameData.pauseTime.toDate().getTime() : now;
        elapsedSeconds = Math.floor((pauseTime - startTime - totalPauseDuration) / 1000);
    } else {
        elapsedSeconds = Math.floor((now - startTime - totalPauseDuration) / 1000);
    }
    if (elapsedSeconds < 0) elapsedSeconds = 0;
    let cumulativeSeconds = 0;
    let currentLevelIndex = 0;
    for (let i = 0; i < schedule.length; i++) {
        const levelDuration = schedule[i].duration * 60;
        if (elapsedSeconds < cumulativeSeconds + levelDuration) {
            currentLevelIndex = i;
            break;
        }
        cumulativeSeconds += levelDuration;
        if (i === schedule.length - 1) currentLevelIndex = i;
    }
    const timeIntoLevel = elapsedSeconds - cumulativeSeconds;
    const timeLeftInLevel = (schedule[currentLevelIndex].duration * 60) - timeIntoLevel;
    return { currentLevelIndex, timeLeftInLevel, elapsedSeconds, cumulativeSeconds };
}

function displayTime(seconds, element, withHours = false) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (withHours) {
        element.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        element.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}

function displayLevelInfo(schedule, index) {
    const currentLevel = schedule[index];
    const nextLevel = schedule[index + 1];
    if (currentLevel.isBreak) {
        document.getElementById('level-label').textContent = "BREAK";
        document.getElementById('blinds-label').textContent = "휴식 시간입니다";
    } else {
        document.getElementById('level-label').textContent = `Level ${currentLevel.level}`;
        document.getElementById('blinds-label').textContent = `Blinds: ${currentLevel.small.toLocaleString()} / ${currentLevel.big.toLocaleString()} / ${currentLevel.ante.toLocaleString()}`;
    }
    if (nextLevel) {
        if (nextLevel.isBreak) {
            document.getElementById('next-blinds-label').textContent = `Next: BREAK`;
        } else {
            document.getElementById('next-blinds-label').textContent = `Next Level ${nextLevel.level}: ${nextLevel.small.toLocaleString()} / ${nextLevel.big.toLocaleString()} / ${nextLevel.ante.toLocaleString()}`;
        }
    } else {
        document.getElementById('next-blinds-label').textContent = "Last Level";
    }
}

function calculateAndDisplayChipInfo(gameData, schedule, currentLevelIndex) {
    const players = gameData.players || 0;
    const totalChips = gameData.totalChips || 0;
    const avrStack = players > 0 ? Math.ceil(totalChips / players) : 0;
    const currentBigBlind = schedule[currentLevelIndex].isBreak ? (schedule[currentLevelIndex - 1]?.big || 1) : (schedule[currentLevelIndex].big || 1);
    document.getElementById('total-chips-info').textContent = totalChips.toLocaleString();
    document.getElementById('avr-stack-info').textContent = avrStack.toLocaleString();
    document.getElementById('total-chips-bb-info').textContent = `(${(totalChips / currentBigBlind).toFixed(1)} BB)`;
    document.getElementById('avr-stack-bb-info').textContent = `(${(avrStack / currentBigBlind).toFixed(1)} BB)`;
}

function calculateAndDisplayNextBreak(elapsedSeconds, schedule, currentLevelIndex) {
    let timeToBreak = 0;
    let levelsLeft = 0;
    let breakFound = false;
    let cumulativeTimeAtCurrentLevel = 0;
    for (let i = 0; i < currentLevelIndex; i++) {
        cumulativeTimeAtCurrentLevel += schedule[i].duration * 60;
    }
    const timeRemainingInCurrentLevel = (cumulativeTimeAtCurrentLevel + schedule[currentLevelIndex].duration * 60) - elapsedSeconds;
    timeToBreak += timeRemainingInCurrentLevel;
    for (let i = currentLevelIndex + 1; i < schedule.length; i++) {
        if (schedule[i].isBreak) {
            breakFound = true;
            break;
        }
        levelsLeft++;
        timeToBreak += schedule[i].duration * 60;
    }
    if (breakFound) {
        displayTime(timeToBreak, document.getElementById('next-break-time-info'), true);
        document.getElementById('next-break-levels-info').textContent = `${levelsLeft} level(s) left`;
    } else {
        document.getElementById('next-break-time-info').textContent = "00:00:00";
        document.getElementById('next-break-levels-info').textContent = "No more breaks";
    }
}
async function togglePlayPause() {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
    const gameData = doc.data();
    if (gameData.isPaused) {
        const now = new Date();
        const pauseTime = gameData.pauseTime ? gameData.pauseTime.toDate() : now;
        const newPauseDuration = now.getTime() - pauseTime.getTime();
        await gameRef.update({ isPaused: false, pauseTime: null, totalPauseDuration: (gameData.totalPauseDuration || 0) + newPauseDuration });
    } else {
        await gameRef.update({ isPaused: true, pauseTime: firebase.firestore.FieldValue.serverTimestamp() });
    }
}
async function changeLevel(direction) {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
    const gameData = doc.data();
    const schedule = buildSchedule(gameData.settings);
    const { currentLevelIndex } = calculateCurrentState(gameData, schedule);
    let targetLevelIndex = currentLevelIndex + direction;
    if (targetLevelIndex < 0 || targetLevelIndex >= schedule.length) {
        return;
    }
    let targetCumulativeSeconds = 0;
    for (let i = 0; i < targetLevelIndex; i++) {
        targetCumulativeSeconds += schedule[i].duration * 60;
    }
    const now = Date.now();
    const totalPauseDuration = gameData.totalPauseDuration || 0;
    const newStartTime = now - (targetCumulativeSeconds * 1000) - totalPauseDuration;
    await gameRef.update({ startTime: firebase.firestore.Timestamp.fromMillis(newStartTime) });
}
async function adjustTime(seconds) {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
    const newStartTimeMillis = doc.data().startTime.toMillis() - (seconds * 1000);
    await gameRef.update({
        startTime: firebase.firestore.Timestamp.fromMillis(newStartTimeMillis)
    });
}
async function setHeadsUp() {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;

    const gameData = doc.data();
    const settings = gameData.settings;
    const schedule = buildSchedule(settings);
    const { currentLevelIndex } = calculateCurrentState(gameData, schedule);

    let currentBlindLevelNumber = 0;
    if (schedule[currentLevelIndex] && !schedule[currentLevelIndex].isBreak) {
        currentBlindLevelNumber = schedule[currentLevelIndex].level;
    } else {
        for (let i = currentLevelIndex; i >= 0; i--) {
            if (schedule[i] && !schedule[i].isBreak) {
                currentBlindLevelNumber = schedule[i].level;
                break;
            }
        }
    }

    const newBlinds = settings.blinds.map(blind => {
        if (blind.level > currentBlindLevelNumber) {
            return { ...blind, duration: 5 };
        }
        return blind;
    });

    const newSettings = { ...settings, blinds: newBlinds };

    await gameRef.update({
        settings: newSettings,
        players: 2
    });

    alert('헤즈업 모드가 설정되었습니다. 다음 레벨부터 5분으로 적용됩니다.');
}
async function seekTime(value, finalUpdate) {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
    const gameData = doc.data();
    const schedule = buildSchedule(gameData.settings);
    const { currentLevelIndex, cumulativeSeconds } = calculateCurrentState(gameData, schedule);
    const levelDuration = schedule[currentLevelIndex].duration * 60;
    const timeIntoLevel = levelDuration > 0 ? levelDuration * value : 0;
    const targetElapsedSeconds = cumulativeSeconds + timeIntoLevel;
    const timeLeft = levelDuration - timeIntoLevel;
    displayTime(timeLeft, document.getElementById('timer-label'));
    if (finalUpdate) {
        const now = Date.now();
        const totalPauseDuration = gameData.totalPauseDuration || 0;
        const newStartTime = now - (targetElapsedSeconds * 1000) - totalPauseDuration;
        await gameRef.update({
            startTime: firebase.firestore.Timestamp.fromMillis(newStartTime)
        });
    }
}
function populateBlindSettings() {
    const blindGridBody = document.getElementById('blind-grid-body');
    blindGridBody.innerHTML = '';
    const defaultBlindStructure = getDefaultBlinds();
    defaultBlindStructure.forEach((levelData, index) => {
        const row = document.createElement('div');
        row.className = 'blind-grid-row';
        row.dataset.index = index;
        row.innerHTML = `
            <div>${levelData.level}</div>
            <div><input type="number" class="small-input" value="${levelData.small}"></div>
            <div><input type="number" class="big-input" value="${levelData.big}"></div>
            <div><input type="number" class="ante-input" value="${levelData.ante}"></div>
            <div><input type="number" class="duration-input" value="${levelData.duration}"></div>
            <div><button class="apply-below-btn">Apply Below</button></div>
        `;
        blindGridBody.appendChild(row);
    });
    document.querySelectorAll('.apply-below-btn').forEach(button => {
        button.addEventListener('click', handleApplyBelow);
    });
}
function handleApplyBelow(event) {
    const clickedRow = event.target.closest('.blind-grid-row');
    const clickedIndex = parseInt(clickedRow.dataset.index, 10);
    const durationToApply = clickedRow.querySelector('.duration-input').value;
    const allRows = document.querySelectorAll('.blind-grid-row');
    allRows.forEach(row => {
        const rowIndex = parseInt(row.dataset.index, 10);
        if (rowIndex > clickedIndex) {
            row.querySelector('.duration-input').value = durationToApply;
        }
    });
}
function applyAllDurations() {
    const newDuration = document.getElementById('all-duration-spinner').value;
    document.querySelectorAll('.blind-grid-row .duration-input').forEach(input => {
        input.value = newDuration;
    });
}
function captureSettings() {
    const blinds = [];
    document.querySelectorAll('.blind-grid-row').forEach(row => {
        blinds.push({
            level: parseInt(row.children[0].textContent),
            small: parseInt(row.querySelector('.small-input').value),
            big: parseInt(row.querySelector('.big-input').value),
            ante: parseInt(row.querySelector('.ante-input').value),
            duration: parseInt(row.querySelector('.duration-input').value)
        });
    });
    return {
        blinds: blinds,
        breakLevels: document.getElementById('break-levels').value.split(',').map(n => parseInt(n.trim())).filter(Number.isFinite),
        breakDuration: parseInt(document.getElementById('break-duration').value)
    };
}
function buildSchedule(settings) {
    const schedule = [];
    if (settings && settings.blinds) {
        settings.blinds.forEach(level => {
            schedule.push({ ...level, isBreak: false });
            if (settings.breakLevels && settings.breakLevels.includes(level.level)) {
                schedule.push({ isBreak: true, duration: settings.breakDuration, level: 'Break', small: 0, big: 0, ante: 0 });
            }
        });
    }
    return schedule;
}
function getDefaultBlinds() {
    return [
        { level: 1, small: 100, big: 200, ante: 200, duration: 15 }, { level: 2, small: 200, big: 300, ante: 300, duration: 15 },
        { level: 3, small: 200, big: 400, ante: 400, duration: 15 }, { level: 4, small: 300, big: 500, ante: 500, duration: 15 },
        { level: 5, small: 300, big: 600, ante: 600, duration: 15 }, { level: 6, small: 400, big: 800, ante: 800, duration: 15 },
        { level: 7, small: 500, big: 1000, ante: 1000, duration: 15 }, { level: 8, small: 600, big: 1200, ante: 1200, duration: 15 },
        { level: 9, small: 800, big: 1500, ante: 1500, duration: 15 }, { level: 10, small: 1000, big: 1500, ante: 1500, duration: 15 },
        { level: 11, small: 1000, big: 2000, ante: 2000, duration: 12 }, { level: 12, small: 1500, big: 2500, ante: 2500, duration: 12 },
        { level: 13, small: 1500, big: 3000, ante: 3000, duration: 12 }, { level: 14, small: 2000, big: 4000, ante: 4000, duration: 12 },
        { level: 15, small: 2500, big: 5000, ante: 5000, duration: 12 }, { level: 16, small: 3000, big: 6000, ante: 6000, duration: 8 },
        { level: 17, small: 4000, big: 8000, ante: 8000, duration: 8 }, { level: 18, small: 5000, big: 10000, ante: 10000, duration: 8 },
        { level: 19, small: 6000, big: 12000, ante: 12000, duration: 8 }, { level: 20, small: 8000, big: 16000, ante: 16000, duration: 8 },
        { level: 21, small: 10000, big: 20000, ante: 20000, duration: 6 }, { level: 22, small: 15000, big: 25000, ante: 25000, duration: 6 },
        { level: 23, small: 20000, big: 30000, ante: 30000, duration: 6 }, { level: 24, small: 20000, big: 40000, ante: 40000, duration: 6 },
        { level: 25, small: 25000, big: 50000, ante: 50000, duration: 6 }, { level: 26, small: 30000, big: 60000, ante: 60000, duration: 6 }
    ];
}

