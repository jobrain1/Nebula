/**
 * MindFlow - Core Logic
 */

class MindFlow {
    constructor() {
        this.nodes = [];
        this.selectedNodeId = null;
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.dragNode = null;
        this.resizeNode = null;
        this.renderedNodes = new Map();
        this.isEditing = false;
        this.isExporting = false;

        // DOM Elements
        this.canvas = document.getElementById('mindmap-canvas');
        this.container = document.getElementById('canvas-container');
        this.svg = document.getElementById('svg-connections');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.contextMenu = document.getElementById('context-menu');
        this.imageInput = document.getElementById('image-input');
        this.helpModal = document.getElementById('help-modal');

        this.init();
    }

    init() {
        // Create root node if empty
        if (this.nodes.length === 0) {
            this.addNode("Central Topic", 5000, 5000, null, true);
        }

        this.setupEventListeners();
        this.render();
        this.centerView();
        this.handleOSLaunch();
    }

    handleOSLaunch() {
        // 1. PWA Launch Queue
        if ('launchQueue' in window) {
            window.launchQueue.setConsumer((launchParams) => {
                if (launchParams.files && launchParams.files.length > 0) {
                    this.loadFileFromHandle(launchParams.files[0]);
                }
            });
        }

        // 2. Nativefier / Electron Argument Polling
        // Some Nativefier versions delay argument population
        const checkArgs = () => {
            try {
                const nw = window.require ? window.require('nw.gui') : null; // Check NW.js if applicable
                const remote = window.require ? window.require('@electron/remote') : null;
                const process = window.process || (remote ? remote.process : null);

                if (process && process.argv) {
                    console.log("Checking arguments:", process.argv);
                    const filePath = process.argv.find(arg =>
                        arg.toLowerCase().endsWith('.neb') ||
                        (arg.includes('.neb') && !arg.includes('--'))
                    );

                    if (filePath) {
                        const fs = window.require('fs');
                        const cleanPath = filePath.replace(/^"(.*)"$/, '$1').trim();
                        if (fs.existsSync(cleanPath)) {
                            const data = fs.readFileSync(cleanPath, 'utf8');
                            this.loadMindmapData(JSON.parse(data));
                            return; // Success
                        }
                    }
                }

                if (window.LAUNCH_FILE_PATH) {
                    const fs = window.require('fs');
                    const cleanPath = window.LAUNCH_FILE_PATH.replace(/^"(.*)"$/, '$1').trim();
                    if (fs.existsSync(cleanPath)) {
                        const data = fs.readFileSync(cleanPath, 'utf8');
                        this.loadMindmapData(JSON.parse(data));
                        window.LAUNCH_FILE_PATH = null;
                    }
                }
            } catch (e) {
                console.error("OS launch check error:", e);
            }
        };

        // Check immediately and then after a short delay
        checkArgs();
        setTimeout(checkArgs, 1000);
        setTimeout(checkArgs, 3000);

        // 4. Electron IPC Handler
        try {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('open-file', (event, data) => {
                this.loadMindmapData(data);
            });
        } catch (e) {
            console.log("Not running in Electron, IPC skipped.");
        }
    }

    async loadFileFromHandle(fileHandle) {
        const file = await fileHandle.getFile();
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.loadMindmapData(JSON.parse(e.target.result));
            } catch (err) {
                alert("Failed to load .neb file");
            }
        };
        reader.readAsText(file);
    }

    loadMindmapData(data) {
        this.nodes = data;
        this.renderedNodes.forEach(el => el.remove());
        this.renderedNodes.clear();
        this.render();
        this.centerView();
    }

    setupEventListeners() {
        // Toolbar Events
        document.getElementById('add-node').onclick = () => this.addChildToSelected();
        document.getElementById('export-pdf').onclick = () => this.exportToPDF();

        // .NEB File Save/Load
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.neb';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        fileInput.onchange = (e) => this.importJSON(e);

        document.getElementById('save-ola').onclick = () => this.exportJSON();
        document.getElementById('import-ola').onclick = () => fileInput.click();

        document.getElementById('clear-canvas').onclick = () => this.clearAll();
        document.getElementById('theme-toggle').onclick = () => this.toggleTheme();

        // Custom shortcut for saving
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.exportJSON();
            }
        });

        // Zoom Events
        document.getElementById('zoom-in').onclick = () => this.setZoom(this.zoom + 0.1);
        document.getElementById('zoom-out').onclick = () => this.setZoom(this.zoom - 0.1);
        document.getElementById('reset-view').onclick = () => this.centerView();

        // Canvas Panning
        this.container.onmousedown = (e) => {
            // Only pan if we didn't click a node or the toolbars
            if (!e.target.closest('.node') && !e.target.closest('.toolbar') && !e.target.closest('.canvas-controls')) {
                this.isPanning = true;
                this.container.style.cursor = 'grabbing';
            }
        };

        window.onmousemove = (e) => {
            if (this.isPanning) {
                this.offsetX += e.movementX;
                this.offsetY += e.movementY;
                this.updateCanvasTransform();
            }
            if (this.dragNode) {
                const rect = this.canvas.getBoundingClientRect();
                this.dragNode.x = (e.clientX - rect.left) / this.zoom;
                this.dragNode.y = (e.clientY - rect.top) / this.zoom;
                this.render();
            }
            if (this.resizeNode) {
                const rect = this.renderedNodes.get(this.resizeNode.id).getBoundingClientRect();
                const newWidth = (e.clientX - rect.left) / this.zoom;
                const newHeight = (e.clientY - rect.top) / this.zoom;
                this.resizeNode.width = Math.max(80, newWidth);
                this.resizeNode.height = Math.max(40, newHeight);
                this.render();
            }
        };

        window.onmouseup = () => {
            this.isPanning = false;
            this.dragNode = null;
            this.resizeNode = null;
            this.container.style.cursor = 'grab';
        };

        // Zoom with Scroll
        this.container.onwheel = (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            this.setZoom(this.zoom + delta, e.clientX, e.clientY);
        };

        // Global Keyboard Shortcuts
        window.onkeydown = (e) => {
            if (this.isEditing) return;
            if (document.activeElement.tagName === 'INPUT') return;

            if (e.key === 'a' || e.key === 'n') {
                e.preventDefault();
                this.addChildToSelected();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.deleteSelectedNode();
            }
            if (e.key === 'Escape') this.selectedNodeId = null;
            if (e.key === 'c' && (e.ctrlKey || e.metaKey)) this.centerView();
            this.render();
        };

        document.getElementById('help-btn').onclick = () => {
            this.helpModal.classList.remove('hidden');
        };

        this.helpModal.querySelector('.close-modal').onclick = () => {
            this.helpModal.classList.add('hidden');
        };

        this.helpModal.onclick = (e) => {
            if (e.target === this.helpModal) this.helpModal.classList.add('hidden');
        };

        // Context Menu Actions
        document.getElementById('cm-add').onclick = () => {
            this.addChildToSelected();
            this.hideContextMenu();
        };
        document.getElementById('cm-edit').onclick = () => {
            const node = this.nodes.find(n => n.id === this.selectedNodeId);
            if (node) this.startInlineEdit(node, this.renderedNodes.get(node.id));
            this.hideContextMenu();
        };
        document.getElementById('cm-delete').onclick = () => {
            this.deleteSelectedNode();
            this.hideContextMenu();
        };

        document.getElementById('cm-image').onclick = () => {
            this.imageInput.click();
            this.hideContextMenu();
        };

        this.imageInput.onchange = (e) => {
            if (this.selectedNodeId) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const node = this.nodes.find(n => n.id === this.selectedNodeId);
                        if (node) {
                            node.image = event.target.result;
                            this.render();
                        }
                    };
                    reader.readAsDataURL(file);
                }
            }
        };

        document.querySelectorAll('.cm-color').forEach(btn => {
            btn.onclick = () => {
                if (this.selectedNodeId) {
                    const node = this.nodes.find(n => n.id === this.selectedNodeId);
                    if (node) {
                        node.color = btn.dataset.color;
                        this.render();
                    }
                }
                this.hideContextMenu();
            };
        });

        // Global clicks
        window.addEventListener('mousedown', (e) => {
            if (!this.contextMenu.contains(e.target)) this.hideContextMenu();
        });

        // Color Swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.onclick = () => {
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                if (this.selectedNodeId) {
                    const node = this.nodes.find(n => n.id === this.selectedNodeId);
                    node.color = swatch.dataset.color;
                    this.render();
                }
            };
        });
    }

    addNode(text, x, y, parentId = null, isRoot = false) {
        const id = Date.now().toString();
        const node = {
            id,
            text,
            x,
            y,
            width: isRoot ? 150 : 120,
            height: isRoot ? 60 : 45,
            parentId,
            isRoot,
            color: isRoot ? 'var(--accent-primary)' : 'var(--node-bg)',
            isNew: true
        };
        this.nodes.push(node);
        this.selectedNodeId = id;
        this.render();
        return node;
    }

    addChildToSelected() {
        const parentId = this.selectedNodeId || this.nodes[0].id;
        const parent = this.nodes.find(n => n.id === parentId);

        const angle = Math.random() * Math.PI * 2;
        const distance = 180;
        const x = parent.x + Math.cos(angle) * distance;
        const y = parent.y + Math.sin(angle) * distance;

        this.addNode("New Idea", x, y, parent.id);
    }

    deleteSelectedNode() {
        if (!this.selectedNodeId) return;
        const node = this.nodes.find(n => n.id === this.selectedNodeId);
        if (node.isRoot) return;

        const toDelete = new Set([this.selectedNodeId]);
        let size;
        do {
            size = toDelete.size;
            this.nodes.forEach(n => {
                if (toDelete.has(n.parentId)) toDelete.add(n.id);
            });
        } while (toDelete.size !== size);

        this.nodes = this.nodes.filter(n => !toDelete.has(n.id));
        toDelete.forEach(id => {
            const el = this.renderedNodes.get(id);
            if (el) el.remove();
            this.renderedNodes.delete(id);
        });
        this.selectedNodeId = null;
        this.render();
    }

    saveNodeEdit(id, text) {
        const node = this.nodes.find(n => n.id === id);
        if (node) {
            node.text = text;
        }
        this.isEditing = false;
        this.render();
    }

    exportJSON() {
        const data = JSON.stringify(this.nodes);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nebula-${Date.now()}.neb`;
        a.click();
    }

    importJSON(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
            try {
                this.loadMindmapData(JSON.parse(re.target.result));
            } catch (err) {
                alert("Invalid Mindmap file");
            }
        };
        reader.readAsText(file);
    }

    setZoom(value, clientX, clientY) {
        const oldZoom = this.zoom;
        const newZoom = Math.max(0.2, Math.min(5, value));

        if (clientX !== undefined && clientY !== undefined) {
            const rect = this.container.getBoundingClientRect();
            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;

            // Adjust offset to zoom into the cursor position
            this.offsetX = mouseX - (mouseX - this.offsetX) * (newZoom / oldZoom);
            this.offsetY = mouseY - (mouseY - this.offsetY) * (newZoom / oldZoom);
        }

        this.zoom = newZoom;
        document.getElementById('zoom-level').innerText = Math.round(this.zoom * 100) + '%';
        this.updateCanvasTransform();
    }

    centerView() {
        const rect = this.container.getBoundingClientRect();
        this.offsetX = rect.width / 2 - 5000;
        this.offsetY = rect.height / 2 - 5000;
        this.zoom = 1;
        document.getElementById('zoom-level').innerText = '100%';
        this.updateCanvasTransform();
    }

    updateCanvasTransform() {
        this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
    }

    clearAll() {
        if (confirm("Clear entire mindmap?")) {
            const root = this.nodes.find(n => n.isRoot);
            this.nodes = [root];
            this.renderedNodes.forEach(el => el.remove());
            this.renderedNodes.clear();
            this.render();
        }
    }

    render() {
        this.svg.innerHTML = '';

        const currentIds = new Set(this.nodes.map(n => n.id));
        for (let [id, el] of this.renderedNodes) {
            if (!currentIds.has(id)) {
                el.remove();
                this.renderedNodes.delete(id);
            }
        }

        this.nodes.forEach(node => {
            let el = this.renderedNodes.get(node.id);
            if (!el) {
                el = document.createElement('div');
                el.dataset.id = node.id;
                this.renderedNodes.set(node.id, el);
                this.nodesLayer.appendChild(el);

                if (node.isNew) {
                    el.classList.add('appearing');
                    delete node.isNew;
                }

                el.onmousedown = (e) => {
                    if (this.isEditing) return;
                    e.stopPropagation();
                    this.selectedNodeId = node.id;
                    this.dragNode = node;
                    this.updateSelection();
                };

                el.ondblclick = (e) => {
                    e.stopPropagation();
                    this.startInlineEdit(node, el);
                };

                el.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectedNodeId = node.id;
                    this.updateSelection();
                    this.showContextMenu(e.clientX, e.clientY);
                };
            }

            el.className = `node ${node.isRoot ? 'root' : ''} ${this.selectedNodeId === node.id ? 'selected' : ''}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.style.width = node.width ? `${node.width}px` : 'auto';
            el.style.height = node.height ? `${node.height}px` : 'auto';
            el.style.backgroundColor = node.color || 'var(--node-bg)';

            // Force re-apply for root if needed
            if (node.isRoot && !node.color) el.style.backgroundColor = 'var(--accent-primary)';

            if (!this.isEditing || this.selectedNodeId !== node.id) {
                el.innerHTML = '';

                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'node-content-wrapper';

                if (node.image) {
                    const img = document.createElement('img');
                    img.src = node.image;
                    contentWrapper.appendChild(img);
                }
                const textSpan = document.createElement('span');
                textSpan.innerText = node.text;
                contentWrapper.appendChild(textSpan);
                el.appendChild(contentWrapper);

                const resizer = document.createElement('div');
                resizer.className = 'resizer';
                resizer.onmousedown = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.resizeNode = node;
                };
                el.appendChild(resizer);
            }

            if (node.parentId) {
                const parent = this.nodes.find(n => n.id === node.parentId);
                if (parent) {
                    this.drawConnection(parent, node);
                }
            }
        });
    }

    startInlineEdit(node, el) {
        this.isEditing = true;
        const textSpan = el.querySelector('span');
        if (!textSpan) return;

        textSpan.contentEditable = true;
        textSpan.focus();

        const range = document.createRange();
        range.selectNodeContents(textSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        textSpan.onblur = () => {
            textSpan.contentEditable = false;
            this.saveNodeEdit(node.id, textSpan.innerText);
        };

        textSpan.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                textSpan.blur();
            }
            if (e.key === 'Escape') {
                textSpan.innerText = node.text;
                textSpan.blur();
            }
        };
    }

    updateSelection() {
        document.querySelectorAll('.node').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === this.selectedNodeId);
        });
    }

    showContextMenu(x, y) {
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.classList.remove('hidden');
    }

    hideContextMenu() {
        this.contextMenu.classList.add('hidden');
    }

    drawConnection(p1, p2) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const x1 = p1.x + 75;
        const y1 = p1.y + 25;
        const x2 = p2.x + 75;
        const y2 = p2.y + 25;

        const dx = x2 - x1;
        const cp1x = x1 + dx / 1.5;
        const cp2x = x2 - dx / 1.5;

        const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
        line.setAttribute("d", path);
        line.setAttribute("class", "connection-line");
        this.svg.appendChild(line);
    }

    async exportToPDF() {
        const btn = document.getElementById('export-pdf');
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
        lucide.createIcons();

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + 150);
            maxY = Math.max(maxY, n.y + 50);
        });

        const padding = 100;
        const width = (maxX - minX) + padding * 2;
        const height = (maxY - minY) + padding * 2;

        try {
            const canvasElement = await html2canvas(this.canvas, {
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-primary'),
                width: width,
                height: height,
                x: minX - padding,
                y: minY - padding,
                scale: 2
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF(width > height ? 'l' : 'p', 'px', [width, height]);
            pdf.addImage(canvasElement.toDataURL('image/png'), 'PNG', 0, 0, width, height);
            pdf.save("nebula-mindmap.pdf");

        } catch (err) {
            console.error(err);
            alert("Export failed.");
        }

        btn.innerHTML = '<i data-lucide="download"></i><span>Export</span>';
        lucide.createIcons();
    }
}

window.onload = () => {
    window.app = new MindFlow();
};
