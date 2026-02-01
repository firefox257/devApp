// ./ux/canvasDrawUI.js

// --- Constants ---
const DEFAULT_COLOR = '#000000';
// Updated default thickness to 0.5mm
const DEFAULT_THICKNESS = 0.5; 
const MIN_THICKNESS_MM = 0.1;
const MAX_THICKNESS_MM = 50;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the drawing canvas into the document head (Borderless/Minimalist/Small Text).
 */
export function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'canvas-draw-styles';
    style.textContent = `
        /* Reset for Minimalist UI */
        .canvas-draw-container-wrapper, 
        .canvas-draw-container-wrapper * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none; 
        }

        /* Main container for the drawing tool */
        .canvas-draw-container-wrapper {
            position: relative;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            border: none; 
            font-family: Arial, sans-serif;
            background-color: #ffffff; 
        }
        
        /* Toolbar styles (MAXIMUM COMPACTNESS & NO SEPARATION) */
        .canvas-draw-toolbar {
            display: flex;
            flex-shrink: 0;
            padding: 2px;
            background-color: #f0f0f0;
            border-bottom: none; /* Removed separator line */
            gap: 2px; 
            align-items: center;
            position: relative; 
            z-index: 10;
        }

        .canvas-draw-toolbar button {
            background-color: transparent;
            border: none; /* Removed button borders */
            padding: 2px 4px; 
            font-size: 10px; /* Smallest font size for buttons */
            cursor: pointer;
            border-radius: 4px;
            transition: background-color 0.1s;
        }

        .canvas-draw-toolbar button:hover:not(.active) {
            background-color: #d0d0d0;
        }
        
        .canvas-draw-toolbar button.active {
            background-color: #007bff;
            color: white;
            /* Use shadow for subtle active state without a hard border */
            box-shadow: 0 0 0 1px #0056b3; 
        }
        
        /* --- Popup Styles (Compact) --- */
        .canvas-draw-tools-popup, .canvas-draw-settings-popup {
            position: absolute;
            top: 100%; 
            background-color: #fff;
            border: 1px solid #999; /* Popups retain border for visibility */
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            padding: 5px; 
            border-radius: 4px;
            display: none; 
            flex-direction: column;
            gap: 5px; 
            z-index: 20; 
        }
        
        .canvas-draw-tools-popup {
             left: 2px; 
        }
        
        .canvas-draw-settings-popup {
             right: 2px; 
        }
        
        .canvas-draw-tools-popup.visible, .canvas-draw-settings-popup.visible {
            display: flex;
        }
        
        /* Tool button grouping */
        .canvas-draw-tools-popup .tool-group,
        .canvas-draw-settings-popup .action-group {
            display: flex;
            gap: 5px;
        }
        
        /* Input styles for color and thickness (Compact) */
        .canvas-draw-tools-popup label {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px; /* Target font size for labels */
        }

        .canvas-draw-tools-popup input[type="color"] {
            width: 20px; 
            height: 20px;
            padding: 0;
            border: none;
            cursor: pointer;
        }

        /* Styling for the number input */
        .canvas-draw-tools-popup input[type="number"] {
            width: 40px; 
            text-align: right;
            padding: 1px; 
            border: 1px solid #ccc;
            border-radius: 3px;
            font-size: 10px; /* Target font size for input text */
        }
        
        /* Canvas area */
        .canvas-draw-area {
            flex-grow: 1;
            overflow: hidden;
            position: relative;
            background-color: #ffffff; 
        }
        
        .canvas-draw-area canvas {
            display: block;
            touch-action: none; 
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

/**
 * Creates the DOM structure for the drawing tool instance.
 * @param {string} originalClass The class from the original element.
 * @param {string} originalId The ID from the original element.
 * @returns {HTMLElement} The outermost DOM element of the drawing tool.
 */
export function createCanvasDrawDOM(originalClass, originalId) {
    const pickerHtml = `
        <div class="canvas-draw-container-wrapper ${originalClass || ''}" ${originalId ? `id="${originalId}"` : ''}>
            
            <div class="canvas-draw-toolbar">
                <button class="action-btn tools-toggle-btn active" title="Drawing Tools">🔧 Tools</button>
                
                <button class="action-btn undo-action" title="Undo Last Action">↩️ Undo</button>
                <button class="action-btn redo-action" title="Redo Last Action" disabled>↪️ Redo</button>

                <button class="action-btn download-image" title="Download as PNG">🖼️ Save</button>

                <button class="action-btn settings-toggle-btn" title="Settings">⚙️ Settings</button>


                <div class="canvas-draw-tools-popup">
                    <div class="tool-group">
                        <button class="tool-btn pencil-tool active" data-tool="pencil" title="Pencil">✏️ Pencil</button>
                        <button class="tool-btn line-tool" data-tool="line" title="Straight Line">📏 Line</button>
                        <button class="tool-btn spline-tool" data-tool="spline" title="Catmull-Rom Spline (passes through all points)">〰️ Spline</button>
                    </div>

                    <label>Color: <input type="color" class="color-picker" value="${DEFAULT_COLOR}"></label>
                    
                    <label>Thickness: 
                        <input 
                            type="number" 
                            class="thickness-input" 
                            min="${MIN_THICKNESS_MM}" 
                            max="${MAX_THICKNESS_MM}" 
                            step="0.1" 
                            value="${DEFAULT_THICKNESS.toFixed(1)}"
                        >
                        <span>mm</span>
                    </label>
                </div>
                
                <div class="canvas-draw-settings-popup">
                    <div class="action-group" style="flex-direction: column;">
                        <button class="action-btn clear-canvas">🗑️ Clear Canvas</button>
                    </div>
                </div>
            </div>

            <div class="canvas-draw-area">
                </div>
        </div>
    `;

    const drawContainerWrapper = document.createElement('div');
    drawContainerWrapper.innerHTML = pickerHtml;
    return drawContainerWrapper.firstElementChild;
}
