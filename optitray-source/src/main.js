// OptiTray main process: tray icon + frameless popup that opens above the notification area.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, session } = require('electron');
const path = require('path');

const POPUP_W = 400;
const POPUP_H = 600;
const HOTKEY = 'Control+Alt+O';

const TOOLS = [
  ['db', 'dB / power'],
  ['spectral', 'Wavelength ↔ frequency'],
  ['fp', 'Fabry–Pérot'],
  ['mix', 'Frequency mixing'],
  ['photon', 'Photon & detector'],
  ['linewidth', 'Linewidth & coherence'],
  ['pulse', 'Pulse train'],
  ['beam', 'Gaussian beam'],
  ['fiber', 'Fiber'],
];

let tray = null;
let win = null;
let pinned = false;
let lastHide = 0;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.setAppUserModelId('com.optitray.app');

function createWindow() {
  win = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_H,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#14161a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => {
    if (!pinned && !win.webContents.isDevToolsOpened()) hidePopup();
  });
  // Offline by design: no pop-up windows and no navigation away from the bundled page.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function positionPopup() {
  const tb = tray.getBounds();
  const point = tb.width ? { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 } : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const margin = 8;
  let x = Math.round(point.x - POPUP_W / 2);
  let y;
  // Taskbar can sit on any edge on Windows; place the popup inside the work area next to it.
  if (point.y > workArea.y + workArea.height / 2) y = workArea.y + workArea.height - POPUP_H - margin;
  else y = workArea.y + margin;
  if (point.x > workArea.x + workArea.width - POPUP_W / 2 || point.x >= workArea.x + workArea.width) {
    x = workArea.x + workArea.width - POPUP_W - margin;
  }
  if (point.x < workArea.x) x = workArea.x + margin;
  x = Math.max(workArea.x + margin, Math.min(x, workArea.x + workArea.width - POPUP_W - margin));
  win.setPosition(x, y, false);
}

function showPopup(tool) {
  if (!win) createWindow();
  if (!pinned) positionPopup();
  win.show();
  win.focus();
  if (tool) win.webContents.send('open-tool', tool);
}

function hidePopup() {
  if (win && win.isVisible()) {
    win.hide();
    lastHide = Date.now();
  }
}

function togglePopup() {
  // Clicking the tray icon blurs the popup first; ignore the click that immediately follows.
  if (win && win.isVisible()) hidePopup();
  else if (Date.now() - lastHide > 250) showPopup();
}

function buildMenu() {
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: 'Open OptiTray', click: () => showPopup() },
    { type: 'separator' },
    ...TOOLS.map(([id, label]) => ({ label, click: () => showPopup(id) })),
    { type: 'separator' },
    {
      label: 'Keep popup open (pin)', type: 'checkbox', checked: pinned,
      click: (item) => setPinned(item.checked),
    },
    {
      label: 'Start with Windows', type: 'checkbox', checked: login.openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: `Hotkey: ${HOTKEY.replace(/\+/g, ' + ')}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

function setPinned(v) {
  pinned = v;
  if (win) win.webContents.send('pinned', pinned);
}

app.whenReady().then(() => {
  // Block every request that is not a bundled local file, so the app never touches the network.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|devtools|data):/i.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  session.defaultSession.setSpellCheckerEnabled(false);
  const iconPath = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon-32.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('OptiTray, optics calculators');
  tray.on('click', togglePopup);
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  createWindow();
  globalShortcut.register(HOTKEY, togglePopup);

  ipcMain.on('hide', hidePopup);
  ipcMain.on('set-pinned', (_e, v) => setPinned(!!v));
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('menu', () => tray.popUpContextMenu(buildMenu()));
});

app.on('second-instance', () => showPopup());
app.on('window-all-closed', (e) => e.preventDefault()); // stay alive in the tray
app.on('will-quit', () => globalShortcut.unregisterAll());
