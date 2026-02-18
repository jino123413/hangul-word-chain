import React, { useMemo, useRef, useState } from 'react';
import { DeviceViewport } from './components/DeviceViewport';
import { useInterstitialAd, useJsonStorage } from './hooks';
import { countChallengeWords, isHangulWord, normalizeWord, verifyKoreanWord } from './game/wordValidation';

type GamePhase = 'playing' | 'ended';

type Turn = {
  speaker: 'system' | 'player' | 'computer';
  word: string;
  note?: string;
};

type SavedProfile = {
  bestScore: number;
  totalGames: number;
  totalWords: number;
  collection: string[];
  dailyBest: Record<string, number>;
};

const APP_NAME = '끝말잇기 챌린지';
const STORAGE_KEY = 'hangul-word-chain-profile-v1';
const AD_GROUP_ID = 'ait.v2.live.f1653f8005f848ac';

const STARTER_WORDS = [
  '바다', '고양이', '지도', '소나무', '연필', '자전거', '시장', '우산', '리본', '기차',
];

const WORD_POOL = [
  '다리', '리본', '본능', '능력', '력사', '사과', '과자', '자전거', '거울', '울타리',
  '리듬', '듬직', '직업', '업무', '무지개', '개나리', '리더', '더위', '위로', '로봇',
  '봇짐', '짐승', '승리', '리본', '본보기', '기차', '차표', '표정', '정보', '보석',
  '석양', '양말', '말풍선', '선물', '물결', '결심', '심장', '장난감', '감자', '자석',
  '석탄', '탄산', '산책', '책상', '상자', '자동차', '차선', '선글라스', '스티커', '커피',
  '피아노', '노래', '레몬', '몬스터', '터널', '널판지', '지갑', '갑옷', '옷걸이', '이불',
  '불꽃', '꽃다발', '발자국', '국자', '자물쇠', '쇠고기', '기름', '음악', '악보', '보라',
  '라면', '면도기', '기린', '린스', '스케치', '치마', '마차', '차림', '림프', '프로필',
  '필통', '통로', '로켓', '켓백', '백과', '과일', '일기', '기억', '억양', '양초',
  '초코', '코끼리', '리본끈', '끈기', '기회', '회전', '전구', '구름', '름자', '자유',
  '유리', '리본댁', '객실', '실험', '험담', '담요', '요리', '리더십', '십자', '자동문',
  '문장', '장미', '미소', '소금', '금메달', '달력', '역사', '사전', '전등', '등대',
  '대문', '문어', '어항', '항구', '구두', '두부', '부채', '채소', '소나기', '기상',
  '상상', '상어', '어깨', '깨달음', '음표', '표시', '시계', '계단', '단추', '추억',
];

const DEFAULT_PROFILE: SavedProfile = {
  bestScore: 0,
  totalGames: 0,
  totalWords: 0,
  collection: [],
  dailyBest: {},
};

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashString(value: string): number {
  return value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function pickBySeed<T>(items: T[], seedText: string): T {
  const idx = hashString(seedText) % items.length;
  return items[idx];
}

function getLastChar(word: string): string {
  return word[word.length - 1] ?? '';
}

function pickComputerWord(required: string, used: Set<string>, seedText: string): string | null {
  const candidates = WORD_POOL.filter((word) => word.startsWith(required) && !used.has(word));
  if (candidates.length === 0) {
    return null;
  }
  return pickBySeed(candidates, seedText);
}

function buildInitialState(todayKey: string) {
  const starter = pickBySeed(STARTER_WORDS, todayKey);
  return {
    starter,
    required: getLastChar(starter),
    usedWords: [starter],
    turns: [{ speaker: 'system', word: starter, note: '오늘의 시작 단어' }] as Turn[],
  };
}

const App: React.FC = () => {
  const todayKey = getTodayKey();
  const dailyHash = hashString(todayKey);
  const challengeTarget = 5 + (dailyHash % 4);
  const challengeLetter = ['가', '나', '다', '라', '마', '바', '사'][dailyHash % 7];

  const initial = useMemo(() => buildInitialState(todayKey), [todayKey]);
  const localDictionary = useMemo(() => new Set([...STARTER_WORDS, ...WORD_POOL]), []);
  const validationCacheRef = useRef<Map<string, boolean>>(new Map());

  const [inputWord, setInputWord] = useState('');
  const [requiredChar, setRequiredChar] = useState(initial.required);
  const [usedWords, setUsedWords] = useState<string[]>(initial.usedWords);
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [statusText, setStatusText] = useState('단어를 입력해 이어가 보세요.');
  const [reviveUsed, setReviveUsed] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const { value: profile, save: saveProfile, loading: profileLoading } = useJsonStorage<SavedProfile>(
    STORAGE_KEY,
    DEFAULT_PROFILE,
  );
  const { loading: adLoading, showAd } = useInterstitialAd(AD_GROUP_ID);

  const bestToday = profile.dailyBest[todayKey] ?? 0;
  const canSubmit = inputWord.trim().length > 0 && phase === 'playing' && !isValidating;
  const challengeWordCount = countChallengeWords(turns, challengeLetter);
  const challengeProgress = Math.min(100, (challengeWordCount / challengeTarget) * 100);
  const recentTurns = turns.slice(-8);
  const latestPlayerWord = [...turns].reverse().find((turn) => turn.speaker === 'player')?.word ?? '-';
  const latestComputerWord = [...turns].reverse().find((turn) => turn.speaker === 'computer')?.word ?? '-';

  const updateProfile = (nextScore: number, addWordsCount: number, playerWord?: string) => {
    const prevTodayBest = profile.dailyBest[todayKey] ?? 0;
    const collectionSet = new Set(profile.collection);

    if (playerWord) {
      collectionSet.add(playerWord);
    }

    const nextProfile: SavedProfile = {
      ...profile,
      bestScore: Math.max(profile.bestScore, nextScore),
      totalGames: profile.totalGames,
      totalWords: profile.totalWords + addWordsCount,
      collection: Array.from(collectionSet),
      dailyBest: {
        ...profile.dailyBest,
        [todayKey]: Math.max(prevTodayBest, nextScore),
      },
    };

    saveProfile(nextProfile);
  };

  const endGame = (message: string) => {
    setPhase('ended');
    setStatusText(message);
    const nextProfile: SavedProfile = {
      ...profile,
      bestScore: Math.max(profile.bestScore, score),
      totalGames: profile.totalGames + 1,
      dailyBest: {
        ...profile.dailyBest,
        [todayKey]: Math.max(profile.dailyBest[todayKey] ?? 0, score),
      },
    };
    saveProfile(nextProfile);
  };

  const handlePlay = async () => {
    if (phase !== 'playing' || isValidating) {
      return;
    }

    const normalized = normalizeWord(inputWord);
    if (!isHangulWord(normalized)) {
      setStatusText('한글 2글자 이상 단어를 입력해 주세요.');
      return;
    }

    if (!normalized.startsWith(requiredChar)) {
      setStatusText(`'${requiredChar}'로 시작하는 단어여야 해요.`);
      return;
    }

    if (usedWords.includes(normalized)) {
      setStatusText('이미 나온 단어예요. 다른 단어를 입력해 주세요.');
      return;
    }

    setIsValidating(true);
    let isValidWord = false;
    try {
      isValidWord = await verifyKoreanWord({
        word: normalized,
        localDictionary,
        cache: validationCacheRef.current,
      });
    } catch {
      isValidWord = false;
    } finally {
      setIsValidating(false);
    }

    if (!isValidWord) {
      setStatusText('사전에 없는 단어예요. 다른 단어를 입력해 주세요.');
      return;
    }

    const afterPlayer = [...usedWords, normalized];
    const afterPlayerSet = new Set(afterPlayer);
    const playerNextChar = getLastChar(normalized);
    const nextScore = score + 1;
    const nextTurns: Turn[] = [...turns, { speaker: 'player', word: normalized }];

    updateProfile(nextScore, 1, normalized);
    setInputWord('');
    setScore(nextScore);

    const computerWord = pickComputerWord(playerNextChar, afterPlayerSet, `${todayKey}-${afterPlayer.length}`);
    if (!computerWord) {
      setUsedWords(afterPlayer);
      setTurns(nextTurns);
      setRequiredChar(playerNextChar);
      endGame('축하해요! 상대가 단어를 찾지 못했어요.');
      return;
    }

    const afterComputer = [...afterPlayer, computerWord];
    const computerNextChar = getLastChar(computerWord);
    setUsedWords(afterComputer);
    setTurns([...nextTurns, { speaker: 'computer', word: computerWord }]);
    setRequiredChar(computerNextChar);
    setStatusText(`좋아요! 이제 '${computerNextChar}'로 시작하는 단어 차례예요.`);
  };

  const handleGiveUp = () => {
    if (phase !== 'playing') {
      return;
    }
    endGame('이번 판은 여기까지! 새 게임으로 다시 도전해 보세요.');
  };

  const resetGame = () => {
    const next = buildInitialState(todayKey);
    setInputWord('');
    setRequiredChar(next.required);
    setUsedWords(next.usedWords);
    setTurns(next.turns);
    setScore(0);
    setReviveUsed(false);
    setPhase('playing');
    setStatusText('새 게임 시작! 끝말을 이어 주세요.');
  };

  const reviveGame = () => {
    if (phase !== 'ended' || reviveUsed) {
      return;
    }

    const hint = pickComputerWord(requiredChar, new Set(usedWords), `${todayKey}-revive-${usedWords.length}`);
    if (!hint) {
      setStatusText('이어갈 수 있는 구조 단어가 없어요. 새 게임으로 도전해 주세요.');
      return;
    }

    const nextUsed = [...usedWords, hint];
    const nextRequired = getLastChar(hint);
    setUsedWords(nextUsed);
    setTurns([...turns, { speaker: 'system', word: hint, note: '광고 보상 구조 단어' }]);
    setRequiredChar(nextRequired);
    setReviveUsed(true);
    setPhase('playing');
    setStatusText(`구조 성공! '${nextRequired}'로 다시 이어가 보세요.`);
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-gmarket text-slate-600">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <>
      <DeviceViewport />
      <div className="min-h-screen font-gmarket px-4 pb-8 max-w-4xl mx-auto">
        <header className="pt-6 pb-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-primary font-medium">혼자 모드 · 릴레이 트랙</p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">{APP_NAME}</h1>
                <p className="text-sm text-slate-500 mt-1">끝말을 바통처럼 넘겨 이어가는 단어 릴레이</p>
              </div>
              <div className="rounded-xl bg-slate-100 px-3 py-2">
                <p className="text-[11px] text-slate-500">오늘 씨앗 단어</p>
                <p className="text-lg font-bold text-slate-900">{initial.starter}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">단어 릴레이 트랙</h2>
              <span
                className={`text-[11px] px-2 py-1 rounded-full ${
                  phase === 'playing' ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {phase === 'playing' ? '진행 중' : '라운드 종료'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-primary">구간 1 · 내 입력</p>
                <p className="text-sm text-slate-700 mt-1">
                  현재 시작 글자 <strong className="text-primary">{requiredChar}</strong>
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={`${requiredChar}로 시작하는 단어 입력`}
                    value={inputWord}
                    onChange={(event) => setInputWord(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handlePlay();
                      }
                    }}
                    disabled={phase === 'ended'}
                  />
                  <button
                    className="rounded-xl bg-primary text-white px-4 text-sm font-medium disabled:opacity-40"
                    onClick={handlePlay}
                    disabled={!canSubmit}
                  >
                    {isValidating ? '검증 중...' : '연결'}
                  </button>
                </div>
              </div>

              <div className="pl-4 border-l-2 border-dashed border-slate-200">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-primary">구간 2 · 응답 확인</p>
                  <p className="text-sm text-slate-600 mt-1">내 최근 단어: {latestPlayerWord}</p>
                  <p className="text-sm text-slate-600">상대 최근 단어: {latestComputerWord}</p>
                  <p className="text-sm text-slate-800 mt-1">
                    다음 목표 글자 <strong className="text-primary">{requiredChar}</strong>
                  </p>
                </div>
              </div>

              <div className="pl-8 border-l-2 border-dashed border-slate-200">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-primary">구간 3 · 판정 및 다음 행동</p>
                  <p className="text-sm text-slate-600 mt-1">{statusText}</p>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    {phase === 'playing' ? (
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
                        onClick={handleGiveUp}
                      >
                        이번 판 종료
                      </button>
                    ) : (
                      <>
                        <button
                          className="rounded-lg bg-slate-900 text-white px-3 py-2 text-xs"
                          onClick={resetGame}
                        >
                          새 게임 시작
                        </button>
                        <button
                          className="rounded-lg border border-cyan-200 px-3 py-2 text-xs text-cyan-800 disabled:opacity-40"
                          disabled={reviveUsed || adLoading}
                          onClick={() => {
                            showAd({ onDismiss: reviveGame });
                          }}
                        >
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-primary text-white text-[10px] mr-1">
                            AD
                          </span>
                          {adLoading ? '광고 준비 중...' : '광고 보고 이어하기'}
                        </button>
                      </>
                    )}
                  </div>

                  {phase === 'ended' && (
                    <p className="text-xs text-slate-500 mt-2">
                      광고 시청 후 1회만 구조 단어를 받아 이어갈 수 있어요.
                      {adLoading ? ' (광고 준비 중)' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-primary">오늘의 챌린지</p>
              <p className="text-sm text-slate-700 mt-1">
                '{challengeLetter}' 시작 단어 {challengeWordCount}/{challengeTarget}개 연결
              </p>
              <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${challengeProgress}%` }} />
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">트랙 대시보드</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600"><span>현재 점수</span><strong className="text-slate-900">{score}</strong></div>
                <div className="flex justify-between text-slate-600"><span>오늘 최고</span><strong className="text-slate-900">{bestToday}</strong></div>
                <div className="flex justify-between text-slate-600"><span>역대 최고</span><strong className="text-slate-900">{profile.bestScore}</strong></div>
                <div className="flex justify-between text-slate-600"><span>단어 수집</span><strong className="text-slate-900">{profile.collection.length}</strong></div>
                <div className="flex justify-between text-slate-600"><span>전체 플레이</span><strong className="text-slate-900">{profile.totalGames}</strong></div>
                <div className="flex justify-between text-slate-600"><span>누적 단어</span><strong className="text-slate-900">{profile.totalWords}</strong></div>
              </div>
            </div>
          </aside>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 p-4 mt-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">최근 릴레이 타임라인</h2>
          <div className="mt-3 overflow-x-auto">
            <ul className="flex gap-2 min-w-max pb-1">
              {recentTurns.map((turn, index) => (
                <li
                  key={`${turn.word}-${index}`}
                  className="rounded-lg px-3 py-2 text-sm border border-slate-200 bg-slate-50"
                >
                  <span
                    className={`font-semibold mr-2 ${
                      turn.speaker === 'player'
                        ? 'text-primary'
                        : turn.speaker === 'computer'
                          ? 'text-cyan-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {turn.speaker === 'player' ? '나' : turn.speaker === 'computer' ? '상대' : '시스템'}
                  </span>
                  <span className="text-slate-900">{turn.word}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
};

export default App;
