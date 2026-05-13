import React, { useState, useEffect } from 'react';
import { RotateCcw, Undo2, Play, Trophy, X } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot } from 'firebase/firestore';

// Firebase 초기화 (컴포넌트 외부)
// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCXo5En6ka7VTSP4XuHelmd8voyZCNpJK4",
  authDomain: "pink-water-sort.firebaseapp.com",
  projectId: "pink-water-sort",
  storageBucket: "pink-water-sort.firebasestorage.app",
  messagingSenderId: "366519785830",
  appId: "1:366519785830:web:03a7c06cb1b20fb77790a7",
  measurementId: "G-6KT1E16F3N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// [추가해야 할 부분]
const auth = getAuth(app); // auth 정의
const db = getFirestore(app); // db 정의
const appId = "pink-water-sort-v1"; // appId 정의

// 더욱 다양하고 쨍한 색상들 추가
const PAINT_COLORS = [
  'bg-red-500', 'bg-[#1d4ed8]', 'bg-[#16a34a]', 'bg-[#eab308]', // 빨, 파, 초, 노
  'bg-purple-600', 'bg-[#ec4899]', 'bg-[#14b8a6]', 'bg-[#f97316]', // 보라, 핑크, 틸, 오렌지
  'bg-[#6366f1]', 'bg-[#8b5cf6]', 'bg-[#0ea5e9]', 'bg-[#84cc16]'  // 인디고, 바이올렛, 스카이블루, 라임
];

const TUBE_CAPACITY = 4;
const TARGET_COLOR = 'bg-[#ff1493]'; // 목표 색상 (핫핑크)

const App = () => {
  const [tubes, setTubes] = useState([]);
  const [selectedTube, setSelectedTube] = useState(null);
  const [level, setLevel] = useState(1);
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState([]);
  const [isWon, setIsWon] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [stars, setStars] = useState(999);

  // Firebase 관련 상태
  const [user, setUser] = useState(null);
  const [nickname, setNickname] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Firebase Auth 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('인증 오류:', error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 데이터 불러오기 및 랭킹 구독
  useEffect(() => {
    if (!user) return;

    const progressRef = doc(db, 'artifacts', appId, 'users', user.uid, 'gameData', 'progress');
    getDoc(progressRef).then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.nickname) setNickname(data.nickname);
        if (data.stars !== undefined) setStars(data.stars);
        if (data.level && data.level > 1) {
          setLevel(data.level);
          initGame(data.level);
        } else {
          initGame(1);
        }
      } else {
        initGame(1);
      }
      setIsLoaded(true);
    }).catch(err => {
      console.error("데이터 로드 에러:", err);
      initGame(1);
      setIsLoaded(true);
    });

    const lbRef = collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard');
    const unsubLb = onSnapshot(lbRef, (snapshot) => {
      const lbData = [];
      snapshot.forEach(doc => {
        lbData.push({ id: doc.id, ...doc.data() });
      });
      lbData.sort((a, b) => b.level - a.level);
      setLeaderboard(lbData);
    }, (error) => {
      console.error("랭킹 구독 에러:", error);
    });

    return () => unsubLb();
  }, [user]);

  // 레벨 생성
  const generateLevel = (currentLevel) => {
    const numColors = Math.min(4 + Math.floor((currentLevel - 1) / 2), PAINT_COLORS.length);
    const activeColors = PAINT_COLORS.slice(0, numColors);
    
    const giantCapacity = 12 + Math.floor((currentLevel - 1) / 3) * 4;
    
    let allChunks = [];
    
    for (let i = 0; i < giantCapacity; i++) {
      allChunks.push(TARGET_COLOR);
    }
    
    for (let i = 0; i < activeColors.length; i++) {
      for (let j = 0; j < TUBE_CAPACITY; j++) {
        allChunks.push(activeColors[i]);
      }
    }

    for (let i = allChunks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allChunks[i], allChunks[j]] = [allChunks[j], allChunks[i]];
    }

    const newTubes = [];
    
    newTubes.push({
      id: 0,
      isGiant: true,
      capacity: giantCapacity,
      contents: []
    });

    const totalColorChunks = allChunks.length;
    const emptySpaces = 8;
    const numNormalTubes = Math.ceil((totalColorChunks + emptySpaces) / TUBE_CAPACITY);
    
    const normalContents = Array.from({ length: numNormalTubes }, () => []);
    
    for (let i = 0; i < numNormalTubes; i++) {
      if (allChunks.length > 0) {
        normalContents[i].push(allChunks.pop());
      }
    }

    while (allChunks.length > 0) {
      const chunk = allChunks.pop();
      const availableIndices = [];
      
      for (let i = 0; i < numNormalTubes; i++) {
        if (normalContents[i].length < TUBE_CAPACITY) {
          availableIndices.push(i);
        }
      }
      
      if (availableIndices.length === 0) break;
      
      const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      normalContents[randomIdx].push(chunk);
    }

    for (let i = 0; i < numNormalTubes; i++) {
      newTubes.push({
        id: i + 1,
        isGiant: false,
        capacity: TUBE_CAPACITY,
        contents: normalContents[i]
      });
    }
    
    return newTubes;
  };

  const initGame = (targetLevel = level) => {
    const newTubes = generateLevel(targetLevel);
    setTubes(newTubes);
    setSelectedTube(null);
    setMoves(0);
    setHistory([]);
    setIsWon(false);
    setShowWinPopup(false);
  };

  // 물감 따르기 로직
  const handleTubeClick = (index) => {
    if (isWon) return;

    // 코르크 마개로 닫힌 완성된 병은 클릭 방지
    const currentTube = tubes[index];
    let isClickedCompleted = currentTube.contents.length === currentTube.capacity && 
                               currentTube.contents.every(c => c === currentTube.contents[0]) && 
                               currentTube.contents.length > 0;
    
    // 예외: 목표 색상(핫핑크)으로 꽉 찬 '작은 병'은 마개로 닫히지 않음 (거대 병으로 옮겨야 하므로)
    if (!currentTube.isGiant && currentTube.contents[0] === TARGET_COLOR) {
      isClickedCompleted = false;
    }

    if (isClickedCompleted) return;

    if (selectedTube === null) {
      if (currentTube.isGiant) return;
      if (currentTube.contents.length > 0) {
        setSelectedTube(index);
      }
      return;
    }

    if (selectedTube === index) {
      setSelectedTube(null);
      return;
    }

    const sourceNode = tubes[selectedTube];
    const destNode = tubes[index];
    const sourceContents = [...sourceNode.contents];
    const destContents = [...destNode.contents];

    if (sourceContents.length === 0 || destContents.length === destNode.capacity) {
      setSelectedTube(null);
      return;
    }

    const topColor = sourceContents[sourceContents.length - 1];

    if (destNode.isGiant && topColor !== TARGET_COLOR) {
      setSelectedTube(null);
      return;
    }

    if (destContents.length > 0) {
      if (topColor !== destContents[destContents.length - 1]) {
        setSelectedTube(null);
        return;
      }
    }

    let moveCount = 0;
    for (let i = sourceContents.length - 1; i >= 0; i--) {
      if (sourceContents[i] === topColor && destContents.length + moveCount < destNode.capacity) {
        moveCount++;
      } else {
        break;
      }
    }

    if (moveCount > 0) {
      setHistory([...history, tubes.map(t => ({ ...t, contents: [...t.contents] }))]);

      for (let i = 0; i < moveCount; i++) {
        destContents.push(sourceContents.pop());
      }

      const newTubes = [...tubes];
      newTubes[selectedTube] = { ...sourceNode, contents: sourceContents };
      newTubes[index] = { ...destNode, contents: destContents };

      setTubes(newTubes);
      setMoves(m => m + 1);
      checkWinCondition(newTubes);
    }
    
    setSelectedTube(null);
  };

  const checkWinCondition = (currentTubes) => {
    const giantTube = currentTubes.find(t => t.isGiant);
    if (giantTube && giantTube.contents.length === giantTube.capacity) {
      const isAllOneColor = giantTube.contents.every(c => c === giantTube.contents[0]);
      if (isAllOneColor) {
        setIsWon(true);
        // 물감이 차오르고 코르크가 닫히는 애니메이션을 볼 수 있도록 1.5초 대기
        setTimeout(() => {
          setShowWinPopup(true);
        }, 1500);
      }
    }
  };

  const handleUndo = () => {
    if (history.length > 0 && !isWon) {
      const previousState = history[history.length - 1];
      setTubes(previousState);
      setHistory(history.slice(0, -1));
      setMoves(m => m - 1);
      setSelectedTube(null);
    }
  };

  const nextLevel = async () => {
    const next = level + 1;
    const nextStars = Math.max(0, stars - 1);
    setLevel(next);
    setStars(nextStars);
    initGame(next);

    if (user) {
      const currentNickname = nickname.trim() || '익명 유저';
      try {
        const progressRef = doc(db, 'artifacts', appId, 'users', user.uid, 'gameData', 'progress');
        await setDoc(progressRef, { level: next, nickname: currentNickname, stars: nextStars }, { merge: true });

        const lbRef = doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid);
        await setDoc(lbRef, { level: next, nickname: currentNickname, updatedAt: Date.now() }, { merge: true });
      } catch (error) {
        console.error("저장 실패:", error);
      }
    }
  };

  const normalTubes = tubes.filter(t => !t.isGiant);
  const giantTube = tubes.find(t => t.isGiant);
  const half = Math.ceil(normalTubes.length / 2);
  const leftTubes = normalTubes.slice(0, half);
  const rightTubes = normalTubes.slice(half);

  // 개별 병 렌더링 함수
  const renderTube = (tube, side, originalIndex) => {
    if (!tube) return null;
    const isSelected = selectedTube === originalIndex;
    const isGiant = tube.isGiant;
    
    // 완성 여부 확인 (꽉 차있고 모든 색상이 같음)
    let isCompleted = tube.contents.length === tube.capacity && 
                        tube.contents.every(c => c === tube.contents[0]) && 
                        tube.contents.length > 0;
    
    // 예외: 목표 색상(핫핑크)으로 꽉 찬 '작은 병'은 마개가 생기지 않음
    if (!tube.isGiant && tube.contents[0] === TARGET_COLOR) {
      isCompleted = false;
    }
    
    let transformClass = "hover:-translate-y-2 hover:brightness-110";
    if (isSelected) {
      if (side === 'left') transformClass = "-translate-y-8 z-50 drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105";
      else if (side === 'right') transformClass = "-translate-y-8 z-50 drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105";
      else transformClass = "-translate-y-4 z-50 drop-shadow-[0_0_35px_rgba(255,20,147,0.8)] scale-105";
    } else {
      transformClass += " z-10";
    }

    const bodyWidth = isGiant ? 'w-10 sm:w-14' : 'w-7 sm:w-10';
    const bodyHeight = isGiant ? 'h-[50vh] sm:h-[60vh]' : 'h-24 sm:h-36';
    const neckWidth = isGiant ? 'w-6 sm:w-8' : 'w-4 sm:w-6';

    return (
      <div 
        key={tube.id}
        onClick={() => handleTubeClick(originalIndex)}
        className={`relative flex flex-col items-center cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom ${transformClass}`}
      >
        {/* 코르크 마개 애니메이션 */}
        {isCompleted && (
          <div className={`absolute z-40 animate-cork flex flex-col items-center pointer-events-none ${isGiant ? '-top-4 sm:-top-5' : '-top-2 sm:-top-3'}`}>
            {/* 마개 윗부분 */}
            <div className={`${isGiant ? 'w-9 sm:w-12 h-3 sm:h-4' : 'w-6 sm:w-8 h-2 sm:h-3'} bg-[#e2a76f] rounded-[50%] -mb-[0.4rem] sm:-mb-[0.6rem] z-20 border border-[#8e5b2d] shadow-inner`}></div>
            {/* 마개 몸통 */}
            <div className={`${isGiant ? 'w-8 sm:w-10 h-5 sm:h-6' : 'w-5 sm:w-6 h-3 sm:h-4'} bg-[#c88b4f] z-10 border-x border-b border-[#8e5b2d] shadow-[inset_0_-3px_5px_rgba(0,0,0,0.4)] rounded-b-sm`}></div>
          </div>
        )}

        <div className={`${isGiant ? 'w-8 sm:w-10 h-3' : 'w-5 sm:w-7 h-2'} border-[2px] border-white/60 rounded-[50%] -mb-[0.4rem] sm:-mb-[0.5rem] z-30 bg-white/5`}></div>
        <div className={`${neckWidth} h-4 border-x-[2px] border-white/50 bg-white/5 z-20 backdrop-blur-sm`}></div>
        
        <div className={`
          ${bodyWidth} ${bodyHeight} border-[3px] border-white/40 rounded-b-[1.25rem] sm:rounded-b-[1.5rem] rounded-t-lg bg-white/5 relative shadow-[inset_0_0_25px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden
        `}>
          <div className="absolute top-2 bottom-2 left-[10%] w-[25%] bg-gradient-to-r from-white/40 to-transparent rounded-full z-20 pointer-events-none"></div>

          {/* 찰랑이는 액체를 감싸는 래퍼 */}
          <div className="absolute inset-0 z-0 origin-bottom">
            
            {/* 액체 본체 (상단 표면만 찰랑임) */}
            <div className="w-full h-full flex flex-col-reverse origin-bottom">
              {tube.contents.map((colorClass, colorIndex) => {
                const isTop = colorIndex === tube.contents.length - 1;
                const isBottom = colorIndex === 0;
                return (
                  <div 
                    key={`${tube.id}-${colorIndex}`}
                    className={`w-full ${colorClass} transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative ${isBottom ? 'rounded-b-[1rem] sm:rounded-b-[1.25rem]' : ''}`}
                    style={{ height: `${100 / tube.capacity}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none mix-blend-overlay"></div>
                    
                    {/* 수면 파도 효과 (맨 윗층) */}
                    {isTop && (
                      <div className={`absolute -top-1.5 sm:-top-2 left-0 right-0 h-3 sm:h-4 ${colorClass} animate-surface shadow-[inset_0_3px_5px_rgba(255,255,255,0.7)] z-10 transition-colors duration-500 pointer-events-none`}></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0b2e] via-[#2a1352] to-[#4c167d] text-slate-100 flex flex-col font-sans selection:bg-transparent touch-manipulation overflow-hidden relative">
      
      {/* 찰랑이는 액체 및 코르크 마개 애니메이션용 CSS */}
      <style>{`
        @keyframes surface-wave {
          0%, 100% { border-radius: 40% 60% 55% 45% / 40% 50% 60% 50%; }
          50% { border-radius: 60% 40% 45% 55% / 50% 60% 40% 50%; }
        }
        @keyframes cork-drop {
          0% { transform: translateY(-30px); opacity: 0; }
          60% { transform: translateY(5px); opacity: 1; }
          80% { transform: translateY(-2px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-surface {
          animation: surface-wave 2s ease-in-out infinite;
        }
        .animate-cork {
          animation: cork-drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          animation-delay: 0.4s; /* 물감이 차오르는 시간을 기다려줌 */
          opacity: 0;
        }
      `}</style>

      <div className="absolute bottom-0 left-0 right-0 h-[25vh] bg-purple-900/40 rounded-t-[50%_20%] blur-3xl -z-0 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[10vh] bg-gradient-to-t from-purple-800/80 to-transparent -z-0 pointer-events-none"></div>

      <div className="flex justify-between items-start w-full px-4 sm:px-8 pt-6 pb-2 z-20">
        <div className="flex flex-col items-center">
          <div className="relative bg-purple-900/60 p-2 rounded-xl border border-purple-500/30 flex items-center gap-1 shadow-lg backdrop-blur-sm">
             <div className="text-yellow-400 font-black text-xl">⭐</div>
             <span className="font-bold text-sm bg-purple-800 px-2 py-0.5 rounded text-white">{stars}</span>
          </div>
        </div>

        <div className="flex flex-col items-center flex-1 mx-4">
          <h1 className="text-xl sm:text-2xl font-black text-white drop-shadow-md mb-1">
            Level {level}
          </h1>
          
          <div className="flex gap-4 mt-4">
            <button 
              onClick={handleUndo} disabled={history.length === 0 || isWon}
              className={`p-2 rounded-full ${history.length === 0 || isWon ? 'text-white/30' : 'text-white hover:bg-white/10 active:scale-90'} transition-all`}
            >
              <Undo2 size={24} />
            </button>
            <button 
              onClick={() => initGame(level)} 
              className="p-2 rounded-full text-white hover:bg-white/10 active:scale-90 transition-all"
            >
              <RotateCcw size={24} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setShowLeaderboard(true)}
            className="w-12 h-12 bg-purple-600/80 hover:bg-purple-500 rounded-2xl flex justify-center items-center text-yellow-300 shadow-lg border-2 border-purple-400 transition-colors"
            title="랭킹 보기"
          >
            <Trophy size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex justify-center items-end w-full max-w-5xl mx-auto px-2 pb-[5vh] sm:pb-[10vh] z-10">
        <div className="flex-1 flex justify-end pr-2 sm:pr-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-6 place-items-center w-full max-w-[250px]">
            {leftTubes.map(tube => {
              const originIndex = tubes.findIndex(t => t.id === tube.id);
              return renderTube(tube, 'left', originIndex);
            })}
          </div>
        </div>

        <div className="flex-shrink-0 relative z-0 mx-2">
           {renderTube(giantTube, 'giant', tubes.findIndex(t => t.id === giantTube.id))}
        </div>

        <div className="flex-1 flex justify-start pl-2 sm:pl-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-6 place-items-center w-full max-w-[250px]">
            {rightTubes.map(tube => {
              const originIndex = tubes.findIndex(t => t.id === tube.id);
              return renderTube(tube, 'right', originIndex);
            })}
          </div>
        </div>
      </div>

      <div className="text-center pb-4 text-white/50 text-sm font-medium z-20 pointer-events-none">
        색깔을 분류하고 거대 병을 찰랑거리는 핫핑크 물결로 꽉 채우세요!
      </div>

      {!isLoaded && (
        <div className="fixed inset-0 bg-[#1a0b2e] z-50 flex items-center justify-center">
          <div className="animate-pulse text-purple-300 font-bold text-xl">데이터 동기화 중...</div>
        </div>
      )}

      {showLeaderboard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#2a1352] w-full max-w-md rounded-3xl shadow-2xl border-2 border-purple-500/50 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-purple-500/30 bg-purple-900/40">
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600 flex items-center gap-2">
                <Trophy fill="currentColor" size={28} /> 명예의 전당
              </h2>
              <button onClick={() => setShowLeaderboard(false)} className="text-purple-300 hover:text-white transition-colors">
                <X size={28} />
              </button>
            </div>
            
            <div className="p-6 bg-purple-900/20 border-b border-purple-500/30">
              <label className="block text-sm font-bold text-purple-200 mb-2">내 닉네임 설정</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임을 입력하세요"
                  maxLength={10}
                  className="flex-1 bg-black/30 border border-purple-500/50 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <p className="text-xs text-purple-300/70 mt-2">* 레벨을 클리어할 때 내 닉네임과 레벨이 랭킹에 갱신됩니다.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {leaderboard.length === 0 ? (
                <div className="text-center text-purple-300/50 py-10">아직 등록된 랭킹이 없습니다.</div>
              ) : (
                leaderboard.map((player, idx) => (
                  <div key={player.id} className={`flex items-center justify-between p-4 rounded-2xl ${user && player.id === user.uid ? 'bg-gradient-to-r from-purple-600/60 to-indigo-600/60 border border-purple-400/50' : 'bg-black/20'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${idx === 0 ? 'bg-yellow-400 text-black shadow-[0_0_10px_rgba(250,204,21,0.5)]' : idx === 1 ? 'bg-slate-300 text-black' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-purple-800 text-purple-200'}`}>
                        {idx + 1}
                      </div>
                      <span className="font-bold text-lg text-white">{player.nickname}</span>
                    </div>
                    <div className="font-black text-yellow-400 text-xl">Lv.{player.level}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showWinPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-[#2a1352] p-8 rounded-3xl shadow-2xl flex flex-col items-center transform scale-100 animate-in zoom-in-95 duration-300 border-2 border-purple-500/50 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent pointer-events-none"></div>
            
            <div className="text-7xl mb-6 animate-bounce">🎉</div>
            <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-purple-200 mb-2 drop-shadow-sm">
              레벨 {level} 클리어!
            </h2>
            <p className="text-purple-200/80 mb-8 font-medium">거대 물병을 찰랑이는 핫핑크 물결로 완벽하게 채웠습니다!</p>
            
            <button 
              onClick={nextLevel}
              className="px-10 py-4 bg-gradient-to-b from-green-400 to-green-600 hover:from-green-300 hover:to-green-500 text-white rounded-full font-black text-xl flex items-center gap-2 transition-transform active:scale-95 shadow-[0_10px_20px_rgba(22,163,74,0.4)] border border-green-300/50"
            >
              <Play fill="currentColor" size={24} />
              다음 레벨
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
