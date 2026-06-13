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
    this.cursorBefore = null;
    this.selectionBefore = null;
    this.affectedLinesBefore = [];
    this.affectedLinesAfter = [];
  }

  execute(ctx) {
    const { lines, cursor, selection, updateMetrics, setNeedsRender } = ctx;
    this.cursorBefore = { line: cursor.line, col: cursor.col };
    this.selectionBefore = selection.active ? { 
      active: true, anchor: { ...selection.anchor }, focus: { ...selection.focus } 
    } : { active: false };

    this.affectedLinesBefore = lines.slice(this.startLine, this.endLine + 1);

    if (this.type === 'insert' || this.type === 'replace') {
      const currentLine  = lines[this.startLine] !== undefined ? lines[this.startLine] : '';
      const before = currentLine.slice(0, this.startCol);
      const after = this.type === 'replace'  && lines[this.endLine] !== undefined 
        ? lines[this.endLine].slice(this.endCol) 
        : currentLine.slice(this.startCol);
      
      if (this.text.includes('\n')) {
        const parts = this.text.split('\n');
        lines[this.startLine] = before + parts[0];
        if (parts.length > 1) {
          const ins = parts.slice(1);
          ins[ins.length - 1] += after;
          lines.splice(this.startLine + 1, 0, ...ins);
        }
      } else {
        lines[this.startLine] = before  + this.text + after;
      }
      
      // ✅ FIX: Calculate how many lines the new text actually spans
      if (this.type === 'replace' && (this.endLine > this.startLine)) {
        const linesWritten = this.text.includes('\n') ? this.text.split('\n').length : 1;
        const linesToDelete = this.endLine - this.startLine;
        
        // Start deleting AFTER the newly written lines
        if (linesToDelete > 0) {
          lines.splice(this.startLine + linesWritten, linesToDelete);
        }
      }
    } else if (this.type === 'delete') {
      const firstLine = lines[this.startLine];
      const lastLine = lines[this.endLine];
      const newLine = firstLine.slice(0, this.startCol) + lastLine.slice(this.endCol);
      lines.splice(this.startLine, this.endLine - this.startLine + 1, newLine);
    }

    const actualEndLine = this.type === 'delete' 
      ? this.startLine 
      : this.startLine + (this.text.split('\n').length - 1);
      
    this.affectedLinesAfter = lines.slice(this.startLine, actualEndLine + 1);

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
    lines.splice(this.startLine, this.affectedLinesAfter.length, ...this.affectedLinesBefore);

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
    
    // ✅ SMART COALESCING: Group rapid typing on the same line
    const canCoalesce = this.currentCompoundCommand  && 
                        command.type === 'insert'  && 
                        !command.selectionBefore?.active  &&
                        !command.text.includes('\n')  &&
                        (now - this.lastOpTime)  < this.config.coalesceThreshold  &&
                        command.startLine === this.currentCompoundCommand.lastCommand.startLine  &&
                        command.startCol === this.currentCompoundCommand.lastCommand.cursorAfter.col;

    if (canCoalesce) {
      this.currentCompoundCommand.add(command);
    } else {
      if (this.currentCompoundCommand) {
        this.undoStack.push(this.currentCompoundCommand);
        this.currentCompoundCommand = null;
      }
      
      if (command.type === 'insert'  && !command.selectionBefore?.active  && !command.text.includes('\n')) {
        this.currentCompoundCommand = new CompoundCommand(command);
      } else {
        this.undoStack.push(command);
      }
    }

    this.lastOpTime = now;
    this.redoStack = [];

    if (this.undoStack.length  > this.config.maxEntries) {
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
      idx = this.contexts.findIndex(c => c.name === identifier || c.id === identifier);
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
    if (this.contexts.length <= 1) throw new Error('Cannot remove the last remaining context.');
    
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