// editorCsg.js
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { ezport } from './scadCSG.js'
import { Brush } from 'three-bvh-csg'
import { api } from 'apiCalls'

const exportedCSG = ezport()
const exporter = new STLExporter()
const gltfExporter = new GLTFExporter()

const LAST_PROJECT_PATH_KEY = 'scad_last_project_path'
const LAST_CSG_CONTEXT_KEY = 'scad_last_csg_context_id'
const LAST_EDITOR_CODE_CONTEXT_KEY = 'scad_last_editor_context_id'
const LAST_CONSOLE_HEIGHT_KEY = 'csg-editor-console-height'

const DEFAULT_CSG_PAGE_TITLE = 'Main'
const DEFAULT_CSG_CODE_CONTENT = `
// CSG code goes here
var f1 = await font("/fonts/ClassicRomanCaps.ttf");
var ts= text({
font:f1,
text:"wELCOME!",
fn:30,
fontSize:9
});
alignPath({cx:0,cy:0},ts)
rotatePath(90,ts)
var p1= new Path3d().path([
"s", 1,1,
"m", 0,0, 0,
"s",1.1,1.1,
"l", 0,0, 3
]).fn(30)
return extrude3d(ts, p1);
`
const DEFAULT_CODE_PAGE_TITLE = 'Code'
const DEFAULT_CODE_CODE_CONTENT = '// Include helper functions here'

var csgEditor, editorCodeEditor, openModal, closeModal, createBuildPlate
var resizeRenderer, animate, showView
let scene, groupItems, currentObjects
let isWireframeMode = false

const TOOLBAR_HEIGHT = 40
const MIN_CONSOLE_HEIGHT = 30
const MAX_CONSOLE_HEIGHT_RATIO = 0.8

let project, isInitializing = true

function getNewDefaultProjectData() {
	return {
		csgCode: [{ title: DEFAULT_CSG_PAGE_TITLE, content: DEFAULT_CSG_CODE_CONTENT }],
		editorCode: [{ title: DEFAULT_CODE_PAGE_TITLE, content: DEFAULT_CODE_CODE_CONTENT }],
		meshCache: {}
	}
}

// ========== OPTTEXT INSTANCE HELPERS ==========
function getOptTextInstance(editorElement) {
	if (!editorElement) return null
	return editorElement.querySelector('.opt-text-container-wrapper')
}

function loadPagesIntoEditor(editorElement, pages) {
	const instance = getOptTextInstance(editorElement)
	if (!instance || !instance.dataManager) {
		console.warn('optText instance not found or not initialized')
		return
	}
	
	if (!pages || pages.length === 0) return
	
	const existingContexts = instance.listContexts()
	
	pages.forEach((page, index) => {
		const contextName = page.title || `Page ${index + 1}`
		const content = page.content || ''
		
		if (index < existingContexts.length) {
			const ctx = existingContexts[index]
			instance.switchContext(ctx.id)
			instance.value = content
			if (instance.dataManager.current) {
				instance.dataManager.current.name = contextName
			}
		} else {
			const lines = content.split('\n')
			instance.addContext(contextName, lines, { switchTo: index === 0 })
		}
	})
	
	for (let i = existingContexts.length - 1; i >= pages.length; i--) {
		instance.removeContext(existingContexts[i].id)
	}
	
	if (existingContexts.length > 0) {
		instance.switchContext(existingContexts[0].id)
	}
}

function getPagesFromEditor(editorElement) {
	const instance = getOptTextInstance(editorElement)
	if (!instance || !instance.dataManager) return []
	
	return instance.dataManager.contexts.map(ctx => ({
		title: ctx.name || ctx.id,
		content: ctx.lines.join('\n')
	}))
}

function getActivePageFromEditor(editorElement) {
	const instance = getOptTextInstance(editorElement)
	if (!instance || !instance.dataManager || !instance.dataManager.current) return null
	
	const ctx = instance.dataManager.current
	return {
		title: ctx.name || ctx.id,
		content: ctx.lines.join('\n')
	}
}

function getCurrentContextId(editorElement) {
	const instance = getOptTextInstance(editorElement)
	if (!instance || !instance.dataManager || !instance.dataManager.current) return null
	return instance.dataManager.current.id
}

function switchToContext(editorElement, contextIdOrName) {
	const instance = getOptTextInstance(editorElement)
	if (!instance) return false
	return instance.switchContext(contextIdOrName)
}
// ========== END OPTTEXT INSTANCE HELPERS ==========

// ========== PATH BAR HELPERS ==========
let currentProjectFilePath = null

// ✅ UPDATED: Robust helper to sync the file path with ALL save/load file pickers
function updateFilePickersPath(filePath) {
    if (!filePath) return;
    
    // Broadly target any modal/dialog that might contain a save/load file picker
    // This covers IDs like 'save-code-modal', 'load-code-modal', 'save-modal', etc.
    const targetModals = document.querySelectorAll('[id*="save" i], [id*="load" i], [class*="save" i], [class*="load" i], .modal, .dialog');
    
    targetModals.forEach(modal => {
        // 1. Update initialized file picker wrappers
        const picker = modal.querySelector('.file-picker-container-wrapper');
        if (picker) {
            try {
                // Trigger the property setter defined in filePicker.js
                picker.filePath = filePath;
            } catch(e) {
                console.warn("Failed to set filePath on initialized picker", e);
            }
        }
        
        // 2. Fallback: Update uninitialized <filepicker> tags (if the modal hasn't rendered yet)
        const originalPicker = modal.querySelector('filepicker');
        if (originalPicker) {
            originalPicker.setAttribute('file-path', filePath);
        }
        
        // 3. Auto-fill standard text inputs in Save modals with the filename
        if (modal.id && modal.id.toLowerCase().includes('save')) {
            const saveInput = modal.querySelector('input[type="text"]:not(.file-picker-prompt-input):not(.file-picker-item-name-input)');
            if (saveInput) {
                const fileName = filePath.split('/').pop();
                saveInput.value = fileName;
            }
        }
    });
}

function updatePathBar(textElId, tabContainerId, editorRef) {
	const textEl = document.getElementById(textElId)
	const tabContainer = document.getElementById(tabContainerId)
	if (!textEl) return

	if (tabContainer) {
		const hasTabs = tabContainer.querySelector('.tab') !== null
		tabContainer.classList.toggle('has-tabs', hasTabs)
	}

	if (currentProjectFilePath) {
		textEl.textContent = currentProjectFilePath
		textEl.className = 'path-text has-path'
		textEl.title = currentProjectFilePath
	} else {
		textEl.textContent = 'No project loaded'
		textEl.className = 'path-text no-path'
		textEl.title = ''
	}
}

export function updatePathBars() {
	updatePathBar('csg-path-text', 'csg-tabs', csgEditor)
	updatePathBar('editor-code-path-text', 'editor-code-tabs', editorCodeEditor)
}

export function setProjectFilePath(filePath) {
	currentProjectFilePath = filePath || null
	updatePathBars()
    
    // ✅ Sync the path with the save and load file pickers
    updateFilePickersPath(filePath)
}
// ========== END PATH BAR HELPERS ==========

const applyFilter = (item, checkFunction, applyFunction, ...args) => {
	if (checkFunction(item)) {
		applyFunction(item, ...args)
	} else if (Array.isArray(item)) {
		item.forEach(subItem => applyFilter(subItem, checkFunction, applyFunction, ...args))
	} else if (item !== null && item !== undefined && typeof item === 'object') {
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) {
				const descriptor = Object.getOwnPropertyDescriptor(item, key)
				if (typeof item[key] === 'function') continue
				if (descriptor && (descriptor.get || descriptor.set)) continue
				applyFilter(item[key], checkFunction, applyFunction, ...args)
			}
		}
	}
}

function isMesh(item) { return item && (item instanceof THREE.Mesh || item instanceof Brush) }
function isJsonMesh(item) { return typeof item === 'object' && item !== null && item.$jsonMesh != undefined }
const applyToMesh = (item, applyFunction, ...args) => applyFilter(item, isMesh, applyFunction, ...args)

const cloneFilter = (item, checkFunction, applyFunction, ...args) => {
	if (checkFunction(item)) return applyFunction(item, ...args)
	else if (Array.isArray(item)) {
		const arr = []
		item.forEach(subItem => arr.push(cloneFilter(subItem, checkFunction, applyFunction, ...args)))
		return arr
	} else if (item !== null && item !== undefined && typeof item === 'object') {
		const obj = {}
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) obj[key] = cloneFilter(item[key], checkFunction, applyFunction, ...args)
		}
		return obj
	}
	return item
}

function floatArrayToBase64(floatArray) {
	const uint8Array = new Uint8Array(floatArray.buffer)
	let binaryString = ''
	for (let i = 0; i < uint8Array.length; i++) binaryString += String.fromCharCode(uint8Array[i])
	return btoa(binaryString)
}
function base64ToFloatArray(base64String) {
	const binaryString = atob(base64String)
	const bytes = new Uint8Array(binaryString.length)
	for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
	return new Float32Array(bytes.buffer)
}
function uint16ToBase64(uint16Array) {
	const uint8Array = new Uint8Array(uint16Array.buffer)
	let binaryString = ''
	for (let i = 0; i < uint8Array.length; i++) binaryString += String.fromCharCode(uint8Array[i])
	return btoa(binaryString)
}
function base64ToUint16(base64String) {
	const binaryString = atob(base64String)
	const uint16Array = new Uint16Array(binaryString.length / 2)
	const view = new DataView(uint16Array.buffer)
	for (let i = 0; i < binaryString.length; i++) view.setUint8(i, binaryString.charCodeAt(i))
	return uint16Array
}

globalThis.guid = (() => {
	if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID.bind(window.crypto)
	return function () {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0
			const v = c === 'x' ? r : (r & 0x3) | 0x8
			return v.toString(16)
		})
	}
})()

globalThis.___blobfunctions = globalThis.___blobfunctions || {}
globalThis.blobFunction = function (params, codeString) {
	return new Promise((resolve, reject) => {
		const gid = guid()
		const code = `___blobfunctions['${gid}'] = function(${params.join(",")}){return (async ()=>{${codeString}})();}`
		const codeBlob = new Blob([code], { type: 'text/javascript' })
		const blobUrl = URL.createObjectURL(codeBlob)
		const scriptElement = document.createElement('script')
		scriptElement.src = blobUrl
		const cleanup = (wasSuccessful) => {
			URL.revokeObjectURL(blobUrl)
			if (scriptElement.parentNode) scriptElement.parentNode.removeChild(scriptElement)
			const result = ___blobfunctions[gid]
			delete ___blobfunctions[gid]
			if (wasSuccessful) resolve(result)
			else reject(new Error(`Failed to load/execute Blob script: ${blobUrl}`))
		}
		scriptElement.onload = () => cleanup(true)
		scriptElement.onerror = () => cleanup(false)
		document.body.appendChild(scriptElement)
	})
}

class ScadProject {
	constructor({ csgEditorRef = null, codeEditorRef = null, csgValues = null, codeValues = null, basePath = null } = {}) {
		this.meshCache = {}
		this.codeCache = {}
		this.fileCache = {}
		this._csgEditorRef = csgEditorRef
		this._codeEditorRef = codeEditorRef
		const defaultData = getNewDefaultProjectData()
		this._csgValues = Array.isArray(csgValues) ? csgValues : defaultData.csgCode
		this._codeValues = Array.isArray(codeValues) ? codeValues : defaultData.editorCode
		this.basePath = basePath || null
	}

	get csgValues() {
		const pages = getPagesFromEditor(this._csgEditorRef)
		if (pages.length > 0) return pages
		return this._csgValues || []
	}
	get codeValues() {
		const pages = getPagesFromEditor(this._codeEditorRef)
		if (pages.length > 0) return pages
		return this._codeValues || []
	}

	rebindEditors(csgEditorRef, codeEditorRef) {
		this._csgEditorRef = csgEditorRef
		this._codeEditorRef = codeEditorRef
	}
	setBasePath(bp) { this.basePath = bp || null }

	path(filepath) {
		if (!filepath) return null
		if (filepath.startsWith('/')) return filepath
		const libraryPath = typeof settings !== 'undefined' && settings.libraryPath ? settings.libraryPath : '/csgLib'
		if (filepath.startsWith('$lib/')) return libraryPath + '/' + filepath.substring(5)
		const base = this.basePath ?? (this._csgEditorRef ? this._csgEditorRef.basePath : null)
		if (!base) {
			showAlert('Cannot use relative paths. Load or save a project first.', 'error')
			return null
		}
		const parts = base.split('/').filter(Boolean)
		const fileParts = filepath.split('/')
		for (const part of fileParts) {
			if (part === '..') { if (parts.length > 0) parts.pop() }
			else if (part !== '.' && part !== '') parts.push(part)
		}
		return '/' + parts.join('/')
	}

	async _getOrLoadSubProject(fullPath) {
		if (this.fileCache[fullPath]) return this.fileCache[fullPath]
		try {
			const fileContent = await api.readFile(fullPath)
			const projectData = JSON.parse(fileContent)
			const segs = fullPath.split('/'); segs.pop()
			const subBase = '/' + segs.filter(Boolean).join('/')
			const subProject = new ScadProject({ csgValues: projectData.csgCode || [], codeValues: projectData.editorCode || [], basePath: subBase })
			this.fileCache[fullPath] = subProject
			return subProject
		} catch (err) {
			PrintError(`❌ Failed to load file '${fullPath}':`, err)
			showAlert(`External Project Load Error:\n${err.message}`, 'error')
			return null
		}
	}

	async get(name, filepath = null) {
		if (filepath) {
			const fullPath = this.path(filepath)
			if (!fullPath) return null
			const subProject = await this._getOrLoadSubProject(fullPath)
			if (!subProject) return null
			return await subProject.get(name)
		}
		const idx = this.csgValues.findIndex(p => p.title === name)
		if (idx === -1) { PrintError(`Page '${name}' not found.`); return null }
		const requestedPage = this.csgValues[idx]
		const requestedPageName = requestedPage.title
		if (this.meshCache[requestedPageName] && this.meshCache[requestedPageName].updated) {
			PrintLog(`✅ Loading cached mesh for page: ${requestedPageName}`)
			return this.meshCache[requestedPageName].mesh
		}
		PrintLog(`🔍 Re-evaluating code for page: ${requestedPageName}`)
		try {
			const script = await blobFunction([...exportedCSG.names, 'get', 'include', 'path'], requestedPage.content)
			const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this))
			this.meshCache[requestedPageName] = { mesh: result, updated: true }
			return result
		} catch (err) {
			PrintError(`❌ CSG Error for page '${requestedPageName}':`, err.message, err)
			showAlert(`CSG Error for page '${requestedPageName}':\n${err.message}`, 'error')
			return null
		}
	}

	async include(name, filepath = null) {
		if (filepath) {
			const fullPath = this.path(filepath)
			if (!fullPath) return null
			const subProject = await this._getOrLoadSubProject(fullPath)
			if (!subProject) return null
			return await subProject.include(name)
		}
		const cacheKey = name
		if (this.codeCache[cacheKey] && this.codeCache[cacheKey].updated) return this.codeCache[cacheKey].result
		const pageData = this.codeValues.find(p => p.title === name)
		if (!pageData) { PrintError(`Include error: Page '${name}' not found.`); return null }
		PrintLog(`🔍 Compiling included code for page: ${name}`)
		try {
			const script = await blobFunction([...exportedCSG.names, 'get', 'include', 'path'], pageData.content)
			const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this))
			this.codeCache[cacheKey] = { result, updated: true }
			return result
		} catch (err) {
			PrintError(`❌ Include error for page '${name}':`, err.message, err)
			showAlert(`Include Error for page '${name}':\n${err.message}`, 'error')
			return null
		}
	}

	clearMeshCache(name) { if (this.meshCache[name]) { delete this.meshCache[name]; PrintLog(`✅ Cleared mesh cache for: ${name}`) } }
	clearCodeCache(name) { if (this.codeCache[name]) { delete this.codeCache[name]; PrintLog(`✅ Cleared code cache for: ${name}`) } }
	clearAllCache(groupItems, currentObjects) {
		this.meshCache = {}; this.codeCache = {}; this.fileCache = {}
		currentObjects.forEach(obj => groupItems.remove(obj))
		currentObjects.length = 0
	}
}

function extractMeshData(mesh) {
	try {
		if (!mesh || !mesh.geometry) { console.error('Invalid mesh provided.'); return null }
		const geometry = mesh.geometry, data = {}
		const positionAttribute = geometry.getAttribute('position')
		if (positionAttribute) data.positions = floatArrayToBase64(positionAttribute.array)
		const normalAttribute = geometry.getAttribute('normal')
		if (normalAttribute) data.normals = floatArrayToBase64(normalAttribute.array)
		const indexAttribute = geometry.getIndex()
		if (indexAttribute) data.indices = uint16ToBase64(indexAttribute.array)
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
		data.materials = materials.map(m => ({ color: m.color ? '#' + m.color.getHexString() : '#ffffff', roughness: m.roughness, metalness: m.metalness, side: m.side, flatShading: m.flatShading, type: m.type }))
		data.groups = geometry.groups && geometry.groups.length > 0 ? geometry.groups : []
		data.position = [mesh.position.x, mesh.position.y, mesh.position.z]
		data.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]
		data.scale = [mesh.scale.x, mesh.scale.y, mesh.scale.z]
		return data
	} catch (error) { return null }
}

function recreateMeshFromData(data) {
	try {
		if (!data || !data.positions) return null
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.BufferAttribute(base64ToFloatArray(data.positions), 3))
		if (data.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(base64ToFloatArray(data.normals), 3))
		if (data.indices) geometry.setIndex(new THREE.BufferAttribute(base64ToUint16(data.indices), 1))
		let materials = []
		if (data.materials && data.materials.length > 0) {
			materials = data.materials.map(m => {
				const props = { color: new THREE.Color(m.color), roughness: m.roughness, metalness: m.metalness, side: m.side, flatShading: m.flatShading }
				return m.type === 'MeshBasicMaterial' ? new THREE.MeshBasicMaterial(props) : new THREE.MeshStandardMaterial(props)
			})
			if (data.groups && data.groups.length > 0) data.groups.forEach(group => geometry.addGroup(group.start, group.count, group.materialIndex))
		} else { materials.push(new THREE.MeshStandardMaterial({ color: 0xffcc00 })) }
		const newMesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials)
		if (data.position) newMesh.position.set(...data.position)
		if (data.rotation) newMesh.rotation.set(...data.rotation)
		if (data.scale) newMesh.scale.set(...data.scale)
		return newMesh
	} catch (error) { return null }
}

function updateMainContainerHeight(consoleHeight) {
	const mainContainer = document.getElementById('main-container')
	mainContainer.style.height = `calc(100vh - ${TOOLBAR_HEIGHT}px - ${consoleHeight}px)`
	resizeRenderer()
	const csgInstance = getOptTextInstance(csgEditor)
	const editorInstance = getOptTextInstance(editorCodeEditor)
	if (csgInstance && typeof csgInstance.resize === 'function') csgInstance.resize()
	if (editorInstance && typeof editorInstance.resize === 'function') editorInstance.resize()
}

function saveActiveContextId(editorElement, key) {
	const contextId = getCurrentContextId(editorElement)
	if (contextId) {
		try { localStorage.setItem(key, contextId) }
		catch (e) { PrintWarn(`Failed to save active context ID for ${key}:`, e) }
	}
}

function restoreActiveContextId(editorElement, key) {
	const savedId = localStorage.getItem(key)
	if (savedId) {
		switchToContext(editorElement, savedId)
	}
}

function resetProjectToDefault(path) {
	if (path) PrintWarn(`⚠️ Hard failure. Clearing saved path and resetting to default project.`)
	else PrintLog('Initializing default project content.')
	const defaultData = getNewDefaultProjectData()
	localStorage.removeItem(LAST_PROJECT_PATH_KEY)
	localStorage.removeItem(LAST_CSG_CONTEXT_KEY)
	localStorage.removeItem(LAST_EDITOR_CODE_CONTEXT_KEY)
	if (project) {
		project.clearAllCache(groupItems, currentObjects)
		project.setBasePath(null)
		project._csgValues = defaultData.csgCode
		project._codeValues = defaultData.editorCode
	}
	loadPagesIntoEditor(csgEditor, defaultData.csgCode)
	loadPagesIntoEditor(editorCodeEditor, defaultData.editorCode)
	csgEditor.basePath = null
	isInitializing = true
	setProjectFilePath(null)
	runCSGCode().then(() => { isInitializing = false; PrintLog('Default project loaded and rendered.') })
}

async function autoLoadLastProject() {
	isInitializing = true
	const lastPath = localStorage.getItem(LAST_PROJECT_PATH_KEY)
	if (lastPath) {
		PrintLog(`Attempting to auto-load last project from: ${lastPath}`)
		try {
			const success = await handleLoadFile(null, lastPath)
			if (success) { PrintLog(`✅ Project successfully loaded.`); return }
		} catch (error) { PrintError(`❌ Auto-load failed for path: ${lastPath}.`, error) }
	}
	PrintLog('No previous project path found or load failed. Forcing default project initialization.')
	resetProjectToDefault(null)
}

export async function handleLoadFile(event, filePath) {
	let fileContent, projectData
	try {
		const fileStats = await api.ls(filePath)
		const defaultDataJson = JSON.stringify(getNewDefaultProjectData())
		let fileWasEmpty = false
		if (fileStats && fileStats.size !== undefined && fileStats.size === 0) {
			fileContent = defaultDataJson; fileWasEmpty = true
		} else { fileContent = await api.readFile(filePath) }
		if (!fileWasEmpty && (!fileContent || fileContent.trim().length === 0)) {
			fileContent = defaultDataJson
		}
		projectData = JSON.parse(fileContent)
		const pathSegments = filePath.split('/'); pathSegments.pop()
		const newBasePath = pathSegments.join('/') + '/'
		csgEditor.basePath = newBasePath; globalThis.settings.basePath = newBasePath; project.setBasePath(newBasePath)
		
		if (projectData.csgCode) {
			project._csgValues = projectData.csgCode
			loadPagesIntoEditor(csgEditor, projectData.csgCode)
		}
		if (projectData.editorCode) {
			project._codeValues = projectData.editorCode
			loadPagesIntoEditor(editorCodeEditor, projectData.editorCode)
		}
		
		restoreActiveContextId(csgEditor, LAST_CSG_CONTEXT_KEY)
		restoreActiveContextId(editorCodeEditor, LAST_EDITOR_CODE_CONTEXT_KEY)
		
		if (projectData.meshCache) {
			project.meshCache = cloneFilter(projectData.meshCache, isJsonMesh, (item) => {
				if (item.isBrush) {
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh)
					if (item.$jsonMesh.userData != undefined) mesh.userData = item.$jsonMesh.userData
					return new Brush(mesh)
				} else if (item.isShape) { return null }
				else {
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh)
					if (item.$jsonMesh.userData != undefined) mesh.userData = item.$jsonMesh.userData
					return mesh
				}
			})
		}
		setProjectFilePath(filePath)
		setTimeout(() => {
			const activePage = getActivePageFromEditor(csgEditor)
			if (activePage) runCSGCode()
			isInitializing = false
		}, 50)
		try {
			localStorage.setItem(LAST_PROJECT_PATH_KEY, filePath)
			saveActiveContextId(csgEditor, LAST_CSG_CONTEXT_KEY)
			saveActiveContextId(editorCodeEditor, LAST_EDITOR_CODE_CONTEXT_KEY)
		} catch (e) { PrintWarn('Failed to save persistence data after load:', e) }
		closeModal('load-code-modal')
		return true
	} catch (error) {
		showAlert(`Failed to load project: ${error.message}`, 'error')
		closeModal('load-code-modal')
		throw error
	}
}

export async function handleSaveFile(event, filePath) {
	try {
		let finalPath = filePath
		if (!csgEditor.basePath) {
			const pathSegments = filePath.split('/'); pathSegments.pop()
			csgEditor.basePath = pathSegments.join('/') + '/'
		}
		project.setBasePath(csgEditor.basePath)
		const projectData = {
			csgCode: getPagesFromEditor(csgEditor),
			editorCode: getPagesFromEditor(editorCodeEditor),
			meshCache: cloneFilter(project.meshCache, isMesh, (item) => {
				if (item instanceof THREE.Mesh) return { $jsonMesh: { mesh: extractMeshData(item), userData: item.userData } }
				else if (item instanceof Brush) return { $jsonMesh: { isBrush: true, mesh: extractMeshData(item.mesh), userData: item.userData } }
				else if (item instanceof THREE.Shape) return { $jsonMesh: { isShape: true, shape: null } }
			})
		}
		await api.saveFile(finalPath, JSON.stringify(projectData, null, 2))
		try {
			localStorage.setItem(LAST_PROJECT_PATH_KEY, finalPath)
			saveActiveContextId(csgEditor, LAST_CSG_CONTEXT_KEY)
			saveActiveContextId(editorCodeEditor, LAST_EDITOR_CODE_CONTEXT_KEY)
		} catch (e) { PrintWarn('Failed to save path to localStorage:', e) }
		setProjectFilePath(finalPath)
		showAlert(`Project saved successfully to:\n${finalPath}`, 'success')
		closeModal('save-code-modal')
	} catch (error) {
		showAlert(`Failed to save project: ${error.message}`, 'error')
	}
}

export async function runEditorScript() {
	const activePage = getActivePageFromEditor(editorCodeEditor)
	if (!activePage) return
	const pageName = activePage.title
	if (project.codeCache[pageName]) project.codeCache[pageName].updated = false
	await project.include(pageName)
}

export async function runCSGCode() {
	currentObjects.forEach(obj => groupItems.remove(obj))
	currentObjects = []
	const activePage = getActivePageFromEditor(csgEditor)
	if (!activePage) return
	const activeMesh = await project.get(activePage.title)
	const meshes = []
	applyToMesh(activeMesh, item => meshes.push(item))
	meshes.forEach(item => {
		if (item.userData.$csgShow == undefined || item.$csgShow) {
			groupItems.add(item); currentObjects.push(item)
		}
	})
	isWireframeMode = false
	const btn = document.getElementById('btn-wireframe')
	if (btn) btn.style.backgroundColor = 'transparent'
}

export function clearCurrentCacheByName() {
	const codePanel = document.getElementById('code-panel')
	const editorCodePanel = document.getElementById('editor-code-panel')
	let currentTitle = null
	
	if (codePanel.style.display !== 'none') {
		const activePage = getActivePageFromEditor(csgEditor)
		if (activePage) currentTitle = activePage.title
		if (currentTitle) project.clearMeshCache(currentTitle)
	} else if (editorCodePanel.style.display !== 'none') {
		const activePage = getActivePageFromEditor(editorCodeEditor)
		if (activePage) currentTitle = activePage.title
		if (currentTitle) project.clearCodeCache(currentTitle)
	}
	
	if (currentTitle) {
		PrintLog(`Cache for "${currentTitle}" cleared.`)
		showAlert(`Cache for "${currentTitle}" cleared.\nPlease click "Run" to re-render.`, 'success')
	} else {
		PrintWarn('No active file to clear cache for.')
		showAlert('No active file to clear cache for.', 'warning')
	}
}

export function toggleWireframe() {
	isWireframeMode = !isWireframeMode
	applyToMesh(currentObjects, item => {
		if (isWireframeMode) {
			if (!item.userData.originalMaterial) item.userData.originalMaterial = item.material
			item.material = new THREE.MeshBasicMaterial({ color: 0x11ccaa, wireframe: true, transparent: true, opacity: 0.5 })
		} else {
			if (item.userData.originalMaterial) item.material = item.userData.originalMaterial
		}
	})
	const btn = document.getElementById('btn-wireframe')
	if (isWireframeMode) { btn.style.backgroundColor = 'rgba(231,76,60,0.3)' }
	else { btn.style.backgroundColor = 'transparent' }
}

export async function handleSaveStl(event, filePath) {
	async function innerSave(ext, content) {
		try {
			let finalPath = filePath
			if (!finalPath.toLowerCase().endsWith(ext)) finalPath += ext
			await api.saveFile(finalPath, content)
			showAlert(`Exported successfully to:\n${finalPath}`, 'success')
		} catch (error) {
			showAlert(`Failed to save export: ${error.message}`, 'error')
		}
		closeModal('save-stl-modal')
	}
	const exportGroup = new THREE.Group()
	currentObjects.forEach(obj => { if (obj.isMesh || obj instanceof Brush) exportGroup.add(obj.clone()) })
	exportGroup.scale.set(0.001, 0.001, 0.001)
	exportGroup.rotation.x = -Math.PI/2
	const format = (globalThis.settings && globalThis.settings.exportFormat) || 'stl'
	if (format === 'glb') {
		gltfExporter.parse(exportGroup, async (result) => { await innerSave('.glb', JSON.stringify(result)) }, { binary: true })
	} else {
		await innerSave('.stl', exporter.parse(exportGroup, { binary: false }))
	}
}

export function exportSTL() {
	if (!currentObjects.length) {
		showAlert('No objects to export!', 'warning')
		return
	}
	openModal('save-stl-modal')
}

export function clearAllCache() {
	project.clearAllCache(groupItems, currentObjects)
	showAlert('In-memory cache cleared.\nClick "Run" to re-render.', 'success')
}

function initConsolePanelLoggers() {
	const panelEl = document.getElementById('console-panel')
	function formatArgs(args) {
		try {
			return Array.from(args).map(a => {
				if (typeof a === 'string') return a
				if (a instanceof Error) return a.message
				return JSON.stringify(a, null, 2)
			}).join(' ')
		} catch { return String(args) }
	}
	function logToPanel(type, args, stack = null) {
		const msg = document.createElement('div')
		msg.className = 'console-' + type
		msg.textContent = formatArgs(args)
		panelEl.appendChild(msg)
		if (stack) {
			const stackEl = document.createElement('div')
			stackEl.className = 'console-stack'
			stackEl.textContent = 'Stack Trace:\n' + stack
			panelEl.appendChild(stackEl)
		}
		panelEl.scrollTop = panelEl.scrollHeight
	}
	globalThis.PrintLog = function () { logToPanel('log', arguments); console.log(...arguments) }
	globalThis.PrintWarn = function () { logToPanel('warn', arguments); console.warn(...arguments) }
	globalThis.PrintError = function () {
		let stack = null
		const args = Array.from(arguments)
		for (const arg of args) { if (arg instanceof Error && arg.stack) { stack = arg.stack; break } }
		logToPanel('error', args, stack); console.error(...arguments)
	}
	globalThis.jlog = function (...args) {
		for (var i = 0; i < args.length; i += 2) PrintLog(args[i] + ':' + JSON.stringify(args[i + 1]))
	}
}

export function initialize(domElements) {
	csgEditor = domElements.csgEditor; editorCodeEditor = domElements.editorCodeEditor
	openModal = domElements.openModal; closeModal = domElements.closeModal
	createBuildPlate = domElements.createBuildPlate; resizeRenderer = domElements.resizeRenderer
	animate = domElements.animate; showView = domElements.showView
	scene = domElements.scene; groupItems = domElements.groupItems
	currentObjects = []
	const defaultData = getNewDefaultProjectData()
	project = new ScadProject({
		csgEditorRef: csgEditor, codeEditorRef: editorCodeEditor,
		csgValues: defaultData.csgCode, codeValues: defaultData.editorCode,
		basePath: csgEditor.basePath || null
	})
	initConsolePanelLoggers()
	updatePathBars()

	const consoleContainer = document.getElementById('console-container')
	const consoleResizer = document.getElementById('console-resizer')
	let isResizing = false, startY = 0, startHeight = 0
	const startResize = (y) => { isResizing = true; startY = y; startHeight = consoleContainer.offsetHeight; document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize' }
	const resize = (y) => {
		if (!isResizing) return
		const newHeight = Math.max(MIN_CONSOLE_HEIGHT, startHeight + (startY - y))
		const maxHeight = window.innerHeight * MAX_CONSOLE_HEIGHT_RATIO
		if (newHeight >= MIN_CONSOLE_HEIGHT && newHeight <= maxHeight) { consoleContainer.style.height = `${newHeight}px`; updateMainContainerHeight(newHeight) }
	}
	const stopResize = () => { if (!isResizing) return; isResizing = false; document.body.style.userSelect = ''; document.body.style.cursor = ''; localStorage.setItem(LAST_CONSOLE_HEIGHT_KEY, consoleContainer.offsetHeight) }
	consoleResizer.addEventListener('mousedown', (e) => { e.preventDefault(); document.addEventListener('mousemove', onMouseMove, false); document.addEventListener('mouseup', onMouseUp, false); startResize(e.clientY) }, false)
	function onMouseMove(e) { resize(e.clientY) }
	function onMouseUp() { stopResize(); document.removeEventListener('mousemove', onMouseMove, false); document.removeEventListener('mouseup', onMouseUp, false) }
	consoleResizer.addEventListener('touchstart', (e) => { e.preventDefault(); if (e.touches.length === 1) { document.addEventListener('touchmove', onTouchMove, { passive: false }); document.addEventListener('touchend', onTouchEnd, false); startResize(e.touches[0].clientY) } }, false)
	function onTouchMove(e) { if (e.touches.length > 0) resize(e.touches[0].clientY); e.preventDefault() }
	function onTouchEnd() { stopResize(); document.removeEventListener('touchmove', onTouchMove, { passive: false }); document.removeEventListener('touchend', onTouchEnd, false) }
	const savedHeight = localStorage.getItem(LAST_CONSOLE_HEIGHT_KEY)
	if (savedHeight) {
		const parsedHeight = parseFloat(savedHeight)
		const maxHeight = window.innerHeight * MAX_CONSOLE_HEIGHT_RATIO
		if (parsedHeight >= MIN_CONSOLE_HEIGHT && parsedHeight <= maxHeight) consoleContainer.style.height = `${parsedHeight}px`
	}
	updateMainContainerHeight(consoleContainer.offsetHeight)

	const csgInstance = getOptTextInstance(csgEditor)
	const editorInstance = getOptTextInstance(editorCodeEditor)

	const invalidateMeshCache = function() {
		const activePage = getActivePageFromEditor(csgEditor)
		if (activePage && activePage.title) {
			if (project.meshCache[activePage.title]) project.meshCache[activePage.title].updated = false
		}
	}
	if (csgInstance) {
		csgInstance.oninput = invalidateMeshCache
		csgInstance.onchange = invalidateMeshCache
	}

	const invalidateCodeCache = function() {
		const activePage = getActivePageFromEditor(editorCodeEditor)
		if (activePage && activePage.title) {
			if (project.codeCache[activePage.title]) project.codeCache[activePage.title].updated = false
		}
	}
	if (editorInstance) {
		editorInstance.oninput = invalidateCodeCache
		editorInstance.onchange = invalidateCodeCache
	}

	if (csgInstance) {
		csgInstance.addEventListener('optText:change', (e) => {
			if (e.detail?.type === 'context-switched' && !isInitializing) {
				saveActiveContextId(csgEditor, LAST_CSG_CONTEXT_KEY)
			} else if (e.detail?.type === 'page-renamed' || e.detail?.type === 'page-added' || e.detail?.type === 'page-removed' || e.detail?.type === 'context-removed') {
				updatePathBars()
			}
		})
	}
	if (editorInstance) {
		editorInstance.addEventListener('optText:change', (e) => {
			if (e.detail?.type === 'context-switched' && !isInitializing) {
				saveActiveContextId(editorCodeEditor, LAST_EDITOR_CODE_CONTEXT_KEY)
			} else if (e.detail?.type === 'page-renamed' || e.detail?.type === 'page-added' || e.detail?.type === 'page-removed' || e.detail?.type === 'context-removed') {
				updatePathBars()
			}
		})
	}

	window.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); openModal('save-code-modal') }
	})
	window.addEventListener('resize', () => { updateMainContainerHeight(consoleContainer.offsetHeight) })

	autoLoadLastProject()
}

;(() => { })()