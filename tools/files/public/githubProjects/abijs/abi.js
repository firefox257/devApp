// =============================================================================
// ABI.js COMPILER (compiler.js)
// Isomorphic: Runs in Node.js (CLI) and Browser (window.abijs)
// =============================================================================

// --- Isomorphic Preprocessor Import ---
let preprocess = (src) => src; 
if (typeof require !== 'undefined') {
    try { preprocess = require('./preprocessor.js').preprocess; } catch(e) {}
}
if (typeof window !== 'undefined' && window.abijs_preprocessor) {
    preprocess = window.abijs_preprocessor.preprocess;
}

// ================================= 1. LEXER ==================================
function tokenize(src) {
    const tokens = [];
    const keywords = new Set([
        'let','const','var','function','struct','class','return','if','while',
        'async','await','new','delete','get','set','operator',
        'constructor','destructor','static_constructor','static_destructor',
        'int8','int16','int32','int64','uint8','uint16','uint32','uint64',
        'bool','char','void','js','any','true','false','null',
        'jsString','abiString','jsArray','abiArray','jsJson','abiJson','jsBuffer'
    ]);
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '/' && src[i+1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (/[0-9]/.test(c)) { let n = ''; while (i < src.length && /[0-9]/.test(src[i])) n += src[i++]; tokens.push({ t: 'num', v: n }); continue; }
        if (/[a-zA-Z_]/.test(c)) { let id = ''; while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++]; tokens.push({ t: keywords.has(id) ? id : 'id', v: id }); continue; }
        if (c === '"') { i++; let s = ''; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') { i++; s += src[i]; } else s += src[i]; i++; } i++; tokens.push({ t: 'str', v: s }); continue; }
        const two = src.substr(i, 2);
        if (['==','!=','<=','>=','->','&&','||','<<','>>'].includes(two)) { tokens.push({ t: two, v: two }); i += 2; continue; }
        if ('+-*/=<>!&|,;:{}[]().'.includes(c)) { tokens.push({ t: c, v: c }); i++; continue; }
        throw new Error(`Lexer error: Unknown char '${c}' at ${i}`);
    }
    tokens.push({ t: 'eof' });
    return tokens;
}

// ================================ 2. PARSER ==================================
class Parser {
    constructor(tokens) { this.tokens = tokens; this.i = 0; }
    peek() { return this.tokens[this.i]; }
    eat(t) { const tk = this.tokens[this.i]; if (tk.t !== t) throw new Error(`Parser: expected ${t}, got ${tk.t}(${tk.v})`); this.i++; return tk; }
    match(t) { if (this.peek().t === t) { this.i++; return true; } return false; }

    parseProgram() { const decls = []; while (this.peek().t !== 'eof') decls.push(this.parseTopLevel()); return decls; }
    parseTopLevel() {
        let isAsync = this.match('async');
        const t = this.peek().t;
        if (t === 'struct') return this.parseStruct();
        if (t === 'class') return this.parseClass();
        if (t === 'function') { const fn = this.parseFunction(); fn.isAsync = isAsync; return fn; }
        throw new Error(`Unexpected top-level token: ${t}`);
    }
    parseStruct() {
        this.eat('struct'); const name = this.eat('id').v; this.eat('{'); const fields = [];
        while (!this.match('}')) { const fname = this.eat('id').v; this.eat(':'); const type = this.parseType(); this.eat(';'); fields.push({ name: fname, type }); }
        return { kind: 'struct', name, fields };
    }
    parseClass() {
        this.eat('class'); const name = this.eat('id').v; this.eat('{');
        const fields = [], methods = [], getters = {}, setters = {};
        let staticCtor = null, staticDtor = null;
        while (!this.match('}')) {
            if (this.match('constructor')) methods.push({ ...this.parseMethodBody(), name: '__ctor', isCtor: true });
            else if (this.match('destructor')) methods.push({ ...this.parseMethodBody(), name: '__dtor', isDtor: true });
            else if (this.match('static_constructor')) staticCtor = this.parseMethodBody();
            else if (this.match('static_destructor')) staticDtor = this.parseMethodBody();
            else if (this.match('operator')) { let opSym = this.peek().v; this.i++; const params = this.parseParams(); this.eat(':'); const ret = this.parseType(); const body = this.parseBlock(); methods.push({ kind: 'operator', op: opSym, params, ret, body }); }
            else if (this.match('get')) { const prop = this.eat('id').v; this.eat('('); this.eat(')'); this.eat(':'); getters[prop] = { retType: this.parseType(), body: this.parseBlock() }; }
            else if (this.match('set')) { const prop = this.eat('id').v; this.eat('('); const argName = this.eat('id').v; this.eat(':'); const argType = this.parseType(); this.eat(')'); setters[prop] = { argName, argType, body: this.parseBlock() }; }
            else if (this.match('function')) methods.push(this.parseFunction());
            else { const fname = this.eat('id').v; this.eat(':'); const type = this.parseType(); this.eat(';'); fields.push({ name: fname, type }); }
        }
        return { kind: 'class', name, fields, methods, getters, setters, staticCtor, staticDtor };
    }
    parseFunction() { this.eat('function'); const name = this.eat('id').v; const params = this.parseParams(); this.eat(':'); const ret = this.parseType(); return { kind: 'function', name, params, ret, body: this.parseBlock() }; }
    parseMethodBody() { return { params: this.parseParams(), body: this.parseBlock() }; }
    parseParams() { this.eat('('); const params = []; while (!this.match(')')) { params.push({ name: this.eat('id').v, type: (this.eat(':'), this.parseType()) }); if (!this.match(',')) break; } return params; }
    parseBlock() { this.eat('{'); const stmts = []; while (!this.match('}')) stmts.push(this.parseStmt()); return stmts; }

    parseStmt() {
        const t = this.peek().t;
        if (t === 'let' || t === 'const') { this.eat(t); const name = this.eat('id').v; this.eat(':'); const type = this.parseType(); this.eat('='); const init = this.parseExpr(); this.eat(';'); return { kind: 'var', name, type, init, mem: 'c' }; }
        if (t === 'var') { this.eat('var'); const name = this.eat('id').v; let type = { base: 'js', ptrs: 0, arr: null }; if (this.match(':')) type = this.parseType(); this.eat('='); const init = this.parseExpr(); this.eat(';'); return { kind: 'var', name, type, init, mem: 'js' }; }
        if (t === 'return') { this.eat('return'); const expr = this.parseExpr(); this.eat(';'); return { kind: 'return', expr }; }
        if (t === 'while') { this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); return { kind: 'while', cond, body: this.parseBlock() }; }
        if (t === 'delete') {
            this.eat('delete');
            if (this.match('[')) { this.eat(']'); const expr = this.parseExpr(); this.eat(';'); return { kind: 'delete_array', expr }; }
            const expr = this.parseExpr(); this.eat(';'); return { kind: 'delete', expr };
        }
        const expr = this.parseExpr();
        if (this.match('=')) { const rhs = this.parseExpr(); this.eat(';'); return { kind: 'assign', lhs: expr, rhs }; }
        this.eat(';'); return { kind: 'expr', expr };
    }

    parseType() { let base = this.eat('id').v; let ptrs = 0; while (this.match('*')) ptrs++; let arr = null; if (this.match('[')) { arr = parseInt(this.eat('num').v); this.eat(']'); } return { base, ptrs, arr }; }

    parseExpr() { return this.parseOr(); }
    parseOr() { let l = this.parseAnd(); while (this.peek().t === '||') { this.i++; l = { kind: 'bin', op: '||', left: l, right: this.parseAnd() }; } return l; }
    parseAnd() { let l = this.parseEq(); while (this.peek().t === '&&') { this.i++; l = { kind: 'bin', op: '&&', left: l, right: this.parseEq() }; } return l; }
    parseEq() { let l = this.parseRel(); while (this.peek().t === '==' || this.peek().t === '!=') { const op = this.peek().v; this.i++; l = { kind: 'bin', op, left: l, right: this.parseRel() }; } return l; }
    parseRel() { let l = this.parseAdd(); while (['<','>','<=','>='].includes(this.peek().t)) { const op = this.peek().v; this.i++; l = { kind: 'bin', op, left: l, right: this.parseAdd() }; } return l; }
    parseAdd() { let l = this.parseMul(); while (this.peek().t === '+' || this.peek().t === '-') { const op = this.peek().v; this.i++; l = { kind: 'bin', op, left: l, right: this.parseMul() }; } return l; }
    parseMul() { let l = this.parseUnary(); while (this.peek().t === '*' || this.peek().t === '/') { const op = this.peek().v; this.i++; l = { kind: 'bin', op, left: l, right: this.parseUnary() }; } return l; }
    parseUnary() {
        if (this.match('await')) return { kind: 'await', expr: this.parseUnary() };
        if (this.match('&')) return { kind: 'addr', expr: this.parsePrimary() };
        if (this.match('*')) return { kind: 'deref', expr: this.parsePrimary() };
        return this.parsePrimary();
    }
    
    parsePrimary() {
        const t = this.peek();
        if (t.t === 'null') { this.i++; return { kind: 'null' }; }
        if (t.t === 'num') { this.i++; return { kind: 'num', v: t.v }; }
        if (t.t === 'str') { this.i++; return { kind: 'str', v: t.v }; }
        
        if (t.t === 'new') {
            this.i++;
            const typeName = this.eat('id').v;
            if (this.match('[')) {
                const sizeExpr = this.parseExpr();
                this.eat(']');
                return { kind: 'new_array', type: typeName, sizeExpr };
            }
            let args = [];
            if (this.match('(')) {
                while (!this.match(')')) {
                    args.push(this.parseExpr());
                    if (!this.match(',')) break;
                }
            }
            return { kind: 'new_call', type: typeName, args };
        }

        if (t.t === 'id') {
            this.i++; let e = { kind: 'id', v: t.v };
            while (true) {
                if (this.match('->') || this.match('.')) { e = { kind: 'member', obj: e, field: this.eat('id').v }; }
                else if (this.match('[')) { const idx = this.parseExpr(); this.eat(']'); e = { kind: 'index', obj: e, idx }; }
                else if (this.match('(')) { const args = []; while (!this.match(')')) { args.push(this.parseExpr()); if (!this.match(',')) break; } e = { kind: 'call', fn: e, args }; }
                else break;
            }
            return e;
        }
        if (this.match('(')) { const e = this.parseExpr(); this.eat(')'); return e; }
        throw new Error(`Bad expr at ${JSON.stringify(t)}`);
    }
}

// ========================== 3. TYPE & LAYOUT RESOLVER ========================
const PRIM = { bool:{size:1,align:1}, char:{size:1,align:1}, int8:{size:1,align:1}, uint8:{size:1,align:1}, int16:{size:2,align:2}, uint16:{size:2,align:2}, int32:{size:4,align:4}, uint32:{size:4,align:4}, int64:{size:8,align:8}, uint64:{size:8,align:8}, void:{size:0,align:1}, js:{size:0,align:1}, any:{size:0,align:1} };
const alignUp = (n, a) => Math.ceil(n / a) * a;

class TypeResolver {
    constructor(types) { this.types = types; }
    sizeOf(t) { if (t.ptrs > 0) return 4; if (t.arr !== null) return this.sizeOf({ ...t, arr: null }) * t.arr; if (PRIM[t.base]) return PRIM[t.base].size; if (this.types[t.base]) return this.types[t.base].size; return 0; }
    alignOf(t) { if (t.ptrs > 0) return 4; if (t.arr !== null) return this.alignOf({ ...t, arr: null }); if (PRIM[t.base]) return PRIM[t.base].align; if (this.types[t.base]) return this.types[t.base].align; return 1; }
}

function layoutStruct(fields, resolver) {
    let offset = 0, maxAlign = 1; const offsets = {};
    for (const f of fields) { const a = resolver.alignOf(f.type); maxAlign = Math.max(maxAlign, a); offset = alignUp(offset, a); offsets[f.name] = offset; offset += resolver.sizeOf(f.type); }
    return { size: alignUp(offset, maxAlign), align: maxAlign, offsets };
}

// ============================== 4. CODE GENERATOR ============================
class Codegen {
    constructor(types) {
        this.types = types; this.resolver = new TypeResolver(types);
        this.out = []; this.tempCount = 0; this.strLits = []; this.strCount = 0;
        this.knownFunctions = new Set(); this.operatorTable = {};
        this.staticCtors = []; this.staticDtors = [];
        this.typedArrayMap = { int8:'Int8Array', uint8:'Uint8Array', char:'Uint8Array', bool:'Uint8Array', int16:'Int16Array', uint16:'Uint16Array', int32:'Int32Array', uint32:'Uint32Array', int64:'BigInt64Array', uint64:'BigUint64Array' };
    }
    emit(s) { this.out.push(s); }
    getElemSize(typeName) { if (this.types[typeName]) return this.types[typeName].size; if (PRIM[typeName]) return PRIM[typeName].size; return 4; }

    emitRuntime() {
        this.emit(`const HEAP_SIZE = 1 << 24;`);
        this.emit(`const __BufferType = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : ArrayBuffer;`);
        this.emit(`const __buf = new __BufferType(HEAP_SIZE); const __dv = new DataView(__buf); const __u8 = new Uint8Array(__buf);`);
        this.emit(`let __hp = 1024; const __free_list = [];`);
        this.emit(`function __malloc(size) { if (__free_list.length > 0) return __free_list.pop(); __hp = (__hp + 7) & ~7; const ptr = __hp; __hp += size; if (__hp > HEAP_SIZE) throw new Error("Out of Memory"); return ptr; }`);
        this.emit(`function __free(ptr) { __free_list.push(ptr); }`);
        this.emit(`function __cstr_to_js(ptr) { let s='',i=ptr; while(__dv.getUint8(i)!==0){s+=String.fromCharCode(__dv.getUint8(i));i++;} return s; }`);
        this.emit(`function __js_to_cstr(str) { const len = str.length; const ptr = __malloc(len + 1); for (let i = 0; i < len; i++) __dv.setUint8(ptr + i, str.charCodeAt(i)); __dv.setUint8(ptr + len, 0); return ptr; }`);
    }

    readExpr(type, ptrExpr) {
        if (type.ptrs > 0) return `__dv.getUint32(${ptrExpr}, true)`;
        switch (type.base) {
            case 'bool': case 'char': case 'uint8': return `__dv.getUint8(${ptrExpr})`; case 'int8': return `__dv.getInt8(${ptrExpr})`;
            case 'int16': return `__dv.getInt16(${ptrExpr}, true)`; case 'uint16': return `__dv.getUint16(${ptrExpr}, true)`;
            case 'int32': return `__dv.getInt32(${ptrExpr}, true)`; case 'uint32': return `__dv.getUint32(${ptrExpr}, true)`;
            case 'int64': return `__dv.getBigInt64(${ptrExpr}, true)`; case 'uint64': return `__dv.getBigUint64(${ptrExpr}, true)`;
            default: return ptrExpr; 
        }
    }
    writeStmt(type, ptrExpr, valExpr) {
        switch (type.base) {
            case 'bool': return `__dv.setUint8(${ptrExpr}, ${valExpr} ? 1 : 0);`; case 'char': case 'uint8': return `__dv.setUint8(${ptrExpr}, ${valExpr});`; case 'int8': return `__dv.setInt8(${ptrExpr}, ${valExpr});`;
            case 'int16': return `__dv.setInt16(${ptrExpr}, ${valExpr}, true);`; case 'uint16': return `__dv.setUint16(${ptrExpr}, ${valExpr}, true);`;
            case 'int32': return `__dv.setInt32(${ptrExpr}, ${valExpr}, true);`; case 'uint32': return `__dv.setUint32(${ptrExpr}, ${valExpr}, true);`;
            case 'int64': return `__dv.setBigInt64(${ptrExpr}, BigInt(${valExpr}), true);`; case 'uint64': return `__dv.setBigUint64(${ptrExpr}, BigInt(${valExpr}), true);`;
            default: if (type.ptrs > 0) return `__dv.setUint32(${ptrExpr}, ${valExpr}, true);`; return `for(let __i=0;__i<${this.resolver.sizeOf(type)};__i++) __u8[${ptrExpr}+__i]=__u8[${valExpr}+__i];`;
        }
    }

    exprVal(e) {
        if (e.kind === 'num') return e.v; if (e.kind === 'null') return '0';
        if (e.kind === 'str') { const name = `__str${this.strCount++}`; this.strLits.push({ name, v: e.v }); return name; }
        if (e.kind === 'await') return `(await ${this.exprVal(e.expr)})`; if (e.kind === 'addr') return this.exprPtr(e.expr);
        if (e.kind === 'deref') return this.readExpr({ ...this.exprType(e.expr), ptrs: 0 }, this.exprVal(e.expr));

        if (e.kind === 'new_call') {
            const size = this.getElemSize(e.type);
            const ptrVar = `__ptr_${this.tempCount++}`;
            this.emit(`  const ${ptrVar} = __malloc(${size});`);
            const cls = this.types[e.type];
            if (cls && cls.hasCtor) {
                const argVals = e.args.map(a => this.exprVal(a)).join(', ');
                this.emit(`  ${e.type}__ctor(${ptrVar}${argVals ? ', ' + argVals : ''});`);
            }
            return ptrVar;
        }

        if (e.kind === 'new_array') {
            const elemSize = this.getElemSize(e.type);
            const sizeExpr = this.exprVal(e.sizeExpr);
            const baseVar = `__arr_base_${this.tempCount++}`;
            const ptrVar = `__arr_${this.tempCount++}`;
            this.emit(`  const ${baseVar} = __malloc(8 + ${sizeExpr} * ${elemSize});`);
            this.emit(`  __dv.setInt32(${baseVar}, ${sizeExpr}, true);`);
            this.emit(`  const ${ptrVar} = ${baseVar} + 8;`);
            const cls = this.types[e.type];
            if (cls && cls.hasCtor) this.emit(`  for (let __i = 0; __i < ${sizeExpr}; __i++) { ${e.type}__ctor(${ptrVar} + __i * ${elemSize}); }`);
            return ptrVar;
        }

        if (e.kind === 'bin') {
            const lt = this.exprType(e.left); const rt = this.exprType(e.right);
            let key = `${lt.base}_${e.op}`; if (!this.operatorTable[key]) key = `${rt.base}_${e.op}`;
            if (this.operatorTable[key]) return `${this.operatorTable[key]}(${[e.left, e.right].map(a => this.exprVal(a)).join(', ')})`;
            return `(${this.exprVal(e.left)} ${e.op} ${this.exprVal(e.right)})`;
        }
        if (e.kind === 'id') { const v = this.locals.get(e.v); if (!v) return e.v; if (v.mem === 'js') return e.v; return this.readExpr(v.type, `(__fp + ${v.offset})`); }
        if (e.kind === 'member') {
            const objType = this.exprType(e.obj); const cls = this.types[objType.base];
            if (cls && cls.getters && cls.getters[e.field]) return `${cls.name}_get_${e.field}(${this.exprPtr(e.obj)})`;
            const basePtr = objType.ptrs > 0 ? this.exprVal(e.obj) : this.exprPtr(e.obj);
            return this.readExpr(cls.fields.find(f=>f.name===e.field).type, `(${basePtr} + ${cls.offsets[e.field]})`);
        }
        if (e.kind === 'call') {
            const fnName = e.fn.v; const args = e.args.map(a => this.exprVal(a));
            if (fnName === 'jsString') return `__cstr_to_js(${args[0]})`; if (fnName === 'abiString') return `__js_to_cstr(${args[0]})`;
            if (fnName === 'jsJson') return `JSON.parse(__cstr_to_js(${args[0]}))`; if (fnName === 'abiJson') return `__js_to_cstr(JSON.stringify(${args[0]}))`;
            if (fnName === 'jsArray') { const pt = this.exprType(e.args[0]); return `new ${this.typedArrayMap[pt.base] || 'Uint8Array'}(__buf, ${args[0]}, ${args[1]})`; }
            if (fnName === 'jsBuffer') return `__buf.slice(${args[0]}, ${args[0]} + ${args[1]})`;
            if (this.knownFunctions.has(fnName)) return `${fnName}(${args.join(', ')})`;
            return `${fnName}(${e.args.map(a => { const t = this.exprType(a); const v = this.exprVal(a); return (t.base === 'char' && t.ptrs === 1) ? `__cstr_to_js(${v})` : v; }).join(', ')})`;
        }
        return 'undefined';
    }

    exprPtr(e) {
        if (e.kind === 'id') { const v = this.locals.get(e.v); if (v.mem === 'js') throw new Error("Cannot take address of JS var"); return v.type.ptrs > 0 ? this.readExpr(v.type, `__fp + ${v.offset}`) : `(__fp + ${v.offset})`; }
        if (e.kind === 'deref') return this.exprVal(e.expr);
        if (e.kind === 'member') { const objType = this.exprType(e.obj); const cls = this.types[objType.base]; return objType.ptrs > 0 ? `(${this.exprVal(e.obj)} + ${cls.offsets[e.field]})` : `(${this.exprPtr(e.obj)} + ${cls.offsets[e.field]})`; }
        throw new Error('Invalid l-value');
    }
    exprType(e) {
        if (e.kind === 'id') { const v = this.locals.get(e.v); return v ? v.type : { base: 'js', ptrs: 0, arr: null }; }
        if (e.kind === 'member') { const t = this.exprType(e.obj); if (t.base === 'js') return { base: 'js', ptrs: 0, arr: null }; const cls = this.types[t.base]; return (cls.getters && cls.getters[e.field]) ? cls.getters[e.field].retType : cls.fields.find(f=>f.name===e.field).type; }
        if (e.kind === 'deref') { const t = this.exprType(e.expr); return { ...t, ptrs: t.ptrs - 1 }; }
        if (e.kind === 'new_call' || e.kind === 'new_array') return { base: e.type, ptrs: 1, arr: null };
        if (e.kind === 'await') return { base: 'js', ptrs: 0, arr: null };
        return { base: 'js', ptrs: 0, arr: null };
    }

    compileStmt(s) {
        if (s.kind === 'var') {
            if (s.mem === 'js') { this.emit(`  let ${s.name} = ${this.exprVal(s.init)};`); this.locals.set(s.name, { mem: 'js', type: s.type }); }
            else {
                const size = this.resolver.sizeOf(s.type); this.stackSize = alignUp(this.stackSize, this.resolver.alignOf(s.type));
                this.locals.set(s.name, { mem: 'c', offset: this.stackSize, type: s.type }); this.stackSize += size;
                if (s.init) this.emit(`  ${this.writeStmt(s.type, `(__fp + ${this.stackSize - size})`, this.exprVal(s.init))}`);
            }
        } else if (s.kind === 'assign') {
            if (s.lhs.kind === 'member') { const objType = this.exprType(s.lhs.obj); const cls = this.types[objType.base]; if (cls && cls.setters && cls.setters[s.lhs.field]) { this.emit(`  ${cls.name}_set_${s.lhs.field}(${this.exprPtr(s.lhs.obj)}, ${this.exprVal(s.rhs)});`); return; } }
            this.emit(`  ${this.writeStmt(this.exprType(s.lhs), this.exprPtr(s.lhs), this.exprVal(s.rhs))}`);
        } else if (s.kind === 'return') { this.emit(`  return ${this.exprVal(s.expr)};`); }
        else if (s.kind === 'while') { this.emit(`  while (${this.exprVal(s.cond)}) {`); for (const x of s.body) this.compileStmt(x); this.emit(`  }`); }
        else if (s.kind === 'delete_array') {
            const ptrExpr = this.exprVal(s.expr); const type = this.exprType(s.expr);
            const baseVar = `__del_base_${this.tempCount++}`; const countVar = `__del_count_${this.tempCount++}`;
            this.emit(`  if (${ptrExpr} !== 0) {`);
            this.emit(`    const ${baseVar} = ${ptrExpr} - 8;`);
            this.emit(`    const ${countVar} = __dv.getInt32(${baseVar}, true);`);
            const cls = this.types[type.base];
            if (cls && cls.hasDtor) {
                const elemSize = cls.size;
                this.emit(`    for (let __i = 0; __i < ${countVar}; __i++) { ${type.base}__dtor(${ptrExpr} + __i * ${elemSize}); }`);
            }
            this.emit(`    __free(${baseVar});`);
            this.emit(`  }`);
        }
        else if (s.kind === 'delete') {
            const ptrExpr = this.exprVal(s.expr); const type = this.exprType(s.expr);
            if (this.types[type.base] && this.types[type.base].hasDtor) this.emit(`  ${type.base}__dtor(${ptrExpr});`);
            this.emit(`  __free(${ptrExpr});`);
        }
        else if (s.kind === 'expr') { this.emit(`  ${this.exprVal(s.expr)};`); }
    }

    compileFunction(fn, isAsync = false) {
        this.locals = new Map(); this.stackSize = 0;
        let params = [...fn.params];
        if (fn.isClassMethod && !params.find(p => p.name === 'self')) params.unshift({ name: 'self', type: { base: fn.className, ptrs: 1 } });
        for (const p of params) this.locals.set(p.name, { mem: 'param', type: p.type });
        for (const s of fn.body) if (s.kind === 'var' && s.mem === 'c') { this.stackSize = alignUp(this.stackSize, this.resolver.alignOf(s.type)); this.stackSize += this.resolver.sizeOf(s.type); }
        this.emit(`${isAsync ? 'async ' : ''}function ${fn.name}(${params.map(p => p.name).join(', ')}) {`);
        this.emit(`  const __fp = __malloc(${this.stackSize || 8});`);
        for (const s of fn.body) this.compileStmt(s);
        this.emit(`}`);
    }

    compileClass(cls) {
        if (cls.staticCtor) this.staticCtors.push(cls.staticCtor); if (cls.staticDtor) this.staticDtors.push(cls.staticDtor);
        for (const m of cls.methods) {
            let fnName;
            if (m.isCtor) { fnName = `${cls.name}__ctor`; cls.hasCtor = true; }
            else if (m.isDtor) { fnName = `${cls.name}__dtor`; cls.hasDtor = true; }
            else if (m.kind === 'operator') { const opMap = {'+':'add','-':'sub','*':'mul','/':'div','==':'eq','!=':'neq','=':'assign'}; fnName = `${cls.name}__op_${opMap[m.op] || m.op}`; this.operatorTable[`${cls.name}_${m.op}`] = fnName; }
            else fnName = `${cls.name}_${m.name}`;
            this.knownFunctions.add(fnName);
            this.compileFunction({ ...m, name: fnName, isClassMethod: true, className: cls.name });
        }
        for (const [prop, getter] of Object.entries(cls.getters || {})) { const fnName = `${cls.name}_get_${prop}`; this.knownFunctions.add(fnName); this.compileFunction({ name: fnName, params: [{name:'self', type:{base:cls.name, ptrs:1}}], body: getter.body, ret: getter.retType, isClassMethod: true, className: cls.name }); }
        for (const [prop, setter] of Object.entries(cls.setters || {})) { const fnName = `${cls.name}_set_${prop}`; this.knownFunctions.add(fnName); this.compileFunction({ name: fnName, params: [{name:'self', type:{base:cls.name, ptrs:1}}, {name:setter.argName, type:setter.argType}], body: setter.body, ret: {base:'void'}, isClassMethod: true, className: cls.name }); }
    }

    finalize() {
        let js = this.out.join('\n');
        let strInit = ''; let strHp = this.strLits.length > 0 ? 2048 : 0; const strMap = {};
        for (const lit of this.strLits) { strMap[lit.name] = strHp; const bytes = [...lit.v].map(c => c.charCodeAt(0)); bytes.push(0); strInit += `__u8.set([${bytes.join(',')}], ${strHp});\n`; strHp += bytes.length; }
        for (const [name, off] of Object.entries(strMap)) js = js.replaceAll(name, String(off));
        
        let finalJs = strInit + '\n' + js + '\n';
        finalJs += `// --- Static Initializers ---\n`;
        for (const sc of this.staticCtors) finalJs += `(function() { ${sc.body.map(s => this.compileStmtInline(s)).join(' ')} })();\n`;
        finalJs += `// --- Main Execution ---\nconst __exit_code = main();\n`;
        finalJs += `// --- Static Teardown ---\n`;
        for (let i = this.staticDtors.length - 1; i >= 0; i--) finalJs += `(function() { ${this.staticDtors[i].body.map(s => this.compileStmtInline(s)).join(' ')} })();\n`;
        finalJs += `console.log("Program exited with code:", __exit_code);\n`;
        return finalJs;
    }
    compileStmtInline(s) { return s.kind === 'expr' ? `${this.exprVal(s.expr)};` : ''; }
}

// ================================ 5. DRIVER ==================================
function compile(src) {
    src = preprocess(src);
    const tokens = tokenize(src); const ast = new Parser(tokens).parseProgram();
    const types = {}; const resolver = new TypeResolver(types);
    for (const d of ast) if (d.kind === 'struct' || d.kind === 'class') types[d.name] = { ...d, ...layoutStruct(d.fields, resolver) };
    const cg = new Codegen(types); cg.emitRuntime();
    for (const d of ast) { if (d.kind === 'function') { cg.knownFunctions.add(d.name); cg.compileFunction(d, d.isAsync); } if (d.kind === 'class' || d.kind === 'struct') cg.compileClass(d); }
    return cg.finalize();
}

// ======================== 6. ISOMORPHIC EXPORTS & CLI ========================
if (typeof module !== 'undefined' && module.exports) module.exports = { compile };
if (typeof window !== 'undefined') window.abijs = { compile };
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    (function() { try { const fs = require('fs'); if (require.main === module) { if (process.argv.length < 3) { console.error("Usage: node compiler.js <source.abijs>"); process.exit(1); } console.log(compile(fs.readFileSync(process.argv[2], 'utf8'))); } } catch (e) {} })();
}