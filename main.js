const { app, BrowserWindow, ipcMain, globalShortcut, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let quickEntryWindow;
let tray;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0f0f12',
            symbolColor: '#ffffff',
            height: 32
        },
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

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'Assets/Logo_Icon_Transparent_bg.png.png.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setToolTip('Nebula Mindmap');
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Nebula', 
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            } 
        },
        { 
            label: 'Quick Entry', 
            click: () => toggleQuickEntry() 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                isQuitting = true;
                app.quit();
            } 
        }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        } else {
            createWindow();
        }
    });
}

function createQuickEntryWindow() {
    quickEntryWindow = new BrowserWindow({
        width: 750,
        height: 80, // Initial height for just the input
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    quickEntryWindow.loadFile('quick-entry.html');

    // Hide instead of close on blur to keep it snappy
    quickEntryWindow.on('blur', () => {
        quickEntryWindow.hide();
    });

    quickEntryWindow.on('closed', () => {
        quickEntryWindow = null;
    });
}

function toggleQuickEntry() {
    if (!quickEntryWindow) {
        createQuickEntryWindow();
    }

    if (quickEntryWindow.isVisible()) {
        quickEntryWindow.hide();
    } else {
        // Center on the screen where the cursor is
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        const { x, y, width, height } = display.bounds;
        
        // Calculate center position
        const winWidth = 750;
        const winHeight = 80;
        const posX = x + Math.round((width - winWidth) / 2);
        const posY = y + Math.round((height * 0.2)); // Top 20% like Raycast/Spotlight

        quickEntryWindow.setPosition(posX, posY);
        quickEntryWindow.show();
        quickEntryWindow.focus();
    }
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

    app.whenReady().then(() => {
    createWindow();
    createQuickEntryWindow();
    createTray();

    // Register a 'CommandOrControl+Space' shortcut listener.
    const ret = globalShortcut.register('CommandOrControl+Space', () => {
        toggleQuickEntry();
    });

    if (!ret) {
        console.log('registration failed');
    }
    
    // Setup IPC handlers
    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });
    
    ipcMain.handle('write-file', async (event, filePath, data) => {
        try {
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Error writing file:', error);
            throw error;
        }
    });
    
    ipcMain.handle('file-exists', (event, filePath) => {
        return fs.existsSync(filePath);
    });

    // Quick Entry IPC
    ipcMain.on('quick-entry-submit', (event, text) => {
        console.log('Received quick entry:', text); // Debug log
        if (!text) return;

        // Command: /quick <text> - Save to file directly
        if (text.startsWith('/quick ')) {
            const content = text.replace('/quick ', '').trim();
            if (content) {
                const timestamp = Date.now();
                const filename = `mindmap-${timestamp}.neb`;
                const filePath = path.join(process.cwd(), filename);
                
                const initialData = [
                    {
                        id: timestamp.toString(),
                        text: content,
                        x: 5000,
                        y: 5000,
                        width: 150,
                        height: 60,
                        parentId: null,
                        isRoot: true,
                        color: '#A393BF',
                        isNew: true
                    }
                ];

                fs.writeFile(filePath, JSON.stringify(initialData, null, 2), (err) => {
                    if (err) {
                        console.error('Failed to save quick mindmap:', err);
                    } else {
                        console.log('Quick mindmap saved to:', filePath);
                        // Optional: Notification or feedback?
                    }
                });
            }
            if (quickEntryWindow) quickEntryWindow.hide();
            return;
        }

        // Command: /create <text> - Open GUI with new map
        if (text.startsWith('/create ')) {
            const content = text.replace('/create ', '').trim();
            if (content) {
                if (!mainWindow) {
                    createWindow();
                } else {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    if (!mainWindow.isVisible()) mainWindow.show();
                    mainWindow.focus();
                }
                
                // Wait for window to be ready if we just created it
                if (mainWindow.webContents.isLoading()) {
                    mainWindow.webContents.once('did-finish-load', () => {
                        mainWindow.webContents.send('create-new-map', content);
                    });
                } else {
                    mainWindow.webContents.send('create-new-map', content);
                }
            }
            if (quickEntryWindow) quickEntryWindow.hide();
            return;
        }

        // Default: Add to current map
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('create-from-quick-entry', text);
        } else {
            createWindow();
            // Wait for load then send
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('create-from-quick-entry', text);
            });
        }
        
        if (quickEntryWindow) {
            quickEntryWindow.hide();
        }
    });

    ipcMain.on('close-quick-entry', () => {
        if (quickEntryWindow) {
            quickEntryWindow.hide();
        }
    });
});

app.on('will-quit', () => {
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
