/**
 * Stylesheet used for exported HTML and for `printToPDF`. Deliberately
 * self-contained: no theme variables, no app chrome, print-first typography.
 */

export const printStyles = `
  :root {
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #2e3238;
    font-family: 'Microsoft YaHei', '微软雅黑', -apple-system, 'Segoe UI', 'PingFang SC',
      'Hiragino Sans GB', 'Noto Sans CJK SC', sans-serif;
    font-size: 16px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
  }
  .doc {
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 0 80px;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #14171c;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.011em;
    margin: 1.6em 0 0.55em;
  }
  h1 { font-size: 2em; margin-top: 0.4em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.22em; }
  h4 { font-size: 1.06em; }
  h5 { font-size: 1em; }
  h6 { font-size: 0.94em; color: #6b7280; }
  p { margin: 0.85em 0; }
  a { color: #2f6fd0; text-decoration: none; border-bottom: 1px solid rgba(47,111,208,0.4); }
  strong { font-weight: 700; color: #14171c; }
  del { color: #8a9099; }
  code {
    font-family: "Cascadia Code", "SF Mono", Consolas, monospace;
    font-size: 0.875em;
    background: #f2f2f0;
    border: 1px solid #e5e5e2;
    border-radius: 4px;
    padding: 0.12em 0.35em;
  }
  pre {
    background: #f6f6f4;
    border: 1px solid #e5e5e2;
    border-radius: 8px;
    padding: 14px 18px;
    overflow-x: auto;
    line-height: 1.6;
    margin: 1.1em 0;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.855em;
  }
  blockquote {
    margin: 1.1em 0;
    padding: 0.1em 0 0.1em 1.1em;
    border-left: 3px solid #d5d8dd;
    color: #5a616b;
  }
  blockquote p { margin: 0.5em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.85em 0; }
  li { margin: 0.25em 0; }
  li > ul, li > ol { margin: 0.2em 0; }
  hr { border: none; border-top: 1.5px solid #e2e2df; margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.1em 0; font-size: 0.94em; }
  th, td { border: 1px solid #e5e5e2; padding: 8px 13px; text-align: left; vertical-align: top; }
  th { background: #f6f6f4; font-weight: 650; }
  tbody tr:nth-child(even) { background: #fafaf8; }
  img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.8em 0; }
  input[type="checkbox"] { margin-right: 0.5em; }
  @page { margin: 0; }
  @media print {
    body { font-size: 12pt; }
    .doc { padding: 0; max-width: none; }
    a { color: #2e3238; border-bottom: none; }
    pre, table, blockquote, img { break-inside: avoid; }
    h1, h2, h3, h4 { break-after: avoid; }
  }
`;
