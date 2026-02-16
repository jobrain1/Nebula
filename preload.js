const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // File system operations
    readFile: (filePath) => fs.promises.readFile(filePath, 'utf8'),
    writeFile: (filePath, data) => fs.promises.writeFile(filePath, data),
    existsSync: (filePath) => fs.existsSync(filePath),
    
    // IPC communication
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    
    // Process info
    getProcessArgv: () => process.argv,
    
    // Path utilities
    joinPath: (...paths) => path.join(...paths),
    basename: (filePath) => path.basename(filePath)
});