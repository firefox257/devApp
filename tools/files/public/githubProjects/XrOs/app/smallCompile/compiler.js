// compiler.js

// ==========================================
// 0. PREPROCESSOR & STDLIB
// ==========================================
export const STDLIB = {
    // Updated malloc.c to use standard memory operations instead of atomic intrinsics.
    // This bypasses the WebAssembly Threads opcode issues entirely.
    'malloc.c': `
#define MALLOC_LOCK_ADDR 1024
#define MALLOC_BRK_ADDR 1028
#define FREE_LIST_HEAD_ADDR 1032

void _lock_acquire() {
    int32* lock = (int32*)MALLOC_LOCK_ADDR;
    while (*lock == 1) { }
    *lock = 1;
}
void _lock_release() {
    int32* lock = (int32*)MALLOC_LOCK_ADDR;
    *lock = 0;
}

int32 _sbrk(int32 increment) {
    int32* brk_ptr = (int32*)MALLOC_BRK_ADDR;
    int32 expected = 0;
    int32 safe_start = 131072;
    
    int32 old = *brk_ptr;
    if (old == expected) {
        *brk_ptr = safe_start;
    }
    
    int32 current_brk = old == expected ? safe_start : old;
    
    int32 new_brk = current_brk + increment;
    int32 success = 0;
    while (success == 0) {
        int32 prev = *brk_ptr;
        if (prev == current_brk) {
            *brk_ptr = new_brk;
            success = 1;
        } else {
            current_brk = prev;
            new_brk = current_brk + increment;
        }
    }
    
    int32 pages = __wasm_memory_size();
    int32 mem_end = pages * 65536;
    if (new_brk > mem_end) {
        int32 needed = (new_brk - mem_end + 65535) / 65536;
        if (__wasm_memory_grow(needed) == -1) {
            *brk_ptr = *brk_ptr - increment;
            return -1;
        }
    }
    return current_brk;
}

void* malloc(int32 size) {
    _lock_acquire();
    int32 aligned_size = ((size + 7) / 8) * 8;
    int32 total_size = aligned_size + 12;
    
    int32* flh_ptr = (int32*)FREE_LIST_HEAD_ADDR;
    int32 current = *flh_ptr;
    int32 prev = 0;
    
    while (current != 0) {
        int32* c = (int32*)current;
        int32 c_size = c[0];
        int32 c_free = c[1];
        int32 c_next = c[2];
        
        if (c_free == 1 && c_size >= total_size) {
            if (c_size >= total_size + 24) {
                int32 new_addr = current + total_size;
                int32* new_c = (int32*)new_addr;
                new_c[0] = c_size - total_size;
                new_c[1] = 1;
                new_c[2] = c_next;
                c[0] = total_size;
                c[2] = new_addr;
            }
            c[1] = 0;
            if (prev == 0) {
                *flh_ptr = c_next;
            } else {
                int32* p = (int32*)prev;
                p[2] = c_next;
            }
            _lock_release();
            return (void*)(current + 12);
        }
        prev = current;
        current = c_next;
    }
    
    int32 new_mem = _sbrk(total_size);
    if (new_mem == -1) {
        _lock_release();
        return (void*)0;
    }
    
    int32* c = (int32*)new_mem;
    c[0] = total_size;
    c[1] = 0;
    c[2] = 0;
    _lock_release();
    return (void*)(new_mem + 12);
}

void free(void* ptr) {
    if ((int32)ptr == 0) { return; }
    _lock_acquire();
    int32 chunk_addr = (int32)ptr - 12;
    int32* c = (int32*)chunk_addr;
    c[1] = 1;
    
    int32* flh_ptr = (int32*)FREE_LIST_HEAD_ADDR;
    int32 head = *flh_ptr;
    c[2] = head;
    *flh_ptr = chunk_addr;
    _lock_release();
}

void* realloc(void* ptr, int32 new_size) {
    if ((int32)ptr == 0) { return malloc(new_size); }
    if (new_size == 0) {
        free(ptr);
        return (void*)0;
    }
    int32 chunk_addr = (int32)ptr - 12;
    int32* c = (int32*)chunk_addr;
    int32 old_size = c[0] - 12;
    
    int32 aligned_size = ((new_size + 7) / 8) * 8;
    int32 total_size = aligned_size + 12;
    
    if (c[0] >= total_size) {
        return ptr;
    }
    
    void* new_ptr = malloc(new_size);
    if ((int32)new_ptr == 0) {
        return (void*)0;
    }
    
    int32* src = (int32*)ptr;
    int32* dst = (int32*)new_ptr;
    int32 words = (old_size + 3) / 4;
    int32 i = 0;
    while (i < words) {
        dst[i] = src[i];
        i = i + 1;
    }
    free(ptr);
    return new_ptr;
}
`
};

function preprocess(code, includeResolver) {
    const lines = code.split('\n');
    const result = [];
    const included = new Set();
    const defines = {};
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        const defineMatch = line.match(/^#define\s+([A-Za-z_]\w*)\s+(.+)$/);
        if (defineMatch) {
            defines[defineMatch[1]] = defineMatch[2];
            continue;
        }
        
        const includeMatch = line.match(/^#include\s*[<"](.+?)[>"]\s*(?:\/\/.*)?$/);
        if (includeMatch) {
            const path = includeMatch[1];
            if (!included.has(path)) {
                included.add(path);
                let includedCode = includeResolver ? includeResolver(path) : "";
                if (includedCode) {
                    result.push(preprocess(includedCode, includeResolver));
                } else {
                    throw new Error(`Cannot resolve include: ${path}`);
                }
            }
        } else {
            for (const [key, val] of Object.entries(defines)) {
                line = line.replace(new RegExp(`\\b${key}\\b`, 'g'), val);
            }
            result.push(line);
        }
    }
    return result.join('\n');
}

// ==========================================
// 1. LEXER (Tokenizer)
// ==========================================
const tokenSpec = [
    ['TYPE', /\b(int8|int16|int32|int64|uint8|uint16|uint32|uint64|float|double|bool|char|void)\b/y],
    ['SIZEOF', /sizeof\b/y],
    ['STRING_LITERAL', /"(?:\\.|[^"\\])*"/y],
    ['FLOAT_LITERAL', /\d+\.\d+/y],
    ['INT_LITERAL', /\d+/y],
    ['CHAR_LITERAL', /'(?:\\.|[^'\\])'/y],
    ['TRUE', /true\b/y], 
    ['FALSE', /false\b/y],
    ['IF', /if\b/y], 
    ['ELSE', /else\b/y],
    ['WHILE', /while\b/y], 
    ['RETURN', /return\b/y],
    ['IDENT', /[a-zA-Z_]\w*/y],
    ['EQEQ', /==/y], 
    ['NEQ', /!=/y], 
    ['LTEQ', /<=/y], 
    ['GTEQ', />=/y],
    ['AND', /&&/y],   
    ['OR', /\|\|/y],  
    ['LT', /</y], 
    ['GT', />/y], 
    ['EQ', /=/y], 
    ['PLUS', /\+/y], 
    ['MINUS', /-/y],
    ['MUL', /\*/y], 
    ['COMMENT', /\/\/.*|\/\*[\s\S]*?\*\//y], 
    ['DIV', /\//y], 
    ['LPAREN', /\(/y], 
    ['RPAREN', /\)/y],
    ['LBRACE', /\{/y], 
    ['RBRACE', /\}/y], 
    ['LBRACKET', /\[/y],   
    ['RBRACKET', /\]/y],   
    ['COMMA', /,/y],  
    ['SEMI', /;/y], 
    ['QUESTION', /\?/y], 
    ['COLON', /:/y],     
    ['SKIP', /[ \t\n\r]+/y]
];

function lex(code) {
    let tokens = [];
    let pos = 0;
    while (pos < code.length) {
        let matched = false;
        for (let [type, regex] of tokenSpec) {
            regex.lastIndex = pos;
            let match = regex.exec(code);
            if (match) { 
                if (type !== 'SKIP' && type !== 'COMMENT') {
                    let val = match[0];
                    if (type === 'INT_LITERAL') val = parseInt(val, 10);
                    if (type === 'FLOAT_LITERAL') val = parseFloat(val);
                    if (type === 'CHAR_LITERAL') val = val.slice(1, -1).charCodeAt(0); 
                    if (type === 'TRUE') val = 1;
                    if (type === 'FALSE') val = 0;
                    if (type === 'STRING_LITERAL') {
                        val = val.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }
                    tokens.push({ type, value: val });
                }
                pos += match[0].length;
                matched = true;
                break;
            }
        }
        if (!matched) throw new Error(`Unexpected character: '${code[pos]}' at pos ${pos}`);
    }
    return tokens;
}

// ==========================================
// 2. PARSER (AST Builder)
// ==========================================
class Parser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    peek() { return this.tokens[this.pos] || { type: 'EOF' }; }
    consume(expected) {
        let tok = this.peek();
        if (expected && tok.type !== expected) throw new Error(`Expected ${expected}, got ${tok.type}`);
        this.pos++;
        return tok;
    }
    parseProgram() {
        let funcs = [];
        while (this.peek().type !== 'EOF') funcs.push(this.parseFunction());
        return { type: 'Program', functions: funcs };
    }
    
    parseFunction() {
        let returnType = this.consume('TYPE').value;
        if (this.peek().type === 'MUL') {
            this.consume('MUL');
            returnType += '*';
        }
        let name = this.consume('IDENT').value;
        this.consume('LPAREN'); 
        
        let params = [];
        if (this.peek().type !== 'RPAREN') {
            while (true) {
                let pType = this.consume('TYPE').value;
                if (this.peek().type === 'MUL') {
                    this.consume('MUL');
                    pType += '*';
                }
                let pName = this.consume('IDENT').value;
                params.push({ name: pName, type: pType });
                if (this.peek().type === 'COMMA') this.consume('COMMA');
                else break;
            }
        }
        this.consume('RPAREN');
        
        let body = null;
        if (this.peek().type === 'LBRACE') {
            body = this.parseBlock();
        } else if (this.peek().type === 'SEMI') {
            this.consume('SEMI');
        } else {
            throw new Error("Expected '{' or ';' after function parameters");
        }
        
        return { type: 'Function', name, returnType, params, body };
    }
    
    parseBlock() {
        this.consume('LBRACE'); let stmts = [];
        while (this.peek().type !== 'RBRACE') stmts.push(this.parseStmt());
        this.consume('RBRACE'); return stmts;
    }
    
    parseStmt() {
        let t = this.peek().type;
        if (t === 'TYPE') return this.parseVarDecl();
        if (t === 'IF') return this.parseIf();
        if (t === 'WHILE') return this.parseWhile();
        if (t === 'RETURN') return this.parseReturn();
        
        if (t === 'MUL') {
            this.consume('MUL');
            let expr = this.parseFactor();
            if (expr.type === 'Var') {
                this.consume('EQ');
                let val = this.parseExpr();
                this.consume('SEMI');
                return { type: 'DerefAssign', name: expr.name, value: val };
            }
            throw new Error("Complex pointer assignment not yet supported in statements.");
        }

        if (t === 'IDENT') {
            let name = this.peek().value;
            if (this.tokens[this.pos + 1]?.type === 'LBRACKET') {
                this.consume('IDENT');
                this.consume('LBRACKET');
                let index = this.parseExpr();
                this.consume('RBRACKET');
                this.consume('EQ');
                let val = this.parseExpr();
                this.consume('SEMI');
                return { type: 'ArrayAssign', name, index, value: val };
            }
            if (this.tokens[this.pos + 1]?.type === 'EQ') return this.parseAssign();
            
            let expr = this.parseExpr();
            this.consume('SEMI');
            return { type: 'ExprStmt', expr }; 
        }
        throw new Error(`Unexpected token in statement: ${t}`);
    }
    
    parseVarDecl() {
        let varType = this.consume('TYPE').value;
        let isPointer = false;
        
        if (this.peek().type === 'MUL') {
            this.consume('MUL');
            isPointer = true;
        }
        
        let name = this.consume('IDENT').value;
        let arraySize = null;
        
        if (this.peek().type === 'LBRACKET') {
            this.consume('LBRACKET');
            arraySize = this.consume('INT_LITERAL').value;
            this.consume('RBRACKET');
            isPointer = true; 
        }
        
        let init = this.peek().type === 'EQ' ? (this.consume('EQ'), this.parseExpr()) : null;
        this.consume('SEMI'); 
        
        return { type: 'VarDecl', varType, baseType: varType, name, isPointer, arraySize, init };
    }
    
    parseAssign() {
        let name = this.consume('IDENT').value; this.consume('EQ');
        let val = this.parseExpr(); this.consume('SEMI');
        return { type: 'Assign', name, value: val };
    }
    
    parseIf() {
        this.consume('IF'); this.consume('LPAREN'); let cond = this.parseExpr(); this.consume('RPAREN');
        let then = this.parseBlock(); let else_ = [];
        if (this.peek().type === 'ELSE') { this.consume('ELSE'); else_ = this.parseBlock(); }
        return { type: 'If', cond, then, else: else_ };
    }
    
    parseWhile() {
        this.consume('WHILE'); this.consume('LPAREN'); let cond = this.parseExpr(); this.consume('RPAREN');
        return { type: 'While', cond, body: this.parseBlock() };
    }
    
    parseReturn() {
        this.consume('RETURN'); 
        let val = this.peek().type !== 'SEMI' ? this.parseExpr() : null; 
        this.consume('SEMI');
        return { type: 'Return', value: val };
    }
    
    parseExpr() { return this.parseTernary(); }
    
    parseTernary() {
        let node = this.parseLogicalOr();
        if (this.peek().type === 'QUESTION') {
            this.consume('QUESTION');
            let then = this.parseExpr(); 
            this.consume('COLON');
            let else_ = this.parseTernary();
            return { type: 'Ternary', cond: node, then, else: else_ };
        }
        return node;
    }

    parseLogicalOr() {
        let node = this.parseLogicalAnd();
        while (this.peek().type === 'OR') {
            this.consume('OR');
            node = { type: 'BinOp', op: '||', left: node, right: this.parseLogicalAnd() };
        }
        return node;
    }

    parseLogicalAnd() {
        let node = this.parseComp();
        while (this.peek().type === 'AND') {
            this.consume('AND');
            node = { type: 'BinOp', op: '&&', left: node, right: this.parseComp() };
        }
        return node;
    }

    parseComp() {
        let node = this.parseAdd();
        while (['EQEQ','NEQ','LT','GT','LTEQ','GTEQ'].includes(this.peek().type)) {
            let op = this.consume().value; node = { type: 'BinOp', op, left: node, right: this.parseAdd() };
        } return node;
    }
    parseAdd() {
        let node = this.parseMul();
        while (['PLUS','MINUS'].includes(this.peek().type)) {
            let op = this.consume().value; node = { type: 'BinOp', op, left: node, right: this.parseMul() };
        } return node;
    }
    parseMul() {
        let node = this.parseFactor();
        while (['MUL','DIV'].includes(this.peek().type)) {
            let op = this.consume().value; node = { type: 'BinOp', op, left: node, right: this.parseFactor() };
        } return node;
    }
    
    parseFactor() {
        let t = this.peek();
        
        if (t.type === 'SIZEOF') {
            this.consume('SIZEOF');
            this.consume('LPAREN');
            let typeTok = this.consume('TYPE');
            let typeName = typeTok.value;
            if (this.peek().type === 'MUL') {
                this.consume('MUL');
                typeName += '*';
            }
            this.consume('RPAREN');
            let size = 4; 
            const tn = typeName.toLowerCase();
            if (['int8', 'uint8', 'char', 'bool', 'void'].includes(tn)) size = 1;
            else if (['int16', 'uint16'].includes(tn)) size = 2;
            else if (['int32', 'uint32', 'float'].includes(tn)) size = 4;
            else if (['int64', 'uint64', 'double'].includes(tn)) size = 8;
            if (typeName.includes('*')) size = 4; 
            return { type: 'Num', value: size };
        }

        if (t.type === 'LPAREN') {
            let isCast = false;
            let castType = null;
            if (this.tokens[this.pos + 1]?.type === 'TYPE') {
                let afterTypeIdx = this.pos + 2;
                if (this.tokens[afterTypeIdx]?.type === 'RPAREN') {
                    isCast = true;
                    castType = this.tokens[this.pos + 1].value;
                } else if (this.tokens[afterTypeIdx]?.type === 'MUL' && this.tokens[this.pos + 3]?.type === 'RPAREN') {
                    isCast = true;
                    castType = this.tokens[this.pos + 1].value + '*';
                }
            }
            
            if (isCast) {
                this.consume('LPAREN');
                this.consume('TYPE');
                if (this.peek().type === 'MUL') this.consume('MUL');
                this.consume('RPAREN');
                let expr = this.parseFactor();
                expr.castType = castType; 
                return expr;
            }
            
            this.consume(); 
            let n = this.parseExpr(); 
            this.consume('RPAREN'); 
            return n; 
        }

        if (t.type === 'MINUS') {
            this.consume('MINUS');
            let expr = this.parseFactor();
            if (expr.type === 'Num') return { type: 'Num', value: -expr.value };
            return { type: 'BinOp', op: '-', left: { type: 'Num', value: 0 }, right: expr };
        }
        
        if (t.type === 'MUL') {
            this.consume('MUL');
            let expr = this.parseFactor();
            return { type: 'Deref', expr };
        }

        if (['INT_LITERAL','FLOAT_LITERAL','CHAR_LITERAL','TRUE','FALSE'].includes(t.type)) { 
            this.consume(); return { type: 'Num', value: t.value }; 
        }

        if (t.type === 'STRING_LITERAL') {
            this.consume();
            return { type: 'StringLiteral', value: t.value };
        }
        
        if (t.type === 'IDENT') { 
            this.consume(); 
            
            if (this.peek().type === 'LBRACKET') {
                this.consume('LBRACKET');
                let index = this.parseExpr();
                this.consume('RBRACKET');
                return { type: 'ArrayAccess', name: t.value, index };
            }

            if (this.peek().type === 'LPAREN') {
                this.consume('LPAREN');
                let args = [];
                if (this.peek().type !== 'RPAREN') {
                    while (true) {
                        args.push(this.parseExpr());
                        if (this.peek().type === 'COMMA') this.consume('COMMA');
                        else break;
                    }
                }
                this.consume('RPAREN');
                return { type: 'Call', name: t.value, args };
            }
            return { type: 'Var', name: t.value }; 
        }
        
        throw new Error(`Unexpected token in expression: ${t.type}`);
    }
}

// ==========================================
// 3. WASM BINARY EMITTER
// ==========================================
class WasmBuffer {
    constructor() { this.data = []; }
    push(...bytes) { this.data.push(...bytes); }
    u32(v) { do { let b = v & 0x7f; v >>>= 7; if (v !== 0) b |= 0x80; this.push(b); } while (v !== 0); }
    i32(v) { 
        let more = true;
        while (more) {
            let b = v & 0x7f; v >>= 7;
            if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) more = false;
            else b |= 0x80;
            this.push(b);
        }
    }
    i64(v) {
        let val = BigInt(v);
        let more = true;
        do {
            let b = Number(val & 0x7Fn);
            val >>= 7n;
            if ((val === 0n && (b & 0x40) === 0) || (val === -1n && (b & 0x40) !== 0)) more = false;
            else b |= 0x80;
            this.push(b);
        } while (more);
    }
    bytes() { return new Uint8Array(this.data); }
}

function buildSection(id, content) {
    let sec = new WasmBuffer();
    sec.push(id); sec.u32(content.data.length); sec.push(...content.data);
    return sec;
}

// ==========================================
// 4. CODE GENERATOR (AST -> Wasm Binary)
// ==========================================
class CodeGen {
    constructor() { this.locals = {}; this.memoryOffset = 0; }

    getWasmType(langType) {
        if (!langType) return 0x7F;
        const t = langType.toLowerCase();
        if (t === 'void') return 0x40; 
        if (t === 'void*') return 0x7F;
        
        const baseType = t.replace('*', '');
        if (['int8','int16','int32','uint8','uint16','uint32','bool','char'].includes(baseType)) return 0x7F; 
        if (['int64','uint64'].includes(baseType)) return 0x7E; 
        if (baseType === 'float') return 0x7D; 
        if (baseType === 'double') return 0x7C; 
        return 0x7F; 
    }

    getElemSize(langType) {
        const t = langType.toLowerCase();
        if (['int8', 'uint8', 'char', 'bool', 'void'].includes(t)) return 1;
        if (['int16', 'uint16'].includes(t)) return 2;
        if (['int32', 'uint32', 'float'].includes(t)) return 4;
        if (['int64', 'uint64', 'double'].includes(t)) return 8;
        return 4; 
    }

    emitLoad(buf, wasmType, offset = 0) {
        if (wasmType === 0x7F) { buf.push(0x28, 0x02); buf.u32(offset); } 
        else if (wasmType === 0x7E) { buf.push(0x29, 0x03); buf.u32(offset); } 
        else if (wasmType === 0x7D) { buf.push(0x2A, 0x02); buf.u32(offset); } 
        else if (wasmType === 0x7C) { buf.push(0x2B, 0x03); buf.u32(offset); } 
    }

    emitStore(buf, wasmType, offset = 0) {
        if (wasmType === 0x7F) { buf.push(0x36, 0x02); buf.u32(offset); } 
        else if (wasmType === 0x7E) { buf.push(0x37, 0x03); buf.u32(offset); } 
        else if (wasmType === 0x7D) { buf.push(0x38, 0x02); buf.u32(offset); } 
        else if (wasmType === 0x7C) { buf.push(0x39, 0x03); buf.u32(offset); } 
    }

    getExprType(expr) {
        if (!expr) return 0x7F;
        if (expr.type === 'Num') return Number.isInteger(expr.value) ? 0x7F : 0x7D; 
        if (expr.type === 'Var' || expr.type === 'Deref' || expr.type === 'ArrayAccess') {
            return expr.pointedType || this.locals[expr.name]?.wasmType || 0x7F;
        }
        if (expr.type === 'Call') {
            if (expr.name === 'print') return 0x40; 
            if (expr.name === '__atomic_store') return 0x40; // Fix for void return
            if (['__wasm_memory_size', '__builtin_wasm_memory_size', 
                 '__wasm_memory_grow', '__builtin_wasm_memory_grow',
                 '__atomic_load', '__atomic_exchange', 
                 '__atomic_fetch_sub', '__atomic_cmpxchg'].includes(expr.name)) {
                return 0x7F;
            }
            let func = this.astFunctions.find(f => f.name === expr.name);
            return func ? this.getWasmType(func.returnType) : 0x7F;
        }
        if (expr.type === 'StringLiteral') return 0x7F; 
        if (expr.type === 'Ternary' || (expr.type === 'BinOp' && (expr.op === '&&' || expr.op === '||'))) return 0x7F;
        if (expr.type === 'BinOp') {
            let leftType = this.getExprType(expr.left);
            let rightType = this.getExprType(expr.right);
            if (leftType === 0x7C || rightType === 0x7C) return 0x7C;
            if (leftType === 0x7D || rightType === 0x7D) return 0x7D;
            if (leftType === 0x7E || rightType === 0x7E) return 0x7E;
            return 0x7F;
        }
        return 0x7F;
    }

    emitCast(buf, from, to) {
        if (from === to) return;
        const casts = {
            '127-126': 0xAC, '126-127': 0xA7, '127-125': 0xB2, '127-124': 0xB7,
            '126-125': 0xB4, '126-124': 0xB9, '125-127': 0xA8, '125-126': 0xAE,
            '125-124': 0xBB, '124-127': 0xAA, '124-126': 0xB0, '124-125': 0xB6,
        };
        let op = casts[`${from}-${to}`];
        if (op) buf.push(op);
    }

    getBinOpOpCode(op, wasmType) {
        const ops = {
            127: { '+':0x6A, '-':0x6B, '*':0x6C, '/':0x6D, '==':0x46, '!=':0x47, '<':0x48, '>':0x4A, '<=':0x4C, '>=':0x4E }, 
            126: { '+':0x7C, '-':0x7D, '*':0x7E, '/':0x7F, '==':0x51, '!=':0x52, '<':0x53, '>':0x55, '<=':0x57, '>=':0x59 }, 
            125: { '+':0x92, '-':0x93, '*':0x94, '/':0x95, '==':0x5B, '!=':0x5C, '<':0x5D, '>':0x5E, '<=':0x5F, '>=':0x60 }, 
            124: { '+':0xA0, '-':0xA1, '*':0xA2, '/':0xA3, '==':0x61, '!=':0x62, '<':0x63, '>':0x64, '<=':0x65, '>=':0x66 }  
        };
        return ops[wasmType][op];
    }

    isPointerType(expr) {
        if (expr.type === 'Var') return this.locals[expr.name]?.isPointer || false;
        if (expr.type === 'BinOp') return expr.isPointerArith || false;
        return false;
    }

    getPointedType(expr) {
        if (expr.type === 'Var') return this.locals[expr.name]?.pointedType || 0x7F;
        if (expr.type === 'BinOp' && expr.isPointerArith) return expr.pointedType;
        return 0x7F;
    }

    getPointedElemSize(expr) {
        if (expr.type === 'Var') return this.locals[expr.name]?.elemSize || 4;
        if (expr.type === 'BinOp' && expr.isPointerArith) return expr.elemSize;
        return 4;
    }

    annotateTypes(ast) {
        this.astFunctions = ast.functions;
        for (let func of ast.functions) {
            if (!func.body) continue;
            this.locals = {};
            this.collectLocals(func.body);
            func.body.forEach(stmt => this.annotateStmt(stmt));
        }
    }

    collectLocals(stmts) {
        for (let s of stmts) {
            if (s.type === 'VarDecl' && !(s.name in this.locals)) {
                let wType = s.isPointer ? 0x7F : this.getWasmType(s.varType);
                let localInfo = { index: Object.keys(this.locals).length, wasmType: wType };
                
                if (s.isPointer) {
                    localInfo.isPointer = true;
                    localInfo.pointedType = this.getWasmType(s.baseType);
                    localInfo.elemSize = this.getElemSize(s.baseType); 
                }
                if (s.arraySize) {
                    localInfo.isArray = true;
                    localInfo.isPointer = true;
                    localInfo.pointedType = this.getWasmType(s.baseType);
                    localInfo.baseOffset = this.memoryOffset;
                    localInfo.elemSize = this.getElemSize(s.baseType);
                    this.memoryOffset += s.arraySize * localInfo.elemSize;
                }
                this.locals[s.name] = localInfo;
            }
            if (s.type === 'If') { this.collectLocals(s.then); this.collectLocals(s.else); }
            if (s.type === 'While') this.collectLocals(s.body);
        }
    }

    annotateStmt(stmt) {
        if (stmt.type === 'VarDecl' && stmt.init) this.annotateExpr(stmt.init);
        if (stmt.type === 'Assign') this.annotateExpr(stmt.value);
        if (stmt.type === 'DerefAssign') this.annotateExpr(stmt.value);
        if (stmt.type === 'ArrayAssign') { this.annotateExpr(stmt.index); this.annotateExpr(stmt.value); }
        if (stmt.type === 'If') { 
            this.annotateExpr(stmt.cond); 
            stmt.then.forEach(s => this.annotateStmt(s)); 
            stmt.else.forEach(s => this.annotateStmt(s)); 
        }
        if (stmt.type === 'While') { 
            this.annotateExpr(stmt.cond); 
            stmt.body.forEach(s => this.annotateStmt(s)); 
        }
        if (stmt.type === 'Return') this.annotateExpr(stmt.value);
        if (stmt.type === 'ExprStmt') this.annotateExpr(stmt.expr);
    }

    annotateExpr(expr) {
        if (!expr) return;
        if (expr.type === 'Deref') {
            this.annotateExpr(expr.expr); 
            expr.pointedType = this.getPointedType(expr.expr); 
        } else if (expr.type === 'ArrayAccess') {
            expr.pointedType = this.locals[expr.name]?.pointedType || 0x7F;
            expr.elemSize = this.locals[expr.name]?.elemSize || 4;
            this.annotateExpr(expr.index);
        } else if (expr.type === 'BinOp') {
            this.annotateExpr(expr.left);
            this.annotateExpr(expr.right);
            if (expr.op === '+' || expr.op === '-') {
                let leftIsPtr = this.isPointerType(expr.left);
                let rightIsPtr = this.isPointerType(expr.right);
                if (leftIsPtr) {
                    expr.isPointerArith = true;
                    expr.elemSize = this.getPointedElemSize(expr.left);
                    expr.pointedType = this.getPointedType(expr.left);
                } else if (rightIsPtr && expr.op === '+') {
                    expr.isPointerArith = true;
                    expr.elemSize = this.getPointedElemSize(expr.right);
                    expr.pointedType = this.getPointedType(expr.right);
                }
            }
        } else if (expr.type === 'Ternary') {
            this.annotateExpr(expr.cond);
            this.annotateExpr(expr.then);
            this.annotateExpr(expr.else);
        } else if (expr.type === 'Call') {
            expr.args.forEach(arg => this.annotateExpr(arg));
        }
    }

    generate(ast) {
        let mod = new WasmBuffer();
        mod.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00); 

        this.stringPool = new Map();
        this.stringOffset = 0;
        const visit = (n) => {
            if (!n) return;
            if (Array.isArray(n)) { n.forEach(visit); return; }
            if (typeof n === 'object') {
                if (n.type === 'StringLiteral') {
                    if (!this.stringPool.has(n.value)) {
                        this.stringPool.set(n.value, this.stringOffset);
                        this.stringOffset += new TextEncoder().encode(n.value).length + 1;
                    }
                }
                for (let k in n) visit(n[k]);
            }
        };
        visit(ast);

        this.memoryOffset = Math.max(2048, this.stringOffset); 
        this.annotateTypes(ast);

        this.funcMap = {};
        let definedFuncs = [];
        ast.functions.forEach((f) => {
            if (f.body !== null) {
                this.funcMap[f.name] = definedFuncs.length;
                definedFuncs.push(f);
            }
        });

        let typeSec = new WasmBuffer();
        typeSec.u32(definedFuncs.length + 1); 
        typeSec.push(0x60); typeSec.u32(1); typeSec.push(0x7F); typeSec.u32(0);
        for (let func of definedFuncs) {
            typeSec.push(0x60); 
            typeSec.u32(func.params.length);
            for (let p of func.params) {
                typeSec.push(p.type.includes('*') ? 0x7F : this.getWasmType(p.type));
            }
            typeSec.u32(func.returnType === 'void' ? 0 : 1); 
            if (func.returnType !== 'void') typeSec.push(this.getWasmType(func.returnType));
        }
        mod.push(...buildSection(1, typeSec).data);

        let impSec = new WasmBuffer();
        impSec.u32(1); 
        impSec.push(0x03); impSec.push(0x65, 0x6E, 0x76); 
        impSec.push(0x05); impSec.push(0x70, 0x72, 0x69, 0x6E, 0x74); 
        impSec.push(0x00); 
        impSec.u32(0); 
        mod.push(...buildSection(2, impSec).data);

        let funcSec = new WasmBuffer();
        funcSec.u32(definedFuncs.length);
        for (let i = 0; i < definedFuncs.length; i++) funcSec.u32(i + 1); 
        mod.push(...buildSection(3, funcSec).data);

        const memPages = Math.max(1, Math.ceil(this.memoryOffset / 65536));
        const maxPages = Math.max(memPages * 2, 10); 
        let memSec = new WasmBuffer();
        memSec.u32(1);             
        memSec.push(0x01); // CHANGED: 0x01 = has_max (NOT shared). 0x03 was shared memory.
        memSec.u32(memPages);      
        memSec.u32(maxPages);      
        mod.push(...buildSection(5, memSec).data);

        let expSec = new WasmBuffer();
        expSec.u32(definedFuncs.length + 1); 
        for (let i = 0; i < definedFuncs.length; i++) {
            let nameBytes = new TextEncoder().encode(definedFuncs[i].name);
            expSec.u32(nameBytes.length); expSec.push(...nameBytes); 
            expSec.push(0x00); expSec.u32(i + 1); 
        }
        let memNameBytes = new TextEncoder().encode("memory");
        expSec.u32(memNameBytes.length); 
        expSec.push(...memNameBytes); 
        expSec.push(0x02); expSec.u32(0);     
        mod.push(...buildSection(7, expSec).data);

        let codeSec = new WasmBuffer();
        codeSec.u32(definedFuncs.length); 
        
        for (let func of definedFuncs) {
            let funcBody = new WasmBuffer();
            this.locals = {};
            
            let paramCount = func.params.length;
            
            func.params.forEach((p, i) => {
                let wType = p.type.includes('*') ? 0x7F : this.getWasmType(p.type);
                let localInfo = { index: i, wasmType: wType };
                if (p.type.includes('*')) {
                    localInfo.isPointer = true;
                    localInfo.pointedType = this.getWasmType(p.type.replace('*', ''));
                    localInfo.elemSize = this.getElemSize(p.type.replace('*', ''));
                }
                this.locals[p.name] = localInfo;
            });
            
            this.collectLocals(func.body);
            
            let localTypes = [];
            for (let name in this.locals) {
                if (this.locals[name].index < paramCount) continue; 
                localTypes.push(this.locals[name].wasmType);
            }
            
            if (localTypes.length > 0) {
                let groupedDecls = [];
                for (let t of localTypes) {
                    if (groupedDecls.length > 0 && groupedDecls[groupedDecls.length - 1].type === t) {
                        groupedDecls[groupedDecls.length - 1].count++;
                    } else {
                        groupedDecls.push({ type: t, count: 1 });
                    }
                }
                funcBody.u32(groupedDecls.length);
                for (let decl of groupedDecls) {
                    funcBody.u32(decl.count);
                    funcBody.push(decl.type);
                }
            } else {
                funcBody.u32(0); 
            }

            let retType = this.getWasmType(func.returnType);
            for (let stmt of func.body) this.genStmt(funcBody, stmt, retType);
            
            let lastStmt = func.body.length > 0 ? func.body[func.body.length - 1] : null;
            if (!lastStmt || lastStmt.type !== 'Return') {
                if (retType === 0x7F) { funcBody.push(0x41); funcBody.i32(0); }
                else if (retType === 0x7E) { funcBody.push(0x42); funcBody.i64(0); }
                else if (retType === 0x7D) { funcBody.push(0x43, 0x00, 0x00, 0x00, 0x00); }
                else if (retType === 0x7C) { funcBody.push(0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00); }
            }
            funcBody.push(0x0B); 

            codeSec.u32(funcBody.data.length);
            codeSec.push(...funcBody.data);
        }
        mod.push(...buildSection(10, codeSec).data);

        if (this.stringPool.size > 0) {
            let dataSec = new WasmBuffer();
            dataSec.u32(this.stringPool.size);
            for (let [str, strOffset] of this.stringPool) {
                dataSec.u32(0); 
                dataSec.push(0x41); dataSec.i32(strOffset); 
                dataSec.push(0x0B); 
                let bytes = new TextEncoder().encode(str);
                dataSec.u32(bytes.length + 1); 
                dataSec.push(...bytes, 0x00); 
            }
            mod.push(...buildSection(11, dataSec).data);
        }

        return mod.bytes();
    }

    genStmt(buf, stmt, funcRetType) {
        if (stmt.type === 'VarDecl') {
            let local = this.locals[stmt.name];
            if (stmt.isArray) {
                buf.push(0x41); buf.i32(local.baseOffset);
                buf.push(0x21); buf.u32(local.index);
            } else {
                if (stmt.init) this.genExpr(buf, stmt.init, local.wasmType);
                else { 
                    if (local.wasmType === 0x7F) { buf.push(0x41); buf.i32(0); }
                    else if (local.wasmType === 0x7E) { buf.push(0x42); buf.i64(0); }
                    else if (local.wasmType === 0x7D) { buf.push(0x43, 0x00, 0x00, 0x00, 0x00); }
                    else { buf.push(0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00); }
                } 
                buf.push(0x21); buf.u32(local.index); 
            }
        } 
        else if (stmt.type === 'Assign') {
            this.genExpr(buf, stmt.value, this.locals[stmt.name].wasmType);
            buf.push(0x21); buf.u32(this.locals[stmt.name].index);
        } 
        else if (stmt.type === 'DerefAssign') {
            let local = this.locals[stmt.name];
            buf.push(0x20); buf.u32(local.index); 
            this.genExpr(buf, stmt.value, local.pointedType); 
            this.emitStore(buf, local.pointedType, 0); 
        }
        else if (stmt.type === 'ArrayAssign') {
            let local = this.locals[stmt.name];
            buf.push(0x20); buf.u32(local.index); 
            this.genExpr(buf, stmt.index, 0x7F); 
            if (local.elemSize > 1) {
                buf.push(0x41); buf.i32(local.elemSize);
                buf.push(0x6C); 
            }
            buf.push(0x6A); 
            this.genExpr(buf, stmt.value, local.pointedType); 
            this.emitStore(buf, local.pointedType, 0); 
        }
        else if (stmt.type === 'Return') {
            if (stmt.value) this.genExpr(buf, stmt.value, funcRetType);
            buf.push(0x0F); 
        } 
        else if (stmt.type === 'If') {
            this.genExpr(buf, stmt.cond, 0x7F); 
            buf.push(0x04, 0x40); 
            for (let s of stmt.then) this.genStmt(buf, s, funcRetType);
            if (stmt.else.length > 0) {
                buf.push(0x05); 
                for (let s of stmt.else) this.genStmt(buf, s, funcRetType);
            }
            buf.push(0x0B); 
        } 
        else if (stmt.type === 'While') {
            buf.push(0x02, 0x40); 
            buf.push(0x03, 0x40); 
            this.genExpr(buf, stmt.cond, 0x7F);
            buf.push(0x45); 
            buf.push(0x0D); buf.u32(1); 
            for (let s of stmt.body) this.genStmt(buf, s, funcRetType);
            buf.push(0x0C); buf.u32(0); 
            buf.push(0x0B); 
            buf.push(0x0B); 
        }
        else if (stmt.type === 'Call' || stmt.type === 'ExprStmt') {
            let expr = stmt.type === 'ExprStmt' ? stmt.expr : stmt;
            this.genExpr(buf, expr, null);
            if (this.getExprType(expr) !== 0x40) { 
                buf.push(0x1A); 
            }
        }
    }

    genExpr(buf, expr, targetType = null) {
        if (expr.type === 'Num') {
            let wType = this.getExprType(expr);
            let emittedType = wType;
            
            if (targetType === 0x7E && Number.isInteger(expr.value)) {
                buf.push(0x42); buf.i64(expr.value); emittedType = 0x7E;
            } else if (wType === 0x7F) { buf.push(0x41); buf.i32(expr.value); }
            else if (wType === 0x7E) { buf.push(0x42); buf.i64(expr.value); }
            else if (wType === 0x7D) { buf.push(0x43); buf.push(...new Uint8Array(new Float32Array([expr.value]).buffer)); }
            else if (wType === 0x7C) { buf.push(0x44); buf.push(...new Uint8Array(new Float64Array([expr.value]).buffer)); }
            
            if (targetType && targetType !== emittedType) this.emitCast(buf, emittedType, targetType);
        }
        else if (expr.type === 'StringLiteral') {
            let offset = this.stringPool.get(expr.value);
            buf.push(0x41); buf.i32(offset); 
        }
        else if (expr.type === 'Var') {
            let local = this.locals[expr.name];
            buf.push(0x20); buf.u32(local.index);
            if (targetType) this.emitCast(buf, local.wasmType, targetType);
        } 
        else if (expr.type === 'Deref') {
            this.genExpr(buf, expr.expr, 0x7F); 
            this.emitLoad(buf, expr.pointedType, 0); 
            if (targetType) this.emitCast(buf, expr.pointedType, targetType);
        }
        else if (expr.type === 'ArrayAccess') {
            let local = this.locals[expr.name];
            buf.push(0x20); buf.u32(local.index); 
            this.genExpr(buf, expr.index, 0x7F); 
            if (local.elemSize > 1) {
                buf.push(0x41); buf.i32(local.elemSize);
                buf.push(0x6C); 
            }
            buf.push(0x6A); 
            this.emitLoad(buf, expr.pointedType, 0); 
            if (targetType) this.emitCast(buf, expr.pointedType, targetType);
        }
        else if (expr.type === 'Ternary') {
            this.genExpr(buf, expr.cond, 0x7F);
            buf.push(0x04, 0x7F); 
            this.genExpr(buf, expr.then, 0x7F);
            buf.push(0x05); 
            this.genExpr(buf, expr.else, 0x7F);
            buf.push(0x0B); 
            if (targetType && targetType !== 0x7F) this.emitCast(buf, 0x7F, targetType);
        }
        else if (expr.type === 'Call') {
            if (expr.name === '__wasm_memory_size' || expr.name === '__builtin_wasm_memory_size') {
                buf.push(0x3F, 0x00);
                return;
            }
            if (expr.name === '__wasm_memory_grow' || expr.name === '__builtin_wasm_memory_grow') {
                this.genExpr(buf, expr.args[0], 0x7F);
                buf.push(0x40, 0x00);
                return;
            }
            
            // Note: Atomic opcodes are kept here for future use if you ever need them, 
            // but malloc.c no longer uses them.
            if (expr.name === '__atomic_load') {
                this.genExpr(buf, expr.args[0], 0x7F);
                buf.push(0xFE, 0x10, 0x02, 0x00); 
                return;
            }
            if (expr.name === '__atomic_store') {
                this.genExpr(buf, expr.args[0], 0x7F);
                this.genExpr(buf, expr.args[1], 0x7F);
                buf.push(0xFE, 0x17, 0x02, 0x00); 
                return;
            }
            if (expr.name === '__atomic_exchange') {
                this.genExpr(buf, expr.args[0], 0x7F);
                this.genExpr(buf, expr.args[1], 0x7F);
                buf.push(0xFE, 0x25, 0x02, 0x00); 
                return;
            }
            if (expr.name === '__atomic_fetch_sub') {
                this.genExpr(buf, expr.args[0], 0x7F);
                this.genExpr(buf, expr.args[1], 0x7F);
                buf.push(0xFE, 0x21, 0x02, 0x00); 
                return;
            }
            if (expr.name === '__atomic_cmpxchg') {
                this.genExpr(buf, expr.args[0], 0x7F);
                this.genExpr(buf, expr.args[1], 0x7F);
                this.genExpr(buf, expr.args[2], 0x7F);
                buf.push(0xFE, 0x26, 0x02, 0x00); 
                return;
            }
            if (expr.name === '__builtin_trap') {
                buf.push(0x00);
                return;
            }
            
            if (expr.name === 'print') {
                if (expr.args.length > 0) {
                    this.genExpr(buf, expr.args[0], 0x7F);
                } else {
                    buf.push(0x41); buf.i32(0);
                }
                buf.push(0x10); buf.u32(0);
                return;
            }
            
            let func = this.astFunctions.find(f => f.name === expr.name);
            if (!func) throw new Error(`Unknown function: ${expr.name}`);
            for (let i = 0; i < expr.args.length; i++) {
                let paramType = func.params[i].type.includes('*') ? 0x7F : this.getWasmType(func.params[i].type);
                this.genExpr(buf, expr.args[i], paramType);
            }
            buf.push(0x10); buf.u32(this.funcMap[expr.name] + 1);
            let retType = this.getWasmType(func.returnType);
            if (targetType && targetType !== 0x40) this.emitCast(buf, retType, targetType);
        }
        else if (expr.type === 'BinOp') {
            if (expr.op === '&&') {
                buf.push(0x02, 0x7F); 
                this.genExpr(buf, expr.left, 0x7F);
                buf.push(0x45); 
                buf.push(0x41, 0x00); 
                buf.push(0x0D, 0x00); 
                buf.push(0x1A); 
                this.genExpr(buf, expr.right, 0x7F);
                buf.push(0x0B); 
                if (targetType && targetType !== 0x7F) this.emitCast(buf, 0x7F, targetType);
                return;
            }
            if (expr.op === '||') {
                buf.push(0x02, 0x7F); 
                this.genExpr(buf, expr.left, 0x7F);
                buf.push(0x41, 0x01); 
                buf.push(0x0D, 0x00); 
                buf.push(0x1A); 
                this.genExpr(buf, expr.right, 0x7F);
                buf.push(0x0B); 
                if (targetType && targetType !== 0x7F) this.emitCast(buf, 0x7F, targetType);
                return;
            }

            if (expr.isPointerArith) {
                let leftIsPtr = this.isPointerType(expr.left);
                if (expr.op === '+' && !leftIsPtr) {
                    this.genExpr(buf, expr.left, 0x7F);
                    if (expr.elemSize > 1) { buf.push(0x41); buf.i32(expr.elemSize); buf.push(0x6C); }
                    this.genExpr(buf, expr.right, 0x7F);
                    buf.push(0x6A); 
                } else {
                    this.genExpr(buf, expr.left, 0x7F);  
                    this.genExpr(buf, expr.right, 0x7F); 
                    if (expr.elemSize > 1) { buf.push(0x41); buf.i32(expr.elemSize); buf.push(0x6C); }
                    buf.push(expr.op === '+' ? 0x6A : 0x6B); 
                }
                if (targetType) this.emitCast(buf, 0x7F, targetType);
            } else {
                let promotedType = this.getExprType(expr);
                this.genExpr(buf, expr.left, promotedType);
                this.genExpr(buf, expr.right, promotedType);
                buf.push(this.getBinOpOpCode(expr.op, promotedType));
                if (targetType) this.emitCast(buf, promotedType, targetType);
            }
        }
    }
}

// ==========================================
// 5. EXPORTED COMPILER ENTRY POINT
// ==========================================
export function compileToWasm(source, options = {}) {
    const includeResolver = options.includeResolver || ((path) => STDLIB[path]);
    const preprocessed = preprocess(source, includeResolver);
    const tokens = lex(preprocessed);
    const ast = new Parser(tokens).parseProgram();
    const wasmBytes = new CodeGen().generate(ast);
    return wasmBytes;
}