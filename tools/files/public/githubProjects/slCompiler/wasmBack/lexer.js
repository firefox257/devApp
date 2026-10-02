// lexer.js
export class Lexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.tokens = [];
    }

    tokenize() {
        while (this.pos < this.source.length) {
            this.skipWhitespace();
            if (this.pos >= this.source.length) break;

            const char = this.source[this.pos];
            if (this.isAlpha(char) || char === '_') {
                this.tokens.push(this.readIdentifier());
            } else if (this.isDigit(char)) {
                this.tokens.push(this.readNumber());
            } else if (char === "'" || char === '"') {
                this.tokens.push(this.readString());
            } else if (this.isOperator(char)) {
                this.tokens.push(this.readOperator());
            } else if (char === ';' || char === '{' || char === '}' || char === '(' || char === ')' || char === ',' || char === '[' || char === ']' || char === '<' || char === '>') {
                this.tokens.push({ type: 'PUNCT', value: char });
                this.pos++;
            } else {
                throw new Error(`Unknown character: ${char} at position ${this.pos}`);
            }
        }
        this.tokens.push({ type: 'EOF', value: '' });
        return this.tokens;
    }

    skipWhitespace() {
        while (this.pos < this.source.length) {
            const c = this.source[this.pos];
            if (/\s/.test(c)) {
                this.pos++;
            } else if (c === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '/') {
                while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.pos++;
            } else if (c === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '*') {
                this.pos += 2;
                while (this.pos + 1 < this.source.length && !(this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')) {
                    this.pos++;
                }
                if (this.pos + 1 < this.source.length) this.pos += 2;
                else this.pos = this.source.length;
            } else {
                break;
            }
        }
    }

    isAlpha(c) { return /[a-zA-Z]/.test(c); }
    isDigit(c) { return /[0-9]/.test(c); }
    isOperator(c) { return /[+\-*/=<>!&|^~%?:.]/.test(c); }

    readIdentifier() {
        let start = this.pos;
        while (this.pos < this.source.length && (this.isAlpha(this.source[this.pos]) || this.isDigit(this.source[this.pos]) || this.source[this.pos] === '_')) {
            this.pos++;
        }
        const value = this.source.slice(start, this.pos);
        const keywords = ['int32', 'int8', 'int16', 'int64', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64', 'void', 'return', 'if', 'else', 'while', 'for', 'true', 'false', 'const', 'char', 'bool', 'class', 'public', 'private', 'protected', 'struct', 'enum', 'sizeof', 'alignof', 'cast', 'null', 'assert', 'try', 'catch', 'throw', 'virtual', 'inline', 'volatile', 'export', 'template', 'typedef', 'union', 'namespace', 'break', 'continue', 'static', 'new', 'delete'];
        return { type: keywords.includes(value) ? 'KEYWORD' : 'IDENT', value };
    }

    readNumber() {
        let start = this.pos;
        let isFloat = false, isHex = false, isBin = false, isOctal = false;

        if (this.source[this.pos] === '0' && this.pos + 1 < this.source.length) {
            const next = this.source[this.pos + 1];
            if (next === 'x' || next === 'X') {
                isHex = true; this.pos += 2;
                while (this.pos < this.source.length && /[0-9a-fA-F]/.test(this.source[this.pos])) this.pos++;
            } else if (next === 'b' || next === 'B') {
                isBin = true; this.pos += 2;
                while (this.pos < this.source.length && /[01]/.test(this.source[this.pos])) this.pos++;
            } else if (next >= '0' && next <= '7') {
                isOctal = true; this.pos++;
                while (this.pos < this.source.length && /[0-7]/.test(this.source[this.pos])) this.pos++;
            }
        }

        if (!isHex && !isBin && !isOctal) {
            while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) this.pos++;
            if (this.source[this.pos] === '.') {
                isFloat = true; this.pos++;
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) this.pos++;
            }
            if (this.source[this.pos] === 'e' || this.source[this.pos] === 'E') {
                isFloat = true; this.pos++;
                if (this.source[this.pos] === '+' || this.source[this.pos] === '-') this.pos++;
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) this.pos++;
            }
        }

        const valueStr = this.source.slice(start, this.pos);
        let type = 'NUMBER', value;

        if (isHex) value = parseInt(valueStr, 16);
        else if (isBin) value = parseInt(valueStr.slice(2), 2);
        else if (isOctal) value = parseInt(valueStr, 8);
        else if (isFloat) value = parseFloat(valueStr);
        else value = parseInt(valueStr, 10);

        if (this.source[this.pos] === 'f' || this.source[this.pos] === 'F') {
            this.pos++; type = 'FLOAT32';
        } else if (this.source[this.pos] === 'u' || this.source[this.pos] === 'U') {
            this.pos++; type = 'NUMBER_U';
        } else if (this.source[this.pos] === 'l' || this.source[this.pos] === 'L') {
            this.pos++;
            if (this.source[this.pos] === 'l' || this.source[this.pos] === 'L') this.pos++;
            type = 'NUMBER_64';
        } else {
            type = isFloat ? 'FLOAT' : 'NUMBER';
        }

        return { type, value };
    }

    readString() {
        const quote = this.source[this.pos];
        this.pos++;
        let value = '';
        while (this.pos < this.source.length) {
            const char = this.source[this.pos];
            if (char === quote) {
                this.pos++;
                break;
            }
            if (char === '\\') {
                this.pos++;
                const next = this.source[this.pos];
                if (next === 'n') value += '\n';
                else if (next === 't') value += '\t';
                else if (next === 'r') value += '\r';
                else if (next === '\\') value += '\\';
                else if (next === "'") value += "'";
                else if (next === '"') value += '"';
                else if (next === '0') value += '\0';
                else if (next === 'b') value += '\b';
                else if (next === 'f') value += '\f';
                else if (next === 'a') value += '\a';
                else if (next === 'v') value += '\v';
                else if (next === 'x') {
                    const hex = this.source.slice(this.pos + 1, this.pos + 3);
                    value += String.fromCharCode(parseInt(hex, 16));
                    this.pos += 2;
                } else {
                    value += next;
                }
                this.pos++;
            } else {
                value += char;
                this.pos++;
            }
        }
        return { type: 'STRING', value };
    }

    readOperator() {
        const threeCharOps = ['<<=', '>>=', '->*'];
        const twoCharOps = ['++', '--', '::', '->', '.*', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];
        
        if (this.pos + 2 < this.source.length) {
            const op3 = this.source.slice(this.pos, this.pos + 3);
            if (threeCharOps.includes(op3)) { this.pos += 3; return { type: 'OPERATOR', value: op3 }; }
        }
        if (this.pos + 1 < this.source.length) {
            const op2 = this.source.slice(this.pos, this.pos + 2);
            if (twoCharOps.includes(op2)) { this.pos += 2; return { type: 'OPERATOR', value: op2 }; }
        }
        const char = this.source[this.pos];
        if (this.isOperator(char)) { this.pos++; return { type: 'OPERATOR', value: char }; }
        throw new Error(`Unknown operator at position ${this.pos}`);
    }
}