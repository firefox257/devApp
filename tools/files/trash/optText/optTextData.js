// ./system/ux/optText/optTextData.js
// ==========================================
// ✅ COMMAND PATTERN WITH COALESCING
// ==========================================
const log= console.log;


export class EditCommand {
	constructor(type, startLine, startCol, endLine, endCol, text, cursorAfter, selectionAfter) {
		this.type = type; // 'insert', 'delete', or 'replace'
		this.startLine = startLine;
		this.startCol = startCol;
		this.endLine = endLine;
		this.endCol = endCol;
		this.text = text;
		this.cursorAfter = cursorAfter || { line: startLine, col: startCol };
		this.selectionAfter = selectionAfter || { active: false };

		// ✅ These will be populated on the first execute()
		this.cursorBefore = null;
		this.selectionBefore = null;
		this.affectedLinesBefore = [];
		this.affectedLinesAfter = [];
	}

	execute(ctx) {
		const { lines, cursor, selection, updateMetrics, setNeedsRender } = ctx;

		// ✅ CRITICAL FIX 1: Only capture "before" state on the VERY FIRST execution.
		if (this.cursorBefore === null) {
			this.cursorBefore = { line: cursor.line, col: cursor.col };
			this.selectionBefore = selection.active ? {
				active: true, anchor: { ...selection.anchor }, focus: { ...selection.focus }
			} : { active: false };
			this.affectedLinesBefore = lines.slice(this.startLine, this.endLine + 1);
		}

		// ✅ CRITICAL FIX 2: UNIFIED & BULLETPROOF EDIT LOGIC
		const startLineText = lines[this.startLine] !== undefined ? lines[this.startLine] : '';
		const endLineText = lines[this.endLine] !== undefined ? lines[this.endLine] : '';

		const prefix = startLineText.slice(0, this.startCol);
		const suffix = endLineText.slice(this.endCol);

		const newContent = prefix + this.text + suffix;
		const newLines = newContent.split('\n');

		const linesToRemove = this.endLine - this.startLine + 1;
		lines.splice(this.startLine, linesToRemove, ...newLines);

		// ✅ Capture the "after" state for future Undo operations
		this.affectedLinesAfter = lines.slice(this.startLine, this.startLine + newLines.length);

		// Update cursor and selection
		cursor.line = this.cursorAfter.line;
		cursor.col = this.cursorAfter.col;

		selection.active = this.selectionAfter.active;
		if (this.selectionAfter.active) {
			selection.anchor = { ...this.selectionAfter.anchor };
			selection.focus = { ...this.selectionAfter.focus };
		}

		if (updateMetrics) updateMetrics();
		if (setNeedsRender) setNeedsRender();
	}

	undo(ctx) {
		console.log("here1");
		const { lines, cursor, selection, updateMetrics, setNeedsRender } = ctx;

		// ✅ Symmetrical to execute(): remove exactly the lines we added, put back the originals
		const linesToRemove = this.affectedLinesAfter.length;
		lines.splice(this.startLine, linesToRemove, ...this.affectedLinesBefore);

		if (this.cursorBefore) {
			cursor.line = this.cursorBefore.line;
			cursor.col = this.cursorBefore.col;
		}
		if (this.selectionBefore) {
			selection.active = this.selectionBefore.active;
			if (this.selectionBefore.active) {
				selection.anchor = { ...this.selectionBefore.anchor };
				selection.focus = { ...this.selectionBefore.focus };
			}
		} else {
			selection.active = false;
		}

		if (updateMetrics) updateMetrics();
		if (setNeedsRender) setNeedsRender();
	}
}

export class CompoundCommand {
	constructor(firstCommand) {
		this.commands = [firstCommand];
		this.lastCommand = firstCommand;
	}
	add(command) {
		this.commands.push(command);
		this.lastCommand = command;
	}
	execute(ctx) {
		this.commands.forEach(cmd => cmd.execute(ctx));
		if (ctx.setNeedsRender) ctx.setNeedsRender();
	}
	undo(ctx) {
		console.log("here2");
		for (let i = this.commands.length - 1; i >= 0; i--) {
			this.commands[i].undo(ctx);
		}
	}
}

export class HistoryManager {
	constructor(config = {}) {
		this.undoStack = [];
		this.redoStack = [];
		this.suppressNext = false;
		this.config = { maxEntries: 100, coalesceThreshold: 400, ...config };
		this.lastOpTime = 0;
		this.currentCompoundCommand = null;
	}

	push(command) {
		console.log("push");
		if (this.suppressNext) return;
		const now = Date.now();

		// ✅ 1. IDENTIFY OPERATION TYPES
		const isTyping = command.type === 'insert' && command.text.length === 1 && !command.text.includes('\n');
		const isDeleting = command.type === 'delete' &&
		command.startLine === command.endLine &&
		command.endCol - command.startCol === 1;

		// ✅ SPECIAL CASE: ENTER KEY
		console.log("command type:"+command.type);
		
		const isEnter = command.type === 'insert' && command.text === '\n';

		let canCoalesce = false;
		if (this.currentCompoundCommand && !command.selectionBefore?.active) {
			const lastCmd = this.currentCompoundCommand.lastCommand;
			const timeDiff = (now - this.lastOpTime) < this.config.coalesceThreshold;

			// ✅ 2. ENTER COALESCING LOGIC
			// Multiple Enters pressed in quick succession should be grouped together
			const lastWasEnter = lastCmd.type === 'insert' && lastCmd.text === '\n';

			if (isEnter && lastWasEnter && timeDiff) {
				// Check if the new Enter is exactly where the last one left the cursor
				canCoalesce = command.startLine === lastCmd.cursorAfter.line && command.startCol === lastCmd.cursorAfter.col;
			}
			// ✅ 3. TYPING/DELETING COALESCING LOGIC (MUST NOT BE ENTER)
			else if ((isTyping || isDeleting) && !isEnter) {
				const sameLine = command.startLine === lastCmd.startLine;
				if (timeDiff && sameLine) {
					if (isTyping && lastCmd.type === 'insert' && lastCmd.text.length === 1 && !lastCmd.text.includes('\n')) {
						canCoalesce = command.startCol === lastCmd.cursorAfter.col;
					} else if (isDeleting && lastCmd.type === 'delete') {
						canCoalesce = command.startCol === lastCmd.startCol || command.endCol === lastCmd.startCol;
					}
				}
			}
		}

		if (canCoalesce) {
			console.log("add compound");
			this.currentCompoundCommand.add(command);
		} else {
			// ✅ 4. BREAK COALESCING
			// If we can't coalesce, push the current compound command to the stack and start fresh
			if (this.currentCompoundCommand) {
				this.undoStack.push(this.currentCompoundCommand);
				this.currentCompoundCommand = null;
			}

			// ✅ 5. START NEW COMPOUND COMMAND
			// Typing, Deleting, AND Enter all get their own "compound" buckets
			
			console.log("isEnter:"+isEnter);
			console.log("");
			
			if ((isTyping || isDeleting || isEnter) && !command.selectionBefore?.active) {
				console.log("new compound");
				this.currentCompoundCommand = new CompoundCommand(command);
			} else {
				// Everything else (paste, replace, etc.) goes directly to the stack
				this.undoStack.push(command);
			}
		}

		this.lastOpTime = now;
		this.redoStack = [];

		if (this.undoStack.length > this.config.maxEntries) {
			this.undoStack.shift();
		}
	}

	undo(ctx) {
		console.log("here3");
		if (this.currentCompoundCommand) {
			console.log("iscompound");
			this.undoStack.push(this.currentCompoundCommand);
			this.currentCompoundCommand = null;
		}
		const command = this.undoStack.pop();
		if (command) {
			console.log("command");
			command.undo(ctx);
			this.redoStack.push(command);
			return true;
		}
		return false;
	}

	redo(ctx) {
		const command = this.redoStack.pop();
		if (command) {
			command.execute(ctx);
			this.undoStack.push(command);
			return true;
		}
		return false;
	}

	clear() {
		this.undoStack = [];
		this.redoStack = [];
		this.currentCompoundCommand = null;
		this.suppressNext = false;
	}

	canUndo() {
		return this.undoStack.length + (this.currentCompoundCommand ? 1 : 0) > 0;
	}

	canRedo() {
		return this.redoStack.length > 0;
	}
}

// ==========================================
// ✅ END COMMAND PATTERN
// ==========================================

export class TextContext {
	constructor(name, initialLines = [''], options = {}) {
		this.id = crypto?.randomUUID?.() || `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		this.name = name || 'Untitled';
		this.lines = Array.isArray(initialLines) ? [...initialLines] : [String(initialLines)];
		this.history = new HistoryManager(options.historyConfig);
		this.metadata = {
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			version: 1,
			...(options.metadata || {})
		};
	}

	get value() { return this.lines.join('\n'); }

	set value(v) {
		if (typeof v !== 'string') return;
		this.lines.length = 0;
		this.lines.push(...v.split('\n'));
		if (this.lines.length === 0) this.lines.push('');

		// ✅ CRITICAL FIX 3: Clear history to prevent Ctrl+Z from corrupting the new state
		this.history.clear();
		this.markModified();
	}

	markModified() {
		this.metadata.modifiedAt = Date.now();
		this.metadata.version = (this.metadata.version || 1) + 1;
	}
}

export class TextDataManager {
	constructor(initialContexts = []) {
		this.contexts = [];
		this._currentIndex = -1;

		if (Array.isArray(initialContexts) && initialContexts.length > 0) {
			initialContexts.forEach(ctx => {
					if (ctx?.name) {
						this.contexts.push(new TextContext(ctx.name, ctx.lines || [''], ctx.options || {}));
					}
				});
			if (this.contexts.length > 0) this._currentIndex = 0;
		}

		if (this.contexts.length === 0) {
			this.contexts.push(new TextContext('default'));
			this._currentIndex = 0;
		}
	}

	get current() { return this.contexts[this._currentIndex] || null; }
	get currentIndex() { return this._currentIndex; }
	get data() { return this.contexts; }
	get count() { return this.contexts.length; }

	addContext(name, initialLines = [''], options = {}) {
		const ctx = new TextContext(name, initialLines, options);
		this.contexts.push(ctx);
		if (options.switchTo !== false) this._currentIndex = this.contexts.length - 1;
		return ctx.id;
	}

	setCurrent(identifier) {
		let idx = -1;
		if (typeof identifier === 'number') idx = identifier;
		else if (typeof identifier === 'string') {
			idx = this.contexts.findIndex(c => c.id === identifier);
			if (idx === -1) idx = this.contexts.findIndex(c => c.name === identifier);
		} else if (identifier?.id) {
			idx = this.contexts.findIndex(c => c.id === identifier.id);
		}

		if (idx >= 0 && idx < this.contexts.length) {
			this._currentIndex = idx;
			return true;
		}
		return false;
	}

	removeContext(identifier) {
		let idx = -1;
		if (typeof identifier === 'number') idx = identifier;
		else if (typeof identifier === 'string') {
			idx = this.contexts.findIndex(c => c.id === identifier || c.name === identifier);
		}

		if (idx === -1) return false;

		if (this.contexts.length <= 1) {
			console.warn('[TextDataManager] Cannot remove the last remaining context.');
			return false;
		}

		this.contexts.splice(idx, 1);

		if (this._currentIndex === idx) {
			this._currentIndex = Math.min(idx, this.contexts.length - 1);
		} else if (this._currentIndex > idx) {
			this._currentIndex--;
		}
		return true;
	}

	listContexts() {
		return this.contexts.map((ctx, idx) => ({
					id: ctx.id, name: ctx.name, isActive: idx === this._currentIndex,
					lineCount: ctx.lines.length, modifiedAt: ctx.metadata.modifiedAt
				}));
	}

	toJSON() {
		return {
			currentIdx: this._currentIndex,
			contexts: this.contexts.map(ctx => ({
						id: ctx.id, name: ctx.name, lines: [...ctx.lines],
						history: { undoCount: ctx.history.undoStack.length, redoCount: ctx.history.redoStack.length },
						metadata: { ...ctx.metadata }
					}))
		};
	}
}