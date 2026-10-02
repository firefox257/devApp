// ./wasm_generator.js
const OPCODES = {
    i32_const: 0x41, local_get: 0x20, local_set: 0x21, local_tee: 0x22,
    global_get: 0x23, global_set: 0x24,
    i32_add: 0x6A, i32_sub: 0x6B, i32_mul: 0x6C, i32_div_s: 0x6D, i32_rem_s: 0x6F,
    i32_eq: 0x46, i32_ne: 0x47, i32_lt_s: 0x48, i32_gt_s: 0x4A, i32_le_s: 0x4C, i32_ge_s: 0x4E,
    i32_eqz: 0x45, i32_and: 0x71, i32_or: 0x72, i32_xor: 0x73, i32_shl: 0x74, i32_shr_s: 0x75,
    
    i32_load: 0x28, i64_load: 0x29, f32_load: 0x2A, f64_load: 0x2B,
    i32_load8_s: 0x2C, i32_load8_u: 0x2D, i32_load16_s: 0x2E, i32_load16_u: 0x2F,
    i64_load8_s: 0x30, i64_load8_u: 0x31, i64_load16_s: 0x32, i64_load16_u: 0x33,
    i64_load32_s: 0x34, i64_load32_u: 0x35,
    
    i32_store: 0x36, i64_store: 0x37, f32_store: 0x38, f64_store: 0x39,
    i32_store8: 0x3A, i32_store16: 0x3B,
    i64_store8: 0x3C, i64_store16: 0x3D, i64_store32: 0x3E,

    f32_const: 0x43, f32_add: 0x92, f32_sub: 0x93, f32_mul: 0x94, f32_div: 0x95,
    f32_eq: 0x5B, f32_lt: 0x5D, f32_gt: 0x5F, f32_le: 0x61, f32_ge: 0x63,
    f64_const: 0x44, f64_add: 0xA0, f64_sub: 0xA1, f64_mul: 0xA2, f64_div: 0xA3,
    f64_eq: 0x64, f64_lt: 0x66, f64_gt: 0x68, f64_le: 0x6A, f64_ge: 0x6C,
    block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0B,
    br: 0x0C, br_if: 0x0D, call: 0x10, return: 0x0F, drop: 0x1A
};
const TYPES = { i32: 0x7F, i64: 0x7E, f32: 0x7D, f64: 0x7C };

function uleb128(n) {
    const bytes = [];
    do {
        let byte = n & 0x7f;
        n >>= 7;
        if (n !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (n !== 0);
    return bytes;
}

function sleb128(n) {
    const bytes = [];
    let more = true;
    while (more) {
        let byte = n & 0x7f;
        n >>= 7;
        if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0)) {
            more = false;
        } else {
            byte |= 0x80;
        }
        bytes.push(byte);
    }
    return bytes;
}

function encodeString(s) {
    const bytes = new TextEncoder().encode(s);
    return [...uleb128(bytes.length), ...bytes];
}

function encodeF32(n) {
    const buf = new ArrayBuffer(4);
    new Float32Array(buf)[0] = n;
    return Array.from(new Uint8Array(buf));
}

function encodeF64(n) {
    const buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = n;
    return Array.from(new Uint8Array(buf));
}

export class WasmGenerator {
    constructor() {
        this.types = [];
        this.imports = [];
        this.funcs = [];
        this.exports = [];
        this.codes = [];
        this.globals = [];
        this.memory = { initial: 3, maximum: 10 }; 
    }

    addType(params, results) {
        this.types.push({ params, results });
        return this.types.length - 1;
    }

    addImport(module, name, typeIdx) {
        this.imports.push({ module, name, typeIdx });
    }

    addGlobal(type, mutable, initType, initValue) {
        this.globals.push({ type, mutable, initType, initValue });
    }

    addFunc(typeIdx, locals, body) {
        this.funcs.push(typeIdx);
        this.codes.push({ locals, body });
    }

    addExport(name, kind, index) {
        this.exports.push({ name, kind, index });
    }

    emit() {
        const magic = [0x00, 0x61, 0x73, 0x6D];
        const version = [0x01, 0x00, 0x00, 0x00];
        const sections = [];
        
        if (this.types.length > 0) {
            const body = [uleb128(this.types.length)];
            for (const t of this.types) {
                body.push(0x60);
                body.push(...uleb128(t.params.length), ...t.params);
                body.push(...uleb128(t.results.length), ...t.results);
            }
            sections.push([1, body.flat()]);
        }

        if (this.imports.length > 0) {
            const body = [uleb128(this.imports.length)];
            for (const imp of this.imports) {
                body.push(...encodeString(imp.module), ...encodeString(imp.name));
                body.push(0x00, ...uleb128(imp.typeIdx));
            }
            sections.push([2, body.flat()]);
        }

        if (this.funcs.length > 0) {
            const body = [uleb128(this.funcs.length), ...this.funcs.flatMap(uleb128)];
            sections.push([3, body.flat()]);
        }

        if (this.memory) {
            const body = [
                0x01, 
                0x01, 
                ...uleb128(this.memory.initial),
                ...uleb128(this.memory.maximum)
            ];
            sections.push([5, body.flat()]);
        }

        if (this.globals.length > 0) {
            const body = [uleb128(this.globals.length)];
            for (const g of this.globals) {
                body.push(g.type);
                body.push(g.mutable ? 0x01 : 0x00);
                if (g.initType === 'i32_const') {
                    body.push(OPCODES.i32_const, ...sleb128(g.initValue));
                } else if (g.initType === 'f32_const') {
                    body.push(OPCODES.f32_const, ...encodeF32(g.initValue));
                } else if (g.initType === 'f64_const') {
                    body.push(OPCODES.f64_const, ...encodeF64(g.initValue));
                }
                body.push(OPCODES.end);
            }
            sections.push([6, body.flat()]);
        }

        if (this.exports.length > 0) {
            const body = [uleb128(this.exports.length)];
            for (const exp of this.exports) {
                body.push(...encodeString(exp.name), exp.kind, ...uleb128(exp.index));
            }
            sections.push([7, body.flat()]);
        }

        if (this.codes.length > 0) {
            const body = [uleb128(this.codes.length)];
            for (const code of this.codes) {
                const localGroups = [];
                if (code.locals.length > 0) {
                    let currentType = code.locals[0].type;
                    let count = 1;
                    for (let i = 1; i < code.locals.length; i++) {
                        if (code.locals[i].type === currentType) count++;
                        else {
                            localGroups.push([count, currentType]);
                            currentType = code.locals[i].type;
                            count = 1;
                        }
                    }
                    localGroups.push([count, currentType]);
                }
                
                const localDecl = [];
                for (const [count, type] of localGroups) {
                    localDecl.push(...uleb128(count), type);
                }
                
                const funcBody = [...uleb128(localGroups.length), ...localDecl, ...code.body, OPCODES.end];
                body.push(...uleb128(funcBody.length), ...funcBody);
            }
            sections.push([10, body.flat()]);
        }

        const allSections = sections.flatMap(([id, data]) => [id, ...uleb128(data.length), ...data]);
        return new Uint8Array([...magic, ...version, ...allSections]);
    }
}

export function compileASTToWasm(ast) {
    const wasm = new WasmGenerator();
    
    // Build class layouts for memory alignment and offset mapping
    const classLayouts = {};
    for (const cls of ast.classes) {
        let offset = 0;
        const fields = {};
        for (const mem of cls.members) {
            let size = 4;
            if (mem.isPointer) size = 4;
            else if (mem.type === 'int8' || mem.type === 'uint8' || mem.type === 'bool' || mem.type === 'char') size = 1;
            else if (mem.type === 'int16' || mem.type === 'uint16') size = 2;
            else if (mem.type === 'int64' || mem.type === 'uint64' || mem.type === 'float64') size = 8;
            else if (mem.type === 'float32' || mem.type === 'int32' || mem.type === 'uint32') size = 4;
            
            // Simple alignment rules
            if (size === 2 && offset % 2 !== 0) offset += 1;
            if (size === 4 && offset % 4 !== 0) offset += (4 - (offset % 4));
            if (size === 8 && offset % 8 !== 0) offset += (8 - (offset % 8));
            
            fields[mem.name] = { offset, type: mem.type, isPointer: mem.isPointer, size };
            offset += size;
        }
        classLayouts[cls.name] = { fields, size: offset };
    }

    function getTypeInfo(type, isPointer) {
        if (isPointer) return { size: 4, wasmType: TYPES.i32, load: OPCODES.i32_load, store: OPCODES.i32_store, align: 2 };
        switch(type) {
            case 'int8': return { size: 1, wasmType: TYPES.i32, load: OPCODES.i32_load8_s, store: OPCODES.i32_store8, align: 0 };
            case 'uint8': case 'bool': case 'char': return { size: 1, wasmType: TYPES.i32, load: OPCODES.i32_load8_u, store: OPCODES.i32_store8, align: 0 };
            case 'int16': return { size: 2, wasmType: TYPES.i32, load: OPCODES.i32_load16_s, store: OPCODES.i32_store16, align: 1 };
            case 'uint16': return { size: 2, wasmType: TYPES.i32, load: OPCODES.i32_load16_u, store: OPCODES.i32_store16, align: 1 };
            case 'int32': case 'uint32': return { size: 4, wasmType: TYPES.i32, load: OPCODES.i32_load, store: OPCODES.i32_store, align: 2 };
            case 'float32': return { size: 4, wasmType: TYPES.f32, load: OPCODES.f32_load, store: OPCODES.f32_store, align: 2 };
            case 'float64': return { size: 8, wasmType: TYPES.f64, load: OPCODES.f64_load, store: OPCODES.f64_store, align: 3 };
            case 'int64': case 'uint64': return { size: 8, wasmType: TYPES.i64, load: OPCODES.i64_load, store: OPCODES.i64_store, align: 3 };
            default: 
                if (classLayouts[type]) return { size: classLayouts[type].size, wasmType: TYPES.i32, load: OPCODES.i32_load, store: OPCODES.i32_store, align: 2 };
                return { size: 4, wasmType: TYPES.i32, load: OPCODES.i32_load, store: OPCODES.i32_store, align: 2 };
        }
    }

    wasm.addExport('memory', 0x02, 0);

    const printI32Type = wasm.addType([TYPES.i32], []);
    const printF32Type = wasm.addType([TYPES.f32], []);
    const printF64Type = wasm.addType([TYPES.f64], []);
    
    const importIndices = {};
    let currentImportIdx = 0;

    wasm.addImport('env', 'print_i32', printI32Type);
    importIndices['print_i32'] = currentImportIdx++;
    wasm.addImport('env', 'print_f32', printF32Type);
    importIndices['print_f32'] = currentImportIdx++;
    wasm.addImport('env', 'print_f64', printF64Type);
    importIndices['print_f64'] = currentImportIdx++;

    const hasMalloc = ast.functions.some(f => f.name === 'malloc');
    const hasFree = ast.functions.some(f => f.name === 'free');

    if (!hasMalloc) {
        const mallocType = wasm.addType([TYPES.i32], [TYPES.i32]);
        wasm.addImport('env', 'malloc', mallocType);
        importIndices['malloc'] = currentImportIdx++;
    }

    if (!hasFree) {
        const freeType = wasm.addType([TYPES.i32], []);
        wasm.addImport('env', 'free', freeType);
        importIndices['free'] = currentImportIdx++;
    }

    const funcReturnsValue = {};
    funcReturnsValue['print'] = false;
    funcReturnsValue['print_i32'] = false;
    funcReturnsValue['print_f32'] = false;
    funcReturnsValue['print_f64'] = false;
    if (!hasMalloc) funcReturnsValue['malloc'] = true;
    if (!hasFree) funcReturnsValue['free'] = false;

    const funcIndices = {};
    let currentFuncIdx = currentImportIdx;
    const funcTypes = [];
    
    for (const func of ast.functions) {
        const paramTypes = func.params.map(p => {
            if (p.type === 'float32') return TYPES.f32;
            if (p.type === 'float64') return TYPES.f64;
            if (p.type === 'int64' || p.type === 'uint64') return TYPES.i64;
            return TYPES.i32;
        });
        const resultType = func.returnType === 'void' ? [] : [TYPES.i32];
        const typeIdx = wasm.addType(paramTypes, resultType);
        funcTypes.push({ func, typeIdx, idx: currentFuncIdx });
        funcIndices[func.name] = currentFuncIdx;
        funcReturnsValue[func.name] = resultType.length > 0;
        currentFuncIdx++;
    }

    const globalConstants = {};
    const globalVars = {};
    let globalIdx = 0;
    
    for (const g of ast.globals || []) {
        if (g.init && g.init.type === 'Literal') {
            let wasmType = TYPES.i32;
            let initType = 'i32_const';
            let initValue = g.init.value;
            if (g.varType === 'float32') { wasmType = TYPES.f32; initType = 'f32_const'; }
            else if (g.varType === 'float64') { wasmType = TYPES.f64; initType = 'f64_const'; }
            
            wasm.addGlobal(wasmType, !g.isConst, initType, initValue);
            globalVars[g.name] = { idx: globalIdx, type: wasmType, isConst: g.isConst };
            globalIdx++;
        } else if (!g.init) {
            let wasmType = TYPES.i32;
            if (g.varType === 'float32') wasmType = TYPES.f32;
            else if (g.varType === 'float64') wasmType = TYPES.f64;
            wasm.addGlobal(wasmType, !g.isConst, 'i32_const', 0);
            globalVars[g.name] = { idx: globalIdx, type: wasmType, isConst: g.isConst };
            globalIdx++;
        } else {
            globalConstants[g.name] = g.init.value;
        }
    }

    for (const { func, typeIdx, idx } of funcTypes) {
        function getWasmType(slType, isPointer = false) {
            if (isPointer) return TYPES.i32;
            if (slType === 'float32') return TYPES.f32;
            if (slType === 'float64') return TYPES.f64;
            if (slType === 'int64' || slType === 'uint64') return TYPES.i64;
            return TYPES.i32;
        }

        function getSlType(wasmType) {
            if (wasmType === TYPES.f32) return 'float32';
            if (wasmType === TYPES.f64) return 'float64';
            if (wasmType === TYPES.i64) return 'int64';
            return 'int32';
        }

        const locals = [];
        const symTab = {};
        let localIdx = 0;

        for (const p of func.params) {
            let wasmType = getWasmType(p.type, p.isPointer);
            symTab[p.name] = { idx: localIdx, type: wasmType, slType: p.type, isPointer: p.isPointer, isClass: !!classLayouts[p.type] };
            locals.push({ type: wasmType });
            localIdx++;
        }

        function compileExpr(expr) {
            const instr = [];
            if (expr.type === 'Literal') {
                if (expr.valueType === 'int32' || expr.valueType === 'bool' || expr.valueType === 'null') {
                    instr.push(OPCODES.i32_const, ...sleb128(expr.value));
                } else if (expr.valueType === 'float32') {
                    instr.push(OPCODES.f32_const, ...encodeF32(expr.value));
                } else if (expr.valueType === 'float64') {
                    instr.push(OPCODES.f64_const, ...encodeF64(expr.value));
                }
            } else if (expr.type === 'Identifier') {
                if (globalVars[expr.name] !== undefined) {
                    instr.push(OPCODES.global_get, ...uleb128(globalVars[expr.name].idx));
                    expr.valueType = getSlType(globalVars[expr.name].type);
                } else if (globalConstants[expr.name] !== undefined) {
                    instr.push(OPCODES.i32_const, ...sleb128(globalConstants[expr.name]));
                    expr.valueType = 'int32';
                } else if (!symTab[expr.name]) {
                    throw new Error(`Unknown variable: ${expr.name}`);
                } else {
                    instr.push(OPCODES.local_get, ...uleb128(symTab[expr.name].idx));
                    expr.valueType = symTab[expr.name].isPointer ? `${symTab[expr.name].slType}*` : symTab[expr.name].slType;
                }
            } else if (expr.type === 'Binary') {
                const leftInstr = compileExpr(expr.left);
                const rightInstr = compileExpr(expr.right);
                instr.push(...leftInstr, ...rightInstr);
                
                let leftType = expr.left.valueType || 'int32';
                let rightType = expr.right.valueType || 'int32';
                let inferredType = 'int32';
                
                if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(expr.op)) {
                    inferredType = 'int32';
                } else if (leftType === 'float64' || rightType === 'float64') {
                    inferredType = 'float64';
                } else if (leftType === 'float32' || rightType === 'float32') {
                    inferredType = 'float32';
                }
                
                expr.valueType = inferredType;
                const isF64 = inferredType === 'float64';
                const isFloat = inferredType === 'float32' || inferredType === 'float64';
                
                if (expr.op === '&&') {
                    instr.push(OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_and);
                } else if (expr.op === '||') {
                    instr.push(OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_eqz, OPCODES.i32_or);
                } else {
                    const i32Map = { 
                        '+': OPCODES.i32_add, '-': OPCODES.i32_sub, '*': OPCODES.i32_mul, '/': OPCODES.i32_div_s, '%': OPCODES.i32_rem_s,
                        '==': OPCODES.i32_eq, '!=': OPCODES.i32_ne, '<': OPCODES.i32_lt_s, '>': OPCODES.i32_gt_s, '<=': OPCODES.i32_le_s, '>=': OPCODES.i32_ge_s,
                        '&': OPCODES.i32_and, '|': OPCODES.i32_or, '^': OPCODES.i32_xor, '<<': OPCODES.i32_shl, '>>': OPCODES.i32_shr_s
                    };
                    const f32Map = { '+': OPCODES.f32_add, '-': OPCODES.f32_sub, '*': OPCODES.f32_mul, '/': OPCODES.f32_div, '==': OPCODES.f32_eq, '<': OPCODES.f32_lt, '>': OPCODES.f32_gt, '<=': OPCODES.f32_le, '>=': OPCODES.f32_ge };
                    const f64Map = { '+': OPCODES.f64_add, '-': OPCODES.f64_sub, '*': OPCODES.f64_mul, '/': OPCODES.f64_div, '==': OPCODES.f64_eq, '<': OPCODES.f64_lt, '>': OPCODES.f64_gt, '<=': OPCODES.f64_le, '>=': OPCODES.f64_ge };

                    let opCode = isF64 ? f64Map[expr.op] : (isFloat ? f32Map[expr.op] : i32Map[expr.op]);
                    if (!opCode) throw new Error(`Unsupported operator: ${expr.op} for type ${inferredType}`);
                    instr.push(opCode);
                }
            } else if (expr.type === 'Unary') {
                const rightInstr = compileExpr(expr.right);
                let rightType = expr.right.valueType || 'int32';
                expr.valueType = rightType;
                
                if (expr.op === '-') {
                    if (rightType === 'float32') {
                        instr.push(OPCODES.f32_const, ...encodeF32(-0.0));
                        instr.push(...rightInstr);
                        instr.push(OPCODES.f32_sub);
                    } else if (rightType === 'float64') {
                        instr.push(OPCODES.f64_const, ...encodeF64(-0.0));
                        instr.push(...rightInstr);
                        instr.push(OPCODES.f64_sub);
                    } else {
                        instr.push(OPCODES.i32_const, ...sleb128(0));
                        instr.push(...rightInstr);
                        instr.push(OPCODES.i32_sub);
                    }
                } else if (expr.op === '!') {
                    instr.push(...rightInstr);
                    instr.push(OPCODES.i32_eqz);
                } else if (expr.op === '~') {
                    instr.push(OPCODES.i32_const, ...sleb128(-1));
                    instr.push(...rightInstr);
                    instr.push(OPCODES.i32_xor);
                }
            } else if (expr.type === 'Assignment') {
                if (expr.left.type === 'Identifier') {
                    if (globalVars[expr.left.name] !== undefined) {
                        instr.push(...compileExpr(expr.right));
                        if (expr.op === '=') {
                            instr.push(OPCODES.global_set, ...uleb128(globalVars[expr.left.name].idx));
                            instr.push(OPCODES.global_get, ...uleb128(globalVars[expr.left.name].idx));
                        } else {
                            instr.push(OPCODES.global_get, ...uleb128(globalVars[expr.left.name].idx));
                            const opMap = { '+=': OPCODES.i32_add, '-=': OPCODES.i32_sub, '*=': OPCODES.i32_mul, '/=': OPCODES.i32_div_s, '%=': OPCODES.i32_rem_s, '&=': OPCODES.i32_and, '|=': OPCODES.i32_or, '^=': OPCODES.i32_xor, '<<=': OPCODES.i32_shl, '>>=': OPCODES.i32_shr_s };
                            instr.push(opMap[expr.op] || OPCODES.i32_add);
                            instr.push(OPCODES.global_set, ...uleb128(globalVars[expr.left.name].idx));
                            instr.push(OPCODES.global_get, ...uleb128(globalVars[expr.left.name].idx));
                        }
                        expr.valueType = getSlType(globalVars[expr.left.name].type);
                    } else if (symTab[expr.left.name] !== undefined) {
                        const lIdx = symTab[expr.left.name].idx;
                        if (expr.op === '=') {
                            instr.push(...compileExpr(expr.right));
                            instr.push(OPCODES.local_tee, ...uleb128(lIdx));
                            expr.valueType = symTab[expr.left.name].isPointer ? `${symTab[expr.left.name].slType}*` : symTab[expr.left.name].slType;
                        } else {
                            instr.push(OPCODES.local_get, ...uleb128(lIdx));
                            instr.push(...compileExpr(expr.right));
                            const opMap = { '+=': OPCODES.i32_add, '-=': OPCODES.i32_sub, '*=': OPCODES.i32_mul, '/=': OPCODES.i32_div_s, '%=': OPCODES.i32_rem_s, '&=': OPCODES.i32_and, '|=': OPCODES.i32_or, '^=': OPCODES.i32_xor, '<<=': OPCODES.i32_shl, '>>=': OPCODES.i32_shr_s };
                            instr.push(opMap[expr.op] || OPCODES.i32_add);
                            instr.push(OPCODES.local_tee, ...uleb128(lIdx));
                        }
                    } else {
                        throw new Error(`Unknown variable: ${expr.left.name}`);
                    }
                } else if (expr.left.type === 'MemberAccess') {
                    // FIX: Compile object FIRST so its valueType is populated
                    const objInstr = compileExpr(expr.left.object);
                    let className = expr.left.object.valueType;
                    if (className && className.endsWith('*')) className = className.slice(0, -1);
                    
                    const layout = classLayouts[className];
                    const field = layout.fields[expr.left.member];
                    
                    instr.push(...objInstr);
                    if (field.offset > 0) {
                        instr.push(OPCODES.i32_const, ...sleb128(field.offset));
                        instr.push(OPCODES.i32_add);
                    }
                    
                    instr.push(...compileExpr(expr.right));
                    
                    const info = getTypeInfo(field.type, field.isPointer);
                    instr.push(info.store, ...uleb128(info.align), ...uleb128(0));
                    expr.valueType = field.type;
                } else if (expr.left.type === 'Dereference') {
                    instr.push(...compileExpr(expr.left.operand));
                    instr.push(...compileExpr(expr.right));
                    
                    const ptrType = expr.left.operand.valueType || 'int32*';
                    const baseType = ptrType.endsWith('*') ? ptrType.slice(0, -1) : 'int32';
                    const info = getTypeInfo(baseType, false);
                    instr.push(info.store, ...uleb128(info.align), ...uleb128(0));
                    expr.valueType = baseType;
                } else if (expr.left.type === 'ArrayIndex') {
                    const objInstr = compileExpr(expr.left.object);
                    const idxInstr = compileExpr(expr.left.index);
                    instr.push(...objInstr, ...idxInstr);
                    instr.push(OPCODES.i32_const, ...sleb128(2));
                    instr.push(OPCODES.i32_shl);
                    instr.push(OPCODES.i32_add);
                    
                    if (expr.op === '=') {
                        instr.push(...compileExpr(expr.right));
                        instr.push(OPCODES.i32_store, ...uleb128(2), ...uleb128(0));
                        expr.valueType = 'int32';
                    }
                }
            } else if (expr.type === 'Call') {
                for (const arg of expr.args) instr.push(...compileExpr(arg));
                if (expr.name === 'print') {
                    const argType = expr.args.length > 0 ? (expr.args[0].valueType || 'int32') : 'int32';
                    let target = 'print_i32';
                    if (argType === 'float32') target = 'print_f32';
                    else if (argType === 'float64') target = 'print_f64';
                    instr.push(OPCODES.call, ...uleb128(importIndices[target]));
                } else if (funcIndices[expr.name] !== undefined) {
                    instr.push(OPCODES.call, ...uleb128(funcIndices[expr.name]));
                } else {
                    throw new Error(`Unknown function: ${expr.name}`);
                }
            } else if (expr.type === 'MethodCall') {
                // FIX: Compile object FIRST so its valueType is populated
                const objInstr = compileExpr(expr.object);
                instr.push(...objInstr);
                
                let className = expr.object.valueType;
                if (className && className.endsWith('*')) className = className.slice(0, -1);
                
                const methodName = `${className}::${expr.member}`;
                
                for (const arg of expr.args) instr.push(...compileExpr(arg));
                
                if (funcIndices[methodName] !== undefined) {
                    instr.push(OPCODES.call, ...uleb128(funcIndices[methodName]));
                    expr.valueType = funcReturnsValue[methodName] ? 'int32' : 'void';
                } else {
                    throw new Error(`Unknown method: ${methodName}`);
                }
            } else if (expr.type === 'Ternary') {
                instr.push(...compileExpr(expr.condition));
                instr.push(OPCODES.i32_eqz, OPCODES.i32_eqz);
                instr.push(OPCODES.if, 0x7F);
                instr.push(...compileExpr(expr.trueExpr));
                instr.push(OPCODES.else);
                instr.push(...compileExpr(expr.falseExpr));
                instr.push(OPCODES.end);
            } else if (expr.type === 'Cast') {
                instr.push(...compileExpr(expr.expr));
                expr.valueType = expr.targetType;
            } else if (expr.type === 'ArrayIndex') {
                const objInstr = compileExpr(expr.object);
                const idxInstr = compileExpr(expr.index);
                instr.push(...objInstr, ...idxInstr);
                instr.push(OPCODES.i32_const, ...sleb128(2));
                instr.push(OPCODES.i32_shl);
                instr.push(OPCODES.i32_add);
                instr.push(OPCODES.i32_load, ...uleb128(2), ...uleb128(0));
                expr.valueType = 'int32';
            } else if (expr.type === 'MemberAccess') {
                // FIX: Compile object FIRST so its valueType is populated
                const objInstr = compileExpr(expr.object);
                instr.push(...objInstr);
                
                let className = expr.object.valueType;
                if (className && className.endsWith('*')) className = className.slice(0, -1);
                
                const layout = classLayouts[className];
                const field = layout.fields[expr.member];
                
                if (field.offset > 0) {
                    instr.push(OPCODES.i32_const, ...sleb128(field.offset));
                    instr.push(OPCODES.i32_add);
                }
                
                const info = getTypeInfo(field.type, field.isPointer);
                instr.push(info.load, ...uleb128(info.align), ...uleb128(0));
                expr.valueType = field.isPointer ? `${field.type}*` : field.type;
            } else if (expr.type === 'AddressOf') {
                if (expr.operand.type === 'Identifier') {
                    const name = expr.operand.name;
                    if (symTab[name] && symTab[name].isClass) {
                        instr.push(OPCODES.local_get, ...uleb128(symTab[name].idx));
                        expr.valueType = `${symTab[name].slType}*`;
                    } else {
                        throw new Error(`Cannot take address of non-class local '${name}' without stack allocation.`);
                    }
                } else {
                    throw new Error("Cannot take address of complex expression");
                }
            } else if (expr.type === 'Dereference') {
                instr.push(...compileExpr(expr.operand));
                const ptrType = expr.operand.valueType || 'int32*';
                const baseType = ptrType.endsWith('*') ? ptrType.slice(0, -1) : 'int32';
                const info = getTypeInfo(baseType, false);
                instr.push(info.load, ...uleb128(info.align), ...uleb128(0));
                expr.valueType = baseType;
            } else if (expr.type === 'Postfix') {
                if (expr.operand.type === 'Identifier') {
                    const lIdx = symTab[expr.operand.name].idx;
                    instr.push(OPCODES.local_get, ...uleb128(lIdx));
                    instr.push(OPCODES.local_get, ...uleb128(lIdx));
                    instr.push(OPCODES.i32_const, ...sleb128(1));
                    if (expr.op === '++') instr.push(OPCODES.i32_add);
                    else instr.push(OPCODES.i32_sub);
                    instr.push(OPCODES.local_set, ...uleb128(lIdx));
                    expr.valueType = 'int32';
                }
            } else if (expr.type === 'Prefix') {
                if (expr.operand.type === 'Identifier') {
                    const lIdx = symTab[expr.operand.name].idx;
                    instr.push(OPCODES.local_get, ...uleb128(lIdx));
                    instr.push(OPCODES.i32_const, ...sleb128(1));
                    if (expr.op === '++') instr.push(OPCODES.i32_add);
                    else instr.push(OPCODES.i32_sub);
                    instr.push(OPCODES.local_tee, ...uleb128(lIdx));
                    expr.valueType = 'int32';
                }
            } else if (expr.type === 'New') {
                let size = 4;
                if (classLayouts[expr.valueType]) {
                    size = classLayouts[expr.valueType].size;
                } else if (expr.valueType === 'int64' || expr.valueType === 'uint64' || expr.valueType === 'float64') size = 8;
                else if (expr.valueType === 'float32') size = 4;
                
                if (expr.isArray) {
                    instr.push(...compileExpr(expr.sizeExpr));
                    instr.push(OPCODES.i32_const, ...sleb128(size));
                    instr.push(OPCODES.i32_mul);
                } else {
                    instr.push(OPCODES.i32_const, ...sleb128(size));
                }
                
                const targetMalloc = funcIndices['malloc'] !== undefined ? funcIndices['malloc'] : importIndices['malloc'];
                if (targetMalloc !== undefined) {
                    instr.push(OPCODES.call, ...uleb128(targetMalloc));
                } else {
                    throw new Error("malloc not found for new expression");
                }
                expr.valueType = `${expr.valueType}*`;
            } else if (expr.type === 'Delete') {
                instr.push(...compileExpr(expr.operand));
                const targetFree = funcIndices['free'] !== undefined ? funcIndices['free'] : importIndices['free'];
                if (targetFree !== undefined) {
                    instr.push(OPCODES.call, ...uleb128(targetFree));
                } else {
                    throw new Error("free not found for delete expression");
                }
            }
            return instr;
        }

        function needsDrop(expr) {
            if (expr.type === 'Assignment') {
                return expr.left.type === 'Identifier'; // Only local_tee leaves a value
            }
            if (expr.type === 'Call') return funcReturnsValue[expr.name] !== false;
            if (expr.type === 'MethodCall') {
                let className = expr.object.valueType;
                if (className && className.endsWith('*')) className = className.slice(0, -1);
                return funcReturnsValue[`${className}::${expr.member}`] !== false;
            }
            if (expr.type === 'New') return true;
            if (expr.type === 'Postfix' || expr.type === 'Prefix') return true;
            return false;
        }

        function compileStmt(stmt, breakOffset = null, continueOffset = null) {
            const instr = [];
            if (stmt.type === 'VarDecl') {
                let wasmType = getWasmType(stmt.varType, stmt.isPointer);
                const isClass = !!classLayouts[stmt.varType];
                symTab[stmt.name] = { idx: localIdx, type: wasmType, slType: stmt.varType, isPointer: stmt.isPointer, isClass };
                locals.push({ type: wasmType });
                localIdx++;
                
                if (isClass && !stmt.isPointer) {
                    // Implicitly allocate on heap for value semantics
                    const size = classLayouts[stmt.varType].size;
                    instr.push(OPCODES.i32_const, ...sleb128(size));
                    const targetMalloc = funcIndices['malloc'] !== undefined ? funcIndices['malloc'] : importIndices['malloc'];
                    instr.push(OPCODES.call, ...uleb128(targetMalloc));
                    instr.push(OPCODES.local_set, ...uleb128(symTab[stmt.name].idx));
                } else if (stmt.init) {
                    instr.push(...compileExpr(stmt.init), OPCODES.local_set, ...uleb128(symTab[stmt.name].idx));
                }
            } else if (stmt.type === 'Break') {
                if (breakOffset === null) throw new Error("break outside of loop");
                instr.push(OPCODES.br, ...uleb128(breakOffset));
            } else if (stmt.type === 'Continue') {
                if (continueOffset === null) throw new Error("continue outside of loop");
                instr.push(OPCODES.br, ...uleb128(continueOffset));
            } else if (stmt.type === 'Return') {
                if (stmt.value) {
                    instr.push(...compileExpr(stmt.value));
                } else if (func.returnType !== 'void') {
                    instr.push(OPCODES.i32_const, ...sleb128(0));
                }
                instr.push(OPCODES.return);
            } else if (stmt.type === 'Assert') {
                instr.push(...compileExpr(stmt.condition));
                instr.push(OPCODES.i32_eqz);
                instr.push(OPCODES.if, 0x40);
                instr.push(0x00);
                instr.push(OPCODES.end);
            } else if (stmt.type === 'Throw') {
                instr.push(0x00); // unreachable
            } else if (stmt.type === 'TryCatch') {
                for (const s of stmt.tryBlock) {
                    instr.push(...compileStmt(s, breakOffset, continueOffset));
                }
            } else if (stmt.type === 'ExpressionStatement') {
                instr.push(...compileExpr(stmt.expression));
                if (needsDrop(stmt.expression)) instr.push(OPCODES.drop);
            } else if (stmt.type === 'If') {
                instr.push(...compileExpr(stmt.condition), OPCODES.if, 0x40);
                const newBreak = breakOffset !== null ? breakOffset + 1 : null;
                const newContinue = continueOffset !== null ? continueOffset + 1 : null;
                for (const s of stmt.then) instr.push(...compileStmt(s, newBreak, newContinue));
                if (stmt.else.length > 0) {
                    instr.push(OPCODES.else);
                    for (const s of stmt.else) instr.push(...compileStmt(s, newBreak, newContinue));
                }
                instr.push(OPCODES.end);
            } else if (stmt.type === 'While') {
                instr.push(OPCODES.block, 0x40);
                instr.push(OPCODES.loop, 0x40);
                instr.push(...compileExpr(stmt.condition));
                instr.push(OPCODES.i32_eqz);
                instr.push(OPCODES.br_if, 0x01);
                for (const s of stmt.body) instr.push(...compileStmt(s, 1, 0));
                instr.push(OPCODES.br, 0x00);
                instr.push(OPCODES.end, OPCODES.end);
            } else if (stmt.type === 'DoWhile') {
                instr.push(OPCODES.block, 0x40);
                instr.push(OPCODES.loop, 0x40);
                for (const s of stmt.body) {
                    instr.push(...compileStmt(s, 1, 0));
                }
                instr.push(...compileExpr(stmt.condition));
                instr.push(OPCODES.br_if, 0x00);
                instr.push(OPCODES.end);
                instr.push(OPCODES.end);
            } else if (stmt.type === 'For') {
                if (stmt.init) instr.push(...compileStmt(stmt.init, breakOffset, continueOffset));
                instr.push(OPCODES.block, 0x40);
                instr.push(OPCODES.loop, 0x40);
                if (stmt.condition) {
                    instr.push(...compileExpr(stmt.condition));
                    instr.push(OPCODES.i32_eqz);
                    instr.push(OPCODES.br_if, 0x01);
                }
                instr.push(OPCODES.block, 0x40);
                for (const s of stmt.body) instr.push(...compileStmt(s, 2, 0));
                instr.push(OPCODES.end);
                if (stmt.update) {
                    instr.push(...compileExpr(stmt.update));
                    if (needsDrop(stmt.update)) instr.push(OPCODES.drop);
                }
                instr.push(OPCODES.br, 0x00);
                instr.push(OPCODES.end, OPCODES.end);
            }
            return instr;
        }

        const body = [];
        
        if (func.name === 'main' && funcIndices['init_heap'] !== undefined) {
            body.push(OPCODES.call, ...uleb128(funcIndices['init_heap']));
        }
        
        for (const stmt of func.body) body.push(...compileStmt(stmt, null, null));
        
        const isVoid = func.returnType === 'void';
        if (!isVoid && (func.body.length === 0 || func.body[func.body.length - 1].type !== 'Return')) {
            body.push(OPCODES.i32_const, ...sleb128(0));
        }

        wasm.addFunc(typeIdx, locals, body);
        if (func.name === 'main') {
            wasm.addExport('main', 0x00, idx);
        }
    }
    return wasm.emit();
}