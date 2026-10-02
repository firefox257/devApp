// ./parser.js
export class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    current() { return this.tokens[this.pos]; }

    isType(val) {
        return ['int32', 'int8', 'int16', 'int64', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64', 'bool', 'char', 'void'].includes(val);
    }

    inferType(left, right, op) {
        if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(op)) return 'int32';
        if (left?.valueType === 'float64' || right?.valueType === 'float64') return 'float64';
        if (left?.valueType === 'float32' || right?.valueType === 'float32') return 'float32';
        return 'int32';
    }

    parse() {
        const functions = [];
        const classes = [];
        const typedefs = [];
        const enums = [];
        const globals = [];
        
        while (this.current().type !== 'EOF') {
            if (this.current().value === 'class' || this.current().value === 'struct') {
                classes.push(this.parseClass());
            } else if (this.current().value === 'enum') {
                enums.push(this.parseEnum());
            } else if (this.current().value === 'typedef') {
                typedefs.push(this.parseTypedef());
            } else if (this.current().value === 'const' || this.current().value === 'export' || this.current().value === 'static' || this.isType(this.current().value)) {
                let nextIdx = this.pos;
                let isFunc = false;
                
                while (['const', 'export', 'static', 'public', 'private', 'protected', 'virtual'].includes(this.tokens[nextIdx]?.value)) {
                    nextIdx++;
                }
                
                if (this.isType(this.tokens[nextIdx]?.value) || this.tokens[nextIdx]?.type === 'IDENT') {
                    nextIdx++;
                    if (this.tokens[nextIdx]?.value === '*') nextIdx++;
                    
                    if (this.tokens[nextIdx]?.type === 'IDENT') {
                        nextIdx++;
                        if (this.tokens[nextIdx]?.value === '(') {
                            isFunc = true;
                        } else if (this.tokens[nextIdx]?.value === '::') {
                            isFunc = true;
                        }
                    }
                }
                
                if (isFunc) {
                    functions.push(this.parseFunction());
                } else {
                    globals.push(this.parseGlobalVar());
                }
            } else {
                functions.push(this.parseFunction());
            }
        }
        return { type: 'Program', functions, classes, typedefs, enums, globals };
    }

    parseGlobalVar() {
        let isConst = false, isExport = false, isStatic = false;
        while (['const', 'export', 'static'].includes(this.current().value)) {
            if (this.current().value === 'const') isConst = true;
            if (this.current().value === 'export') isExport = true;
            if (this.current().value === 'static') isStatic = true;
            this.pos++;
        }
        
        const type = this.current().value;
        this.pos++;
        
        let isPointer = false;
        if (this.current().value === '*') {
            isPointer = true;
            this.pos++;
        }
        
        const name = this.current().value;
        this.pos++;
        
        let init = null;
        if (this.current().value === '=') {
            this.pos++;
            init = this.parseExpression();
        }
        
        if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
        this.pos++;
        
        return { type: 'GlobalVar', varType: type, name, init, isPointer, isConst, isExport, isStatic };
    }

    parseClass() {
        const keyword = this.current().value;
        this.pos++;
        const name = this.current().value;
        this.pos++;
        if (this.current().value === ':') { 
            this.pos++; 
            this.pos++; // skip base class name (simplified)
        }
        if (this.current().value !== '{') throw new Error(`Expected {, got ${this.current().value}`);
        this.pos++;
        const members = [];
        let currentAccess = keyword === 'struct' ? 'public' : 'private';
        while (this.current().value !== '}') {
            if (this.current().value === 'public' || this.current().value === 'private' || this.current().value === 'protected') {
                currentAccess = this.current().value;
                this.pos++;
                if (this.current().value === ':') this.pos++;
                continue;
            }
            const type = this.current().value;
            this.pos++;
            let isPointer = false;
            if (this.current().value === '*') {
                isPointer = true;
                this.pos++;
            }
            const mName = this.current().value;
            this.pos++;
            if (this.current().value === ';') this.pos++;
            members.push({ type, name: mName, isPointer, access: currentAccess });
        }
        this.pos++; // consume '}'
        if (this.current().value === ';') this.pos++;
        return { type: 'Class', keyword, name, members };
    }

    parseEnum() {
        this.pos++; // consume 'enum'
        if (this.current().value === 'class') this.pos++;
        const name = this.current().value;
        this.pos++;
        if (this.current().value === ':') { 
            this.pos++; 
            this.pos++; // skip underlying type
        }
        if (this.current().value !== '{') throw new Error(`Expected {, got ${this.current().value}`);
        this.pos++;
        while (this.current().value !== '}') this.pos++;
        this.pos++; // consume '}'
        if (this.current().value === ';') this.pos++;
        return { type: 'Enum', name };
    }

    parseTypedef() {
        this.pos++; // consume 'typedef'
        const existingType = this.current().value;
        this.pos++;
        const newType = this.current().value;
        this.pos++;
        if (this.current().value === ';') this.pos++;
        return { type: 'Typedef', existingType, newType };
    }

    parseFunction() {
        let isExport = false, isVirtual = false, isStatic = false, isConst = false;
        
        while (['export', 'virtual', 'static', 'public', 'private', 'protected', 'const'].includes(this.current().value)) {
            if (this.current().value === 'export') isExport = true;
            if (this.current().value === 'virtual') isVirtual = true;
            if (this.current().value === 'static') isStatic = true;
            if (this.current().value === 'const') isConst = true;
            this.pos++;
        }
        
        const returnType = this.current().value;
        this.pos++;
        
        let returnIsPointer = false;
        if (this.current().value === '*') {
            returnIsPointer = true;
            this.pos++;
        }
        
        let name = this.current().value;
        this.pos++;
        
        if (this.current().value === '::') {
            this.pos++;
            name += '::' + this.current().value;
            this.pos++;
        }
        
        if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
        this.pos++;
        const params = [];
        while (this.current().value !== ')') {
            if (params.length > 0) {
                if (this.current().value !== ',') throw new Error(`Expected ,, got ${this.current().value}`);
                this.pos++;
            }
            let pType = this.current().value;
            this.pos++;
            let isPointer = false;
            if (this.current().value === '*') {
                isPointer = true;
                this.pos++;
            }
            const pName = this.current().value;
            this.pos++;
            params.push({ type: pType, name: pName, isPointer });
        }
        this.pos++; // consume ')'
        
        let body = null;
        if (this.current().value === '{') {
            body = this.parseBlock();
        } else if (this.current().value === ';') {
            this.pos++; // forward declaration or abstract method
        }
        
        return { type: 'Function', name, returnType, returnIsPointer, params, body, isExport, isVirtual, isStatic, isConst };
    }

    parseBlock() {
        if (this.current().value !== '{') throw new Error(`Expected {, got ${this.current().value}`);
        this.pos++;
        const stmts = [];
        while (this.current().value !== '}') {
            stmts.push(this.parseStatement());
        }
        this.pos++; // consume '}'
        return stmts;
    }

    parseStatement() {
        const token = this.current();
        
        if (token.value === 'break') {
            this.pos++;
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'Break' };
        }
        if (token.value === 'continue') {
            this.pos++;
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'Continue' };
        }
        if (token.value === 'return') {
            this.pos++;
            let expr = null;
            if (this.current().value !== ';') expr = this.parseExpression();
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'Return', value: expr };
        }
        if (token.value === 'assert') {
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            const condition = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'Assert', condition };
        }
        if (token.value === 'throw') {
            this.pos++;
            const expr = this.parseExpression();
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'Throw', value: expr };
        }
        if (token.value === 'try') {
            this.pos++;
            const tryBlock = this.parseBlock();
            const catchBlocks = [];
            while (this.current().value === 'catch') {
                this.pos++;
                if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
                this.pos++;
                let catchType = null, catchName = null;
                if (this.current().value === '.') {
                    this.pos++; // .
                    if (this.current().value === '.') this.pos++; // .
                    if (this.current().value === '.') this.pos++; // .
                } else {
                    catchType = this.current().value;
                    this.pos++;
                    if (this.current().value === '*') {
                        this.pos++;
                        catchType += '*';
                    }
                    catchName = this.current().value;
                    this.pos++;
                }
                if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
                this.pos++;
                const catchBlock = this.parseBlock();
                catchBlocks.push({ type: catchType, name: catchName, body: catchBlock });
            }
            return { type: 'TryCatch', tryBlock, catchBlocks };
        }
        if (token.value === 'if') {
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            const condition = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            
            let thenBlock = [];
            if (this.current().value === '{') {
                thenBlock = this.parseBlock();
            } else {
                thenBlock = [this.parseStatement()];
            }
            
            let elseBlock = [];
            if (this.current().value === 'else') {
                this.pos++;
                if (this.current().value === '{') {
                    elseBlock = this.parseBlock();
                } else {
                    elseBlock = [this.parseStatement()];
                }
            }
            return { type: 'If', condition, then: thenBlock, else: elseBlock };
        }
        if (token.value === 'while') {
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            const condition = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            
            let body = [];
            if (this.current().value === '{') {
                body = this.parseBlock();
            } else {
                body = [this.parseStatement()];
            }
            return { type: 'While', condition, body };
        }
        if (token.value === 'do') {
            this.pos++;
            let body = [];
            if (this.current().value === '{') {
                body = this.parseBlock();
            } else {
                body = [this.parseStatement()];
            }
            if (this.current().value !== 'while') throw new Error(`Expected while, got ${this.current().value}`);
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            const condition = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            return { type: 'DoWhile', condition, body };
        }
        if (token.value === 'for') {
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            let init = null;
            if (this.current().value !== ';') {
                if (this.isType(this.current().value) || this.current().type === 'IDENT') {
                    const type = this.current().value;
                    this.pos++;
                    const name = this.current().value;
                    this.pos++;
                    let initExpr = null;
                    if (this.current().value === '=') {
                        this.pos++;
                        initExpr = this.parseExpression();
                    }
                    init = { type: 'VarDecl', varType: type, name, init: initExpr };
                } else {
                    init = { type: 'ExpressionStatement', expression: this.parseExpression() };
                }
            }
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            let condition = null;
            if (this.current().value !== ';') condition = this.parseExpression();
            if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
            this.pos++;
            let update = null;
            if (this.current().value !== ')') update = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            
            let body = [];
            if (this.current().value === '{') {
                body = this.parseBlock();
            } else {
                body = [this.parseStatement()];
            }
            return { type: 'For', init, condition, update, body };
        }
        
        const isDecl = this.isType(token.value) || 
                       token.type === 'IDENT' || 
                       (token.type === 'KEYWORD' && !['return', 'if', 'else', 'while', 'for', 'break', 'continue', 'assert', 'try', 'catch', 'throw', 'sizeof', 'cast', 'null', 'true', 'false', 'do', 'new', 'delete'].includes(token.value));

        if (isDecl) {
            let nextIdx = this.pos + 1;
            if (this.tokens[nextIdx] && (this.tokens[nextIdx].type === 'IDENT' || this.tokens[nextIdx].value === '*' || this.isType(this.tokens[nextIdx].value))) {
                let isConst = false;
                let type = this.current().value;
                if (type === 'const') {
                    isConst = true;
                    this.pos++;
                    type = this.current().value;
                }
                this.pos++;
                
                let isPointer = false;
                if (this.current().value === '*') {
                    isPointer = true;
                    this.pos++;
                }
                const name = this.current().value;
                this.pos++;
                let init = null;
                if (this.current().value === '=') {
                    this.pos++;
                    init = this.parseExpression();
                }
                if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
                this.pos++;
                return { type: 'VarDecl', varType: type, name, init, isPointer, isConst };
            }
        }

        const expr = this.parseExpression();
        if (this.current().value !== ';') throw new Error(`Expected ;, got ${this.current().value}`);
        this.pos++;
        return { type: 'ExpressionStatement', expression: expr };
    }

    parseExpression() { return this.parseAssignment(); }

    parseAssignment() {
        let left = this.parseTernary();
        if ((left.type === 'Identifier' || left.type === 'ArrayIndex' || left.type === 'MemberAccess' || left.type === 'Dereference') && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(this.current().value)) {
            const op = this.current().value;
            this.pos++;
            const right = this.parseAssignment();
            return { type: 'Assignment', op, left, right };
        }
        return left;
    }

    parseTernary() {
        let left = this.parseLogicalOr();
        if (this.current().value === '?') {
            this.pos++;
            const trueExpr = this.parseExpression();
            if (this.current().value !== ':') throw new Error(`Expected :, got ${this.current().value}`);
            this.pos++;
            const falseExpr = this.parseExpression();
            return { type: 'Ternary', condition: left, trueExpr, falseExpr };
        }
        return left;
    }

    parseLogicalOr() {
        let left = this.parseLogicalAnd();
        while (this.current().value === '||') {
            this.pos++;
            const right = this.parseLogicalAnd();
            left = { type: 'Binary', op: '||', left, right, valueType: this.inferType(left, right, '||') };
        }
        return left;
    }

    parseLogicalAnd() {
        let left = this.parseBitwiseOr();
        while (this.current().value === '&&') {
            this.pos++;
            const right = this.parseBitwiseOr();
            left = { type: 'Binary', op: '&&', left, right, valueType: this.inferType(left, right, '&&') };
        }
        return left;
    }

    parseBitwiseOr() {
        let left = this.parseBitwiseXor();
        while (this.current().value === '|') {
            this.pos++;
            const right = this.parseBitwiseXor();
            left = { type: 'Binary', op: '|', left, right, valueType: this.inferType(left, right, '|') };
        }
        return left;
    }

    parseBitwiseXor() {
        let left = this.parseBitwiseAnd();
        while (this.current().value === '^') {
            this.pos++;
            const right = this.parseBitwiseAnd();
            left = { type: 'Binary', op: '^', left, right, valueType: this.inferType(left, right, '^') };
        }
        return left;
    }

    parseBitwiseAnd() {
        let left = this.parseEquality();
        while (this.current().value === '&') {
            this.pos++;
            const right = this.parseEquality();
            left = { type: 'Binary', op: '&', left, right, valueType: this.inferType(left, right, '&') };
        }
        return left;
    }

    parseEquality() {
        let left = this.parseRelational();
        while (this.current().value === '==' || this.current().value === '!=') {
            const op = this.current().value;
            this.pos++;
            const right = this.parseRelational();
            left = { type: 'Binary', op, left, right, valueType: this.inferType(left, right, op) };
        }
        return left;
    }

    parseRelational() {
        let left = this.parseShift();
        while (['<', '>', '<=', '>='].includes(this.current().value)) {
            const op = this.current().value;
            this.pos++;
            const right = this.parseShift();
            left = { type: 'Binary', op, left, right, valueType: this.inferType(left, right, op) };
        }
        return left;
    }

    parseShift() {
        let left = this.parseAdditive();
        while (this.current().value === '<<' || this.current().value === '>>') {
            const op = this.current().value;
            this.pos++;
            const right = this.parseAdditive();
            left = { type: 'Binary', op, left, right, valueType: this.inferType(left, right, op) };
        }
        return left;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.current().value === '+' || this.current().value === '-') {
            const op = this.current().value;
            this.pos++;
            const right = this.parseMultiplicative();
            left = { type: 'Binary', op, left, right, valueType: this.inferType(left, right, op) };
        }
        return left;
    }

    parseMultiplicative() {
        let left = this.parseUnary();
        while (['*', '/', '%'].includes(this.current().value)) {
            const op = this.current().value;
            this.pos++;
            const right = this.parseUnary();
            left = { type: 'Binary', op, left, right, valueType: this.inferType(left, right, op) };
        }
        return left;
    }

    parseUnary() {
        if (this.current().value === 'new') {
            this.pos++;
            const type = this.current().value;
            this.pos++;
            let isArray = false;
            let sizeExpr = null;
            if (this.current().value === '[') {
                isArray = true;
                this.pos++;
                sizeExpr = this.parseExpression();
                if (this.current().value !== ']') throw new Error(`Expected ], got ${this.current().value}`);
                this.pos++;
            }
            return { type: 'New', valueType: type, isArray, sizeExpr };
        }
        if (this.current().value === 'delete') {
            this.pos++;
            let isArray = false;
            if (this.current().value === '[') {
                isArray = true;
                this.pos++;
                if (this.current().value !== ']') throw new Error(`Expected ], got ${this.current().value}`);
                this.pos++;
            }
            const operand = this.parseUnary();
            return { type: 'Delete', isArray, operand };
        }
        if (this.current().value === '(') {
            let nextIdx = this.pos + 1;
            if (this.tokens[nextIdx] && (this.isType(this.tokens[nextIdx].value) || this.tokens[nextIdx].type === 'IDENT')) {
                let typeEndIdx = nextIdx + 1;
                let targetType = this.tokens[nextIdx].value;
                if (this.tokens[typeEndIdx] && this.tokens[typeEndIdx].value === '*') {
                    targetType += '*';
                    typeEndIdx++;
                }
                if (this.tokens[typeEndIdx] && this.tokens[typeEndIdx].value === ')') {
                    this.pos++; // consume '('
                    this.pos++; // consume type
                    if (this.current().value === '*') this.pos++; // consume '*'
                    this.pos++; // consume ')'
                    const expr = this.parseUnary();
                    return { type: 'Cast', targetType, expr };
                }
            }
        }
        if (this.current().value === '&') {
            this.pos++;
            const right = this.parseUnary();
            return { type: 'AddressOf', operand: right };
        }
        if (this.current().value === '*') {
            this.pos++;
            const right = this.parseUnary();
            return { type: 'Dereference', operand: right };
        }
        if (['-', '!', '~'].includes(this.current().value)) {
            const op = this.current().value;
            this.pos++;
            const right = this.parseUnary();
            let valueType = right?.valueType || 'int32';
            return { type: 'Unary', op, right, valueType };
        }
        if (this.current().value === '++') {
            this.pos++;
            const right = this.parseUnary();
            return { type: 'Prefix', op: '++', operand: right };
        }
        if (this.current().value === '--') {
            this.pos++;
            const right = this.parseUnary();
            return { type: 'Prefix', op: '--', operand: right };
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let expr = this.parsePrimary();
        while (true) {
            if (this.current().value === '[') {
                this.pos++;
                const index = this.parseExpression();
                if (this.current().value !== ']') throw new Error(`Expected ], got ${this.current().value}`);
                this.pos++;
                expr = { type: 'ArrayIndex', object: expr, index };
            } else if (this.current().value === '.') {
                this.pos++;
                const member = this.current().value;
                this.pos++;
                expr = { type: 'MemberAccess', object: expr, member, isPointer: false };
            } else if (this.current().value === '->') {
                this.pos++;
                const member = this.current().value;
                this.pos++;
                expr = { type: 'MemberAccess', object: expr, member, isPointer: true };
            } else if (this.current().value === '(') {
                this.pos++;
                const args = [];
                while (this.current().value !== ')') {
                    if (args.length > 0) {
                        if (this.current().value !== ',') throw new Error(`Expected ,, got ${this.current().value}`);
                        this.pos++;
                    }
                    args.push(this.parseExpression());
                }
                this.pos++; // consume ')'
                
                if (expr.type === 'MemberAccess') {
                    expr = { type: 'MethodCall', object: expr.object, member: expr.member, isPointer: expr.isPointer, args };
                } else {
                    expr = { type: 'Call', name: 'unknown', args }; // Function pointer call fallback
                }
            } else if (this.current().value === '++') {
                this.pos++;
                expr = { type: 'Postfix', op: '++', operand: expr };
            } else if (this.current().value === '--') {
                this.pos++;
                expr = { type: 'Postfix', op: '--', operand: expr };
            } else {
                break;
            }
        }
        return expr;
    }

    parsePrimary() {
        const token = this.current();
        if (token.value === 'sizeof') {
            this.pos++; // consume 'sizeof'
            if (this.current().value !== '<') throw new Error(`Expected <, got ${this.current().value}`);
            this.pos++;
            const type = this.current().value;
            this.pos++;
            let isPointer = false;
            if (this.current().value === '*') {
                isPointer = true;
                this.pos++;
            }
            if (this.current().value !== '>') throw new Error(`Expected >, got ${this.current().value}`);
            this.pos++;
            const sizes = { 'int8': 1, 'uint8': 1, 'char': 1, 'bool': 1, 'int16': 2, 'uint16': 2, 'int32': 4, 'uint32': 4, 'float32': 4, 'int64': 8, 'uint64': 8, 'float64': 8 };
            const size = isPointer ? 4 : (sizes[type] || 4);
            return { type: 'Literal', valueType: 'int32', value: size };
        }
        if (token.value === 'cast') {
            this.pos++; // consume 'cast'
            if (this.current().value !== '<') throw new Error(`Expected <, got ${this.current().value}`);
            this.pos++;
            const targetType = this.current().value;
            this.pos++;
            if (this.current().value !== '>') throw new Error(`Expected >, got ${this.current().value}`);
            this.pos++;
            if (this.current().value !== '(') throw new Error(`Expected (, got ${this.current().value}`);
            this.pos++;
            const expr = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            return { type: 'Cast', targetType, expr };
        }
        if (token.value === 'null') {
            this.pos++;
            return { type: 'Literal', valueType: 'int32', value: 0 };
        }
        if (token.type === 'NUMBER' || token.type === 'FLOAT' || token.type === 'FLOAT32') {
            this.pos++;
            return { type: 'Literal', valueType: token.type === 'FLOAT32' ? 'float32' : (token.type === 'FLOAT' ? 'float64' : 'int32'), value: token.value };
        }
        if (token.type === 'STRING') {
            this.pos++;
            return { type: 'Literal', valueType: 'string', value: token.value };
        }
        if (token.type === 'KEYWORD' && (token.value === 'true' || token.value === 'false')) {
            this.pos++;
            return { type: 'Literal', valueType: 'bool', value: token.value === 'true' };
        }
        if (token.type === 'IDENT' || (token.type === 'KEYWORD' && this.isType(token.value))) {
            const name = this.current().value;
            this.pos++;
            if (this.current().value === '(') {
                this.pos++;
                const args = [];
                while (this.current().value !== ')') {
                    if (args.length > 0) {
                        if (this.current().value !== ',') throw new Error(`Expected ,, got ${this.current().value}`);
                        this.pos++;
                    }
                    args.push(this.parseExpression());
                }
                this.pos++; // consume ')'
                return { type: 'Call', name, args };
            }
            if (this.current().value === '::') {
                this.pos++;
                const methodToken = this.current();
                this.pos++;
                if (this.current().value === '(') {
                    this.pos++;
                    const args = [];
                    while (this.current().value !== ')') {
                        if (args.length > 0) {
                            if (this.current().value !== ',') throw new Error(`Expected ,, got ${this.current().value}`);
                            this.pos++;
                        }
                        args.push(this.parseExpression());
                    }
                    this.pos++; // consume ')'
                    return { type: 'Call', name: `${name}::${methodToken.value}`, args };
                }
            }
            return { type: 'Identifier', name };
        }
        if (token.value === '(') {
            this.pos++;
            const expr = this.parseExpression();
            if (this.current().value !== ')') throw new Error(`Expected ), got ${this.current().value}`);
            this.pos++;
            return expr;
        }
        throw new Error(`Unexpected primary token: ${token.value} at pos ${this.pos}`);
    }
}