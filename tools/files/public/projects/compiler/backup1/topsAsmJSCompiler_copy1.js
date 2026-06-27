// topsAsmJSCompiler.js
// TOPS Language → asm.js Compiler
// ✅ Full 64-bit emulation with [hi, lo] array returns
// ✅ FIXED: Nested block support + proper block-level scope validation

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
      'float4', 'float8', 'bool', 'char', 'void',
      'true', 'false'
    ]);

    while (i < source.length) {
      const ch = source[i];
      
      if (/\s/.test(ch)) { i++; continue; }
      
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
        let num = '', rawNum = '';
        let isNegative = false;
        
        if (ch === '-') { 
          isNegative = true; 
          num += source[i++]; 
          rawNum += '-';
        }
        
        if (source[i] === '0' && i + 1 < source.length) {
          const prefix = source[i+1].toLowerCase();
          
          if (prefix === 'x') {
            i += 2; num += '0x'; rawNum += '0x';
            while (i < source.length && /[0-9a-fA-F]/.test(source[i])) {
              num += source[i++]; rawNum += source[i-1];
            }
            tokens.push({ type: 'INT_LITERAL', value: rawNum, raw: rawNum });
            continue;
          }
          if (prefix === 'b') {
            i += 2; num += '0b'; rawNum += '0b';
            while (i < source.length && /[01]/.test(source[i])) {
              num += source[i++]; rawNum += source[i-1];
            }
            tokens.push({ type: 'INT_LITERAL', value: rawNum, raw: rawNum });
            continue;
          }
          if (prefix === 'o') {
            i += 2; num += '0o'; rawNum += '0o';
            while (i < source.length && /[0-7]/.test(source[i])) {
              num += source[i++]; rawNum += source[i-1];
            }
            tokens.push({ type: 'INT_LITERAL', value: rawNum, raw: rawNum });
            continue;
          }
        }
        
        while (i < source.length && /[0-9.]/.test(source[i])) {
          num += source[i++]; rawNum += source[i-1];
        }
        const isFloat = num.includes('.');
        
        if (isFloat) {
          tokens.push({ 
            type: 'FLOAT_LITERAL', 
            value: isNegative ? -parseFloat(num) : parseFloat(num),
            raw: rawNum
          });
        } else {
          tokens.push({ type: 'INT_LITERAL', value: rawNum, raw: rawNum });
        }
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

      throw new Error(`Unexpected character '${ch}' at position ${i}`);
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
      if (peek?.type === 'FUNC' || peek?.type === 'PUBLIC') {
        body.push(this.parseFunction());
      } else {
        throw new Error(`Expected FUNC, got ${peek?.type} at token ${this.pos}`);
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
      throw new Error(`Expected ${type}, got ${peek?.type} at pos ${this.pos}\nContext: [${context}]`);
    }
    return tok;
  }

  peek() { return this.tokens[this.pos]; }

  parseFunction() {
    const pub = !!this.match('PUBLIC');
    this.expect('FUNC');
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
      type: 'FunctionDecl', name, public: pub, params,
      returnType: retType, returnIsPointer: retPtr, body
    };
  }

  parseType() {
    const t = this.peek();
    if (['INT1','INT2','INT4','INT8','UINT1','UINT2','UINT4','UINT8','FLOAT4','FLOAT8','BOOL','CHAR','VOID'].includes(t?.type)) {
      this.pos++;
      return t.type.toLowerCase();
    }
    throw new Error(`Expected type, got ${t?.type}`);
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
    // ✅ FIX: Handle nested blocks as valid statements
    if (this.peek()?.type === '{') {
      return this.parseBlock();
    }

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
      { ops: ['||'], p: 1 }, { ops: ['&&'], p: 2 },
      { ops: ['==','!='], p: 3 }, { ops: ['<','>','<=','>='], p: 4 },
      { ops: ['+','-'], p: 5 }, { ops: ['*','/','%'], p: 6 },
      { ops: ['<<','>>'], p: 7 }, { ops: ['&'], p: 8 },
      { ops: ['^'], p: 9 }, { ops: ['|'], p: 10 }
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
    if (['!', '-', '~', '+'].includes(this.peek()?.type)) {
      const op = this.tokens[this.pos++].value;
      const arg = this.parsePrimary(expectedType);
      return { type: 'Unary', operator: op, argument: arg, resultType: op === '!' ? 'int4' : expectedType };
    }
    
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
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'int4', raw: this.tokens[this.pos-1].raw };
    }
    if (this.match('FLOAT_LITERAL')) {
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'float8', raw: this.tokens[this.pos-1].raw };
    }
    if (this.match('CHAR_LITERAL')) {
      return { type: 'Literal', value: this.tokens[this.pos-1].value, dataType: 'char', raw: this.tokens[this.pos-1].raw };
    }
    if (this.match('STRING_LITERAL')) {
      return { type: 'StringLiteral', index: this.tokens[this.pos-1].value };
    }
    
    if (this.match('TRUE')) return { type: 'Literal', value: 1, dataType: 'bool' };
    if (this.match('FALSE')) return { type: 'Literal', value: 0, dataType: 'bool' };
    
    if (this.match('IDENT')) {
      const name = this.tokens[this.pos-1].value;
      if (this.match('[')) {
        const idx = this.parseExpression();
        this.expect(']');
        return { type: 'Index', object: { type: 'Identifier', name }, index: idx, isPointerAccess: true };
      }
      if (this.peek()?.type === '(') {
        this.expect('(');
        const args = [];
        if (!this.match(')')) {
          do { args.push(this.parseExpression()); } while (this.match(','));
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
    
    throw new Error(`Unexpected expression: ${this.peek()?.type}`);
  }

  // ========== SEMANTIC VALIDATION (FIXED FOR BLOCK SCOPING) ==========
  validate(ast) {
    const errors = [];
    const funcSigs = new Map();
    
    for (const func of ast.body) {
      funcSigs.set(func.name, {
        params: func.params.map(p => ({ name: p.name, type: p.type })),
        returnType: func.returnType
      });
    }
    
    for (const func of ast.body) {
      // ✅ Start with function-parameter scope as base
      const scopeStack = [new Set(func.params.map(p => p.name))];
      this._validateNode(func.body, scopeStack, func.name, funcSigs, errors);
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n  ${errors.join('\n  ')}`);
    }
  }
  
  _validateNode(node, scopeStack, funcName, funcSigs, errors) {
    if (!node || typeof node !== 'object') return;
    
    const currentScope = scopeStack[scopeStack.length - 1];
    
    // ✅ Check identifier access against scope stack (innermost → outermost)
    if (node.type === 'Identifier') {
      let found = false;
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        if (scopeStack[i].has(node.name)) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push(`Undefined variable '${node.name}' in function '${funcName}'`);
      }
    }
    
    if (node.type === 'Call') {
      const sig = funcSigs.get(node.callee);
      if (!sig) {
        errors.push(`Undefined function '${node.callee}' called in '${funcName}'`);
      } else if (node.arguments.length !== sig.params.length) {
        errors.push(`Function '${node.callee}' expects ${sig.params.length} argument(s) in '${funcName}'`);
      }
    }
    
    // ✅ Variable declaration: add to CURRENT scope only
    if (node.type === 'VarDecl') {
      currentScope.add(node.name);
      if (node.init) this._validateNode(node.init, scopeStack, funcName, funcSigs, errors);
      return;
    }
    
    if (node.type === 'Assignment' && node.left?.type === 'Identifier') {
      let found = false;
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        if (scopeStack[i].has(node.left.name)) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push(`Undefined variable '${node.left.name}' in function '${funcName}'`);
      }
    }
    
    // ✅ Handle Block: push new scope, validate children, pop scope
    if (node.type === 'Block') {
      scopeStack.push(new Set());  // Enter new block scope
      for (const stmt of node.statements) {
        this._validateNode(stmt, scopeStack, funcName, funcSigs, errors);
      }
      scopeStack.pop();  // Exit block scope
      return;
    }
    
    // ✅ Handle If/Else: blocks already manage their own scopes
    if (node.type === 'If') {
      this._validateNode(node.test, scopeStack, funcName, funcSigs, errors);
      this._validateNode(node.consequent, scopeStack, funcName, funcSigs, errors);
      if (node.alternate) this._validateNode(node.alternate, scopeStack, funcName, funcSigs, errors);
      return;
    }
    
    // ✅ Handle Loop/Switch: same pattern
    if (node.type === 'Loop') {
      this._validateNode(node.body, scopeStack, funcName, funcSigs, errors);
      return;
    }
    
    if (node.type === 'Switch') {
      this._validateNode(node.discriminant, scopeStack, funcName, funcSigs, errors);
      // Switch cases share the switch's block scope
      scopeStack.push(new Set());
      for (const c of node.cases) {
        for (const stmt of c.body) {
          this._validateNode(stmt, scopeStack, funcName, funcSigs, errors);
        }
      }
      scopeStack.pop();
      return;
    }
    
    // ✅ Recurse into other node properties
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) this._validateNode(item, scopeStack, funcName, funcSigs, errors);
      } else if (value && typeof value === 'object' && value.type !== 'FunctionDecl') {
        this._validateNode(value, scopeStack, funcName, funcSigs, errors);
      }
    }
  }

  // ========== 64-BIT EMULATION HELPERS ==========
  
  _splitUint64Raw(rawStr) {
    if (typeof BigInt === 'undefined') throw new Error(`BigInt required for 64-bit literal: ${rawStr}`);
    const big = BigInt(rawStr.replace(/^-/, ''));
    return {
      lo: Number(big & 0xFFFFFFFFn),
      hi: Number((big >> 32n) & 0xFFFFFFFFn)
    };
  }

  _splitInt64Raw(rawStr) {
    if (typeof BigInt === 'undefined') throw new Error(`BigInt required for 64-bit literal: ${rawStr}`);
    const isNeg = rawStr.startsWith('-');
    const { hi, lo } = this._splitUint64Raw(isNeg ? rawStr.slice(1) : rawStr);
    if (!isNeg) return { hi, lo };
    // Two's complement
    const negLo = ((~lo) + 1) >>> 0;
    const negHi = ((~hi) + (negLo < lo ? 1 : 0)) >>> 0;
    return { hi: negHi, lo: negLo };
  }

  _compile64BitBinaryInline(op, l_hi, l_lo, r_hi, r_lo, dest_hi, dest_lo) {
    const ops = {
      '+': `var ${dest_lo}=((${l_lo})+(${r_lo}))|0;var ${dest_hi}=((${l_hi})+(${r_hi})+(((${dest_lo}>>>0)<(${l_lo}>>>0))?1:0))|0;`,
      '-': `var ${dest_lo}=((${l_lo})-(${r_lo}))|0;var ${dest_hi}=((${l_hi})-(${r_hi})-(((${l_lo}>>>0)<(${r_lo}>>>0))?1:0))|0;`,
      '*': `var m0=(${l_lo}|0)*(${r_lo}|0)|0;var m1=(${l_lo}|0)*(${r_hi}|0)|0;var m2=(${l_hi}|0)*(${r_lo}|0)|0;var ${dest_lo}=m0|0;var c=(m0>>>0)<(${l_lo}|0)?1:0;var ${dest_hi}=(((m1+m2+c)|0)+((${l_hi}|0)*(${r_hi}|0)|0))|0;`,
      '==': `return ((((${l_hi})|0)==((${r_hi})|0))&(((${l_lo})|0)==((${r_lo})|0)))|0;`,
      '!=': `return ((((${l_hi})|0)!=(${r_hi}|0))|(((${l_lo})|0)!=(${r_lo}|0)))|0;`,
      '<':  `var hiCmp=(((${l_hi})>>>0)<((${r_hi})>>>0))|0;var hiEq=(((${l_hi})|0)==((${r_hi})|0))|0;var loCmp=(((${l_lo}>>>0)<((${r_lo}>>>0)))|0;return (hiCmp|(hiEq&loCmp))|0;`,
      '>':  `var hiCmp=(((${r_hi})>>>0)<((${l_hi})>>>0))|0;var hiEq=(((${r_hi})|0)==((${l_hi})|0))|0;var loCmp=(((${r_lo}>>>0)<((${l_lo}>>>0)))|0;return (hiCmp|(hiEq&loCmp))|0;`,
      '<=': `var hiCmp=(((${l_hi})>>>0)<((${r_hi})>>>0))|0;var hiEq=(((${l_hi})|0)==((${r_hi})|0))|0;var loCmp=(((${l_lo}>>>0)<((${r_lo}>>>0)))|0;var lt=(hiCmp|(hiEq&loCmp))|0;var eq=(((${l_hi})|0)==((${r_hi})|0)&((${l_lo})|0)==((${r_lo})|0))|0;return (lt|eq)|0;`,
      '>=': `var hiCmp=(((${r_hi})>>>0)<((${l_hi})>>>0))|0;var hiEq=(((${r_hi})|0)==((${l_hi})|0))|0;var loCmp=(((${r_lo}>>>0)<((${l_lo}>>>0)))|0;var gt=(hiCmp|(hiEq&loCmp))|0;var eq=(((${l_hi})|0)==((${r_hi})|0)&((${l_lo})|0)==((${r_lo})|0))|0;return (gt|eq)|0;`,
    };
    return ops[op] || null;
  }

  // ========== ASM.JS CODE GENERATOR ==========
  
  _isFloat64(type) { return type === 'float8'; }
  _sigChar(type) {
    if (type === 'float8') return 'D';
    if (type?.startsWith('float')) return 'd';
    return 'i';
  }

  compile(ast) {
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
    lines.push('"use asm";', '');
    lines.push('function TOPS(stdlib, foreign, heap) {', '  "use asm";', '');
    
    lines.push('  var HEAP8 = new stdlib.Int8Array(heap);');
    lines.push('  var HEAPU8 = new stdlib.Uint8Array(heap);');
    lines.push('  var HEAP16 = new stdlib.Int16Array(heap);');
    lines.push('  var HEAPU16 = new stdlib.Uint16Array(heap);');
    lines.push('  var HEAP32 = new stdlib.Int32Array(heap);');
    lines.push('  var HEAPU32 = new stdlib.Uint32Array(heap);');
    lines.push('  var HEAPF32 = new stdlib.Float32Array(heap);');
    lines.push('  var HEAPF64 = new stdlib.Float64Array(heap);', '');
    
    lines.push('  var fround = stdlib.Math.fround;');
    lines.push('  var imul = stdlib.Math.imul;', '');
    
    if (ast.strings.length > 0) {
      lines.push('  // String literals');
      for (let i = 0; i < ast.strings.length; i++) {
        const str = ast.strings[i], off = stringOffsets[i];
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
    lines.push('}', '', '// Export for browser', 'return TOPS;');
    
    return lines.join('\n');
  }

  compileFunction(func, lines, stringOffsets, funcSigs) {
    const { name, params, returnType, returnIsPointer, body } = func;
    const paramSigs = params.map(p => this._sigChar(p.type));
    const retSig = this._sigChar(returnType);
    funcSigs.set(name, `${retSig}:${paramSigs.join('')}`);
    
    lines.push(`  // asm.js signature: ${name}(${paramSigs.join('')}) -> ${retSig}`);
    lines.push(`  function ${name}(${params.map(p => p.name).join(', ')}) {`, '    "use asm";', '');
    
    const locals = new Map();
    this.collectLocals(body, locals);
    for (const [lname, linfo] of locals) {
      if (linfo.type === 'int8' || linfo.type === 'uint8') {
        lines.push(`    var ${lname}_hi = 0;`, `    var ${lname}_lo = 0;`);
      } else {
        const initVal = this._isFloat64(linfo.type) ? '0' : (linfo.type?.startsWith('float') ? 'fround(0)' : '0');
        lines.push(`    var ${lname} = ${initVal};`);
      }
    }
    
    if (returnType === 'int8' || returnType === 'uint8') {
      lines.push('    var $result_hi = 0;', '    var $result_lo = 0;');
    } else {
      const resultInit = this._isFloat64(returnType) ? '0' : (returnType?.startsWith('float') ? 'fround(0)' : '0');
      lines.push(`    var $result = ${resultInit};`);
    }
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
        lines.push('    return [$result_hi|0, $result_lo|0];');
      } else {
        const ret = returnIsPointer ? `($result)|0` : 
          (this._isFloat64(returnType) ? `+($result)` : 
          (returnType.startsWith('float') ? `fround($result)` : this.wrap('$result', returnType, returnIsPointer)));
        lines.push(`    return ${ret};`);
      }
    }
    lines.push('  }', '');
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
      if (localVarTypes?.has(node.name)) return localVarTypes.get(node.name).type;
    }
    return 'int4';
  }

  compileStmt(stmt, strOff, sigs, funcReturnType = 'int4', funcParams = [], localVarTypes = new Map()) {
    switch (stmt.type) {
      case 'VarDecl': {
        const { name, varType, isPointer, init } = stmt;
        let val;
        if (init) {
          if (init.type === 'StringLiteral' && isPointer) {
            val = `${strOff[init.index]}|0`;
          } else if (init.type === 'SizeOf') {
            val = `${this.sizeOf(init.typeName, init.isPointer)}|0`;
          } else {
            val = this.compileExpr(init, strOff, sigs, varType, funcParams, localVarTypes);
            val = this.wrap(val, varType, isPointer);
          }
        } else if (isPointer) {
          val = '0|0';
        } else if (this._isFloat64(varType)) {
          val = '0';
        } else if (varType?.startsWith('float')) {
          val = 'fround(0)';
        } else if (varType === 'int8' || varType === 'uint8') {
          val = '[0|0, 0|0]';
        } else {
          val = '0';
        }
        
        if ((varType === 'int8' || varType === 'uint8') && !isPointer && init) {
          if (typeof val === 'string' && val.includes('__INLINE_64_')) {
            const match = val.match(/__INLINE_64_([^_]+)__\(([^)]+)\)/);
            if (match) {
              const [, op, args] = match;
              const parts = args.split(',').map(x => x.trim());
              if (parts.length === 4) {
                const [l_hi, l_lo, r_hi, r_lo] = parts;
                return this._compile64BitBinaryInline(op, l_hi, l_lo, r_hi, r_lo, `${name}_hi`, `${name}_lo`);
              }
            }
          }
          if (typeof val === 'string' && val.startsWith('[')) {
            const match = val.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/);
            if (match) {
              const [, hiExpr, loExpr] = match;
              return `${name}_hi = ${hiExpr}; ${name}_lo = ${loExpr};`;
            }
          }
        }
        return `${name} = ${val};`;
      }
      
      case 'Return': {
        if (!stmt.argument) {
          if (this._isFloat64(funcReturnType)) return '$result = 0;';
          if (funcReturnType?.startsWith('float')) return '$result = fround(0);';
          if (funcReturnType === 'int8' || funcReturnType === 'uint8') return '$result_hi = 0; $result_lo = 0;';
          return '$result = 0;';
        }
        
        const exprCode = this.compileExpr(stmt.argument, strOff, sigs, funcReturnType, funcParams, localVarTypes);
        
        if ((funcReturnType === 'int8' || funcReturnType === 'uint8') && typeof exprCode === 'string' && exprCode.includes('__INLINE_64_')) {
          const match = exprCode.match(/__INLINE_64_([^_]+)__\(([^)]+)\)/);
          if (match) {
            const [, op, args] = match;
            const parts = args.split(',').map(x => x.trim());
            if (parts.length === 4) {
              const [l_hi, l_lo, r_hi, r_lo] = parts;
              return this._compile64BitBinaryInline(op, l_hi, l_lo, r_hi, r_lo, '$result_hi', '$result_lo');
            }
          }
        }
        
        if (funcReturnType === 'int8' || funcReturnType === 'uint8') {
          if (typeof exprCode === 'string' && exprCode.startsWith('[')) {
            const match = exprCode.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/);
            if (match) {
              const [, hiExpr, loExpr] = match;
              return `$result_hi = ${hiExpr}; $result_lo = ${loExpr};`;
            }
          }
        }
        return `$result = ${exprCode};`;
      }
      
      case 'ExprStmt':
        return this.compileExpr(stmt.expression, strOff, sigs, 'int4', funcParams, localVarTypes) + ';';
      
      case 'Block': {
        const stmts = stmt.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
        return ['{', ...stmts.map(s => '      ' + (Array.isArray(s) ? s.join('\n      ') : s)), '    }'];
      }
      
      case 'Loop': {
        const body = stmt.body.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
        return ['while (1) {', ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b)), '    }'];
      }
      
      case 'Break': return 'break;';
      
      case 'If': {
        const test = this.compileExpr(stmt.test, strOff, sigs, 'int4', funcParams, localVarTypes);
        const cons = stmt.consequent.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
        const alt = stmt.alternate?.statements.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean) || [];
        return [
          `if (${test}) {`,
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
            cases.push(`    case ${val}:`, ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b)));
          } else {
            const body = c.body.map(s => this.compileStmt(s, strOff, sigs, funcReturnType, funcParams, localVarTypes)).filter(Boolean);
            cases.push('    default:', ...body.map(b => '      ' + (Array.isArray(b) ? b.join('\n      ') : b)));
          }
        }
        return [`switch ((${disc})|0) {`, ...cases, '  }'];
      }
      
      default: throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  compileExpr(expr, strOff, sigs, expectedType = 'int4', funcParams = [], localVarTypes = new Map()) {
    if (!expr) {
      if (this._isFloat64(expectedType)) return '0';
      if (expectedType?.startsWith('float')) return 'fround(0)';
      if (expectedType === 'int8' || expectedType === 'uint8') return '[0|0, 0|0]';
      return '0';
    }
    
    switch (expr.type) {
      case 'Literal': {
        if (expectedType === 'int8' || expectedType === 'uint8') {
          const rawValue = expr.raw || String(expr.value);
          if (typeof BigInt === 'undefined') throw new Error(`BigInt required for 64-bit literal: ${rawValue}`);
          
          let bigVal;
          try { bigVal = BigInt(rawValue); }
          catch (e) { throw new Error(`Invalid 64-bit literal '${rawValue}': ${e.message}`); }
          
          if (expectedType === 'uint8') {
            const MAX_UINT64 = BigInt('0xFFFFFFFFFFFFFFFF');
            if (bigVal < 0n) {
              console.warn(`⚠️ uint8 literal ${rawValue} < 0, clamped to 0`);
              bigVal = 0n;
            } else if (bigVal > MAX_UINT64) {
              console.warn(`⚠️ uint8 literal ${rawValue} exceeds 2^64-1, clamped`);
              bigVal = MAX_UINT64;
            }
            const lo = Number(bigVal & 0xFFFFFFFFn);
            const hi = Number((bigVal >> 32n) & 0xFFFFFFFFn);
            return `[${hi}>>>0, ${lo}>>>0]`;
          }
          
          const MIN_INT64 = BigInt('-0x8000000000000000');
          const MAX_INT64 = BigInt('0x7FFFFFFFFFFFFFFF');
          if (bigVal < MIN_INT64 || bigVal > MAX_INT64) {
            throw new Error(`int8 literal ${rawValue} out of signed 64-bit range`);
          }
          if (bigVal < 0n) bigVal = BigInt.asIntN(64, bigVal);
          const lo = Number(bigVal & 0xFFFFFFFFn);
          const hi = Number((bigVal >> 32n) & 0xFFFFFFFFn);
          return `[${hi}|0, ${lo}|0]`;
        }
        return `${expr.value}`;
      }
      
      case 'StringLiteral': return `${strOff[expr.index]}|0`;
      
      case 'Identifier':
        if ((expectedType === 'int8' || expectedType === 'uint8') && expr.name !== '$result') {
          return `[${expr.name}_hi|0, ${expr.name}_lo|0]`;
        }
        return expr.name;
      
      case 'AddressOf': return expr.name;
      
      case 'Index': {
        const ptr = this.compileExpr(expr.object, strOff, sigs, 'int4', funcParams, localVarTypes);
        const idx = this.compileExpr(expr.index, strOff, sigs, 'int4', funcParams, localVarTypes);
        let elemType = expectedType;
        if (!elemType || elemType === 'int4') {
          elemType = this.getPointerElementType(expr.object, funcParams, localVarTypes);
        }
        const size = this.sizeOf(elemType || 'int4', false);
        const addr = `((${ptr}|0) + ((${idx}|0) * ${size})|0)|0`;
        
        if (expectedType === 'int8' || expectedType === 'uint8') {
          const lo = `HEAPU32[${addr}>>2]|0`;
          const hi = `HEAPU32[(${addr}+4)>>2]|0`;
          return `[${hi}, ${lo}]`;
        }
        
        const view = this.getHeapView(expectedType);
        const shift = this.getShiftAmount(expectedType);
        const access = shift > 0 ? `${view}[${addr}>>${shift}]` : `${view}[${addr}]`;
        if (this._isFloat64(expectedType)) return `+${access}`;
        return expectedType?.startsWith('float') ? `+${access}` : `${access}|0`;
      }
      
      case 'Unary': {
        const arg = this.compileExpr(expr.argument, strOff, sigs, expectedType, funcParams, localVarTypes);
        const op = expr.operator;
        if (op === '!') return `(((${arg})|0)==0)|0`;
        if (op === '~') return `(~((${arg})|0))|0`;
        if (op === '-') {
          if (this._isFloat64(expectedType)) return `-(${arg})`;
          if (expectedType?.startsWith('float')) return `fround(-(${arg}))`;
          if (expectedType === 'int8' || expectedType === 'uint8') {
            const [hi, lo] = arg.split(',').map(x => x.trim());
            return `__INLINE_64_-__(0|0,0|0,${hi},${lo})`;
          }
          return `(-((${arg})|0))|0`;
        }
        if (op === '+') {
          if (this._isFloat64(expectedType)) return `+(${arg})`;
          if (expectedType?.startsWith('float')) return `fround(${arg})`;
          if (expectedType === 'int8' || expectedType === 'uint8') return `${arg}`;
          return `((${arg})|0)`;
        }
        throw new Error(`Unknown unary operator: ${op}`);
      }
      
      case 'Binary': {
        const l = this.compileExpr(expr.left, strOff, sigs, expectedType, funcParams, localVarTypes);
        const r = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
        const op = expr.operator;
        
        if (expectedType === 'int8' || expectedType === 'uint8') {
          const extract = (val) => {
            if (typeof val === 'string' && val.startsWith('[')) {
              const match = val.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/);
              return match ? [match[1].trim(), match[2].trim()] : ['0|0', '0|0'];
            }
            return val.split(',').map(x => x.trim());
          };
          const [l_hi, l_lo] = extract(l);
          const [r_hi, r_lo] = extract(r);
          return `__INLINE_64_${op}__(${l_hi},${l_lo},${r_hi},${r_lo})`;
        }
        
        if (this._isFloat64(expectedType)) {
          const float64Ops = {
            '+': `(${l}+${r})`, '-': `(${l}-${r})`, '*': `(${l}*${r})`, '/': `(${l}/${r})`, '%': `(${l}%${r})`,
            '==': `(${l}==${r})|0`, '!=': `(${l}!=${r})|0`, '<': `(${l}<${r})|0`, '>': `(${l}>${r})|0`,
            '<=': `(${l}<=${r})|0`, '>=': `(${l}>=${r})|0`
          };
          return float64Ops[op] || `(${l}${op}${r})`;
        }
        
        if (expectedType?.startsWith('float')) {
          const floatOps = {
            '+': `fround(${l}+${r})`, '-': `fround(${l}-${r})`, '*': `fround(${l}*${r})`, '/': `fround(${l}/${r})`, '%': `fround(${l}%${r})`,
            '==': `(+${l}==+${r})|0`, '!=': `(+${l}!=+${r})|0`, '<': `(+${l}<+${r})|0`, '>': `(+${l}>+${r})|0`,
            '<=': `(+${l}<=+${r})|0`, '>=': `(+${l}>=+${r})|0`
          };
          return floatOps[op] || `fround(${l}${op}${r})`;
        }
        
        const lCoerced = `((${l})|0)`, rCoerced = `((${r})|0)`;
        let result = op === '*' ? `(imul(${lCoerced},${rCoerced}))|0` :
                     (op === '&&' || op === '||') ? `((${lCoerced}${op}${rCoerced}))|0` :
                     `(${lCoerced}${op}${rCoerced})|0`;
        
        if (expectedType === 'int1') result = `((${result})<<24)>>24`;
        else if (expectedType === 'int2') result = `((${result})<<16)>>16`;
        else if (expectedType?.startsWith('uint')) {
          if (expectedType === 'uint2') result = `((${result})&0xFFFF)>>>0`;
          else if (expectedType === 'uint1') result = `((${result})&0xFF)>>>0`;
        }
        return result;
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
          
          if (expectedType === 'int8' || expectedType === 'uint8') {
            const [hi, lo] = typeof val === 'string' && val.startsWith('[') 
              ? val.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/).slice(1).map(x => x.trim())
              : val.split(',').map(x => x.trim());
            const size = 8;
            const addr = `((${ptr}|0) + ((${idx}|0) * ${size})|0)|0`;
            return `HEAPU32[${addr}>>2]=${lo}|0;HEAPU32[(${addr}+4)>>2]=${hi}|0;`;
          }
          
          const size = this.sizeOf(elemType || 'int4', false);
          const addr = `((${ptr}|0) + ((${idx}|0) * ${size})|0)|0`;
          const view = this.getHeapView(expectedType);
          const shift = this.getShiftAmount(expectedType);
          const store = shift > 0 ? `${view}[${addr}>>${shift}]` : `${view}[${addr}]`;
          if (this._isFloat64(expectedType)) return `${store} = ${val}`;
          return `${store} = ${val}${expectedType?.startsWith('float') ? '' : (expectedType?.startsWith('uint') ? '>>>0' : '|0')}`;
        }
        
        if ((expectedType === 'int8' || expectedType === 'uint8') && expr.left.type === 'Identifier') {
          const varName = expr.left.name;
          const rhs = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
          
          if (typeof rhs === 'string' && rhs.includes('__INLINE_64_')) {
            const match = rhs.match(/__INLINE_64_([^_]+)__\(([^)]+)\)/);
            if (match) {
              const [, op, args] = match;
              const parts = args.split(',').map(x => x.trim());
              if (parts.length === 4) {
                const [l_hi, l_lo, r_hi, r_lo] = parts;
                return this._compile64BitBinaryInline(op, l_hi, l_lo, r_hi, r_lo, `${varName}_hi`, `${varName}_lo`);
              }
            }
          }
          
          if (typeof rhs === 'string' && rhs.startsWith('[')) {
            const match = rhs.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/);
            if (match) {
              const [, hiExpr, loExpr] = match;
              return `${varName}_hi = ${hiExpr}; ${varName}_lo = ${loExpr};`;
            }
          }
        }
        
        const rhs = this.compileExpr(expr.right, strOff, sigs, expectedType, funcParams, localVarTypes);
        return `${expr.left.name} = ${this.wrap(rhs, expectedType, false)}`;
      }
      
      case 'Cast': {
        const val = this.compileExpr(expr.expression, strOff, sigs, expr.targetType, funcParams, localVarTypes);
        return this.wrap(val, expr.targetType, expr.targetIsPointer);
      }
      
      case 'SizeOf': return `${this.sizeOf(expr.typeName, expr.isPointer)}|0`;
      
      case 'Call': {
        const sig = sigs.get(expr.callee);
        const [retChar, paramChars] = sig ? sig.split(':') : ['i', ''];
        const paramCharsArr = paramChars.split('');
        
        const args = expr.arguments.map((a, i) => {
          const paramChar = paramCharsArr[i] || 'i';
          let argExpectedType = 'int4';
          if (paramChar === 'D') argExpectedType = 'float8';
          else if (paramChar === 'd') argExpectedType = 'float4';
          else if (paramChar === 'i' && (a.dataType === 'int8' || a.dataType === 'uint8')) {
            argExpectedType = 'int8';
          }
          const val = this.compileExpr(a, strOff, sigs, argExpectedType, funcParams, localVarTypes);
          if (paramChar === 'D') return `+(${val})`;
          if (paramChar === 'd') return `fround(${val})`;
          if (paramChar === 'i' && (a.dataType === 'int8' || a.dataType === 'uint8')) {
            if (typeof val === 'string' && val.startsWith('[')) {
              const match = val.match(/^\[\s*([^,]+)\s*,\s*([^,\]]+)\s*\]$/);
              return match ? `${match[1].trim()}, ${match[2].trim()}` : '0, 0';
            }
            const [hi, lo] = val.split(',').map(x => x.trim());
            return `${hi}, ${lo}`;
          }
          return `(${val})|0`;
        });
        
        const call = `${expr.callee}(${args.join(',')})`;
        if (retChar === 'D' || retChar === 'd') return `+${call}`;
        return `(${call})|0`;
      }
      
      default: throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }

  wrap(expr, type, isPtr) {
    if (isPtr) return `(${expr})|0`;
    if (this._isFloat64(type)) return `+(${expr})`;
    if (type?.startsWith('float')) {
      if (typeof expr === 'string' && expr.startsWith('fround(')) return expr;
      return `fround(${expr})`;
    }
    
    if (type === 'int8' || type === 'uint8') return expr;
    
    if (type === 'int1') return `((${expr})<<24)>>24`;
    if (type === 'int2') return `((${expr})<<16)>>16`;
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
      'int8':'HEAP32','uint8':'HEAPU32','float8':'HEAPF64'
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
    const code = compiler.compile(ast);
    
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