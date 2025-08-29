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
let unsubscribe = null; // Firestore 리스너 구독 해제 함수

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    // URL에서 게임 ID 확인
    const params = new URLSearchParams(window.location.search);
    currentGameId = params.get('game');

    if (currentGameId) {
        // 게임 ID가 있으면 해당 게임에 연결
        joinGame(currentGameId);
    } else {
        // 게임 ID가 없으면 시작 화면 표시
        showPage('landing-page');
    }
    
    // 이벤트 리스너 설정
    setupEventListeners();
});

// 모든 이벤트 리스너를 설정하는 함수
function setupEventListeners() {
    document.getElementById('create-game-btn').addEventListener('click', () => {
        showPage('settings-page');
        populateBlindSettings();
    });

    document.getElementById('play-button').addEventListener('click', createNewGame);
    document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
    document.getElementById('next-level-btn').addEventListener('click', () => changeLevel(1));
    document.getElementById('prev-level-btn').addEventListener('click', () => changeLevel(-1));
    document.getElementById('copy-link-btn').addEventListener('click', copyShareLink);
}

// 특정 페이지만 보여주는 함수
function showPage(pageId) {
    document.querySelectorAll('.page-container').forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById(pageId).style.display = 'block';
}

// 새 게임을 생성하는 함수
async function createNewGame() {
    const settings = captureSettings(); // 현재 설정 값 가져오기
    
    try {
        const docRef = await gamesCollection.add({
            settings: settings,
            startTime: firebase.firestore.FieldValue.serverTimestamp(), // 서버 시간 기준 시작
            isPaused: false,
            pauseTime: null,
            totalPauseDuration: 0,
            currentLevelIndex: 0
        });
        // 생성된 게임 ID로 URL 변경
        window.location.href = `?game=${docRef.id}`;
    } catch (error) {
        console.error("Error creating new game: ", error);
        alert("게임을 생성하는 데 실패했습니다.");
    }
}

// 기존 게임에 참여하는 함수
function joinGame(gameId) {
    showPage('timer-page');
    const shareLinkInput = document.getElementById('share-link-input');
    shareLinkInput.value = window.location.href;

    // 실시간 데이터 변경 감지
    if (unsubscribe) unsubscribe(); // 이전 리스너가 있다면 해제
    unsubscribe = gamesCollection.doc(gameId).onSnapshot(doc => {
        if (doc.exists) {
            updateTimerUI(doc.data());
        } else {
            alert("존재하지 않는 게임입니다.");
            window.location.href = window.location.pathname; // 홈으로 이동
        }
    });
}

// 타이머 UI를 업데이트하는 메인 함수
function updateTimerUI(gameData) {
    if (!gameData || !gameData.startTime) return;

    // 타이머 인터벌 관리
    if (timerInterval) clearInterval(timerInterval);
    
    const update = () => {
        const schedule = buildSchedule(gameData.settings);
        const now = Date.now();
        const startTime = gameData.startTime.toDate().getTime();
        const totalPauseDuration = gameData.totalPauseDuration || 0;

        let elapsedSeconds;
        if(gameData.isPaused){
            const pauseTime = gameData.pauseTime.toDate().getTime();
            elapsedSeconds = Math.floor((pauseTime - startTime - totalPauseDuration) / 1000);
        } else {
             elapsedSeconds = Math.floor((now - startTime - totalPauseDuration) / 1000);
        }

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
        const timeLeft = (schedule[currentLevelIndex].duration * 60) - timeIntoLevel;
        
        // 화면 표시 업데이트
        displayTime(timeLeft);
        displayLevelInfo(schedule, currentLevelIndex);

        // 버튼 상태 업데이트
        document.getElementById('play-pause-btn').textContent = gameData.isPaused ? '>' : '||';
    };

    update(); // 즉시 한번 실행
    if (!gameData.isPaused) {
       timerInterval = setInterval(update, 1000);
    }
}


// 시간/레벨/블라인드 정보 표시
function displayTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    document.getElementById('timer-label').textContent = `${String(minutes).padStart(2, '0')}:${String(remainderSeconds).padStart(2, '0')}`;
}

function displayLevelInfo(schedule, index) {
    const currentLevel = schedule[index];
    const nextLevel = schedule[index + 1];

    if (currentLevel.isBreak) {
        document.getElementById('level-label').textContent = "BREAK";
        document.getElementById('blinds-label').textContent = "휴식 시간입니다";
    } else {
        document.getElementById('level-label').textContent = `Level ${currentLevel.level}`;
        document.getElementById('blinds-label').textContent = `Blinds: ${currentLevel.small} / ${currentLevel.big} (Ante: ${currentLevel.ante})`;
    }

    if (nextLevel) {
        if(nextLevel.isBreak){
            document.getElementById('next-blinds-label').textContent = `Next: BREAK`;
        } else {
            document.getElementById('next-blinds-label').textContent = `Next: ${nextLevel.small} / ${nextLevel.big}`;
        }
    } else {
        document.getElementById('next-blinds-label').textContent = "Last Level";
    }
}


// 컨트롤 버튼 로직
async function togglePlayPause() {
    const gameRef = gamesCollection.doc(currentGameId);
    const doc = await gameRef.get();
    const gameData = doc.data();

    if (gameData.isPaused) {
        // 다시 시작
        const now = new Date();
        const pauseTime = gameData.pauseTime.toDate();
        const newPauseDuration = now.getTime() - pauseTime.getTime();
        await gameRef.update({
            isPaused: false,
            pauseTime: null,
            totalPauseDuration: (gameData.totalPauseDuration || 0) + newPauseDuration
        });
    } else {
        // 일시 정지
        await gameRef.update({
            isPaused: true,
            pauseTime: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

async function changeLevel(direction) {
   // 이 기능은 타이머 로직이 복잡해져서 추후 구현하는 것을 권장합니다.
   // 현재 시간 기반 로직을 수동으로 덮어쓰는 작업이 필요합니다.
   alert('레벨 수동 변경 기능은 개발 중입니다.');
}


// 설정 화면 관련 함수들 (이전과 유사)
function populateBlindSettings() {
    const blindGridBody = document.getElementById('blind-grid-body');
    blindGridBody.innerHTML = '';
    const defaultBlindStructure = getDefaultBlinds(); // 블라인드 데이터 가져오기
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
    // ... 이전과 동일한 이벤트 리스너 설정 로직
}

function captureSettings(){
    // 설정 화면의 모든 값을 읽어서 객체로 반환
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
        breakLevels: document.getElementById('break-levels').value.split(',').map(n => parseInt(n.trim())),
        breakDuration: parseInt(document.getElementById('break-duration').value)
    };
}

function buildSchedule(settings) {
    const schedule = [];
    settings.blinds.forEach(level => {
        schedule.push(level);
        if(settings.breakLevels.includes(level.level)){
            schedule.push({isBreak: true, duration: settings.breakDuration});
        }
    });
    return schedule;
}

function copyShareLink() {
    const linkInput = document.getElementById('share-link-input');
    linkInput.select();
    document.execCommand('copy');
    alert('링크가 복사되었습니다!');
}


function getDefaultBlinds() {
    return [
        { level: 1, small: 100, big: 200, ante: 200, duration: 15 },
        { level: 2, small: 200, big: 300, ante: 300, duration: 15 },
        { level: 3, small: 200, big: 400, ante: 400, duration: 15 },
        { level: 4, small: 300, big: 500, ante: 500, duration: 15 },
        { level: 5, small: 300, big: 600, ante: 600, duration: 15 },
        { level: 6, small: 400, big: 800, ante: 800, duration: 15 },
        { level: 7, small: 500, big: 1000, ante: 1000, duration: 15 },
        { level: 8, small: 600, big: 1200, ante: 1200, duration: 15 },
        { level: 9, small: 800, big: 1500, ante: 1500, duration: 15 },
        { level: 10, small: 1000, big: 1500, ante: 1500, duration: 15 },
        { level: 11, small: 1000, big: 2000, ante: 2000, duration: 12 },
        { level: 12, small: 1500, big: 2500, ante: 2500, duration: 12 },
        { level: 13, small: 1500, big: 3000, ante: 3000, duration: 12 },
        { level: 14, small: 2000, big: 4000, ante: 4000, duration: 12 },
        { level: 15, small: 2500, big: 5000, ante: 5000, duration: 12 },
        { level: 16, small: 3000, big: 6000, ante: 6000, duration: 8 },
        { level: 17, small: 4000, big: 8000, ante: 8000, duration: 8 },
        { level: 18, small: 5000, big: 10000, ante: 10000, duration: 8 },
        { level: 19, small: 6000, big: 12000, ante: 12000, duration: 8 },
        { level: 20, small: 8000, big: 16000, ante: 16000, duration: 8 },
        { level: 21, small: 10000, big: 20000, ante: 20000, duration: 6 },
        { level: 22, small: 15000, big: 25000, ante: 25000, duration: 6 },
        { level: 23, small: 20000, big: 30000, ante: 30000, duration: 6 },
        { level: 24, small: 20000, big: 40000, ante: 40000, duration: 6 },
        { level: 25, small: 25000, big: 50000, ante: 50000, duration: 6 },
        { level: 26, small: 30000, big: 60000, ante: 60000, duration: 6 }
    ];
}
// 설정 화면의 Apply Below 등 부가 기능은 지면 관계상 생략했습니다.
// 필요시 이전 코드의 populateBlindSettings 함수 내 로직을 참고하여 추가할 수 있습니다.
