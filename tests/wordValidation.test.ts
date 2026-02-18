import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countChallengeWords,
  isHangulWord,
  normalizeWord,
  verifyKoreanWord,
} from '../src/game/wordValidation.ts';

test('normalizeWord trims and removes whitespace', () => {
  assert.equal(normalizeWord('  사 과  '), '사과');
  assert.equal(normalizeWord('\n바  나 나\t'), '바나나');
});

test('isHangulWord only accepts 2+ Hangul characters', () => {
  assert.equal(isHangulWord('사과'), true);
  assert.equal(isHangulWord('가'), false);
  assert.equal(isHangulWord('apple'), false);
  assert.equal(isHangulWord('가1'), false);
});

test('countChallengeWords counts only player words with challenge letter', () => {
  const turns = [
    { speaker: 'system' as const, word: '가방' },
    { speaker: 'player' as const, word: '가위' },
    { speaker: 'computer' as const, word: '가을' },
    { speaker: 'player' as const, word: '나무' },
    { speaker: 'player' as const, word: '가게' },
  ];

  assert.equal(countChallengeWords(turns, '가'), 2);
  assert.equal(countChallengeWords(turns, '나'), 1);
});

test('verifyKoreanWord returns true from local dictionary without fetch', async () => {
  const cache = new Map<string, boolean>();
  const localDictionary = new Set(['호랑이']);
  let fetchCalls = 0;

  const fetcher = (async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called');
  }) as typeof fetch;

  const result = await verifyKoreanWord({
    word: '호랑이',
    localDictionary,
    cache,
    fetcher,
  });

  assert.equal(result, true);
  assert.equal(fetchCalls, 0);
  assert.equal(cache.get('호랑이'), true);
});

test('verifyKoreanWord checks remote dictionary and caches success', async () => {
  const cache = new Map<string, boolean>();
  const localDictionary = new Set<string>();
  let requestedUrl = '';

  const fetcher = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return {
      json: async () => ({
        query: {
          pages: {
            '123': { pageid: 123, title: '사과' },
          },
        },
      }),
    } as Response;
  }) as typeof fetch;

  const result = await verifyKoreanWord({
    word: '사과',
    localDictionary,
    cache,
    fetcher,
  });

  assert.equal(result, true);
  assert.equal(cache.get('사과'), true);
  assert.ok(requestedUrl.includes('https://ko.wiktionary.org/w/api.php?action=query'));
  assert.ok(requestedUrl.includes('titles=%EC%82%AC%EA%B3%BC'));
  assert.ok(requestedUrl.includes('format=json'));
  assert.ok(requestedUrl.includes('origin=*'));
});

test('verifyKoreanWord returns false when remote page is missing and caches it', async () => {
  const cache = new Map<string, boolean>();
  const localDictionary = new Set<string>();

  const fetcher = (async () => {
    return {
      json: async () => ({
        query: {
          pages: {
            '-1': { ns: 0, title: '없는단어', missing: '' },
          },
        },
      }),
    } as Response;
  }) as typeof fetch;

  const result = await verifyKoreanWord({
    word: '없는단어',
    localDictionary,
    cache,
    fetcher,
  });

  assert.equal(result, false);
  assert.equal(cache.get('없는단어'), false);
});

test('verifyKoreanWord uses cache and skips fetch', async () => {
  const cache = new Map<string, boolean>([['고양이', true]]);
  const localDictionary = new Set<string>();
  let fetchCalls = 0;

  const fetcher = (async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called');
  }) as typeof fetch;

  const result = await verifyKoreanWord({
    word: '고양이',
    localDictionary,
    cache,
    fetcher,
  });

  assert.equal(result, true);
  assert.equal(fetchCalls, 0);
});
