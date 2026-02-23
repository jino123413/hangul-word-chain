import React, { useMemo, useRef, useState } from 'react';
import { DeviceViewport } from './components/DeviceViewport';
import BannerAd from './components/BannerAd';
import { useInterstitialAd, useJsonStorage } from './hooks';
import { isHangulWord, normalizeWord, verifyKoreanWord } from './game/wordValidation';

type GamePhase = 'playing' | 'ended';
type ViewMode = 'home' | 'game';

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
const BANNER_AD_GROUP_ID = 'ait.v2.live.56d161ad30744fbf';
const HINT_AD_LIMIT = 2;

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

  const initial = useMemo(() => buildInitialState(todayKey), [todayKey]);
  const localDictionary = useMemo(() => new Set([...STARTER_WORDS, ...WORD_POOL]), []);
  const validationCacheRef = useRef<Map<string, boolean>>(new Map());

  const [inputWord, setInputWord] = useState('');
  const [requiredChar, setRequiredChar] = useState(initial.required);
  const [usedWords, setUsedWords] = useState<string[]>(initial.usedWords);
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [view, setView] = useState<ViewMode>('home');
  const [hasActiveGame, setHasActiveGame] = useState(false);
  const [statusText, setStatusText] = useState('단어를 입력해 이어가 보세요.');
  const [reviveUsed, setReviveUsed] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [hintAdUsedCount, setHintAdUsedCount] = useState(0);

  const { value: profile, save: saveProfile, loading: profileLoading } = useJsonStorage<SavedProfile>(
    STORAGE_KEY,
    DEFAULT_PROFILE,
  );
  const { loading: adLoading, showAd } = useInterstitialAd(AD_GROUP_ID);

  const bestToday = profile.dailyBest[todayKey] ?? 0;
  const canSubmit = inputWord.trim().length > 0 && phase === 'playing' && !isValidating;
  const hasMidGame = hasActiveGame && phase === 'playing';
  const hintAdLimitReached = hintAdUsedCount >= HINT_AD_LIMIT;

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
    setHasActiveGame(false);
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

  const getWrongStatusText = (baseMessage: string, nextWrongStreak: number) => {
    if (nextWrongStreak >= 2 && !hintAdLimitReached) {
      return `${baseMessage} 막히면 AD 힌트를 써보세요.`;
    }
    return baseMessage;
  };

  const markWrongAttempt = (baseMessage: string) => {
    const nextWrongStreak = wrongStreak + 1;
    setWrongStreak(nextWrongStreak);
    setStatusText(getWrongStatusText(baseMessage, nextWrongStreak));
  };

  const handlePlay = async () => {
    if (phase !== 'playing' || isValidating) {
      return;
    }

    const normalized = normalizeWord(inputWord);
    if (!isHangulWord(normalized)) {
      markWrongAttempt('한글 2글자 이상 단어를 입력해 주세요.');
      return;
    }

    if (!normalized.startsWith(requiredChar)) {
      markWrongAttempt(`'${requiredChar}'로 시작하는 단어여야 해요.`);
      return;
    }

    if (usedWords.includes(normalized)) {
      markWrongAttempt('이미 나온 단어예요. 다른 단어를 입력해 주세요.');
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
      markWrongAttempt('사전에 없는 단어예요. 다른 단어를 입력해 주세요.');
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
    setWrongStreak(0);

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

  const resetGame = () => {
    const next = buildInitialState(todayKey);
    setInputWord('');
    setRequiredChar(next.required);
    setUsedWords(next.usedWords);
    setTurns(next.turns);
    setScore(0);
    setWrongStreak(0);
    setHintAdUsedCount(0);
    setReviveUsed(false);
    setPhase('playing');
    setHasActiveGame(true);
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
    setHasActiveGame(true);
    setWrongStreak(0);
    setStatusText(`구조 성공! '${nextRequired}'로 다시 이어가 보세요.`);
  };

  const applyHintReward = () => {
    if (phase !== 'playing') {
      return;
    }

    if (hintAdLimitReached) {
      setStatusText(`AD 힌트는 이번 판에서 최대 ${HINT_AD_LIMIT}번까지 사용할 수 있어요.`);
      return;
    }

    const hintWord = pickComputerWord(
      requiredChar,
      new Set(usedWords),
      `${todayKey}-hint-${usedWords.length}-${hintAdUsedCount}`,
    );

    if (!hintWord) {
      setStatusText('지금은 사용할 수 있는 힌트 단어가 없어요.');
      return;
    }

    const nextHintAdUsedCount = hintAdUsedCount + 1;
    const nextRequiredChar = getLastChar(hintWord);

    setUsedWords([...usedWords, hintWord]);
    setTurns([...turns, { speaker: 'system', word: hintWord, note: '광고 힌트 단어' }]);
    setRequiredChar(nextRequiredChar);
    setWrongStreak(0);
    setHintAdUsedCount(nextHintAdUsedCount);
    setStatusText(
      `AD 힌트 ${nextHintAdUsedCount}/${HINT_AD_LIMIT} 사용 완료! '${nextRequiredChar}'로 이어가 보세요.`,
    );
  };

  const handleHintAd = () => {
    if (phase !== 'playing' || adLoading || hintAdLimitReached) {
      return;
    }
    showAd({ onDismiss: applyHintReward });
  };

  const handleEndRound = () => {
    if (phase !== 'playing') {
      return;
    }
    endGame('이번 판을 종료했어요.');
  };

  const handleGoHome = () => {
    setView('home');
  };

  const handleStartFromHome = () => {
    resetGame();
    setView('game');
  };

  const handleContinueFromHome = () => {
    if (!hasMidGame) {
      return;
    }
    setView('game');
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
      <div
        className="font-gmarket px-4 max-w-xl mx-auto"
        style={{
          minHeight: 'var(--min-height, 100vh)',
          paddingBottom: 'calc(var(--bottom-padding, 32px) + 16px)',
        }}
      >
        {view === 'home' ? (
          <section className="pt-10">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
              <p className="mt-1 text-sm text-slate-600">한 판씩 가볍게 이어가는 한글 끝말잇기.</p>
              <p className="mt-4 text-sm text-slate-700">
                시작 단어: <strong className="text-slate-900">{initial.starter}</strong>
              </p>

              <div className="mt-5 flex gap-2">
                <button
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
                  onClick={handleStartFromHome}
                >
                  새 게임 시작
                </button>
                {hasMidGame && (
                  <button
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    onClick={handleContinueFromHome}
                  >
                    이어하기
                  </button>
                )}
              </div>

              <p className="mt-3 text-[11px] text-slate-500">오늘 최고 {bestToday}점</p>
            </div>
          </section>
        ) : (
          <section className="pt-6">
            <header className="mb-3 flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">{APP_NAME}</h1>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
                onClick={handleGoHome}
              >
                홈
              </button>
            </header>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {phase === 'playing' ? (
                <>
                  <p className="text-sm text-slate-700">
                    필수 글자 <strong className="text-slate-900">{requiredChar}</strong>
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder={`${requiredChar}로 시작하는 단어`}
                      value={inputWord}
                      onChange={(event) => setInputWord(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handlePlay();
                        }
                      }}
                    />
                    <button
                      className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
                      onClick={handlePlay}
                      disabled={!canSubmit}
                    >
                      {isValidating ? '검증 중...' : '제출'}
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{statusText}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                      onClick={handleEndRound}
                    >
                      이번 판 종료
                    </button>
                    <button
                      className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs text-cyan-800 disabled:opacity-40"
                      disabled={adLoading || hintAdLimitReached}
                      onClick={handleHintAd}
                    >
                      {adLoading ? '광고 로딩 중...' : `AD 힌트 보기 (${hintAdUsedCount}/${HINT_AD_LIMIT})`}
                    </button>
                  </div>
                  {wrongStreak >= 2 && !hintAdLimitReached && (
                    <p className="mt-2 text-xs text-cyan-700">자꾸 틀리면 AD 힌트로 다음 단어를 받아보세요.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">라운드 종료</p>
                  <p className="mt-1 text-sm text-slate-600">
                    이번 점수 {score}점 · 오늘 최고 {Math.max(bestToday, score)}점
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{statusText}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                      onClick={resetGame}
                    >
                      다시하기
                    </button>
                    <button
                      className="rounded-lg border border-cyan-200 px-3 py-2 text-sm text-cyan-800 disabled:opacity-40"
                      disabled={reviveUsed || adLoading}
                      onClick={() => {
                        showAd({ onDismiss: reviveGame });
                      }}
                    >
                      AD 이어하기
                    </button>
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                      onClick={handleGoHome}
                    >
                      홈으로
                    </button>
                  </div>
                  <div className="mt-4">
                    <BannerAd adGroupId={BANNER_AD_GROUP_ID} />
                  </div>
                </>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-100 px-3 py-2">
                  <p className="text-[11px] text-slate-500">현재 점수</p>
                  <p className="text-base font-bold text-slate-900">{score}</p>
                </div>
                <div className="rounded-lg bg-slate-100 px-3 py-2">
                  <p className="text-[11px] text-slate-500">오늘 최고</p>
                  <p className="text-base font-bold text-slate-900">{bestToday}</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default App;
