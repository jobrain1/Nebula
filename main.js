const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // For easier access in this simple app
            enableRemoteModule: true
        },
        autoHideMenuBar: true,
        title: "Nebula",
        icon: path.join(__dirname, 'Assets/Logo_Icon_Transparent_bg.png.png.png')
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        // Check if there's a file passed as an argument
        const filePath = getFilePathFromArgs();
        if (filePath) {
            sendFileToRenderer(filePath);
        }
    });
}

function getFilePathFromArgs() {
    const args = process.argv;
    // On Windows, the file path is usually the last argument or after --
    const filePath = args.find(arg => arg.toLowerCase().endsWith('.neb'));
    if (filePath && fs.existsSync(filePath)) {
        return filePath;
    }
    return null;
}

function sendFileToRenderer(filePath) {
    if (mainWindow && filePath) {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (!err) {
                mainWindow.webContents.send('open-file', JSON.parse(data));
            }
        });
    }
}

// Handle single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Handle file open from second instance
            const filePath = commandLine.find(arg => arg.toLowerCase().endsWith('.neb'));
            if (filePath) {
                sendFileToRenderer(filePath);
            }
        }
    });

    app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
