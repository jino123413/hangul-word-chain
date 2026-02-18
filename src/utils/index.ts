/**
 * Utils 모듈 export
 *
 * TODO: 앱에 필요한 유틸리티 함수들을 여기에 추가하세요
 */

// 예시: 숫자 포맷
export function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

// 예시: 고유 ID 생성
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
