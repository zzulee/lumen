/**
 * Shared message catalogue for the main process (menus, dialogs) and the
 * renderer (chrome, status bar, toasts). Kept as a CommonJS module so `main.js`
 * can `require` it directly while esbuild bundles the same file for the
 * renderer.
 */

'use strict';

const zh = {
  appName: 'Lumen',

  /* ------------------------------ menus ------------------------------ */

  menuFile: '文件',
  newFile: '新建文件',
  openFile: '打开文件…',
  openFolder: '打开文件夹…',
  save: '保存',
  saveAs: '另存为…',
  exportHtml: '导出 HTML…',
  exportPdf: '导出 PDF…',
  close: '关闭',
  quit: '退出',

  menuEdit: '编辑',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  pasteAndMatchStyle: '粘贴为纯文本',
  selectAll: '全选',
  find: '在文档中查找',

  menuView: '视图',
  toggleOutline: '切换大纲面板',
  toggleSidebar: '切换侧栏',
  lightTheme: '浅色主题',
  darkTheme: '深色主题',
  language: '语言',
  chinese: '中文',
  english: 'English',
  reload: '重新加载',
  devTools: '开发者工具',
  zoomReset: '实际大小',
  zoomIn: '放大',
  zoomOut: '缩小',
  fullscreen: '全屏',
  menuWindow: '窗口',

  /* ------------------------------ sidebar ------------------------------ */

  recent: '最近',
  files: '文件',
  outlineTitle: '大纲',
  noFolder: '未打开文件夹',
  openFolderTip: '打开文件夹',
  removeRecent: '从列表中移除',
  emptyOutline: '还没有标题。',
  emptyTree: '没有 Markdown 文件。',
  emptyRecent: '暂无最近文件。',

  /* ------------------------------ status bar ------------------------------ */

  wordCount: '{n} 字',
  charCount: '{n} 字符',
  lineCount: '{n} 行',
  saved: '已保存',
  unsaved: '未保存',

  /* ------------------------------ document ------------------------------ */

  untitled: '未命名.md',
  untitledTitle: '未命名',

  /* ------------------------------ toasts ------------------------------ */

  toastSaved: '已保存',
  toastSaveFailed: '保存失败：{msg}',
  toastSavedAs: '已另存为 {name}',
  toastExported: '已导出 {name}',
  toastOpenFailed: '无法打开文件：{msg}',

  /* ------------------------------ dialogs ------------------------------ */

  closeTitle: '未保存的更改',
  closeMessage: '“{name}”还有未保存的更改，是否保存？',
  closeSave: '保存',
  closeDontSave: '不保存',
  closeCancel: '取消',
  filterMarkdown: 'Markdown',
  filterAll: '所有文件',
  filterHtml: 'HTML',
  filterPdf: 'PDF',

  /* ------------------------------ code editor ------------------------------ */

  phraseFind: '查找',
  phraseReplace: '替换',
  phraseNext: '下一个',
  phrasePrevious: '上一个',
  phraseAll: '全部',
  phraseMatchCase: '区分大小写',
  phraseByWord: '全词匹配',
  phraseRegexp: '正则表达式',
  phraseReplaceAll: '全部替换',
  phraseClose: '关闭',
  phraseGoToLine: '跳转到行',
  phraseGo: '跳转',

  /* ------------------------------ welcome ------------------------------ */

  welcome: [
    '# 欢迎使用 Lumen',
    '',
    '一个本地优先的 Markdown 编辑器。磁盘上的文件始终是原始的',
    'Markdown 源码 —— 你看到的是它的渲染结果，而不是另一份文档模型。',
    '',
    '## 试试实时预览',
    '',
    '把光标放进这段**加粗文字**里，`**` 标记就会出现；',
    '光标移开，它们又消失。`行内代码`、*斜体*、~~删除线~~',
    '和[链接](https://example.com)也是同样的效果。',
    '',
    '### 列表与任务',
    '',
    '- 第一项',
    '- 第二项，带**强调**',
    '  - 嵌套项',
    '  - 另一个嵌套项',
    '',
    '1. 有序列表',
    '2. 也是有序的',
    '',
    '- [x] 已完成的任务',
    '- [ ] 还没做的事',
    '',
    '### 代码',
    '',
    '```js',
    "function greet(name) {",
    '  const greeting = `hello, ${name}`;',
    '  return greeting;',
    '}',
    '```',
    '',
    '### 表格',
    '',
    '把光标移出表格，它就会渲染成表格：',
    '',
    '| 功能 | 状态 | 说明 |',
    '|------|:----:|------|',
    '| 实时预览 | 完成 | 失焦后隐藏标记 |',
    '| 代码块 | 完成 | 聚焦后编辑 |',
    '| 表格 | 完成 | 点击即可编辑 |',
    '',
    '> 一句引用，适合借别人的话来说明。',
    '',
    '---',
    '',
    '点击左上角的文件夹按钮，可以浏览你自己的笔记。',
    '',
  ].join('\n'),
};

const en = {
  appName: 'Lumen',

  /* ------------------------------ menus ------------------------------ */

  menuFile: 'File',
  newFile: 'New File',
  openFile: 'Open File…',
  openFolder: 'Open Folder…',
  save: 'Save',
  saveAs: 'Save As…',
  exportHtml: 'Export HTML…',
  exportPdf: 'Export PDF…',
  close: 'Close',
  quit: 'Quit',

  menuEdit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  pasteAndMatchStyle: 'Paste as Plain Text',
  selectAll: 'Select All',
  find: 'Find in Document',

  menuView: 'View',
  toggleOutline: 'Toggle Outline',
  toggleSidebar: 'Toggle Sidebar',
  lightTheme: 'Light Theme',
  darkTheme: 'Dark Theme',
  language: 'Language',
  chinese: '中文',
  english: 'English',
  reload: 'Reload',
  devTools: 'Developer Tools',
  zoomReset: 'Actual Size',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  fullscreen: 'Full Screen',
  menuWindow: 'Window',

  /* ------------------------------ sidebar ------------------------------ */

  recent: 'Recent',
  files: 'Files',
  outlineTitle: 'Outline',
  noFolder: 'No folder',
  openFolderTip: 'Open folder',
  removeRecent: 'Remove from list',
  emptyOutline: 'No headings yet.',
  emptyTree: 'No markdown files.',
  emptyRecent: 'No recent files.',

  /* ------------------------------ status bar ------------------------------ */

  wordCount: '{n} word',
  wordCountPlural: '{n} words',
  charCount: '{n} chars',
  lineCount: '{n} lines',
  saved: 'saved',
  unsaved: 'unsaved',

  /* ------------------------------ document ------------------------------ */

  untitled: 'untitled.md',
  untitledTitle: 'Untitled',

  /* ------------------------------ toasts ------------------------------ */

  toastSaved: 'Saved',
  toastSaveFailed: 'Save failed: {msg}',
  toastSavedAs: 'Saved as {name}',
  toastExported: 'Exported {name}',
  toastOpenFailed: 'Could not open file: {msg}',

  /* ------------------------------ dialogs ------------------------------ */

  closeTitle: 'Unsaved changes',
  closeMessage: '“{name}” has unsaved changes. Save them before closing?',
  closeSave: 'Save',
  closeDontSave: "Don't Save",
  closeCancel: 'Cancel',
  filterMarkdown: 'Markdown',
  filterAll: 'All Files',
  filterHtml: 'HTML',
  filterPdf: 'PDF',

  /* ------------------------------ code editor ------------------------------ */

  phraseFind: 'Find',
  phraseReplace: 'Replace',
  phraseNext: 'next',
  phrasePrevious: 'previous',
  phraseAll: 'all',
  phraseMatchCase: 'match case',
  phraseByWord: 'by word',
  phraseRegexp: 'regexp',
  phraseReplaceAll: 'replace all',
  phraseClose: 'close',
  phraseGoToLine: 'Go to line',
  phraseGo: 'go',

  /* ------------------------------ welcome ------------------------------ */

  welcome: [
    '# Welcome to Lumen',
    '',
    'A local-first Markdown editor. The file on disk is always the raw',
    'Markdown source — what you see here is a *rendering of it*, not a',
    'separate document model.',
    '',
    '## Try the live preview',
    '',
    'Put the caret inside this **bold phrase** and the `**` markers appear.',
    'Move it away and they disappear again. Same for `inline code`,',
    '*italics*, ~~strikethrough~~, and [links](https://example.com).',
    '',
    '### Lists and tasks',
    '',
    '- First item',
    '- Second item with **emphasis**',
    '  - Nested item',
    '  - Another nested one',
    '',
    '1. Numbered',
    '2. Also numbered',
    '',
    '- [x] A finished task',
    '- [ ] Something still to do',
    '',
    '### Code',
    '',
    '```js',
    'function greet(name) {',
    '  const greeting = `hello, ${name}`;',
    '  return greeting;',
    '}',
    '```',
    '',
    '### Tables',
    '',
    'Move the caret out of this table and it renders as a grid:',
    '',
    '| Feature | Status | Notes |',
    '|---------|:------:|-------|',
    '| Live preview | done | markers hide on blur |',
    '| Code fences | done | focus to edit |',
    '| Tables | done | click to edit |',
    '',
    '> A block quote, for when someone else said it better.',
    '',
    '---',
    '',
    'Open a folder with the file button to browse your own notes.',
    '',
  ].join('\n'),
};

const MESSAGES = { zh, en };
const LANGUAGES = ['zh', 'en'];
const DEFAULT_LANGUAGE = 'zh';

function translate(lang, key, vars) {
  const dict = MESSAGES[lang] || MESSAGES[DEFAULT_LANGUAGE];
  let text = dict[key];
  if (text === undefined) text = MESSAGES.en[key];
  if (text === undefined) text = key;

  if (vars) {
    for (const name of Object.keys(vars)) {
      text = text.split('{' + name + '}').join(String(vars[name]));
    }
  }
  return text;
}

module.exports = { MESSAGES, LANGUAGES, DEFAULT_LANGUAGE, translate };
