import type { CSSProperties } from 'react';

/**
 * The YUTIS graphic mark from app.yutis.com.tw (mark only, no wordmark), as Geodown chose on 2026-10-03.
 * It takes `currentColor`, so callers set the colour; the default is the `logo` token.
 */
export function YutisMark({ height = 28, title, style }: { height?: number; title?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 22 32" height={height} width={(height * 22) / 32} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      aria-label={title} style={{ color: 'var(--yutis-logo)', flexShrink: 0, ...style }}>
      <path d="M1.837,4.529,0,0H2.412A5.742,5.742,0,0,1,7.76,3.741L9,7S7.247,4.529,1.837,4.529" transform="translate(0 2)" fill="currentColor" />
      <path d="M.223,0C1.338,2.476,2.447,4.973,2.89,6.078,3.914,8.631,0,10.256,0,10.256V16c6.382-.87,8.489-7.659,8.489-7.659L9,7.015A13.287,13.287,0,0,0,.223,0" transform="translate(5 16)" fill="currentColor" />
      <path d="M12.327,4.124c-1.132,3.166-4,11.416-4,11.416L7.258,12.632A5.323,5.323,0,0,0,2.318,9.051H0s1.382,3.324,2.754,6.684A12.715,12.715,0,0,1,11,23L19,.1c-4.043-.6-5.824,1.652-6.673,4.026" transform="translate(3)" fill="currentColor" />
    </svg>
  );
}
