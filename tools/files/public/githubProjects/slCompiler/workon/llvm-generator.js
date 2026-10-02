// llvm-generator.js
function escapeForLLVM(str) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 10) result += '\\0A';
        else if (code === 13) result += '\\0D';
        else if (code === 9) result += '\\09';
        else if (code === 34) result += '\\"';
        else if (code === 39) result += "\\'";
        else if (code === 92) result += '\\\\';
        else if (code < 32 || code >= 127) {
            result += '\\' + code.toString(8).padStart(3, '0');
        } else {
            result += str[i];
        }
    }
    return result;
}

function getLLVMType(slType, typedefMap = {}) {
    const resolved = typedefMap[slType] || slType;
    switch (resolved) {
        case 'int8': case 'uint8': case 'char': case 'bool': return 'i8';
        case 'int16': case 'uint16': return 'i16';
        case 'int32': case 'uint32': return 'i32';
        case 'int64': case 'uint64': return 'i64';
        case 'float32': return 'float';
        case 'float64': return 'double';
        case 'void': return 'void';
        case 'void*': return 'i8*';
        default: 
            if (resolved.endsWith('*')) {
                const baseType = resolved.slice(0, -1);
                const llvmBase = getLLVMType(baseType, typedefMap);
                return `${llvmBase}*`;
            }
            return `%class.${resolved}`;
    }
}

function getTypeSize(slType, typedefMap = {}, classSizes = {}) {
    const resolved = typedefMap[slType] || slType;
    if (classSizes[resolved]) return classSizes[resolved];
    switch (resolved) {
        case 'int8': case 'uint8': case 'char': case 'bool': return 1;
        case 'int16': case 'uint16': return 2;
        case 'int32': case 'uint32': case 'float32': return 4;
        case 'int64': case 'uint64': case 'float64': return 8;
        default:
            if (resolved.endsWith('*')) return 4; // Wasm32 pointer size
            return 4; // Fallback
    }
}

export function generateLLVMIR(ast) {
    let stringCounter = 0;
    let globalDeclarations = [];
    let typeDefinitions = [];
    let functionBodies = [];
    let typedefMap = {};
    let classSizes = {};
    let enumMap = {};
    let classLayouts = {}; 

    for (const item of ast.items) {
        if (item.type === 'TypedefDecl') {
            typedefMap[item.newName] = item.existingType;
        } else if (item.type === 'EnumDecl') {
            const llvmUnderlyingType = getLLVMType(item.underlyingType, typedefMap);
            for (const variant of item.variants) {
                enumMap[variant.name] = { value: variant.value, type: llvmUnderlyingType };
                if (item.isClass) {
                    enumMap[`${item.name}::${variant.name}`] = { value: variant.value, type: llvmUnderlyingType };
                }
            }
        } else if (item.type === 'ClassDecl' || item.type === 'StructDecl') {
            let size = 0;
            const memberTypes = [];
            const memberInfo = [];
            item.members.forEach((m, index) => {
                const t = getLLVMType(m.type, typedefMap);
                memberTypes.push(t);
                memberInfo.push({ name: m.name, type: t, index: index });
                size += getTypeSize(m.type, typedefMap, {});
            });
            classSizes[item.name] = size;
            classLayouts[item.name] = { members: memberInfo, llvmType: `%class.${item.name}` };
            typeDefinitions.push(`%class.${item.name} = type { ${memberTypes.join(', ')} }`);
        }
    }

    globalDeclarations.push("declare i8* @malloc(i32)");
    globalDeclarations.push("declare void @free(i8*)");

    for (const item of ast.items) {
        if (item.type !== 'Function') continue;
        const func = item;
        const retType = getLLVMType(func.returnType, typedefMap);
        let ir = `define ${retType} @${func.name}(`;
        const paramTypes = func.params.map(p => getLLVMType(p.type, typedefMap));
        ir += paramTypes.map((t, i) => `${t} %${i}`).join(', ');
        ir += `) {\nentry:\n`;
        
        const env = {};
        let regCounter = 0;
        const nextReg = () => `%${regCounter++}`;
        let blockCounter = 0;
        const nextBlock = () => `block${blockCounter++}`;

        func.params.forEach((p, i) => {
            const ptr = nextReg();
            const pType = getLLVMType(p.type, typedefMap);
            ir += `  ${ptr} = alloca ${pType}\n`;
            ir += `  store ${pType} %${i}, ${pType}* ${ptr}\n`;
            env[p.name] = { ptr, type: pType };
        });

        function generateExpr(expr) {
            function coerceValue(val, targetType) {
                let storeVal = val.val, storeType = val.type;
                if (storeType !== targetType) {
                    const r = nextReg();
                    if (storeType === 'double' && targetType === 'float') ir += `  ${r} = fptrunc double ${storeVal} to float\n`;
                    else if (storeType === 'float' && targetType === 'double') ir += `  ${r} = fpext float ${storeVal} to double\n`;
                    else if (storeType.startsWith('i') && (targetType === 'float' || targetType === 'double')) ir += `  ${r} = sitofp ${storeType} ${storeVal} to ${targetType}\n`;
                    else if ((storeType === 'float' || storeType === 'double') && targetType.startsWith('i')) ir += `  ${r} = fptosi ${storeType} ${storeVal} to ${targetType}\n`;
                    else if (storeType.startsWith('i') && targetType.startsWith('i')) {
                        const argSize = parseInt(storeType.substring(1));
                        const targetSize = parseInt(targetType.substring(1));
                        if (argSize < targetSize) ir += `  ${r} = sext ${storeType} ${storeVal} to ${targetType}\n`;
                        else if (argSize > targetSize) ir += `  ${r} = trunc ${storeType} ${storeVal} to ${targetType}\n`;
                        else ir += `  ${r} = bitcast ${storeType} ${storeVal} to ${targetType}\n`;
                    } else {
                        ir += `  ${r} = bitcast ${storeType} ${storeVal} to ${targetType}\n`;
                    }
                    storeVal = r; storeType = targetType;
                }
                return { val: storeVal, type: storeType };
            }

            if (expr.type === 'NumberLiteral') return { val: expr.value.toString(), type: 'i32' };
            if (expr.type === 'FloatLiteral') return { val: expr.value.toString(), type: 'double' };
            if (expr.type === 'BoolLiteral') return { val: expr.value ? 'true' : 'false', type: 'i1' };
            
            if (expr.type === 'StringLiteral') {
                const len = expr.value.length + 1;
                const escapedStr = escapeForLLVM(expr.value);
                const strName = `.str.${stringCounter++}`;
                globalDeclarations.push(`@${strName} = private unnamed_addr constant [${len} x i8] c"${escapedStr}\\00"`);
                return { val: `getelementptr inbounds ([${len} x i8], [${len} x i8]* @${strName}, i32 0, i32 0)`, type: 'i8*' };
            }
            if (expr.type === 'Identifier') {
                const varInfo = env[expr.name];
                if (varInfo) {
                    const r = nextReg();
                    ir += `  ${r} = load ${varInfo.type}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    return { val: r, type: varInfo.type };
                }
                if (enumMap.hasOwnProperty(expr.name)) {
                    const enumInfo = enumMap[expr.name];
                    return { val: enumInfo.value.toString(), type: enumInfo.type };
                }
                throw new Error(`Undefined variable: ${expr.name}`);
            }
            
            if (expr.type === 'SizeofExpression') {
                let size = 4;
                if (expr.targetType) {
                    size = getTypeSize(expr.targetType, typedefMap, classSizes);
                }
                return { val: size.toString(), type: 'i32' };
            }

            if (expr.type === 'NewExpression') {
                const elemSize = getTypeSize(expr.typeName, typedefMap, classSizes);
                const sizeReg = nextReg();
                ir += `  ${sizeReg} = call i8* @malloc(i32 ${elemSize})\n`;
                const castReg = nextReg();
                const targetType = getLLVMType(expr.typeName, typedefMap);
                ir += `  ${castReg} = bitcast i8* ${sizeReg} to ${targetType}*\n`;
                return { val: castReg, type: targetType + '*' };
            }

            if (expr.type === 'DeleteExpression') {
                const target = generateExpr(expr.target);
                const castReg = nextReg();
                ir += `  ${castReg} = bitcast ${target.type} ${target.val} to i8*\n`;
                ir += `  call void @free(i8* ${castReg})\n`;
                return { val: 'void', type: 'void' };
            }

            if (expr.type === 'CastExpression') {
                const arg = generateExpr(expr.expression);
                const targetType = getLLVMType(expr.targetType, typedefMap);
                if (arg.type === targetType) return arg;
                
                const r = nextReg();
                let castOp = 'bitcast';
                const isArgInt = arg.type.startsWith('i');
                const isTargetInt = targetType.startsWith('i');
                const isArgFloat = arg.type === 'float' || arg.type === 'double';
                const isTargetFloat = targetType === 'float' || targetType === 'double';

                if (isArgInt && isTargetInt) {
                    const argSize = parseInt(arg.type.substring(1));
                    const targetSize = parseInt(targetType.substring(1));
                    if (argSize < targetSize) castOp = 'sext';
                    else if (argSize > targetSize) castOp = 'trunc';
                } else if (isArgInt && isTargetFloat) {
                    castOp = 'sitofp';
                } else if (isArgFloat && isTargetInt) {
                    castOp = 'fptosi';
                } else if (isArgFloat && isTargetFloat) {
                    castOp = arg.type === 'float' && targetType === 'double' ? 'fpext' : 'fptrunc';
                }
                
                ir += `  ${r} = ${castOp} ${arg.type} ${arg.val} to ${targetType}\n`;
                return { val: r, type: targetType };
            }

            if (expr.type === 'ArrayAccess') {
                if (expr.array.type === 'Identifier') {
                    const varInfo = env[expr.array.name];
                    if (!varInfo || !varInfo.isArray) throw new Error(`Cannot index non-array variable: ${expr.array.name}`);
                    const idx = generateExpr(expr.index);
                    const gepPtr = nextReg();
                    const loadPtr = nextReg();
                    ir += `  ${gepPtr} = getelementptr inbounds [${varInfo.arraySize} x ${varInfo.type}], [${varInfo.arraySize} x ${varInfo.type}]* ${varInfo.ptr}, i32 0, ${idx.type} ${idx.val}\n`;
                    ir += `  ${loadPtr} = load ${varInfo.type}, ${varInfo.type}* ${gepPtr}\n`;
                    return { val: loadPtr, type: varInfo.type };
                }
                throw new Error("Complex array indexing not yet supported");
            }

            if (expr.type === 'PointerMemberAccess') {
                const obj = generateExpr(expr.object);
                const className = obj.type.replace('*', '').replace('%class.', '');
                const layout = classLayouts[className];
                if (!layout) throw new Error(`Cannot access member of unknown class: ${className}`);
                const member = layout.members.find(m => m.name === expr.member);
                if (!member) throw new Error(`Unknown member: ${expr.member}`);
                
                const gepPtr = nextReg();
                ir += `  ${gepPtr} = getelementptr inbounds ${layout.llvmType}, ${layout.llvmType}* ${obj.val}, i32 0, i32 ${member.index}\n`;
                const loadPtr = nextReg();
                ir += `  ${loadPtr} = load ${member.type}, ${member.type}* ${gepPtr}\n`;
                return { val: loadPtr, type: member.type };
            }

            if (expr.type === 'MemberAccess') {
                if (expr.object.type === 'Identifier') {
                    const varInfo = env[expr.object.name];
                    if (!varInfo) throw new Error(`Undefined variable: ${expr.object.name}`);
                    const className = varInfo.type.replace('%class.', '');
                    const layout = classLayouts[className];
                    if (!layout) throw new Error(`Cannot access member of unknown class: ${className}`);
                    const member = layout.members.find(m => m.name === expr.member);
                    if (!member) throw new Error(`Unknown member: ${expr.member}`);
                    
                    const gepPtr = nextReg();
                    ir += `  ${gepPtr} = getelementptr inbounds ${layout.llvmType}, ${layout.llvmType}* ${varInfo.ptr}, i32 0, i32 ${member.index}\n`;
                    const loadPtr = nextReg();
                    ir += `  ${loadPtr} = load ${member.type}, ${member.type}* ${gepPtr}\n`;
                    return { val: loadPtr, type: member.type };
                }
                throw new Error("Complex member access not yet supported");
            }

            if (expr.type === 'UnaryExpression') {
                const arg = generateExpr(expr.argument);
                
                if (expr.operator === '*') {
                    const baseType = arg.type.replace('*', '');
                    const r = nextReg();
                    ir += `  ${r} = load ${baseType}, ${baseType}* ${arg.val}\n`;
                    return { val: r, type: baseType };
                }
                if (expr.operator === '&') {
                    if (expr.argument.type === 'Identifier') {
                        const varInfo = env[expr.argument.name];
                        if (!varInfo) throw new Error(`Undefined variable: ${expr.argument.name}`);
                        return { val: varInfo.ptr, type: varInfo.type + '*' };
                    }
                    throw new Error("Address-of (&) currently only supports simple variables");
                }

                if (expr.operator === '++' || expr.operator === '--') {
                    if (expr.argument.type !== 'Identifier') throw new Error("++/-- must be applied to a variable");
                    const varInfo = env[expr.argument.name];
                    const current = nextReg();
                    ir += `  ${current} = load ${varInfo.type}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    
                    const updated = nextReg();
                    const isFloat = varInfo.type === 'float' || varInfo.type === 'double';
                    const op = expr.operator === '++' ? (isFloat ? 'fadd' : 'add') : (isFloat ? 'fsub' : 'sub');
                    const operand = isFloat ? (expr.operator === '++' ? '1.0' : '1.0') : '1';
                    
                    ir += `  ${updated} = ${op} ${varInfo.type} ${current}, ${operand}\n`;
                    ir += `  store ${varInfo.type} ${updated}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    return { val: updated, type: varInfo.type };
                }

                const r = nextReg();
                if (expr.operator === '-') {
                    if (arg.type === 'i32' || arg.type === 'i64') ir += `  ${r} = sub ${arg.type} 0, ${arg.val}\n`;
                    else ir += `  ${r} = fsub ${arg.type} -0.0, ${arg.val}\n`;
                } else if (expr.operator === '!') {
                    ir += `  ${r} = xor i1 ${arg.val}, true\n`;
                    return { val: r, type: 'i1' };
                } else if (expr.operator === '~') {
                    ir += `  ${r} = xor ${arg.type} ${arg.val}, -1\n`;
                } else if (expr.operator === '+') {
                    return arg;
                }
                return { val: r, type: arg.type };
            }

            if (expr.type === 'BinaryExpression') {
                const left = generateExpr(expr.left);
                const right = generateExpr(expr.right);
                const r = nextReg();
                
                let type = left.type;
                if (type === 'i32' && right.type === 'i64') type = 'i64';
                if (type === 'float' || right.type === 'double') type = 'double';

                const lVal = left.type !== type ? `sext ${left.type} ${left.val} to ${type}` : left.val;
                const rVal = right.type !== type ? `sext ${right.type} ${right.val} to ${type}` : right.val;

                if (['+', '-', '*', '/', '%'].includes(expr.operator)) {
                    const isFloat = type === 'float' || type === 'double';
                    const opMap = isFloat ? { '+': 'fadd', '-': 'fsub', '*': 'fmul', '/': 'fdiv', '%': 'frem' } : { '+': 'add', '-': 'sub', '*': 'mul', '/': 'sdiv', '%': 'srem' };
                    ir += `  ${r} = ${opMap[expr.operator]} ${type} ${lVal}, ${rVal}\n`;
                    return { val: r, type };
                }
                if (['==', '!=', '<', '>', '<=', '>='].includes(expr.operator)) {
                    const isFloat = type === 'float' || type === 'double';
                    const opMapInt = { '==': 'eq', '!=': 'ne', '<': 'slt', '>': 'sgt', '<=': 'sle', '>=': 'sge' };
                    const opMapFloat = { '==': 'oeq', '!=': 'one', '<': 'olt', '>': 'ogt', '<=': 'ole', '>=': 'oge' };
                    const op = isFloat ? opMapFloat[expr.operator] : opMapInt[expr.operator];
                    ir += `  ${r} = icmp ${op} ${type} ${lVal}, ${rVal}\n`;
                    return { val: r, type: 'i1' };
                }
                if (['&&', '||'].includes(expr.operator)) {
                    const op = expr.operator === '&&' ? 'and' : 'or';
                    ir += `  ${r} = ${op} i1 ${lVal}, ${rVal}\n`;
                    return { val: r, type: 'i1' };
                }
                if (['&', '|', '^', '<<', '>>'].includes(expr.operator)) {
                    const opMap = { '&': 'and', '|': 'or', '^': 'xor', '<<': 'shl', '>>': 'ashr' };
                    ir += `  ${r} = ${opMap[expr.operator]} ${type} ${lVal}, ${rVal}\n`;
                    return { val: r, type };
                }
                throw new Error(`Unsupported binary operator: ${expr.operator}`);
            }

            if (expr.type === 'Assignment') {
                if (expr.target.type === 'UnaryExpression' && expr.target.operator === '*') {
                    const ptrExpr = generateExpr(expr.target.argument);
                    const val = generateExpr(expr.value);
                    const baseType = ptrExpr.type.replace('*', '');
                    const coerced = coerceValue(val, baseType);
                    ir += `  store ${coerced.type} ${coerced.val}, ${baseType}* ${ptrExpr.val}\n`;
                    return coerced;
                }

                if (expr.target.type === 'ArrayAccess' && expr.target.array.type === 'Identifier') {
                    const arrName = expr.target.array.name;
                    const varInfo = env[arrName];
                    const val = generateExpr(expr.value);
                    const idx = generateExpr(expr.target.index);
                    const gepPtr = nextReg();
                    ir += `  ${gepPtr} = getelementptr inbounds [${varInfo.arraySize} x ${varInfo.type}], [${varInfo.arraySize} x ${varInfo.type}]* ${varInfo.ptr}, i32 0, ${idx.type} ${idx.val}\n`;
                    const coerced = coerceValue(val, varInfo.type);
                    ir += `  store ${coerced.type} ${coerced.val}, ${varInfo.type}* ${gepPtr}\n`;
                    return coerced;
                }

                if (expr.target.type === 'PointerMemberAccess') {
                    const obj = generateExpr(expr.target.object);
                    const className = obj.type.replace('*', '').replace('%class.', '');
                    const layout = classLayouts[className];
                    if (!layout) throw new Error(`Cannot access member of unknown class: ${className}`);
                    const member = layout.members.find(m => m.name === expr.target.member);
                    if (!member) throw new Error(`Unknown member: ${expr.target.member}`);
                    
                    const gepPtr = nextReg();
                    ir += `  ${gepPtr} = getelementptr inbounds ${layout.llvmType}, ${layout.llvmType}* ${obj.val}, i32 0, i32 ${member.index}\n`;
                    const val = generateExpr(expr.value);
                    const coerced = coerceValue(val, member.type);
                    ir += `  store ${coerced.type} ${coerced.val}, ${member.type}* ${gepPtr}\n`;
                    return coerced;
                }

                if (expr.target.type === 'MemberAccess' && expr.target.object.type === 'Identifier') {
                    const varInfo = env[expr.target.object.name];
                    if (!varInfo) throw new Error(`Undefined variable: ${expr.target.object.name}`);
                    const className = varInfo.type.replace('%class.', '');
                    const layout = classLayouts[className];
                    if (!layout) throw new Error(`Cannot access member of unknown class: ${className}`);
                    const member = layout.members.find(m => m.name === expr.target.member);
                    if (!member) throw new Error(`Unknown member: ${expr.target.member}`);
                    
                    const gepPtr = nextReg();
                    ir += `  ${gepPtr} = getelementptr inbounds ${layout.llvmType}, ${layout.llvmType}* ${varInfo.ptr}, i32 0, i32 ${member.index}\n`;
                    const val = generateExpr(expr.value);
                    const coerced = coerceValue(val, member.type);
                    ir += `  store ${coerced.type} ${coerced.val}, ${member.type}* ${gepPtr}\n`;
                    return coerced;
                }

                let targetName = typeof expr.target === 'string' ? expr.target : expr.target.name;
                const varInfo = env[targetName];
                if (!varInfo) throw new Error(`Undefined variable: ${targetName}`);
                
                const val = generateExpr(expr.value);
                
                if (expr.operator === '=') {
                    const coerced = coerceValue(val, varInfo.type);
                    ir += `  store ${coerced.type} ${coerced.val}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    return coerced;
                } else {
                    const current = nextReg();
                    ir += `  ${current} = load ${varInfo.type}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    const r = nextReg();
                    const op = expr.operator.replace('=', '');
                    const isFloat = varInfo.type === 'float' || varInfo.type === 'double';
                    const intOpMap = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'sdiv', '%': 'srem', '&': 'and', '|': 'or', '^': 'xor', '<<': 'shl', '>>': 'ashr' };
                    const floatOpMap = { '+': 'fadd', '-': 'fsub', '*': 'fmul', '/': 'fdiv' };
                    const finalOp = isFloat && floatOpMap[op] ? floatOpMap[op] : intOpMap[op];
                    
                    const coerced = coerceValue(val, varInfo.type);
                    ir += `  ${r} = ${finalOp} ${varInfo.type} ${current}, ${coerced.val}\n`;
                    ir += `  store ${varInfo.type} ${r}, ${varInfo.type}* ${varInfo.ptr}\n`;
                    return { val: r, type: varInfo.type };
                }
            }

            if (expr.type === 'CallExpression') {
                if (expr.callee === 'print') {
                    const arg = generateExpr(expr.arguments[0]);
                    if (arg.type === 'i1') {
                        const r = nextReg();
                        ir += `  ${r} = zext i1 ${arg.val} to i32\n`;
                        ir += `  call void @sl_print_int(i32 ${r})\n`;
                    } else if (arg.type === 'i32' || arg.type === 'i64') {
                        if (arg.type === 'i64') {
                            const r = nextReg();
                            ir += `  ${r} = trunc i64 ${arg.val} to i32\n`;
                            ir += `  call void @sl_print_int(i32 ${r})\n`;
                        } else {
                            ir += `  call void @sl_print_int(i32 ${arg.val})\n`;
                        }
                    } else if (arg.type === 'float' || arg.type === 'double') {
                        let printVal = arg.val;
                        if (arg.type === 'float') {
                            const r = nextReg();
                            ir += `  ${r} = fpext float ${arg.val} to double\n`;
                            printVal = r;
                        }
                        ir += `  call void @sl_print_float(double ${printVal})\n`;
                    } else {
                        ir += `  call void @sl_print(i8* ${arg.val})\n`;
                    }
                    return { val: 'void', type: 'void' };
                }
                const args = expr.arguments.map(generateExpr);
                const argsStr = args.map((a) => `${a.type} ${a.val}`).join(', ');
                const r = nextReg();
                ir += `  ${r} = call i32 @${expr.callee}(${argsStr})\n`;
                return { val: r, type: 'i32' };
            }
            throw new Error(`Unsupported expression type: ${expr.type}`);
        }

        function generateStmt(stmt) {
            if (stmt.type === 'VarDecl') {
                const ptr = nextReg();
                let vType = getLLVMType(stmt.varType, typedefMap);
                let allocType = vType;
                
                if (stmt.isArray) {
                    const size = stmt.arraySize ? stmt.arraySize.value : 0;
                    allocType = `[${size} x ${vType}]`;
                    env[stmt.name] = { ptr, type: vType, isArray: true, arraySize: size, allocType };
                } else {
                    env[stmt.name] = { ptr, type: vType, isArray: false };
                }
                
                ir += `  ${ptr} = alloca ${allocType}\n`;
                
                if (stmt.initializer && !stmt.isArray) {
                    const val = generateExpr(stmt.initializer);
                    let storeVal = val.val, storeType = val.type;
                    
                    if (storeType !== vType) {
                        const r = nextReg();
                        if (storeType === 'double' && vType === 'float') ir += `  ${r} = fptrunc double ${storeVal} to float\n`;
                        else if (storeType === 'float' && vType === 'double') ir += `  ${r} = fpext float ${storeVal} to double\n`;
                        else if (storeType.startsWith('i') && (vType === 'float' || vType === 'double')) ir += `  ${r} = sitofp ${storeType} ${storeVal} to ${vType}\n`;
                        else if ((storeType === 'float' || storeType === 'double') && vType.startsWith('i')) ir += `  ${r} = fptosi ${storeType} ${storeVal} to ${vType}\n`;
                        else if (storeType.startsWith('i') && vType.startsWith('i')) {
                            const argSize = parseInt(storeType.substring(1));
                            const targetSize = parseInt(vType.substring(1));
                            if (argSize < targetSize) ir += `  ${r} = sext ${storeType} ${storeVal} to ${vType}\n`;
                            else if (argSize > targetSize) ir += `  ${r} = trunc ${storeType} ${storeVal} to ${vType}\n`;
                            else ir += `  ${r} = bitcast ${storeType} ${storeVal} to ${vType}\n`;
                        } else {
                            ir += `  ${r} = bitcast ${storeType} ${storeVal} to ${vType}\n`;
                        }
                        storeVal = r; storeType = vType;
                    }
                    ir += `  store ${storeType} ${storeVal}, ${vType}* ${ptr}\n`;
                }
            } else if (stmt.type === 'ExpressionStatement') {
                generateExpr(stmt.expression);
            } else if (stmt.type === 'ReturnStatement') {
                if (!stmt.expression) {
                    ir += `  ret void\n`;
                } else {
                    const val = generateExpr(stmt.expression);
                    let retVal = val.val, retType = val.type;
                    if (func.returnType === 'int32' && retType === 'i1') {
                        const r = nextReg();
                        ir += `  ${r} = zext i1 ${val.val} to i32\n`;
                        retVal = r; retType = 'i32';
                    } else if (func.returnType === 'int32' && retType === 'i64') {
                        const r = nextReg();
                        ir += `  ${r} = trunc i64 ${val.val} to i32\n`;
                        retVal = r; retType = 'i32';
                    }
                    ir += `  ret ${retType} ${retVal}\n`;
                }
            } else if (stmt.type === 'PrintStatement') {
                generateExpr({ type: 'CallExpression', callee: 'print', arguments: [stmt.expression] });
            } else if (stmt.type === 'IfStatement') {
                const cond = generateExpr(stmt.condition);
                const thenBlock = nextBlock();
                const elseBlock = stmt.elseBlock ? nextBlock() : null;
                const endBlock = nextBlock();
                ir += `  br i1 ${cond.val}, label %${thenBlock}, label %${elseBlock || endBlock}\n`;
                ir += `\n${thenBlock}:\n`;
                for (const s of stmt.thenBlock) generateStmt(s);
                ir += `  br label %${endBlock}\n`;
                if (stmt.elseBlock) {
                    ir += `\n${elseBlock}:\n`;
                    for (const s of stmt.elseBlock) generateStmt(s);
                    ir += `  br label %${endBlock}\n`;
                }
                ir += `\n${endBlock}:\n`;
            } else if (stmt.type === 'WhileStatement') {
                const condBlock = nextBlock(), bodyBlock = nextBlock(), endBlock = nextBlock();
                ir += `  br label %${condBlock}\n`;
                ir += `\n${condBlock}:\n`;
                const cond = generateExpr(stmt.condition);
                ir += `  br i1 ${cond.val}, label %${bodyBlock}, label %${endBlock}\n`;
                ir += `\n${bodyBlock}:\n`;
                for (const s of stmt.body) generateStmt(s);
                ir += `  br label %${condBlock}\n`;
                ir += `\n${endBlock}:\n`;
            } else if (stmt.type === 'ForStatement') {
                const initBlock = nextBlock(), condBlock = nextBlock(), bodyBlock = nextBlock();
                const updateBlock = nextBlock(), endBlock = nextBlock();
                ir += `  br label %${initBlock}\n`;
                ir += `\n${initBlock}:\n`;
                if (stmt.init) {
                    if (stmt.init.type === 'VarDecl') generateStmt(stmt.init);
                    else generateExpr(stmt.init);
                }
                ir += `  br label %${condBlock}\n`;
                ir += `\n${condBlock}:\n`;
                if (stmt.condition) {
                    const cond = generateExpr(stmt.condition);
                    ir += `  br i1 ${cond.val}, label %${bodyBlock}, label %${endBlock}\n`;
                } else {
                    ir += `  br label %${bodyBlock}\n`;
                }
                ir += `\n${bodyBlock}:\n`;
                for (const s of stmt.body) generateStmt(s);
                ir += `  br label %${updateBlock}\n`;
                ir += `\n${updateBlock}:\n`;
                if (stmt.update) generateExpr(stmt.update);
                ir += `  br label %${condBlock}\n`;
                ir += `\n${endBlock}:\n`;
            }
        }

        for (const stmt of func.body) generateStmt(stmt);
        if (func.name === 'main' && !func.body.some(s => s.type === 'ReturnStatement')) {
            ir += `  ret i32 0\n`;
        }
        ir += `}\n`;
        functionBodies.push(ir);
    }

    let ir = "declare void @sl_print(i8*)\n";
    ir += "declare void @sl_print_int(i32)\n";
    ir += "declare void @sl_print_float(double)\n\n";
    if (typeDefinitions.length > 0) ir += typeDefinitions.join("\n") + "\n\n";
    if (globalDeclarations.length > 0) ir += globalDeclarations.join("\n") + "\n\n";
    ir += functionBodies.join("\n");

    return ir.trim();
}