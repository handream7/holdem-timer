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
let unsubscribeOutedPlayers = null; 
let isSeeking = false;
let lastPlayedLevelIndex = -1;
let isSoundOn = true;
let oneMinuteAlertPlayed = false;
let isDataLoaded = false;
// isLocked 변수는 이제 Firestore에서 관리하므로 전역 변수에서 제거합니다.

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
    document.getElementById('time-minus-btn').addEventListener('click', () => adjustTime(10));
    document.getElementById('time-plus-btn').addEventListener('click', () => adjustTime(-10));
    document.getElementById('heads-up-btn').addEventListener('click', toggleHeadsUp);
    document.getElementById('sound-toggle-btn').addEventListener('click', toggleSound);
    document.getElementById('update-data-btn').addEventListener('click', handleUpdateData);
    document.getElementById('lock-btn').addEventListener('click', toggleLock); 

    const modal = document.getElementById('out-list-modal');
    document.getElementById('out-list-btn').addEventListener('click', showOutListModal);
    modal.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    const timeSlider = document.getElementById('time-slider');
    timeSlider.addEventListener('mousedown', () => { isSeeking = true; });
    timeSlider.addEventListener('touchstart', () => { isSeeking = true; });
    timeSlider.addEventListener('input', () => { if (isSeeking) seekTime(timeSlider.value, false); });
    timeSlider.addEventListener('change', () => { seekTime(timeSlider.value, true); isSeeking = false; });
    timeSlider.addEventListener('mouseup', () => { if (isSeeking) isSeeking = false; });
    timeSlider.addEventListener('touchend', () => { if (isSeeking) isSeeking = false; });
}

// ========================================================
// 여기가 수정된 핵심 부분입니다. (잠금 기능 동기화)
// ========================================================

// 잠금 상태를 Firestore에 업데이트하는 함수
async function toggleLock() {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    try {
        const doc = await gameRef.get();
        if (doc.exists) {
            const currentLockState = doc.data().isLocked || false;
            // Firestore의 isLocked 필드를 현재 상태의 반대 값으로 업데이트
            await gameRef.update({ isLocked: !currentLockState });
        }
    } catch (error) {
        console.error("잠금 상태 업데이트 실패:", error);
    }
}

// UI 업데이트 함수에서 잠금 상태를 실시간으로 반영
function updateLockUI(isLocked) {
    const lockButton = document.getElementById('lock-btn');
    const controlsToLock = [
        document.getElementById('prev-level-btn'),
        document.getElementById('play-pause-btn'),
        document.getElementById('next-level-btn'),
        document.getElementById('time-minus-btn'),
        document.getElementById('time-plus-btn'),
        document.getElementById('heads-up-btn'),
        document.getElementById('time-slider')
    ];

    if (isLocked) {
        lockButton.classList.add('locked');
        lockButton.textContent = '잠금 해제';
        controlsToLock.forEach(control => {
            if (control) control.disabled = true;
        });
    } else {
        lockButton.classList.remove('locked');
        lockButton.textContent = '잠금';
        controlsToLock.forEach(control => {
            if (control) control.disabled = false;
        });
    }
}

// ========================================================
// 수정된 부분 끝
// ========================================================


function calculateAndDisplayPrizes(playerData) {
    let totalBuyIns = 0;
    const totalPlayers = playerData.length;
    playerData.forEach(player => {
        if (player.buyIn) totalBuyIns++;
        if (player.rebuy1) totalBuyIns++;
        if (player.rebuy2) totalBuyIns++;
    });
    const totalPrize = 250 * totalBuyIns;
    let percentages = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };
    if (totalPlayers >= 18) {
        percentages = { p1: 0.45, p2: 0.25, p3: 0.15, p4: 0.10, p5: 0.05 };
    } else if (totalPlayers >= 12) {
        percentages = { p1: 0.50, p2: 0.25, p3: 0.15, p4: 0.10, p5: 0 };
    } else if (totalPlayers >= 8) {
        percentages = { p1: 0.60, p2: 0.30, p3: 0.10, p4: 0, p5: 0 };
    } else if (totalPlayers >= 5) {
        percentages = { p1: 0.65, p2: 0.35, p3: 0, p4: 0, p5: 0 };
    }
    const prizes = [
        Math.round(totalPrize * percentages.p1),
        Math.round(totalPrize * percentages.p2),
        Math.round(totalPrize * percentages.p3),
        Math.round(totalPrize * percentages.p4),
        Math.round(totalPrize * percentages.p5)
    ];
    for (let i = 1; i <= 5; i++) {
        const prizeElement = document.getElementById(`prize-${i}`);
        if (prizeElement) {
            const prizeAmount = prizes[i - 1];
            prizeElement.textContent = prizeAmount > 0 ? prizeAmount.toLocaleString() : '0';
        }
    }
}

async function handleUpdateData() {
    isDataLoaded = false; 
    const updateButton = document.getElementById('update-data-btn');
    updateButton.textContent = '로딩 중...';
    updateButton.disabled = true;

    try {
        const response = await fetch('https://holdemresult.onrender.com/api/game-data');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const apiData = await response.json();
        const formattedData = apiData.player_status.map(player => ({
            rank: player.number,
            name: player.player ? player.player.trim() : '',
            buyIn: player.buy_in,
            rebuy1: player.rebuy1,
            rebuy2: player.rebuy2
        }));
        
        calculateAndDisplayPrizes(formattedData);
        updateRealtimeDataTable(formattedData);
        await updateTimerInfoFromPlayerData(formattedData);

        isDataLoaded = true; 

        const outedPlayersSnapshot = await gamesCollection.doc(currentGameId).collection('outedPlayers').get();
        const outedPlayerNames = outedPlayersSnapshot.docs.map(doc => doc.id);
        updateOutedPlayerUI(outedPlayerNames);

    } catch (error) {
        console.error("외부 데이터 업데이트 실패:", error);
        alert(`데이터를 가져오는 데 실패했습니다. 서버가 실행 중인지, CORS 설정이 올바른지 확인해주세요.\n오류: ${error.message}`);
    } finally {
        updateButton.textContent = '업데이트';
        updateButton.disabled = false;
    }
}

function updateOutedPlayerUI(outedPlayerNames) {
    if (!isDataLoaded) return;
    const allRows = document.querySelectorAll('#realtime-data-tbody tr');
    let activePlayers = 0; 
    allRows.forEach(row => {
        const outButton = row.querySelector('.out-btn');
        if (outButton) {
            const playerName = outButton.dataset.playerName;
            if (outedPlayerNames.includes(playerName)) {
                row.style.opacity = '0.5';
                outButton.disabled = true;
            } else {
                row.style.opacity = '1';
                outButton.disabled = false;
                activePlayers++;
            }
        }
    });
    if (currentGameId) {
        gamesCollection.doc(currentGameId).update({ players: activePlayers });
    }
}

function joinGame(gameId) {
    showPage('timer-page');
    handleUpdateData();
    lastPlayedLevelIndex = -1;
    oneMinuteAlertPlayed = false;
    if (unsubscribe) unsubscribe();
    if (unsubscribeOutedPlayers) unsubscribeOutedPlayers();
    unsubscribe = gamesCollection.doc(gameId).onSnapshot(doc => {
        if (doc.exists) {
            updateTimerUI(doc.data());
        } else {
            alert("존재하지 않는 게임입니다.");
            goHome();
        }
    });
    unsubscribeOutedPlayers = gamesCollection.doc(gameId).collection('outedPlayers')
        .onSnapshot(snapshot => {
            const outedPlayerNames = snapshot.docs.map(doc => doc.id);
            updateOutedPlayerUI(outedPlayerNames);
        }, error => {
            console.error("Out된 플레이어 목록 실시간 동기화 실패:", error);
        });
}

function updateRealtimeDataTable(data) {
    const tableBody = document.getElementById('realtime-data-tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    data.forEach(player => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.rank || ''}</td>
            <td>${player.name || ''}</td>
            <td>${player.buyIn || ''}</td>
            <td>${player.rebuy1 || ''}</td>
            <td>${player.rebuy2 || ''}</td>
            <td><button class="out-btn" data-player-name="${player.name}">Out</button></td>
        `;
        tableBody.appendChild(row);
        const outButton = row.querySelector('.out-btn');
        if (outButton) {
            outButton.addEventListener('click', handleOutButtonClick);
        }
        row.addEventListener('click', () => handleRowClick(row, player.name));
    });
}

async function updateTimerInfoFromPlayerData(playersData) {
    if (!currentGameId) return;
    let totalEntries = 0;
    playersData.forEach(player => {
        if (player.buyIn) totalEntries++;
        if (player.rebuy1) totalEntries++;
        if (player.rebuy2) totalEntries++;
    });
    let buyInCount = 0;
    let rebuy1Count = 0;
    let rebuy2Count = 0;
    playersData.forEach(player => {
        if (player.buyIn) buyInCount++;
        if (player.rebuy1) rebuy1Count++;
        if (player.rebuy2) rebuy2Count++;
    });
    const buyInChips = buyInCount * 40000;
    const rebuy1Chips = rebuy1Count * 50000;
    const rebuy2Chips = rebuy2Count * 80000;
    const totalChips = buyInChips + rebuy1Chips + rebuy2Chips;
    const gameRef = gamesCollection.doc(currentGameId);
    await gameRef.update({
        totalPlayers: totalEntries,
        totalChips: totalChips
    });
}

async function handleOutButtonClick(event) {
    event.stopPropagation();
    const button = event.target;
    const playerName = button.dataset.playerName;
    if (!playerName || !currentGameId) return;
    if (confirm(`'${playerName}'님을 Out 처리하시겠습니까?`)) {
        try {
            await gamesCollection.doc(currentGameId).collection('outedPlayers').doc(playerName).set({ outTime: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (error) {
            console.error("Out 처리 중 오류 발생:", error);
            alert("플레이어 Out 처리 중 오류가 발생했습니다.");
        }
    }
}

async function handleRowClick(row, playerName) {
    const outButton = row.querySelector('.out-btn');
    if (outButton && outButton.disabled) {
        if (confirm(`'${playerName}'님을 다시 활성화하시겠습니까?`)) {
            try {
                await gamesCollection.doc(currentGameId).collection('outedPlayers').doc(playerName).delete();
            } catch (error) {
                console.error("재활성화 처리 중 오류 발생:", error);
                alert("플레이어 재활성화 중 오류가 발생했습니다.");
            }
        }
    }
}

function goHome() {
    if (unsubscribe) unsubscribe();
    if (unsubscribeOutedPlayers) unsubscribeOutedPlayers();
    unsubscribe = null;
    unsubscribeOutedPlayers = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    window.location.href = window.location.pathname;
}

function toggleSound() {
    isSoundOn = !isSoundOn;
    const soundBtn = document.getElementById('sound-toggle-btn');
    soundBtn.textContent = isSoundOn ? '소리 끄기' : '소리 켜기';
    const levelupSound = document.getElementById('levelup-sound');
    const breakSound = document.getElementById('break-sound');
    if (isSoundOn) {
        if (levelupSound && levelupSound.paused) {
            levelupSound.play().then(() => levelupSound.pause()).catch(e => console.error("소리 활성화 실패:", e));
        }
    } else {
        if (levelupSound) {
            levelupSound.pause();
            levelupSound.currentTime = 0;
        }
        if (breakSound) {
            breakSound.pause();
            breakSound.currentTime = 0;
        }
    }
}

function playSound(type) {
    if (!isSoundOn) return;
    const sound = (type === 'break') ? document.getElementById('break-sound') : document.getElementById('levelup-sound');
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(error => console.error("오디오 재생 오류:", error));
    }
}

async function createNewGame() {
    const settings = captureSettings();
    try {
        const docRef = await gamesCollection.add({
            settings: settings,
            startTime: firebase.firestore.FieldValue.serverTimestamp(),
            isPaused: false,
            isLocked: false // 새 게임 생성 시 isLocked 필드 추가
        });
        window.location.href = `?game=${docRef.id}`;
    } catch (error) {
        console.error("Error creating new game: ", error);
        alert("게임을 생성하는 데 실패했습니다.");
    }
}

async function toggleHeadsUp() {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;

    const gameData = doc.data();
    const settings = gameData.settings;
    const isHeadsUpActive = !!gameData.originalDurations;

    const schedule = buildSchedule(settings);
    const { currentLevelIndex } = calculateCurrentState(gameData, schedule);
    let currentBlindLevelNumber = 0;
    const currentLevelInfo = schedule[currentLevelIndex];
    if (currentLevelInfo && !currentLevelInfo.isBreak) {
        currentBlindLevelNumber = currentLevelInfo.level;
    } else {
        for (let i = currentLevelIndex; i >= 0; i--) {
            if (schedule[i] && !schedule[i].isBreak) {
                currentBlindLevelNumber = schedule[i].level;
                break;
            }
        }
    }

    if (isHeadsUpActive) {
        const originalDurations = gameData.originalDurations;
        
        const restoredBlinds = settings.blinds.map((blind, index) => {
            if (blind.level > currentBlindLevelNumber) {
                return { ...blind, duration: originalDurations[index] ?? blind.duration };
            }
            return blind;
        });

        await gameRef.update({
            'settings.blinds': restoredBlinds,
            originalDurations: firebase.firestore.FieldValue.delete()
        });
        alert('헤즈업 모드가 해제되었습니다. 다음 레벨부터 기존 시간으로 돌아갑니다.');

    } else {
        const originalDurations = settings.blinds.map(blind => blind.duration);
        const newBlinds = settings.blinds.map(blind => {
            if (blind.level > currentBlindLevelNumber) {
                return { ...blind, duration: 5 };
            }
            return blind;
        });

        await gameRef.update({
            'settings.blinds': newBlinds,
            originalDurations: originalDurations
        });
        alert('헤즈업 모드가 설정되었습니다. 다음 레벨부터 5분으로 적용됩니다.');
    }
}

function buildSchedule(settings) {
    const schedule = [];
    if (settings && settings.blinds) {
        settings.blinds.forEach(level => {
            schedule.push({ ...level, isBreak: false });
            if (settings.breakLevels?.includes(level.level)) {
                schedule.push({ isBreak: true, duration: settings.breakDuration, level: 'Break', small: 0, big: 0, ante: 0 });
            }
        });
    }
    return schedule;
}

function updateTimerUI(gameData) {
    if (!gameData) return;
    if (timerInterval) clearInterval(timerInterval);
    
    // isLocked 상태를 Firestore 데이터로부터 직접 읽어 UI에 반영
    updateLockUI(gameData.isLocked || false);

    const isHeadsUpActive = !!gameData.originalDurations;
    document.getElementById('heads-up-btn').textContent = isHeadsUpActive ? 'HEADS-UP OFF' : 'HEADS-UP ON';

    const schedule = buildSchedule(gameData.settings);
    
    const update = () => {
        const { currentLevelIndex, timeLeftInLevel, elapsedSeconds } = calculateCurrentState(gameData, schedule);
        
        if (Math.floor(timeLeftInLevel) === 60 && !oneMinuteAlertPlayed) {
            playSound('levelup');
            oneMinuteAlertPlayed = true;
        }
        if (currentLevelIndex !== lastPlayedLevelIndex) {
            if (lastPlayedLevelIndex !== -1) {
                const newLevel = schedule[currentLevelIndex];
                if (newLevel?.isBreak) playSound('break');
                else playSound('levelup');
            }
            lastPlayedLevelIndex = currentLevelIndex;
            oneMinuteAlertPlayed = false;
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
            const currentLevelDuration = schedule[currentLevelIndex]?.duration * 60 || 0;
            const progress = currentLevelDuration > 0 ? 1 - (timeLeftInLevel / currentLevelDuration) : 0;
            document.getElementById('time-slider').value = progress;
        }
    };
    update();
    if (gameData.isPaused === false) {
       timerInterval = setInterval(update, 1000);
    }
}

async function showOutListModal() {
    if (!currentGameId) return;
    const listElement = document.getElementById('out-player-list');
    const modal = document.getElementById('out-list-modal');
    listElement.innerHTML = '<li>목록을 불러오는 중...</li>';
    modal.style.display = 'flex';
    try {
        const querySnapshot = await gamesCollection.doc(currentGameId).collection('outedPlayers').orderBy('outTime', 'desc').get();
        listElement.innerHTML = '';
        if (querySnapshot.empty) {
            listElement.innerHTML = '<li>Out 처리된 플레이어가 없습니다.</li>';
        } else {
            querySnapshot.forEach(doc => {
                const li = document.createElement('li');
                li.textContent = doc.id;
                listElement.appendChild(li);
            });
        }
    } catch (error) {
        console.error("Error fetching out list:", error);
        listElement.innerHTML = '<li>목록을 불러오는 데 실패했습니다.</li>';
    }
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

function calculateCurrentState(gameData, schedule) {
    if (gameData.isPaused) {
        const elapsedSeconds = gameData.elapsedSecondsOnPause || 0;
        let cumulativeSeconds = 0;
        let currentLevelIndex = 0;
        for (let i = 0; i < schedule.length; i++) {
            const levelDuration = schedule[i].duration * 60;
            if (elapsedSeconds < cumulativeSeconds + levelDuration || i === schedule.length - 1) {
                currentLevelIndex = i;
                break;
            }
            cumulativeSeconds += levelDuration;
        }
        const timeIntoLevel = elapsedSeconds - cumulativeSeconds;
        const timeLeftInLevel = (schedule[currentLevelIndex]?.duration * 60 || 0) - timeIntoLevel;
        return { currentLevelIndex, timeLeftInLevel, elapsedSeconds, cumulativeSeconds };
    } else {
        const now = Date.now();
        const startTime = gameData.startTime ? gameData.startTime.toMillis() : now;
        let elapsedSeconds = Math.floor((now - startTime) / 1000);
        if (elapsedSeconds < 0) elapsedSeconds = 0;
        let cumulativeSeconds = 0;
        let currentLevelIndex = 0;
        for (let i = 0; i < schedule.length; i++) {
            const levelDuration = schedule[i].duration * 60;
            if (elapsedSeconds < cumulativeSeconds + levelDuration || i === schedule.length - 1) {
                currentLevelIndex = i;
                break;
            }
            cumulativeSeconds += levelDuration;
        }
        const timeIntoLevel = elapsedSeconds - cumulativeSeconds;
        const timeLeftInLevel = (schedule[currentLevelIndex]?.duration * 60 || 0) - timeIntoLevel;
        return { currentLevelIndex, timeLeftInLevel, elapsedSeconds, cumulativeSeconds };
    }
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
    if (!currentLevel) return;
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
    const currentLevel = schedule[currentLevelIndex];
    if (!currentLevel) return;
    const currentBigBlind = currentLevel.isBreak ? (schedule[currentLevelIndex - 1]?.big || 1) : (currentLevel.big || 1);
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
    const timeRemainingInCurrentLevel = (cumulativeTimeAtCurrentLevel + (schedule[currentLevelIndex]?.duration * 60 || 0)) - elapsedSeconds;
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
    const schedule = buildSchedule(gameData.settings);
    if (gameData.isPaused) {
        const elapsedSecondsOnPause = gameData.elapsedSecondsOnPause || 0;
        const newStartTimeMillis = Date.now() - (elapsedSecondsOnPause * 1000);
        await gameRef.update({
            isPaused: false,
            startTime: firebase.firestore.Timestamp.fromMillis(newStartTimeMillis),
            elapsedSecondsOnPause: firebase.firestore.FieldValue.delete()
        });
    } else {
        const { elapsedSeconds } = calculateCurrentState(gameData, schedule);
        await gameRef.update({
            isPaused: true,
            elapsedSecondsOnPause: elapsedSeconds
        });
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
    if (targetLevelIndex < 0 || targetLevelIndex >= schedule.length) return;
    let targetCumulativeSeconds = 0;
    for (let i = 0; i < targetLevelIndex; i++) {
        targetCumulativeSeconds += schedule[i].duration * 60;
    }
    if (gameData.isPaused) {
        await gameRef.update({ elapsedSecondsOnPause: targetCumulativeSeconds });
    } else {
        const newStartTimeMillis = Date.now() - (targetCumulativeSeconds * 1000);
        await gameRef.update({
            startTime: firebase.firestore.Timestamp.fromMillis(newStartTimeMillis)
        });
    }
}
async function adjustTime(seconds) {
    if (!currentGameId) return;
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
    const gameData = doc.data();
    if (gameData.isPaused) {
        const newElapsedSeconds = (gameData.elapsedSecondsOnPause || 0) - seconds;
        await gameRef.update({ elapsedSecondsOnPause: newElapsedSeconds < 0 ? 0 : newElapsedSeconds });
    } else {
        const newStartTimeMillis = doc.data().startTime.toMillis() + (seconds * 1000);
        await gameRef.update({
            startTime: firebase.firestore.Timestamp.fromMillis(newStartTimeMillis)
        });
    }
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
        if (gameData.isPaused) {
            await gameRef.update({ elapsedSecondsOnPause: targetElapsedSeconds });
        } else {
            const newStartTimeMillis = Date.now() - (targetElapsedSeconds * 1000);
            await gameRef.update({
                startTime: firebase.firestore.Timestamp.fromMillis(newStartTimeMillis)
            });
        }
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
        { level: 23, small: 15000, big: 30000, ante: 30000, duration: 6 }, { level: 24, small: 20000, big: 40000, ante: 40000, duration: 6 },
        { level: 25, small: 25000, big: 50000, ante: 50000, duration: 6 }, { level: 26, small: 30000, big: 60000, ante: 60000, duration: 6 }
    ];
}