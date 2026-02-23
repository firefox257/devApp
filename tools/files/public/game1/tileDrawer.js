// tileDrawer.js

/**
 * A module for drawing tile-based graphics on an HTML canvas.
 *
 * @module tileDrawer
 */
alert(1)
let canvas;
let ctx;
let tileSize; // Size of each tile in pixels (e.g., 32 for 32x32 pixels)
let gridWidth; // Number of tiles horizontally
let gridHeight; // Number of tiles vertically
let mapWidth; // Total width of the canvas in pixels
let mapHeight; // Total height of the canvas in pixels

/**
 * Initializes the tile drawing module.
 *
 * @param {HTMLCanvasElement} canvasElement - The canvas element to draw on.
 * @param {number} tilePixelSize - The size (width and height) of each tile in pixels.
 * @param {number} tilesWide - The number of tiles that fit horizontally on the canvas.
 * @param {number} tilesHigh - The number of tiles that fit vertically on the canvas.
 * @throws {Error} If canvasElement is not a valid HTMLCanvasElement.
 * @throws {Error} If tilePixelSize, tilesWide, or tilesHigh are not positive numbers.
 */
export function initialize(canvasElement, tilePixelSize, tilesWide, tilesHigh) {
    if (!(canvasElement instanceof HTMLCanvasElement)) {
        throw new Error("Invalid canvas element provided.");
    }
    if (typeof tilePixelSize !== 'number' || tilePixelSize <= 0) {
        throw new Error("Tile size must be a positive number.");
    }
    if (typeof tilesWide !== 'number' || tilesWide <= 0) {
        throw new Error("Tiles wide must be a positive number.");
    }
    if (typeof tilesHigh !== 'number' || tilesHigh <= 0) {
        throw new Error("Tiles high must be a positive number.");
    }

    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    tileSize = tilePixelSize;
    gridWidth = tilesWide;
    gridHeight = tilesHigh;
    mapWidth = gridWidth * tileSize;
    mapHeight = gridHeight * tileSize;

    canvas.width = mapWidth;
    canvas.height = mapHeight;

    // Optional: Set some default drawing styles
    ctx.imageSmoothingEnabled = false; // For crisp pixel art
}

/**
 * Clears the entire canvas.
 */
export function clearCanvas() {
    if (!ctx) {
        console.error("Tile drawer not initialized. Call initialize() first.");
        return;
    }
    ctx.clearRect(0, 0, mapWidth, mapHeight);
}

/**
 * Draws a single tile at a specified grid coordinate.
 *
 * @param {number} tileX - The horizontal grid coordinate (column index, 0-based).
 * @param {number} tileY - The vertical grid coordinate (row index, 0-based).
 * @param {string|CanvasImageSource} tileImage - The image source for the tile. This can be an Image object, a Canvas object, or a string URL (though using Image objects is more efficient if drawing the same tile multiple times).
 * @param {number} [sourceX=0] - The x-coordinate of the tile's source rectangle within tileImage.
 * @param {number} [sourceY=0] - The y-coordinate of the tile's source rectangle within tileImage.
 * @param {number} [sourceWidth=tileSize] - The width of the tile's source rectangle within tileImage.
 * @param {number} [sourceHeight=tileSize] - The height of the tile's source rectangle within tileImage.
 * @throws {Error} If tileX or tileY are out of bounds.
 */
export function drawTile(tileX, tileY, tileImage, sourceX = 0, sourceY = 0, sourceWidth = tileSize, sourceHeight = tileSize) {
    if (!ctx) {
        console.error("Tile drawer not initialized. Call initialize() first.");
        return;
    }

    if (tileX < 0 || tileX >= gridWidth || tileY < 0 || tileY >= gridHeight) {
        throw new Error(`Tile coordinates (${tileX}, ${tileY}) are out of bounds. Grid is ${gridWidth}x${gridHeight}.`);
    }

    const destX = tileX * tileSize;
    const destY = tileY * tileSize;

    // Ensure the tileImage is ready if it's an Image object
    if (tileImage instanceof Image && !tileImage.complete) {
        tileImage.onload = () => {
            ctx.drawImage(
                tileImage,
                sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle
                destX, destY, tileSize, tileSize            // Destination rectangle
            );
        };
        // If already loaded, draw immediately
        if (tileImage.complete) {
             ctx.drawImage(
                tileImage,
                sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle
                destX, destY, tileSize, tileSize            // Destination rectangle
            );
        }
    } else {
        ctx.drawImage(
            tileImage,
            sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle
            destX, destY, tileSize, tileSize            // Destination rectangle
        );
    }
}

/**
 * Draws an entire map from a 2D array of tile data.
 * Each element in the 2D array should represent the tile to draw.
 * This function assumes you have a way to map tile data to actual images.
 * A common approach is to have a spritesheet and use tile IDs to pick parts of it.
 *
 * For this example, we'll assume each element in the map data is an object:
 * {
 *   image: HTMLImageElement, // The image source for this tile
 *   sourceX: number,         // X offset within the image
 *   sourceY: number,         // Y offset within the image
 *   sourceWidth: number,     // Width of the tile in the image
 *   sourceHeight: number     // Height of the tile in the image
 * }
 *
 * If you have a simpler system (e.g., tile IDs that map to a single spritesheet),
 * you'll need to adapt this function or create a helper to get the tile data.
 *
 * @param {Array<Array<object>>} mapData - A 2D array where each element describes a tile to draw.
 * @param {HTMLImageElement} defaultImage - A fallback image if a tile's image is missing.
 * @param {object} [defaultTileInfo={}] - Default info if a map data entry is null/undefined.
 * @param {number} [defaultTileInfo.sourceX=0]
 * @param {number} [defaultTileInfo.sourceY=0]
 * @param {number} [defaultTileInfo.sourceWidth=tileSize]
 * @param {number} [defaultTileInfo.sourceHeight=tileSize]
 * @throws {Error} If mapData is not a 2D array.
 */
export function drawMap(mapData, defaultImage, defaultTileInfo = {}) {
    if (!ctx) {
        console.error("Tile drawer not initialized. Call initialize() first.");
        return;
    }
    if (!Array.isArray(mapData) || !Array.isArray(mapData[0])) {
        throw new Error("Map data must be a 2D array.");
    }

    // Ensure default tile info uses tileSize if not provided
    const effectiveDefaultTileInfo = {
        sourceX: defaultTileInfo.sourceX || 0,
        sourceY: defaultTileInfo.sourceY || 0,
        sourceWidth: defaultTileInfo.sourceWidth || tileSize,
        sourceHeight: defaultTileInfo.sourceHeight || tileSize,
    };

    // Pre-load images if they are not already loaded (optional, but good practice)
    const imagesToLoad = new Set();
    for (let y = 0; y < mapData.length; y++) {
        for (let x = 0; x < mapData[y].length; x++) {
            const tileInfo = mapData[y][x];
            if (tileInfo && tileInfo.image && tileInfo.image instanceof Image && !tileInfo.image.complete) {
                imagesToLoad.add(tileInfo.image);
            }
        }
    }

    // If there are images to load, we might need to wait.
    // For simplicity in this module, we'll draw directly and handle onload
    // within drawTile, but a more robust solution might involve Promises.
    // Here, we'll just proceed, and drawTile will handle the onload callback.

    for (let y = 0; y < mapData.length; y++) {
        // Ensure the row has the expected width, pad with defaults if not
        const row = mapData[y];
        const effectiveRowWidth = Math.min(row.length, gridWidth);

        for (let x = 0; x < gridWidth; x++) {
            const tileInfo = (x < effectiveRowWidth) ? row[x] : null;

            if (tileInfo && tileInfo.image) {
                drawTile(
                    x, y,
                    tileInfo.image,
                    tileInfo.sourceX || 0,
                    tileInfo.sourceY || 0,
                    tileInfo.sourceWidth || tileSize,
                    tileInfo.sourceHeight || tileSize
                );
            } else if (defaultImage) {
                // Draw a default tile if no info or image is provided
                drawTile(
                    x, y,
                    defaultImage,
                    effectiveDefaultTileInfo.sourceX,
                    effectiveDefaultTileInfo.sourceY,
                    effectiveDefaultTileInfo.sourceWidth,
                    effectiveDefaultTileInfo.sourceHeight
                );
            }
        }
    }
}

// Helper function to create an Image object from a URL
export function createImage(url) {
    const img = new Image();
    img.src = url;
    return img;
}

// You can export other utilities as needed, e.g., for coordinate conversion
export function gridToPixel(gridX, gridY) {
    if (!ctx) {
        console.error("Tile drawer not initialized. Call initialize() first.");
        return { x: 0, y: 0 };
    }
    return {
        x: gridX * tileSize,
        y: gridY * tileSize
    };
}

export function pixelToGrid(pixelX, pixelY) {
    if (!ctx) {
        console.error("Tile drawer not initialized. Call initialize() first.");
        return { x: 0, y: 0 };
    }
    return {
        x: Math.floor(pixelX / tileSize),
        y: Math.floor(pixelY / tileSize)
    };
}

export function getTileSize() {
    return tileSize;
}

export function getGridDimensions() {
    return { width: gridWidth, height: gridHeight };
}

export function getCanvasDimensions() {
    return { width: mapWidth, height: mapHeight };
}
