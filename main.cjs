const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const net = require('net');

// Windows taskbar identity: must match package.json build.appId, or the
// taskbar shows Electron's default icon/grouping instead of Kettle's.
// (Electron 41 casing: setAppUserModelId — lowercase "d")
app.setAppUserModelId('com.kettle.music');

const isDev = !app.isPackaged;
// Temporary placeholder for autoUpdater logic to avoid crashes
const autoUpdater = {
  checkForUpdatesAndNotify: () => console.log("Update check skipped in this build"),
  on: () => {}
};

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    autoHideMenuBar: true, // This makes it look like real software
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    frame: true,
    icon: path.join(__dirname, 'icon.ico'),
    // Set a standard Chrome user agent to bypass Google's OAuth block on Electron/Webviews
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // loadFile handles spaces/backslashes in install paths (e.g. "Redew Music")
  // and asar paths — a hand-built file:// URL breaks on both
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Fake Origin and Referer for YouTube iframes to bypass Error 150/153
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Force ALL external links and window.open calls to the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killExistingBackend() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      // Only kill OUR backend (python/uvicorn) — never an unrelated app
      // that happens to hold port 8000
      exec(`lsof -i :8000 -t | xargs -r ps -p -o comm= 2>/dev/null`, () => {
        exec(`for pid in $(lsof -i :8000 -t); do comm=$(ps -p $pid -o comm=); case "$comm" in *python*|*backend*|*uvicorn*) kill -9 $pid;; esac; done`, () => resolve());
      });
      return;
    }
    exec('netstat -aon', (err, stdout) => {
      if (err || !stdout) return resolve();
      const pids = new Set();
      stdout.split(/\r?\n/).forEach(line => {
        const parts = line.trim().split(/\s+/);
        // e.g. TCP  0.0.0.0:8000  0.0.0.0:0  LISTENING  12345
        if (parts.length >= 5 && /:8000$/.test(parts[1]) && parts[3] === 'LISTENING') {
          pids.add(parts[4]);
        }
      });
      if (pids.size === 0) return resolve();
      let pending = pids.size;
      const done = () => { if (--pending === 0) resolve(); };
      pids.forEach(pid => {
        // Only kill OUR backend (python/uvicorn/packaged exe) — never other apps
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (e2, out) => {
          const name = (out || '').toLowerCase();
          if (name.includes('python') || name.includes('backend.exe') || name.includes('uvicorn')) {
            exec(`taskkill /F /PID ${pid} /T`, done);
          } else {
            console.log(`Port 8000 held by unrelated process (pid ${pid}); leaving it alone.`);
            done();
          }
        });
      });
    });
  });
}

function waitForBackend(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) {
        console.warn('Backend did not come up in time; opening window anyway.');
        return resolve();
      }
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        setTimeout(check, 500);
      });
      socket.on('timeout', () => {
        socket.destroy();
        setTimeout(check, 500);
      });
      socket.connect(8000, '127.0.0.1');
    };
    check();
  });
}

function startBackend() {
  let backendPath;
  let args = [];
  let backendCwd;

  if (isDev) {
    // In dev, we assume a python venv is available
    backendPath = 'python';
    args = [path.join(__dirname, 'backend/main.py')];
    backendCwd = path.join(__dirname, 'backend');
  } else {
    // In production, backend.exe is bundled in resources
    backendPath = path.join(process.resourcesPath, 'backend.exe');
    // Use writable userData dir for CWD so sub-processes or relative files never crash on Program Files permissions
    backendCwd = app.getPath('userData');

    // The .env should already be in resources due to extraResources in package.json
    const envInResources = path.join(process.resourcesPath, '.env');
    
    if (!fs.existsSync(envInResources)) {
      console.error(`.env NOT found in ${envInResources}`);
      // Try to find it relative to the executable (for some setups)
      const envNextToExe = path.join(path.dirname(process.execPath), '.env');
      if (fs.existsSync(envNextToExe)) {
        try {
          fs.copyFileSync(envNextToExe, envInResources);
        } catch (e) {
          // Program Files is read-only — log it so the missing-ENV failure
          // is diagnosable instead of silent
          console.error(`Failed to copy .env into resources (likely read-only install dir): ${e.message}`);
        }
      }
    }
  }

  console.log(`Starting backend at: ${backendPath}`);
  console.log(`Backend exists: ${fs.existsSync(backendPath)}`);
  
  try {
    backendProcess = spawn(backendPath, args, {
      cwd: backendCwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false
    });

  const logPath = path.join(app.getPath('userData'), 'backend_log.txt');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
    logStream.write(`[STDOUT] ${new Date().toISOString()}: ${data}\n`);
  });
  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
    logStream.write(`[STDERR] ${new Date().toISOString()}: ${data}\n`);
  });
  backendProcess.on('error', (err) => {
    console.error(`Backend failed to start: ${err.message}`);
    logStream.write(`[ERROR] ${new Date().toISOString()}: ${err.message}\n`);
  });
  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code: ${code}`);
    logStream.write(`[EXIT] ${new Date().toISOString()}: Exit code ${code}\n`);
    logStream.end(); // close the fd — it was leaked before
    if (code !== 0 && code !== null) {
      // Surface the dead backend instead of failing silently forever
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `console.error('Backend process died (code ${code}). See backend_log.txt.')`
        ).catch(() => {});
      }
    }
  });
  } catch (err) {
    console.error(`Failed to spawn backend: ${err.message}`);
  }
}

// IPC handler: open URL in system browser (for Google OAuth)
ipcMain.handle('open-external', (event, url) => {
  return shell.openExternal(url);
});

// Second launch focuses the first instance instead of killing its backend
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('ready', async () => {
  console.log('Ensuring port 8000 is free...');
  await killExistingBackend();
  
  startBackend();
  
  console.log('Waiting for backend to be ready...');
  await waitForBackend();
  console.log('Backend is ready. Creating window.');
  
  createWindow();
  
  // Check for updates every 10 minutes
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 600000);
  
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess && backendProcess.pid) {
    console.log('Killing backend process tree...');
    if (process.platform === 'win32') {
      exec(`taskkill /F /PID ${backendProcess.pid} /T`);
    } else {
      backendProcess.kill();
    }
  }
});

// Update logic communication
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (e) {
    console.warn('Updater is a placeholder in this build:', e.message);
  }
});
