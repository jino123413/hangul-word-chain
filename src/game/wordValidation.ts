type Turn = {
  speaker: 'system' | 'player' | 'computer';
  word: string;
};

type LocalDictionary = ReadonlySet<string> | readonly string[];

type VerifyKoreanWordParams = {
  word: string;
  localDictionary: LocalDictionary;
  cache: Map<string, boolean>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 3000;

export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, '');
}

export function isHangulWord(word: string): boolean {
  return /^[가-힣]{2,}$/.test(normalizeWord(word));
}

export function countChallengeWords(turns: Turn[], challengeLetter: string): number {
  const normalizedChallengeLetter = normalizeWord(challengeLetter);
  if (!normalizedChallengeLetter) {
    return 0;
  }

  return turns.filter((turn) => turn.speaker === 'player' && normalizeWord(turn.word).startsWith(normalizedChallengeLetter)).length;
}

function hasInLocalDictionary(localDictionary: LocalDictionary, word: string): boolean {
  if (localDictionary instanceof Set) {
    return localDictionary.has(word);
  }
  if (Array.isArray(localDictionary)) {
    return localDictionary.includes(word);
  }
  return false;
}

function hasValidWiktionaryPage(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const query = (payload as { query?: unknown }).query;
  if (!query || typeof query !== 'object') {
    return false;
  }

  const pages = (query as { pages?: unknown }).pages;
  if (!pages || typeof pages !== 'object') {
    return false;
  }

  return Object.values(pages as Record<string, unknown>).some((page) => {
    if (!page || typeof page !== 'object') {
      return false;
    }

    return !Object.prototype.hasOwnProperty.call(page, 'missing');
  });
}

async function checkWiktionary(word: string, fetcher: typeof fetch, timeoutMs: number): Promise<boolean> {
  const url = `https://ko.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&format=json&origin=*`;
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Request timed out'));
      }, timeoutMs);
    });

    const response = (await Promise.race([
      fetcher(url, { signal: controller.signal }),
      timeoutPromise,
    ])) as Response;

    const payload = (await response.json()) as unknown;
    return hasValidWiktionaryPage(payload);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function verifyKoreanWord({
  word,
  localDictionary,
  cache,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: VerifyKoreanWordParams): Promise<boolean> {
  const normalizedWord = normalizeWord(word);
  if (!isHangulWord(normalizedWord)) {
    cache.set(normalizedWord, false);
    return false;
  }

  if (hasInLocalDictionary(localDictionary, normalizedWord)) {
    cache.set(normalizedWord, true);
    return true;
  }

  const cachedValue = cache.get(normalizedWord);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  try {
    const exists = await checkWiktionary(normalizedWord, fetcher, timeoutMs);
    cache.set(normalizedWord, exists);
    return exists;
  } catch {
    cache.set(normalizedWord, false);
    return false;
  }
}

export type { Turn, VerifyKoreanWordParams };
