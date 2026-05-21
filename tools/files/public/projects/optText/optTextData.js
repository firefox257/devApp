// ./system/ux/optTextData.js
export class HistoryManager {
  constructor(config = {}) {
    this.undoStack = [];
    this.redoStack = [];
    this.suppressNext = false;
    this.config = { maxEntries: 100, disableCoalesce: false, ...config };
  }
  push(entry) {
    if (this.suppressNext) return;
    this.undoStack.push(entry);
    this.redoStack = [];
    if (this.undoStack.length > this.config.maxEntries) {
      this.undoStack.shift();
    }
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.suppressNext = false;
  }
}

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
  
  // ✅ NEW: Remove context by Index, ID, or Name
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