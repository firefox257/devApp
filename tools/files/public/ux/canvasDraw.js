// ./ux/canvasDraw.js

import { 
    injectStyles,
    createCanvasDrawDOM
} from './canvasDrawUI.js';

// Assuming these constants are exported/available from canvasDrawUI.js
const MIN_THICKNESS_MM = 0.1;
const MAX_THICKNESS_MM = 50; 
const DEFAULT_THICKNESS = 0.5;
const POINT_HIT_RADIUS = 10; // Pixels for detecting point clicks

/**
 * @typedef {'pencil'|'line'|'spline'} ToolType
 */

/**
 * @typedef {object} DrawState
 * @property {ToolType} currentTool The active drawing tool.
 * @property {string} color The active stroke color (HEX).
 * @property {number} thickness The active stroke thickness (mm, mapped to px).
 *
 * // New line state properties:
 * @property {boolean} isDrawing Flag indicating if mouse is down and drawing (used for drag operations).
 * @property {{x: number, y: number}|null} lastPos The last recorded mouse position (used for pencil).
 * @property {{x: number, y: number}[]} currentPoints Array for spline points (P1, P2, P3, ... PN).
 * @property {number} activePointIndex Index of the point being dragged (-1 if none).
 * @property {{points: {x: number, y: number}[], color: string, thickness: number}|null} tempShape Temporary data for Line editor mode.
 * @property {number} linePointCount Tracks how many points have been placed for the current line (0, 1, or 2).
 */

/**
 * @typedef {object} DrawingAction
 * @property {ImageData} imageDataSnapshot Raw image data for synchronous restoration.
 */

// --- Catmull-Rom Spline Helper ---

/**
 * Calculates a point on the Catmull-Rom Spline (Tension=0.5).
 * @param {number} t Time parameter (0 to 1).
 * @param {number} p0 Coordinate of P0 (Pre-segment control).
 * @param {number} p1 Coordinate of P1 (Start of segment).
 * @param {number} p2 Coordinate of P2 (End of segment).
 * @param {number} p3 Coordinate of P3 (Post-segment control).
 * @returns {number} Coordinate on the curve.
 */
const getCatmullRomPoint = (t, p0, p1, p2, p3) => {
    // Standard Centripetal Catmull-Rom basis functions (alpha=0.5)
    const t2 = t * t;
    const t3 = t2 * t;
    
    // Basis functions:
    const a = 0.5 * (2 * p1);
    const b = 0.5 * (-p0 + p2) * t;
    const c = 0.5 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2;
    const d = 0.5 * (-p0 + 3 * p1 - 3 * p2 + p3) * t3;
    
    return a + b + c + d;
};


// --- Core Drawing Instance Setup Function ---

function setupCanvasDrawInstance(originalElement = null) {
    injectStyles();

    // --- History Definitions (PER INSTANCE - Isolation) ---
    let historyStack = [];
    let historyIndex = -1; 

    // --- State Variables (Per Instance) ---
    /** @type {DrawState} */
    let state = {
        currentTool: 'pencil', 
        color: '#000000',
        thickness: DEFAULT_THICKNESS,
        isDrawing: false,
        lastPos: null,
        currentPoints: [], // Spline: [P1, P2, P3, ... PN]
        activePointIndex: -1, 
        tempShape: null,
        linePointCount: 0 // New state variable for tracking line points
    };

    let originalId = null;
    let originalClass = null;

    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
    }

    // --- Create DOM Elements and Get References ---
    const container = createCanvasDrawDOM(originalClass, originalId);
    const toolbar = container.querySelector('.canvas-draw-toolbar');
    const drawArea = container.querySelector('.canvas-draw-area');
    
    const canvas = document.createElement('canvas');
    drawArea.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    // Get toolbar controls
    const toolsPopup = container.querySelector('.canvas-draw-tools-popup');
    const settingsPopup = container.querySelector('.canvas-draw-settings-popup');
    const colorPicker = container.querySelector('.color-picker');
    const thicknessInput = container.querySelector('.thickness-input'); 
    const undoButton = container.querySelector('.undo-action');
    const redoButton = container.querySelector('.redo-action');
    const downloadButton = container.querySelector('.download-image');
    const toolButtons = container.querySelectorAll('.tool-btn');
    
    // --- Finalize Button Creation ---
    const finalizeButton = container.querySelector('.finalize-action') || document.createElement('button');
    if (!container.querySelector('.finalize-action')) {
        finalizeButton.className = 'action-btn finalize-action';
        finalizeButton.title = 'Finalize Shape (Line/Spline)';
        finalizeButton.innerHTML = '✅ Finalize';
        // Insert the new button next to the Redo button
        const redoButton = container.querySelector('.redo-action');
        if (redoButton) redoButton.parentNode.insertBefore(finalizeButton, redoButton.nextSibling);
    }
    finalizeButton.disabled = true;


    // --- History Management & UI Update Helpers ---

    const updateFinalizeButton = () => {
        const lineReady = state.currentTool === 'line' && state.tempShape && state.tempShape.points.length === 2;
        // Spline is ready to finalize if there are 2 or more points.
        const splineReady = state.currentTool === 'spline' && state.currentPoints.length >= 2; 
        finalizeButton.disabled = !(lineReady || splineReady);
    }
    
    const saveState = () => {
        // Ensure canvas dimensions are set before calling getImageData
        if (canvas.width === 0 || canvas.height === 0) return; 
        
        if (historyStack.length > historyIndex + 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historyStack.push({ imageDataSnapshot: imageData });
        historyIndex++;

        if (historyStack.length > 20) {
            historyStack.shift();
            historyIndex--;
        }
        updateHistoryButtons();
        updateFinalizeButton();
    };
    
    const refreshCanvas = () => {
        if (historyIndex < 0 || historyIndex >= historyStack.length) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const snapshot = historyStack[historyIndex].imageDataSnapshot;
        ctx.putImageData(snapshot, 0, 0);
        setupContext(); 
    };
    
    const restoreState = (index) => {
        if (index < 0 || index >= historyStack.length) return;
        
        const snapshot = historyStack[index].imageDataSnapshot;
        ctx.putImageData(snapshot, 0, 0);
        setupContext(); 
        historyIndex = index;
        
        // Re-render the editor state when returning to the current view
        if (state.currentTool === 'line' && state.tempShape && state.tempShape.points.length > 0) {
            drawLinePreview(state.tempShape.points[0], state.tempShape.points[1] || state.tempShape.points[0], true);
        } else if (state.currentTool === 'spline' && state.currentPoints.length > 0) {
            drawSplinePreview(state.currentPoints, true);
        }

        updateHistoryButtons();
        updateFinalizeButton();
    };
    
    const updateHistoryButtons = () => {
        undoButton.disabled = historyIndex <= 0;
        redoButton.disabled = historyIndex >= historyStack.length - 1;
    };

    const clearCanvas = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.currentPoints = [];
        state.tempShape = null;
        state.linePointCount = 0; // Reset line point count
        saveState();
    };


    // --- Drawing Logic Helpers ---
    const setupContext = (color = state.color, thickness = state.thickness) => {
        ctx.strokeStyle = color;
        // NOTE: thickness is already in 'mm' but treated as 'px' for context.lineWidth
        ctx.lineWidth = thickness; 
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };
    
    // Point detection helper for Line/Spline tool editing
    const findActivePoint = (pos) => {
        // Line points only exist if tempShape is active
        const points = state.currentTool === 'line' && state.tempShape 
            ? state.tempShape.points 
            : state.currentTool === 'spline' 
            ? state.currentPoints 
            : [];
            
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dist = Math.sqrt(Math.pow(pos.x - p.x, 2) + Math.pow(pos.y - p.y, 2));
            if (dist < POINT_HIT_RADIUS) {
                return i;
            }
        }
        return -1;
    };

    // Pencil: Draws segment by segment
    const drawFreehand = (pos) => {
        setupContext();
        ctx.beginPath();
        if (state.lastPos) {
            ctx.moveTo(state.lastPos.x, state.lastPos.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }
        state.lastPos = pos;
    };
    
    // Line: Draws the preview during drag/edit
    const drawLinePreview = (start, end, isRestoring = false) => {
        if (!isRestoring) {
            refreshCanvas(); 
        }

        setupContext(state.tempShape.color, state.tempShape.thickness);
        
        const pointsToDraw = [start];
        if (start.x !== end.x || start.y !== end.y) { // Only draw end point if it's different
            pointsToDraw.push(end);
        }

        // Draw the line if two distinct points are defined, or if dragging (where start and end might temporarily overlap)
        if (pointsToDraw.length === 2 || state.isDrawing) {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }

        // Draw editable points
        // Only draw point markers if linePointCount > 0
        if (state.linePointCount > 0) {
            [start, end].forEach((p, index) => {
                // Only draw the second point marker if it has been placed (linePointCount == 2)
                // OR if we are currently dragging to place the second point (state.isDrawing && index == 1)
                if (index === 0 || state.linePointCount === 2 || (state.isDrawing && index === 1)) {
                    ctx.fillStyle = index === state.activePointIndex ? 'blue' : 'red';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, POINT_HIT_RADIUS / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }
    };
    
    // Line: Draws the final shape without markers (before saving)
    const drawLineFinal = (start, end) => {
        refreshCanvas(); 
        setupContext(state.tempShape.color, state.tempShape.thickness);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }
    
    // Spline: Draws the Catmull-Rom spline (Handles N points)
    const drawSplinePreview = (points, isRestoring = false) => {
        // Only draw points if there is at least one.
        if (points.length === 0) return;
        
        if (!isRestoring) {
             // This is the normal drawing path, handles refreshing the background
             refreshCanvas(); 
        }

        setupContext();
        
        // Draw the spline curve only if there are at least two points
        if (points.length >= 2) {
            const steps = 50; 
            ctx.beginPath();
            
            // Start the path at the first point
            ctx.moveTo(points[0].x, points[0].y);

            // Iterate through all possible segments (from P1 to PN)
            for (let i = 0; i < points.length - 1; i++) {
                // P0 (Clamping for start: P0 = P1)
                const P0 = (i === 0) ? points[i] : points[i - 1]; 
                const P1 = points[i];
                const P2 = points[i + 1];
                // P3 (Clamping for end: P3 = P2)
                const P3 = (i === points.length - 2) ? points[i + 1] : points[i + 2]; 

                for (let j = 1; j <= steps; j++) {
                    const t = j / steps;
                    
                    const x = getCatmullRomPoint(t, P0.x, P1.x, P2.x, P3.x);
                    const y = getCatmullRomPoint(t, P0.y, P1.y, P2.y, P3.y);
                    
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        // Draw visual guides for the points (Interpolating points)
        points.forEach((p, index) => {
            ctx.fillStyle = index === state.activePointIndex ? 'blue' : 'red';
            ctx.beginPath();
            ctx.arc(p.x, p.y, POINT_HIT_RADIUS / 2, 0, Math.PI * 2);
            ctx.fill();
        });
    };
    
    // Spline: Draws the final shape without markers (before saving)
    const drawSplineFinal = (points) => {
        if (points.length < 2) return;

        refreshCanvas(); 
        setupContext();
        
        const steps = 50;
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        // Draw segments
        for (let i = 0; i < points.length - 1; i++) {
            const P0 = (i === 0) ? points[i] : points[i - 1]; 
            const P1 = points[i];
            const P2 = points[i + 1];
            const P3 = (i === points.length - 2) ? points[i + 1] : points[i + 2]; 

            for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                const x = getCatmullRomPoint(t, P0.x, P1.x, P2.x, P3.x);
                const y = getCatmullRomPoint(t, P0.y, P1.y, P2.y, P3.y);
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }


    // --- Event Handlers (Mouse/Touch) ---

    const handleStart = (e) => {
        e.preventDefault();
        const pos = getPos(e);
        state.isDrawing = true; 

        if (state.currentTool === 'pencil') { 
            state.lastPos = pos;
            drawFreehand(pos);
            
        } else if (state.currentTool === 'line') {
            state.activePointIndex = findActivePoint(pos);
            
            if (state.activePointIndex !== -1) {
                // We hit an existing point, just prepare for dragging.
                state.isDrawing = true;

            } else if (state.linePointCount === 0) {
                // FIRST TAP: Place P1. Wait for P2.
                state.tempShape = { 
                    points: [pos, pos], // Initialize with two identical points for line preview logic 
                    color: state.color, 
                    thickness: state.thickness 
                };
                state.linePointCount = 1;
                state.activePointIndex = -1; // No point is actively being dragged yet
                
                // Draw P1 (the line preview function handles drawing only P1 marker when count is 1)
                drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);

            } else if (state.linePointCount === 1) {
                // SECOND TAP/START OF DRAG: Place P2.
                state.tempShape.points[1] = pos;
                state.linePointCount = 2;
                state.activePointIndex = 1; // P2 is now the active dragging point
                state.isDrawing = true;
                
                // Start drawing the full line preview
                drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);
            } else {
                 state.isDrawing = false; 
            }
            
        } else if (state.currentTool === 'spline') { 
            state.activePointIndex = findActivePoint(pos);
            
            if (state.activePointIndex === -1) { 
                // Placement mode: Place a new point on MOUSE DOWN/TOUCH START
                state.currentPoints.push(pos);
                state.activePointIndex = state.currentPoints.length - 1; 
                
                // Ensure the point is drawn immediately
                drawSplinePreview(state.currentPoints);
            }
            // If activePointIndex is found, isDrawing remains true for dragging logic
        }
    };

    const handleMove = (e) => {
        if (!state.isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);

        if (state.currentTool === 'pencil') {
            drawFreehand(pos);

        } else if (state.currentTool === 'line' && state.tempShape) {
            if (state.activePointIndex !== -1) {
                 // Dragging an existing point (P1 or P2)
                 state.tempShape.points[state.activePointIndex] = pos;
                 state.linePointCount = 2; // If we drag, we definitely have two points
                 drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);
                 updateFinalizeButton();
            } else if (state.linePointCount === 1) {
                // Dragging to set P2 for the first time
                state.tempShape.points[1] = pos;
                state.activePointIndex = 1; // Now P2 is the active point
                state.linePointCount = 2;
                drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);
                updateFinalizeButton();
            }
            
        } else if (state.currentTool === 'spline' && state.activePointIndex !== -1) { 
            state.currentPoints[state.activePointIndex] = pos;
            drawSplinePreview(state.currentPoints); 
            updateFinalizeButton();
        }
    };

    const handleEnd = (e) => {
        if (!state.isDrawing) return;
        state.isDrawing = false;
        
        if (state.currentTool === 'pencil') {
            state.lastPos = null;
            saveState();
            
        } else if (state.currentTool === 'line') {
            // If a drag operation was completed, the last point set is now final (until the user clicks to drag again)
            state.activePointIndex = -1;
            updateFinalizeButton();
            
        } else if (state.currentTool === 'spline') {
            // Point placement/drag ends.
            state.activePointIndex = -1;
            updateFinalizeButton();
        }
    };
    
    const handleClick = (e) => {
        e.preventDefault();
        
        // Handle the explicit second tap for the Line tool (no drag)
        if (state.currentTool === 'line' && state.linePointCount === 1) {
            const pos = getPos(e);
            
            // This is a tap (click) that sets P2 without a drag
            state.tempShape.points[1] = pos;
            state.linePointCount = 2;
            state.activePointIndex = -1; // Set point, but stop dragging immediately
            state.isDrawing = false;
            
            // Draw the final preview
            drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);
            updateFinalizeButton();
        }
    }
    
    const finalizeCurrentShape = () => {
        if (state.currentTool === 'line' && state.tempShape && state.tempShape.points.length === 2) {
            const [start, end] = state.tempShape.points;
            drawLineFinal(start, end);
            saveState(); 
            state.tempShape = null; 
            state.linePointCount = 0; // Reset line point count
            
        } else if (state.currentTool === 'spline' && state.currentPoints.length >= 2) { 
            // Finalize any spline with 2 or more points
            drawSplineFinal(state.currentPoints); 
            saveState();
            state.currentPoints = []; 
        }
        
        restoreState(historyIndex);
        updateFinalizeButton(); 
    }


    // --- Initialization and Event Wiring ---
    
    const handleToolSwitch = (newTool) => {
        // Finalize any unfinished shape before switching
        if (!finalizeButton.disabled) {
             finalizeCurrentShape();
        }
        
        // Clear all temporary state variables
        state.currentPoints = [];
        state.tempShape = null;
        state.activePointIndex = -1;
        state.isDrawing = false;
        state.lastPos = null;
        state.linePointCount = 0; // Reset on tool switch

        state.currentTool = newTool;
        // Restore the background canvas without any preview shapes
        refreshCanvas(); 
        updateFinalizeButton();
    };
    
    const resizeCanvas = () => {
        canvas.width = drawArea.clientWidth;
        canvas.height = drawArea.clientHeight;
        
        if (historyStack.length > 0) {
             restoreState(historyIndex); 
        } else {
             setupContext();
        }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(drawArea);
    
    resizeCanvas(); 
    setupContext();

    if (historyStack.length === 0) {
        saveState();
    }


    // Event listeners for drawing
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', handleEnd); 
    canvas.addEventListener('click', handleClick); // Use click for final P2 tap
    
    canvas.addEventListener('touchstart', handleStart);
    canvas.addEventListener('touchmove', handleMove);
    canvas.addEventListener('touchend', handleEnd);
    canvas.addEventListener('touchcancel', handleEnd);


    // --- Toolbar listeners ---
    toolbar.addEventListener('click', (e) => {
        if (e.target.classList.contains('tools-toggle-btn')) {
            togglePopup(e, toolsPopup);
        } else if (e.target.classList.contains('settings-toggle-btn')) {
            togglePopup(e, settingsPopup);
        } else if (e.target.classList.contains('tool-btn')) {
            const tool = e.target.dataset.tool;
            handleToolSwitch(tool); 
            
            toolButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        } else if (e.target.classList.contains('finalize-action')) { 
            finalizeCurrentShape();
        } else if (e.target.classList.contains('clear-canvas')) {
            clearCanvas();
            settingsPopup.classList.remove('visible'); 
        } else if (e.target.classList.contains('undo-action')) {
            if (state.currentTool === 'spline' && state.currentPoints.length > 0) { 
                 refreshCanvas(); 
                 state.currentPoints.pop();
                 drawSplinePreview(state.currentPoints, true); 
            } else if (state.currentTool === 'line') {
                if (state.linePointCount === 2) {
                    // Undo P2: go back to just P1
                    state.linePointCount = 1;
                    state.tempShape.points[1] = state.tempShape.points[0]; // P2 = P1
                    state.activePointIndex = -1;
                    drawLinePreview(state.tempShape.points[0], state.tempShape.points[1]);
                } else if (state.linePointCount === 1) {
                    // Undo P1: clear the shape
                    state.linePointCount = 0;
                    state.tempShape = null;
                    refreshCanvas(); 
                } else {
                    // Fallback to history
                    restoreState(historyIndex - 1);
                }
            } else {
                 // Fallback to history
                 restoreState(historyIndex - 1);
            }
            updateFinalizeButton();
        } else if (e.target.classList.contains('redo-action')) {
            restoreState(historyIndex + 1);
        } else if (e.target.classList.contains('download-image')) {
            if (!finalizeButton.disabled) {
                finalizeCurrentShape();
            }
            const link = document.createElement('a');
            link.download = `drawing-${Date.now()}.png`;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(historyStack[historyIndex].imageDataSnapshot, 0, 0);
            
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        }
    });
    
    // ... (color and thickness input listeners remain unchanged) ...
    
    colorPicker.addEventListener('change', (e) => {
        state.color = e.target.value;
        setupContext();
    });
    
    // Thickness input handler
    thicknessInput.addEventListener('input', (e) => {
        let mmValue = parseFloat(e.target.value);
        
        const min = MIN_THICKNESS_MM;
        const max = MAX_THICKNESS_MM;

        if (isNaN(mmValue) || mmValue < min) {
            mmValue = min;
        } else if (mmValue > max) {
            mmValue = max;
        }

        state.thickness = mmValue;
        setupContext(); 
    });
    
    // Ensure value is fixed on blur
    thicknessInput.addEventListener('blur', (e) => {
        let mmValue = parseFloat(e.target.value);
        const min = MIN_THICKNESS_MM;

        if (isNaN(mmValue) || mmValue < min) {
            mmValue = min;
        }
        
        mmValue = Math.max(min, Math.min(MAX_THICKNESS_MM, mmValue));
        mmValue = Math.round(mmValue * 10) / 10; 
        
        e.target.value = mmValue.toFixed(1);
        state.thickness = mmValue;
        
        setupContext();
    });

    const togglePopup = (e, targetPopup) => {
        e.stopPropagation(); 
        
        if (targetPopup === toolsPopup) {
            settingsPopup.classList.remove('visible');
        } else if (targetPopup === settingsPopup) {
            toolsPopup.classList.remove('visible');
        }
        targetPopup.classList.toggle('visible');
    }

    // Close popups if user clicks anywhere outside the toolbar area 
    document.addEventListener('click', (e) => {
        if (!toolbar.contains(e.target)) {
            toolsPopup.classList.remove('visible');
            settingsPopup.classList.remove('visible');
        }
    });


    return container;
}


// --- DOM Observation for <canvasdraw> tags ---

function observeCanvasDrawElements() {
    document.querySelectorAll('canvasdraw').forEach(canvasdrawElement => {
        const parentContainer = canvasdrawElement.parentNode;
        if (parentContainer) {
            const pickerDom = setupCanvasDrawInstance(canvasdrawElement);
            parentContainer.replaceChild(pickerDom, canvasdrawElement);
        } else {
            console.warn("Found <canvasdraw> element without a parent, cannot convert:", canvasdrawElement);
        }
    });
}

// --- Initialize on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    observeCanvasDrawElements();
});

// --- Public function to create a new drawing tool programmatically. ---
export function createCanvasDraw() {
    return setupCanvasDrawInstance();
}
