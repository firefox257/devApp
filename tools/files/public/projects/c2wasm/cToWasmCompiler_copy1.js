// cToWasmCompiler.js
/**
 * C-to-WebAssembly Compiler (Subset)
 * Architecture: Tokenizer → Parser → WasmBuilder → Compiler
 * 
 * ✅ FIXED: Proper WASM local declarations in Code Section
 */
const WASM_TYPE = {
  i32: 0x7F, i64: 0x7E, f32: 0x7D, f64: 0x7C, funcref: 0x70, void: 0x40
};

const C_TYPE_MAP = {
  int: WASM_TYPE.i32, char: WASM_TYPE.i32, bool: WASM_TYPE.i32,
  float: WASM_TYPE.f32, double: WASM_TYPE.f64, void: WASM_TYPE.void
};

const OP_CODES = {
  add: 0x6A, sub: 0x6B, mul: 0x6C, div_s: 0x6D, div_u: 0x6E,
  rem_s: 0x6F, rem_u: 0x70, and: 0x71, or: 0x72, xor: 0x73,
  shl: 0x74, shr_s: 0x75, shr_u: 0x76,
  eqz: 0x45, eq: 0x46, ne: 0x47, lt_s: 0x48, lt_u: 0x49,
  gt_s: 0x4A, gt_u: 0x4B, le_s: 0x4C, le_u: 0x4D, ge_s: 0x4E, ge_u: 0x4F,
  i32_const: 0x41, i64_const: 0x42, local_get: 0x20, local_set: 0x21, local_tee: 0x22,
  i32_load: 0x28, i64_load: 0x29, f32_load: 0x2A, f64_load: 0x2B,
  i32_store: 0x36, i64_store: 0x37, f32_store: 0x38, f64_store: 0x39,
  block: 0x02, loop: 0x03, if_: 0x04, else_: 0x05, br: 0x0C, return: 0x0F, call: 0x10,
  nop: 0x01, end: 0x0B, f32_const: 0x43
};

// --- Utility: LEB128 Encoding ---
function uleb(n) {
  n = BigInt(n);
  const b = [];
  do {
    let byte = Number(n & 0x7Fn);
    n >>= 7n;
    if (n !== 0n) byte |= 0x80;
    b.push(byte);
  } while (n !== 0n);
  return b;
}

function sleb(n) {
  n = BigInt(n);
  const b = [];
  let more = true, neg = n < 0n;
  while (more) {
    let byte = Number(n & 0x7Fn);
    n >>= 7n;
    let done = neg ? (n === -1n && (byte & 0x40) !== 0) : (n === 0n && (byte & 0x40) === 0);
    if (!done) byte |= 0x80;
    b.push(byte);
    if (done) more = false;
  }
  return b;
}

function withLen(d) { return [...uleb(d.length), ...d]; }

// --- Tokenizer ---
class CTokenizer {
  static tokenize(src) {
    src = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = [];
    const patterns = [
      /^[a-zA-Z_]\w*/,
      /^\d+\.\d*([eE][+-]?\d+)?|^\.\d+([eE][+-]?\d+)?|^\d+([eE][+-]?\d+)?/,
      /^'.'/, /^"[^"]*"/,
      /^==|^!=|^<=|^>=|^&&|^\|\||^[+\-*/%&|^=!<>~]/,
      /^[(){}[\],;?:]/,
      /^\s+/
    ];
    let i = 0;
    while (i < src.length) {
      let matched = false;
      for (const p of patterns) {
        const m = src.slice(i).match(p);
        if (m) {
          const tok = m[0].trim();
          if (tok) tokens.push(tok);
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) throw new Error(`Unexpected char at ${i}: ${src[i]}`);
    }
    return tokens;
  }
}

// --- Parser (Recursive Descent) ---
class CParser {
  constructor(tokens, compiler) {
    this.tokens = tokens;
    this.pos = 0;
    this.compiler = compiler;
    this.scopeStack = [new Map()];
    this.locals = [];
    this.localIdx = 0;
    this.controlDepth = 0;
    this.breakTarget = [];
    this.continueTarget = [];
    this.lastType = 'i32';
    this.pendingAssignment = null;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }
  expect(t) {
    const n = this.consume();
    if (n !== t) throw new Error(`Expected '${t}' got '${n}'`);
    return n;
  }
  isType(t) { return t in C_TYPE_MAP; }

  parseType() {
    const t = this.consume();
    if (!this.isType(t)) throw new Error(`Unknown type: ${t}`);
    let ptr = false;
    if (this.peek() === '*') { this.consume(); ptr = true; }
    return { wasm: C_TYPE_MAP[t], ptr, name: t };
  }

  parsePrimary() {
    const t = this.peek();
    
    if (/^[a-zA-Z_]\w*$/.test(t) && this.tokens[this.pos + 1] === '=') {
      this.pendingAssignment = this.consume();
      return [];
    }
    
    if (/^\d/.test(t) || (t === '.' && /^\.\d/.test(this.tokens.slice(this.pos).join('')))) {
      const n = this.consume();
      const isFloat = n.includes('.') || /[eE]/.test(n);
      if (isFloat) {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setFloat32(0, parseFloat(n), true);
        this.lastType = 'f32';
        return [OP_CODES.f32_const, ...new Uint8Array(buf)];
      }
      this.lastType = 'i32';
      return [OP_CODES.i32_const, ...sleb(parseInt(n))];
    }
    if (t === '"') {
      let s = '';
      this.consume();
      while (this.peek() !== '"') s += this.consume();
      this.consume();
      const addr = this.compiler.registerString(s + '\0');
      this.lastType = 'i32';
      return [OP_CODES.i32_const, ...sleb(addr)];
    }
    if (this.isType(t)) {
      const targetType = this.parseType();
      this.expect('(');
      const expr = this.parseExpression();
      this.expect(')');
      this.lastType = targetType.name;
      return expr;
    }
    if (t === '&' || t === '*') {
      const op = this.consume();
      const inner = this.parsePrimary();
      if (op === '&') { this.lastType = 'i32'; return inner; }
      if (op === '*') { this.lastType = 'i32'; return [...inner, OP_CODES.i32_load, 0x02, 0x00]; }
    }
    if (t === '(') {
      this.consume();
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    const name = this.consume();
    const scope = this.scopeStack[this.scopeStack.length - 1];
    if (this.peek() === '(') {
      this.consume();
      const args = [];
      while (this.peek() !== ')') {
        args.push(...this.parseExpression());
        if (this.peek() === ',') this.consume();
      }
      this.consume();
      this.lastType = 'i32';
      const funcIdx = this.compiler.getFuncIdx(name) ?? -1;
      return [...args.flat(), OP_CODES.call, ...uleb(funcIdx)];
    }
    if (scope.has(name)) {
      const info = scope.get(name);
      this.lastType = info.type;
      return [OP_CODES.local_get, ...uleb(info.idx)];
    }
    throw new Error(`Unknown identifier: ${name}`);
  }

  parseUnary() { return this.parsePrimary(); }
  
  parseMultiplicative() {
    let ops = this.parseUnary();
    while (['*', '/', '%'].includes(this.peek())) {
      const op = this.consume();
      const rhs = this.parseUnary();
      const opCode = op === '*' ? OP_CODES.mul : op === '/' ? OP_CODES.div_s : OP_CODES.rem_s;
      ops = [...ops, ...rhs, opCode];
    }
    this.lastType = 'i32';
    return ops;
  }
  
  parseAdditive() {
    let ops = this.parseMultiplicative();
    while (['+', '-'].includes(this.peek())) {
      const op = this.consume();
      const rhs = this.parseMultiplicative();
      ops = [...ops, ...rhs, op === '+' ? OP_CODES.add : OP_CODES.sub];
    }
    return ops;
  }
  
  parseComparison() {
    let ops = this.parseAdditive();
    const cmpOps = {
      '==': OP_CODES.eq, '!=': OP_CODES.ne, '<': OP_CODES.lt_s, '>': OP_CODES.gt_s,
      '<=': OP_CODES.le_s, '>=': OP_CODES.ge_s
    };
    if (cmpOps[this.peek()]) {
      const op = this.consume();
      const rhs = this.parseAdditive();
      ops = [...ops, ...rhs, cmpOps[op]];
      this.lastType = 'bool';
    }
    return ops;
  }
  
  parseLogicalAnd() {
    let ops = this.parseComparison();
    while (this.peek() === '&&') {
      this.consume();
      const rhs = this.parseComparison();
      ops = [...ops, ...rhs, OP_CODES.and];
    }
    return ops;
  }
  
  parseExpression() {
    let lhsName = this.pendingAssignment;
    this.pendingAssignment = null;
    
    let ops = this.parseLogicalAnd();
    
    if (this.peek() === '=' && lhsName) {
      this.consume();
      const rhs = this.parseExpression();
      const scope = this.scopeStack[this.scopeStack.length - 1];
      const varInfo = scope.get(lhsName);
      if (!varInfo) throw new Error(`Undefined variable: ${lhsName}`);
      return [...rhs, OP_CODES.local_set, ...uleb(varInfo.idx)];
    }
    
    return ops;
  }

  parseStatement() {
    const t = this.peek();
    if (t === '{') {
      this.consume();
      this.scopeStack.push(new Map());
      const stmts = [];
      while (this.pos < this.tokens.length && this.peek() !== '}') {
        stmts.push(...this.parseStatement());
      }
      this.expect('}');
      this.scopeStack.pop();
      return stmts;
    }
    if (t === 'if') {
      this.consume(); this.expect('(');
      const cond = this.parseExpression();
      this.expect(')');
      const body = this.parseStatement();
      let elseBody = [];
      if (this.peek() === 'else') {
        this.consume();
        elseBody = this.parseStatement();
      }
      return [...cond, OP_CODES.if_, WASM_TYPE.void, ...body, OP_CODES.else_, ...elseBody, OP_CODES.end];
    }
    if (t === 'while') {
      this.consume(); this.expect('(');
      const cond = this.parseExpression();
      this.expect(')');
      this.controlDepth++; this.breakTarget.push(this.controlDepth-1); this.continueTarget.push(this.controlDepth-1);
      const body = this.parseStatement();
      this.breakTarget.pop(); this.continueTarget.pop();
      return [OP_CODES.block, WASM_TYPE.void, OP_CODES.loop, WASM_TYPE.void, ...cond, OP_CODES.if_, WASM_TYPE.void, ...body, OP_CODES.end, OP_CODES.br, 0x01, OP_CODES.end, OP_CODES.end];
    }
    if (t === 'for') {
      this.consume(); this.expect('(');
      const init = this.peek() !== ';' ? this.parseStatement() : [];
      this.expect(';');
      const cond = this.peek() !== ';' ? this.parseExpression() : [OP_CODES.i32_const, 0x01];
      this.expect(';');
      const inc = this.peek() !== ')' ? this.parseExpression() : [];
      this.expect(')');
      this.controlDepth++; this.breakTarget.push(this.controlDepth-1); this.continueTarget.push(this.controlDepth-1);
      const body = this.parseStatement();
      this.breakTarget.pop(); this.continueTarget.pop();
      return [...init, OP_CODES.block, WASM_TYPE.void, OP_CODES.loop, WASM_TYPE.void, ...cond, OP_CODES.if_, WASM_TYPE.void, ...body, ...inc, OP_CODES.end, OP_CODES.br, 0x01, OP_CODES.end, OP_CODES.end];
    }
    if (t === 'break') { this.consume(); this.expect(';'); return [OP_CODES.br, ...uleb(this.breakTarget.length - 1)]; }
    if (t === 'continue') { this.consume(); this.expect(';'); return [OP_CODES.br, ...uleb(this.continueTarget.length - 1)]; }
    if (t === 'return') {
      this.consume();
      const expr = this.peek() === ';' ? [] : this.parseExpression();
      if (this.peek() === ';') this.consume();
      return [...expr, OP_CODES.return];
    }
    if (this.isType(t)) {
      const typeInfo = this.parseType();
      const name = this.consume();
      if (this.peek() === '=') {
        this.consume();
        const expr = this.parseExpression();
        const idx = this.localIdx++;
        this.locals.push({ idx, wasm: typeInfo.wasm, type: typeInfo.name, ptr: typeInfo.ptr });
        this.scopeStack[this.scopeStack.length - 1].set(name, { idx, type: typeInfo.name });
        if (this.peek() === ';') this.consume();
        return [...expr, OP_CODES.local_set, ...uleb(idx)];
      }
      if (this.peek() === ';') this.consume();
      const idx = this.localIdx++;
      this.locals.push({ idx, wasm: typeInfo.wasm, type: typeInfo.name, ptr: typeInfo.ptr });
      this.scopeStack[this.scopeStack.length - 1].set(name, { idx, type: typeInfo.name });
      return [OP_CODES.i32_const, 0x00, OP_CODES.local_set, ...uleb(idx)];
    }
    const expr = this.parseExpression();
    if (this.peek() === ';') this.consume();
    return expr;
  }

  parseFunction(name, params, retType) {
    this.expect('{');
    const bodyOps = [];
    while (this.pos < this.tokens.length && this.peek() !== '}') {
      bodyOps.push(...this.parseStatement());
    }
    this.expect('}');
    // ✅ FIXED: Return locals array for Code Section generation
    return { params, ret: C_TYPE_MAP[retType], body: [...bodyOps, OP_CODES.end], locals: this.locals };
  }
}

// --- WASM Binary Generator ---
class CWasmBuilder {
  constructor() { this.funcs = []; this.data = []; this.nextData = 0; }
  
  registerString(s) {
    const addr = this.nextData;
    this.data.push(...Array.from(s).map(c => c.charCodeAt(0)));
    this.nextData += s.length;
    return addr;
  }

  // ✅ FIXED: Accept locals array
  addFunction(name, params, retType, bodyOps, isPublic, locals = []) {
    this.funcs.push({ name, params, retType, body: bodyOps, isPublic, idx: this.funcs.length, locals });
  }

  generate() {
    // Type Section
    const types = this.funcs.map(f => {
      const paramTypes = f.params.map(p => C_TYPE_MAP[p]);
      const resultTypes = f.retType === 'void' ? [] : [C_TYPE_MAP[f.retType]];
      return [0x60, ...uleb(paramTypes.length), ...paramTypes, ...uleb(resultTypes.length), ...resultTypes];
    });
    
    // Function Section
    const funcIdxs = this.funcs.map(() => uleb(0)).flat();
    
    // ✅ FIXED: Dynamically generate local declarations per function
    const code = this.funcs.map(f => {
      // Group explicit locals by type (exclude parameters which are implicit locals)
      const localGroups = {};
      for (const loc of f.locals) {
        if (loc.idx >= f.params.length) {
          const type = loc.wasm;
          if (!localGroups[type]) localGroups[type] = 0;
          localGroups[type]++;
        }
      }
      
      const decls = [];
      for (const type in localGroups) {
        decls.push(...uleb(localGroups[type]), Number(type));
      }
      
      const bodyWithLocals = [...uleb(Object.keys(localGroups).length), ...decls, ...f.body];
      return [...uleb(bodyWithLocals.length), ...bodyWithLocals];
    }).flat();

    // Export Section
    const exportList = [];
    this.funcs.forEach((f, i) => {
      if (f.isPublic || f.name === 'main') exportList.push({ name: f.name, kind: 0, index: i });
    });
    exportList.push({ name: 'memory', kind: 2, index: 0 });

    let exportsData = [...uleb(exportList.length)];
    for (const exp of exportList) {
      const nameBytes = Array.from(exp.name).map(c => c.charCodeAt(0));
      exportsData.push(...uleb(nameBytes.length), ...nameBytes, exp.kind, ...uleb(exp.index));
    }

    const sections = [
      { id: 1, data: [types.length, ...types.flat()] },
      { id: 3, data: [this.funcs.length, ...funcIdxs] },
      { id: 5, data: [1, 0, 1] },
      { id: 6, data: [0] },
      { id: 7, data: exportsData },
      { id: 10, data: [this.funcs.length, ...code] },
      { id: 11, data: [1, 0, 0x41, 0x00, 0x0B, ...uleb(this.data.length), ...this.data] }
    ];

    let wasm = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    sections.forEach(s => wasm.push(s.id, ...withLen(s.data)));
    return new Uint8Array(wasm);
  }
}

// --- Compiler Orchestrator ---
class CCompiler {
  constructor() { this.builder = new CWasmBuilder(); }
  registerString(s) { return this.builder.registerString(s); }
  getFuncIdx(n) { const f = this.builder.funcs.find(x => x.name === n); return f ? f.idx : -1; }

  compile(source) {
    const tokens = CTokenizer.tokenize(source);
    const parser = new CParser(tokens, this);
    
    while (parser.pos < parser.tokens.length) {
      if (this._isType(parser.tokens[parser.pos])) {
        if (parser.tokens[parser.pos + 2] === '(') {
          parser.locals = [];
          parser.localIdx = 0;
          parser.scopeStack = [new Map()];
          parser.controlDepth = 0;
          parser.breakTarget = [];
          parser.continueTarget = [];
          parser.pendingAssignment = null;

          const retType = parser.consume();
          const name = parser.consume();
          parser.expect('(');
          
          const params = [];
          while (parser.peek() !== ')') {
            if (parser.peek() === ',') { parser.consume(); continue; }
            if (parser.isType(parser.peek())) {
              const typeInfo = parser.parseType();
              params.push(typeInfo.name);
              const pName = parser.consume();
              const idx = parser.localIdx++;
              parser.locals.push({ idx, wasm: typeInfo.wasm, type: typeInfo.name, ptr: typeInfo.ptr });
              parser.scopeStack[0].set(pName, { idx, type: typeInfo.name });
            } else {
              parser.consume();
            }
          }
          parser.expect(')');
          
          const func = parser.parseFunction(name, params, retType);
          // ✅ FIXED: Pass func.locals to builder
          this.builder.addFunction(name, params, retType, func.body, name === 'main', func.locals);
        } else {
          parser.consume();
        }
      } else {
        parser.consume();
      }
    }
    return this.builder.generate();
  }

  _isType(t) { return t in C_TYPE_MAP; }
}

export default CCompiler;