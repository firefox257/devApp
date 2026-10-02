// parser.js
export function parse(tokens) {
    let current = 0;
    const peek = (offset = 0) => tokens[current + offset];
    const consume = () => tokens[current++];
    
    const match = (type, value) => {
        const token = peek();
        if (!token) return false;
        if (value !== undefined) {
            return token.type === type && token.value === value;
        }
        return token.type === type;
    };

    const expect = (type, value) => {
        const token = consume();
        if (!token || (type && token.type !== type) || (value && token.value !== value)) {
            throw new Error(`Expected ${type || value}, got ${token ? token.value : 'EOF'}`);
        }
        return token;
    };

    // Helper to resolve C-style ambiguity between expression statements and custom type variable declarations
    function isVarDeclAhead() {
        if (!match('IDENTIFIER')) return false;
        let offset = 1;
        let t1 = peek(offset);
        
        // Skip pointer asterisks
        while (t1 && t1.type === 'OPERATOR' && t1.value === '*') {
            offset++;
            t1 = peek(offset);
        }
        
        // If the next token is an IDENTIFIER (the variable name), check what follows it
        if (t1 && t1.type === 'IDENTIFIER') {
            let t2 = peek(offset + 1);
            if (t2 && (t2.value === '=' || t2.value === ';' || t2.value === ',')) {
                return true;
            } else if (t2 && t2.type === 'OPERATOR' && t2.value === '[') {
                return true; // Array declaration
            }
        }
        return false;
    }

    function parseProgram() {
        const items = [];
        while (current < tokens.length) {
            if (match('KEYWORD', 'enum')) items.push(parseEnum());
            else if (match('KEYWORD', 'class')) items.push(parseClassOrStruct(false));
            else if (match('KEYWORD', 'struct')) items.push(parseClassOrStruct(true));
            else if (match('KEYWORD', 'typedef')) items.push(parseTypedef());
            else items.push(parseFunction());
        }
        return { type: 'Program', items };
    }

    function parseEnum() {
        consume(); // 'enum'
        let isClass = false;
        if (match('KEYWORD', 'class')) {
            isClass = true;
            consume();
        }
        const name = expect('IDENTIFIER').value;
        let underlyingType = 'int32';
        if (match('OPERATOR', ':')) {
            consume();
            underlyingType = consume().value; 
        }
        expect('OPERATOR', '{');
        const variants = [];
        let currentVal = 0;
        while (current < tokens.length && !match('OPERATOR', '}')) {
            const vName = expect('IDENTIFIER').value;
            if (match('OPERATOR', '=')) {
                consume();
                let isNegative = false;
                if (match('OPERATOR', '-')) {
                    consume();
                    isNegative = true;
                }
                const numToken = expect('NUMBER');
                let val = parseInt(numToken.value, 10);
                if (numToken.value.toLowerCase().startsWith('0x')) {
                    val = parseInt(numToken.value, 16);
                } else if (numToken.value.toLowerCase().startsWith('0b')) {
                    val = parseInt(numToken.value, 2);
                }
                currentVal = isNegative ? -val : val;
            }
            variants.push({ name: vName, value: currentVal });
            currentVal++;
            if (match('OPERATOR', ',')) consume();
        }
        expect('OPERATOR', '}');
        expect('OPERATOR', ';');
        return { type: 'EnumDecl', name, isClass, underlyingType, variants };
    }

    function parseClassOrStruct(isStruct) {
        consume(); // 'class' or 'struct'
        const name = expect('IDENTIFIER').value;
        expect('OPERATOR', '{');
        const members = [];
        let currentAccess = isStruct ? 'public' : 'private';
        
        while (current < tokens.length && !match('OPERATOR', '}')) {
            if (match('KEYWORD', 'public') || match('KEYWORD', 'protected') || match('KEYWORD', 'private')) {
                currentAccess = consume().value;
                expect('OPERATOR', ':');
                continue;
            }
            if (match('KEYWORD')) {
                const type = consume().value;
                const mName = expect('IDENTIFIER').value;
                members.push({ type, name: mName, access: currentAccess });
                expect('OPERATOR', ';');
            } else {
                while (current < tokens.length && !match('OPERATOR', ';')) consume();
                consume(); // consume ';'
            }
        }
        expect('OPERATOR', '}');
        expect('OPERATOR', ';');
        return { type: isStruct ? 'StructDecl' : 'ClassDecl', name, members };
    }

    function parseTypedef() {
        consume(); // 'typedef'
        const existingType = consume().value; 
        const newName = expect('IDENTIFIER').value;
        expect('OPERATOR', ';');
        return { type: 'TypedefDecl', existingType, newName };
    }

    function parseFunction() {
        let returnType = 'void';
        if (match('KEYWORD')) returnType = consume().value;
        
        let name = expect('IDENTIFIER').value;
        while (match('OPERATOR', '::')) {
            consume();
            name += '::' + expect('IDENTIFIER').value;
        }
        
        expect('OPERATOR', '(');
        const params = [];
        while (!match('OPERATOR', ')')) {
            if (match('KEYWORD')) {
                let pType = consume().value;
                while (match('OPERATOR', '*')) {
                    consume();
                    pType += '*';
                }
                const pName = expect('IDENTIFIER').value;
                params.push({ type: pType, name: pName });
                if (match('OPERATOR', ',')) consume();
            } else {
                break;
            }
        }
        expect('OPERATOR', ')');
        
        let body = [];
        if (match('OPERATOR', '{')) {
            consume();
            while (current < tokens.length && !match('OPERATOR', '}')) {
                body.push(parseStatement());
            }
            expect('OPERATOR', '}');
        }
        return { type: 'Function', returnType, name, params, body };
    }

    function parseStatement() {
        if (match('KEYWORD', 'int8') || match('KEYWORD', 'int16') || match('KEYWORD', 'int32') || match('KEYWORD', 'int64') || 
            match('KEYWORD', 'uint8') || match('KEYWORD', 'uint16') || match('KEYWORD', 'uint32') || match('KEYWORD', 'uint64') ||
            match('KEYWORD', 'void') || match('KEYWORD', 'bool') || match('KEYWORD', 'float32') || match('KEYWORD', 'float64') || match('KEYWORD', 'char') || isVarDeclAhead()) {
            return parseVarDecl();
        }
        if (match('KEYWORD', 'return')) return parseReturnStatement();
        if (match('KEYWORD', 'print')) return parsePrintStatement();
        if (match('KEYWORD', 'if')) return parseIfStatement();
        if (match('KEYWORD', 'while')) return parseWhileStatement();
        if (match('KEYWORD', 'for')) return parseForStatement();
        return parseExpressionStatement();
    }

    function parseVarDecl() {
        let varType = consume().value;
        while (match('OPERATOR', '*')) {
            consume();
            varType += '*';
        }
        const name = expect('IDENTIFIER').value;
        
        let isArray = false;
        let arraySize = null;
        if (match('OPERATOR', '[')) {
            consume();
            if (!match('OPERATOR', ']')) {
                arraySize = parseExpression();
            }
            expect('OPERATOR', ']');
            isArray = true;
        }

        let initializer = null;
        if (match('OPERATOR', '=')) {
            consume();
            initializer = parseExpression();
        }
        expect('OPERATOR', ';');
        return { type: 'VarDecl', varType, name, isArray, arraySize, initializer };
    }

    function parseReturnStatement() {
        consume();
        const expr = parseExpression();
        expect('OPERATOR', ';');
        return { type: 'ReturnStatement', expression: expr };
    }

    function parsePrintStatement() {
        consume();
        expect('OPERATOR', '(');
        const expr = parseExpression();
        expect('OPERATOR', ')');
        expect('OPERATOR', ';');
        return { type: 'PrintStatement', expression: expr };
    }

    function parseIfStatement() {
        consume();
        expect('OPERATOR', '(');
        const condition = parseExpression();
        expect('OPERATOR', ')');
        expect('OPERATOR', '{');
        const thenBlock = [];
        while (current < tokens.length && !match('OPERATOR', '}')) {
            thenBlock.push(parseStatement());
        }
        expect('OPERATOR', '}');
        let elseBlock = null;
        if (match('KEYWORD', 'else')) {
            consume();
            if (match('KEYWORD', 'if')) {
                elseBlock = [parseIfStatement()];
            } else {
                expect('OPERATOR', '{');
                elseBlock = [];
                while (current < tokens.length && !match('OPERATOR', '}')) {
                    elseBlock.push(parseStatement());
                }
                expect('OPERATOR', '}');
            }
        }
        return { type: 'IfStatement', condition, thenBlock, elseBlock };
    }

    function parseWhileStatement() {
        consume();
        expect('OPERATOR', '(');
        const condition = parseExpression();
        expect('OPERATOR', ')');
        expect('OPERATOR', '{');
        const body = [];
        while (current < tokens.length && !match('OPERATOR', '}')) {
            body.push(parseStatement());
        }
        expect('OPERATOR', '}');
        return { type: 'WhileStatement', condition, body };
    }

    function parseForStatement() {
        consume();
        expect('OPERATOR', '(');
        let init = null;
        if (!match('OPERATOR', ';')) {
            if (match('KEYWORD') || isVarDeclAhead()) {
                let varType = consume().value;
                while (match('OPERATOR', '*')) {
                    consume();
                    varType += '*';
                }
                const name = expect('IDENTIFIER').value;
                let initializer = null;
                if (match('OPERATOR', '=')) {
                    consume();
                    initializer = parseExpression();
                }
                init = { type: 'VarDecl', varType, name, isArray: false, arraySize: null, initializer };
            } else {
                init = parseExpression();
            }
        }
        expect('OPERATOR', ';');
        
        let condition = null;
        if (!match('OPERATOR', ';')) {
            condition = parseExpression();
        }
        expect('OPERATOR', ';');
        
        let update = null;
        if (!match('OPERATOR', ')')) {
            update = parseExpression();
        }
        expect('OPERATOR', ')');
        
        expect('OPERATOR', '{');
        const body = [];
        while (current < tokens.length && !match('OPERATOR', '}')) {
            body.push(parseStatement());
        }
        expect('OPERATOR', '}');
        return { type: 'ForStatement', init, condition, update, body };
    }

    function parseExpressionStatement() {
        const expr = parseExpression();
        expect('OPERATOR', ';');
        return { type: 'ExpressionStatement', expression: expr };
    }

    function parseExpression() { return parseAssignment(); }

    function parseAssignment() {
        const left = parseLogicalOr();
        if (match('OPERATOR', '=') || match('OPERATOR', '+=') || match('OPERATOR', '-=') || 
            match('OPERATOR', '*=') || match('OPERATOR', '/=') || match('OPERATOR', '%=') ||
            match('OPERATOR', '&=') || match('OPERATOR', '|=') || match('OPERATOR', '^=') ||
            match('OPERATOR', '<<=') || match('OPERATOR', '>>=')) {
            const op = consume().value;
            if (left.type !== 'Identifier' && left.type !== 'ArrayAccess' && left.type !== 'MemberAccess' && left.type !== 'PointerMemberAccess' && !(left.type === 'UnaryExpression' && left.operator === '*')) {
                throw new Error("Invalid assignment target");
            }
            const right = parseAssignment();
            return { type: 'Assignment', operator: op, target: left, value: right };
        }
        return left;
    }

    function parseLogicalOr() {
        let left = parseLogicalAnd();
        while (match('OPERATOR', '||')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseLogicalAnd() };
        }
        return left;
    }

    function parseLogicalAnd() {
        let left = parseBitwiseOr();
        while (match('OPERATOR', '&&')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseBitwiseOr() };
        }
        return left;
    }

    function parseBitwiseOr() {
        let left = parseBitwiseXor();
        while (match('OPERATOR', '|')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseBitwiseXor() };
        }
        return left;
    }

    function parseBitwiseXor() {
        let left = parseBitwiseAnd();
        while (match('OPERATOR', '^')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseBitwiseAnd() };
        }
        return left;
    }

    function parseBitwiseAnd() {
        let left = parseEquality();
        while (match('OPERATOR', '&')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseEquality() };
        }
        return left;
    }

    function parseEquality() {
        let left = parseRelational();
        while (match('OPERATOR', '==') || match('OPERATOR', '!=')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseRelational() };
        }
        return left;
    }

    function parseRelational() {
        let left = parseShift();
        while (match('OPERATOR', '<') || match('OPERATOR', '>') || match('OPERATOR', '<=') || match('OPERATOR', '>=')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseShift() };
        }
        return left;
    }

    function parseShift() {
        let left = parseAdditive();
        while (match('OPERATOR', '<<') || match('OPERATOR', '>>')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseAdditive() };
        }
        return left;
    }

    function parseAdditive() {
        let left = parseMultiplicative();
        while (match('OPERATOR', '+') || match('OPERATOR', '-')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseMultiplicative() };
        }
        return left;
    }

    function parseMultiplicative() {
        let left = parseUnary();
        while (match('OPERATOR', '*') || match('OPERATOR', '/') || match('OPERATOR', '%')) {
            const op = consume().value;
            left = { type: 'BinaryExpression', operator: op, left, right: parseUnary() };
        }
        return left;
    }

    function parseUnary() {
        if (match('OPERATOR', '-') || match('OPERATOR', '!') || match('OPERATOR', '~') || match('OPERATOR', '+') || match('OPERATOR', '++') || match('OPERATOR', '--') || match('OPERATOR', '*') || match('OPERATOR', '&')) {
            const op = consume().value;
            return { type: 'UnaryExpression', operator: op, argument: parseCast(), isPrefix: true };
        }
        return parseCast();
    }

    function parseCast() {
        if (match('OPERATOR', '(')) {
            const savedCurrent = current;
            consume(); // '('
            if (match('KEYWORD') || match('IDENTIFIER')) {
                const typeToken = consume();
                if (match('OPERATOR', ')')) {
                    consume(); // ')'
                    const expr = parseCast(); 
                    return { type: 'CastExpression', targetType: typeToken.value, expression: expr };
                }
            }
            current = savedCurrent; 
        }
        return parsePostfix();
    }

    function parsePostfix() {
        let expr = parsePrimary();
        while (match('OPERATOR', '++') || match('OPERATOR', '--')) {
            const op = consume().value;
            expr = { type: 'UnaryExpression', operator: op, argument: expr, isPrefix: false };
        }
        while (match('OPERATOR', '[') || match('OPERATOR', '.') || match('OPERATOR', '->')) {
            if (match('OPERATOR', '[')) {
                consume();
                const index = parseExpression();
                expect('OPERATOR', ']');
                expr = { type: 'ArrayAccess', array: expr, index: index };
            } else if (match('OPERATOR', '.')) {
                consume();
                const member = expect('IDENTIFIER').value;
                expr = { type: 'MemberAccess', object: expr, member: member };
            } else if (match('OPERATOR', '->')) {
                consume();
                const member = expect('IDENTIFIER').value;
                expr = { type: 'PointerMemberAccess', object: expr, member: member };
            }
        }
        return expr;
    }

    function parsePrimary() {
        if (match('KEYWORD', 'sizeof')) {
            consume();
            expect('OPERATOR', '(');
            let targetType = null;
            let targetExpr = null;
            if (match('KEYWORD') || match('IDENTIFIER')) {
                targetType = consume().value;
            } else {
                targetExpr = parseExpression();
            }
            expect('OPERATOR', ')');
            return { type: 'SizeofExpression', targetType, targetExpr };
        }

        if (match('KEYWORD', 'new')) {
            consume();
            let typeName = consume().value;
            while (match('OPERATOR', '*')) {
                consume();
                typeName += '*';
            }
            let isArray = false;
            let arraySize = null;
            if (match('OPERATOR', '[')) {
                consume();
                arraySize = parseExpression();
                expect('OPERATOR', ']');
                isArray = true;
            }
            return { type: 'NewExpression', typeName, isArray, arraySize };
        }

        if (match('KEYWORD', 'delete')) {
            consume();
            let isArray = false;
            if (match('OPERATOR', '[')) {
                consume();
                expect('OPERATOR', ']');
                isArray = true;
            }
            const target = parseUnary();
            return { type: 'DeleteExpression', target, isArray };
        }

        if (match('NUMBER')) {
            const val = consume().value;
            if (val.includes('.') || val.toLowerCase().includes('e')) {
                return { type: 'FloatLiteral', value: parseFloat(val) };
            }
            if (val.startsWith('0x') || val.startsWith('0X')) return { type: 'NumberLiteral', value: parseInt(val, 16) };
            if (val.startsWith('0b') || val.startsWith('0B')) return { type: 'NumberLiteral', value: parseInt(val, 2) };
            return { type: 'NumberLiteral', value: parseInt(val, 10) };
        }
        if (match('STRING_LITERAL')) {
            const val = consume().value;
            return { type: 'StringLiteral', value: val.slice(1, -1) };
        }
        if (match('KEYWORD', 'true')) { consume(); return { type: 'BoolLiteral', value: true }; }
        if (match('KEYWORD', 'false')) { consume(); return { type: 'BoolLiteral', value: false }; }
        
        if (match('IDENTIFIER')) {
            let name = consume().value;
            while (match('OPERATOR', '::')) {
                consume();
                const nextName = expect('IDENTIFIER').value;
                name += '::' + nextName;
            }
            
            if (match('OPERATOR', '(')) {
                consume();
                const args = [];
                while (!match('OPERATOR', ')')) {
                    args.push(parseExpression());
                    if (match('OPERATOR', ',')) consume();
                }
                expect('OPERATOR', ')');
                return { type: 'CallExpression', callee: name, arguments: args };
            }
            return { type: 'Identifier', name };
        }
        if (match('OPERATOR', '(')) {
            consume();
            const expr = parseExpression();
            expect('OPERATOR', ')');
            return expr;
        }
        throw new Error(`Unexpected token in expression: ${peek() ? peek().value : 'EOF'}`);
    }

    return parseProgram();
}