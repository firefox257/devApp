/*
./js/scadCSG.js
code runs in a browser
*/

/////

import * as THREE from 'three'
import {
    Brush,
    Evaluator,
    ADDITION,
    SUBTRACTION,
    INTERSECTION
} from 'three-bvh-csg'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { api } from './apiCalls.js' // Assuming apiCalls.js is in the same directory
//import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

import { BufferGeometry, Float32BufferAttribute } from 'three'

//////

//opentype is IIFE
//settings is on globalThis

globalThis.inch = 25.4

// === CSG Evaluator ===
const csgEvaluator = new Evaluator()
csgEvaluator.useGroups = true

const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    metalness: 0.2,
    roughness: 0.6,
    side: THREE.FrontSide,
    flatShading: true
})

// Helper function to recursively traverse the target and apply color

function $path(filepath) {
    if (!filepath) return null
    if (filepath.startsWith('/')) return filepath

    const libraryPath =
        typeof settings !== 'undefined' && settings.libraryPath
            ? settings.libraryPath
            : '/csgLib'
    if (filepath.startsWith('$lib/'))
        return libraryPath + '/' + filepath.substring(5)

    const base = globalThis.settings.basePath
    if (!base) {
        alert('Error: Cannot use relative paths. Load or save a project first.')
        return null
    }

    const parts = base.split('/').filter(Boolean)
    const fileParts = filepath.split('/')
    for (const part of fileParts) {
        if (part === '..') {
            if (parts.length > 0) parts.pop()
        } else if (part !== '.' && part !== '') parts.push(part)
    }
    return '/' + parts.join('/')
}

/**
 * Helper function to recursively traverse a target structure and apply a function
 * to specific items that pass a check.
 *
 * @param {any} item - The current item being processed (mesh, array, object, etc.).
 * @param {function} checkFunction - A function that returns true if 'item' is a target mesh.
 * @param {function} applyFunction - The function to apply to the target mesh.
 * @param {...any} args - Additional arguments to pass to the applyFunction.
 */
const applyFilter = (item, checkFunction, applyFunction, ...args) => {
    // Case 1: The item is a single mesh (THREE.Mesh or Brush)
    if (checkFunction(item)) {
        applyFunction(item, ...args)
    }
    // Case 2: The item is an array. Recursively process each element.
    else if (Array.isArray(item)) {
        item.forEach((subItem) =>
            applyFilter(subItem, checkFunction, applyFunction, ...args)
        )
    }
    // Case 3: The item is a generic object. Recursively process its properties,
    // EXCLUDING functions, getters, and setters.
    else if (item !== null && item !== undefined && typeof item === 'object') {
        for (const key in item) {
            // 1. Check if the property is directly on the object (not inherited)
            if (Object.prototype.hasOwnProperty.call(item, key)) {
                const descriptor = Object.getOwnPropertyDescriptor(item, key)

                // 2. Check to exclude functions
                if (typeof item[key] === 'function') {
                    continue // Skip function properties
                }

                // 3. Check to exclude getters and setters (accessor properties)
                // If 'descriptor' exists, check if it has a 'get' or 'set' function defined.
                if (descriptor && (descriptor.get || descriptor.set)) {
                    continue // Skip getter/setter properties
                }

                // If it passes all checks, continue recursion
                applyFilter(item[key], checkFunction, applyFunction, ...args)
            }
        }
    }
    // All other data types (strings, numbers, etc.) are ignored.
}

function isMesh(item) {
    return item && (item instanceof THREE.Mesh || item instanceof Brush)
}
const applyToMesh = (item, applyFunction, ...args) =>
    applyFilter(item, isMesh, applyFunction, ...args)

function isShape(item) {
    return item && item instanceof THREE.Shape
}
const applyToShape = (item, applyFunction, ...args) =>
    applyFilter(item, isShape, applyFunction, ...args)

function convertGeometry(item) {
    //Create a new BufferGeometry and set its attributes
    const bufferGeometry = new THREE.BufferGeometry()
    bufferGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(item.attributes.position.array, 3)
    )
    bufferGeometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(item.attributes.normal.array, 3)
    )
    bufferGeometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(item.attributes.uv.array, 2)
    )

    // Step 3: Add the index attribute for efficient rendering (optional but recommended)
    if (item.index) {
        bufferGeometry.setIndex(item.index)
    }
    return bufferGeometry
    // Now `bufferGeometry` is the object you need. You can inspect its `attributes.position.array` to get the desired output.
    //console.log(bufferGeometry.attributes.position.array)
}

function color(c, ...target) {
    const colorVal = new THREE.Color(c)

    // Define a new material to apply to the meshes
    const newMaterial = new THREE.MeshStandardMaterial({
        color: colorVal,
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
        flatShading: true
    })

    applyToMesh(target, (item) => {
        item.material = newMaterial
    })

    // Return the original target object with the new material applied.
    return target
}

// --- Primitive Geometries (Corrected) ---
function sphere({ r, d, fn } = {}) {
    if (d !== undefined) r = d / 2
    r = r || 1
    fn = fn || 32
    const geom = convertGeometry(new THREE.SphereGeometry(r, fn, fn))

    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function cube([x = 1, y = 1, z = 1] = [1, 1, 1]) {
    const geom = convertGeometry(new THREE.BoxGeometry(x, y, z))

    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function cylinder({ d, dt, db, r, rt, rb, h, fn } = {}) {
    let topRadius, bottomRadius

    if (rt !== undefined) {
        topRadius = rt
    }
    if (rb !== undefined) {
        bottomRadius = rb
    }

    if (topRadius === undefined && dt !== undefined) {
        topRadius = dt / 2
    }
    if (bottomRadius === undefined && db !== undefined) {
        bottomRadius = db / 2
    }

    if (
        topRadius === undefined &&
        bottomRadius === undefined &&
        r !== undefined
    ) {
        topRadius = r
        bottomRadius = r
    }

    if (
        topRadius === undefined &&
        bottomRadius === undefined &&
        d !== undefined
    ) {
        topRadius = d / 2
        bottomRadius = d / 2
    }

    topRadius = topRadius || 0.5
    bottomRadius = bottomRadius || 0.5
    h = h || 1
    fn = fn || 32

    const geom = convertGeometry(
        new THREE.CylinderGeometry(topRadius, bottomRadius, h, fn)
    )

    return rotate([-90, 0, 0], new THREE.Mesh(geom, defaultMaterial.clone()))
}

// --- Functional Transforms (Corrected for Z-up) ---
function translate([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        //item.position.set(x, z, y)
		
        item.geometry.translate(x, y, z)
    })
    return target
}

// --- Functional Rotation (Corrected for Z-up) ---
function rotate([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        //item.rotation.set(x, z, y)
        item.geometry.rotateX((x / 180) * -Math.PI)
        item.geometry.rotateY((y / 180) * -Math.PI)
        item.geometry.rotateZ((z / 180) * -Math.PI)
    })

    return target
}

// --- Functional scale (Corrected for Z-up) ---
function scale([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        item.geometry.scale(x, y, z)
    })
    return target
}


function expand(...target) {
	var meshs=[]
	applyToMesh(target, (item) => {
        meshs.push(item)
    })
	return meshs
}




function floor(...target) {
	for(var i=0; i<target.length;i++){
		_floor(target[i])
	}
	return target;
}

function _floor(...target) {
	
	const bbox = boundingBox(...target);
	translate([0,0,-bbox.min.z], target);
    
}

function convexHull(...target) {
    //...meshes) {

    var meshes = []
    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length === 0) {
        return null
    }

    const vertices = []
    meshes.forEach((mesh) => {
        if (mesh && mesh.geometry && mesh.geometry.isBufferGeometry) {
            mesh.updateMatrixWorld(true)
            const positionAttribute = mesh.geometry.getAttribute('position')
            const tempVector = new THREE.Vector3()
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVector
                    .fromBufferAttribute(positionAttribute, i)
                    .applyMatrix4(mesh.matrixWorld)
                vertices.push(tempVector.clone())
            }
        }
    })

    if (vertices.length < 4) {
        PrintWarn('Convex hull requires at least 4 vertices. Returning null.')
        return null
    }

    const hullGeometry = new ConvexGeometry(vertices)
    return new THREE.Mesh(hullGeometry, defaultMaterial.clone())
}



function align(config = {}, ...target){
	for(var i= 0; i< target.length;i++){
		_align(config, target[i]);
	}
	return target;
}
function _align(config = {}, ...target) {
    
	
	const bbox = boundingBox(...target)
	
	const center = {
		x: (bbox.min.x+bbox.max.x)/2,
		y: (bbox.min.y+bbox.max.y)/2,
		z: (bbox.min.z+bbox.max.z)/2
	}
	
	let offset = new THREE.Vector3()
	if (config.lx !== undefined) {
        offset.x = config.lx - bbox.min.x
    } else if (config.rx !== undefined) {
        offset.x = config.rx - bbox.max.x
    } else if (config.cx !== undefined) {
        offset.x = config.cx - center.x
    }
	
    if (config.uy !== undefined) {
        offset.y = config.uy - bbox.max.y
    } else if (config.dy !== undefined) {
        offset.y = config.dy - bbox.min.y
    } else if (config.cy !== undefined) {
        offset.y = config.cy - center.y
    }
	
    if (config.bz !== undefined) {
        offset.z = config.bz - bbox.min.z
    } else if (config.tz !== undefined) {
        offset.z = config.tz - bbox.max.z
    } else if (config.cz !== undefined) {
        offset.z = config.cz - center.z
    }
	
	translate([offset.x, offset.y, offset.z], target)
	
}



///
 // @param {object} path - An object containing the path array and default segments.
 // @param {string[]} path.path - An array representing the 3D path commands and parameters.
 // @param {number} path.fn - The default number of segments for curves.
// @returns {object} An object containing the new path points (p), rotations (r), scales (s), and normals (n).
 

function path3d(path) {
    const paths = path.path
    const fn = path.fn
    if (path.xyInitAng === undefined) {
        path.xyInitAng = true
    }

    var newPath = {
        p: [], // Points (x, y, z)
        r: [], // 2d Rotations
        s: [], // 2d Scales
        n: [], // Normals (Tangents/Up Vectors)
        close: path.close,
        xyInitAng: path.xyInitAng
    }

    // ----------------------------------------------------------------------
    // VECTOR MATH FUNCTIONS
    // ----------------------------------------------------------------------
    function vsub(p1, p2) {
        return [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    }

    function vadd(p1, p2) {
        return [p1[0] + p2[0], p1[1] + p2[1], p1[2] + p2[2]]
    }

    function vdot(p1, p2) {
        return p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]
    }

    function vlength(p) {
        return Math.sqrt(vdot(p, p))
    }

    function vnormalize(p) {
        var l = vlength(p)
        return l > 1e-6 ? [p[0] / l, p[1] / l, p[2] / l] : [0, 0, 0]
    }

    function vabs(p) {
        return [Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])]
    }

    function vcross(p1, p2) {
        return [
            p1[1] * p2[2] - p1[2] * p2[1],
            p1[2] * p2[0] - p1[0] * p2[2],
            p1[0] * p2[1] - p1[1] * p2[0]
        ]
    }

    function vscale(p, s) {
        return [p[0] * s, p[1] * s, p[2] * s]
    }

    // ----------------------------------------------------------------------
    // CURVE SEGMENTATION (Bezier)
    // ----------------------------------------------------------------------
    const getPointsAtEqualDistance = (
        startPoint,
        endPoint,
        controlPoints,
        segments
    ) => {
        const getBezierPoint = (t, start, end, ...cps) => {
            if (cps.length === 1) {
                // Quadratic
                const cp1 = cps[0]
                const x =
                    (1 - t) ** 2 * start[0] +
                    2 * (1 - t) * t * cp1[0] +
                    t ** 2 * end[0]
                const y =
                    (1 - t) ** 2 * start[1] +
                    2 * (1 - t) * t * cp1[1] +
                    t ** 2 * end[1]
                const z =
                    (1 - t) ** 2 * start[2] +
                    2 * (1 - t) * t * cp1[2] +
                    t ** 2 * end[2]
                return [x, y, z]
            } else if (cps.length === 2) {
                // Cubic
                const cp1 = cps[0]
                const cp2 = cps[1]
                const x =
                    (1 - t) ** 3 * start[0] +
                    3 * (1 - t) ** 2 * t * cp1[0] +
                    3 * (1 - t) * t ** 2 * cp2[0] +
                    t ** 3 * end[0]
                const y =
                    (1 - t) ** 3 * start[1] +
                    3 * (1 - t) ** 2 * t * cp1[1] +
                    3 * (1 - t) * t ** 2 * cp2[1] +
                    t ** 3 * end[1]
                const z =
                    (1 - t) ** 3 * start[2] +
                    3 * (1 - t) ** 2 * t * cp1[2] +
                    3 * (1 - t) * t ** 2 * cp2[2] +
                    t ** 3 * end[2]
                return [x, y, z]
            }
        }

        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1],
                point[2] - prevPoint[2]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1],
                    nextPoint[2] - lastPoint[2]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1]),
                        prevPoint[2] + ratio * (nextPoint[2] - prevPoint[2])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    // ----------------------------------------------------------------------
    // CORRECTED 3D ARC SEGMENTATION LOGIC
    // ----------------------------------------------------------------------
    const getArcSegmentPoints3D = (p0, p1, p2, segments) => {
        // 1. Find Center C
        const v01 = vsub(p1, p0)
        const v12 = vsub(p2, p1)
        const m01 = vadd(p0, vscale(v01, 0.5))
        const m12 = vadd(p1, vscale(v12, 0.5))

        const A1 = v01[0],
            B1 = v01[1],
            C1 = v01[2],
            D1 = vdot(v01, m01)
        const A2 = v12[0],
            B2 = v12[1],
            C2 = v12[2],
            D2 = vdot(v12, m12)

        const N_arc_unnorm = vcross(v01, v12)

        // CRITICAL FIX: Return [] for degenerate cases, letting the main loop push the final point.
        if (vlength(N_arc_unnorm) < 1e-6) {
            return []
        }

        const N_arc = vnormalize(N_arc_unnorm)
        const A3 = N_arc[0],
            B3 = N_arc[1],
            C3 = N_arc[2],
            D3 = vdot(N_arc, p0)

        // Cramer's Rule for Center
        const detA =
            A1 * (B2 * C3 - C2 * B3) -
            B1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * B3 - B2 * A3)

        if (Math.abs(detA) < 1e-6) {
            return []
        } // CRITICAL FIX

        const detX =
            D1 * (B2 * C3 - C2 * B3) -
            B1 * (D2 * C3 - C2 * D3) +
            C1 * (D2 * B3 - B2 * D3)
        const detY =
            A1 * (D2 * C3 - C2 * D3) -
            D1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * D3 - D2 * A3)
        const detZ =
            A1 * (B2 * D3 - D2 * B3) -
            B1 * (A2 * D3 - D2 * A3) +
            D1 * (A2 * B3 - B2 * A3)

        const cx = detX / detA
        const cy = detY / detA
        const cz = detZ / detA
        const center = [cx, cy, cz]

        // 2. Radius R and Basis
        const vC0 = vsub(p0, center)
        const R = vlength(vC0)

        if (R < 1e-6) return [] // CRITICAL FIX

        const X_basis = vnormalize(vC0)
        const Z_basis = N_arc
        const Y_basis = vcross(Z_basis, X_basis)

        // 3. Calculate Angles (Fixed Math.atan2 usage)
        const PI2 = 2 * Math.PI

        const vC2 = vsub(p2, center)
        const x_proj2 = vdot(vC2, X_basis)
        const y_proj2 = vdot(vC2, Y_basis)
        let endAngle = Math.atan2(y_proj2, x_proj2)

        const vC1 = vsub(p1, center)
        const x_proj1 = vdot(vC1, X_basis)
        const y_proj1 = vdot(vC1, Y_basis)
        const controlAngle = Math.atan2(y_proj1, x_proj1)

        endAngle = (endAngle + PI2) % PI2
        const normControlAngle = (controlAngle + PI2) % PI2

        // 4. Determine Sweep (Improved robustness)
        let sweep = endAngle

        const isStartEndCoincident = vlength(vsub(p0, p2)) < 1e-6
        const isControlDistinct = vlength(vsub(p0, p1)) > 1e-6

        if (isStartEndCoincident && isControlDistinct) {
            sweep = PI2
        } else {
            // If control point angle is "beyond" the short arc end angle, take the long arc
            if (normControlAngle > sweep + 1e-6) {
                sweep += PI2
            }
        }

        if (Math.abs(sweep) < 1e-6) {
            return [] // CRITICAL FIX
        }

        // 5. Generate Line Segments
        const segmentPoints = []
        for (let j = 1; j < segments; j++) {
            // Loop up to segments - 1 to exclude endpoint P2
            const angle = (sweep * j) / segments

            const cosA = Math.cos(angle)
            const sinA = Math.sin(angle)

            const termX = vscale(X_basis, R * cosA)
            const termY = vscale(Y_basis, R * sinA)

            const newPoint = vadd(vadd(center, termX), termY)

            segmentPoints.push(newPoint)
        }

        return segmentPoints
    }

    // ----------------------------------------------------------------------
    // MAIN PATH PROCESSING
    // ----------------------------------------------------------------------

    var cp = [0, 0, 0] // Current Point (3D)
    var cr = 0 // Current Rotation (2D)
    var cs = [1, 1] // Current Scale (2D)
    var i = 0

    var atr = 0 // Target Rotation
    var ats = [1, 1] // Target Scale
    var atn = 1 // Number of Segments for next command

    while (i < paths.length) {
        const command = paths[i]

        switch (command) {
            case 'm':
                cp = [paths[i + 1], paths[i + 2], paths[i + 3]]
                newPath.p.push([...cp])
                newPath.r.push(atr)
                newPath.s.push([...ats])
                i += 4
                break
            case 'mr':
                cp = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 2],
                    cp[2] + paths[i + 3]
                ]
                newPath.p.push([...cp])
                newPath.r.push(atr)
                newPath.s.push([...ats])
                i += 4
                break
            case 'l': {
                const atp = [paths[i + 1], paths[i + 2], paths[i + 3]]
                if (atn === 1) {
                    newPath.p.push([...atp])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + atp[0] * t
                        const iy = cp[1] * (1 - t) + atp[1] * t
                        const iz = cp[2] * (1 - t) + atp[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                }
                cp = atp
                cr = atr
                cs = ats
                atn = 1
                i += 4
                break
            }
            case 'lr': {
                const endPoint_lr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 2],
                    cp[2] + paths[i + 3]
                ]
                if (atn === 1) {
                    newPath.p.push([...endPoint_lr])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        const iz = cp[2] * (1 - t) + endPoint_lr[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                }
                cp = endPoint_lr
                cr = atr
                cs = ats
                atn = 1
                i += 4
                break
            }
            case 'q': {
                const endPoint_q = [paths[i + 4], paths[i + 5], paths[i + 6]]
                const controlPoints_q = [
                    [paths[i + 1], paths[i + 2], paths[i + 3]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_q = getPointsAtEqualDistance(
                    cp,
                    endPoint_q,
                    controlPoints_q,
                    segmentsToUse
                )

                segmentPoints_q.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_q
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'qr': {
                const endPoint_qr = [
                    cp[0] + paths[i + 4],
                    cp[1] + paths[i + 5],
                    cp[2] + paths[i + 6]
                ]
                const controlPoints_qr = [
                    [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 2],
                        cp[2] + paths[i + 3]
                    ]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_qr = getPointsAtEqualDistance(
                    cp,
                    endPoint_qr,
                    controlPoints_qr,
                    segmentsToUse
                )

                segmentPoints_qr.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_qr
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'c': {
                const endPoint_c = [paths[i + 7], paths[i + 8], paths[i + 9]]
                const controlPoints_c = [
                    [paths[i + 1], paths[i + 2], paths[i + 3]],
                    [paths[i + 4], paths[i + 5], paths[i + 6]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_c = getPointsAtEqualDistance(
                    cp,
                    endPoint_c,
                    controlPoints_c,
                    segmentsToUse
                )

                segmentPoints_c.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_c
                cr = atr
                cs = ats
                atn = 1
                i += 10
                break
            }
            case 'cr': {
                const endPoint_cr = [
                    cp[0] + paths[i + 7],
                    cp[1] + paths[i + 8],
                    cp[2] + paths[i + 9]
                ]
                const controlPoints_cr = [
                    [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 2],
                        cp[2] + paths[i + 3]
                    ],
                    [
                        cp[0] + paths[i + 4],
                        cp[1] + paths[i + 5],
                        cp[2] + paths[i + 6]
                    ]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_cr = getPointsAtEqualDistance(
                    cp,
                    endPoint_cr,
                    controlPoints_cr,
                    segmentsToUse
                )

                segmentPoints_cr.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_cr
                cr = atr
                cs = ats
                atn = 1
                i += 10
                break
            }
            case 'x': {
                // Absolute 3D Arc
                const controlPoint_x = [
                    paths[i + 1],
                    paths[i + 2],
                    paths[i + 3]
                ]
                const endPoint_x = [paths[i + 4], paths[i + 5], paths[i + 6]]

                const segmentsToUse = atn > 1 ? atn : fn || 16

                getArcSegmentPoints3D(
                    cp,
                    controlPoint_x,
                    endPoint_x,
                    segmentsToUse
                ).forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    newPath.p.push([...p])
                    newPath.r.push(cr * (1 - t) + atr * t)
                    newPath.s.push([
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ])
                })

                // CRITICAL FIX: Explicitly push the final endpoint P2 after the segments
                newPath.p.push([...endPoint_x])
                newPath.r.push(atr)
                newPath.s.push([...ats])

                cp = endPoint_x
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'xr': {
                // Relative 3D Arc
                const controlPoint_xr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 2],
                    cp[2] + paths[i + 3]
                ]
                const endPoint_xr = [
                    cp[0] + paths[i + 4],
                    cp[1] + paths[i + 5],
                    cp[2] + paths[i + 6]
                ]

                const segmentsToUse = atn > 1 ? atn : fn || 16

                getArcSegmentPoints3D(
                    cp,
                    controlPoint_xr,
                    endPoint_xr,
                    segmentsToUse
                ).forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    newPath.p.push([...p])
                    newPath.r.push(cr * (1 - t) + atr * t)
                    newPath.s.push([
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ])
                })

                // CRITICAL FIX: Explicitly push the final endpoint P2 after the segments
                newPath.p.push([...endPoint_xr])
                newPath.r.push(atr)
                newPath.s.push([...ats])

                cp = endPoint_xr
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'r':
                atr = paths[i + 1]
                i += 2
                break
            case 's':
                ats = [paths[i + 1], paths[i + 2]]
                i += 3
                break
            case 'n':
                atn = paths[i + 1]
                i += 2
                break
            default:
                i = paths.length
                break
        }
    }

    // ----------------------------------------------------------------------
    // TANGENT/NORMAL CALCULATION
    // ----------------------------------------------------------------------

    const calculateAverageTangent = (p0, p1, p2) => {
        if (p0 == undefined) {
            return vnormalize(vsub(p2, p1))
        } else if (p2 == undefined) {
            return vnormalize(vsub(p1, p0))
        } else {
            var v1 = vsub(p1, p0)
            var v2 = vsub(p2, p1)
            return vnormalize(vadd(v1, v2))
        }
    }

    var isClosed = false
    var fp = newPath.p[0]
    var lp = newPath.p[newPath.p.length - 1]

    const tol = 0.001
    if (fp && lp) {
        var check = vabs(vsub(fp, lp))
        if (check[0] <= tol && check[1] <= tol && check[2] <= tol) {
            isClosed = true
        }
    }

    if (newPath.p.length > 1) {
        // First point
        if (isClosed) {
            newPath.n.push(calculateAverageTangent(lp, fp, newPath.p[1]))
        } else {
            newPath.n.push(calculateAverageTangent(undefined, fp, newPath.p[1]))
        }

        // Intermediate points
        for (let j = 1; j < newPath.p.length - 1; j++) {
            newPath.n.push(
                calculateAverageTangent(
                    newPath.p[j - 1],
                    newPath.p[j],
                    newPath.p[j + 1]
                )
            )
        }

        // Last point
        if (isClosed) {
            // Tangent for a closed loop is the same as the first point's tangent
            newPath.n.push(newPath.n[0])
        } else {
            newPath.n.push(
                calculateAverageTangent(
                    newPath.p[newPath.p.length - 2],
                    lp,
                    undefined
                )
            )
        }
    } else if (newPath.p.length === 1) {
        newPath.n.push([1, 0, 0])
    }

    return newPath
}

//------------------------------------------------------------------------------------------------------

/**
 * @param {object} path - An object containing the 2D path and default segment number.
 * @returns {object} An object containing the new path with curves and lines converted to line segments.
 */

function path2d(path) {
    const paths = path.path
    const fn = path.fn

    const newPath = []

    // Helper function to get points at equal distance along a curve (kept as is)
    const getPointsAtEqualDistance = (
        startPoint,
        endPoint,
        controlPoints,
        segments
    ) => {
        const getBezierPoint = (t, start, end, ...cps) => {
            if (cps.length === 1) {
                // Quadratic Bezier
                const cp1 = cps[0]
                const x =
                    (1 - t) ** 2 * start[0] +
                    2 * (1 - t) * t * cp1[0] +
                    t ** 2 * end[0]
                const y =
                    (1 - t) ** 2 * start[1] +
                    2 * (1 - t) * t * cp1[1] +
                    t ** 2 * end[1]
                return [x, y]
            } else if (cps.length === 2) {
                // Cubic Bezier
                const cp1 = cps[0]
                const cp2 = cps[1]
                const x =
                    (1 - t) ** 3 * start[0] +
                    3 * (1 - t) ** 2 * t * cp1[0] +
                    3 * (1 - t) * t ** 2 * cp2[0] +
                    t ** 3 * end[0]
                const y =
                    (1 - t) ** 3 * start[1] +
                    3 * (1 - t) ** 2 * t * cp1[1] +
                    3 * (1 - t) * t ** 2 * cp2[1] +
                    t ** 3 * end[1]
                return [x, y]
            }
        }

        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    /**
     * Finds the center, radius, and segments for a circular arc defined by three points.
     * P0 (start), P1 (control on arc), P2 (end).
     * The sign of the arc's sweep (CW vs. CCW) is determined by the turn P0->P1->P2.
     * @param {number[]} p0 - Start point [x, y].
     * @param {number[]} p1 - Control point [x, y] (must be on the desired arc).
     * @param {number[]} p2 - End point [x, y].
     * @param {number} segments - Number of line segments to use.
     * @returns {number[][]} An array of [x, y] segment points.
     */
    const getArcSegmentPoints = (p0, p1, p2, segments) => {
        const PI2 = 2 * Math.PI

        // Fallback for collinear or degenerate points
        const crossProductCheck =
            (p1[1] - p0[1]) * (p2[0] - p1[0]) -
            (p1[0] - p0[0]) * (p2[1] - p1[1])
        if (Math.abs(crossProductCheck) < 1e-6) {
            // Points are too close or collinear, fall back to a single line segment
            // Note: This check only prevents finding the center, it doesn't solve clockness.
            return [p2]
        }

        // 1. Get Midpoints M01 and M12 (Not strictly needed, but kept for clarity of geometric derivation)
        // const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
        // const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]

        // 2. Get Perpendicular Bisector Parameters (Ax + By = C)
        const A1 = p1[0] - p0[0]
        const B1 = p1[1] - p0[1]
        const C1 = (p1[0] ** 2 - p0[0] ** 2 + p1[1] ** 2 - p0[1] ** 2) / 2

        const A2 = p2[0] - p1[0]
        const B2 = p2[1] - p1[1]
        const C2 = (p2[0] ** 2 - p1[0] ** 2 + p2[1] ** 2 - p1[1] ** 2) / 2

        const det = A1 * B2 - A2 * B1

        // 3. Find Center (Intersection Point)
        const cx = (C1 * B2 - C2 * B1) / det
        const cy = (A1 * C2 - A2 * C1) / det
        // const center = [cx, cy]

        // 4. Calculate Radius
        const r = Math.hypot(p0[0] - cx, p0[1] - cy)

        // 5. Calculate Start, End, and Control Angles (normalized to 0 to 2*PI)
        const startAngle = (Math.atan2(p0[1] - cy, p0[0] - cx) + PI2) % PI2
        const endAngle = (Math.atan2(p2[1] - cy, p2[0] - cx) + PI2) % PI2
        const controlAngle = (Math.atan2(p1[1] - cy, p1[0] - cx) + PI2) % PI2

        // 6. Determine Arc Magnitude and Direction

        // a. Determine the **magnitude** of the arc that passes through P1
        // 'arcMagnitude' is the positive angle from startAngle to endAngle that includes P1.
        let arcMagnitude = (endAngle - startAngle + PI2) % PI2
        const controlAngle_rel = (controlAngle - startAngle + PI2) % PI2

        // Check if the short sweep includes P1. If not, use the long arc.
        if (controlAngle_rel > arcMagnitude) {
            // P1 is on the long arc (the complementary arc).
            arcMagnitude = (endAngle - startAngle + PI2 * 3) % PI2
        }

        // If P0=P2 and P1 is not at P0, force a full 2*PI circle.
        if (
            arcMagnitude < 1e-6 &&
            Math.hypot(p0[0] - p2[0], p0[1] - p2[1]) < 1e-6
        ) {
            arcMagnitude = PI2
        }

        // b. Determine the **sign** (clockness) based on the turn P0 -> P1 -> P2.
        // This is the cross-product of vectors (P1-P0) and (P2-P0).
        // Positive: CCW (Left turn), Negative: CW (Right turn)
        const sweepSignCheck =
            (p1[0] - p0[0]) * (p2[1] - p0[1]) -
            (p1[1] - p0[1]) * (p2[0] - p0[0])

        let sweep = arcMagnitude

        if (sweepSignCheck < 0) {
            // If the turn is Clockwise (CW), negate the sweep magnitude.
            sweep = -arcMagnitude
        }
        // Note: If sweepSignCheck > 0 (CCW), sweep remains positive (arcMagnitude).

        // 7. Generate Line Segments
        const segmentPoints = []
        for (let j = 1; j <= segments; j++) {
            // Use the signed 'sweep' angle here
            const angle = startAngle + (sweep * j) / segments
            const x = cx + r * Math.cos(angle)
            const y = cy + r * Math.sin(angle)
            segmentPoints.push([x, y])
        }

        return segmentPoints
    }

    // ----------------------------------------------------------------------
    // END OF CORRECTED ARC SEGMENTATION LOGIC
    // ----------------------------------------------------------------------

    let cp = [0, 0] // Current point [x, y]
    let atn = 1 // Number of segments for the *next* command

    let i = 0
    while (i < paths.length) {
        const command = paths[i]
        switch (command) {
            case 'm':
                cp = [paths[i + 1], paths[i + 2]]
                newPath.push('m', cp[0], cp[1])

                i += 3
                break
            case 'mr':
                cp = [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]
                newPath.push('m', cp[0], cp[1])
                i += 3
                break
            case 'l':
                const endPoint_l = [paths[i + 1], paths[i + 2]]

                if (atn === 1) {
                    newPath.push('l', endPoint_l[0], endPoint_l[1])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_l[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_l[1] * t
                        newPath.push('l', ix, iy)
                    }
                }
                cp = endPoint_l
                atn = 1
                i += 3
                break
            case 'lr':
                const endPoint_lr = [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]

                if (atn === 1) {
                    newPath.push('l', endPoint_lr[0], endPoint_lr[1])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        newPath.push('l', ix, iy)
                    }
                }
                cp = endPoint_lr
                atn = 1
                i += 3
                break
            case 'q': {
                const endPoint_q = [paths[i + 3], paths[i + 4]]
                const controlPoints_q = [[paths[i + 1], paths[i + 2]]]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_q = getPointsAtEqualDistance(
                    cp,
                    endPoint_q,
                    controlPoints_q,
                    segmentsToUse
                )

                segmentPoints_q.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_q
                atn = 1
                i += 5
                break
            }
            case 'qr': {
                const endPoint_qr = [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                const controlPoints_qr = [
                    [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_qr = getPointsAtEqualDistance(
                    cp,
                    endPoint_qr,
                    controlPoints_qr,
                    segmentsToUse
                )

                segmentPoints_qr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_qr
                atn = 1
                i += 5
                break
            }
            case 'c': {
                const endPoint_c = [paths[i + 5], paths[i + 6]]
                const controlPoints_c = [
                    [paths[i + 1], paths[i + 2]],
                    [paths[i + 3], paths[i + 4]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_c = getPointsAtEqualDistance(
                    cp,
                    endPoint_c,
                    controlPoints_c,
                    segmentsToUse
                )

                segmentPoints_c.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_c
                atn = 1
                i += 7
                break
            }
            case 'cr': {
                const endPoint_cr = [cp[0] + paths[i + 5], cp[1] + paths[i + 6]]
                const controlPoints_cr = [
                    [cp[0] + paths[i + 1], cp[1] + paths[i + 2]],
                    [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_cr = getPointsAtEqualDistance(
                    cp,
                    endPoint_cr,
                    controlPoints_cr,
                    segmentsToUse
                )

                segmentPoints_cr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_cr
                atn = 1
                i += 7
                break
            }
            case 'x': {
                // Absolute Arc Command (P0: cp, P1: Ctr, P2: End)
                const controlPoint_x = [paths[i + 1], paths[i + 2]]
                const endPoint_x = [paths[i + 3], paths[i + 4]]
                const segmentsToUse = atn > 1 ? atn : fn

                const segmentPoints_x = getArcSegmentPoints(
                    cp,
                    controlPoint_x,
                    endPoint_x,
                    segmentsToUse
                )

                segmentPoints_x.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_x
                atn = 1
                i += 5
                break
            }
            case 'xr': {
                // Relative Arc Command (P0: cp, P1: Ctr + cp, P2: End + cp)
                const controlPoint_xr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 2]
                ]
                const endPoint_xr = [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                const segmentsToUse = atn > 1 ? atn : fn

                const segmentPoints_xr = getArcSegmentPoints(
                    cp,
                    controlPoint_xr,
                    endPoint_xr,
                    segmentsToUse
                )

                segmentPoints_xr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_xr
                atn = 1
                i += 5
                break
            }
            case 'n':
                atn = paths[i + 1]
                i += 2
                break

            case 'r':
            case 's':
                // Ignore these commands
                i += command === 'r' ? 2 : 3
                break

            default:
                // Assuming PrintWarn is defined elsewhere, if not, use console.warn
                // PrintWarn(`Unknown path command: ${command}`)
                i = paths.length
                break
        }
    }

    return {
        path: newPath,
        fn: fn
    }
}

//*/

function convertTo2d(path) {
    const newPath = []
    let i = 0
    while (i < path.length) {
        const command = path[i]
        newPath.push(command)
        switch (command) {
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                newPath.push(path[i + 1], path[i + 2]) // Add X and Y, ignore Z
                i += 4
                break
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                newPath.push(path[i + 1], path[i + 2], path[i + 4], path[i + 5]) // Add CPs and EP, ignore Z
                i += 7
                break
            case 'c':
            case 'cr':
                newPath.push(
                    path[i + 1],
                    path[i + 2],
                    path[i + 4],
                    path[i + 5],
                    path[i + 7],
                    path[i + 8]
                ) // Add CPs and EP, ignore Z
                i += 10
                break
            case 'r':
            case 'n':
                newPath.push(path[i + 1])
                i += 2
                break
            case 's':
                newPath.push(path[i + 1], path[i + 2])
                i += 3
                break
            default:
                i++
                break
        }
    }
    return newPath
}

function convertTo3d(path, z = 0) {
    const newPath = []
    let i = 0
    while (i < path.length) {
        const command = path[i]
        newPath.push(command)
        switch (command) {
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                newPath.push(path[i + 1], path[i + 2], z) // Add X, Z, and Y
                i += 3
                break
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                newPath.push(
                    path[i + 1],
                    path[i + 2],
                    z,
                    path[i + 3],
                    path[i + 4],
                    z
                ) // Add Z for CPs and EP
                i += 5
                break
            case 'c':
            case 'cr':
                newPath.push(
                    path[i + 1],
                    path[i + 2],
                    z,
                    path[i + 3],
                    path[i + 4],
                    z,
                    path[i + 5],
                    path[i + 6],
                    z
                ) // Add Z for CPs and EP
                i += 7
                break
            case 'r':
            case 'n':
                newPath.push(path[i + 1])
                i += 2
                break
            case 's':
                newPath.push(path[i + 1], path[i + 2])
                i += 3
                break
            default:
                i++
                break
        }
    }
    return newPath
}

//*/

//work on helper path functions



function arcPath3d(config) {
    const { startAng, endAng, fn, d } = config

    // Determine radius from either 'd' (diameter) or 'r' (radius)
    let radius
    if (d !== undefined) {
        radius = d / 2
    } else {
        radius = config.r
    }

    const degToRad = (degrees) => (degrees * Math.PI) / 180
    const startRad = degToRad(startAng)
    const endRad = degToRad(endAng)

    const path = []
    const segments = fn || 30

    const startX = radius * Math.cos(startRad)
    const startY = radius * Math.sin(startRad)
    path.push('m', startX, 0, startY)

    for (let i = 1; i <= segments; i++) {
        const t = i / segments
        const currentRad = startRad + (endRad - startRad) * t
        const x = radius * Math.cos(currentRad)
        const y = radius * Math.sin(currentRad)
        path.push('l', x, y, 0)
    }

    return {
        path: path,
        fn: fn
    }
}

////////////////////////////////

/**
helper function for linePaths3d.
 * @param {THREE.Vector3} vector - The vector to be rotated (mutated in place).
 * @param {THREE.Quaternion} quaternion - The rotation to apply.
 * @returns {THREE.Vector3} The rotated vector (same object as the input vector).
 */
function applyQuaternion(vector, quaternion) {
    // Treat the vector as a pure quaternion: p = (vector.x, vector.y, vector.z, 0)
    const x = vector.x
    const y = vector.y
    const z = vector.z

    // Quaternion components: q = (quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    const qx = quaternion.x
    const qy = quaternion.y
    const qz = quaternion.z
    const qw = quaternion.w

    // The calculation simplifies the full conjugation (q * p * q_inverse)
    // for the case where p is a pure quaternion and q is a unit quaternion (normalized).

    // --- Calculate q * p ---
    // The result is a new quaternion t = (tx, ty, tz, tw)

    const tw = -qx * x - qy * y - qz * z
    const tx = qw * x + qy * z - qz * y
    const ty = qw * y - qx * z + qz * x
    const tz = qw * z + qx * y - qy * x

    // --- Calculate t * q_inverse (which is t * conjugate(q) for a unit quaternion) ---
    // q_inverse = ( -qx, -qy, -qz, qw )
    // The result is the rotated pure quaternion p' = (px', py', pz', 0)
    // The new vector components (x', y', z') are (px', py', pz')

    vector.x = tx * qw + tw * -qx + ty * -qz - tz * -qy
    vector.y = ty * qw + tw * -qy + tz * -qx - tx * -qz
    vector.z = tz * qw + tw * -qz + tx * -qy - ty * -qx
    // The scalar component will be zero, which confirms it's a pure quaternion (a vector).

    return vector
}

//////////work on///////

/// @typedef {object} Point
/// @property {number} x - The X coordinate.
/// @property {number} y - The Y coordinate.
///
/// @typedef {object} ShapeData
/// @property {Point[]} outerPoints - Array of 2D points for the main solid contour.
/// @property {Point[][]} holePoints - Array of arrays, where each inner array is the 2D points for a hole contour.

class Path2d {
    /// @param {number} fn - Default number of segments for curves (tessellation factor). Default is 20.
    constructor() {
        //fn = 20) {
        /// @type {Array<string|number>}
        this._path = [] // Private: Stores the sequence of path commands
        /// @type {number}
        this._fn = 20 // Private: Default number of segments for curves
        /// @type {[number, number]}
        this._cp = [0, 0] // Private: Current point [x, y]
        /// @type {number}
        this._atn = 1 // Private: Number of segments for the next command ('n' command sets this)
        this._tpath // thisnis the teselated path.
    }

    fn(v) {
        this._fn = v
        return this
    }

    path(data) {
        if (data instanceof Path3d) {
            this._path = convertTo2d(data._path)
            this._fn = data._fn
        } else {
            this._path = data
        }
        this._tpath = undefined
        return this
    }

    // --- Public Path Commands (Methods for Cascading) ---

    // Move to (absolute)
    m(x, y) {
        this._path.push('m', x, y)
        return this
    }

    // Move to (relative)
    mr(x, y) {
        this._path.push('mr', x, y)
        return this
    }

    // Line to (absolute)
    l(x, y) {
        this._path.push('l', x, y)
        return this
    }

    // Line to (relative)
    lr(x, y) {
        this._path.push('lr', x, y)
        return this
    }

    // Quadratic Bezier (absolute)
    q(cpx, cpy, x, y) {
        this._path.push('q', cpx, cpy, x, y)
        return this
    }

    // Quadratic Bezier (relative)
    qr(cpx, cpy, x, y) {
        this._path.push('qr', cpx, cpy, x, y)
        return this
    }

    // Cubic Bezier (absolute)
    c(cp1x, cp1y, cp2x, cp2y, x, y) {
        this._path.push('c', cp1x, cp1y, cp2x, cp2y, x, y)
        return this
    }

    // Cubic Bezier (relative)
    cr(cp1x, cp1y, cp2x, cp2y, x, y) {
        this._path.push('cr', cp1x, cp1y, cp2x, cp2y, x, y)
        return this
    }

    // Arc segment (absolute - via control point)
    x(cpx, cpy, x, y) {
        this._path.push('x', cpx, cpy, x, y)
        return this
    }

    // Arc segment (relative - via control point)
    xr(cpx, cpy, x, y) {
        this._path.push('xr', cpx, cpy, x, y)
        return this
    }

    // Set number of segments for the NEXT command
    n(segments) {
        this._path.push('n', segments)
        return this
    }
    // --- Core Tessellation and Classification Logic (Private Methods) ---

    //public boundingBox
    boundingBox() {
        if (this._tpath === undefined) {
            this._tessellate()
        }
        let box= this._getBoundingBox(this._tpath)
		return {
			min:{
				x:box.minX,
				y:box.minY
			},
			max:{
				x:box.maxX,
				y:box.maxY
			}
		}
    }

    /// @private
    /// Calculates a point on a Quadratic or Cubic Bezier curve.
    _getBezierPoint(t, start, end, ...cps) {
        const PI2 = 2 * Math.PI
        // Bezier math logic
        if (cps.length === 1) {
            // Quadratic Bezier
            const cp1 = cps[0]
            const x =
                (1 - t) ** 2 * start[0] +
                2 * (1 - t) * t * cp1[0] +
                t ** 2 * end[0]
            const y =
                (1 - t) ** 2 * start[1] +
                2 * (1 - t) * t * cp1[1] +
                t ** 2 * end[1]
            return [x, y]
        } else if (cps.length === 2) {
            // Cubic Bezier
            const cp1 = cps[0]
            const cp2 = cps[1]
            const x =
                (1 - t) ** 3 * start[0] +
                3 * (1 - t) ** 2 * t * cp1[0] +
                3 * (1 - t) * t ** 2 * cp2[0] +
                t ** 3 * end[0]
            const y =
                (1 - t) ** 3 * start[1] +
                3 * (1 - t) ** 2 * t * cp1[1] +
                3 * (1 - t) * t ** 2 * cp2[1] +
                t ** 3 * end[1]
            return [x, y]
        }
    }

    /// @private
    /// Gets evenly spaced points along a Bezier curve's length.
    _getPointsAtEqualDistance(startPoint, endPoint, controlPoints, segments) {
        // Length-based point calculation logic
        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = this._getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    /// @private
    /// Gets segment points for an arc defined by three points (p0, p1, p2).
    _getArcSegmentPoints(p0, p1, p2, segments) {
        // Arc geometry logic
        const PI2 = 2 * Math.PI

        const crossProductCheck =
            (p1[1] - p0[1]) * (p2[0] - p1[0]) -
            (p1[0] - p0[0]) * (p2[1] - p1[1])
        if (Math.abs(crossProductCheck) < 1e-6) {
            return [p2]
        }

        const A1 = p1[0] - p0[0]
        const B1 = p1[1] - p0[1]
        const C1 = (p1[0] ** 2 - p0[0] ** 2 + p1[1] ** 2 - p0[1] ** 2) / 2

        const A2 = p2[0] - p1[0]
        const B2 = p2[1] - p1[1]
        const C2 = (p2[0] ** 2 - p1[0] ** 2 + p2[1] ** 2 - p1[1] ** 2) / 2

        const det = A1 * B2 - A2 * B1

        const cx = (C1 * B2 - C2 * B1) / det
        const cy = (A1 * C2 - A2 * C1) / det

        const r = Math.hypot(p0[0] - cx, p0[1] - cy)

        const startAngle = (Math.atan2(p0[1] - cy, p0[0] - cx) + PI2) % PI2
        const endAngle = (Math.atan2(p2[1] - cy, p2[0] - cx) + PI2) % PI2
        const controlAngle = (Math.atan2(p1[1] - cy, p1[0] - cx) + PI2) % PI2

        let arcMagnitude = (endAngle - startAngle + PI2) % PI2
        const controlAngle_rel = (controlAngle - startAngle + PI2) % PI2

        if (controlAngle_rel > arcMagnitude) {
            arcMagnitude = (endAngle - startAngle + PI2 * 3) % PI2
        }

        if (
            arcMagnitude < 1e-6 &&
            Math.hypot(p0[0] - p2[0], p0[1] - p2[1]) < 1e-6
        ) {
            arcMagnitude = PI2
        }

        const sweepSignCheck =
            (p1[0] - p0[0]) * (p2[1] - p0[1]) -
            (p1[1] - p0[1]) * (p2[0] - p0[0])

        let sweep = arcMagnitude
        if (sweepSignCheck < 0) {
            sweep = -arcMagnitude
        }

        const segmentPoints = []
        for (let j = 1; j <= segments; j++) {
            const angle = startAngle + (sweep * j) / segments
            const x = cx + r * Math.cos(angle)
            const y = cy + r * Math.sin(angle)
            segmentPoints.push([x, y])
        }

        return segmentPoints
    }

    /// @private
    /// Implements Stage 1: Tessellation (Converts all curves to 'l' commands).
    /// @returns {Array<string|number>} The tessellated path array.
    _tessellate() {
        if (this._tpath != undefined) {
            return
        }

        // Uses this._path and this._fn
        const paths = this._path
        const fn = this._fn
        const newPath = []

        let cp = [0, 0]
        let atn = 1

        let i = 0
        while (i < paths.length) {
            const command = paths[i]
            i++

            switch (command) {
                case 'm':
                    cp = [paths[i], paths[i + 1]]
                    newPath.push('m', cp[0], cp[1])
                    i += 2
                    break
                case 'mr':
                    const dx_mr = paths[i]
                    const dy_mr = paths[i + 1]
                    cp = [cp[0] + dx_mr, cp[1] + dy_mr]
                    newPath.push('m', cp[0], cp[1])
                    i += 2
                    break
                case 'l':
                    const endPoint_l = [paths[i], paths[i + 1]]
                    const segmentsToUse_l = atn > 1 ? atn : 1
                    for (let v = 1; v <= segmentsToUse_l; v++) {
                        const t = v / segmentsToUse_l
                        const ix = cp[0] * (1 - t) + endPoint_l[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_l[1] * t
                        newPath.push('l', ix, iy)
                    }
                    cp = endPoint_l
                    atn = 1
                    i += 2
                    break
                case 'lr':
                    const endPoint_lr = [cp[0] + paths[i], cp[1] + paths[i + 1]]
                    const segmentsToUse_lr = atn > 1 ? atn : 1
                    for (let v = 1; v <= segmentsToUse_lr; v++) {
                        const t = v / segmentsToUse_lr
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        newPath.push('l', ix, iy)
                    }
                    cp = endPoint_lr
                    atn = 1
                    i += 2
                    break
                case 'q': {
                    const endPoint = [paths[i + 2], paths[i + 3]]
                    const controlPoints = [[paths[i], paths[i + 1]]]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 4
                    break
                }
                case 'qr': {
                    const endPoint = [
                        cp[0] + paths[i + 2],
                        cp[1] + paths[i + 3]
                    ]
                    const controlPoints = [
                        [cp[0] + paths[i], cp[1] + paths[i + 1]]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 4
                    break
                }
                case 'c': {
                    const endPoint = [paths[i + 4], paths[i + 5]]
                    const controlPoints = [
                        [paths[i], paths[i + 1]],
                        [paths[i + 2], paths[i + 3]]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 6
                    break
                }
                case 'cr': {
                    const endPoint = [
                        cp[0] + paths[i + 4],
                        cp[1] + paths[i + 5]
                    ]
                    const controlPoints = [
                        [cp[0] + paths[i], cp[1] + paths[i + 1]],
                        [cp[0] + paths[i + 2], cp[1] + paths[i + 3]]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 6
                    break
                }
                case 'x': {
                    const controlPoint = [paths[i], paths[i + 1]]
                    const endPoint = [paths[i + 2], paths[i + 3]]
                    const segmentsToUse = atn > 1 ? atn : fn

                    const segmentPoints = this._getArcSegmentPoints(
                        cp,
                        controlPoint,
                        endPoint,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 4
                    break
                }
                case 'xr': {
                    const controlPoint = [
                        cp[0] + paths[i],
                        cp[1] + paths[i + 1]
                    ]
                    const endPoint = [
                        cp[0] + paths[i + 2],
                        cp[1] + paths[i + 3]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn

                    const segmentPoints = this._getArcSegmentPoints(
                        cp,
                        controlPoint,
                        endPoint,
                        segmentsToUse
                    )
                    segmentPoints.forEach((p) => newPath.push('l', p[0], p[1]))
                    cp = endPoint
                    atn = 1
                    i += 4
                    break
                }
                case 'n':
                    atn = paths[i]
                    i += 1
                    break

                case 'r':
                case 's':
                    i += command === 'r' ? 2 : 3
                    break

                default:
                    i = paths.length
                    break
            }
        }
        //return newPath
        this._tpath = newPath
    }

    /// @private
    /// Gets the bounding box of a tessellated path segment.
    _getBoundingBox(path) {
        // Bounding box logic
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < path.length) {
            const command = path[i]
            i++

            switch (command) {
                case 'm':
                case 'l':
                    currentX = path[i]
                    currentY = path[i + 1]
                    minX = Math.min(minX, currentX)
                    minY = Math.min(minY, currentY)
                    maxX = Math.max(maxX, currentX)
                    maxY = Math.max(maxY, currentY)
                    i += 2
                    break
            }
        }
        return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) }
    }

    /// @private
    /// Checks if boxA is contained by boxB.
    _isInside(boxA, boxB) {
        const epsilon = 1e-6
        return (
            boxA.minX >= boxB.minX - epsilon &&
            boxA.maxX <= boxB.maxX + epsilon &&
            boxA.minY >= boxB.minY - epsilon &&
            boxA.maxY <= boxB.maxY + epsilon
        )
    }

    /// @private
    /// Gets a simple test point from a path segment for scanline test.
    _getTestPoint(path) {
        let i = 0
        while (i < path.length) {
            const command = path[i]
            if (command === 'm' || command === 'l') {
                return { x: path[i + 1], y: path[i + 2] }
            }
            i++
        }
        return { x: 0, y: 0 }
    }

    /// @private
    /// Ray casting/Scanline test to check if a point is inside a contour.
    _scanlineIsInside(point, testPath) {
        // Scanline logic
        if (!testPath || testPath.length === 0) {
            return false
        }

        let intersections = 0
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < testPath.length) {
            const command = testPath[i]
            i++

            if (command === 'm') {
                currentX = testPath[i]
                currentY = testPath[i + 1]
                i += 2
            } else if (command === 'l') {
                const nextX = testPath[i]
                const nextY = testPath[i + 1]

                // Ray casting logic (horizontal ray to the right)
                if (
                    ((currentY <= point.y && nextY > point.y) ||
                        (currentY > point.y && nextY <= point.y)) &&
                    point.x <
                        ((nextX - currentX) * (point.y - currentY)) /
                            (nextY - currentY) +
                            currentX
                ) {
                    intersections++
                }

                currentX = nextX
                currentY = nextY
                i += 2
            }
        }
        return intersections % 2 === 1
    }

    /// @private
    /// Converts a raw tessellated path array into an array of {x, y} Point objects.
    _rawPathToPoints(pathArray) {
        const points = []
        let i = 0
        while (i < pathArray.length) {
            const command = pathArray[i]
            i++

            switch (command) {
                case 'm':
                case 'l':
                    points.push({ x: pathArray[i], y: pathArray[i + 1] })
                    i += 2
                    break
            }
        }
        return points
    }

    /// @private
    /// Recursively processes a path object to determine if it's a solid or hole.
    _processPath(pathObj, currentSolidShapeData, isParentHole, finalShapes) {
        // Classification and recursion logic
        const testPoint = this._getTestPoint(pathObj.path)
        const parentPath = pathObj.parent ? pathObj.parent.path : null

        const isInsideImmediateParent = this._scanlineIsInside(
            testPoint,
            parentPath
        )
        const isHole = isInsideImmediateParent !== isParentHole

        if (isHole) {
            currentSolidShapeData.holePoints.push(
                this._rawPathToPoints(pathObj.path)
            )

            pathObj.children.forEach((child) => {
                child.parent = pathObj
                this._processPath(
                    child,
                    currentSolidShapeData,
                    true,
                    finalShapes
                )
            })
        } else {
            const newSolidShapeData = {
                outerPoints: this._rawPathToPoints(pathObj.path),
                holePoints: []
            }
            finalShapes.push(newSolidShapeData)

            pathObj.children.forEach((child) => {
                child.parent = pathObj
                this._processPath(child, newSolidShapeData, false, finalShapes)
            })
        }
    }

    // --- Public Result Method ---

    /// Executes the full path processing (Tessellation and Classification).
    /// @returns {ShapeData[]} An array of objects, each representing a solid shape with its holes.
    getPoints() {
        if (this._tpath === undefined) {
            this._tessellate()
        }
        const rawPath = this._tpath

        // Step 1: Deconstruct raw path into individual sub-paths and get bounding boxes.
        const allPaths = []
        let currentPath = []

        for (let i = 0; i < rawPath.length; ) {
            const command = rawPath[i]
            if (command === 'm' && currentPath.length > 0) {
                allPaths.push({
                    path: currentPath,
                    box: this._getBoundingBox(currentPath),
                    children: []
                })
                currentPath = []
            }
            let commandLength = 0
            switch (command) {
                case 'm':
                case 'l':
                    commandLength = 3
                    break
                default:
                    commandLength = 1
            }
            for (let j = 0; j < commandLength && i < rawPath.length; j++) {
                currentPath.push(rawPath[i])
                i++
            }
        }
        if (currentPath.length > 0) {
            allPaths.push({
                path: currentPath,
                box: this._getBoundingBox(currentPath),
                children: []
            })
        }

        // New Step 1.5: Remove duplicate paths
        const uniquePaths = []
        const pathStrings = new Set()
        allPaths.forEach((pathObj) => {
            const pathStr = JSON.stringify(pathObj.path)
            if (!pathStrings.has(pathStr)) {
                uniquePaths.push(pathObj)
                pathStrings.add(pathStr)
            }
        })

        // Step 2: Build parent-child hierarchy using bounding box containment.
        const hierarchy = []
        uniquePaths.sort((a, b) => a.box.area - b.box.area)

        for (let i = 0; i < uniquePaths.length; i++) {
            const childPath = uniquePaths[i]
            let parent = null
            for (let j = i + 1; j < uniquePaths.length; j++) {
                const potentialParent = uniquePaths[j]
                if (this._isInside(childPath.box, potentialParent.box)) {
                    parent = potentialParent
                    break
                }
            }
            if (parent) {
                childPath.parent = parent
                parent.children.push(childPath)
            } else {
                hierarchy.push(childPath)
            }
        }

        // Step 3: Classify paths and build final ShapeData array.
        const finalShapes = []

        hierarchy.forEach((mainPathObj) => {
            const topLevelShapeData = {
                outerPoints: this._rawPathToPoints(mainPathObj.path),
                holePoints: []
            }
            finalShapes.push(topLevelShapeData)

            mainPathObj.children.forEach((child) => {
                child.parent = mainPathObj
                this._processPath(child, topLevelShapeData, false, finalShapes)
            })
        })

        return finalShapes
    }
}

//

/// @typedef {[number, number, number]} Point3D - A 3D coordinate [x, y, z].
/// @typedef {[number, number]} Scale2D - A 2D scale factor [sx, sy].
/// @typedef {number} Rotation - A 2D rotation angle in radians/degrees.
/// * @typedef {object} Path3DResult
/// @property {Point3D[]} p - Array of 3D points (coordinates).
/// @property {Rotation[]} r - Array of rotation values (per point).
/// @property {Scale2D[]} s - Array of scale values (per point).
/// @property {Point3D[]} n - Array of normals/tangents (per point).
/// @property {boolean} close - Whether the path should be considered closed (copied from constructor).
/// @property {boolean} xyInitAng - Whether to use XY angle for initial normal calculation (copied from constructor).

class Path3d {
    /// @param {number} fn - Default number of segments for curves (tessellation factor). Default is 20.
    /// @param {boolean} [close=false] - Whether the path is a closed loop.
    /// @param {boolean} [xyInitAng=true] - Flag for normal calculation.
    constructor() {
        //fn = 20, close = false, xyInitAng = true) {
        /// @type {Array<string|number>}
        this._path = [] // Private: Stores the sequence of path commands
        /// @type {number}
        this._fn = 20 // Private: Default number of segments for curves
        /// @type {Point3D}
        this._cp = [0, 0, 0] // Private: Current point [x, y, z]
        /// @type {number}
        this._cr = 0 // Private: Current rotation
        /// @type {Scale2D}
        this._cs = [1, 1] // Private: Current scale
        /// @type {number}
        this._atn = 1 // Private: Number of segments for the next command ('n' command sets this)
        /// @type {number}
        this._atr = 0 // Private: Target rotation for the next point ('r' command sets this)
        ///@type {Scale2D}
        this._ats = [1, 1] // Private: Target scale for the next point ('s' command sets this)

        /// @type {boolean}
        this._close = false
        ///@type {boolean}
        this._xyInitAng = true

        ///@type {Path3DResult}
        this._pathData = null // Private: Stores the processed result
    }

    fn(v) {
        this._fn = v

        return this
    }

    close(v) {
        this._close = v
        return this
    }

    xyInitAng(v) {
        this._xyInitAng = v
        return this
    }

    path(data) {
        if (data instanceof Path2d) {
            this._path = convertTo3d(data._path)
            this._fn = data._fn
        } else {
            this._path = data
        }
        return this
    }

    // --- Public Path Commands (Methods for Cascading) ---

    // Move to (absolute)
    m(x, y, z) {
        this._path.push('m', x, y, z)
        return this
    }

    // Move to (relative)
    mr(x, y, z) {
        this._path.push('mr', x, y, z)
        return this
    }

    // Line to (absolute)
    l(x, y, z) {
        this._path.push('l', x, y, z)
        return this
    }

    // Line to (relative)
    lr(x, y, z) {
        this._path.push('lr', x, y, z)
        return this
    }

    // Quadratic Bezier (absolute)
    q(cpx, cpy, cpz, x, y, z) {
        this._path.push('q', cpx, cpy, cpz, x, y, z)
        return this
    }

    // Quadratic Bezier (relative)
    qr(cpx, cpy, cpz, x, y, z) {
        this._path.push('qr', cpx, cpy, cpz, x, y, z)
        return this
    }

    // Cubic Bezier (absolute)
    c(cp1x, cp1y, cp1z, cp2x, cp2y, cp2z, x, y, z) {
        this._path.push('c', cp1x, cp1y, cp1z, cp2x, cp2y, cp2z, x, y, z)
        return this
    }

    // Cubic Bezier (relative)
    cr(cp1x, cp1y, cp1z, cp2x, cp2y, cp2z, x, y, z) {
        this._path.push('cr', cp1x, cp1y, cp1z, cp2x, cp2y, cp2z, x, y, z)
        return this
    }

    // Arc segment (absolute - via control point)
    x(cpx, cpy, cpz, x, y, z) {
        this._path.push('x', cpx, cpy, cpz, x, y, z)
        return this
    }

    // Arc segment (relative - via control point)
    xr(cpx, cpy, cpz, x, y, z) {
        this._path.push('xr', cpx, cpy, cpz, x, y, z)
        return this
    }

    // Set number of segments for the NEXT command
    n(segments) {
        this._path.push('n', segments)
        return this
    }

    // Set target rotation for the NEXT point
    r(rotation) {
        this._path.push('r', rotation)
        return this
    }

    // Set target scale for the NEXT point
    s(sx, sy) {
        this._path.push('s', sx, sy)
        return this
    }

    // --- Public Result Method ---

    /// Executes the full path processing (Tessellation and Normal Calculation).
    /// @returns {Path3DResult} The structured 3D path data.
    getPoints() {
        // Clear previous data if path was changed, then process
        this._pathData = null
        this._tessellateAndProcess()
        this._calculateNormals()
        return this._pathData
    }

    // --- Core 3D Path Logic (Private Methods - Vector Math) ---

    /// @private
    _vsub(p1, p2) {
        return [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    }

    /// @private
    _vadd(p1, p2) {
        return [p1[0] + p2[0], p1[1] + p2[1], p1[2] + p2[2]]
    }

    /// @private
    _vdot(p1, p2) {
        return p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]
    }

    /// @private
    _vlength(p) {
        // Corrected: Calls to _vdot must use 'this.'
        return Math.sqrt(this._vdot(p, p))
    }

    /// @private
    _vnormalize(p) {
        // Corrected: Calls to _vlength must use 'this.'

        const l = this._vlength(p)
        return l > 1e-6 ? [p[0] / l, p[1] / l, p[2] / l] : [0, 0, 0]
    }

    /// @private
    _vcross(p1, p2) {
        return [
            p1[1] * p2[2] - p1[2] * p2[1],
            p1[2] * p2[0] - p1[0] * p2[2],
            p1[0] * p2[1] - p1[1] * p2[0]
        ]
    }

    /// @private
    _vscale(p, s) {
        return [p[0] * s, p[1] * s, p[2] * s]
    }

    // --- Core 3D Path Logic (Private Methods - Tessellation) ---

    /// Calculates a point on a Quadratic or Cubic Bezier curve.
    /// @private
    _getBezierPoint(t, start, end, ...cps) {
        if (cps.length === 1) {
            // Quadratic
            const [cp1x, cp1y, cp1z] = cps[0]
            const [x0, y0, z0] = start
            const [x2, y2, z2] = end
            const t1 = 1 - t
            const t12 = t1 * t1
            const t2 = t * t
            const x = t12 * x0 + 2 * t1 * t * cp1x + t2 * x2
            const y = t12 * y0 + 2 * t1 * t * cp1y + t2 * y2
            const z = t12 * z0 + 2 * t1 * t * cp1z + t2 * z2
            return [x, y, z]
        } else if (cps.length === 2) {
            // Cubic
            const [cp1x, cp1y, cp1z] = cps[0]
            const [cp2x, cp2y, cp2z] = cps[1]
            const [x0, y0, z0] = start
            const [x3, y3, z3] = end
            const t2 = t * t
            const t3 = t2 * t
            const t1 = 1 - t
            const t12 = t1 * t1
            const t13 = t12 * t1
            const x =
                t13 * x0 + 3 * t12 * t * cp1x + 3 * t1 * t2 * cp2x + t3 * x3
            const y =
                t13 * y0 + 3 * t12 * t * cp1y + 3 * t1 * t2 * cp2y + t3 * y3
            const z =
                t13 * z0 + 3 * t12 * t * cp1z + 3 * t1 * t2 * cp2z + t3 * z3
            return [x, y, z]
        }
    }

    /// Gets evenly spaced points along a 3D Bezier curve's length.
    /// @private
    _getPointsAtEqualDistance(startPoint, endPoint, controlPoints, segments) {
        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = this._getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1],
                point[2] - prevPoint[2]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1],
                    nextPoint[2] - lastPoint[2]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1]),
                        prevPoint[2] + ratio * (nextPoint[2] - prevPoint[2])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    /// Gets segment points for a 3D arc defined by three points (p0, p1, p2).
    /// @private
    _getArcSegmentPoints3D(p0, p1, p2, segments) {
        // Shorthand for internal vector math methods
        //const vsub = this._vsub, vadd = this._vadd, vscale = this._vscale, vdot = this._vdot, vcross = this._vcross, vlength = this._vlength, vnormalize = this._vnormalize

        // 1. Find Center C
        const v01 = this._vsub(p1, p0)
        const v12 = this._vsub(p2, p1)
        const m01 = this._vadd(p0, this._vscale(v01, 0.5))
        const m12 = this._vadd(p1, this._vscale(v12, 0.5))

        const A1 = v01[0],
            B1 = v01[1],
            C1 = v01[2],
            D1 = this._vdot(v01, m01)
        const A2 = v12[0],
            B2 = v12[1],
            C2 = v12[2],
            D2 = this._vdot(v12, m12)

        const N_arc_unnorm = this._vcross(v01, v12)

        if (this._vlength(N_arc_unnorm) < 1e-6) {
            return []
        }

        const N_arc = this._vnormalize(N_arc_unnorm)
        const A3 = N_arc[0],
            B3 = N_arc[1],
            C3 = N_arc[2],
            D3 = this._vdot(N_arc, p0)

        // Cramer's Rule for Center
        const detA =
            A1 * (B2 * C3 - C2 * B3) -
            B1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * B3 - B2 * A3)

        if (Math.abs(detA) < 1e-6) {
            return []
        }

        const detX =
            D1 * (B2 * C3 - C2 * B3) -
            B1 * (D2 * C3 - C2 * D3) +
            C1 * (D2 * B3 - B2 * D3)
        const detY =
            A1 * (D2 * C3 - C2 * D3) -
            D1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * D3 - D2 * A3)
        const detZ =
            A1 * (B2 * D3 - D2 * B3) -
            B1 * (A2 * D3 - D2 * A3) +
            D1 * (A2 * B3 - B2 * A3)

        const cx = detX / detA
        const cy = detY / detA
        const cz = detZ / detA
        const center = [cx, cy, cz]

        // 2. Radius R and Basis
        const vC0 = this._vsub(p0, center)
        const R = this._vlength(vC0)

        if (R < 1e-6) return []

        const X_basis = this._vnormalize(vC0)
        const Z_basis = N_arc
        const Y_basis = this._vcross(Z_basis, X_basis)

        // 3. Calculate Angles
        const PI2 = 2 * Math.PI

        const vC2 = this._vsub(p2, center)
        const x_proj2 = this._vdot(vC2, X_basis)
        const y_proj2 = this._vdot(vC2, Y_basis)
        let endAngle = Math.atan2(y_proj2, x_proj2)

        const vC1 = this._vsub(p1, center)
        const x_proj1 = this._vdot(vC1, X_basis)
        const y_proj1 = this._vdot(vC1, Y_basis)
        const controlAngle = Math.atan2(y_proj1, x_proj1)

        endAngle = (endAngle + PI2) % PI2
        const normControlAngle = (controlAngle + PI2) % PI2

        // 4. Determine Sweep
        let sweep = endAngle

        const isStartEndCoincident = this._vlength(this._vsub(p0, p2)) < 1e-6
        const isControlDistinct = this._vlength(this._vsub(p0, p1)) > 1e-6

        if (isStartEndCoincident && isControlDistinct) {
            sweep = PI2
        } else {
            if (normControlAngle > sweep + 1e-6) {
                sweep += PI2
            }
        }

        if (Math.abs(sweep) < 1e-6) {
            return []
        }

        // 5. Generate Line Segments
        const segmentPoints = []
        for (let j = 1; j < segments; j++) {
            // Loop up to segments - 1
            const angle = (sweep * j) / segments

            const cosA = Math.cos(angle)
            const sinA = Math.sin(angle)

            const termX = this._vscale(X_basis, R * cosA)
            const termY = this._vscale(Y_basis, R * sinA)

            const newPoint = this._vadd(this._vadd(center, termX), termY)

            segmentPoints.push(newPoint)
        }

        return segmentPoints
    }

    /// Processes the path commands, tessellating curves and interpolating r/s.
    /// @private
    _tessellateAndProcess() {
        const paths = this._path
        const fn = this._fn

        // Reset current internal state
        this._cp = [0, 0, 0]
        this._cr = 0
        this._cs = [1, 1]
        this._atn = 1
        this._atr = 0
        this._ats = [1, 1]

        const newPath = {
            p: [],
            r: [],
            s: [],
            n: [],
            close: this._close,
            xyInitAng: this._xyInitAng
        }

        // Use local copies for interpolation variables
        let cp = this._cp.slice()
        let cr = this._cr
        let cs = this._cs.slice()
        let atn = this._atn
        let atr = this._atr
        let ats = this._ats.slice()

        let i = 0
        while (i < paths.length) {
            const command = paths[i]
            let commandLength = 1

            switch (command) {
                case 'm':
                    cp = [paths[i + 1], paths[i + 2], paths[i + 3]]
                    newPath.p.push([...cp])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                    commandLength = 4
                    break
                case 'mr':
                    cp = [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 2],
                        cp[2] + paths[i + 3]
                    ]
                    newPath.p.push([...cp])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                    commandLength = 4
                    break
                case 'l': {
                    const atp = [paths[i + 1], paths[i + 2], paths[i + 3]]
                    const segmentsToUse = atn > 1 ? atn : 1
                    for (let v = 1; v <= segmentsToUse; v++) {
                        const t = v / segmentsToUse
                        const ix = cp[0] * (1 - t) + atp[0] * t
                        const iy = cp[1] * (1 - t) + atp[1] * t
                        const iz = cp[2] * (1 - t) + atp[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                    cp = atp
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 4
                    break
                }
                case 'lr': {
                    const endPoint_lr = [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 2],
                        cp[2] + paths[i + 3]
                    ]
                    const segmentsToUse = atn > 1 ? atn : 1
                    for (let v = 1; v <= segmentsToUse; v++) {
                        const t = v / segmentsToUse
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        const iz = cp[2] * (1 - t) + endPoint_lr[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                    cp = endPoint_lr
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 4
                    break
                }
                case 'q': {
                    const endPoint = [paths[i + 4], paths[i + 5], paths[i + 6]]
                    const controlPoints = [
                        [paths[i + 1], paths[i + 2], paths[i + 3]]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )

                    segmentPoints.forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 7
                    break
                }
                case 'qr': {
                    const endPoint = [
                        cp[0] + paths[i + 4],
                        cp[1] + paths[i + 5],
                        cp[2] + paths[i + 6]
                    ]
                    const controlPoints = [
                        [
                            cp[0] + paths[i + 1],
                            cp[1] + paths[i + 2],
                            cp[2] + paths[i + 3]
                        ]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )

                    segmentPoints.forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 7
                    break
                }
                case 'c': {
                    const endPoint = [paths[i + 7], paths[i + 8], paths[i + 9]]
                    const controlPoints = [
                        [paths[i + 1], paths[i + 2], paths[i + 3]],
                        [paths[i + 4], paths[i + 5], paths[i + 6]]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )

                    segmentPoints.forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 10
                    break
                }
                case 'cr': {
                    const endPoint = [
                        cp[0] + paths[i + 7],
                        cp[1] + paths[i + 8],
                        cp[2] + paths[i + 9]
                    ]
                    const controlPoints = [
                        [
                            cp[0] + paths[i + 1],
                            cp[1] + paths[i + 2],
                            cp[2] + paths[i + 3]
                        ],
                        [
                            cp[0] + paths[i + 4],
                            cp[1] + paths[i + 5],
                            cp[2] + paths[i + 6]
                        ]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn
                    const segmentPoints = this._getPointsAtEqualDistance(
                        cp,
                        endPoint,
                        controlPoints,
                        segmentsToUse
                    )

                    segmentPoints.forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 10
                    break
                }
                case 'x': {
                    const controlPoint = [
                        paths[i + 1],
                        paths[i + 2],
                        paths[i + 3]
                    ]
                    const endPoint = [paths[i + 4], paths[i + 5], paths[i + 6]]
                    const segmentsToUse = atn > 1 ? atn : fn

                    this._getArcSegmentPoints3D(
                        cp,
                        controlPoint,
                        endPoint,
                        segmentsToUse
                    ).forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    // Explicitly push the final endpoint (P2)
                    newPath.p.push([...endPoint])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 7
                    break
                }
                case 'xr': {
                    const controlPoint = [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 2],
                        cp[2] + paths[i + 3]
                    ]
                    const endPoint = [
                        cp[0] + paths[i + 4],
                        cp[1] + paths[i + 5],
                        cp[2] + paths[i + 6]
                    ]
                    const segmentsToUse = atn > 1 ? atn : fn

                    this._getArcSegmentPoints3D(
                        cp,
                        controlPoint,
                        endPoint,
                        segmentsToUse
                    ).forEach((p, j) => {
                        const t = (j + 1) / segmentsToUse
                        newPath.p.push([...p])
                        newPath.r.push(cr * (1 - t) + atr * t)
                        newPath.s.push([
                            cs[0] * (1 - t) + ats[0] * t,
                            cs[1] * (1 - t) + ats[1] * t
                        ])
                    })

                    // Explicitly push the final endpoint (P2)
                    newPath.p.push([...endPoint])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])

                    cp = endPoint
                    cr = atr
                    cs = ats
                    atn = 1
                    commandLength = 7
                    break
                }
                case 'r':
                    atr = paths[i + 1]
                    commandLength = 2
                    break
                case 's':
                    ats = [paths[i + 1], paths[i + 2]]
                    commandLength = 3
                    break
                case 'n':
                    atn = paths[i + 1]
                    commandLength = 2
                    break
                default:
                    commandLength = paths.length // Exit loop
                    break
            }
            i += commandLength
        }

        this._pathData = newPath
    }

    _calculateAverageTangent(p0, p1, p2) {
        //const vsub = this._vsub, vadd = this._vadd, vnormalize = this._vnormalize

        if (!p0) {
            return this._vnormalize(this._vsub(p2, p1))
        } else if (!p2) {
            return this._vnormalize(this._vsub(p1, p0))
        } else {
            const v1 = this._vsub(p1, p0)
            const v2 = this._vsub(p2, p1)
            return this._vnormalize(this._vadd(v1, v2))
        }
    }

    /// Calculates the tangent/normal vectors for all points.
    /// @private
    _calculateNormals() {
        if (!this._pathData || this._pathData.p.length === 0) return

        const points = this._pathData.p
        const normals = []
        const tol = 0.001

        let isClosed = false
        const fp = points[0]
        const lp = points[points.length - 1]

        if (points.length > 1) {
            const check = this._vsub(fp, lp).map(Math.abs)
            if (check[0] <= tol && check[1] <= tol && check[2] <= tol) {
                isClosed = true
            }
        }

        if (points.length === 1) {
            normals.push([1, 0, 0])
        } else if (points.length > 1) {
            // First point
            if (isClosed) {
                normals.push(this._calculateAverageTangent(lp, fp, points[1]))
            } else {
                normals.push(
                    this._calculateAverageTangent(undefined, fp, points[1])
                )
            }

            // Intermediate points
            for (let j = 1; j < points.length - 1; j++) {
                normals.push(
                    this._calculateAverageTangent(
                        points[j - 1],
                        points[j],
                        points[j + 1]
                    )
                )
            }

            // Last point
            if (isClosed) {
                // For a closed loop, the last tangent is the same as the first.
                normals.push(normals[0])
            } else {
                normals.push(
                    this._calculateAverageTangent(
                        points[points.length - 2],
                        lp,
                        undefined
                    )
                )
            }
        }

        this._pathData.n = normals
    }
}

//*/

// --- ASSUMED EXTERNAL HELPERS ---
// You provided applyQuaternion, which is included below.
// We must assume the existence of an extraction helper like applyToShape:

function isPath2d(item) {
    return item && item instanceof Path2d
}
const applyToPath2d = (item, applyFunction, ...args) =>
    applyFilter(item, isPath2d, applyFunction, ...args)

/**
 * Executes a 3D extrusion along a 3D path, using Path2d instances
 * extracted from a target object to define the 2D cross-section profile.
 *
 * @param {object} target - The parent object from which Path2d instances are extracted.
 * @param {object} commandPath - The raw path data to be processed by path3d.
 * @returns {THREE.Mesh[]} An array of THREE.js meshes.
 */
function extrude3d(target, commandPath) {
    // 1. Process the 3D path data
    var path = commandPath.getPoints() //path3d(commandPath)
    let close = path.close

    // 2. Extract all Path2d instances from the target object
    var path2dTargets = []
    applyToPath2d(target, (item) => {
        path2dTargets.push(item)
    })

    if (path2dTargets.length === 0) {
        return []
    }

    var points3d = []
    var preCalc = []
    var upVector = new THREE.Vector3(0, 0, 1)

    // --- Calculation for Initial Rotation from path.p ---
    const p1 = path.p[0]
    const p2 = path.p[1]
    let dx = p2[0] - p1[0]
    let dy = p2[1] - p1[1]

    let initialRotationRadians = 0

    if (path.xyInitAng) {
        initialRotationRadians = Math.atan2(dy, dx) + Math.PI / 2
    } else {
        initialRotationRadians = Math.PI / 2
    }

    const cosR = Math.cos(initialRotationRadians)
    const sinR = Math.sin(initialRotationRadians)
    // --- End of Calculation ---

    // 3. Pre-calculate rotations and quaternions for each path segment
    for (var i = 0; i < path.p.length; i++) {
        points3d.push(...[0, 0, i])
        const rotation = path.r[i]
        var o = {}
        o.cosR = Math.cos((rotation / 180) * Math.PI)
        o.sinR = Math.sin((rotation / 180) * Math.PI)
        const normal = new THREE.Vector3().fromArray(path.n[i])
        o.quaternion = new THREE.Quaternion().setFromUnitVectors(
            upVector,
            normal
        )
        // Note: applyQuaternion called here is part of the original logic flow
        applyQuaternion(upVector, o.quaternion)

        preCalc.push(o)
    }

    const meshes = []

    if (!points3d || points3d.length < 6) {
        return []
    }

    // --- Helper function to generate geometry from one ShapeData object (Solid + Holes) ---
    const genFromShapeData = (shapeData) => {
        var geometry = new THREE.BufferGeometry()
        var vertices = []
        var indices = []
        var uvs = []
        let vertexCount = 0

        // Convert Path2d's {x, y} Points to THREE.Vector2
        const convertToVector2 = (p) => new THREE.Vector2(p.x, p.y)
        const contourPoints = shapeData.outerPoints.map(convertToVector2)
        const holePoints = shapeData.holePoints.map((hole) =>
            hole.map(convertToVector2)
        )

        // 🌟 CRITICAL STEP: Apply Initial Rotation to the cross-section points (Replicating linePaths3d)
        const rotatePoints = (points) => {
            for (const point of points) {
                const x = point.x
                const y = point.y
                // Application of cosR and sinR (derived from initialRotationRadians)
                point.x = x * cosR - y * sinR
                point.y = x * sinR + y * cosR
            }
        }
        rotatePoints(contourPoints)
        holePoints.forEach(rotatePoints)
        // 🌟 END CRITICAL STEP

        // Triangulate the 2D shape for the caps
        const capTriangles = THREE.ShapeUtils.triangulateShape(
            contourPoints,
            holePoints
        )
        const allPoints = [contourPoints, ...holePoints].flat()
        const minX = Math.min(...allPoints.map((p) => p.x))
        const maxX = Math.max(...allPoints.map((p) => p.x))
        const minY = Math.min(...allPoints.map((p) => p.y))
        const maxY = Math.max(...allPoints.map((p) => p.y))
        const width = maxX - minX
        const height = maxY - minY
        const segments = points3d.length / 3 - 1

        // Calculation of Final 3D Point with Cumulative Rotation (Unchanged)
        const calcFinalPoint = (point, i) => {
            var x = point.x
            var y = point.y
            var z = 0

            // Apply path.s for scale
            x = x * path.s[i][0]
            y = y * path.s[i][1]

            // Apply 2D rotation (path.r)
            var o = preCalc[i]
            let rotatedX = x * o.cosR - y * o.sinR
            let rotatedY = x * o.sinR + y * o.cosR
            x = rotatedX
            y = rotatedY

            const ppoint = new THREE.Vector3(x, y, z)

            // Apply the 3D rotation CUMULATIVELY
            for (var k = 0; k <= i; k++) {
                applyQuaternion(ppoint, preCalc[k].quaternion)
            }

            // Apply the 3D translation
            ppoint.x += path.p[i][0]
            ppoint.y += path.p[i][1]
            ppoint.z += path.p[i][2]
            return ppoint
        }

        // --- DEFINITION 1: Cap Generation (Unchanged) ---
        const addCap = (isTop) => {
            const capStartVertexCount = vertexCount
            const i = isTop ? segments : 0

            // 1. Add Vertices and Cap UVs
            for (const point of allPoints) {
                var ppoint = calcFinalPoint(point, i)
                vertices.push(ppoint.x, ppoint.y, ppoint.z)
                vertexCount++
                uvs.push((point.x - minX) / width, (point.y - minY) / height)
            }

            // 2. Add Indices
            for (const tri of capTriangles) {
                const v1 = capStartVertexCount + tri[0]
                const v2 = capStartVertexCount + tri[1]
                const v3 = capStartVertexCount + tri[2]

                if (isTop) {
                    indices.push(v1, v2, v3)
                } else {
                    indices.push(v1, v3, v2)
                }
            }
        }

        // --- DEFINITION 2: Side Wall Generation (Unchanged) ---
        const extrudeContour = (points, reverseWinding) => {
            const contourStartVertexCount = vertexCount
            const numPoints = points.length

            // 1. Calculate total length of this contour for side UVs (U coordinate)
            let contourLength = 0
            for (let i = 0; i < numPoints; i++) {
                const p1 = points[i]
                const p2 = points[(i + 1) % numPoints]
                contourLength += p1.distanceTo(p2)
            }

            // 2. Generate Vertices and UVs for the side walls
            let u_current = 0
            for (let i = 0; i <= segments; i++) {
                // Loop path depth (V coordinate)
                const v = 1 - i / segments
                u_current = 0

                for (let j = 0; j < numPoints; j++) {
                    // Loop 2D points (U coordinate)
                    const point = points[j]
                    var ppoint = calcFinalPoint(point, i)

                    vertices.push(ppoint.x, ppoint.y, ppoint.z)
                    uvs.push(u_current / contourLength, v)
                    vertexCount++

                    const p1 = points[j]
                    const p2 = points[(j + 1) % numPoints]
                    u_current += p1.distanceTo(p2)
                }
            }

            // 3. Generate Indices (Faces)
            for (let i = 0; i < segments; i++) {
                for (let j = 0; j < numPoints; j++) {
                    const idx_a = contourStartVertexCount + i * numPoints + j
                    const idx_b =
                        contourStartVertexCount +
                        i * numPoints +
                        ((j + 1) % numPoints)
                    const idx_c =
                        contourStartVertexCount +
                        (i + 1) * numPoints +
                        ((j + 1) % numPoints)
                    const idx_d =
                        contourStartVertexCount + (i + 1) * numPoints + j

                    //if (reverseWinding) {
                        //indices.push(idx_a, idx_d, idx_c)
                        //indices.push(idx_a, idx_c, idx_b)
                    //} else {
                        indices.push(idx_a, idx_b, idx_c)
                        indices.push(idx_a, idx_c, idx_d)
                    //}
                }
            }
        }

        // --- Execution (Calling the Defined Helpers) ---
        if (!close) {
            addCap(true) // Add the top cap
            addCap(false) // Add the bottom cap
        }

        extrudeContour(contourPoints, false) // Extrude main outline
        for (const hole of holePoints) {
            extrudeContour(hole, true) // Extrude holes with reversed winding
        }

        // Finalize Geometry
        geometry.setIndex(indices)
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(vertices, 3)
        )
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        geometry.computeVertexNormals()

        return new THREE.Mesh(geometry, defaultMaterial.clone())
    }

    // 4. Generate Meshes for all extracted Path2d targets
    for (const path2dInstance of path2dTargets) {
        const shapeDataArray = path2dInstance.getPoints()

        for (const shapeData of shapeDataArray) {
            meshes.push(genFromShapeData(shapeData))
        }
    }

    return meshes
}

//

function sweep3d(circularPath, wallPath, holeWallPath) {
    // 1. Process the 3D path data

    
    let close = false

    // 2. Extract all Path2d instances from the target object
    //var path2dTargets = [wallPath]

    const convertToVector2 = (p) => new THREE.Vector2(p.x, p.y)
    var wallPoints = () => {
       var v= wallPath.getPoints()[0].outerPoints.map(convertToVector2)//.reverse()
	   var v1=v[0];
	   var v2=v[v.length-1];
	   if(v2.y<v1.y) return v.reverse();
	   return v;
	};
	
		
	var holeWallPoints = () => {
        var v = holeWallPath.getPoints()[0].outerPoints.map(convertToVector2)//.reverse()
		var v1=v[0];
	   	var v2=v[v.length-1];
	   	if(v2.y<v1.y) return v.reverse();
		return v;
	};
	
		
		
    
    const meshes = []
	
    var topCapPoints = []
    var bottomCapPoints = []
    // ⭐ NEW: Arrays to hold 3D points for all hole contours
    var topHolePointArrays = []
    var bottomHolePointArrays = []

    // --- Helper function to generate geometry from one ShapeData object ---
    const genFromShapeData = (path2d, isHole) => {
        
        //shapeData is wall points
		var upVector = new THREE.Vector3(0, 0, 1)
	
        var path3d = new Path3d().path(path2d)
        var path = path3d.getPoints()

        const p1 = path.p[0]
        const p2 = path.p[1]
        let dx = p2[0] - p1[0]
        let dy = p2[1] - p1[1]

        let initialRotationRadians = 0

        if (path.xyInitAng) {
        	initialRotationRadians = Math.atan2(dy, dx) + Math.PI / 2
        } else {
        	initialRotationRadians = Math.PI / 2
        }

		//here
        const cosR = Math.cos(initialRotationRadians)
        const sinR = Math.sin(initialRotationRadians)

        //calc path stuff

        var points3d = []
        var preCalc = []

        // 3. Pre-calculate rotations and quaternions for each path segment (Unchanged)
        for (var i = 0; i < path.p.length; i++) {
            points3d.push(...[0, 0, i])
            const rotation = path.r[i]
            var o = {}
            o.cosR = Math.cos((rotation / 180) * Math.PI)
            o.sinR = Math.sin((rotation / 180) * Math.PI)
            const normal = new THREE.Vector3().fromArray(path.n[i])
            o.quaternion = new THREE.Quaternion().setFromUnitVectors(
                upVector,
                normal
            )
            applyQuaternion(upVector, o.quaternion)

            preCalc.push(o)
        }

        /////end cald stuff

        var finalMeshes = []

        
        const segments = points3d.length / 3 - 1

        const convertToVector2 = (p) => new THREE.Vector2(p.x, p.y)
        let contourPoints;
		
		
		if(isHole && holeWallPath)	{
			
			contourPoints=holeWallPoints();
			
		} else {
			contourPoints=wallPoints()
		}	
        // ⭐ MODIFIED: Convert hole points to THREE.Vector2 arrays
        //const holeContours = shapeData.holePoints.map(hole => hole.map(convertToVector2));

        // Apply Initial Rotation
        const rotatePoints = (points) => {
            for (const point of points) {
                const x = point.x
                const y = point.y
                point.x = x * cosR - y * sinR
                point.y = x * sinR + y * cosR
            }
        }

        // Rotate outer and hole contours
        rotatePoints(contourPoints)
        //holeContours.forEach(rotatePoints);

        // Calculation of Final 3D Point with Cumulative Rotation (Unchanged)
        const calcFinalPoint = (point, i) => {
            var x = point.x
            var y = point.y
            var z = 0

            // Apply path.s for scale
            x = x * path.s[i][0]
            y = y * path.s[i][1]

            // Apply 2D rotation (path.r)
            var o = preCalc[i]
            let rotatedX = x * o.cosR - y * o.sinR
            let rotatedY = x * o.sinR + y * o.cosR
            x = rotatedX
            y = rotatedY

            const ppoint = new THREE.Vector3(x, y, z)

            // Apply the 3D rotation CUMULATIVELY
            for (var k = 0; k <= i; k++) {
                applyQuaternion(ppoint, preCalc[k].quaternion)
            }

            // Apply the 3D translation
            ppoint.x += path.p[i][0]
            ppoint.y += path.p[i][1]
            ppoint.z += path.p[i][2]
            return ppoint
        }
		
        // --- DEFINITION 2: Side Wall Generation (MODIFIED for CAP POINT COLLECTION) ---
        // Extrude ALL contours (outer and holes) to create the side walls.
        const extrudeContour = (points, isHole) => {
            const contourStartVertexCount = 0 //vertexCount
            const numPoints = points.length
            const numWallSegments = numPoints - 1
            const reverseWinding = isHole // Holes need reversed winding for the wall

            var r = {
                vertices: [],
                indices: [],
                uvs: [],
                vertexCount: 0
            }

            // 1. Calculate total length for U coordinate
            let contourLength = 0
            for (let i = 0; i < numWallSegments; i++) {
                contourLength += points[i].distanceTo(points[i + 1])
            }

            // 2. Generate Vertices and UVs
            let u_current = 0

            // ⭐ Capture point array reference for the cap points
            const currentCapPoints = []
            const currentTopPoints = []

            for (let i = 0; i <= segments; i++) {
                const v = 1 - i / segments
                u_current = 0

                for (let j = 0; j < numPoints; j++) {
                    const point = points[j]
                    var ppoint = calcFinalPoint(point, i)

                    // Add to the WALL geometry vertices
                    r.vertices.push(ppoint.x, ppoint.y, ppoint.z)
                    r.vertexCount++

                    // ⭐ Collect 3D points for the Caps
                    if (j == 0) {
                        // At the start of the path (Bottom)
                        currentCapPoints.push(ppoint.x, ppoint.y, ppoint.z)
                    }
                    if (j == numPoints - 1) {
                        // At the end of the path (Top)
                        currentTopPoints.push(ppoint.x, ppoint.y, ppoint.z)
                    }

                    let u_val = u_current / contourLength
                    if (j === numPoints - 1) {
                        u_val = 1.0
                    }
                    r.uvs.push(u_val, v)

                    if (j < numWallSegments) {
                        const p1 = points[j]
                        const p2 = points[j + 1]
                        u_current += p1.distanceTo(p2)
                    }
                }
            }

            // ⭐ Store 3D points based on contour type
            if (isHole) {
                bottomHolePointArrays.push(currentCapPoints)
                topHolePointArrays.push(currentTopPoints)
            } else {
                // This is the outer contour
                bottomCapPoints.push(...currentCapPoints)
                topCapPoints.push(...currentTopPoints)
            }

            // 3. Generate Indices (Faces)
            for (let i = 0; i < segments; i++) {
                // Loop only up to numWallSegments to prevent closing
                for (let j = 0; j < numWallSegments; j++) {
                    const idx_a = contourStartVertexCount + i * numPoints + j
                    const idx_b =
                        contourStartVertexCount + i * numPoints + (j + 1)
                    const idx_c =
                        contourStartVertexCount + (i + 1) * numPoints + (j + 1)
                    const idx_d =
                        contourStartVertexCount + (i + 1) * numPoints + j

                    //if (!reverseWinding) {
                        //r.indices.push(idx_a, idx_d, idx_c)
                        //r.indices.push(idx_a, idx_c, idx_b)
                    //} else {
                        // Reverse winding for holes
                        r.indices.push(idx_a, idx_b, idx_c)
                        r.indices.push(idx_a, idx_c, idx_d)
                    //}
                }
            }
            return r
        }

		//here1
        // --- Execution ---

        // 1. Generate all vertices and wall indices for the outer contour
        finalMeshes.push(extrudeContour(contourPoints, isHole))

        // 2. Generate all vertices and wall indices for the hole contours
        
        for (var i = 0; i < finalMeshes.length; i++) {
            var geometry = new THREE.BufferGeometry()
            geometry.setIndex(finalMeshes[i].indices)
            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(finalMeshes[i].vertices, 3)
            )
            geometry.setAttribute(
                'uv',
                new THREE.Float32BufferAttribute(finalMeshes[i].uvs, 2)
            )
            geometry.computeVertexNormals()

            // Create the Wall Mesh
            const wallMesh = new THREE.Mesh(geometry, defaultMaterial.clone())
            meshes.push(wallMesh)
        }

        
    }

    // ⭐ MODIFIED: Helper function to create cap geometry (handles holes)
    const createCapGeometry = (
        outer3DPoints,
        hole3DPointArrays,
        isBottomCap
    ) => {
        if (outer3DPoints.length === 0) return null

        // 1. Extract 3D Vector points and find the planar projection (e.g., on XY plane)
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
        var contour3DPoints = []
        var projected2DPoints = [] // Outer contour for THREE.Shape

        // Process Outer Contour
        for (let i = 0; i < outer3DPoints.length; i += 3) {
            var x = outer3DPoints[i]
            var y = outer3DPoints[i + 1]
            var z = outer3DPoints[i + 2]
            var v3 = new THREE.Vector3(x, y, z)
            contour3DPoints.push(v3)

            projected2DPoints.push(new THREE.Vector2(x, y))

            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
        }

        // Process Hole Contours (needed for THREE.ShapeUtils.triangulateShape)
        const projectedHoles2D = []

        for (var hole3DPoints of hole3DPointArrays) {
            var hole2DPoints = []
            for (let i = 0; i < hole3DPoints.length; i += 3) {
                var x = hole3DPoints[i]
                var y = hole3DPoints[i + 1]
                var z = hole3DPoints[i + 2]
                var v3 = new THREE.Vector3(x, y, z)

                // Add hole 3D point to the main vertex array
                contour3DPoints.push(v3)

                hole2DPoints.push(new THREE.Vector2(x, y))
            }
            projectedHoles2D.push(hole2DPoints)
        }

        let width = maxX - minX
        let height = maxY - minY

        // Handle zero width/height case for UVs
        if (width === 0) {
            maxX += 1
            width = 1
        }
        if (height === 0) {
            maxY += 1
            height = 1
        }

        // 2. Triangulate the 2D Shape - PASSING THE HOLES ARRAY
        var triangles = THREE.ShapeUtils.triangulateShape(
            projected2DPoints,
            projectedHoles2D // <--- Pass 2D hole contours for triangulation
        )

        // 3. Setup Final Vertices, Indices, and UVs arrays
        var capVerticesFinal = []
        var capIndices = []
        var capUVs = []

        // Add all 3D contour (outer and holes) vertices to the final array
        for (const v of contour3DPoints) {
            capVerticesFinal.push(v.x, v.y, v.z)

            // Simple planar UV mapping (using World X/Y)
            capUVs.push((v.x - minX) / width, (v.y - minY) / height)
        }

        // 4. Generate Indices from the Triangulation result
        for (const triangle of triangles) {
            // The indices from triangulateShape refer to the indices in contour3DPoints.
            var idx0 = triangle[0]
            var idx1 = triangle[1]
            var idx2 = triangle[2]

            if (!isBottomCap) {
                // Reverse winding for the bottom cap
                capIndices.push(idx0, idx2, idx1)
            } else {
                // Standard winding for the top cap
                capIndices.push(idx0, idx1, idx2)
            }
        }

        var capGeom = new THREE.BufferGeometry()
        capGeom.setIndex(capIndices)
        capGeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(capVerticesFinal, 3)
        )
        capGeom.setAttribute('uv', new THREE.Float32BufferAttribute(capUVs, 2))
        capGeom.computeVertexNormals()

        // NOTE: 'defaultMaterial' must be defined and available in the scope.
        return new THREE.Mesh(capGeom, defaultMaterial.clone())
    }

    // 4. Generate Meshes for all extracted Path2d targets (Unchanged)

    var cirPaths = circularPath.getPoints()
    //jlog("cirPaths",cirPaths)

    for (var v = 0; v < cirPaths.length; v++) {
        var lpath = []
        var apath = cirPaths[v].outerPoints
        //jlog("aparh",apath)
        for (var i = 0; i < apath.length; i++) {
            if (i == 0) {
                lpath.push('m', apath[i].x, apath[i].y)
                //jlog('apath[i]', apath[i])
            } else {
                lpath.push('l', apath[i].x, apath[i].y)
            }
        }
        var fpath = new Path2d().path(lpath).fn(circularPath._fn)

        genFromShapeData(fpath, false)

        var hpaths = cirPaths[v].holePoints
        for (var j = 0; j < hpaths.length; j++) {
            lpath = []
            apath = hpaths[j]
            for (var i = 0; i < apath.length; i++) {
                if (i == 0) {
                    lpath.push('m', apath[i].x, apath[i].y)
                    //jlog('apath[i]', apath[i])
                } else {
                    lpath.push('l', apath[i].x, apath[i].y)
                }
            }
            fpath = new Path2d().path(lpath).fn(circularPath._fn)

            genFromShapeData(fpath, true)
        }
    }
	
	
	// TOP CAP (Pass outer points and hole arrays)
    const topCapMesh = createCapGeometry(topCapPoints, topHolePointArrays, true); // isBottomCap = false
    if (topCapMesh) { meshes.push(topCapMesh); }

    // BOTTOM CAP (Pass outer points and hole arrays)
    const bottomCapMesh = createCapGeometry(bottomCapPoints, bottomHolePointArrays, false); // isBottomCap = true (reversed winding)
    if (bottomCapMesh) { meshes.push(bottomCapMesh); }


    return union( meshes)
}

//*/



/////////////////////////////////

/**
 * @param {object} target - The parent object to which the shapes are applied.
 * @param {object} path - The pre-processed path data containing points, rotations, and normals.
 * @param {boolean} close - A flag to indicate if the path should be closed.
 * @returns {THREE.Mesh[]} An array of THREE.js meshes.
 */
//working

function linePaths3d(target, commandPath) {
    var path = path3d(commandPath)
    let close = path.close

    //jlog("path", path)
    // This part of the code is not being modified, but it's included for context
    var shapes = []
    applyToShape(target, (item) => {
        shapes.push(item)
    })

    var points3d = []

    var preCalc = []

    var upVector = new THREE.Vector3(0, 0, 1)

    // --- Calculation for Initial Rotation from path.p ---

    // Get the first two points from the path.p array
    // path.p[i] is [x, y, z] in 3D printer coordinates,
    // where x and y are the planar coordinates (ground plane).
    const p1 = path.p[0]
    const p2 = path.p[1]

    // Calculate delta x (dx) and delta y (dy)
    let dx = p2[0] - p1[0] // x2 - x1
    let dy = p2[1] - p1[1] // y2 - y1

    // Calculate the angle using Math.atan2(dy, dx).
    // This gives the angle in radians on the X-Y plane (3D printer coordinates).
    // This angle corresponds to rotating the shape around the Y-axis.
    let initialRotationRadians = 0

    if (path.xyInitAng) {
        initialRotationRadians = Math.atan2(dy, dx) - Math.PI
    } else {
        initialRotationRadians = Math.PI / 2
    }

    //const initialRotationRadians = Math.PI/2

    const cosR = Math.cos(initialRotationRadians)
    const sinR = Math.sin(initialRotationRadians)
    // --- End of Calculation ---

    for (var i = 0; i < path.p.length; i++) {
        points3d.push(...[0, 0, i])

        // Apply 2D rotation on X and Z
        const rotation = path.r[i]

        var o = {}
        o.cosR = Math.cos((rotation / 180) * Math.PI)
        o.sinR = Math.sin((rotation / 180) * Math.PI)

        // Now, we need to apply the 3D rotation from the normals and translation.
        // Create a quaternion to handle the 3D orientation.
        const normal = new THREE.Vector3().fromArray(path.n[i])
        //const upVector = new THREE.Vector3(0, 1, 0);
        o.quaternion = new THREE.Quaternion().setFromUnitVectors(
            upVector,
            normal
        )

        //upVector.applyQuaternion(o.quaternion)
        applyQuaternion(upVector, o.quaternion)

        preCalc.push(o)
    }

    const meshes = [] // An array to store all the created meshes

    if (!points3d || points3d.length < 6) {
        PrintWarn(
            'linePaths3d requires at least 6 numbers (2 points) for the 3D extrusion path.'
        )
        return null
    }

    //helper function to generate geometries from a shape
    const genFromShape = (shape) => {
        var geometry = new THREE.BufferGeometry()
        var vertices = []
        var indices = []
        var uvs = []

        let vertexCount = 0 // Current index for the next vertex to be added

        // --- 1. Extract 2D points from the shape and its holes ---
        // A division count of 1 is sufficient for straight lines, use higher for curves.
        const shapeData = shape.extractPoints(1)
        const contourPoints = shapeData.shape // Outer path (THREE.Vector2 array)
        const holePoints = shapeData.holes // Array of hole paths (Array of THREE.Vector2 arrays)

        // --- NEW: Rotate Shape Points ---
        // Rotate the primary shape points

        for (const point of contourPoints) {
            const x = point.x
            const y = point.y
            point.x = x * cosR - y * sinR
            point.y = x * sinR + y * cosR
        }

        // Rotate the hole points
        for (const hole of holePoints) {
            for (const point of hole) {
                const x = point.x
                const y = point.y
                point.x = x * cosR - y * sinR
                point.y = x * sinR + y * cosR
            }
        }

        // --- END NEW: Rotate Shape Points ---

        // --- 2. Triangulate the 2D shape for the caps ---
        const capTriangles = THREE.ShapeUtils.triangulateShape(
            contourPoints,
            holePoints
        )

        // Get bounding box of the 2D shape for normalized Cap UVs
        const allPoints = [contourPoints, ...holePoints].flat()
        const minX = Math.min(...allPoints.map((p) => p.x))
        const maxX = Math.max(...allPoints.map((p) => p.x))
        const minY = Math.min(...allPoints.map((p) => p.y))
        const maxY = Math.max(...allPoints.map((p) => p.y))
        const width = maxX - minX
        const height = maxY - minY
        const segments = points3d.length / 3 - 1

        const calcFinalPoint = (point, i) => {
            //================================
            //set the orintations here
            // Get the local cross-section coordinates from the extruded geometry.

            var x = point.x //sp.getX(i)
            var y = point.y // This is set to 0 to flatten out the cross section.
            var z = 0 //sp.getZ(i)

            // Apply path.s for scale
            x = x * path.s[i][0]
            y = y * path.s[i][1]

            // Apply 2D rotation on X and Z
            //const rotation = path.r[yindex];
            var o = preCalc[i]
            //const cosR = Math.cos(rotation/180*Math.PI);
            //const sinR = Math.sin(rotation/180*Math.PI);

            let rotatedX = x * o.cosR - y * o.sinR
            let rotatedY = x * o.sinR + y * o.cosR

            x = rotatedX
            y = rotatedY

            // Create a point in local space.
            const ppoint = new THREE.Vector3(x, y, z)

            // Apply the 3D rotation to the point using the quaternion.

            for (var k = 0; k <= i; k++) {
                //ppoint.applyQuaternion(preCalc[k].quaternion)
                applyQuaternion(ppoint, preCalc[k].quaternion)
            }

            // Apply the 3D translation from path.p[yindex]
            ppoint.x += path.p[i][0]
            ppoint.y += path.p[i][1]
            ppoint.z += path.p[i][2]
            return ppoint
        }

        //////////////////////////
        //add caps here

        const addCap = (isTop) => {
            const capStartVertexCount = vertexCount
            var i
            if (isTop) i = segments
            else i = 0
            for (const point of allPoints) {
                var ppoint = calcFinalPoint(point, i)
                vertices.push(ppoint.x, ppoint.y, ppoint.z)
                vertexCount++

                // UVs for Caps: Normalize X/Y coordinates to fit in the 0-1 UV space
                // U = (X - minX) / width
                // V = (Y - minY) / height
                uvs.push((point.x - minX) / width, (point.y - minY) / height)
            }

            // 4b. Generate Indices (Faces) (No change here from previous version)
            for (const tri of capTriangles) {
                const v1 = capStartVertexCount + tri[0]
                const v2 = capStartVertexCount + tri[1]
                const v3 = capStartVertexCount + tri[2]

                if (isTop) {
                    indices.push(v1, v2, v3)
                } else {
                    indices.push(v1, v3, v2)
                }
            }
        }

        // Add the top and bottom caps
        if (!close) {
            addCap(true)
            addCap(false)
        }

        // Helper function to generate side vertices and indices for one contour (outer or hole)
        const extrudeContour = (points, reverseWinding) => {
            const contourStartVertexCount = vertexCount
            const numPoints = points.length

            // 3a. Calculate total length of this contour for side UVs
            let contourLength = 0
            for (let i = 0; i < numPoints; i++) {
                const p1 = points[i]
                const p2 = points[(i + 1) % numPoints]
                contourLength += p1.distanceTo(p2)
            }

            // 3b. Generate Vertices and UVs
            let u_current = 0 // The 'U' coordinate tracks distance along the contour

            for (let i = 0; i <= segments; i++) {
                // Loop depth segments (V coordinate)
                //const z = i;
                const v = 1 - i / segments // V coordinate: 1 at bottom, 0 at top

                u_current = 0 // Reset U for each depth slice

                for (let j = 0; j < numPoints; j++) {
                    // Loop 2D points (U coordinate)
                    const point = points[j]

                    var ppoint = calcFinalPoint(point, i)

                    // Positions
                    vertices.push(ppoint.x, ppoint.y, ppoint.z)

                    // UVs (U: distance along contour, V: distance along depth)
                    uvs.push(u_current / contourLength, v) // U is normalized by total length
                    vertexCount++

                    // Update U distance for the next point
                    const p1 = points[j]
                    const p2 = points[(j + 1) % numPoints]
                    u_current += p1.distanceTo(p2)
                }
            }

            // 3c. Generate Indices (Faces) (No change here from previous version)
            for (let i = 0; i < segments; i++) {
                for (let j = 0; j < numPoints; j++) {
                    const idx_a = contourStartVertexCount + i * numPoints + j
                    const idx_b =
                        contourStartVertexCount +
                        i * numPoints +
                        ((j + 1) % numPoints)
                    const idx_c =
                        contourStartVertexCount +
                        (i + 1) * numPoints +
                        ((j + 1) % numPoints)
                    const idx_d =
                        contourStartVertexCount + (i + 1) * numPoints + j

                    if (!reverseWinding) {
                        indices.push(idx_a, idx_d, idx_c)
                        indices.push(idx_a, idx_c, idx_b)
                    } else {
                        indices.push(idx_a, idx_b, idx_c)
                        indices.push(idx_a, idx_c, idx_d)
                    }
                }
            }
        }

        // Extrude main outline and then all holes
        extrudeContour(contourPoints, false)
        for (const hole of holePoints) {
            extrudeContour(hole, false)
        }

        // --- 6. Finalize Geometry (Indexed BufferGeometry) ---
        geometry.setIndex(indices)
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(vertices, 3)
        )

        //<-- CRITICAL STEP: Set the UV attribute
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

        geometry.computeVertexNormals()

        //return geometry
        return new THREE.Mesh(geometry, defaultMaterial.clone())
    }

    for (const shape of shapes) {
        meshes.push(genFromShape(shape))
    }

    // Return the array of meshes.
    return meshes
}

///////////////////////////////////

//*/

// === Multi-Argument CSG Operations (Corrected) ===
function union(...target) {
    //...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length === 0) return null
    if (meshes.length === 1) return meshes[0]
    const brushA = new Brush(meshes[0].geometry, meshes[0].material)
    brushA.position.copy(meshes[0].position)
    brushA.rotation.copy(meshes[0].rotation)
    brushA.scale.copy(meshes[0].scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (let i = 1; i < meshes.length; i++) {
        const mesh = meshes[i]
        const brushB = new Brush(mesh.geometry, mesh.material)
        brushB.position.copy(mesh.position)
        brushB.rotation.copy(mesh.rotation)
        brushB.scale.copy(mesh.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, ADDITION)
    }
    return result
}

function difference(meshes, ...target) {
    //...subMeshes) {
    var mainMesh
    if (Array.isArray(meshes) || typeof item === 'object') {
        mainMesh = union(meshes)
    } else {
        mainMesh = meshes
    }

    var subMeshes = []

    applyToMesh(target, (item) => {
        subMeshes.push(item)
    })

    if (!mainMesh || subMeshes.length === 0)
        throw new Error('Difference: need base and one or more subtrahends')
    const brushA = new Brush(mainMesh.geometry, mainMesh.material)
    brushA.position.copy(mainMesh.position)
    brushA.rotation.copy(mainMesh.rotation)
    brushA.scale.copy(mainMesh.scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (const sub of subMeshes) {
        const brushB = new Brush(sub.geometry, sub.material)
        brushB.position.copy(sub.position)
        brushB.rotation.copy(sub.rotation)
        brushB.scale.copy(sub.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, SUBTRACTION)
    }
    return result

    //return new THREE.Mesh(result.geometry, defaultMaterial.clone());
}

function intersect(...target) {
    //...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length < 2)
        throw new Error('Intersect requires at least 2 meshes')
    const brushA = new Brush(meshes[0].geometry, meshes[0].material)
    brushA.position.copy(meshes[0].position)
    brushA.rotation.copy(meshes[0].rotation)
    brushA.scale.copy(meshes[0].scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (let i = 1; i < meshes.length; i++) {
        const mesh = meshes[i]
        const brushB = new Brush(mesh.geometry, mesh.material)
        brushB.position.copy(mesh.position)
        brushB.rotation.copy(mesh.rotation)
        brushB.scale.copy(mesh.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, INTERSECTION)
    }
    return result
}

/**
 * Computes the symmetric difference of two or more meshes.
 * This operation returns the parts of the meshes that do not overlap.
 *
 * @param {THREE.Mesh|Brush|Array|Object} target The mesh(es) to operate on.
 * @returns {THREE.Mesh|Brush} The resulting mesh representing the symmetric difference.
 */
function inverseIntersect(...target) {
    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length < 2) {
        throw new Error('Symmetric difference requires at least 2 meshes.')
    }

    // Step 1: Get the intersection of all meshes.
    const intersectionResult = intersect(meshes)

    // Step 2: Subtract the intersection from the union of all meshes.
    const unionResult = union(meshes)

    // The result is the union of all parts that don't overlap.
    const result = difference(unionResult, [intersectionResult])

    return result
}

/**
 * Subdivides a mesh's geometry to increase its resolution.
 * This function iteratively subdivides faces until all edge lengths are below the specified resolution.
 *
 * @param {object} config - Configuration object with a 'resolution' property.
 * @param {number} config.resolution - The maximum desired edge length. A lower value means more detail.
 * @param {THREE.Mesh} target - The mesh to subdivide.
 * @returns {THREE.Mesh} The subdivided mesh.
 */
function subdivide({ resolution = 0.2 }, ...target) {
    applyToMesh(target, (item) => {
        let geometry = item.geometry
        if (!geometry.isBufferGeometry || !geometry.index) {
            console.error('Subdivide requires indexed BufferGeometry.')
            return
        }

        let needsSubdivision = true
        let iteration = 0
        const maxIterations = 10 // Safety break to prevent infinite loops

        while (needsSubdivision && iteration < maxIterations) {
            needsSubdivision = false
            const positions = geometry.attributes.position.array
            const indices = geometry.getIndex().array

            // Using a Map to store unique new vertices to avoid duplicates
            const vertexMap = new Map()
            const getMidpoint = (idxA, idxB) => {
                const key = `${Math.min(idxA, idxB)}_${Math.max(idxA, idxB)}`
                if (vertexMap.has(key)) {
                    return vertexMap.get(key)
                }

                const a = new THREE.Vector3().fromArray(positions, idxA * 3)
                const b = new THREE.Vector3().fromArray(positions, idxB * 3)
                const midpoint = a.lerp(b, 0.5)

                const newIdx = positions.length / 3 + vertexMap.size // Calculate the new index
                vertexMap.set(key, { index: newIdx, position: midpoint })
                return vertexMap.get(key)
            }

            const newIndices = []
            for (let i = 0; i < indices.length; i += 3) {
                const iA = indices[i]
                const iB = indices[i + 1]
                const iC = indices[i + 2]

                const posA = new THREE.Vector3().fromArray(positions, iA * 3)
                const posB = new THREE.Vector3().fromArray(positions, iB * 3)
                const posC = new THREE.Vector3().fromArray(positions, iC * 3)

                const edgeAB_length = posA.distanceTo(posB)
                const edgeBC_length = posB.distanceTo(posC)
                const edgeCA_length = posC.distanceTo(posA)

                if (
                    edgeAB_length > resolution ||
                    edgeBC_length > resolution ||
                    edgeCA_length > resolution
                ) {
                    needsSubdivision = true

                    const midAB = getMidpoint(iA, iB)
                    const midBC = getMidpoint(iB, iC)
                    const midCA = getMidpoint(iC, iA)

                    // Add the 4 new triangles
                    newIndices.push(iA, midAB.index, midCA.index)
                    newIndices.push(iB, midBC.index, midAB.index)
                    newIndices.push(iC, midCA.index, midBC.index)
                    newIndices.push(midAB.index, midBC.index, midCA.index)
                } else {
                    newIndices.push(iA, iB, iC)
                }
            }

            if (needsSubdivision) {
                const newPositionsArray = Array.from(positions)
                for (const midpoint of vertexMap.values()) {
                    newPositionsArray.push(
                        midpoint.position.x,
                        midpoint.position.y,
                        midpoint.position.z
                    )
                }

                const newGeometry = new THREE.BufferGeometry()
                newGeometry.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(newPositionsArray, 3)
                )
                newGeometry.setIndex(
                    new THREE.Uint32BufferAttribute(newIndices, 1)
                )
                newGeometry.computeVertexNormals()

                geometry.dispose()
                geometry = newGeometry
                item.geometry = geometry
            }
            iteration++
        }
        item.geometry.computeVertexNormals() // Final compute for clean normals
    })
    return target
}

// --- New `scaleTo` Function ---
function scaleTo(config = {}, ...target) {
    applyToMesh(target, (item) => {
        let geo = item.geometry
        geo.computeBoundingBox()
        let size = new THREE.Vector3()
        geo.boundingBox.getSize(size)

        //console.log("size" + size.x + " " + size.z +" "+size.y);

        let sizeto = 1

        if (config.z != undefined) {
            sizeto = config.z / size.z
        } else if (config.y != undefined) {
            sizeto = config.y / size.y
        } else if (config.x != undefined) {
            sizeto = config.x / size.x
        }

        //console.log("here: " + sx + " " + sy + " " + sz)
        geo.scale(sizeto, sizeto, sizeto)
    })

    return target
}

function scaleAdd(config = {}, ...target) {
    applyToMesh(target, (item) => {
        let geo = item.geometry
        geo.computeBoundingBox()
        let size = new THREE.Vector3()
        geo.boundingBox.getSize(size)

        let scaleX = 1
        let scaleY = 1
        let scaleZ = 1

        if (config.x != undefined) {
            scaleX = (size.x + config.x) / size.x
        }

        if (config.y != undefined) {
            scaleY = (size.y + config.y) / size.y
        }

        if (config.z != undefined) {
            scaleZ = (size.z + config.z) / size.z
        }

        geo.scale(scaleX, scaleY, scaleZ)
    })

    return target
}

function show(...target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = true
    })
    return target
}

function hide(...target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = false
    })
    return target
}

/**
 * Calculates the collective world-space bounding box for an array of THREE.Object3D objects.
 * NOTE: This function requires that the THREE namespace (e.g., THREE.Box3, THREE.Vector3)
 * is available in the execution scope (meaning you must have imported Three.js).
 *
 * @param {THREE.Object3D[]} objectsArray - An array of Three.js objects (e.g., Meshes or Brushes).
 * @returns {{min: THREE.Vector3, max: THREE.Vector3} | null} The combined bounding box in world coordinates, or null if the array is empty/invalid.
 */
function boundingBox(...target) {
    //var objectsArray=[];
	
	
	
    const masterBox = new THREE.Box3()
	

    applyToMesh(target, (item) => {
        //objectsArray.push(item)
        item.geometry.computeBoundingBox()
        // 2. Calculate the object's world-space bounding box (tempBox).
        const tempBox = new THREE.Box3().setFromObject(item)
		
        // 3. Expand the master box to include the temporary box.
        masterBox.union(tempBox)
		
		
    });
	
	

    if (masterBox.isEmpty()) {
        console.warn(
            'Combined bounding box calculation resulted in an empty box.'
        )
        return null
    }

    // Return the result with min and max vectors.
    //3d printer cordinates.
	
    return {
        min: {
            x: masterBox.min.x,
            y: masterBox.min.y,
            z: masterBox.min.z
        },
        max: {
            x: masterBox.max.x,
            y: masterBox.max.y,
            z: masterBox.max.z
        }
		
    }
}

/**
 * Calculates the bounding box of a path by first flattening curves
 * into line segments using path2d.
 * * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} An object containing the min and max {x, y} coordinates.
 */
function boundingBoxPath(pathObject) {
    // 1. Flatten the path using path2d to ensure all segments are 'm' or 'l'
    const { path: flattenedPath } = path2d(pathObject)

    // Initialize min/max values
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    // 2. Iterate through the flattened path
    let i = 0
    while (i < flattenedPath.length) {
        const command = flattenedPath[i]
        i++

        if (command === 'm' || command === 'l') {
            const x = flattenedPath[i]
            const y = flattenedPath[i + 1]

            // Update min/max
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)

            i += 2
        } else if (command === 'n' || command === 'r' || command === 's') {
            // Skip non-coordinate commands (n: 1 arg, r: 1 arg, s: 2 args)
            const numArgs =
                command === 'n' || command === 'r' ? 1 : command === 's' ? 2 : 0
            i += numArgs
        } else {
            // Since path2d should only return 'm', 'l', 'n', 'r', 's',
            // any other command here is an error or a command with arguments
            // that path2d failed to remove/flatten.
            // In a robust implementation, you might log a warning or handle
            // the coordinate counts for the original commands (e.g., q, c, x).
            // For this design, we trust path2d.
            break
        }
    }

    // 3. Return the bounding box object
    return {
        min: { x: minX, y: minY },
        max: { x: maxX, y: maxY }
    }
}

// Function definitions for 'boundingBox', 'align', 'translate', and 'applyToMesh'
// are assumed to be available in the execution scope.

/**
 * Aligns and translates target objects relative to a primary reference object (obj)
 * based on a three-character command structure (e.g., 'ttx' = Top-of-Obj, Top-of-Target in X).
 *
 * * --- AXIS COORDINATE SYSTEM (Z-UP BOUNDS LOGIC) ---
 * The bounding box calculation follows a standard Z-Up orientation.
 *
 * * --- COMMAND STRUCTURE [REF-ANCHOR][TARGET-ALIGN][AXIS] ---
 *
 * 1. REF-ANCHOR (Reference Object Boundary):
 * - 't': **Top/Min** boundary on X/Y axes, **Top/Max** boundary on Z axis (The "highest" value in the Z-Up system).
 * - 'b': **Bottom/Max** boundary on X/Y axes, **Bottom/Min** boundary on Z axis (The "lowest" value in the Z-Up system).
 * - 'c': **Center** of the reference object.
 *
 * * 2. TARGET-ALIGN (Target Object Alignment Point):
 * - 't': Aligns the target's **Top/Min** boundary on X/Y axes, **Top/Max** boundary on Z axis.
 * - 'b': Aligns the target's **Bottom/Max** boundary on X/Y axes, **Bottom/Min** boundary on Z axis.
 * - 'c': Aligns the target's **Center**.
 *
 * * 3. AXIS (Placement Axis):
 * - 'x': X-axis (Lateral)
 * - 'y': Y-axis (Depth/Lateral)
 * - 'z': Z-axis (Vertical / Up-Down)
 *
 * * --- ALL SUPPORTED COMMANDS ---
 * * | X-Axis (Lateral) | Y-Axis (Depth/Lateral) | Z-Axis (Vertical) |
 * | :--------------- | :--------------------- | :---------------- |
 * | ttx, tbx, tcx    | tty, tby, tcy          | ttz, tbz, tcz     |
 * | btx, bbx, bcx    | bty, bby, bcy          | btz, bbz, bcz     |
 * | ctx, cbx, ccx    | cty, cby, ccy          | ctz, cbz, ccz     |
 *
 * * @param {object} offsets - Commands defining the desired alignment/offset relative to 'obj'.
 * e.g., { 'ttx': 10 } (Aligns obj's min-X with target's min-X, then adds a +10 offset)
 * @param {object} obj - The primary reference object. This object's position remains unchanged.
 * @param {...object} target - The objects to be moved (aligned and translated).
 */
function placement(offsets = {}, obj, ...target) {
	const objBounds = boundingBox(obj)
	for(var i=0; i< target.length;i++){
		_placement(objBounds, offsets, obj, target[i])
	}
}
function _placement(objBounds, offsets = {}, obj, ...target) {
    if (!obj) {
        PrintError(
            'Placement function requires a valid reference object (obj).'
        )
        return []
    }

    // [ ... function body from the previous response ... ]

    // 1. Calculate the Z-up world bounding box of the reference object (obj).
    //const objBounds = boundingBox(obj)
    const targetBounds = boundingBox(...target)
    //PrintLog(JSON.stringify(objBounds))
    //PrintLog(JSON.stringify(objBounds))

    if (!objBounds) {
        PrintWarn(
            'Reference object bounding box is empty, cannot place target.'
        )
        return
    }
    if (!targetBounds) {
        PrintWarn(
            'Reference targets bounding box is empty, cannot place target.'
        )
        return
    }

    // 2. Process the first valid command in the offsets object
    var ox, oy, oz
    var tx, ty, tz
    var xx, yy, zz
    xx = yy = zz = 0

    for (const cmd in offsets) {
        if (offsets.hasOwnProperty(cmd)) {
            const offsetValue = offsets[cmd]

            // Command structure: [Obj-Anchor][Target-Align][Axis]
            const objAnchor = cmd[0]
            const targetAnchor = cmd[1]
            const axisLetter = cmd[2]

            if (axisLetter === 'x') {
                xx = offsetValue
                if (objAnchor == 'l') {
                    ox = objBounds.min.x
                } else if (objAnchor === 'c') {
                    ox = (objBounds.min.x + objBounds.max.x) / 2
                } else if (objAnchor == 'r') {
                    ox = objBounds.max.x
                }

                if (targetAnchor == 'l') {
                    tx = targetBounds.min.x
                } else if (targetAnchor === 'c') {
                    tx = (targetBounds.min.x + targetBounds.max.x) / 2
                } else if (targetAnchor == 'r') {
                    tx = targetBounds.max.x
                }
            } else if (axisLetter === 'y') {
                yy = offsetValue
                if (objAnchor == 'd') {
                    oy = objBounds.min.y
                } else if (objAnchor === 'c') {
                    oy = (objBounds.min.y + objBounds.max.y) / 2
                } else if (objAnchor == 'u') {
                    oy = objBounds.max.y
                }

                if (targetAnchor == 'd') {
                    ty = targetBounds.min.y
                } else if (targetAnchor === 'c') {
                    ty = (targetBounds.min.y + targetBounds.max.y) / 2
                } else if (targetAnchor == 'u') {
                    ty = targetBounds.max.y
                }
            } else if (axisLetter === 'z') {
                zz = offsetValue
                if (objAnchor == 'b') {
                    oz = objBounds.min.z
                } else if (objAnchor === 'c') {
                    oz = (objBounds.min.z + objBounds.max.z) / 2
                } else if (objAnchor == 't') {
                    oz = objBounds.max.z
                }

                if (targetAnchor == 'b') {
                    tz = targetBounds.min.z
                } else if (targetAnchor === 'c') {
                    tz = (targetBounds.min.z + targetBounds.max.z) / 2
                } else if (targetAnchor == 't') {
                    tz = targetBounds.max.z
                }
            }
        }
    }

    if (
        ox === undefined ||
        oy === undefined ||
        oz === undefined ||
        tx === undefined ||
        ty === undefined ||
        tz === undefined
    ) {
        PrintError('All placment offsets need to be defined.')
        return
    }
	
    translate([ox - tx + xx, oy - ty + yy, oz - tz + zz], ...target)
	
	
    return [obj, ...target]
}

/**
 * Translates a path data object.
 * @param {Array<number>} offset - An array containing the [x, y] offset.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with translated coordinates.
 */
function translatePath([x, y], pathObject) {
    //PrintLog("x:"+x, "y:"+y)
    //PrintLog("here1:"+JSON.stringify(pathObject))

    const newPath = []
    let i = 0
    while (i < pathObject._path.length) {
        const command = pathObject._path[i]
        newPath.push(command)
        i++
        switch (command) {
            // Absolute commands with 1 point: m, l
            case 'm':
            case 'l':
                newPath.push(pathObject._path[i] + x, pathObject._path[i + 1] + y)
                i += 2
                break

            // Absolute commands with 2 points: q, x
            case 'q':
            case 'x':
                newPath.push(
                    pathObject._path[i] + x, // Point 1 X (Control for q, Ctr for x)
                    pathObject._path[i + 1] + y, // Point 1 Y
                    pathObject._path[i + 2] + x, // Point 2 X (End for q, End for x)
                    pathObject._path[i + 3] + y
                )
                i += 4
                break

            // Absolute command with 3 points: c
            case 'c':
                newPath.push(
                    pathObject._path[i] + x, // Control Point 1 X
                    pathObject._path[i + 1] + y, // Control Point 1 Y
                    pathObject._path[i + 2] + x, // Control Point 2 X
                    pathObject._path[i + 3] + y, // Control Point 2 Y
                    pathObject._path[i + 4] + x, // End Point X
                    pathObject._path[i + 5] + y
                )
                i += 6
                break

            // Relative commands: mr, lr, qr, cr, xr
            // Relative coordinates are invariant under translation, so they are pushed as is.
            case 'mr':
            case 'lr': {
                newPath.push(pathObject._path[i], pathObject._path[i + 1])
                i += 2
                break
            }
            case 'qr':
            case 'xr': {
                newPath.push(
                    pathObject._path[i],
                    pathObject._path[i + 1],
                    pathObject._path[i + 2],
                    pathObject._path[i + 3]
                )
                i += 4
                break
            }
            case 'cr': {
                newPath.push(
                    pathObject._path[i],
                    pathObject._path[i + 1],
                    pathObject._path[i + 2],
                    pathObject._path[i + 3],
                    pathObject._path[i + 4],
                    pathObject._path[i + 5]
                )
                i += 6
                break
            }

            case 'n':
            case 'r':
            case 's':
                // Non-coordinate commands
                const numArgs =
                    command === 'n' || command === 'r'
                        ? 1
                        : command === 's'
                        ? 2
                        : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject._path[i + k])
                }
                i += numArgs
                break
            default:
                break
        }
    }
	
	pathObject.path(newPath);
	return pathObject;
    //return { path: newPath, fn: pathObject.fn }
}

// ----------------------------------------------------------------------------------------------------------------------

/**
 * Rotates a path data object by a given angle around the origin (0,0).
 * @param {number} angle - The rotation angle (in degrees, as the original conversion to radians is preserved).
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with rotated coordinates.
 */
function rotatePath(angle, pathObject) {
    const newPath = []
    // Angle conversion (assuming angle is in degrees based on original code)
    const rotationAngle = (angle / 180) * Math.PI
    const cos = Math.cos(rotationAngle)
    const sin = Math.sin(rotationAngle)
    let i = 0

    // Helper function for rotation: x' = x cos + y sin, y' = -x sin + y cos
    const rotate = (x, y) => [x * cos + y * sin, -x * sin + y * cos]

    while (i < pathObject._path.length) {
        const command = pathObject._path[i]
        newPath.push(command)
        i++
        let x, y, x1, y1, x2, y2, rotated

        switch (command) {
            // Commands with one point: m, mr, l, lr (Absolute and Relative points must be rotated)
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                x = pathObject._path[i]
                y = pathObject._path[i + 1]
                rotated = rotate(x, y)
                newPath.push(rotated[0], rotated[1])
                i += 2
                break

            // Commands with two points: q, qr, x, xr (Absolute and Relative points must be rotated)
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                x1 = pathObject._path[i] // Point 1 X
                y1 = pathObject._path[i + 1] // Point 1 Y
                x = pathObject._path[i + 2] // Point 2 X
                y = pathObject._path[i + 3] // Point 2 Y

                const rotated1 = rotate(x1, y1)
                const rotatedEnd = rotate(x, y)

                newPath.push(
                    rotated1[0],
                    rotated1[1], // Point 1 (Control/Center)
                    rotatedEnd[0],
                    rotatedEnd[1] // Point 2 (End)
                )
                i += 4
                break

            // Commands with three points: c, cr (Absolute and Relative points must be rotated)
            case 'c':
            case 'cr':
                x1 = pathObject._path[i] // Control Point 1 X
                y1 = pathObject._path[i + 1] // Control Point 1 Y
                x2 = pathObject._path[i + 2] // Control Point 2 X
                y2 = pathObject._path[i + 3] // Control Point 2 Y
                x = pathObject._path[i + 4] // End Point X
                y = pathObject._path[i + 5] // End Point Y

                const rotatedA = rotate(x1, y1)
                const rotatedB = rotate(x2, y2)
                const rotatedC = rotate(x, y)

                newPath.push(
                    rotatedA[0],
                    rotatedA[1], // Control Point 1
                    rotatedB[0],
                    rotatedB[1], // Control Point 2
                    rotatedC[0],
                    rotatedC[1] // End Point
                )
                i += 6
                break

            case 'n':
            case 'r':
            case 's':
                // Non-coordinate commands
                const numArgs =
                    command === 'n' || command === 'r'
                        ? 1
                        : command === 's'
                        ? 2
                        : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject._path[i + k])
                }
                i += numArgs
                break
            default:
                break
        }
    }
	
	pathObject.path(newPath)
    //return { path: newPath, fn: pathObject.fn }
}

/**
 * Scales a path data object by a given factor.
 * @param {Array<number>} scaleFactors - An array containing the [scaleX, scaleY] factors.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with scaled coordinates.
 */
function scalePath([scaleX, scaleY], pathObject) {
    const newPath = []
    let i = 0

    // Helper function to scale a single coordinate pair
    const scalePoint = (x, y) => [x * scaleX, y * scaleY]

    while (i < pathObject._path.length) {
        const command = pathObject._path[i]
        newPath.push(command)
        i++
        let x, y, x1, y1, x2, y2, scaledPoint

        switch (command) {
            // Commands with one point: m, mr, l, lr (Absolute and Relative points are scaled)
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                x = pathObject._path[i]
                y = pathObject._path[i + 1]
                scaledPoint = scalePoint(x, y)
                newPath.push(scaledPoint[0], scaledPoint[1])
                i += 2
                break

            // Commands with two points: q, qr, x, xr (Absolute and Relative points are scaled)
            case 'q':
            case 'qr':
            case 'x': // Absolute Arc with 3 points: P0 (cp), P1 (Ctr), P2 (End). Arguments are P1, P2.
            case 'xr': // Relative Arc with 3 points. Arguments are P1_rel, P2_rel.
                x1 = pathObject._path[i] // Point 1 X
                y1 = pathObject._path[i + 1] // Point 1 Y
                x = pathObject._path[i + 2] // Point 2 X
                y = pathObject._path[i + 3] // Point 2 Y

                const scaled1 = scalePoint(x1, y1)
                const scaledEnd = scalePoint(x, y)

                newPath.push(
                    scaled1[0],
                    scaled1[1], // Point 1 (Control/Center)
                    scaledEnd[0],
                    scaledEnd[1] // Point 2 (End)
                )
                i += 4
                break

            // Commands with three points: c, cr (Absolute and Relative points are scaled)
            case 'c':
            case 'cr':
                x1 = pathObject._path[i] // Control Point 1 X
                y1 = pathObject._path[i + 1] // Control Point 1 Y
                x2 = pathObject._path[i + 2] // Control Point 2 X
                y2 = pathObject._path[i + 3] // Control Point 2 Y
                x = pathObject._path[i + 4] // End Point X
                y = pathObject._path[i + 5] // End Point Y

                const scaledA = scalePoint(x1, y1)
                const scaledB = scalePoint(x2, y2)
                const scaledC = scalePoint(x, y)

                newPath.push(
                    scaledA[0],
                    scaledA[1], // Control Point 1
                    scaledB[0],
                    scaledB[1], // Control Point 2
                    scaledC[0],
                    scaledC[1] // End Point
                )
                i += 6
                break

            // Elliptical Arc commands (a, e): center and radii are scaled
            case 'a':
            case 'e':
                const centerX = pathObject._path[i]
                const centerY = pathObject._path[i + 1]
                const radiusX = pathObject._path[i + 2]
                const radiusY = pathObject._path[i + 3]

                newPath.push(
                    centerX * scaleX, // Scaled Center X
                    centerY * scaleY, // Scaled Center Y
                    radiusX * scaleX, // Scaled Radius X
                    radiusY * scaleY, // Scaled Radius Y
                    pathObject.path[i + 4], // Start Angle (Angles are invariant to uniform scaling)
                    pathObject.path[i + 5], // End Angle
                    ...(command === 'e' ? [pathObject._path[i + 6]] : []) // flags
                )
                i += command === 'a' ? 6 : 7
                break

            // Non-coordinate commands (n, r, s): push the value(s) as is
            case 'n':
            case 'r':
            case 's':
                const numArgs =
                    command === 'n' || command === 'r'
                        ? 1
                        : command === 's'
                        ? 2
                        : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject._path[i + k])
                }
                i += numArgs
                break

            default:
                break
        }
    }
	
	pathObject.path(newPath)
	
    //return { path: newPath, fn: pathObject.fn }
}

/**
 * Scales a path data object to a specific dimension.
 * @param {object} config - The target dimensions. Can include x or y.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object scaled to the target dimensions.
 */
function scaleToPath(config = {}, pathObject) {
    const bbox = pathObject.boundingBox();//boundingBoxPath(pathObject)
    const currentWidth = bbox.max.x - bbox.min.x
    const currentHeight = bbox.max.y - bbox.min.y
	
	if(config.x=== undefined && config.y === undefined) {
		return;	
	}
	
    var scaleFactorX;
	var scaleFactorY;
    if (config.x !== undefined && currentWidth > 0) {
        scaleFactorX = config.x / currentWidth
		if(config.y===undefined) scaleFactorY=scaleFactorX
    } 
	if (config.y !== undefined && currentHeight > 0) {
        scaleFactorY = config.y / currentHeight
		if(config.x===undefined) scaleFactorX=scaleFactorY
    }
	
    scalePath([scaleFactorX, scaleFactorY], pathObject)
}

/**
 * Scales a path data object by adding a dimension to its bounding box.
 * @param {object} config - The dimensions to add. Can include x or y.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object scaled by the added dimensions.
 */
function scaleAddPath(config = {}, pathObject) {
    const bbox = pathObject.boundingBox()//boundingBoxPath(pathObject)
    const currentWidth = bbox.max.x - bbox.min.x
    const currentHeight = bbox.max.y - bbox.min.y

    let scaleX = 1
    let scaleY = 1

    if (config.x !== undefined && currentWidth > 0) {
        scaleX = (currentWidth + config.x) / currentWidth
    }

    if (config.y !== undefined && currentHeight > 0) {
        scaleY = (currentHeight + config.y) / currentHeight
    }

    scalePath([scaleX, scaleY], pathObject)
}

/**
 * Aligns a path data object based on its bounding box.
 * @param {object} config - An object with alignment properties (e.g., {bx: 10, cy: 0}).
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object that is aligned.
 */
function alignPath(config = {}, pathObject) {
    const bbox = pathObject.boundingBox()//boundingBoxPath(pathObject)
    //
    const currentCx = (bbox.min.x + bbox.max.x) / 2
    const currentCy = (bbox.min.y + bbox.max.y) / 2

    let offsetX = 0
    let offsetY = 0

    // Determine the X offset using bx, tx, or cx
    if (config.bx !== undefined) {
        offsetX = config.bx - bbox.minX
    } else if (config.tx !== undefined) {
        offsetX = config.tx - bbox.maxX
    } else if (config.cx !== undefined) {
        offsetX = config.cx - currentCx
    }

    // Determine the Y offset using by, ty, or cy
    if (config.by !== undefined) {
        offsetY = config.by - bbox.minY
    } else if (config.ty !== undefined) {
        offsetY = config.ty - bbox.maxY
    } else if (config.cy !== undefined) {
        offsetY = config.cy - currentCy
    }
	
    translatePath([offsetX, offsetY], pathObject)
}

/**
 * Creates a THREE.Shape from a custom SVG-like path data format.
 * @param {object} shapeData - The data object containing path and fn.
 * @returns {Array<THREE.Shape>} An array of constructed Three.js shape objects.
 */
function shape(shapeDataPath) {
    var shapeData = path2d(shapeDataPath)
    //jlog("shapeData",shapeData)
    const rawPath = shapeData.path
    const allPaths = []

    // Get fn from input data
    const fnValue = shapeData.fn || 30 // Use provided fn, or default to 30

    function getBoundingBox(path) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < path.length) {
            const command = path[i]
            i++

            switch (command) {
                case 'm':
                case 'l':
                    currentX = path[i]
                    currentY = path[i + 1]
                    minX = Math.min(minX, currentX)
                    minY = Math.min(minY, currentY)
                    maxX = Math.max(maxX, currentX)
                    maxY = Math.max(maxY, currentY)
                    i += 2
                    break
            }
        }
        return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) }
    }

    function isInside(boxA, boxB) {
        const epsilon = 1e-6
        return (
            boxA.minX >= boxB.minX - epsilon &&
            boxA.maxX <= boxB.maxX + epsilon &&
            boxA.minY >= boxB.minY - epsilon &&
            boxA.maxY <= boxB.maxY + epsilon
        )
    }

    function getTestPoint(path) {
        let i = 0
        while (i < path.length) {
            const command = path[i]
            if (command === 'm' || command === 'l') {
                return { x: path[i + 1], y: path[i + 2] }
            }
            i++
        }
        return { x: 0, y: 0 }
    }

    function scanlineIsInside(point, testPath) {
        if (!testPath || testPath.length === 0) {
            return false
        }

        let intersections = 0
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < testPath.length) {
            const command = testPath[i]
            i++

            if (command === 'm') {
                currentX = testPath[i]
                currentY = testPath[i + 1]
                i += 2
            } else if (command === 'l') {
                const nextX = testPath[i]
                const nextY = testPath[i + 1]

                if (
                    ((currentY <= point.y && nextY > point.y) ||
                        (currentY > point.y && nextY <= point.y)) &&
                    point.x <
                        ((nextX - currentX) * (point.y - currentY)) /
                            (nextY - currentY) +
                            currentX
                ) {
                    intersections++
                }

                currentX = nextX
                currentY = nextY
                i += 2
            }
        }
        return intersections % 2 === 1
    }

    function parseCommands(pathArray, threeObject) {
        let i = 0
        while (i < pathArray.length) {
            const command = pathArray[i]
            i++

            switch (command) {
                case 'm':
                    threeObject.moveTo(pathArray[i + 1], -pathArray[i])
                    i += 2
                    break
                case 'l':
                    threeObject.lineTo(pathArray[i + 1], -pathArray[i])
                    i += 2
                    break
            }
        }
    }

    // Step 1: Deconstruct raw path into individual sub-paths and get bounding boxes.
    let currentPath = []
    for (let i = 0; i < rawPath.length; ) {
        const command = rawPath[i]
        if (command === 'm' && currentPath.length > 0) {
            allPaths.push({
                path: currentPath,
                box: getBoundingBox(currentPath),
                children: []
            })
            currentPath = []
        }
        let commandLength = 0
        switch (command) {
            case 'm':
            case 'l':
                commandLength = 3
                break
            default:
                commandLength = 1
        }
        for (let j = 0; j < commandLength && i < rawPath.length; j++) {
            currentPath.push(rawPath[i])
            i++
        }
    }
    if (currentPath.length > 0) {
        allPaths.push({
            path: currentPath,
            box: getBoundingBox(currentPath),
            children: []
        })
    }

    // Step 2: Build parent-child hierarchy using bounding box containment.
    const hierarchy = []
    allPaths.sort((a, b) => a.box.area - b.box.area)

    // New Step 1.5: Remove duplicate paths
    const uniquePaths = []
    const pathStrings = new Set()

    allPaths.forEach((pathObj) => {
        const pathStr = JSON.stringify(pathObj.path)
        if (!pathStrings.has(pathStr)) {
            uniquePaths.push(pathObj)
            pathStrings.add(pathStr)
        }
    })

    for (let i = 0; i < uniquePaths.length; i++) {
        const childPath = uniquePaths[i]
        let parent = null
        for (let j = i + 1; j < uniquePaths.length; j++) {
            const potentialParent = uniquePaths[j]
            if (isInside(childPath.box, potentialParent.box)) {
                parent = potentialParent
                break
            }
        }
        if (parent) {
            parent.children.push(childPath)
        } else {
            hierarchy.push(childPath)
        }
    }

    // Step 3: Classify paths and build THREE.Shapes using recursion.
    const finalShapes = []

    /**
     * @param {object} pathObj - The current path object from the hierarchy.
     * @param {THREE.Shape} parentThreeShape - The THREE.Shape object of the immediate solid parent.
     * @param {boolean} isParentHole - True if the immediate parent path is a hole.
     */
    function processPath(pathObj, parentThreeShape, isParentHole) {
        const testPoint = getTestPoint(pathObj.path)
        const isInsideImmediateParent = scanlineIsInside(
            testPoint,
            pathObj.parent ? pathObj.parent.path : null
        )

        // The classification flips based on whether the parent is a hole.
        const isHole = isInsideImmediateParent !== isParentHole

        if (isHole) {
            // This path is a hole, so add it to the parent's holes array.
            const holePath = new THREE.Path()
            parseCommands(pathObj.path, holePath)
            parentThreeShape.holes.push(holePath)

            // Pass the flipped status to children.
            pathObj.children.forEach((child) => {
                child.parent = pathObj
                processPath(child, parentThreeShape, true)
            })
        } else {
            // This path is a solid shape. Create a new THREE.Shape object.
            const solidShape = new THREE.Shape()
            parseCommands(pathObj.path, solidShape)
            solidShape.userData = { fn: fnValue }
            finalShapes.push(solidShape)

            // Children of this solid shape are now potentially holes.
            pathObj.children.forEach((child) => {
                child.parent = pathObj
                processPath(child, solidShape, false)
            })
        }
    }

    // Start processing from the top-level shapes.
    hierarchy.forEach((mainPathObj) => {
        // Top-level shapes are always solid.
        const topLevelShape = new THREE.Shape()
        parseCommands(mainPathObj.path, topLevelShape)
        topLevelShape.userData = { fn: fnValue }
        finalShapes.push(topLevelShape)

        // Process children of this top-level solid shape.
        mainPathObj.children.forEach((child) => {
            child.parent = mainPathObj
            // The top-level parent is not a hole, so pass false.
            processPath(child, topLevelShape, false)
        })
    })

    return finalShapes
}

/**
 * Fetches and loads a font file using opentype.js.
 * @param {string} fontPath - The path to the font file.
 * @returns {Promise<opentype.Font>} A promise that resolves to the loaded font object.
 */
async function font(fontPath) {
    try {
        const buffer = await api.readFileBinary($path(fontPath))
        const font = opentype.parse(buffer)
        PrintLog(`Successfully loaded font from ${fontPath}`)
        return font
    } catch (error) {
        PrintError('Font loading error:', error)
        throw error
    }
}

/**
 * Converts text to a single, flattened path data array using opentype.js.
 * All sub-paths are concatenated into one long array, with 'm' commands
 * marking the start of each new sub-path.
 *
 * @param {object} textData - The object containing font, text, and fontSize.
 * @param {object} textData.font - The opentype.js font object.
 * @param {string} textData.text - The text string to render.
 * @param {number} textData.fontSize - The font size.
 * @returns {Array<string|number>} A single array of all path commands.
 */

function text(textData) {
    let xOffset = 0
    const allCommands = []
    if (textData.fontSize == undefined) {
        textData.fontSize = 3
    }

    // Helper function to convert opentype.js commands to the custom format
    function convertPathToCustomFormat(pathCommands) {
        const customFormatPath = []
        for (const cmd of pathCommands) {
            switch (cmd.type) {
                case 'M':
                    customFormatPath.push('m', cmd.x, -cmd.y)
                    break
                case 'L':
                    customFormatPath.push('l', cmd.x, -cmd.y)
                    break
                case 'Q':
                    customFormatPath.push('q', cmd.x1, -cmd.y1, cmd.x, -cmd.y)
                    break
                case 'C':
                    customFormatPath.push(
                        'c',
                        cmd.x1,
                        -cmd.y1,
                        cmd.x2,
                        -cmd.y2,
                        cmd.x,
                        -cmd.y
                    )
                    break
                // 'Z' commands are implicitly handled by the next 'M'
            }
        }
        return customFormatPath
    }

    const glyphs = textData.font.stringToGlyphs(textData.text)

    for (const glyph of glyphs) {
        const opentypePath = glyph.getPath(xOffset, 0, textData.fontSize)
        const commands = opentypePath.commands
        let currentPathCommands = []

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i]
            if (command.type === 'M' && currentPathCommands.length > 0) {
                allCommands.push(
                    ...convertPathToCustomFormat(currentPathCommands)
                )
                currentPathCommands = [command]
            } else {
                currentPathCommands.push(command)
            }
        }
        if (currentPathCommands.length > 0) {
            allCommands.push(...convertPathToCustomFormat(currentPathCommands))
        }

        xOffset +=
            glyph.advanceWidth * (textData.fontSize / textData.font.unitsPerEm)
    }

    //return { path: allCommands, fn: textData.fn || 40 } // Include fn here for consistency
	return new Path2d().path(allCommands).fn(textData.fn)
}
//*/









// A new ASCII STL parser that ignores normals and just gets vertices
function parseAsciiStl(text) {
    const vertices = []
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('vertex')) {
            const parts = line.split(/\s+/)
            vertices.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            )
        }
    }

    if (vertices.length === 0) {
        throw new Error('No vertices found in the ASCII STL file.')
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))

    // Recalculate normals to ensure they're consistent and correct for the geometry
    geometry.computeVertexNormals()

    // Generate and add UV data
    generateUVs(geometry)

    return geometry
}

// A new binary STL parser that ignores normals and just gets vertices
function parseBinaryStl(buffer) {
    const dataView = new DataView(buffer)
    let offset = 80

    const triangleCount = dataView.getUint32(offset, true)
    offset += 4
	jlog("triangleCount",triangleCount)
    const vertices = new Float32Array(triangleCount * 3 * 3)
    let vertexIndex = 0

    for (let i = 0; i < triangleCount; i++) {
        offset += 12 // Skip the 12-byte normal vector

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        offset += 2 // Skip the 2-byte attribute byte count
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))

    // Recalculate normals
    geometry.computeVertexNormals()

    // Generate and add UV data
    generateUVs(geometry)

    return geometry
}

// Function to generate a simple planar UV map
function generateUVs(geometry) {
    const positions = geometry.attributes.position.array
    const uvArray = new Float32Array((positions.length / 3) * 2)
    const box = new THREE.Box3().setFromBufferAttribute(
        geometry.attributes.position
    )
    const size = box.getSize(new THREE.Vector3())

    // A simple planar projection based on the bounding box
    for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        const z = positions[i * 3 + 2]

        uvArray[i * 2] = (x - box.min.x) / size.x
        uvArray[i * 2 + 1] = (y - box.min.y) / size.y
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2))
}


 // Imports an STL file (binary or ASCII) and returns a three-bvh-csg Brush.
 // @param {string} filePath - The path to the STL file.
 // @returns {Promise<Brush>} A Promise resolving to a Brush object.
async function importStl(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))

        const header = new TextDecoder().decode(buffer.slice(0, 5))
        var geometry

        if (header.toLowerCase() === 'solid') {
            const text = new TextDecoder().decode(buffer)
            geometry = parseAsciiStl(text)
        } else {
            geometry = parseBinaryStl(buffer)
        }

        if (!geometry.attributes.position || !geometry.attributes.uv) {
            throw new Error(
                'Parsed geometry is missing required attributes (position or uv).'
            )
        }
		//jlog("geometry",geometry)
        //const brush = new Brush(geometry);
        //return brush;
        return new THREE.Mesh(geometry, defaultMaterial.clone())
    } catch (error) {
        PrintError('STL loading error:', error)
        throw error
    }
}

//*/

/**
 * Loads a GLB file and returns an array of three-bvh-csg Brush objects.
 * It removes all textures and applies a clone of the default material.
 * @param {string} filePath - The path to the GLB file.
 * @param {THREE.Material} defaultMaterial - The default material to apply to all meshes.
 * @returns {Promise<Brush[]>} A promise that resolves to an array of Brush objects.
 */
async function importGlb(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))
        const loader = new GLTFLoader()

        // Wrap the callback-based loader.parse in a Promise
        const gltf = await new Promise((resolve, reject) => {
            loader.parse(buffer, '', resolve, reject)
        })

        PrintLog(`Successfully loaded GLB from ${filePath}`)

        const brushes = []
        // Traverse the loaded scene to find all meshes
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry

                // Ensure the geometry has all the attributes required by three-bvh-csg
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    PrintWarn(
                        `Mesh in GLB file is missing required attributes. Attempting to generate them.`
                    )

                    // Recalculate normals if they're missing
                    if (!geometry.attributes.normal) {
                        geometry.computeVertexNormals()
                    }

                    // Generate simple planar UVs if they're missing
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                //console.log('here: ' + defaultMaterial)

                // Create a new Brush object from the mesh's geometry and a cloned default material
                const brush = new Brush(geometry, defaultMaterial.clone())

                // Copy the mesh's original transform (position, rotation, scale) to the brush
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)

                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the GLB file.')
        }

        return brushes
    } catch (error) {
        PrintError('GLB loading error:', error)
        throw error
    }
}

async function importObj(filePath) {
    try {
        const text = await api.readFileBinary($path(filePath))
        const loader = new OBJLoader()
        const object = loader.parse(new TextDecoder().decode(text))

        const brushes = []
        object.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    geometry.computeVertexNormals()
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                const brush = new Brush(child.geometry, child.material)
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)
                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the OBJ file.')
        }

        return brushes
    } catch (error) {
        PrintError('OBJ loading error:', error)
        throw error
    }
}

async function importFbx(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))
        const loader = new FBXLoader()
        const object = loader.parse(buffer, '')

        const brushes = []
        object.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    geometry.computeVertexNormals()
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                const brush = new Brush(child.geometry, child.material)
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)
                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the FBX file.')
        }

        return brushes
    } catch (error) {
        PrintError('FBX loading error:', error)
        throw error
    }
}

//*/

// Add a constant for three.js class names for cleaner checks
const THREE_TYPES_TO_CLONE = [
    'Mesh',
    'Shape',
    'Brush',
    'Group',
    'Object3D',
    'BufferAttribute'
]

/**
 * Helper function to perform targeted deep cloning of BufferGeometry properties.
 * This function bypasses the generic property copy for geometry structures.
 * @param {THREE.BufferGeometry} sourceGeometry - The geometry to clone.
 * @returns {THREE.BufferGeometry} The fully cloned geometry.
 */
function cloneGeometryData(sourceGeometry) {
    // 1. Start with the built-in clone (this copies the structure and references)
    const clonedGeometry = sourceGeometry.clone()

    // 2. Explicitly deep clone the index (if it exists)
    // geometry.index is a BufferAttribute, which is handled by the main clone() function.
    if (sourceGeometry.index) {
        clonedGeometry.index = clone(sourceGeometry.index)
    }

    // 3. Explicitly deep clone all attributes (positions, normals, uvs, etc.)
    // These are also BufferAttributes, handled by the main clone() function.
    for (const name in sourceGeometry.attributes) {
        // Ensure only own properties are copied
        if (
            Object.prototype.hasOwnProperty.call(
                sourceGeometry.attributes,
                name
            )
        ) {
            clonedGeometry.attributes[name] = clone(
                sourceGeometry.attributes[name]
            )
        }
    }

    // 4. Copy Bounding Boxes/Spheres (these are simple objects/vectors)
    if (sourceGeometry.boundingBox) {
        clonedGeometry.boundingBox = sourceGeometry.boundingBox.clone()
    }
    if (sourceGeometry.boundingSphere) {
        clonedGeometry.boundingSphere = sourceGeometry.boundingSphere.clone()
    }

    // Other properties like groups, morphAttributes, etc., might also need deep cloning
    // if your application uses them. For core vertex/index data, the above is sufficient.

    return clonedGeometry
}

/**
 * Recursively deep clones a THREE.js object.
 * (Modified to use targeted geometry cloning)
 *
 * @param {THREE.Mesh | THREE.Shape | Brush | Array | Object} source - The object to clone.
 * @returns {THREE.Mesh | THREE.Shape | Brush | Array | Object} The cloned object.
 */
export function clone(source) {
    // 1. Handle primitives
    if (source === null || typeof source !== 'object') {
        return source
    }

    const typeName = source.constructor.name

    // 2. Handle Arrays
    if (Array.isArray(source)) {
        const clonedArray = []
        for (let i = 0; i < source.length; i++) {
            clonedArray[i] = clone(source[i])
        }
        return clonedArray
    }

    // 3. Handle specific THREE.js objects
    if (THREE_TYPES_TO_CLONE.includes(typeName)) {
        // --- CRITICAL CASE: BufferAttribute (for Vertices and Indices data) ---
        if (typeName === 'BufferAttribute') {
            const sourceAttr = source
            // Use BufferAttribute's built-in clone() for the object structure.
            const clonedAttr = sourceAttr.clone()

            // ⚠️ Force the deepest possible copy of the underlying typed array data.
            const dataArray = sourceAttr.array
            const ClonedDataType = dataArray.constructor
            // Create a new ArrayBuffer from the original data
            clonedAttr.array = new ClonedDataType(dataArray)

            return clonedAttr
        }

        // --- Special case: THREE.Mesh (Manual construction using targeted geometry clone) ---
        if (typeName === 'Mesh') {
            const sourceMesh = source
            let clonedGeometry = sourceMesh.geometry
            let clonedMaterial = sourceMesh.material

            // 1. Clone Geometry using the dedicated function
            if (clonedGeometry) {
                clonedGeometry = cloneGeometryData(clonedGeometry)
            }

            // 2. Clone Material(s)
            if (Array.isArray(sourceMesh.material)) {
                clonedMaterial = sourceMesh.material.map((m) => m.clone())
            } else if (
                sourceMesh.material &&
                typeof sourceMesh.material.clone === 'function'
            ) {
                clonedMaterial = sourceMesh.material.clone()
            }

            // 3. Create NEW Mesh instance
            // Assuming THREE is available.
            const clonedObject = new THREE.Mesh(clonedGeometry, clonedMaterial)
            clonedObject.copy(sourceMesh) // Copy object properties (pos/rot/scale/etc)

            // Re-assign cloned components to be absolutely sure
            clonedObject.geometry = clonedGeometry
            clonedObject.material = clonedMaterial

            // 4. Clone children
            for (let i = 0; i < sourceMesh.children.length; i++) {
                clonedObject.add(clone(sourceMesh.children[i]))
            }

            return clonedObject
        }

        // --- Case for Shape/Brush/Group/Object3D ---
        const clonedObject = source.clone()
        // Manually replace children with deep clones
        if (clonedObject.children) {
            clonedObject.children.length = 0
            for (let i = 0; i < source.children.length; i++) {
                clonedObject.add(clone(source.children[i]))
            }
        }
        return clonedObject
    }

    // 4. Handle generic Objects ({} structures)
    if (typeName === 'Object') {
        const clonedObject = {}
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                clonedObject[key] = clone(source[key])
            }
        }
        return clonedObject
    }

    // 5. Fallback
    console.warn(
        `clone: Cannot deep clone object of type: ${typeName}. Returning original reference.`
    )
    return source
}

// Private object containing all exportable functions
// This is a private, self-contained list within the module.
const _exportedFunctions = {
    THREE,
    sphere,
    cube,
    cylinder,
    union,
    difference,
    intersect,
    inverseIntersect,
    subdivide,
    translate,
    rotate,
    scale,
    color,
	expand,
    floor,
    convexHull,
    align,
    convertTo2d,
    convertTo3d,
    arcPath3d,

    Path2d,
    Path3d,
    extrude3d,
    sweep3d,

    linePaths3d, // this is the new linePaths3dEx
    scaleTo,
    scaleAdd,
    show,
    hide,
    boundingBox,
    placement,
    font,
    text,
    translatePath,
    rotatePath,
    boundingBoxPath,
    scalePath,
    scaleToPath,
    scaleAddPath,
    alignPath,
    shape,
    importStl,
    importGlb,
    importObj,
    importFbx,
    clone
}

// --- Revised `ezport` function ---
// This function returns an object containing both the function names and the functions themselves.
function ezport() {
    const funcNames = Object.keys(_exportedFunctions)
    const funcs = Object.values(_exportedFunctions)
    return { names: funcNames, funcs: funcs }
}

// Export only the ezport function
export { ezport }
