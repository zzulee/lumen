const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const listen = (channel, handler) => {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('lumen', {
  bootstrap: () => invoke('app:bootstrap'),

  harness: Boolean(process.env.LUMEN_HARNESS === '1'),

  file: {
    read: (filePath) => invoke('file:read', filePath),
    write: (filePath, content) => invoke('file:write', filePath, content),
    openDialog: () => invoke('dialog:open-file'),
    saveDialog: (suggested, content) => invoke('dialog:save-file', suggested, content),
    openFolderDialog: () => invoke('dialog:open-folder'),
  },

  workspace: {
    refresh: () => invoke('workspace:refresh'),
  },

  recent: {
    push: (entry) => invoke('recent:push', entry),
  },

  export: {
    html: (suggested, html) => invoke('export:html', suggested, html),
    pdf: (suggested) => invoke('export:pdf', suggested),
  },

  window: {
    setTitle: (title, edited) => invoke('window:set-title', title, edited),
  },

  shell: {
    openExternal: (url) => invoke('shell:open-external', url),
  },

  on: listen,
});
