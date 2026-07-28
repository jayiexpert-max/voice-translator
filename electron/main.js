const { app, BrowserWindow, Menu, session, shell } = require("electron");
const path = require("path");

const APP_NAME = "AI Voice Translator";
const APP_VERSION = "3.2.0";

let mainWindow = null;

function getWebRoot() {
  return path.join(__dirname, "..");
}

function configurePermissions() {
  const allowedPermissions = new Set([
    "media",
    "display-capture",
    "audioCapture",
    "videoCapture",
    "clipboard-read",
  ]);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1080,
    height: 900,
    minWidth: 820,
    minHeight: 720,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(getWebRoot(), "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.webContents.reload(),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "GitHub Releases",
          click: () => {
            shell.openExternal("https://github.com/jayiexpert-max/voice-translator/releases");
          },
        },
        {
          label: "About",
          click: () => {
            shell.openExternal("https://github.com/jayiexpert-max/voice-translator");
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  configurePermissions();
  buildMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.setAppUserModelId("com.jayoverlay.voice-translator");
app.setName(APP_NAME);

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

module.exports = { APP_NAME, APP_VERSION };
