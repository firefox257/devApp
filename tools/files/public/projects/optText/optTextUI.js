// ./system/ux/optTextUI.js

// --- Constants ---
export const LINE_HEIGHT = 24;
export const LINE_NUM_WIDTH = 65;
export const BOTTOM_PADDING = 400;
export const FONT_SIZE = 16;
export const FONT_FAMILY = 'Menlo, Consolas, monospace';

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
export function injectStyles() {
	if (stylesInjected) return;

	const style = document.createElement('style');
	style.id = 'opt-text-styles';
	style.textContent = `
	/* ===== CSS VARIABLES (fallbacks) ===== */
	:root {
	--ot-bg-container: #ffffff;
	--ot-bg-canvas: #ffffff;
	--ot-bg-toolbar: rgba(255, 255, 255, 0.95);
	--ot-border-toolbar: rgba(0,0,0,0.08);
	--ot-text-toolbar: #444;
	--ot-hover-toolbar: rgba(0,0,0,0.06);
	--ot-active-toolbar: rgba(26, 115, 232, 0.12);
	--ot-bg-dropdown: #ffffff;
	--ot-text-dropdown: #333;
	--ot-hover-dropdown: #f5f5f5;
	--ot-active-dropdown: #e8e8e8;
	--ot-active-dropdown-touch: #d0d0d0;
	--ot-border-dropdown: rgba(0,0,0,0.08);
	--ot-danger: #dc3545;
	--ot-danger-hover: #c82333;
	--ot-hover-danger: #fff0f0;
	--ot-scrollbar-thumb: rgba(0, 0, 0, 0.3);
	--ot-cursor: #0066cc;
	--ot-bg-loading: rgba(255, 255, 255, 0.95);
	--ot-text-loading: #000;
	--ot-text-loading-dim: #666;
	--ot-loading-accent: #0066cc;
	--ot-perf-text: #006600;
	--ot-perf-bg: rgba(255,255,255,0.85);
	--ot-perf-border: #ddd;
	--ot-modal-bg: #ffffff;
	--ot-modal-handle: #ddd;
	--ot-modal-title: #1a1a1a;
	--ot-modal-message: #666;
	--ot-modal-stats-bg: #f8f9fa;
	--ot-modal-stat-value: #1a1a1a;
	--ot-modal-stat-label: #888;
	--ot-modal-btn-cancel: #f0f0f0;
	--ot-modal-btn-cancel-text: #333;
	--ot-modal-btn-cancel-hover: #e0e0e0;
	--ot-btn-disabled: #ccc;
	--ot-btn-disabled-text: #999;
	}

	/* ===== BASE CONTAINER ===== */
	.opt-text-container-wrapper {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: var(--ot-bg-container, #ffffff);
	font-family: ${FONT_FAMILY};
	font-size: ${FONT_SIZE}px;
	line-height: ${LINE_HEIGHT}px;
	box-sizing: border-box;
	touch-action: none;
	-webkit-tap-highlight-color: transparent;
	}
	.opt-text-container-wrapper * { box-sizing: border-box; }

	/* === DISABLE NATIVE SELECTION === */
	.opt-text-container-wrapper,
	.opt-text-container-wrapper *,
	.opt-text-canvas,
	.opt-text-toolbar,
	.opt-text-dropdown,
	.opt-text-modal-overlay,
	.opt-text-scrollbar,
	.opt-text-loading,
	.opt-text-perf-stats,
	.opt-text-cursor-preview,
	.opt-text-goto-modal {
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
	-webkit-touch-callout: none;
	-webkit-tap-highlight-color: transparent;
	}

	/* Allow selection ONLY in hidden input for keyboard/IME */
	.opt-text-hidden-input,
	.opt-text-goto-input {
	-webkit-user-select: text;
	-moz-user-select: text;
	-ms-user-select: text;
	user-select: text;
	-webkit-touch-callout: default;
	}

	/* ===== CANVAS ===== */
	.opt-text-canvas {
	display: block;
	background-color: var(--ot-bg-canvas, #ffffff);
	transition: box-shadow 0.2s ease;
	will-change: transform;
	cursor: text;
	margin-top: 28px;
	width: 100%;
	height: calc(100% - 28px);
	}

	/* ===== TOOLBAR ===== */
	.opt-text-toolbar {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 28px;
	z-index: 200;
	display: flex;
	align-items: center;
	padding: 0 8px;
	background: var(--ot-bg-toolbar, rgba(255, 255, 255, 0.95));
	border-bottom: 1px solid var(--ot-border-toolbar, rgba(0,0,0,0.08));
	backdrop-filter: saturate(180%) blur(8px);
	}
	.opt-text-toolbar-btn {
	width: 24px;
	height: 24px;
	padding: 0;
	border: none;
	border-radius: 4px;
	background: transparent;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background 0.15s ease, opacity 0.15s ease;
	color: var(--ot-text-toolbar, #444);
	margin-right: 4px;
	}
	.opt-text-toolbar-btn:hover:not(:disabled) { background: var(--ot-hover-toolbar, rgba(0,0,0,0.06)); }
	.opt-text-toolbar-btn:active:not(:disabled) { transform: scale(0.98); }
	.opt-text-toolbar-btn:disabled {
	opacity: 0.4;

	cursor: not-allowed;
	color: var(--ot-btn-disabled-text, #999);
	}
	.opt-text-toolbar-btn svg {
	width: 12px;
	height: 12px;
	opacity: 0.7;
	transition: opacity 0.15s ease;
	}
	.opt-text-toolbar-btn:hover:not(:disabled) svg { opacity: 1; }
	.opt-text-toolbar-btn[aria-expanded="true"] { background: var(--ot-active-toolbar, rgba(26, 115, 232, 0.12)); }
	.opt-text-toolbar-btn[aria-expanded="true"] svg { opacity: 1; stroke: #1a73e8; }

	/* ===== DROPDOWN MENU ===== */
	.opt-text-dropdown {
	position: absolute;
	top: 28px;
	left: 8px;
	min-width: 180px;
	padding: 4px 0;
	background: var(--ot-bg-dropdown, #ffffff);
	border-radius: 8px;
	box-shadow: 0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08);
	opacity: 0;
	visibility: hidden;
	transform: translateY(-8px);
	transform-origin: top left;
	transition: opacity 0.12s ease, visibility 0s 0.12s, transform 0.12s ease;
	z-index: 201;
	pointer-events: none;
	display: flex;
	flex-direction: column;
	}
	.opt-text-dropdown.open {
	opacity: 1;
	visibility: visible;
	transform: translateY(0);
	transition: opacity 0.15s ease, visibility 0s, transform 0.15s ease;
	pointer-events: auto;
	}
	.opt-text-dropdown-item {
	width: 100%;
	padding: 8px 14px;
	border: none;
	background: transparent;
	text-align: left;
	font-size: 12px;
	color: var(--ot-text-dropdown, #333);
	cursor: pointer;
	transition: background 0.1s ease;
	font-family: -apple-system, BlinkMacSystemFont, sans-serif;
	white-space: nowrap;
	display: flex;
	align-items: center;
	gap: 8px;
	}
	.opt-text-dropdown-item:hover { background: var(--ot-hover-dropdown, #f5f5f5); }
	.opt-text-dropdown-item:active { background: var(--ot-active-dropdown, #e8e8e8); }
	.opt-text-dropdown-item.danger { color: var(--ot-danger, #dc3545); }
	.opt-text-dropdown-item.danger:hover { background: var(--ot-hover-danger, #fff0f0); }
	.opt-text-dropdown-divider {
	height: 1px;
	background: var(--ot-border-dropdown, rgba(0,0,0,0.08));
	margin: 4px 0;
	}
	
	.opt-text-dropdown-item:disabled {
	opacity: 0.4;

	cursor: not-allowed;
	color: var(--ot-btn-disabled-text, #999);
	}

	/* ===== SCROLLBARS ===== */
	.opt-text-scrollbar {
	position: absolute;
	background: transparent;
	opacity: 0;
	transition: opacity 0.2s ease-out;
	z-index: 100;
	pointer-events: none;
	}
	.opt-text-scrollbar.visible { opacity: 1; pointer-events: auto; }
	.opt-text-scrollbar.vertical { width: 4px; right: 3px; top: 31px; bottom: 3px; }
	.opt-text-scrollbar.horizontal { height: 4px; left: 3px; right: 3px; bottom: 3px; }
	.opt-text-scrollbar-thumb {
	position: absolute;
	background: var(--ot-scrollbar-thumb, rgba(0, 0, 0, 0.3));
	border-radius: 2px;
	}
	.opt-text-scrollbar.vertical .opt-text-scrollbar-thumb { width: 100%; left: 0; }
	.opt-text-scrollbar.horizontal .opt-text-scrollbar-thumb { height: 100%; top: 0; }

	/* ===== HIDDEN INPUT ===== */
	.opt-text-hidden-input {
	position: absolute;
	opacity: 0;
	width: 1px;
	height: 1px;
	top: -1000px;
	}

	/* ===== CURSOR PREVIEW ===== */
	.opt-text-cursor-preview {
	position: absolute;
	width: 2px;
	height: 20px;
	background: var(--ot-cursor, #0066cc);
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.1s;
	z-index: 55;
	}
	.opt-text-cursor-preview.visible { opacity: 1; }

	/* ===== LOADING OVERLAY ===== */
	.opt-text-loading {
	position: absolute;
	top: 28px;
	left: 0;
	right: 0;
	bottom: 0;
	background: var(--ot-bg-loading, rgba(255, 255, 255, 0.95));
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	z-index: 1000;
	transition: opacity 0.3s ease;
	}
	.opt-text-loading.hidden { opacity: 0; pointer-events: none; }
	.opt-text-loading-spinner {
	width: 40px;
	height: 40px;
	border: 3px solid rgba(0,0,0,0.1);
	border-top-color: var(--ot-loading-accent, #0066cc);
	border-radius: 50%;
	animation: ot-spin 1s linear infinite;
	margin-bottom: 20px;
	}
	@keyframes ot-spin { to { transform: rotate(360deg); } }
	.opt-text-loading-text { color: var(--ot-text-loading, #000); font-size: 14px; margin-bottom: 8px; }
	.opt-text-loading-progress { color: var(--ot-text-loading-dim, #666); font-size: 12px; }
	.opt-text-loading-bar {
	width: 200px;
	height: 4px;
	background: rgba(0,0,0,0.1);
	border-radius: 2px;
	margin-top: 15px;
	overflow: hidden;
	}
	.opt-text-loading-bar-fill {
	height: 100%;
	background: var(--ot-loading-accent, #0066cc);
	width: 0%;
	transition: width 0.2s ease;
	}

	/* ===== PERF STATS ===== */
	.opt-text-perf-stats {
	position: absolute;
	top: 38px;
	left: 10px;
	color: var(--ot-perf-text, #006600);
	font-size: 10px;
	background: var(--ot-perf-bg, rgba(255,255,255,0.85));
	padding: 5px 8px;
	border-radius: 5px;
	border: 1px solid var(--ot-perf-border, #ddd);
	pointer-events: none;
	line-height: 1.6;
	z-index: 50;
	display: none;
	}
	.opt-text-perf-stats.enabled { display: block; }

	/* ===== MODAL ===== */
	.opt-text-modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	z-index: 2000;
	opacity: 0;
	visibility: hidden;
	transition: opacity 0.2s ease, visibility 0s 0.2s;
	backdrop-filter: blur(2px);
	}
	.opt-text-modal-overlay.visible {
	opacity: 1;
	visibility: visible;
	transition: opacity 0.2s ease, visibility 0s;
	}
	.opt-text-modal-dialog {
	background: var(--ot-modal-bg, #ffffff);
	border-radius: 16px 16px 0 0;
	box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
	width: 100%;
	max-width: 400px;
	padding: 20px 16px 24px;
	transform: translateY(100%);
	transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.opt-text-modal-overlay.visible .opt-text-modal-dialog { transform: translateY(0); }
	.opt-text-modal-handle {
	width: 40px;
	height: 4px;
	background: var(--ot-modal-handle, #ddd);
	border-radius: 2px;
	margin: 0 auto 16px;
	}
	.opt-text-modal-title {
	font-size: 15px;
	font-weight: 600;
	color: var(--ot-modal-title, #1a1a1a);
	text-align: center;
	margin-bottom: 6px;
	}
	.opt-text-modal-message {
	font-size: 12px;
	color: var(--ot-modal-message, #666);
	text-align: center;
	line-height: 1.4;
	margin-bottom: 14px;
	}
	.opt-text-modal-stats {
	display: flex;
	justify-content: center;
	gap: 20px;
	background: var(--ot-modal-stats-bg, #f8f9fa);
	border-radius: 8px;
	padding: 10px 16px;
	margin-bottom: 18px;
	font-size: 12px;
	}
	.opt-text-modal-stat { text-align: center; }
	.opt-text-modal-stat-value { font-weight: 700; color: var(--ot-modal-stat-value, #1a1a1a); font-size: 14px; }
	.opt-text-modal-stat-value.danger { color: var(--ot-danger, #dc3545); }
	.opt-text-modal-stat-label { color: var(--ot-modal-stat-label, #888); font-size: 11px; margin-top: 2px; }
	.opt-text-modal-buttons { display: flex; gap: 10px; }
	.opt-text-modal-btn {
	flex: 1;
	padding: 14px 16px;
	border: none;
	border-radius: 10px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s ease, transform 0.1s ease;
	font-family: -apple-system, BlinkMacSystemFont, sans-serif;
	-webkit-tap-highlight-color: transparent;
	}
	.opt-text-modal-btn:active { transform: scale(0.98); }
	.opt-text-modal-btn-cancel { background: var(--ot-modal-btn-cancel, #f0f0f0); color: var(--ot-modal-btn-cancel-text, #333); }
	.opt-text-modal-btn-cancel:hover { background: var(--ot-modal-btn-cancel-hover, #e0e0e0); }
	.opt-text-modal-btn-confirm { background: var(--ot-danger, #dc3545); color: #ffffff; }
	.opt-text-modal-btn-confirm:hover { background: var(--ot-danger-hover, #c82333); }

	/* ===== GOTO LINE INPUT ===== */
	.opt-text-goto-input {
	width: 100%;
	padding: 10px 12px;
	border: 1px solid var(--ot-border-dropdown, rgba(0,0,0,0.08));
	border-radius: 8px;
	font-size: 14px;
	font-family: inherit;
	margin-bottom: 16px;
	box-sizing: border-box;
	background: var(--ot-bg-dropdown, #ffffff);
	color: var(--ot-text-dropdown, #333);
	}
	.opt-text-goto-input:focus {
	outline: none;
	border-color: #1a73e8;
	box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
	}
	.opt-text-goto-input::placeholder { color: #999; }

	/* ===== TOAST ===== */
	.opt-text-toast {
	position: fixed;
	bottom: 60px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(0,0,0,0.8);
	color: white;
	padding: 10px 20px;
	border-radius: 8px;
	font-size: 13px;
	z-index: 1001;
	animation: ot-toast-fade 2s ease;
	pointer-events: none;
	white-space: nowrap;
	-webkit-user-select: none;
	user-select: none;
	}
	@keyframes ot-toast-fade {
	0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
	15% { opacity: 1; transform: translateX(-50%) translateY(0); }
	85% { opacity: 1; transform: translateX(-50%) translateY(0); }
	100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
	}

	@media (hover: none) {
	.opt-text-dropdown-item:active { background: var(--ot-active-dropdown-touch, #d0d0d0); }
	}
	`;

	document.head.appendChild(style);
	stylesInjected = true;
}

// --- Helper Functions ---
export function showToast(message, container) {
	const existingToast = container?.querySelector('.opt-text-toast');
	if (existingToast) existingToast.remove();

	const toast = document.createElement('div');
	toast.className = 'opt-text-toast';
	toast.textContent = message;
	toast.style.cssText = `position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 8px; font-size: 13px; z-index: 1001; animation: ot-toast-fade 2s ease; pointer-events: none; white-space: nowrap; -webkit-user-select: none; user-select: none;`;

	if (!document.getElementById('opt-text-toast-style')) {
		const style = document.createElement('style');
		style.id = 'opt-text-toast-style';
		style.textContent = `
		@keyframes ot-toast-fade {
		0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
		15% { opacity: 1; transform: translateX(-50%) translateY(0); }
		85% { opacity: 1; transform: translateX(-50%) translateY(0); }
		100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
		}
		`;
		document.head.appendChild(style);
	}

	(container || document.body).appendChild(toast);
	setTimeout(() => toast.remove(), 2000);
}

export function getDialogOverlay(container) {
	let overlay = container.querySelector('.opt-text-modal-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.className = 'opt-text-modal-overlay';
		overlay.innerHTML = `
		<div class="opt-text-modal-dialog">
		<input type="hidden" class="opt-text-clipboard-cache" />
		<div class="opt-text-modal-handle"></div>
		<div class="opt-text-modal-title">Replace All Content?</div>
		<div class="opt-text-modal-message">This will delete all existing text and replace it with clipboard content.</div>
		<div class="opt-text-modal-stats">
		<div class="opt-text-modal-stat">
		<div class="opt-text-modal-stat-value danger" data-ref="current">0</div>
		<div class="opt-text-modal-stat-label">Current</div>
		</div>
		<div class="opt-text-modal-stat">
		<div class="opt-text-modal-stat-value" data-ref="clipboard">0</div>
		<div class="opt-text-modal-stat-label">Clipboard</div>
		</div>
		</div>
		<div class="opt-text-modal-buttons">
		<button class="opt-text-modal-btn opt-text-modal-btn-cancel" data-action="cancel">Cancel</button>
		<button class="opt-text-modal-btn opt-text-modal-btn-confirm" data-action="confirm">Replace</button>
		</div>
		</div>
		`;
		container.appendChild(overlay);
	}
	return overlay;
}

export function getGotoLineModal(container) {
	let modal = container.querySelector('.opt-text-goto-modal');
	if (!modal) {
		modal = document.createElement('div');
		modal.className = 'opt-text-modal-overlay opt-text-goto-modal';
		modal.innerHTML = `
		<div class="opt-text-modal-dialog" style="max-width:320px;padding:16px">
		<div class="opt-text-modal-handle"></div>
		<div class="opt-text-modal-title">Go to Line</div>
		<div class="opt-text-modal-message" style="margin-bottom:12px">
		Enter line number (1–<span data-ref="max">0</span>)
		</div>
		<input type="number" class="opt-text-goto-input" min="1" placeholder="Line number">
		<div class="opt-text-modal-buttons">
		<button class="opt-text-modal-btn opt-text-modal-btn-cancel" data-action="cancel">Cancel</button>
		<button class="opt-text-modal-btn opt-text-modal-btn-confirm" data-action="goto">Go</button>
		</div>
		</div>
		`;
		container.appendChild(modal);
	}
	return modal;
}
export function createOptTextDOM(originalClass, originalId, placeholder = '') {
	const html = `<div class="opt-text-container-wrapper ${originalClass || ''}" ${originalId ? `id="${originalId}"` : ''}>
	<div class="opt-text-toolbar">
	<button class="opt-text-toolbar-btn" data-action="menu" aria-label="Actions menu" aria-haspopup="true" aria-expanded="false">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
	</button>
	<div class="opt-text-toolbar-divider" style="width:1px;height:20px;background:var(--ot-border-toolbar);margin:0 4px"></div>

	<!-- REDO BUTTON MOVED HERE (Order: Menu -> Redo -> Undo) -->
	<button class="opt-text-toolbar-btn" data-action="redo" aria-label="Redo (Ctrl+Y)" disabled>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M21 7v6h-6"></path>
	<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
	</svg>
	</button>

	<!-- UNDO BUTTON -->
	<button class="opt-text-toolbar-btn" data-action="undo" aria-label="Undo (Ctrl+Z)" disabled>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3 7v6h6"></path>
	<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
	</svg>
	</button>

	<div class="opt-text-dropdown" role="menu" aria-hidden="true">
	<button class="opt-text-dropdown-item" data-action="start-select">🔲 Start Select</button>
	<button class="opt-text-dropdown-item danger" data-action="clear-selection">❌ Clear Selection</button>
	<div class="opt-text-dropdown-divider"></div>
	<button class="opt-text-dropdown-item" data-action="cut">✂ Cut</button>
	<button class="opt-text-dropdown-item" data-action="copy">📋 Copy</button>
	<button class="opt-text-dropdown-item" data-action="paste">📥 Paste</button>
	<div class="opt-text-dropdown-divider"></div>
	<button class="opt-text-dropdown-item" data-action="copy-all">📄 Copy All</button>
	<button class="opt-text-dropdown-item" data-action="replace-all">🔄 Replace All</button>
	<div class="opt-text-dropdown-divider"></div>
	<button class="opt-text-dropdown-item" data-action="goto-line"> 📍 Go to Line… <span style="margin-left:auto;font-size:10px;opacity:0.6">Ctrl+G</span> </button>
	<div class="opt-text-dropdown-divider"></div>

	</div>
	</div>
	<canvas class="opt-text-canvas"></canvas>
	<div class="opt-text-cursor-preview"></div>
	<div class="opt-text-loading hidden">
	<div class="opt-text-loading-spinner"></div>
	<div class="opt-text-loading-text">Ready</div>
	<div class="opt-text-loading-progress"></div>
	<div class="opt-text-loading-bar"><div class="opt-text-loading-bar-fill"></div></div>
	</div>
	<div class="opt-text-perf-stats"> Visible: <span data-ref="visible">0</span><br> FPS: <span data-ref="fps">60</span><br> Render: <span data-ref="render">0</span>ms </div>
	<div class="opt-text-scrollbar vertical"><div class="opt-text-scrollbar-thumb"></div></div>
	<div class="opt-text-scrollbar horizontal"><div class="opt-text-scrollbar-thumb"></div></div>
	<input type="text" class="opt-text-hidden-input" autocomplete="off" autocorrect="off" autocapitalize="none" inputmode="text" style="caret-color: transparent">
	</div>`;

	const wrapper = document.createElement('div');
	wrapper.innerHTML = html;
	return wrapper.firstElementChild;
}