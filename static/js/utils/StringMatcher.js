// ===================================================================
// StringMatcher.js - 깔끔한 ES6 모듈 구조
// ===================================================================

/**
 * 간단한 유사 매칭
 */
export function simpleMatch(text, search) {
  text = text.toLowerCase().trim();
  search = search.toLowerCase().trim();

  if (text.includes(search)) return true;

  const keywords = search.split(/\s+/).filter((k) => k.length > 0);
  return keywords.every(
    (keyword) =>
      text.includes(keyword) || (keyword.length >= 3 && text.includes(keyword.slice(0, -1)))
  );
}

/**
 * 고급 매칭
 */
export function advancedMatch(text, search, options = {}) {
  const {
    exactMatch = true,
    fuzzyMatch = true,
    fuzzyThreshold = 0.6,
    partialMatch = true,
    ignoreSpecialChars = true,
    multiKeyword = true,
  } = options;

  text = text.toLowerCase().trim();
  search = search.toLowerCase().trim();

  if (ignoreSpecialChars) {
    text = text.replace(/[^\w\s가-힣]/g, '');
    search = search.replace(/[^\w\s가-힣]/g, '');
  }

  if (exactMatch && text.includes(search)) {
    return { match: true, score: 1.0, type: 'exact' };
  }

  if (multiKeyword) {
    const searchWords = search.split(/\s+/).filter((w) => w.length > 0);
    if (searchWords.length > 1) {
      const matchedWords = searchWords.filter((word) => text.includes(word));
      if (matchedWords.length === searchWords.length) {
        return { match: true, score: 0.95, type: 'multi-keyword' };
      }
    }
  }

  return { match: false, score: 0, type: 'none' };
}

/**
 * Levenshtein Distance 계산
 */
export function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * 유사도 계산
 */
export function similarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// ===================================================================
// 사용법 예시:
//
// import { simpleMatch, advancedMatch } from './StringMatcher.js';
//
// const result = simpleMatch("서울-MSPP-L-0701", "서울 MSPP");
// console.log(result); // true
// ===================================================================
