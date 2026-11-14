/**
 * Small Language Preprocessor (SLP) Runtime Library
 * Pure JavaScript implementation with no external dependencies.
 */

class Environment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  set(name, value) {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
    } else if (this.parent) {
      this.parent.set(name, value);
    } else {
      this.vars.set(name, value);
    }
  }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }
}

function toBoolean(val) {
  if (val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0 && !isNaN(val);
  if (typeof val === 'bigint') return val !== 0n;
  if (typeof val === 'string') return val.length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (val !== null && typeof val === 'object') return true;
  return false;
}

class Lexer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.buffer = [];
  }

  peek() { return this.input[this.pos]; }
  
  advance() {
    const ch = this.input[this.pos];
    this.pos++;
    if (ch === '\n') { this.line++; this.col = 1; }
    else { this.col++; }
    return ch;
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.input.length) {
      if (/\s/.test(this.input[this.pos])) {
        this.advance();
      } else if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '/') {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.advance();
      } else if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '*') {
        this.advance(); this.advance();
        while (this.pos < this.input.length) {
          if (this.input[this.pos] === '*' && this.input[this.pos + 1] === '/') {
            this.advance(); this.advance();
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  _generateToken() {
    this.skipWhitespaceAndComments();
    if (this.pos >= this.input.length) return { type: 'EOF', value: 'EOF' };

    const ch = this.input[this.pos];

    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
        id += this.advance();
      }
      if (['var', 'if', 'else', 'switch', 'case', 'default', 'break', 'continue', 'while', 'do', 'for', 'in', 'return', 'typeof', 'true', 'false', 'undefined'].includes(id)) {
        return { type: 'KEYWORD', value: id };
      }
      return { type: 'IDENTIFIER', value: id };
    }

    if (/[0-9]/.test(ch)) {
      let numStr = '';
      let isFloat = false;
      while (this.pos < this.input.length && (/[0-9]/.test(this.input[this.pos]) || this.input[this.pos] === '.' || this.input[this.pos] === 'n')) {
        const c = this.input[this.pos];
        if (c === '.') {
          if (isFloat) break;
          isFloat = true;
        } else if (c === 'n') {
          numStr += this.advance();
          break;
        }
        numStr += this.advance();
      }
      if (isFloat) return { type: 'FLOAT', value: parseFloat(numStr) };
      return { type: 'INTEGER', value: BigInt(numStr) };
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = this.advance();
      let str = '';
      while (this.pos < this.input.length) {
        const c = this.advance();
        if (c === quote) break;
        if (c === '\\') {
          const next = this.advance();
          if (next === 'n') str += '\n';
          else if (next === 't') str += '\t';
          else if (next === 'r') str += '\r';
          else if (next === quote) str += quote;
          else if (next === '\\') str += '\\';
          else if (next === '$') str += '$';
          else str += next;
        } else {
          str += c;
        }
      }
      return { type: 'STRING', value: str, quote: quote };
    }

    const twoChar = this.input.substr(this.pos, 2);
    const operators = ['++', '--', '**', '==', '!=', '>=', '<=', '&&', '||', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|=', '->'];
    if (operators.includes(twoChar)) {
      this.advance(); this.advance();
      return { type: 'OPERATOR', value: twoChar };
    }

    const singleCharOps = ['+', '-', '*', '/', '%', '=', '!', '>', '<', '&', '|', '^', '~', '?', ':', '.', ',', ';', '(', ')', '{', '}', '[', ']', '#'];
    if (singleCharOps.includes(ch)) {
      this.advance();
      return { type: ch === '#' ? 'HASH' : (['(', ')', '{', '}', '[', ']', '.', ',', ';'].includes(ch) ? 'PUNCTUATION' : 'OPERATOR'), value: ch };
    }

    throw new Error(`Unexpected character: ${ch} at line ${this.line}, col ${this.col}`);
  }

  getNextToken() {
    if (this.buffer.length > 0) return this.buffer.shift();
    return this._generateToken();
  }

  peekToken() {
    if (this.buffer.length === 0) {
      this.buffer.push(this._generateToken());
    }
    return this.buffer[0];
  }
}

class Parser {
  constructor(lexer) {
    this.lexer = lexer;
    this.current = this.lexer.getNextToken();
    this.previous = null;
  }

  advance() {
    this.previous = this.current;
    this.current = this.lexer.getNextToken();
    return this.previous;
  }

  check(...expected) {
    for (const exp of expected) {
      if (this.current.type === exp || this.current.value === exp) return true;
    }
    return false;
  }

  match(...expected) {
    for (const exp of expected) {
      if (this.current.type === exp || this.current.value === exp) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  consume(expected, errorMsg) {
    if (this.check(expected)) return this.advance();
    throw new Error(`${errorMsg} Got ${this.current.type} (${this.current.value})`);
  }

  parseProgram() {
    const body = [];
    while (this.current.type !== 'EOF') {
      body.push(this.parseStatement());
    }
    return { type: 'Program', body };
  }

  parseStatement() {
    if (this.match('HASH')) {
      this.consume('token', "Expected 'token' after '#'");
      if (this.match('var')) {
        const decl = this.parseVariableDeclaration();
        return { type: 'TokenDirective', target: 'var', declaration: decl };
      } else {
        const id = this.consume('IDENTIFIER', "Expected identifier after #token");
        this.consume(';', "Expected ';' after #token name");
        return { type: 'TokenDirective', target: 'identifier', name: id.value };
      }
    }
    if (this.match('var')) {
      return this.parseVariableDeclaration();
    }
    if (this.match('return')) {
      let arg = null;
      if (!this.check(';', '}', 'EOF')) {
        arg = this.parseExpression();
      }
      this.consume(';', "Expected ';' after return");
      return { type: 'ReturnStatement', argument: arg };
    }
    if (this.match('break')) {
      this.consume(';', "Expected ';' after break");
      return { type: 'BreakStatement' };
    }
    if (this.match('continue')) {
      this.consume(';', "Expected ';' after continue");
      return { type: 'ContinueStatement' };
    }
    if (this.match('if')) {
      this.consume('(', "Expected '(' after if");
      const test = this.parseExpression();
      this.consume(')', "Expected ')' after if condition");
      const consequent = this.parseBlock();
      let alternate = null;
      if (this.match('else')) {
        alternate = this.parseBlock();
      }
      return { type: 'IfStatement', test, consequent, alternate };
    }
    if (this.match('while')) {
      this.consume('(', "Expected '(' after while");
      const test = this.parseExpression();
      this.consume(')', "Expected ')' after while condition");
      const body = this.parseBlock();
      return { type: 'WhileStatement', test, body };
    }
    if (this.match('do')) {
      const body = this.parseBlock();
      this.consume('while', "Expected 'while' after do block");
      this.consume('(', "Expected '(' after do while");
      const test = this.parseExpression();
      this.consume(')', "Expected ')' after do while condition");
      this.consume(';', "Expected ';' after do while");
      return { type: 'DoWhileStatement', body, test };
    }
    if (this.check('for')) {
      this.advance();
      this.consume('(', "Expected '(' after for");
      let left = null;
      if (this.match('var')) {
        const id = this.consume('IDENTIFIER', "Expected variable name");
        let initVal = null;
        if (this.match('=')) {
          initVal = this.parseExpression();
        }
        left = { type: 'VariableDeclaration', id: id.value, init: initVal };
      } else {
        left = this.parseExpression();
      }
      
      if (this.match('in')) {
        const right = this.parseExpression();
        this.consume(')', "Expected ')' after for...in");
        const body = this.parseBlock();
        return { type: 'ForInStatement', left, right, body };
      } else {
        this.consume(';', "Expected ';' after for init");
        let test = null;
        if (!this.check(';')) test = this.parseExpression();
        this.consume(';', "Expected ';' after for test");
        let update = null;
        if (!this.check(')')) update = this.parseExpression();
        this.consume(')', "Expected ')' after for update");
        const body = this.parseBlock();
        return { type: 'ForStatement', init: left, test, update, body };
      }
    }
    if (this.match('switch')) {
      this.consume('(', "Expected '(' after switch");
      const discriminant = this.parseExpression();
      this.consume(')', "Expected ')' after switch discriminant");
      this.consume('{', "Expected '{' after switch");
      const cases = [];
      while (!this.check('}', 'EOF')) {
        if (this.match('case')) {
          const test = this.parseExpression();
          this.consume(':', "Expected ':' after case");
          const consequent = [];
          while (!this.check('case', 'default', '}', 'EOF')) {
            consequent.push(this.parseStatement());
          }
          cases.push({ test, consequent });
        } else if (this.match('default')) {
          this.consume(':', "Expected ':' after default");
          const consequent = [];
          while (!this.check('case', 'default', '}', 'EOF')) {
            consequent.push(this.parseStatement());
          }
          cases.push({ test: null, consequent });
        } else {
          break;
        }
      }
      this.consume('}', "Expected '}' after switch cases");
      return { type: 'SwitchStatement', discriminant, cases };
    }
    
    // Expression statement
    const expr = this.parseExpression();
    this.consume(';', "Expected ';' after expression");
    return { type: 'ExpressionStatement', expression: expr };
  }

  parseVariableDeclaration() {
    const id = this.consume('IDENTIFIER', "Expected variable name");
    let init = null;
    if (this.match('=')) {
      init = this.parseExpression();
    }
    this.consume(';', "Expected ';' after variable declaration");
    return { type: 'VariableDeclaration', id: id.value, init: init };
  }

  parseBlock() {
    this.consume('{', "Expected '{' for block");
    const body = [];
    while (!this.check('}', 'EOF')) {
      body.push(this.parseStatement());
    }
    this.consume('}', "Expected '}' after block");
    return { type: 'BlockStatement', body };
  }

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    let expr = this.parseConditional();
    if (this.match('=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|=')) {
      const operator = this.previous.value;
      const right = this.parseAssignment();
      return { type: 'AssignmentExpression', left: expr, operator, right };
    }
    return expr;
  }

  parseConditional() {
    let expr = this.parseLogicalOr();
    if (this.match('?')) {
      const consequent = this.parseExpression();
      this.consume(':', "Expected ':' in conditional expression");
      const alternate = this.parseAssignment();
      return { type: 'ConditionalExpression', test: expr, consequent, alternate };
    }
    return expr;
  }

  parseLogicalOr() {
    let expr = this.parseLogicalAnd();
    while (this.match('||')) {
      expr = { type: 'BinaryExpression', left: expr, operator: '||', right: this.parseLogicalAnd() };
    }
    return expr;
  }

  parseLogicalAnd() {
    let expr = this.parseBitwiseOr();
    while (this.match('&&')) {
      expr = { type: 'BinaryExpression', left: expr, operator: '&&', right: this.parseBitwiseOr() };
    }
    return expr;
  }

  parseBitwiseOr() {
    let expr = this.parseBitwiseXor();
    while (this.match('|')) {
      expr = { type: 'BinaryExpression', left: expr, operator: '|', right: this.parseBitwiseXor() };
    }
    return expr;
  }

  parseBitwiseXor() {
    let expr = this.parseBitwiseAnd();
    while (this.match('^')) {
      expr = { type: 'BinaryExpression', left: expr, operator: '^', right: this.parseBitwiseAnd() };
    }
    return expr;
  }

  parseBitwiseAnd() {
    let expr = this.parseEquality();
    while (this.match('&')) {
      expr = { type: 'BinaryExpression', left: expr, operator: '&', right: this.parseEquality() };
    }
    return expr;
  }

  parseEquality() {
    let expr = this.parseRelational();
    while (this.match('==', '!=')) {
      expr = { type: 'BinaryExpression', left: expr, operator: this.previous.value, right: this.parseRelational() };
    }
    return expr;
  }

  parseRelational() {
    let expr = this.parseShift();
    while (this.match('<', '<=', '>', '>=')) {
      expr = { type: 'BinaryExpression', left: expr, operator: this.previous.value, right: this.parseShift() };
    }
    return expr;
  }

  parseShift() {
    let expr = this.parseAdditive();
    while (this.match('<<', '>>')) {
      expr = { type: 'BinaryExpression', left: expr, operator: this.previous.value, right: this.parseAdditive() };
    }
    return expr;
  }

  parseAdditive() {
    let expr = this.parseMultiplicative();
    while (this.match('+', '-')) {
      expr = { type: 'BinaryExpression', left: expr, operator: this.previous.value, right: this.parseMultiplicative() };
    }
    return expr;
  }

  parseMultiplicative() {
    let expr = this.parseExponentiation();
    while (this.match('*', '/', '%')) {
      expr = { type: 'BinaryExpression', left: expr, operator: this.previous.value, right: this.parseExponentiation() };
    }
    return expr;
  }

  parseExponentiation() {
    let expr = this.parseUnary();
    if (this.match('**')) {
      const right = this.parseExponentiation();
      return { type: 'BinaryExpression', left: expr, operator: '**', right };
    }
    return expr;
  }

  parseUnary() {
    if (this.match('!', '-', '+', '~', 'typeof')) {
      const operator = this.previous.value;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator, argument };
    }
    return this.parsePrimaryAndPostfix();
  }

  parsePrimaryAndPostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match('.')) {
        const prop = this.consume('IDENTIFIER', "Expected property name after '.'");
        expr = { type: 'MemberExpression', object: expr, property: { type: 'Literal', value: prop.value }, computed: false };
      } else if (this.match('[')) {
        const prop = this.parseExpression();
        this.consume(']', "Expected ']' after computed property");
        expr = { type: 'MemberExpression', object: expr, property: prop, computed: true };
      } else if (this.match('(')) {
        expr = this.parseCallExpression(expr);
      } else if (this.match('++', '--')) {
        expr = { type: 'UpdateExpression', operator: this.previous.value, argument: expr, prefix: false };
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    if (this.match('true')) return { type: 'Literal', value: true };
    if (this.match('false')) return { type: 'Literal', value: false };
    if (this.match('undefined')) return { type: 'Literal', value: undefined };
    if (this.match('INTEGER')) return { type: 'Literal', value: this.previous.value };
    if (this.match('FLOAT')) return { type: 'Literal', value: this.previous.value };
    if (this.match('STRING')) {
      const token = this.previous;
      if ((token.quote === '`' || token.quote === '"') && token.value.includes('${')) {
        return this.parseTemplateLiteral(token.value, token.quote);
      }
      return { type: 'Literal', value: token.value };
    }
    if (this.match('IDENTIFIER')) {
      return { type: 'Identifier', name: this.previous.value };
    }
    if (this.check('(')) {
      this.advance();
      let isArrow = true;
      const params = [];
      const consumed = [];
      const savedPrevious = this.previous;

      if (!this.check(')')) {
        while (true) {
          if (this.check('IDENTIFIER')) {
            consumed.push(this.advance());
            params.push(this.previous.value);
          } else {
            isArrow = false;
            break;
          }
          if (this.check(',')) {
            consumed.push(this.advance());
          } else {
            break;
          }
        }
      }
      
      if (isArrow && this.check(')')) {
        consumed.push(this.advance());
        if (this.check('->')) {
          consumed.push(this.advance());
          const body = this.parseBlock();
          return { type: 'FunctionExpression', params, body };
        } else {
          isArrow = false;
        }
      } else {
        isArrow = false;
      }

      if (!isArrow) {
        this.lexer.buffer = [...consumed, ...this.lexer.buffer];
        this.current = consumed.length > 0 ? consumed[0] : { type: 'PUNCTUATION', value: '(' };
        this.previous = savedPrevious;
        
        this.advance();
        const expr = this.parseExpression();
        this.consume(')', "Expected ')' after expression");
        return expr;
      }
    }
    if (this.match('[')) return this.parseArrayLiteral();
    if (this.match('{')) return this.parseObjectLiteral();
    
    throw new Error(`Unexpected token: ${this.current.type} (${this.current.value})`);
  }

  parseTemplateLiteral(raw, quote) {
    const parts = [];
    let i = 0;
    while (i < raw.length) {
      const start = raw.indexOf('${', i);
      if (start === -1) {
        parts.push({ type: 'Literal', value: raw.slice(i) });
        break;
      }
      if (start > i) {
        parts.push({ type: 'Literal', value: raw.slice(i, start) });
      }
      let depth = 1;
      let j = start + 2;
      while (j < raw.length && depth > 0) {
        if (raw[j] === '{') depth++;
        else if (raw[j] === '}') depth--;
        j++;
      }
      const exprStr = raw.slice(start + 2, j - 1);
      const subLexer = new Lexer(exprStr);
      const subParser = new Parser(subLexer);
      const expr = subParser.parseExpression();
      parts.push({ type: 'TemplateExpression', expression: expr });
      i = j;
    }
    return { type: 'TemplateLiteral', parts };
  }

  parseCallExpression(callee) {
    const args = [];
    if (!this.check(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.match(','));
    }
    this.consume(')', "Expected ')' after arguments");
    return { type: 'CallExpression', callee, arguments: args };
  }

  parseArrayLiteral() {
    const elements = [];
    while (!this.check(']', 'EOF')) {
      elements.push(this.parseExpression());
      if (this.match(',')) {
        if (this.check(']')) break;
      } else {
        break;
      }
    }
    this.consume(']', "Expected ']' after array elements");
    return { type: 'ArrayLiteral', elements };
  }

  parseObjectLiteral() {
    const properties = [];
    while (!this.check('}', 'EOF')) {
      const key = this.consume('IDENTIFIER', "Expected property name").value;
      this.consume(':', "Expected ':' after property name");
      const value = this.parseExpression();
      properties.push({ key, value });
      if (this.match(',')) {
        if (this.check('}')) break;
      } else {
        break;
      }
    }
    this.consume('}', "Expected '}' after object properties");
    return { type: 'ObjectLiteral', properties };
  }
}

class Interpreter {
  constructor() {
    this.globalEnv = new Environment();
    this.tokens = new Set();
  }

  interpret(program) {
    try {
      const newTokens = [];
      for (const stmt of program.body) {
        const res = this.execute(stmt, this.globalEnv);
        if (res.control) {
          return { success: false, tokens: [], error_message: `Runtime Error: Unexpected control flow '${res.control}'` };
        }
        if (stmt.type === 'TokenDirective') {
          if (stmt.target === 'var') {
            newTokens.push(stmt.declaration.id);
            this.tokens.add(stmt.declaration.id);
          } else if (stmt.target === 'identifier') {
            newTokens.push(stmt.name);
            this.tokens.add(stmt.name);
          }
        }
      }
      return { success: true, tokens: newTokens, error_message: "" };
    } catch (e) {
      return { success: false, tokens: [], error_message: `Runtime Error: ${e.message}` };
    }
  }

  resolveReference(node, env) {
    if (node.type === 'Identifier') {
      return {
        get: () => env.get(node.name),
        set: (val) => env.set(node.name, val)
      };
    } else if (node.type === 'MemberExpression') {
      const objRes = this.evaluate(node.object, env);
      if (objRes.control) throw new Error("Control flow in assignment");
      const obj = objRes.value;
      const prop = node.computed ? this.evaluate(node.property, env).value : node.property.value;
      return {
        get: () => obj[prop],
        set: (val) => { obj[prop] = val; }
      };
    }
    throw new Error("Invalid assignment target");
  }

  execute(node, env) {
    switch (node.type) {
      case 'Program':
      case 'BlockStatement': {
        const blockEnv = node.type === 'BlockStatement' ? new Environment(env) : env;
        for (const stmt of node.body) {
          const res = this.execute(stmt, blockEnv);
          if (res.control) return res;
        }
        return { value: undefined, control: null };
      }
      case 'VariableDeclaration': {
        let val = undefined;
        if (node.init) {
          const res = this.evaluate(node.init, env);
          if (res.control) return res;
          val = res.value;
        }
        env.set(node.id, val);
        return { value: undefined, control: null };
      }
      case 'TokenDirective':
        if (node.declaration) {
          return this.execute(node.declaration, env);
        }
        return { value: undefined, control: null };
      case 'ReturnStatement': {
        if (node.argument) {
          const res = this.evaluate(node.argument, env);
          if (res.control) return res;
          return { value: res.value, control: 'return' };
        }
        return { value: undefined, control: 'return' };
      }
      case 'BreakStatement':
        return { value: undefined, control: 'break' };
      case 'ContinueStatement':
        return { value: undefined, control: 'continue' };
      case 'IfStatement': {
        const testRes = this.evaluate(node.test, env);
        if (testRes.control) return testRes;
        if (toBoolean(testRes.value)) {
          return this.execute(node.consequent, env);
        } else if (node.alternate) {
          return this.execute(node.alternate, env);
        }
        return { value: undefined, control: null };
      }
      case 'WhileStatement': {
        while (true) {
          const tRes = this.evaluate(node.test, env);
          if (tRes.control) return tRes;
          if (!toBoolean(tRes.value)) break;
          const bRes = this.execute(node.body, env);
          if (bRes.control === 'break') break;
          if (bRes.control === 'return') return bRes;
        }
        return { value: undefined, control: null };
      }
      case 'DoWhileStatement': {
        while (true) {
          const bRes = this.execute(node.body, env);
          if (bRes.control === 'break') break;
          if (bRes.control === 'return') return bRes;
          const tRes = this.evaluate(node.test, env);
          if (tRes.control) return tRes;
          if (!toBoolean(tRes.value)) break;
        }
        return { value: undefined, control: null };
      }
      case 'ForStatement': {
        if (node.init) {
          const iRes = this.execute(node.init, env);
          if (iRes.control) return iRes;
        }
        while (true) {
          if (node.test) {
            const tRes = this.evaluate(node.test, env);
            if (tRes.control) return tRes;
            if (!toBoolean(tRes.value)) break;
          }
          const bRes = this.execute(node.body, env);
          if (bRes.control === 'break') break;
          if (bRes.control === 'return') return bRes;
          if (node.update) {
            const uRes = this.evaluate(node.update, env);
            if (uRes.control) return uRes;
          }
        }
        return { value: undefined, control: null };
      }
      case 'ForInStatement': {
        const rightRes = this.evaluate(node.right, env);
        if (rightRes.control) return rightRes;
        const obj = rightRes.value;
        if (obj !== null && obj !== undefined) {
          const keys = Object.keys(obj);
          for (const key of keys) {
            this.assign(node.left, key, env);
            const bRes = this.execute(node.body, env);
            if (bRes.control === 'break') break;
            if (bRes.control === 'return') return bRes;
          }
        }
        return { value: undefined, control: null };
      }
      case 'SwitchStatement': {
        const discRes = this.evaluate(node.discriminant, env);
        if (discRes.control) return discRes;
        const discVal = discRes.value;
        let matched = false;
        let skip = false;
        for (const c of node.cases) {
          if (!skip) {
            if (c.test) {
              const tRes = this.evaluate(c.test, env);
              if (tRes.control) return tRes;
              if (tRes.value == discVal) {
                matched = true;
              } else {
                continue;
              }
            } else {
              matched = true;
            }
          }
          if (matched) {
            for (const stmt of c.consequent) {
              const res = this.execute(stmt, env);
              if (res.control === 'break') {
                skip = true;
                break;
              }
              if (res.control === 'return') return res;
              if (res.control === 'continue') return res;
            }
            if (skip) break;
          }
        }
        return { value: undefined, control: null };
      }
      case 'ExpressionStatement':
        return this.evaluate(node.expression, env);
      default:
        return { value: undefined, control: null };
    }
  }

  assign(node, value, env) {
    if (node.type === 'Identifier') {
      env.set(node.name, value);
    } else if (node.type === 'MemberExpression') {
      const objRes = this.evaluate(node.object, env);
      if (objRes.control) throw new Error("Control flow in assignment");
      const obj = objRes.value;
      const propRes = this.evaluate(node.property, env);
      const prop = propRes.value;
      obj[prop] = value;
    } else {
      throw new Error("Invalid assignment target");
    }
  }

  evaluate(node, env) {
    switch (node.type) {
      case 'Literal':
        return { value: node.value, control: null };
      
      case 'TemplateLiteral': {
        let str = "";
        for (const part of node.parts) {
          if (part.type === 'Literal') {
            str += part.value;
          } else if (part.type === 'TemplateExpression') {
            const res = this.evaluate(part.expression, env);
            if (res.control) return res;
            str += this.stringify(res.value);
          }
        }
        return { value: str, control: null };
      }

      case 'Identifier':
        return { value: env.get(node.name), control: null };

      case 'ArrayLiteral': {
        const arr = [];
        for (const el of node.elements) {
          const res = this.evaluate(el, env);
          if (res.control) return res;
          arr.push(res.value);
        }
        return { value: arr, control: null };
      }

      case 'ObjectLiteral': {
        const obj = {};
        for (const prop of node.properties) {
          const res = this.evaluate(prop.value, env);
          if (res.control) return res;
          obj[prop.key] = res.value;
        }
        return { value: obj, control: null };
      }

      case 'FunctionExpression':
        return { value: { type: 'function', params: node.params, body: node.body, env: env }, control: null };

      case 'UnaryExpression': {
        const argRes = this.evaluate(node.argument, env);
        if (argRes.control) return argRes;
        const arg = argRes.value;
        let uVal;
        switch (node.operator) {
          case '!': uVal = !toBoolean(arg); break;
          case '-': uVal = typeof arg === 'bigint' ? -arg : -Number(arg); break;
          case '+': uVal = Number(arg); break;
          case '~': uVal = typeof arg === 'bigint' ? ~arg : ~Number(arg); break;
          case 'typeof':
            if (arg === undefined) uVal = "undefined";
            else if (typeof arg === 'bigint') uVal = "integer";
            else if (typeof arg === 'number') uVal = "float";
            else if (typeof arg === 'boolean') uVal = "boolean";
            else if (typeof arg === 'string') uVal = "string";
            else if (Array.isArray(arg)) uVal = "array";
            else if (arg !== null && typeof arg === 'object') uVal = "object";
            else if (arg && arg.type === 'function') uVal = "function";
            else uVal = typeof arg;
            break;
        }
        return { value: uVal, control: null };
      }

      case 'UpdateExpression': {
        const ref = this.resolveReference(node.argument, env);
        let current = ref.get();
        let newVal;
        if (node.operator === '++') {
          newVal = typeof current === 'bigint' ? current + 1n : Number(current) + 1;
        } else {
          newVal = typeof current === 'bigint' ? current - 1n : Number(current) - 1;
        }
        ref.set(newVal);
        return { value: node.prefix ? newVal : current, control: null };
      }

      case 'AssignmentExpression': {
        const assignRef = this.resolveReference(node.left, env);
        const rightRes = this.evaluate(node.right, env);
        if (rightRes.control) return rightRes;
        let rightVal = rightRes.value;
        let finalVal = rightVal;
        
        if (node.operator !== '=') {
          const leftVal = assignRef.get();
          switch (node.operator) {
            case '+=': finalVal = (typeof leftVal === 'bigint' || typeof rightVal === 'bigint') ? BigInt(leftVal) + BigInt(rightVal) : Number(leftVal) + Number(rightVal); break;
            case '-=': finalVal = (typeof leftVal === 'bigint' || typeof rightVal === 'bigint') ? BigInt(leftVal) - BigInt(rightVal) : Number(leftVal) - Number(rightVal); break;
            case '*=': finalVal = (typeof leftVal === 'bigint' || typeof rightVal === 'bigint') ? BigInt(leftVal) * BigInt(rightVal) : Number(leftVal) * Number(rightVal); break;
            case '/=': finalVal = (typeof leftVal === 'bigint' || typeof rightVal === 'bigint') ? BigInt(leftVal) / BigInt(rightVal) : Number(leftVal) / Number(rightVal); break;
            case '%=': finalVal = (typeof leftVal === 'bigint' || typeof rightVal === 'bigint') ? BigInt(leftVal) % BigInt(rightVal) : Number(leftVal) % Number(rightVal); break;
            case '<<=': finalVal = BigInt(leftVal) << BigInt(rightVal); break;
            case '>>=': finalVal = BigInt(leftVal) >> BigInt(rightVal); break;
            case '&=': finalVal = BigInt(leftVal) & BigInt(rightVal); break;
            case '^=': finalVal = BigInt(leftVal) ^ BigInt(rightVal); break;
            case '|=': finalVal = BigInt(leftVal) | BigInt(rightVal); break;
          }
        }
        assignRef.set(finalVal);
        return { value: finalVal, control: null };
      }

      case 'BinaryExpression': {
        const lRes = this.evaluate(node.left, env);
        if (lRes.control) return lRes;
        const rRes = this.evaluate(node.right, env);
        if (rRes.control) return rRes;
        const l = lRes.value;
        const r = rRes.value;
        let bVal;
        switch (node.operator) {
          case '+': 
            if (typeof l === 'string' || typeof r === 'string') bVal = String(l) + String(r);
            else if (typeof l === 'bigint' || typeof r === 'bigint') bVal = BigInt(l) + BigInt(r);
            else bVal = Number(l) + Number(r);
            break;
          case '-': bVal = (typeof l === 'bigint' || typeof r === 'bigint') ? BigInt(l) - BigInt(r) : Number(l) - Number(r); break;
          case '*': bVal = (typeof l === 'bigint' || typeof r === 'bigint') ? BigInt(l) * BigInt(r) : Number(l) * Number(r); break;
          case '/': bVal = (typeof l === 'bigint' || typeof r === 'bigint') ? BigInt(l) / BigInt(r) : Number(l) / Number(r); break;
          case '%': bVal = (typeof l === 'bigint' || typeof r === 'bigint') ? BigInt(l) % BigInt(r) : Number(l) % Number(r); break;
          case '**': bVal = (typeof l === 'bigint' || typeof r === 'bigint') ? BigInt(l) ** BigInt(r) : Number(l) ** Number(r); break;
          case '==': bVal = l == r; break;
          case '!=': bVal = l != r; break;
          case '>': bVal = l > r; break;
          case '>=': bVal = l >= r; break;
          case '<': bVal = l < r; break;
          case '<=': bVal = l <= r; break;
          case '&&': bVal = toBoolean(l) && toBoolean(r); break;
          case '||': bVal = toBoolean(l) || toBoolean(r); break;
          case '&': bVal = BigInt(l) & BigInt(r); break;
          case '|': bVal = BigInt(l) | BigInt(r); break;
          case '^': bVal = BigInt(l) ^ BigInt(r); break;
          case '<<': bVal = BigInt(l) << BigInt(r); break;
          case '>>': bVal = BigInt(l) >> BigInt(r); break;
        }
        return { value: bVal, control: null };
      }

      case 'ConditionalExpression': {
        const cTest = this.evaluate(node.test, env);
        if (cTest.control) return cTest;
        return toBoolean(cTest.value) ? this.evaluate(node.consequent, env) : this.evaluate(node.alternate, env);
      }

      case 'CallExpression': {
        let targetObj = null;
        let func = null;

        if (node.callee.type === 'MemberExpression') {
          const objRes = this.evaluate(node.callee.object, env);
          if (objRes.control) return objRes;
          targetObj = objRes.value;
          const methodName = node.callee.computed ? this.evaluate(node.callee.property, env).value : node.callee.property.value;
          
          if (typeof targetObj === 'string') {
            func = this.getStringMethod(methodName, targetObj);
          } else if (Array.isArray(targetObj)) {
            func = this.getArrayMethod(methodName, targetObj);
          } else {
            func = targetObj[methodName];
          }
        } else {
          const calleeRes = this.evaluate(node.callee, env);
          if (calleeRes.control) return calleeRes;
          func = calleeRes.value;
        }

        const callArgs = [];
        for (const argNode of node.arguments) {
          const aRes = this.evaluate(argNode, env);
          if (aRes.control) return aRes;
          callArgs.push(aRes.value);
        }

        if (typeof func === 'function') {
          return { value: func.apply(targetObj, callArgs), control: null };
        } else if (func && func.type === 'function') {
          const funcEnv = new Environment(func.env);
          for (let i = 0; i < func.params.length; i++) {
            funcEnv.set(func.params[i], callArgs[i] !== undefined ? callArgs[i] : undefined);
          }
          funcEnv.set('args', callArgs);
          const res = this.execute(func.body, funcEnv);
          if (res.control === 'return') return { value: res.value, control: null };
          if (res.control) return res;
          return { value: undefined, control: null };
        }
        return { value: undefined, control: null };
      }

      default:
        return { value: undefined, control: null };
    }
  }

  getStringMethod(name, str) {
    switch (name) {
      case 'charAt': return (index) => str.charAt(index) || "";
      case 'charCodeAt': return (index) => {
        const code = str.charCodeAt(index);
        return isNaN(code) ? undefined : code;
      };
      case 'substring': return (start, end) => {
        if (end === undefined) return str.substring(start);
        if (start > end) return str.substring(end, start);
        return str.substring(start, end);
      };
      case 'startsWith': return (search, pos) => str.startsWith(search, pos || 0);
      case 'endsWith': return (search, len) => str.endsWith(search, len !== undefined ? len : str.length);
      case 'indexOf': return (search, from) => str.indexOf(search, from !== undefined ? from : 0);
      default: return undefined;
    }
  }

  getArrayMethod(name, arr) {
    switch (name) {
      case 'push': return (...vals) => { arr.push(...vals); return BigInt(arr.length); };
      case 'unshift': return (...vals) => { arr.unshift(...vals); return BigInt(arr.length); };
      case 'pop': return () => arr.pop();
      case 'shift': return () => arr.shift();
      default: return undefined;
    }
  }

  stringify(val) {
    if (val === undefined) return "undefined";
    if (val === null) return "null";
    if (typeof val === 'boolean') return val ? "true" : "false";
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'number') {
      return parseFloat(val.toFixed(6)).toString();
    }
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) {
      return "[" + val.map(v => this.stringify(v)).join(", ") + "]";
    }
    if (val !== null && typeof val === 'object') {
      if (val.type === 'function') return "[function]";
      const keys = Object.keys(val);
      const pairs = keys.map(k => `"${k}": ${this.stringify(val[k])}`);
      return "{" + pairs.join(", ") + "}";
    }
    return String(val);
  }

  get(tokenName, ...args) {
    if (!this.tokens.has(tokenName)) {
      return `Error: Token not found: ${tokenName}`;
    }
    const val = this.globalEnv.get(tokenName);
    if (val && val.type === 'function') {
      const funcEnv = new Environment(val.env);
      for (let i = 0; i < val.params.length; i++) {
        funcEnv.set(val.params[i], args[i] !== undefined ? args[i] : undefined);
      }
      funcEnv.set('args', args);
      const res = this.execute(val.body, funcEnv);
      if (res.control === 'return') {
        return this.stringify(res.value);
      }
      return this.stringify(res.value);
    } else {
      return this.stringify(val);
    }
  }
}

class SLP {
  constructor() {
    this.interpreter = new Interpreter();
  }

  define(script) {
    try {
      const lexer = new Lexer(script);
      const parser = new Parser(lexer);
      const program = parser.parseProgram();
      return this.interpreter.interpret(program);
    } catch (e) {
      const msg = e.message || "Unknown error";
      if (msg.includes("Unexpected") || msg.includes("Expected")) {
        return { success: false, tokens: [], error_message: `Parse Error: ${msg}` };
      }
      return { success: false, tokens: [], error_message: `Runtime Error: ${msg}` };
    }
  }

  get(tokenName, ...args) {
    return this.interpreter.get(tokenName, ...args);
  }
}

// Export for Node.js or browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SLP;
} else if (typeof window !== 'undefined') {
  window.SLP = SLP;
}