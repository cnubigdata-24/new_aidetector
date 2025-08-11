/**
 * DOMBuilder - DOM 요소 생성 유틸리티 클래스
 *
 * DOM 요소 생성을 위한 통합된 패턴을 제공합니다.
 * 반복되는 DOM 생성 코드를 줄이고 일관성을 유지합니다.
 *
 * @author FaultDashboard Team
 * @version 1.0.0
 */

export class DOMBuilder {
  /**
   * 기본 DOM 요소를 생성합니다.
   *
   * @param {string} tag - HTML 태그 이름
   * @param {Object} attributes - 요소에 설정할 속성들
   * @param {Object} styles - 요소에 적용할 스타일들
   * @returns {HTMLElement} 생성된 DOM 요소
   *
   * @example
   * const div = DOMBuilder.createElement('div', {
   *   textContent: 'Hello',
   *   className: 'my-class'
   * }, { color: 'red' });
   */
  static createElement(tag, attributes = {}, styles = {}) {
    if (!tag || typeof tag !== 'string') {
      throw new Error('태그 이름은 유효한 문자열이어야 합니다.');
    }

    const element = document.createElement(tag);

    // 속성 설정 (null, undefined 값 제외)
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        try {
          element[key] = value;
        } catch (error) {
          console.warn(`속성 '${key}' 설정 실패:`, error);
        }
      }
    });

    // 스타일 적용
    if (styles && typeof styles === 'object') {
      try {
        Object.assign(element.style, styles);
      } catch (error) {
        console.warn('스타일 적용 실패:', error);
      }
    }

    return element;
  }

  /**
   * SELECT 요소의 OPTION을 생성합니다.
   *
   * @param {string|number} value - option의 value 속성
   * @param {string} text - option에 표시될 텍스트
   * @param {Object} options - 추가 옵션들
   * @param {string} options.title - 툴팁 텍스트
   * @param {boolean} options.disabled - 비활성화 여부
   * @param {Object} options.styles - 추가 스타일
   * @returns {HTMLOptionElement} 생성된 option 요소
   *
   * @example
   * const option = DOMBuilder.createOption('value1', '옵션 1', {
   *   title: '옵션 1 설명',
   *   disabled: false,
   *   styles: { color: 'blue' }
   * });
   */
  static createOption(value, text, options = {}) {
    if (value === undefined || value === null) {
      console.warn('Option value가 null 또는 undefined입니다.');
    }

    return this.createElement(
      'option',
      {
        value: String(value || ''),
        textContent: String(text || ''),
        title: options.title,
        disabled: Boolean(options.disabled),
      },
      options.styles || {}
    );
  }

  /**
   * BUTTON 요소를 생성합니다.
   *
   * @param {string} text - 버튼에 표시될 텍스트
   * @param {string} className - CSS 클래스명
   * @param {Object} attributes - 추가 속성들
   * @returns {HTMLButtonElement} 생성된 button 요소
   *
   * @example
   * const btn = DOMBuilder.createButton('클릭', 'btn-primary', {
   *   id: 'my-button',
   *   disabled: false,
   *   type: 'button'
   * });
   */
  static createButton(text, className = '', attributes = {}) {
    return this.createElement('button', {
      textContent: String(text || ''),
      className: String(className || ''),
      type: attributes.type || 'button', // 기본값 설정
      ...attributes,
    });
  }

  /**
   * DIV 요소를 생성합니다.
   *
   * @param {string} className - CSS 클래스명
   * @param {string} content - innerHTML 내용 (HTML 포함 가능)
   * @param {Object} attributes - 추가 속성들
   * @returns {HTMLDivElement} 생성된 div 요소
   *
   * @example
   * const div = DOMBuilder.createDiv('container', '<p>내용</p>', {
   *   id: 'my-div',
   *   'data-value': '123'
   * });
   */
  static createDiv(className = '', content = '', attributes = {}) {
    return this.createElement('div', {
      className: String(className || ''),
      innerHTML: String(content || ''),
      ...attributes,
    });
  }

  /**
   * SPAN 요소를 생성합니다.
   *
   * @param {string} text - span에 표시될 텍스트
   * @param {string} className - CSS 클래스명
   * @param {Object} styles - 인라인 스타일
   * @returns {HTMLSpanElement} 생성된 span 요소
   *
   * @example
   * const span = DOMBuilder.createSpan('상태', 'status-badge', {
   *   color: 'white',
   *   backgroundColor: 'green'
   * });
   */
  static createSpan(text, className = '', styles = {}) {
    return this.createElement(
      'span',
      {
        textContent: String(text || ''),
        className: String(className || ''),
      },
      styles
    );
  }

  /**
   * INPUT 요소를 생성합니다.
   *
   * @param {string} type - input 타입 (text, password, email 등)
   * @param {Object} attributes - 추가 속성들
   * @param {Object} styles - 인라인 스타일
   * @returns {HTMLInputElement} 생성된 input 요소
   *
   * @example
   * const input = DOMBuilder.createInput('text', {
   *   placeholder: '이름을 입력하세요',
   *   value: '',
   *   className: 'form-control'
   * });
   */
  static createInput(type = 'text', attributes = {}, styles = {}) {
    return this.createElement(
      'input',
      {
        type: String(type),
        ...attributes,
      },
      styles
    );
  }

  /**
   * A 요소 (링크)를 생성합니다.
   *
   * @param {string} href - 링크 URL
   * @param {string} text - 링크 텍스트
   * @param {Object} attributes - 추가 속성들
   * @param {Object} styles - 인라인 스타일
   * @returns {HTMLAnchorElement} 생성된 a 요소
   *
   * @example
   * const link = DOMBuilder.createLink('#', '더보기', {
   *   target: '_blank',
   *   className: 'btn-link'
   * });
   */
  static createLink(href = '#', text = '', attributes = {}, styles = {}) {
    return this.createElement(
      'a',
      {
        href: String(href),
        textContent: String(text),
        ...attributes,
      },
      styles
    );
  }

  /**
   * IMG 요소를 생성합니다.
   *
   * @param {string} src - 이미지 소스 URL
   * @param {string} alt - 대체 텍스트
   * @param {Object} attributes - 추가 속성들
   * @param {Object} styles - 인라인 스타일
   * @returns {HTMLImageElement} 생성된 img 요소
   *
   * @example
   * const img = DOMBuilder.createImage('/path/to/image.jpg', '설명', {
   *   className: 'thumbnail',
   *   width: '100',
   *   height: '100'
   * });
   */
  static createImage(src, alt = '', attributes = {}, styles = {}) {
    return this.createElement(
      'img',
      {
        src: String(src || ''),
        alt: String(alt || ''),
        ...attributes,
      },
      styles
    );
  }

  /**
   * TABLE 관련 요소들을 생성합니다.
   */
  static createTable(attributes = {}, styles = {}) {
    return this.createElement('table', attributes, styles);
  }

  static createTableRow(attributes = {}, styles = {}) {
    return this.createElement('tr', attributes, styles);
  }

  static createTableCell(content = '', isHeader = false, attributes = {}, styles = {}) {
    const tag = isHeader ? 'th' : 'td';
    return this.createElement(
      tag,
      {
        textContent: String(content),
        ...attributes,
      },
      styles
    );
  }

  static createTableHeader(content = '', attributes = {}, styles = {}) {
    return this.createTableCell(content, true, attributes, styles);
  }

  /**
   * UL/OL/LI 리스트 요소들을 생성합니다.
   */
  static createList(ordered = false, attributes = {}, styles = {}) {
    const tag = ordered ? 'ol' : 'ul';
    return this.createElement(tag, attributes, styles);
  }

  static createListItem(content = '', attributes = {}, styles = {}) {
    return this.createElement(
      'li',
      {
        textContent: String(content),
        ...attributes,
      },
      styles
    );
  }

  /**
   * FORM 관련 요소들을 생성합니다.
   */
  static createForm(attributes = {}, styles = {}) {
    return this.createElement(
      'form',
      {
        method: 'POST',
        ...attributes,
      },
      styles
    );
  }

  static createLabel(text = '', forId = '', attributes = {}, styles = {}) {
    return this.createElement(
      'label',
      {
        textContent: String(text),
        htmlFor: String(forId),
        ...attributes,
      },
      styles
    );
  }

  static createTextarea(attributes = {}, styles = {}) {
    return this.createElement(
      'textarea',
      {
        rows: '3',
        cols: '50',
        ...attributes,
      },
      styles
    );
  }

  static createSelect(attributes = {}, styles = {}) {
    return this.createElement('select', attributes, styles);
  }

  /**
   * 여러 요소를 한 번에 생성하고 부모에 추가합니다.
   *
   * @param {HTMLElement} parent - 부모 요소
   * @param {Array} elements - 생성할 요소들의 설정 배열
   * @returns {HTMLElement} 부모 요소
   *
   * @example
   * const container = DOMBuilder.createDiv('container');
   * DOMBuilder.appendChildren(container, [
   *   { tag: 'h1', attributes: { textContent: '제목' } },
   *   { tag: 'p', attributes: { textContent: '내용' } },
   *   { tag: 'button', attributes: { textContent: '버튼' } }
   * ]);
   */
  static appendChildren(parent, elements = []) {
    if (!parent || !parent.appendChild) {
      throw new Error('유효한 부모 요소가 필요합니다.');
    }

    elements.forEach((config) => {
      try {
        if (config.tag) {
          const element = this.createElement(
            config.tag,
            config.attributes || {},
            config.styles || {}
          );
          parent.appendChild(element);
        } else if (config.element) {
          parent.appendChild(config.element);
        }
      } catch (error) {
        console.error('자식 요소 추가 실패:', error);
      }
    });

    return parent;
  }

  /**
   * DocumentFragment를 사용하여 성능 최적화된 다중 요소 생성
   *
   * @param {Array} elements - 생성할 요소들의 설정 배열
   * @returns {DocumentFragment} 생성된 fragment
   *
   * @example
   * const fragment = DOMBuilder.createFragment([
   *   { tag: 'div', attributes: { textContent: '첫 번째' } },
   *   { tag: 'div', attributes: { textContent: '두 번째' } }
   * ]);
   * document.body.appendChild(fragment);
   */
  static createFragment(elements = []) {
    const fragment = document.createDocumentFragment();

    elements.forEach((config) => {
      try {
        if (config.tag) {
          const element = this.createElement(
            config.tag,
            config.attributes || {},
            config.styles || {}
          );
          fragment.appendChild(element);
        } else if (config.element) {
          fragment.appendChild(config.element);
        }
      } catch (error) {
        console.error('Fragment 요소 추가 실패:', error);
      }
    });

    return fragment;
  }

  /**
   * 템플릿 기반 요소 생성
   *
   * @param {string} template - HTML 템플릿 문자열
   * @param {Object} data - 템플릿에 바인딩할 데이터
   * @returns {HTMLElement} 생성된 요소
   *
   * @example
   * const template = '<div class="{{className}}">{{content}}</div>';
   * const element = DOMBuilder.createFromTemplate(template, {
   *   className: 'my-class',
   *   content: 'Hello World'
   * });
   */
  static createFromTemplate(template, data = {}) {
    if (!template || typeof template !== 'string') {
      throw new Error('유효한 템플릿 문자열이 필요합니다.');
    }

    let html = template;

    // 간단한 템플릿 엔진 ({{key}} 형태 치환)
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      html = html.replace(regex, String(value || ''));
    });

    // 임시 컨테이너를 사용하여 HTML 파싱
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = html;

    // 첫 번째 자식 요소 반환 (여러 요소가 있을 경우 첫 번째만)
    return tempContainer.firstElementChild || tempContainer;
  }

  /**
   * 조건부 클래스 적용
   *
   * @param {HTMLElement} element - 대상 요소
   * @param {Object} classMap - 클래스명과 조건의 매핑
   * @returns {HTMLElement} 처리된 요소
   *
   * @example
   * const element = DOMBuilder.createDiv();
   * DOMBuilder.conditionalClass(element, {
   *   'active': isActive,
   *   'disabled': isDisabled,
   *   'error': hasError
   * });
   */
  static conditionalClass(element, classMap = {}) {
    if (!element || !element.classList) {
      throw new Error('유효한 DOM 요소가 필요합니다.');
    }

    Object.entries(classMap).forEach(([className, condition]) => {
      if (condition) {
        element.classList.add(className);
      } else {
        element.classList.remove(className);
      }
    });

    return element;
  }

  /**
   * 안전한 텍스트 설정 (XSS 방지)
   *
   * @param {HTMLElement} element - 대상 요소
   * @param {string} text - 설정할 텍스트
   * @returns {HTMLElement} 처리된 요소
   */
  static safeText(element, text) {
    if (!element) {
      throw new Error('유효한 DOM 요소가 필요합니다.');
    }

    element.textContent = String(text || '');
    return element;
  }

  /**
   * 데이터 속성 설정
   *
   * @param {HTMLElement} element - 대상 요소
   * @param {Object} dataAttributes - 데이터 속성들
   * @returns {HTMLElement} 처리된 요소
   *
   * @example
   * const element = DOMBuilder.createDiv();
   * DOMBuilder.setDataAttributes(element, {
   *   userId: '123',
   *   role: 'admin'
   * }); // data-user-id="123", data-role="admin"
   */
  static setDataAttributes(element, dataAttributes = {}) {
    if (!element || !element.setAttribute) {
      throw new Error('유효한 DOM 요소가 필요합니다.');
    }

    Object.entries(dataAttributes).forEach(([key, value]) => {
      // camelCase를 kebab-case로 변환
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      element.setAttribute(`data-${kebabKey}`, String(value || ''));
    });

    return element;
  }
}

/**
 * DOMBuilder의 단축 메서드들을 제공하는 헬퍼 객체
 */
export const DOM = {
  // 기본 요소들
  div: (className, content, attrs) => DOMBuilder.createDiv(className, content, attrs),
  span: (text, className, styles) => DOMBuilder.createSpan(text, className, styles),
  button: (text, className, attrs) => DOMBuilder.createButton(text, className, attrs),
  input: (type, attrs, styles) => DOMBuilder.createInput(type, attrs, styles),
  option: (value, text, opts) => DOMBuilder.createOption(value, text, opts),
  link: (href, text, attrs, styles) => DOMBuilder.createLink(href, text, attrs, styles),
  img: (src, alt, attrs, styles) => DOMBuilder.createImage(src, alt, attrs, styles),

  // 테이블 요소들
  table: (attrs, styles) => DOMBuilder.createTable(attrs, styles),
  tr: (attrs, styles) => DOMBuilder.createTableRow(attrs, styles),
  td: (content, attrs, styles) => DOMBuilder.createTableCell(content, false, attrs, styles),
  th: (content, attrs, styles) => DOMBuilder.createTableHeader(content, attrs, styles),

  // 리스트 요소들
  ul: (attrs, styles) => DOMBuilder.createList(false, attrs, styles),
  ol: (attrs, styles) => DOMBuilder.createList(true, attrs, styles),
  li: (content, attrs, styles) => DOMBuilder.createListItem(content, attrs, styles),

  // 폼 요소들
  form: (attrs, styles) => DOMBuilder.createForm(attrs, styles),
  label: (text, forId, attrs, styles) => DOMBuilder.createLabel(text, forId, attrs, styles),
  textarea: (attrs, styles) => DOMBuilder.createTextarea(attrs, styles),
  select: (attrs, styles) => DOMBuilder.createSelect(attrs, styles),

  // 유틸리티
  fragment: (elements) => DOMBuilder.createFragment(elements),
  template: (html, data) => DOMBuilder.createFromTemplate(html, data),
};

// 기본 export
export default DOMBuilder;
