




















import * as THREE from 'three';

/**
 * 🛠️ Creates a custom indexed extruded geometry with UV mapping.
 *
 * @param {THREE.Shape} shape The 2D shape to extrude.
 * @param {number} depth The total depth of the extrusion.
 * @param {number} segments The number of segments (slices) along the extrusion depth.
 * @returns {THREE.BufferGeometry} The resulting indexed BufferGeometry with position, index, and uv attributes.
 */
function createSegmentedExtrusion(shape, depth, segments) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = []; // <-- NEW: Array to hold UV coordinates

    // --- 1. Extract Points and Triangulate ---
    const shapeData = shape.extractPoints(1); 
    const contourPoints = shapeData.shape;
    const holePoints = shapeData.holes;     
    const capTriangles = THREE.ShapeUtils.triangulateShape(contourPoints, holePoints);
    
    // --- 2. Set up constants ---
    const segmentDepth = depth / segments;
    const halfDepth = depth / 2;
    let vertexCount = 0;

    // Get bounding box of the 2D shape for normalized Cap UVs
    const allPoints = [contourPoints, ...holePoints].flat();
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));
    const width = maxX - minX;
    const height = maxY - minY;

    // --- 3. Extrusion (Sides/Walls) ---

    const extrudeContour = (points, reverseWinding) => {
        const contourStartVertexCount = vertexCount;
        const numPoints = points.length;

        // 3a. Calculate total length of this contour for side UVs
        let contourLength = 0;
        for (let i = 0; i < numPoints; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % numPoints];
            contourLength += p1.distanceTo(p2);
        }

        // 3b. Generate Vertices and UVs
        let u_current = 0; // The 'U' coordinate tracks distance along the contour
        
        for (let i = 0; i <= segments; i++) { // Loop depth segments (V coordinate)
            const z = i * segmentDepth - halfDepth;
            const v = 1 - (i / segments); // V coordinate: 1 at bottom, 0 at top

            u_current = 0; // Reset U for each depth slice

            for (let j = 0; j < numPoints; j++) { // Loop 2D points (U coordinate)
                const point = points[j];

                // Positions
                vertices.push(point.x, point.y, z);
                
                // UVs (U: distance along contour, V: distance along depth)
                uvs.push(u_current / contourLength, v); // U is normalized by total length
                vertexCount++;
                
                // Update U distance for the next point
                const p1 = points[j];
                const p2 = points[(j + 1) % numPoints];
                u_current += p1.distanceTo(p2);
            }
        }

        // 3c. Generate Indices (Faces) (No change here from previous version)
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < numPoints; j++) {
                const idx_a = contourStartVertexCount + i * numPoints + j;
                const idx_b = contourStartVertexCount + i * numPoints + (j + 1) % numPoints;
                const idx_c = contourStartVertexCount + (i + 1) * numPoints + (j + 1) % numPoints;
                const idx_d = contourStartVertexCount + (i + 1) * numPoints + j;

                if (reverseWinding) {
                    indices.push(idx_a, idx_d, idx_c);
                    indices.push(idx_a, idx_c, idx_b);
                } else {
                    indices.push(idx_a, idx_b, idx_c);
                    indices.push(idx_a, idx_c, idx_d);
                }
            }
        }
    };

    // Extrude main outline and then all holes
    extrudeContour(contourPoints, false);
    for (const hole of holePoints) {
        extrudeContour(hole, true);
    }

    // --- 4. Caps (Top and Bottom) ---

    const addCap = (isTop) => {
        const capStartVertexCount = vertexCount;
        const z = isTop ? halfDepth : -halfDepth;

        // 4a. Generate Vertices and UVs for the cap
        const allCapPoints = [contourPoints, ...holePoints].flat();
        for (const point of allCapPoints) {
            vertices.push(point.x, point.y, z);
            vertexCount++;

            // UVs for Caps: Normalize X/Y coordinates to fit in the 0-1 UV space
            // U = (X - minX) / width
            // V = (Y - minY) / height
            uvs.push((point.x - minX) / width, (point.y - minY) / height); 
        }

        // 4b. Generate Indices (Faces) (No change here from previous version)
        for (const tri of capTriangles) {
            const v1 = capStartVertexCount + tri[0];
            const v2 = capStartVertexCount + tri[1];
            const v3 = capStartVertexCount + tri[2];

            if (isTop) {
                indices.push(v1, v2, v3);
            } else {
                indices.push(v1, v3, v2);
            }
        }
    };

    // Add the top and bottom caps
    addCap(true);
    addCap(false);

    // --- 5. Finalize Geometry ---
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    // <-- CRITICAL STEP: Set the UV attribute
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); 
    
    geometry.computeVertexNormals(); 

    return geometry;
}





import * as THREE from 'three';

/**
 * 🛠️ Creates a custom indexed extruded geometry from a THREE.Shape with segments along the depth.
 * This is a manual implementation that handles the triangulation of the 2D shape (including holes)
 * and the creation of side walls segment by segment, using BufferGeometry indexing.
 *
 * @param {THREE.Shape} shape The 2D shape to extrude (THREE.Shape, may contain holes).
 * @param {number} depth The total depth of the extrusion.
 * @param {number} segments The number of segments (slices) along the extrusion depth.
 * @returns {THREE.BufferGeometry} The resulting indexed BufferGeometry.
 */
function createSegmentedExtrusion(shape, depth, segments) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    // --- 1. Extract 2D points from the shape and its holes ---
    // A division count of 1 is sufficient for straight lines, use higher for curves.
    const shapeData = shape.extractPoints(1); 
    const contourPoints = shapeData.shape; // Outer path (THREE.Vector2 array)
    const holePoints = shapeData.holes;     // Array of hole paths (Array of THREE.Vector2 arrays)

    // --- 2. Triangulate the 2D shape for the caps ---
    const capTriangles = THREE.ShapeUtils.triangulateShape(contourPoints, holePoints);
    
    // --- 3. Set up constants ---
    const segmentDepth = depth / segments;
    const halfDepth = depth / 2;
    let vertexCount = 0; // Current index for the next vertex to be added

    // --- 4. Extrusion (Sides/Walls) ---

    // Helper function to generate side vertices and indices for one contour (outer or hole)
    const extrudeContour = (points, reverseWinding) => {
        const contourStartVertexCount = vertexCount;

        // 4a. Generate Vertices for all depth segments
        for (let i = 0; i <= segments; i++) {
            const z = i * segmentDepth - halfDepth; // Center extrusion at Z=0
            for (const point of points) {
                vertices.push(point.x, point.y, z);
                vertexCount++;
            }
        }

        // 4b. Generate Indices (Faces) for the side segments (quads split into 2 triangles)
        const numPoints = points.length;
        for (let i = 0; i < segments; i++) { // Loop depth segments
            for (let j = 0; j < numPoints; j++) { // Loop 2D points
                
                // Four vertices of the quad
                const idx_a = contourStartVertexCount + i * numPoints + j;
                const idx_b = contourStartVertexCount + i * numPoints + (j + 1) % numPoints;
                const idx_c = contourStartVertexCount + (i + 1) * numPoints + (j + 1) % numPoints;
                const idx_d = contourStartVertexCount + (i + 1) * numPoints + j;

                // Triangle 1 and Triangle 2
                if (reverseWinding) {
                    // Reverse winding for hole walls (inner faces)
                    indices.push(idx_a, idx_d, idx_c);
                    indices.push(idx_a, idx_c, idx_b);
                } else {
                    // Standard winding for outer walls
                    indices.push(idx_a, idx_b, idx_c);
                    indices.push(idx_a, idx_c, idx_d);
                }
            }
        }
    };

    // Extrude main outline and then all holes
    extrudeContour(contourPoints, false);
    for (const hole of holePoints) {
        extrudeContour(hole, true);
    }

    // --- 5. Caps (Top and Bottom) ---

    const addCap = (isTop) => {
        const capStartVertexCount = vertexCount;
        const z = isTop ? halfDepth : -halfDepth;

        // 5a. Generate Vertices for the cap (must match the order used by triangulateShape)
        const allCapPoints = [contourPoints, ...holePoints].flat();
        for (const point of allCapPoints) {
            vertices.push(point.x, point.y, z);
            vertexCount++;
        }

        // 5b. Generate Indices (Faces) from the pre-calculated triangulation
        for (const tri of capTriangles) {
            const v1 = capStartVertexCount + tri[0];
            const v2 = capStartVertexCount + tri[1];
            const v3 = capStartVertexCount + tri[2];

            if (isTop) {
                // Top Cap: Winding order faces +Z
                indices.push(v1, v2, v3);
            } else {
                // Bottom Cap: Winding order faces -Z (reversed)
                indices.push(v1, v3, v2);
            }
        }
    };

    // Add the top and bottom caps
    addCap(true);
    addCap(false);

    // --- 6. Finalize Geometry (Indexed BufferGeometry) ---
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals(); 

    return geometry;
}

// Export the function for use in a module (if needed)
// export { createSegmentedExtrusion };
