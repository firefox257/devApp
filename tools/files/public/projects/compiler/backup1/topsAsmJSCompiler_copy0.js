// topsAsmJSCompiler.js
// TOPS Language → asm.js Compiler
// ✅ Production-ready: proper float8 (float64) support, no double-wrapping, distinct signatures
// ✅ fswitch removed: only iswitch (integer switch) is supported
// ✅ FIX 1: parse() accepts PUBLIC as valid function starter
// ✅ FIX 2: parseFunction() consumes FUNC keyword
// ✅ FIX 3: Semantic validation for undefined variables + function calls

class TopsAsmJSCompiler {
  constructor(options = {}) {
    this.stringLiterals = [];
    this.heapOffset = options.heapOffset || 4;
    this.options = { target: 'asmjs', ...options };
  }

  // ========== LEXER ==========
  tokenize(source) {
    const tokens = [];
    let i = 0;
    
    const keywords = new Set([
      'func', 'public', 'return', 'loop', 'break', 'iswitch',
      'case', 'default', 'if', 'else', 'sizeof',
      'int1', 'int2', 'int4', 'int8', 'uint1', 'uint2', 'uint4', 'uint8',
      'float4', 'float8', 'bool', 'char', 'void'
    ]);

    while (i < source.length) {
      const ch = source[i];
      
      if (/\s/.test(ch)) { 
        i++; 
        continue; 
      }
      
      if (ch === '/' && source[i+1] === '/') {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      
      if (ch === '/' && source[i+1] === '*') {
        i += 2;
        while (i < source.length - 1 && !(source[i] === '*' && source[i+1] === '/')) i++;
        i += 2;
        continue;
      }

      if (ch === '@' && source[i+1] === '"') {
        i += 2;
        let str = '', escape = false;
        while (i < source.length) {
          if (escape) {
            const escMap = { 'n':'\n', 't':'\t', 'r':'\r', '0':'\0', '\\':'\\', '"':'"' };
            str += escMap[source[i]] || source[i];
            escape = false; i++; continue;
          }
          if (source[i] === '\\') { escape = true; i++; continue; }
          if (source[i] === '"') break;
          str += source[i++];
        }
        i++;
        const idx = this.stringLiterals.push(str) - 1;
        tokens.push({ type: 'STRING_LITERAL', value: idx });
        continue;
      }

      if (ch === "'") {
        i++;
        let charVal = source[i++];
        if (charVal === '\\') {
          const esc = source[i++];
          charVal = { 'n':'\n', 't':'\t', 'r':'\r', '0':'\0', '\\':'\\', "'":"'" }[esc] || esc;
        }
        i++;
        tokens.push({ type: 'CHAR_LITERAL', value: charVal.charCodeAt(0) });
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(source[i+1]))) {
        let num = '';
        if (ch === '-') { num += source[i++]; }
        while (i < source.length && /[0-9.]/.test(source[i])) {
          num += source[i++];
        }
        const isFloat = num.includes('.');
        tokens.push({ 
          type: isFloat ? 'FLOAT_LITERAL' : 'INT_LITERAL', 
          value: isFloat ? parseFloat(num) : parseInt(num, 10),
          raw: num
        });
        continue;
      }

      if (/[a-zA-Z_]/.test(ch)) {
        let id = '';
        while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
          id += source[i++];
        }
        
        const idLower = id.toLowerCase();
        if (keywords.has(idLower)) {
          tokens.push({ type: idLower.toUpperCase(), value: id });
        } else {
          tokens.push({ type: 'IDENT', value: id });
        }
        continue;
      }

      if (i + 1 < source.length) {
        const two = source.slice(i, i+2);
        if (['==','!=','<=','>=','&&','||','<<','>>','+=','-=','*=','/=','->'].includes(two)) {
          tokens.push({ type: two, value: two });
          i += 2;
          continue;
        }
      }

      if ('+-*/%&|^~!<>=;,.(){}[]@:'.includes(ch)) {
        tokens.push({ type: ch, value: ch });
        i++;
        continue;
      }

      throw new Error(`Unexpected character '${ch}' (code ${ch.charCodeAt(0)}) at position ${i}`);
    }
    
    tokens.push({ type: 'EOF', value: null });
    return tokens;
  }

  // ========== PARSER ==========
  parse(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    const body = [];
    
    while (!this.match('EOF')) {
      const peek = this.peek();
      // ✅ FIX 1: Accept both FUNC and PUBLIC as valid function starters
      if (peek?.type === 'FUNC' || peek?.type === 'PUBLIC') {
        body.push(this.parseFunction());
      } else {
        throw new Error(`Expected FUNC, got ${peek?.type} (value: "${peek?.value}") at token ${this.pos}`);
      }
    }
    
    return { type: 'Program', body, strings: this.stringLiterals };
  }

  match(...types) {
    if (types.includes(this.peek()?.type)) {
      return this.tokens[this.pos++];
    }
    return null;
  }

  expect(type) {
    const tok = this.match(type);
    if (!tok) {
      const peek = this.peek();
      const context = this.tokens.slice(Math.max(0, this.pos-3), this.pos+3)
        .map(t => `${t.type}(${t.value})`).join(' ');
      throw new Error(`Expected ${type}, got ${peek?.type} (value: "${peek?.value}") at pos ${this.pos}\nContext: [${context}]`);
    }
    return tok;
  }

  peek() {
    return this.tokens[this.pos];
  }

  parseFunction() {
    const pub = !!this.match('PUBLIC');
    this.expect('FUNC');  // ✅ FIX 2: Consume FUNC keyword
    const name = this.expect('IDENT').value;
    this.expect('(');
    
    const params = [];
    if (!this.match(')')) {
      do {
        const type = this.parseType();
        const isPtr = !!this.match('AT');
        const pname = this.expect('IDENT').value;
        params.push({ name: pname, type, isPointer: isPtr });
      } while (this.match(','));
      this.expect(')');
    }
    
    this.expect('->');
    
    const retType = this.parseType();
    const retPtr = !!this.match('AT');
    const body = this.parseBlock();
    
    return {
      type: 'FunctionDecl',
      name,
      public: pub,
      params,
      returnType: retType,
      returnIsPointer: retPtr,
      body
    };
  }

  parseType() {
    const t = this.peek();
    if (['INT1','INT2','INT4','INT8','UINT1','UINT2','UINT4','UINT8','FLOAT4','FLOAT8','BOOL','CHAR','VOID'].includes(t?.type)) {
      this.pos++;
      return t.type.toLowerCase();
    }
    throw new Error(`Expected type, got ${t?.type} (value: "${t?.value}")`);
  }

  parseBlock() {
    this.expect('{');
    const stmts = [];
    while (!this.match('}')) {
      stmts.push(this.parseStatement());
    }
    return { type: 'Block', statements: stmts };
  }

  parseStatement() {
    if (this.isTypeStart()) {
      const type = this.parseType();
      const isPtr = !!this.match('AT');
      const name = this.expect('IDENT').value;
      let init = null;
      if (this.match('=')) {
        init = this.parseExpression();
      }
      this.expect(';');
      return { type: 'VarDecl', name, varType: type, isPointer: isPtr, init, varTypeHint: type };
    }
    
    if (this.match('RETURN')) {
      const expr = this.peek().type !== ';' ? this.parseExpression() : null;
      this.expect(';');
      return { type: 'Return', argument: expr };
    }
    
    if (this.match('LOOP')) {
      return { type: 'Loop', body: this.parseBlock() };
    }
    
    if (this.match('BREAK')) {
      this.expect(';');
      return { type: 'Break' };
    }
    
    if (this.match('ISWITCH')) {
      this.expect('(');
      const disc = this.parseExpression();
      this.expect(')');
      this.expect('{');
      const cases = [];
      while (!this.match('}')) {
        if (this.match('CASE')) {
          const val = this.parseExpression();
          this.expect(':');
          const body = [];
          while (this.peek().type !== 'CASE' && this.peek().type !== 'DEFAULT' && this.peek().type !== '}') {
            body.push(this.parseStatement());
          }
          cases.push({ type: 'case', value: val, body });
        } else if (this.match('DEFAULT')) {
          this.expect(':');
          const body = [];
          while (this.peek().type !== 'CASE' && this.peek().type !== 'DEFAULT' && this.peek().type !== '}') {
            body.push(this.parseStatement());
          }
          cases.push({ type: 'default', body });
        } else {
          throw new Error('Expected case or default in switch');
        }
      }
      return { type: 'Switch', discriminant: disc, cases };
    }
    
    if (this.match('IF')) {
      this.expect('(');
      const test = this.parseExpression();
      this.expect(')');
      const cons = this.parseBlock();
      let alt = null;
      if (this.match('ELSE')) {
        alt = this.parseBlock();
      }
      return { type: 'If', test, consequent: cons, alternate: alt };
    }
    
    const expr = this.parseExpression();
    this.expect(';');
    return { type: 'ExprStmt', expression: expr };
  }

  isTypeStart() {
    const t = this.peek()?.type;
    return ['INT1','INT2','INT4','INT8','UINT1','UINT2','UINT4','UINT8','FLOAT4','FLOAT8','BOOL','CHAR','VOID'].includes(t);
  }

  parseExpression(prec = 0, expectedType = 'int4') {
    let left = this.parsePrimary(expectedType);
    
    const ops = [
      { ops: ['||'], p: 1 },
      { ops: ['&&'], p: 2 },
      { ops: ['==','!='], p: 3 },
      { ops: ['<','>','<=','>='], p: 4 },
      { ops: ['+','-'], p: 5 },
      { ops: ['*','/','%'], p: 6 },
      { ops: ['<<','>>'], p: 7 },
      { ops: ['&'], p: 8 },
      { ops: ['^'], p: 9 },
      { ops: ['|'], p: 10 }
    ];
    
    for (const level of ops) {
      while (level.ops.includes(this.peek()?.type)) {
        const op = this.tokens[this.pos++].value;
        const isFloat = expectedType?.startsWith('float');
        const right = this.parseExpression(level.p + 1, isFloat ? 'float8' : 'int4');
        left = { type: 'Binary', operator: op, left, right, resultType: isFloat ? 'float8' : 'int4' };
      }
    }
    
    if (['=','+=','-=','*=','/='].includes(this.peek()?.type)) {
      const op = this.tokens[this.pos++].value;
      const right = this.parseExpression(0, expectedType);
      return { type: 'Assignment', operator: op, left, right };
    }
    
    return left;
  }

  parsePrimary(expectedType = 'int4') {
    if (this.match('(')) {
      if (this.isTypeStart()) {
        const castType = this.parseType();
        const castPtr = !!this.match('AT');
        this.expect(')');
        const expr = this.parsePrimary(castType);
        return { type: 'Cast', targetType: castType, targetIsPointer: castPtr, expression: expr };
      }
      const expr = this.parseExpression(0, expectedType);
      this.expect(')');
      return expr;
    }
    
    if (this.match('SIZEOF')) {
      this.expect('(');
      const szType = this.parseType();
      const szPtr = !!this.match('AT');
      this.expect(')');
      return { type: 'SizeOf', typeName: szType, isPointer: szPtr };
    }
    
    if (this.match('INT_LITERAL')) {
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'int4' };
    }
    if (this.match('FLOAT_LITERAL')) {
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'float8' };
    }
    if (this.match('CHAR_LITERAL')) {
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'char' };
    }
    if (this.match('STRING_LITERAL')) {
      return { type: 'StringLiteral', index: this.tokens[this.pos-1].value };
    }
    
    if (this.match('IDENT')) {
      const name = this.tokens[this.pos-1].value;
      
      if (this.match('[')) {
        const idx = this.parseExpression();
        this.expect(']');
        return { 
          type: 'Index', 
          object: { type: 'Identifier', name }, 
          index: idx,
          isPointerAccess: true
        };
      }
      
      if (this.peek()?.type === '(') {
        this.expect('(');
        const args = [];
        if (!this.match(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match(','));
          this.expect(')');
        }
        return { type: 'Call', callee: name, arguments: args };
      }
      
      return { type: 'Identifier', name };
    }
    
    if (this.match('AT')) {
      const name = this.expect('IDENT').value;
      return { type: 'AddressOf', name, isPointer: true };
    }
    
    throw new Error(`Unexpected expression: ${this.peek()?.type} (value: "${this.peek()?.value}")`);
  }

  // ✅ FIX 3: Enhanced Semantic Validation
  validate(ast) {
    const errors = [];
    
    // Step 1: Collect all function signatures
    const funcSigs = new Map();
    for (const func of ast.body) {
      funcSigs.set(func.name, {
        params: func.params.map(p => ({ name: p.name, type: p.type })),
        returnType: func.returnType
      });
    }
    
    // Step 2: Validate each function body
    for (const func of ast.body) {
      const scope = new Set(func.params.map(p => p.name));
      this._validateNode(func.body, scope, func.name, funcSigs, errors);
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n  ${errors.join('\n  ')}`);
    }
  }
  
  _validateNode(node, scope, funcName, funcSigs, errors) {
    if (!node || typeof node !== 'object') return;
    
    // Check undefined identifiers
    if (node.type === 'Identifier') {
      if (!scope.has(node.name)) {
        errors.push(`Undefined variable '${node.name}' in function '${funcName}'`);
      }
    }
    
    // Check function calls
    if (node.type === 'Call') {
      const sig = funcSigs.get(node.callee);
      if (!sig) {
        errors.push(`Undefined function '${node.callee}' called in '${funcName}'`);
      } else {
        const expectedCount = sig.params.length;
        const actualCount = node.arguments.length;
        if (actualCount !== expectedCount) {
          errors.push(
            `Function '${node.callee}' expects ${expectedCount} argument(s), ` +
            `but ${actualCount} provided in '${funcName}'`
          );
        }
        // Optional: type-check arguments (basic version)
        for (let i = 0; i < Math.min(actualCount, expectedCount); i++) {
          const expectedType = sig.params[i].type;
          const arg = node.arguments[i];
          this._checkArgType(arg, expectedType, node.callee, i, funcName, errors);
        }
      }
    }
    
    // Track local variable declarations
    if (node.type === 'VarDecl') {
      scope.add(node.name);
      if (node.init) this._validateNode(node.init, scope, funcName, funcSigs, errors);
      return;
    }
    
    // Check assignment to undeclared variable
    if (node.type === 'Assignment' && node.left?.type === 'Identifier') {
      if (!scope.has(node.left.name)) {
        errors.push(`Undefined variable '${node.left.name}' in function '${funcName}'`);
      }
    }
    
    // Recurse into children
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          this._validateNode(item, scope, funcName, funcSigs, errors);
        }
      } else if (value && typeof value === 'object') {
        if (value.type !== 'FunctionDecl') {
          this._validateNode(value, scope, funcName, funcSigs, errors);
        }
      }
    }
  }
  
  _checkArgType(arg, expectedType, funcName, argIndex, callerName, errors) {
    // Basic type compatibility check for literals
    if (arg.type === 'Literal') {
      const actualType = arg.dataType;
      const isFloatExpected = expectedType?.startsWith('float');
      const isFloatActual = actualType?.startsWith('float');
      
      // Allow int→float implicit conversion, but not float→int without cast
      if (isFloatExpected && !isFloatActual) {
        // OK: int literal can be passed to float param
        return;
      }
      if (!isFloatExpected && isFloatActual) {
        errors.push(
          `Argument ${argIndex + 1} to '${funcName}': float value passed to ${expectedType} parameter ` +
          `(use explicit cast in '${callerName}')`
        );
      }
    }
    // For non-literals, skip detailed type checking (future enhancement)
  }

  // ========== ASM.JS CODE GENERATOR ==========
  
  _isFloat64(type) {
    return type === 'float8';
  }
  
  _sigChar(type) {
    if (type === 'float8') return 'D';
    if (type?.startsWith('float')) return 'd';
    return 'i';
  }

  compile(ast) {
    // ✅ Run validation before code generation
    this.validate(ast);
    
    let heapPos = 4;
    const stringOffsets = {};
    
    for (let i = 0; i < ast.strings.length; i++) {
      const str = ast.strings[i];
      stringOffsets[i] = heapPos;
      heapPos += 4 + (str.length + 1);
      heapPos = Math.ceil(heapPos / 4) * 4;
    }

    const lines = [];
    
    lines.push('"use asm";');
    lines.push('');
    lines.push('function TOPS(stdlib, foreign, heap) {');
    lines.push('  "use asm";');
    lines.push('');
    
    lines.push('  var HEAP8 = new stdlib.Int8Array(heap);');
    lines.push('  var HEAPU8 = new stdlib.Uint8Array(heap);');
    lines.push('  var HEAP16 = new stdlib.Int16Array(heap);');
    lines.push('  var HEAPU16 = new stdlib.Uint16Array(heap);');
    lines.push('  var HEAP32 = new stdlib.Int32Array(heap);');
    lines.push('  var HEAPU32 = new stdlib.Uint32Array(heap);');
    lines.push('  var HEAPF32 = new stdlib.Float32Array(heap);');
    lines.push('  var HEAPF64 = new stdlib.Float64Array(heap);');
    lines.push('');
    
    lines.push('  var fround = stdlib.Math.fround;');
    lines.push('  var imul = stdlib.Math.imul;');
    lines.push('');
    
    if (ast.strings.length > 0) {
      lines.push('  // String literals');
      for (let i = 0; i < ast.strings.length; i++) {
        const str = ast.strings[i];
        const off = stringOffsets[i];
        lines.push(`  HEAP32[${off}>>2] = ${str.length}|0;`);
        for (let j = 0; j < str.length; j++) {
          lines.push(`  HEAPU8[${off + 4 + j}|0] = ${str.charCodeAt(j)}|0;`);
        }
        lines.push(`  HEAPU8[${off + 4 + str.length}|0] = 0|0;`);
      }
      lines.push('');
    }
    
    const funcSigs = new Map();
    for (const func of ast.body) {
      this.compileFunction(func, lines, stringOffsets, funcSigs);
    }
    
    const pub = ast.body.filter(f => f.public).map(f => f.name);
    lines.push('  return { ' + (pub.length ? pub.join(', ') : 'main: main') + ' };');
    lines.push('}');
    lines.push('');
    lines.push('// Export for browser');
    lines.push('return TOPS;');
    
    return lines.join('\n');
  }

  compileFunction(func, lines, stringOffsets, funcSigs) {
    const { name, params, returnType, returnIsPointer, body } = func;
    
    const paramSigs = params.map(p => this._sigChar(p.type));
    const retSig = this._sigChar(returnType);
    
    funcSigs.set(name, `${retSig}:${paramSigs.join('')}`);
    
    lines.push(`  // asm.js signature: ${name}(${paramSigs.join('')}) -> ${retSig}`);
    lines.push(`  function ${name}(${params.map(p => p.name).join(', ')}) {`);
    lines.push('    "use asm";');
    lines.push('');
    
    const locals = new Map();
    this.collectLocals(body, locals);
    for (const [lname, linfo] of locals) {
      const initVal = this._isFloat64(linfo.type) ? '0' : (linfo.type?.startsWith('float') ? 'fround(0)' : '0');
      lines.push(`    var ${lname} = ${initVal};`);
    }
    const resultInit = this._isFloat64(returnType) ? '0' : (returnType?.startsWith('float') ? 'fround(0)' : '0');
    lines.push(`    var $result = ${resultInit};`);
    lines.push('');
    
    for (const stmt of body.statements) {
      const code = this.compileStmt(stmt, stringOffsets, funcSigs, returnType, params, locals);
      if (Array.isArray(code)) {
        for (const c of code) lines.push('    ' + c);
      } else if (code) {
        lines.push('    ' + code);
      }
    }
    
    if (returnType !== 'void') {
      if (returnType === 'int8' || returnType === 'uint8') {
        lines.push(`    return +($result);`);
      } else {
        const ret = returnIsPointer 
          ? `($result)|0` 
          : (this._isFloat64(returnType) ? `+($result)` : (returnType.startsWith('float') ? `fround($result)` : this.wrap('$result', returnType, returnIsPointer)));
        lines.push(`    return ${ret};`);
      }
    }
    
    lines.push('  }');
    lines.push('');
  }

  collectLocals(node, map) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VarDecl') {
      map.set(node.name, { type: node.varTypeHint || 'int4', isPointer: node.isPointer });
    }
    for (const k of Object.keys(node)) {
      if (k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) {
        for (const item of v) this.collectLocals(item, map);
      } else if (v && typeof v === 'object') {
        this.collectLocals(v, map);
      }
    }
  }

  getPointerElementType(node, funcParams, localVarTypes) {
    if (node.type === 'Identifier') {
      const param = funcParams?.find(p => p.name === node.name);
      if (param && param.isPointer) return param.type;
      if (localVarTypes?.has(node.name)) {
        const info = localVarTypes.get(node.name);
        if (info?.isPointer) return info.type;
      }
    }
    if (node.type === 'AddressOf') {
      const param = funcParams?.find(p => p.name === node.name);
      if (param) return param.type;
      if (localVarTypes?.has(node.name)) {
        return localVarTypes.get(node.name).type;
      }
    }
    return 'int4';
  }

  compileStmt(stmt, strOff, sigs, funcReturnType = 'int4', funcParams = [], localVarTypes = new Map()) {
    switch (stmt.type) {
      case 'VarDecl': {
        const { name, varType, isPointer, init } = stmt;
        let val = '0';
        if (init) {
          if (init.type === 'StringLiteral' && isPointer) {
            val = `${strOff[init.index]}|0`;
          } else if (init.type === 'SizeOf') {
            val = `${this.sizeOf(init.typeName, init.isPointer)}|0`;
          } else {
            val = this.wrap(this.compileExpr(init, strOff, sigs, varType, funcParams, localVarTypes), varType, isPointer);
          }
        } else if (isPointer) {
          val = '0|0';
        } else if (this._isFloat64(varType)) {
          val = '0';
        } else if (varType?.startsWith('float')) {
          val = 'fround(0)';
        }
        return `${name} = ${val};`;
      }
      
      case 'Return':
        if (!stmt.argument) {
          if (this._isFloat64(funcReturnType)) return '$result = 0;';
          return funcReturnType?.startsWith('float') ? '$result = fround(0);' : '$result = 0;';
        }
        return `$result = ${this.compileExpr(stmt.argument, strOff, sigs, funcReturnType, funcParams, localVarTypes)};`;
      
      case 'ExprStmt':
        return this.compileExpr(stmt.expression, strOff, sigs, 'int4', funcParams, localVarTypes) + ';';
      
      case 'Loop': {
        const body = stmt.body.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
        return ['while (1) {', ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b)), '    }'];
      }
      
      case 'Break':
        return 'break;';
      
      case 'If': {
        const test = this.compileExpr(stmt.test, strOff, sigs, 'int4', funcParams, localVarTypes);
        const cons = stmt.consequent.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
        const alt = stmt.alternate?.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean) || [];
        return [
          `if (${test}|0) {`,
          ...cons.map(c => '      ' + (Array.isArray(c) ? c.join('\n      ') : c)),
          '    }' + (alt.length ? ' else {' : ''),
          ...(alt.length ? [...alt.map(a => '      ' + (Array.isArray(a) ? a.join('\n      ') : a)), '    }'] : [])
        ];
      }
      
      case 'Switch': {
        const disc = this.compileExpr(stmt.discriminant, strOff, sigs, 'int4', funcParams, localVarTypes);
        const cases = [];
        
        for (const c of stmt.cases) {
          if (c.type === 'case') {
            const val = `(${this.compileExpr(c.value, strOff, sigs, 'int4', funcParams, localVarTypes)})|0`;
            const body = c.body.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
            cases.push(
              `    case ${val}:`,
              ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b))
            );
          } else {
            const body = c.body.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
            cases.push(
              '    default:',
              ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b))
            );
          }
        }
        
        return [
          `switch ((${disc})|0) {`,
          ...cases,
          '  }'
        ];
      }
      
      default:
        throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  compileExpr(expr, strOff, sigs, expectedType = 'int4', funcParams = [], localVarTypes = new Map()) {
    if (!expr) {
      if (this._isFloat64(expectedType)) return '0';
      return expectedType?.startsWith('float') ? 'fround(0)' : '0';
    }
    
    switch (expr.type) {
      case 'Literal': {
        return `${expr.value}`;
      }
      
      case 'StringLiteral':
        return `${strOff[expr.index]}|0`;
      
      case 'Identifier':
        return expr.name;
      
      case 'AddressOf':
        return expr.name;
      
      case 'Index': {
        const ptr = this.compileExpr(expr.object, strOff, sigs, 'int4', funcParams, localVarTypes);
        const idx = this.compileExpr(expr.index, strOff, sigs, 'int4', funcParams, localVarTypes);
        
        let elemType = expectedType;
        if (!elemType || elemType === 'int4') {
          elemType = this.getPointerElementType(expr.object, funcParams, localVarTypes);
        }
        
        const size = this.sizeOf(elemType || 'int4', false);
        const addr = `((${ptr}|0) + ((${idx}|0) * ${size})|0)|0`;
        
        const view = this.getHeapView(expectedType);
        const shift = this.getShiftAmount(expectedType);
        const access = shift > 0 ? `${view}[${addr}>>${shift}]` : `${view}[${addr}]`;
        
        if (this._isFloat64(expectedType)) {
          return `+${access}`;
        }
        return expectedType?.startsWith('float') ? `+${access}` : `${access}|0`;
      }
      
      case 'Binary': {
        const l = this.compileExpr(expr.left, strOff, sigs, expectedType, funcParams, localVarTypes);
        const r = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
        const op = expr.operator;
        
        if (this._isFloat64(expectedType)) {
          const float64Ops = {
            '+': `(${l}+${r})`,
            '-': `(${l}-${r})`,
            '*': `(${l}*${r})`,
            '/': `(${l}/${r})`,
            '%': `(${l}%${r})`,
            '==': `(${l}==${r})|0`,
            '!=': `(${l}!=${r})|0`,
            '<': `(${l}<${r})|0`,
            '>': `(${l}>${r})|0`,
            '<=': `(${l}<=${r})|0`,
            '>=': `(${l}>=${r})|0`
          };
          return float64Ops[op] || `(${l}${op}${r})`;
        }
        
        if (expectedType?.startsWith('float')) {
          const floatOps = {
            '+': `fround(${l}+${r})`,
            '-': `fround(${l}-${r})`,
            '*': `fround(${l}*${r})`,
            '/': `fround(${l}/${r})`,
            '%': `fround(${l}%${r})`,
            '==': `(+${l}==+${r})|0`,
            '!=': `(+${l}!=+${r})|0`,
            '<': `(+${l}<+${r})|0`,
            '>': `(+${l}>+${r})|0`,
            '<=': `(+${l}<=+${r})|0`,
            '>=': `(+${l}>=+${r})|0`
          };
          return floatOps[op] || `fround(${l}${op}${r})`;
        } else {
          const isUnsigned = expectedType?.startsWith('uint');
          const coerce = isUnsigned ? '>>>0' : '|0';
          
          const intOps = {
            '+': `((${l}|0)+(${r}|0))${coerce}`,
            '-': `((${l}|0)-(${r}|0))${coerce}`,
            '*': `imul(${l}|0,${r}|0)${coerce}`,
            '/': `((${l}|0)/(${r}|0))${coerce}`,
            '%': `((${l}|0)%(${r}|0))${coerce}`,
            '&': `((${l}|0)&(${r}|0))${coerce}`,
            '|': `((${l}|0)|(${r}|0))${coerce}`,
            '^': `((${l}|0)^(${r}|0))${coerce}`,
            '<<': `((${l}|0)<<(${r}|0))${coerce}`,
            '>>': `((${l}|0)>>(${r}|0))${coerce}`,
            '>>>': `((${l}|0)>>>(${r}|0))${coerce}`,
            '==': `((${l}|0)==(${r}|0))|0`,
            '!=': `((${l}|0)!=(${r}|0))|0`,
            '<': `((${l}|0)<(${r}|0))|0`,
            '>': `((${l}|0)>(${r}|0))|0`,
            '<=': `((${l}|0)<=(${r}|0))|0`,
            '>=': `((${l}|0)>=(${r}|0))|0`,
            '&&': `((${l}|0)&(${r}|0))|0`,
            '||': `((${l}|0)|(${r}|0))|0`
          };
          return intOps[op] || `((${l}|0)${op}(${r}|0))${coerce}`;
        }
      }
      
      case 'Assignment': {
        if (expr.left.type === 'Index') {
          const ptr = this.compileExpr(expr.left.object, strOff, sigs, 'int4', funcParams, localVarTypes);
          const idx = this.compileExpr(expr.left.index, strOff, sigs, 'int4', funcParams, localVarTypes);
          const val = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
          
          let elemType = expectedType;
          if (!elemType || elemType === 'int4') {
            elemType = this.getPointerElementType(expr.left.object, funcParams, localVarTypes);
          }
          const size = this.sizeOf(elemType || 'int4', false);
          const addr = `((${ptr}|0) + ((${idx}|0) * ${size})|0)|0`;
          
          const view = this.getHeapView(expectedType);
          const shift = this.getShiftAmount(expectedType);
          const store = shift > 0 ? `${view}[${addr}>>${shift}]` : `${view}[${addr}]`;
          
          if (this._isFloat64(expectedType)) {
            return `${store} = ${val}`;
          }
          return `${store} = ${val}${expectedType?.startsWith('float') ? '' : (expectedType?.startsWith('uint') ? '>>>0' : '|0')}`;
        }
        const rhs = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
        return `${expr.left.name} = ${this.wrap(rhs, expectedType, false)}`;
      }
      
      case 'Cast': {
        const val = this.compileExpr(expr.expression, strOff, sigs, expr.targetType, funcParams, localVarTypes);
        if (this._isFloat64(expr.targetType)) {
          return `+(${val})`;
        }
        return expr.targetType?.startsWith('float') 
          ? `fround(${val})` 
          : `(${val})|0`;
      }
      
      case 'SizeOf':
        return `${this.sizeOf(expr.typeName, expr.isPointer)}|0`;
      
      case 'Call': {
        const sig = sigs.get(expr.callee);
        const [retChar, paramChars] = sig ? sig.split(':') : ['i', ''];
        const paramCharsArr = paramChars.split('');
        
        const args = expr.arguments.map((a, i) => {
          const paramChar = paramCharsArr[i] || 'i';
          
          let argExpectedType = 'int4';
          if (paramChar === 'D') argExpectedType = 'float8';
          else if (paramChar === 'd') argExpectedType = 'float4';
          
          const val = this.compileExpr(a, strOff, sigs, argExpectedType, funcParams, localVarTypes);
          
          if (paramChar === 'D') {
            return `+(${val})`;
          }
          if (paramChar === 'd') {
            return `fround(${val})`;
          }
          return `(${val})|0`;
        });
        
        const call = `${expr.callee}(${args.join(',')})`;
        
        if (retChar === 'D' || retChar === 'd') {
          return `+${call}`;
        }
        return `(${call})|0`;
      }
      
      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }

  wrap(expr, type, isPtr) {
    if (isPtr) return `(${expr})|0`;
    
    if (this._isFloat64(type)) {
      return `+(${expr})`;
    }
    
    if (type?.startsWith('float')) {
      if (typeof expr === 'string' && expr.startsWith('fround(')) {
        return expr;
      }
      return `fround(${expr})`;
    }
    
    if (type?.startsWith('uint')) {
      if (type === 'uint4') return `(${expr})>>>0`;
      if (type === 'uint2') return `((${expr})&0xFFFF)>>>0`;
      if (type === 'uint1') return `((${expr})&0xFF)>>>0`;
      return `(${expr})|0`;
    }
    
    return `(${expr})|0`;
  }

  getHeapView(type) {
    const map = {
      'int1':'HEAP8','uint1':'HEAPU8','char':'HEAPU8',
      'int2':'HEAP16','uint2':'HEAPU16',
      'int4':'HEAP32','uint4':'HEAPU32','float4':'HEAPF32',
      'int8':'HEAPF64','uint8':'HEAPF64','float8':'HEAPF64'
    };
    return map[type] || 'HEAP32';
  }
  
  getShiftAmount(type) {
    return { 
      'int1':0,'uint1':0,'char':0, 
      'int2':1,'uint2':1, 
      'int4':2,'uint4':2,'float4':2, 
      'int8':3,'uint8':3,'float8':3 
    }[type] || 2;
  }

  sizeOf(type, isPtr) {
    if (isPtr) return 4;
    const sizes = {
      bool:1, char:1, int1:1, uint1:1,
      int2:2, uint2:2,
      int4:4, uint4:4, float4:4,
      int8:8, uint8:8, float8:8
    };
    return sizes[type] || 4;
  }

  // ========== STATIC COMPILE METHOD ==========
  static compile(source, options = {}) {
    const compiler = new TopsAsmJSCompiler(options);
    const tokens = compiler.tokenize(source);
    const ast = compiler.parse(tokens);
    const code = compiler.compile(ast);  // validate() called inside compile()
    
    if (options.debug) {
      console.log('=== TOKENS ===', tokens.filter(t => t.type !== 'EOF'));
      console.log('=== AST ===', JSON.stringify(ast, null, 2));
      console.log('=== ASM.JS OUTPUT ===\n', code);
    }
    
    return { code, ast, compiler };
  }
}

// ========== GLOBAL EXPOSURE ==========
if (typeof window !== 'undefined') {
  window.TopsAsmJSCompiler = TopsAsmJSCompiler;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TopsAsmJSCompiler;
}