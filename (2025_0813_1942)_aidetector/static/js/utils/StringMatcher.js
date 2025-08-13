// ===================================================================
// StringMatcher.js
// 경보 장비 선택, 경보현황 테이블 검색 필터링 유사 매칭
// ===================================================================

/**
 * 간단한 유사 매칭 (콤마로 구분된 검색어는 OR 검색, 공백으로 구분된 검색어는 AND 검색)
 */
export function simpleMatch(text, search) {
  text = text.toLowerCase().trim();
  search = search.toLowerCase().trim();

  if (text.includes(search)) return true;

  // 콤마가 포함된 경우 OR 검색
  if (search.includes(',')) {
    const orTerms = search
      .split(',')
      .map((term) => term.trim())
      .filter((term) => term.length > 0);
    return orTerms.some((term) => {
      // 각 OR 항목에 대해 기존 AND 검색 로직 적용
      if (text.includes(term)) return true;

      const keywords = term.split(/\s+/).filter((k) => k.length > 0);
      return keywords.every(
        (keyword) =>
          text.includes(keyword) || (keyword.length >= 3 && text.includes(keyword.slice(0, -1)))
      );
    });
  }

  // 콤마가 없는 경우 기존 AND 검색
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
