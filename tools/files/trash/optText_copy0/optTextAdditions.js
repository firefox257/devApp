// ./system/ux/optText/optTextAdditions.js
import { showToast } from './optTextUI.js';

export class AdditionManager {
	constructor() {
		this.registry = new Map();
		this.activeId = null;
	}

	register(def) {
		// ✅ FIXED: Removed strict `init` requirement so static buttons (like saveButton) can omit it without crashing
		if (!def.id) {
			throw new Error('Addition must have an `id`');
		}
		this.registry.set(def.id, { ...def, active: false });
		return this;
	}

	injectDropdownItems(container, dataManager, allowedExtensions = null) {
		for (const def of this.registry.values()) {
			// ✅ FIXED: Skip ONLY if allowedExtensions is explicitly an array AND it doesn't include this ID.
			if (Array.isArray(allowedExtensions) && !allowedExtensions.includes(def.id)) {
				continue;
			}
			if (def.dropdownItem) {
				this._ensureDropdownItem(container, def, dataManager);
			}
		}
	}

	injectToolbarButtons(container, dataManager, allowedExtensions = null) {
		const toolbar = container.querySelector('.opt-text-toolbar');
		if (!toolbar) return;

		for (const def of this.registry.values()) {
			// ✅ FIXED: Same universal array check as above
			if (Array.isArray(allowedExtensions) && !allowedExtensions.includes(def.id)) {
				continue;
			}
			if (def.isStaticToolbarButton && def.toolbarButton) {
				if (toolbar.querySelector(`[data-addition-id="${def.id}"]`)) continue;

				const btn = document.createElement('button');
				btn.className = 'opt-text-toolbar-btn opt-text-addition-btn';
				btn.dataset.additionId = def.id;
				btn.title = def.toolbarButton.label;
				btn.innerHTML = def.toolbarButton.icon || def.toolbarButton.label;

				btn.addEventListener('click', () => {
					if (this.activeId === def.id) {
						this.deactivate(container);
						return;
					}
					
					// ✅ CLEAR SEPARATION: Check for one-off 'action' first
					if (typeof def.action === 'function') {
						def.action(this._createAPI(container, dataManager), container, dataManager);
					} 
					// ✅ If it has a toolUI, activate it (which calls init)
					else if (def.toolUI && typeof def.toolUI === 'function') {
						this.activate(def.id, container, dataManager);
					} 
					// ✅ Legacy fallback for toolbarButton.action
					else if (def.toolbarButton && typeof def.toolbarButton.action === 'function') {
						def.toolbarButton.action(this._createAPI(container, dataManager), container);
					}
				});

				const undoBtn = toolbar.querySelector('[data-action="undo"]');
				if (undoBtn) {
					undoBtn.insertAdjacentElement('afterend', btn);
				} else {
					toolbar.appendChild(btn);
				}
			}
		}
	}

	// ✅ UNIVERSAL AUTO-INIT: Runs `init` for ANY addition that has one. No `isAutoInit` flag needed.
	injectAutoInitAdditions(container, dataManager, allowedExtensions = null) {
		for (const def of this.registry.values()) {
			if (Array.isArray(allowedExtensions) && !allowedExtensions.includes(def.id)) {
				continue;
			}
			if (typeof def.init === 'function') {
				def.init(this._createAPI(container, dataManager), container, dataManager);
			}
		}
	}

	activate(id, container, dataManager) {
		const def = this.registry.get(id);
		if (!def) throw new Error(`Addition '${id}' not registered`);

		if (this.activeId) this.deactivate(container);

		this.activeId = id;
		def.active = true;

		const additionBtns = container.querySelectorAll('.opt-text-addition-btn');
		additionBtns.forEach(btn => btn.style.display = 'none');

		const toolEl = document.createElement('div');
		toolEl.className = 'opt-addition-tool-container';
		toolEl.id = 'opt-addition-active-tool';
		toolEl.style.cssText = 'display:flex;align-items:center;gap:8px;overflow-x:auto;flex:1;padding:0 4px;';

		if (typeof def.toolUI === 'function') {
			const api = this._createAPI(container, dataManager);
			toolEl.innerHTML = def.toolUI(api);
		}

		const closeBtn = document.createElement('button');
		closeBtn.className = 'opt-text-toolbar-btn';
		closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
		closeBtn.title = 'Exit';
		closeBtn.addEventListener('click', () => this.deactivate(container));

		toolEl.appendChild(closeBtn);

		const toolbar = container.querySelector('.opt-text-toolbar');
		toolbar.appendChild(toolEl);

		// ✅ INIT is strictly for initializing the persistent tool UI state, NOT for one-off actions.
		// (Removed debug alert(2) from here)
		if (typeof def.init === 'function') {
			def.init(this._createAPI(container, dataManager), container, dataManager);
		}
	}

	deactivate(container) {
		if (!this.activeId) return;

		const def = this.registry.get(this.activeId);
		def?.cleanup?.();
		def.active = false;

		const toolEl = container.querySelector('#opt-addition-active-tool');
		if (toolEl) toolEl.remove();

		this.activeId = null;

		const additionBtns = container.querySelectorAll('.opt-text-addition-btn');
		additionBtns.forEach(btn => btn.style.display = '');
	}

	_ensureDropdownItem(container, def, dataManager) {
		if (container.querySelector(`[data-addition="${def.id}"]`)) return;
		const dropdown = container.querySelector('.opt-text-dropdown');
		if (!dropdown) return;

		const btn = document.createElement('button');
		btn.className = 'opt-text-dropdown-item';
		btn.dataset.action = 'addition-trigger';
		btn.dataset.additionId = def.id;
		btn.textContent = def.dropdownItem.label || def.name;
		if (def.dropdownItem.icon) btn.innerHTML = `${def.dropdownItem.icon} ${btn.textContent}`;

		btn.addEventListener('click', () => {
			dropdown.classList.remove('open');
			
			// ✅ CLEAR SEPARATION: If an 'action' is defined, execute it immediately as a one-off command.
			if (typeof def.action === 'function') {
				def.action(this._createAPI(container, dataManager), container, dataManager);
			} 
			// ✅ Otherwise, fall back to 'activate' which initializes a persistent tool UI and calls 'init'.
			else {
				this.activate(def.id, container, dataManager);
			}
		});

		dropdown.appendChild(btn);
	}

	_createAPI(container, dataManager) {
		const self = this;
		return {
			context: {
				switch: (id) => container.switchContext?.(id),
				getCurrent: () => dataManager?.current || null,
				list: () => container.listContexts?.() || [],
				get activeId() { return container.contextId; },
				set activeId(id) { container.contextId = id; },
				remove: (id) => container.removeContext(id),
				defineProperty: (name, desc) => container.defineProperty(name, desc),
				values: container.values
			},
			editor: {
				getLines: () => dataManager?.current ? [...dataManager.current.lines] : [],
				setLines: (newLines, reason) => self._applyLines(container, dataManager, newLines, reason),
				augmentLines: (transformFn) => {
					const ctx = dataManager?.current;
					if (!ctx) return null;
					const original = [...ctx.lines];
					const modified = transformFn(original);
					if (!Array.isArray(modified)) return original;
					self._applyLines(container, dataManager, modified, 'addition-augment', { original });
					return original;
				},
				getMode: () => container.selection?.active ? 'selection' : 'cursor',
				getCursor: () => ({ line: container.cursor?.line ?? 0, col: container.cursor?.col ?? 0 }),
				setCursor: (line, col) => container.dispatchEvent(new CustomEvent('optText:cursor:set', { detail: { line, col } })),
				getSelection: () => container.selection || { active: false, anchor: { line: 0, col: 0 }, focus: { line: 0, col: 0 } },
				setSelection: (anchor, focus) => container.dispatchEvent(new CustomEvent('optText:selection:set', { detail: { anchor, focus } })),
				scrollToCursor: () => container.dispatchEvent(new CustomEvent('optText:scroll:to', { detail: { line: container.cursor?.line ?? 0, col: container.cursor?.col ?? 0 } })),
				scrollToAnchor: () => container.dispatchEvent(new CustomEvent('optText:scroll:to', { detail: { line: container.selection?.anchor?.line ?? 0, col: container.selection?.anchor?.col ?? 0 } })),
				scrollToFocus: () => container.dispatchEvent(new CustomEvent('optText:scroll:to', { detail: { line: container.selection?.focus?.line ?? 0, col: container.selection?.focus?.col ?? 0 } })),
				focus: () => container.querySelector('.opt-text-hidden-input')?.focus(),
				defineProperty: (name, desc) => container.defineProperty(name, desc),
				values: container.values
			},
			ui: {
				toast: (msg) => showToast(msg, container),
				exit: () => self.deactivate(container),
				modal: {
					show: (config) => self._showModal(container, config),
					hide: () => container.querySelectorAll('.opt-text-modal-overlay').forEach(el => el.remove())
				}
			}
		};
	}

	_applyLines(container, dataManager, newLines, reason, meta = {}) {
		const ctx = dataManager?.current;
		if (!ctx) return;
		const snapBefore = {
			lines: ctx.lines.map(l => String(l)),
			cursor: { line: container.cursor.line, col: container.cursor.col },
			selection: container.selection.active ? {
				active: true,
				anchor: { line: container.selection.anchor.line, col: container.selection.anchor.col },
				focus: { line: container.selection.focus.line, col: container.selection.focus.col }
			} : { active: false, anchor: null, focus: null },
			meta
		};
		ctx.lines.length = 0;
		ctx.lines.push(...newLines.map(l => String(l)));
		if (ctx.lines.length === 0) ctx.lines.push('');
		ctx.markModified?.();
		if (container._pushAdditionHistory) container._pushAdditionHistory(snapBefore, reason);
		container.dispatchEvent(new CustomEvent('optText:change', { detail: { reason } }));
	}

	_showModal(container, config) {
		return new Promise(resolve => {
			const overlay = document.createElement('div');
			overlay.className = 'opt-text-modal-overlay visible';
			overlay.innerHTML = `<div class="opt-text-modal-dialog"><div class="opt-text-modal-handle"></div><div class="opt-text-modal-title">${config.title || 'Addition'}</div><div class="opt-text-modal-message">${config.message || ''}</div>${config.content || ''}<div class="opt-text-modal-buttons">${config.showCancel !== false ? `<button class="opt-text-modal-btn opt-text-modal-btn-cancel" data-action="cancel">${config.cancelText || 'Cancel'}</button>` : ''}<button class="opt-text-modal-btn opt-text-modal-btn-confirm" data-action="confirm">${config.confirmText || 'OK'}</button></div></div>`;
			container.appendChild(overlay);
			overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => { resolve({ action: 'confirm' }); overlay.remove(); });
			overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { resolve({ action: 'cancel' }); overlay.remove(); });
		});
	}
}

export const additionManager = new AdditionManager();