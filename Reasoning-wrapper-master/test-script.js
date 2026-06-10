const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.webContents.on('console-message', (e, level, msg) => console.log('RENDERER:', msg));
  win.loadURL('http://localhost:5000').then(() => {
    setTimeout(() => {
      win.webContents.executeJavaScript(`
        try {
          const btn = document.getElementById('mission-page-add-tile');
          console.log('Button exists:', !!btn);
          btn.click();
          console.log('Clicked button. Menu open?', document.getElementById('mission-grid-context-menu').classList.contains('open'));
        } catch (e) {
          console.error(e);
        }
      `).then(() => setTimeout(() => app.quit(), 1000));
    }, 3000);
  });
});
