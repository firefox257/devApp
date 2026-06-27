// ./system/ux/additions/pagesManager.js
import { additionManager } from '../optTextAdditions.js';

// Module-scope state to prevent cleanup ReferenceErrors (per Extension Docs)
let pagesState = {
	container: null,
	api: null,
	changeHandler: null,
	outsideClickHandler: null,
	dropdownMenu: null,
	deleteModal: null
};

function updatePagesToolbar() {
	if (!pagesState.container || !pagesState.api) return;
	const { container } = pagesState;
	const tool = container.querySelector('#opt-addition-active-tool');
	if (!tool) return;

	const ctxs = container.listContexts();
	const currentId = container.contextId;
	const currentCtx = ctxs.find(c => c.id === currentId);

	const titleInput = tool.querySelector('[data-ref="page-title"]');

	// Update text box ONLY if the user is NOT currently typing in it
	if (titleInput && currentCtx && document.activeElement !== titleInput) {
		titleInput.value = currentCtx.name;
		titleInput.title = currentCtx.name; // Show full name on hover
	}
}

additionManager.register({
		id: 'pagesManager',
		isStaticToolbarButton: true,
		//isAutoInit: true,
		
		stateConfig: {
			disabled: { attribute: 'pagesmanager-disabled', property: 'pagesManagerDisabled' },
			hidden: { attribute: 'pagesmanager-hidden', property: 'pagesManagerHidden' }
		},
		
		toolbarButton: {
			icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
			label: 'Pages Manager'
		},
		toolUI: (api) => `
		<div style="display:flex;align-items:center;gap:4px;flex:1;overflow-x:auto;" id="pages-toolbar-ui">
		<button class="opt-text-toolbar-btn" data-action="pages-prev" title="Previous Page">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
		</button>
		<button class="opt-text-toolbar-btn" data-action="pages-dropdown" title="Select Page from List" style="position:relative;">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
		</button>
		<input type="text" data-ref="page-title" placeholder="Page Title" style="flex:1;min-width:120px;max-width:200px;padding:2px 4px;font-size:11px;border:1px solid var(--ot-border,#ccc);border-radius:3px;outline:none;background:var(--ot-bg-canvas,#fff);color:var(--ot-text-primary,#000);">
		<button class="opt-text-toolbar-btn" data-action="pages-next" title="Next Page / New Page">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
		</button>
		<button class="opt-text-toolbar-btn" data-action="pages-delete" title="Delete Current Page" style="color:var(--ot-text-danger,#d32f2f);">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
		</button>
		</div>
		`,
		init: (api, container) => {
			pagesState.container = container;
			pagesState.api = api;

			if (!container.hasOwnProperty('_pagesPropsDefined')) {
				Object.defineProperty(container, 'values', {
						get() {
							const ctxs = this.listContexts();
							return ctxs.map(c => {
									const ctx = this.dataManager.contexts.find(x => x.id === c.id);
									return { title: c.name, content: ctx ? ctx.lines.join('\n') : '' };
								});
						},
						set(newValues) {
							if (!Array.isArray(newValues) || newValues.length === 0) return;
							const currentId = this.contextId;
							const contextsToRemove = this.dataManager.contexts.filter(c => c.id !== currentId);
							contextsToRemove.forEach(c => this.removeContext(c.id));

							this.dataManager.current.name = newValues[0].title || 'Page 1';
							this.value = newValues[0].content || '  ';

							for (let i = 1; i < newValues.length; i++) {
								this.addContext(newValues[i].title || `Page ${i + 1}`, (newValues[i].content || '').split('\n'));
							}
							updatePagesToolbar();
							if (this._onpagechange) {
								this._onpagechange.call(this, { valuesIndex: 0, title: newValues[0].title, content: newValues[0].content });
							}
						},
						configurable: true
					});

				Object.defineProperty(container, 'valuesIndex', {
						get() {
							const ctxs = this.listContexts();
							return ctxs.findIndex(c => c.id === this.contextId);
						},
						set(newIndex) {
							const ctxs = this.listContexts();
							if (newIndex >= 0 && newIndex < ctxs.length) {
								this.switchContext(ctxs[newIndex].id);
								updatePagesToolbar();
								if (this._onpagechange) {
									this._onpagechange.call(this, { valuesIndex: newIndex, title: ctxs[newIndex].name, content: this.value });
								}
							}
						},
						configurable: true
					});

				Object.defineProperty(container, 'onpagechange', {
						get() { return this._onpagechange || null; },
						set(fn) {
							this._onpagechange = typeof fn === 'function' ? fn : null;
						},
						configurable: true
					});

				container._pagesPropsDefined = true;
			}

			const tool = container.querySelector('#opt-addition-active-tool');
			if (!tool) {
				console.warn('Pages Manager: #opt-addition-active-tool not found');
				return;
			}

			const titleInput = tool.querySelector('[data-ref="page-title"]');
			const prevBtn = tool.querySelector('[data-action="pages-prev"]');
			const nextBtn = tool.querySelector('[data-action="pages-next"]');
			const deleteBtn = tool.querySelector('[data-action="pages-delete"]');
			const dropdownBtn = tool.querySelector('[data-action="pages-dropdown"]');

			pagesState.changeHandler = () => updatePagesToolbar();
			container.addEventListener('optText:change', pagesState.changeHandler);

			// 1. INPUT: DIRECTLY SAVES the page name to the dataManager as you type.
			if (titleInput) {
				titleInput.addEventListener('input', (e) => {
						const newName = e.target.value;
						if (container.dataManager) {
							if (container.dataManager.current) {
								container.dataManager.current.name = newName;
							}
							const ctx = container.dataManager.contexts.find(c => c.id === container.contextId);
							if (ctx) {
								ctx.name = newName;
							}
						}
					});

				const finalizeRename = () => {
					updatePagesToolbar();
				};
				titleInput.addEventListener('change', finalizeRename);
				titleInput.addEventListener('blur', finalizeRename);
				titleInput.addEventListener('keydown', (e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							titleInput.blur();
						}
					});
			}

			// 2. DROPDOWN: Appended to document.body to PREVENT overflow clipping
			if (!pagesState.dropdownMenu) {
				pagesState.dropdownMenu = document.createElement('div');
				pagesState.dropdownMenu.id = 'pages-dropdown-menu-global';
				pagesState.dropdownMenu.style.cssText = `
				display: none;
				position: absolute;
				z-index: 10000;
				background: var(--ot-bg-canvas, #fff);
				border: 1px solid var(--ot-border, #ccc);
				border-radius: 4px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.15);
				min-width: 150px;
				max-height: 300px;
				overflow-y: auto;
				`;
				document.body.appendChild(pagesState.dropdownMenu);
			}

			const renderDropdown = () => {
				const ctxs = container.listContexts();
				pagesState.dropdownMenu.innerHTML = ctxs.map(ctx => {
						const isActive = ctx.id === container.contextId;
						const bg = isActive ? 'var(--ot-bg-hover, #e0e0e0)' : 'transparent';
						return `<div class="opt-text-dropdown-item" data-id="${ctx.id}" style="padding:8px 14px; font-size:12px; cursor:pointer; background:${bg}; color:var(--ot-text-primary,#000); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
						${isActive ? '<span style="color:var(--ot-text-primary,#000);font-weight:bold;">✓ </span>' : '<span style="opacity:0;">✓ </span>'}${ctx.name}
						</div>`;
					}).join('');

				pagesState.dropdownMenu.querySelectorAll('.opt-text-dropdown-item').forEach(item => {
						item.addEventListener('click', (e) => {
								e.stopPropagation(); // Prevent document click from firing
								const selectedId = item.getAttribute('data-id');

								// Switch context
								container.switchContext(selectedId);

								// Force the input box to show the new page name immediately
								const selectedCtx = container.dataManager.contexts.find(c => c.id === selectedId);
								if (selectedCtx && titleInput) {
									titleInput.value = selectedCtx.name;
								}

								// Hide dropdown
								pagesState.dropdownMenu.style.display = 'none';
							});

						// Hover effects
						item.addEventListener('mouseenter', () => {
								if (item.getAttribute('data-id') !== container.contextId) {
									item.style.background = 'var(--ot-bg-hover, #f0f0f0)';
								}
							});
						item.addEventListener('mouseleave', () => {
								if (item.getAttribute('data-id') !== container.contextId) {
									item.style.background = 'transparent';
								}
							});
					});
			};

			if (dropdownBtn) {
				dropdownBtn.addEventListener('click', (e) => {
						e.stopPropagation(); // Prevent immediate closing

						const isHidden = pagesState.dropdownMenu.style.display === 'none' || pagesState.dropdownMenu.style.display === '';

						if (isHidden) {
							renderDropdown();
							// Calculate exact position relative to the button
							const rect = dropdownBtn.getBoundingClientRect();
							pagesState.dropdownMenu.style.top = (rect.bottom + 4) + 'px';
							pagesState.dropdownMenu.style.left = rect.left + 'px';
							pagesState.dropdownMenu.style.display = 'block';
						} else {
							pagesState.dropdownMenu.style.display = 'none';
						}
					});
			}

			// Close dropdown when clicking outside
			pagesState.outsideClickHandler = (e) => {
				if (pagesState.dropdownMenu && pagesState.dropdownMenu.style.display === 'block') {
					if (!pagesState.dropdownMenu.contains(e.target) && e.target !== dropdownBtn) {
						pagesState.dropdownMenu.style.display = 'none';
					}
				}
			};
			document.addEventListener('click', pagesState.outsideClickHandler);

			// 3. DELETE CONFIRMATION MODAL
			if (!pagesState.deleteModal) {
				pagesState.deleteModal = document.createElement('div');
				pagesState.deleteModal.className = 'opt-text-modal-overlay';
				pagesState.deleteModal.style.cssText = `
				position: fixed; top: 0; left: 0; right: 0; bottom: 0;
				background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
				z-index: 10000; opacity: 0; visibility: hidden; transition: opacity 0.2s ease, visibility 0s 0.2s;
				`;
				pagesState.deleteModal.innerHTML = `
				<div class="opt-text-modal-dialog" style="transform: translateY(20px); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); max-width: 320px; padding: 20px 16px 24px; background: var(--ot-modal-bg, #ffffff); border-radius: 16px 16px 0 0; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);">
				<div style="width: 40px; height: 4px; background: var(--ot-modal-handle, #ddd); border-radius: 2px; margin: 0 auto 16px;"></div>
				<div style="font-size: 15px; font-weight: 600; color: var(--ot-modal-title, #1a1a1a); text-align: center; margin-bottom: 6px;">Delete Page?</div>
				<div style="font-size: 12px; color: var(--ot-modal-message, #666); text-align: center; line-height: 1.4; margin-bottom: 18px;">Are you sure you want to delete this page? This action cannot be undone.</div>
				<div style="display: flex; gap: 10px;">
				<button class="opt-text-modal-btn opt-text-modal-btn-cancel" data-action="cancel" style="flex: 1; padding: 14px 16px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; background: var(--ot-modal-btn-cancel, #f0f0f0); color: var(--ot-modal-btn-cancel-text, #333);">Cancel</button>
				<button class="opt-text-modal-btn opt-text-modal-btn-confirm" data-action="confirm" style="flex: 1; padding: 14px 16px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; background: var(--ot-danger, #dc3545); color: #ffffff;">Delete</button>
				</div>
				</div>
				`;
				document.body.appendChild(pagesState.deleteModal);

				// Modal event listeners
				const hideModal = () => {
					pagesState.deleteModal.style.opacity = '0';
					pagesState.deleteModal.style.visibility = 'hidden';
					pagesState.deleteModal.querySelector('.opt-text-modal-dialog').style.transform = 'translateY(20px)';
				};

				pagesState.deleteModal.querySelector('[data-action="cancel"]').addEventListener('click', hideModal);

				pagesState.deleteModal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
						hideModal();

						const ctxs = container.listContexts();
						const currentIdx = ctxs.findIndex(c => c.id === container.contextId);

						if (ctxs.length <= 1) {
							api.ui.toast('Cannot delete the only page');
							return;
						}

						const currentId = container.contextId;
						const targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
						const targetId = ctxs[targetIdx].id;

						container.removeContext(currentId);
						container.switchContext(targetId);
						updatePagesToolbar();
						api.ui.toast('Page deleted');
					});

				pagesState.deleteModal.addEventListener('click', (e) => {
						if (e.target === pagesState.deleteModal) {
							hideModal();
						}
					});
			}

			// 4. BUTTON HANDLERS: Navigation and Deletion
			if (prevBtn) {
				prevBtn.addEventListener('click', () => {
						const ctxs = container.listContexts();
						const currentIdx = ctxs.findIndex(c => c.id === container.contextId);
						if (currentIdx > 0) {
							container.switchContext(ctxs[currentIdx - 1].id);
							updatePagesToolbar();
						}
					});
			}

			if (nextBtn) {
				nextBtn.addEventListener('click', () => {
						const ctxs = container.listContexts();
						const currentIdx = ctxs.findIndex(c => c.id === container.contextId);

						if (currentIdx < ctxs.length - 1) {
							container.switchContext(ctxs[currentIdx + 1].id);
						} else {
							const newName = `Page ${ctxs.length + 1}`;
							container.addContext(newName, ['']);
							const updatedCtxs = container.listContexts();
							const newCtx = updatedCtxs[updatedCtxs.length - 1];
							if (newCtx) container.switchContext(newCtx.id);
						}
						updatePagesToolbar();
					});
			}

			if (deleteBtn) {
				deleteBtn.addEventListener('click', () => {
						const ctxs = container.listContexts();
						if (ctxs.length <= 1) {
							api.ui.toast('Cannot delete the only page');
							return;
						}

						// Show confirmation modal
						const modal = pagesState.deleteModal;
						void modal.offsetWidth; // Trigger reflow for transition
						modal.style.opacity = '1';
						modal.style.visibility = 'visible';
						modal.querySelector('.opt-text-modal-dialog').style.transform = 'translateY(0)';
					});
			}

			updatePagesToolbar();
		},

		cleanup: () => {
			if (pagesState.container && pagesState.changeHandler) {
				pagesState.container.removeEventListener('optText:change', pagesState.changeHandler);
			}
			if (pagesState.outsideClickHandler) {
				document.removeEventListener('click', pagesState.outsideClickHandler);
			}
			if (pagesState.dropdownMenu && pagesState.dropdownMenu.parentNode) {
				pagesState.dropdownMenu.parentNode.removeChild(pagesState.dropdownMenu);
				pagesState.dropdownMenu = null;
			}
			if (pagesState.deleteModal && pagesState.deleteModal.parentNode) {
				pagesState.deleteModal.parentNode.removeChild(pagesState.deleteModal);
				pagesState.deleteModal = null;
			}
			pagesState.container = null;
			pagesState.api = null;
			pagesState.changeHandler = null;
			pagesState.outsideClickHandler = null;
		}
	});