// ./system/ux/optText/optTextData.js
// ==========================================
// ✅ COMMAND PATTERN WITH COALESCING
// ==========================================
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
    // If we don't do this, Redo (or CompoundCommand.execute) will overwrite 
    // the original state with the intermediate state, breaking Undo.
    if (this.cursorBefore === null) {
      this.cursorBefore = { line: cursor.line, col: cursor.col };
      this.selectionBefore = selection.active ? { 
        active: true, anchor: { ...selection.anchor }, focus: { ...selection.focus } 
      } : { active: false };
      this.affectedLinesBefore = lines.slice(this.startLine, this.endLine + 1);
    }

    // ✅ CRITICAL FIX 2: UNIFIED & BULLETPROOF EDIT LOGIC
    // 1. Get the text before the edit (prefix) and after the edit (suffix)
    const startLineText = lines[this.startLine] !== undefined ? lines[this.startLine] : '';
    const endLineText = lines[this.endLine] !== undefined ? lines[this.endLine] : '';
    
    const prefix = startLineText.slice(0, this.startCol);
    const suffix = endLineText.slice(this.endCol);
    
    // 2. Combine them with the new text
    const newContent = prefix + this.text + suffix;
    
    // 3. Split the result into an array of lines
    const newLines = newContent.split('\n');
    
    // 4. Replace the affected lines in the document
    // We are replacing from this.startLine to this.endLine (inclusive)
    const linesToRemove = this.endLine - this.startLine + 1;
    lines.splice(this.startLine, linesToRemove, ...newLines);

    // 5. Capture the "after" state for future Undo operations
    this.affectedLinesAfter = lines.slice(this.startLine, this.startLine + newLines.length);

    // 6. Update cursor and selection
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
    if (this.suppressNext) return;
    const now = Date.now();
    
    // ✅ IMPROVED COALESCING: Now supports both continuous typing AND continuous backspacing/deleting
    const isTyping = command.type === 'insert' && command.text.length === 1 && !command.text.includes('\n');
    const isDeleting = command.type === 'delete' && 
                       command.affectedLinesBefore.length === 1 && 
                       command.affectedLinesAfter.length === 1 &&
                       command.affectedLinesBefore[0].length - command.affectedLinesAfter[0].length === 1;

    let canCoalesce = false;
    if (this.currentCompoundCommand && (isTyping || isDeleting) && !command.selectionBefore?.active) {
        const lastCmd = this.currentCompoundCommand.lastCommand;
        const timeDiff = (now - this.lastOpTime) < this.config.coalesceThreshold;
        const sameLine = command.startLine === lastCmd.startLine;
        
        if (timeDiff && sameLine) {
            if (isTyping && lastCmd.type === 'insert') {
                // Typing moves the cursor right
                canCoalesce = command.startCol === lastCmd.cursorAfter.col;
            } else if (isDeleting && lastCmd.type === 'delete') {
                // Deleting moves the cursor left
                canCoalesce = command.startCol === lastCmd.startCol - 1;
            }
        }
    }

    if (canCoalesce) {
      this.currentCompoundCommand.add(command);
    } else {
      if (this.currentCompoundCommand) {
        this.undoStack.push(this.currentCompoundCommand);
        this.currentCompoundCommand = null;
      }
      
      // ✅ Start a new compound command for single-char typing OR deleting
      if ((isTyping || isDeleting) && !command.selectionBefore?.active) {
        this.currentCompoundCommand = new CompoundCommand(command);
      } else {
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
    if (this.currentCompoundCommand) {
      this.undoStack.push(this.currentCompoundCommand);
      this.currentCompoundCommand = null;
    }
    const command = this.undoStack.pop();
    if (command) {
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
    // if this setter is used directly instead of the editor's command system.
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
      // ✅ Prioritize exact ID matches over Name matches to prevent collisions
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
    
    // ✅ Soft-fail instead of throwing an error, which could crash the UI
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