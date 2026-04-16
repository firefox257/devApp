// topsCompiler.js
/**
* Utility to cast values to unsigned integers
*/
globalThis.integerCast = {
	// Unsigned integers
	uint1: (val) => (val & 0xFF) >>> 0,               // 8-bit unsigned (0 to 255)
	uint2: (val) => (val & 0xFFFF) >>> 0,             // 16-bit unsigned (0 to 65535)
	uint4: (val) => val >>> 0,                        // 32-bit unsigned (0 to 4294967295)
	// Signed integers
	int1: (val) => {
		const masked = val & 0xFF;
		return (masked << 24) >> 24;                    // sign-extend from 8 bits
	},
	int2: (val) => {
		const masked = val & 0xFFFF;
		return (masked << 16) >> 16;                    // sign-extend from 16 bits
	},
	int4: (val) => val | 0,                           // 32-bit signed (-2147483648 to 2147295)
	// 64-bit unsigned (as BigInt)
	uint8: (val) => {
		return BigUint64Array.from([BigInt(val)])[0];
	},
	// Optional: 64-bit signed (as BigInt)
	int8: (val) => {
		return BigInt64Array.from([BigInt(val)])[0];
	}
};
const TYPE_MAP = {
	bool:   0x7f,   // i32
	int1:   0x7f,   // i32
	int2:   0x7f,   // i32
	int4:   0x7f,   // i32
	int8:   0x7e,   // i64
	uint1:  0x7f,
	uint2:  0x7f,
	uint4:  0x7f,
	uint8:  0x7e,   // i64
	char:   0x7f,   // i32
	float4: 0x7d,   // f32
	float8: 0x7c,   // f64
	void:   0x40,   // empty type for functions returning nothing explicitly
};
// NEW: sizeof logical sizes in bytes
const SIZEOF_MAP = {
	bool:   1,
	char:   1,
	int1:   1,
	uint1:  1,
	int2:   2,
	uint2:  2,
	int4:   4,
	uint4:  4,
	float4: 4,
	int8:   8,
	uint8:  8,
	float8: 8,
};
// ✅ FIX 1: Convert a string like "1.5" or "-2.0" to i32 bits (for f32)
// Use DataView with explicit little-endian byte ordering
function floatLiteralToBits(str) {
	const val = parseFloat(str);
	if (isNaN(val)) {
		throw new Error(`Invalid float literal: ${str}`);
	}
	const buffer = new ArrayBuffer(4);
	const view = new DataView(buffer);
	view.setFloat32(0, val, true);   // little-endian write
	return view.getInt32(0, true);   // little-endian read
}
/**
* Tokenizes source code into an array of tokens
* @param {string} source - The source code string to tokenize
* @returns {string[]} Array of tokens
*/
class TopsTokenizer {
	static tokenize(source) {
		// Remove single-line comments
		source = source.replace(/\/\/.*/g, '');
		const tokens = [];
		let currentToken = '';
		let i = 0;
		while (i < source.length) {
			const char = source[i];
			// --- STRING LITERALS WITH @ PREFIX: @"hello" ---
			if (char === '@' && i + 1 < source.length && source[i + 1] === '"') {
				if (currentToken) {
					tokens.push(currentToken);
					currentToken = '';
				}
				let str = '@"';
				i += 2; // skip '@"'
				while (i < source.length && source[i] !== '"') {
					let ch = source[i];
					if (ch === '\\') {
						i++;
						if (i >= source.length) throw new Error(`Unterminated escape in string`);
						const esc = source[i];
						switch (esc) {
						case 'n': ch = '\n'; break;
						case 't': ch = '\t'; break;
						case 'r': ch = '\r'; break;
						case '\\': ch = '\\'; break;
						case '"': ch = '"'; break;
						case '0': ch = '\0'; break;
						default: ch = esc;
						}
						}
						str += ch;
						i++;
						}
						if (i >= source.length || source[i] !== '"') {
						throw new Error(`Expected closing " in @"...`);
						}
						str += '"';
						tokens.push(str);
						i++; // consume the closing quote
						continue;
						}
						// --- CHARACTER LITERALS ---
						if (char === "'") {
						if (currentToken) {
						tokens.push(currentToken);
						currentToken = '';
						}
						let charLiteral = char;
						i++;
						if (i >= source.length) {
						throw new Error(
						`Syntax Error: Unexpected end of source after opening quote at position ${i - 1}`
						);
						}
						let charContent = source[i];
						i++;
						if (charContent === '\\') {
						if (i >= source.length) {
						throw new Error(
						`Syntax Error: Unexpected end of source after backslash in character literal at position ${i - 1}`
						);
						}
						const escapedChar = source[i];
						i++;
						switch (escapedChar) {
						case 'n': charContent = '\n'; break;
						case 't': charContent = '\t'; break;
						case '\\': charContent = '\\'; break;
						case "'": charContent = "'"; break;
						case '0': charContent = '\0'; break;
						case 'r': charContent = '\r'; break;
						default: charContent = escapedChar;
						}
						}
						if (i >= source.length || source[i] !== "'") {
						throw new Error(
						`Syntax Error: Expected closing single quote for character literal at position ${i}`
						);
						}
						i++;
						charLiteral += charContent + "'";
						tokens.push(charLiteral);
						continue;
						}
						// --- HANDLE NEGATIVE NUMERIC LITERALS: -45.7, -123, -0.5, -1e3 ---
						if (char === '-' && i + 1 < source.length) {
						const nextChar = source[i + 1];
						if (/\d/.test(nextChar) || nextChar === '.') {
						let numStr = '-';
						i++; // consume '-'
						// Integer part
						while (i < source.length && /\d/.test(source[i])) {
						numStr += source[i];
						i++;
						}
						// Fractional part
						if (i < source.length && source[i] === '.') {
						numStr += '.';
						i++;
						while (i < source.length && /\d/.test(source[i])) {
						numStr += source[i];
						i++;
						}
						}
						// Exponent (optional): e.g., -1.2e5, -3E-4
						if (i + 1 < source.length && (source[i] === 'e' || source[i] === 'E')) {
						numStr += source[i];
						i++;
						if (i < source.length && (source[i] === '+' || source[i] === '-')) {
						numStr += source[i];
						i++;
						}
						while (i < source.length && /\d/.test(source[i])) {
						numStr += source[i];
						i++;
						}
						}
						tokens.push(numStr);
						continue;
						}
						}
						if (/\s/.test(char)) {
						if (currentToken) {
						tokens.push(currentToken);
						currentToken = '';
						}
						i++;
						continue;
						}
						// Special handling for '@' symbol to ensure proper separation
						if (char === '@') {
						if (currentToken) {
						tokens.push(currentToken);
						currentToken = '';
						}
						tokens.push('@');
						i++;
						continue;
						}
						currentToken += char;
						i++;
						const nextTwoChars = source.substr(i - 1, 2);
						// ✅ UPDATED: Added compound assignment operators
						const twoCharOps = ['<=', '>=', '==', '!=', '->', '&&', '||', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='];
						if (twoCharOps.includes(nextTwoChars)) {
						currentToken = nextTwoChars;
						i++;
						}
						const nextChar = i < source.length ? source[i] : null;
						// ✅ FIX: Added compound assignment operators to currentTokenIsOp array
						const currentTokenIsOp = [
						'<=', '>=', '==', '!=', '->', '&&', '||', '<<', '>>',
						'+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=',  // ← ADDED THESE
						'+', '-', '*', '/', '<', '>', '|', '&', '^', '%',
						'{', '}', '(', ')', '[', ']', ',', ';', '=', '.', '!', '~', '?', '@'
						].includes(currentToken);
						if (currentTokenIsOp) {
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						// Handle binary literals: 0b1010
						if (currentToken === '0' && nextChar === 'b') {
						currentToken += source[i];
						i++;
						while (i < source.length && /[01]/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						// Handle hexadecimal literals: 0x123abc, 0XFF, etc.
						if (currentToken === '0' && nextChar && (nextChar === 'x' || nextChar === 'X')) {
						currentToken += source[i];
						i++;
						while (i < source.length && /[0-9a-fA-F]/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						if (currentToken.length <= 2) {
						throw new Error(`Syntax Error: Invalid hexadecimal literal at position ${i - 2}`);
						}
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						if (/\d/.test(currentToken) || (currentToken === '.' && /\d/.test(nextChar))) {
						let isFloat = currentToken === '.';
						while (i < source.length && /\d/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						if (!isFloat && i < source.length && source[i] === '.') {
						isFloat = true;
						currentToken += '.';
						i++;
						while (i < source.length && /\d/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						}
						// Check for exponent
						if (!isFloat && i < source.length && (source[i] === 'e' || source[i] === 'E')) {
						isFloat = true;
						currentToken += source[i];
						i++;
						if (i < source.length && (source[i] === '+' || source[i] === '-')) {
						currentToken += source[i];
						i++;
						}
						while (i < source.length && /\d/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						}
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						if (
						currentToken &&
						/[a-zA-Z_$]/.test(currentToken[0]) &&
						(/[a-zA-Z0-9_$]/.test(nextChar) || nextChar === null)
						) {
						while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) {
						currentToken += source[i];
						i++;
						}
						if (i >= source.length || !/[a-zA-Z0-9_$]/.test(source[i])) {
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						}
						if (
						currentToken &&
						nextChar &&
						!/[a-zA-Z0-9_$.]/.test(nextChar) &&
						/[a-zA-Z_$]/.test(currentToken[0])
						) {
						tokens.push(currentToken);
						currentToken = '';
						continue;
						}
						}
						if (currentToken) {
						tokens.push(currentToken);
						}
						return tokens;
						}
						}
						class TopsParser {
						constructor(tokens, functions, typeMap, compiler = null) {
						this.tokens = tokens;
						this.pos = 0;
						this.functions = functions;
						this.typeMap = typeMap;
						this.compiler = compiler;
						this.scopeStack = [];
						this.localCount = 0;
						this.localTypes = [];
						this.controlDepth = 0;
						this.breakTargetStack = [];
						this.switchDepthStack = []; // Track active switches for break
						this.currentRetType = 'int4';
						this.lastParsedType = null;
						this.globalCount = 0;
						this.signatureRegistry = new Map();
						}
						peek() {
						return this.tokens[this.pos];
						}
						consume(expected) {
						const t = this.tokens[this.pos++];
						if (expected && t !== expected) {
						throw new Error(
						`Syntax Error: Expected "${expected}" but got "${t}" at token position ${this.pos - 1}`
						);
						}
						return t;
						}
						isType(t) {
						if (t && this.typeMap[t] !== undefined) {
						return true;
						}
						return false;
						}
						findVar(name) {
						for (let i = this.scopeStack.length - 1; i >= 0; i--) {
						if (this.scopeStack[i].has(name)) return this.scopeStack[i].get(name);
						}
						return undefined;
						}
						resolveEffectiveType(leftType, rightType) {
						const lt = leftType;
						const rt = rightType;
						if (lt.startsWith('float') || rt.startsWith('float')) {
						if (lt === 'float8' || rt === 'float8') return 'float8';
						return 'float4';
						}
						const leftIs64 = lt.includes('8');
						const rightIs64 = rt.includes('8');
						const is64 = leftIs64 || rightIs64;
						const leftIsUint = lt.startsWith('uint') || lt === 'char';
						const rightIsUint = rt.startsWith('uint') || rt === 'char';
						const isUint = leftIsUint || rightIsUint;
						if (is64) {
						return isUint ? 'uint8' : 'int8';
						} else {
						return isUint ? 'uint4' : 'int4';
						}
						}
						cast(actual, target) {
						const a = actual, t = target;
						let ops = [];
						if (a === t) return ops;
						if (this.typeMap[a] === 0x7f && this.typeMap[t] === 0x7e) {
						ops.push(a.startsWith('uint') || a === 'char' ? 0xac : 0xad);
						}
						if (this.typeMap[a] === 0x7e && this.typeMap[t] === 0x7f) {
						ops.push(0xa7);
						}
						if (a === 'float4') {
						if (t.startsWith('int') || t === 'char' || t === 'bool') {
						ops.push(0xa8);
						} else if (t.startsWith('uint')) {
						ops.push(0xa9);
						}
						}
						if (a === 'float8') {
						if (t.startsWith('int') || t === 'char' || t === 'bool') {
						ops.push(0xaa);
						} else if (t.startsWith('uint')) {
						ops.push(0xab);
						}
						}
						if (a.startsWith('int') && t === 'float4') ops.push(a.includes('8') ? 0xb4 : 0xb2);
						if (a.startsWith('int') && t === 'float8') ops.push(a.includes('8') ? 0xb8 : 0xb7);
						if (a.startsWith('uint') && t === 'float4') ops.push(a.includes('8') ? 0xb4 : 0xb2);
						if (a.startsWith('uint') && t === 'float8') ops.push(a.includes('8') ? 0xb8 : 0xb7);
						if (a === 'char' && t === 'float4') ops.push(0xb2);
						if (a === 'char' && t === 'float8') ops.push(0xb7);
						if (a === 'bool' && t === 'float4') ops.push(0xb2);
						if (a === 'bool' && t === 'float8') ops.push(0xb7);
						if (a === 'float4' && t === 'float8') ops.push(0xbb);
						if (a === 'float8' && t === 'float4') ops.push(0xb6);
						if (this.typeMap[a] === 0x7f && this.typeMap[t] === 0x7f) {
						if (a === 'int1' && (t === 'int2' || t === 'int4')) ops.push(0xc0);
						if (a === 'int2' && t === 'int4') ops.push(0xc1);
						if (t === 'uint1') ops.push(0x41, ...this.sleb(0xff), 0x71);
						if (t === 'uint2') ops.push(0x41, ...this.sleb(0xffff), 0x71);
						if (t === 'int1') ops.push(0xc0);
						if (t === 'int2') ops.push(0xc1);
						}
						if (a === 'char') {
						if (t === 'uint1') ops.push(0x41, ...this.sleb(0xff), 0x71);
						if (t === 'uint2') ops.push(0x41, ...this.sleb(0xffff), 0x71);
						if (t === 'int1') ops.push(0xc0);
						if (t === 'int2') ops.push(0xc1);
						if (this.typeMap[t] === 0x7e) ops.push(0xac);
						}
						if (t === 'bool' && (a.startsWith('int') || a.startsWith('uint') || a === 'char')) {
						ops.push(0x41, ...this.sleb(0), 0x47);
						}
						if (t === 'char' && a !== 'char' && (a.startsWith('int') || a.startsWith('uint') || a === 'bool')) {
						ops.push(0x41, ...this.sleb(0xff), 0x71);
						}
						return ops;
						}
						getBinOp(type, op) {
						const t = type;
						if (t === 'float4')
						return {
						'+': 0x92, '-': 0x93, '*': 0x94, '/': 0x95,
						'>': 0x5e, '<': 0x5d, '==': 0x5b
						}[op];
						if (t === 'float8')
						return {
						'+': 0xa0, '-': 0xa1, '*': 0xa2, '/': 0xa3,
						'>': 0x64, '<': 0x63, '==': 0x61
						}[op];
						const is64 = this.typeMap[t] === 0x7e;
						const isUnsigned = t.startsWith('uint') || t === 'char';
						const intOps = is64
						? {
						'+': 0x7c, '-': 0x7d, '*': 0x7e,
						'/': isUnsigned ? 0x80 : 0x7f,
						'%': isUnsigned ? 0x82 : 0x81,
						'>': isUnsigned ? 0x54 : 0x53,
						'<': isUnsigned ? 0x52 : 0x51,
						'==': 0x51, '&&': 0x83, '||': 0x84,
						'>>': isUnsigned ? 0x88 : 0x87,
						'<<': 0x86, '&': 0x83, '|': 0x84, '^': 0x85
						}
						: {
						'+': 0x6a, '-': 0x6b, '*': 0x6c,
						'/': isUnsigned ? 0x6e : 0x6d,
						'%': isUnsigned ? 0x70 : 0x6f,
						'>': isUnsigned ? 0x4b : 0x4a,
						'<': isUnsigned ? 0x49 : 0x48,
						'==': 0x46, '&&': 0x71, '||': 0x72,
						'>>': isUnsigned ? 0x76 : 0x75,
						'<<': 0x74, '&': 0x71, '|': 0x72, '^': 0x73
						};
						return intOps[op];
						}
						parseExpression() {
						return this.parseLogicalOr();
						}
						parseLogicalOr() {
						let ops = this.parseLogicalAnd();
						while (this.peek() === '||') {
						const op = this.consume();
						const leftOps = ops;
						const rightOps = this.parseLogicalAnd();
						this.lastParsedType = 'bool';
						ops = [...leftOps, ...rightOps, this.getBinOp('int4', op)];
						}
						return ops;
						}
						parseLogicalAnd() {
						let ops = this.parseComparison();
						while (this.peek() === '&&') {
						const op = this.consume();
						const leftOps = ops;
						const rightOps = this.parseComparison();
						this.lastParsedType = 'bool';
						ops = [...leftOps, ...rightOps, this.getBinOp('int4', op)];
						}
						return ops;
						}
						parseComparison() {
						let ops = this.parseBitwiseOr();
						const compareOps = ['>', '<', '>=', '<=', '==', '!='];
						while (compareOps.includes(this.peek())) {
						const op = this.consume();
						const leftType = this.lastParsedType;
						const rightOps = this.parseBitwiseOr();
						const rightType = this.lastParsedType;
						let effectiveType = 'int4';
						if (leftType && rightType) {
						effectiveType = this.resolveEffectiveType(leftType, rightType);
						} else if (leftType) {
						effectiveType = leftType;
						} else if (rightType) {
						effectiveType = rightType;
						}
						const castOpsForLeft = this.cast(leftType, effectiveType);
						const castOpsForRight = this.cast(rightType, effectiveType);
						let emitOps = [];
						switch (op) {
						case '==':
						emitOps = [this.getBinOp(effectiveType, '==')];
						break;
						case '!=':
						emitOps = [this.getBinOp(effectiveType, '=='), 0x45];
						break;
						case '>':
						emitOps = [this.getBinOp(effectiveType, '>')];
						break;
						case '<':
						emitOps = [this.getBinOp(effectiveType, '<')];
						break;
						case '>=':
						emitOps = [this.getBinOp(effectiveType, '<'), 0x45];
						break;
						case '<=':
						emitOps = [this.getBinOp(effectiveType, '>'), 0x45];
						break;
						default:
						throw new Error(`Unsupported comparison operator: ${op}`);
						}
						ops = [...ops, ...castOpsForLeft, ...rightOps, ...castOpsForRight, ...emitOps];
						this.lastParsedType = 'bool';
						}
						return ops;
						}
						parseBitwiseOr() {
						let ops = this.parseBitwiseXor();
						while (this.peek() === '|') {
						const op = this.consume();
						ops.push(...this.parseBitwiseXor(), this.getBinOp('int4', op));
						}
						return ops;
						}
						parseBitwiseXor() {
						let ops = this.parseBitwiseAnd();
						while (this.peek() === '^') {
						const op = this.consume();
						ops.push(...this.parseBitwiseAnd(), this.getBinOp('int4', op));
						}
						return ops;
						}
						parseBitwiseAnd() {
						let ops = this.parseShift();
						while (this.peek() === '&') {
						const op = this.consume();
						ops.push(...this.parseShift(), this.getBinOp('int4', op));
						}
						return ops;
						}
						parseShift() {
						let ops = this.parseAdditive();
						const shiftOps = ['<<', '>>'];
						while (shiftOps.includes(this.peek())) {
						const op = this.consume();
						const leftType = this.lastParsedType;
						const rightOps = this.parseAdditive();
						const rightType = this.lastParsedType;
						let effectiveType = 'int4';
						if (leftType && rightType) {
						effectiveType = this.resolveEffectiveType(leftType, rightType);
						} else if (leftType) {
						effectiveType = leftType;
						} else if (rightType) {
						effectiveType = rightType;
						}
						const castOpsForLeft = this.cast(leftType, effectiveType);
						const castOpsForRight = this.cast(rightType, 'int4');
						const opCode = this.getBinOp(effectiveType, op);
						if (opCode === undefined) {
						throw new Error(`Unsupported operation '${op}' for effective type '${effectiveType}'`);
						}
						ops = [...ops, ...castOpsForLeft, ...rightOps, ...castOpsForRight, opCode];
						this.lastParsedType = effectiveType;
						}
						return ops;
						}
						parseAdditive() {
						let ops = this.parseMultiplicative();
						const additiveOps = ['+', '-'];
						while (additiveOps.includes(this.peek())) {
						const op = this.consume();
						const leftType = this.lastParsedType;
						const rightOps = this.parseMultiplicative();
						const rightType = this.lastParsedType;
						let effectiveType = 'int4';
						if (leftType && rightType) {
						effectiveType = this.resolveEffectiveType(leftType, rightType);
						} else if (leftType) {
						effectiveType = leftType;
						} else if (rightType) {
						effectiveType = rightType;
						}
						const castOpsForLeft = this.cast(leftType, effectiveType);
						const castOpsForRight = this.cast(rightType, effectiveType);
						const opCode = this.getBinOp(effectiveType, op);
						if (opCode === undefined) {
						throw new Error(`Unsupported operation '${op}' for effective type '${effectiveType}'`);
						}
						ops = [...ops, ...castOpsForLeft, ...rightOps, ...castOpsForRight, opCode];
						this.lastParsedType = effectiveType;
						}
						return ops;
						}
						parseMultiplicative() {
						let ops = this.parseUnary();
						const multOps = ['*', '/', '%'];
						while (multOps.includes(this.peek())) {
						const op = this.consume();
						const leftType = this.lastParsedType;
						const rightOps = this.parseUnary();
						const rightType = this.lastParsedType;
						let effectiveType = 'int4';
						if (leftType && rightType) {
						effectiveType = this.resolveEffectiveType(leftType, rightType);
						} else if (leftType) {
						effectiveType = leftType;
						} else if (rightType) {
						effectiveType = rightType;
						}
						const castOpsForLeft = this.cast(leftType, effectiveType);
						const castOpsForRight = this.cast(rightType, effectiveType);
						const opCode = this.getBinOp(effectiveType, op);
						if (opCode === undefined) {
						throw new Error(`Unsupported operation '${op}' for effective type '${effectiveType}'`);
						}
						ops = [...ops, ...castOpsForLeft, ...rightOps, ...castOpsForRight, opCode];
						this.lastParsedType = effectiveType;
						}
						return ops;
						}
						parseUnary() {
						if (this.peek() === '-' || this.peek() === '!') {
						const op = this.consume();
						const operandOps = this.parseUnary();
						const operandType = this.lastParsedType;
						if (op === '-') {
						let zeroOp;
						if (this.typeMap[operandType] === 0x7e) {
						zeroOp = [0x42, ...this.uleb(0n)];
						} else {
						zeroOp = [0x41, ...this.sleb(0n)];
						}
						const subOp = this.getBinOp(operandType, '-');
						this.lastParsedType = operandType;
						return [...zeroOp, ...operandOps, subOp];
						} else if (op === '!') {
						this.lastParsedType = 'bool';
						return [...operandOps, 0x45];
						}
						}
						return this.parsePrimary();
						}
						getGlobalIdx(name) {
						if (name === '_heap_ptr' || name === 'heap_ptr') {
						return 0;
						}
						return -1;
						}
						parseTypeWithPointer() {
						let typeName = this.consume();
						let isPtr = false;
						if (this.peek() === '@') {
						this.consume('@');
						isPtr = true;
						}
						return { base: typeName, isPtr };
						}
						parsePrimary() {
						const token = this.peek();
						// sizeof(...) support
						if (token === 'sizeof') {
						this.consume('sizeof');
						this.consume('(');
						let typeName = this.consume();
						let isPointer = false;
						if (this.peek() === '@') {
						this.consume('@');
						isPointer = true;
						}
						if (!this.isType(typeName)) {
						throw new Error(`Expected valid type in sizeof(), got: ${typeName}`);
						}
						this.consume(')');
						let size;
						if (isPointer) {
						size = 4;
						} else {
						size = SIZEOF_MAP[typeName];
						if (size === undefined) {
						throw new Error(`Unsupported type in sizeof: ${typeName}`);
						}
						}
						this.lastParsedType = 'int4';
						return [0x41, ...this.sleb(size)];
						}
						// Handle dereference
						if (token === '@') {
						this.consume('@');
						const varName = this.consume();
						if (this.functions.has(varName)) {
						const funcIdx = this.functions.get(varName).idx;
						this.lastParsedType = 'int4';
						return [0x41, ...this.sleb(funcIdx)];
						}
						const varInfo = this.findVar(varName);
						if (!varInfo) {
						throw new Error(`Error: Variable '${varName}' not found in current scope`);
						}
						if (this.peek() === '=') {
						this.consume('=');
						const expr = this.parseExpression();
						const exprType = this.lastParsedType;
						const castOps = this.cast(exprType, 'int4');
						return [...expr, ...castOps, 0x21, varInfo.idx]; // local.set s
						} else {
						this.lastParsedType = 'int4';
						return [0x20, varInfo.idx]; // local.get s
						}
						}
						// >>>>>>>>>>>>>>> STRING LITERAL: @"..." <<<<<<<<<<<<<<<<<
						if (typeof token === 'string' && token.startsWith('@"')) {
						this.consume(); // consume @"..."
						let content = token.slice(2, -1); // remove @" and "
						content += '\0'; // null terminator
						if (!this.compiler) {
						throw new Error("Internal error: Parser needs compiler reference for string literals");
						}
						const addr = this.compiler.registerString(content);
						this.lastParsedType = 'int4';
						return [0x41, ...this.sleb(addr)];
						}
						if (token && token.startsWith("'") && token.endsWith("'")) {
						const charToken = this.consume();
						const charContent = charToken.substring(1, charToken.length - 1);
						this.lastParsedType = 'char';
						return [0x41, ...this.sleb(charContent.charCodeAt(0))];
						}
						if (token === 'true' || token === 'false') {
						this.consume();
						this.lastParsedType = 'bool';
						return [0x41, ...this.sleb(token === 'true' ? 1 : 0)];
						}
						if (token === '(') {
							this.consume('(');
								if (this.isType(this.peek())) {
								const castTargetType = this.consume();
								this.consume(')');
							const operandOps = this.parseUnary();
							const castOps = this.cast(this.lastParsedType, castTargetType);
							this.lastParsedType = castTargetType;
							return [...operandOps, ...castOps];
							} else {
							const expr = this.parseExpression();
							this.consume(')');
						return expr;
						}
						}
						const currentToken = this.consume();
						// POINTER INDEXING: a[expr]
						if (this.peek() === '[') {
							const varName = currentToken;
							const v = this.findVar(varName);
							if (!v || !v.isPointer) {
							throw new Error(`Error: '${varName}' is not a pointer and cannot be indexed`);
							}
							this.consume('[');
								const indexExpr = this.parseExpression();
								const indexType = this.lastParsedType;
								this.consume(']');
							const castIndex = this.cast(indexType, 'int4');
							const elemSize = SIZEOF_MAP[v.type];
							if (elemSize === undefined) {
							throw new Error(`Unsupported pointer element type: ${v.type}`);
							}
							let addrOps = [0x20, v.idx];
							if (elemSize !== 1) {
							addrOps.push(...indexExpr, ...castIndex, 0x41, ...this.sleb(elemSize), 0x6c);
							} else {
							addrOps.push(...indexExpr, ...castIndex);
							}
							addrOps.push(0x6a); // i32.add
							if (this.peek() === '=') {
							this.consume('=');
							const rhsExpr = this.parseExpression();
							const rhsType = this.lastParsedType;
							const castRhs = this.cast(rhsType, v.type);
							let storeOp;
							if (v.type === 'bool' || v.type === 'char' || v.type === 'int1' || v.type === 'uint1') {
							storeOp = [0x3a, 0x00, 0x00];
							} else if (v.type === 'int2' || v.type === 'uint2') {
							storeOp = [0x3b, 0x01, 0x00];
							} else if (v.type === 'int4' || v.type === 'uint4') {
							storeOp = [0x36, 0x02, 0x00];
							} else if (v.type === 'float4') {
							storeOp = [0x38, 0x02, 0x00];
							} else if (v.type === 'int8' || v.type === 'uint8') {
							storeOp = [0x37, 0x03, 0x00];
							} else if (v.type === 'float8') {
							storeOp = [0x39, 0x03, 0x00];
							} else {
							storeOp = [0x36, 0x02, 0x00];
							}
							const tmpIdx = this.localCount++;
							this.localTypes.push(this.typeMap[v.type]);
							const result = [
							...addrOps,
							...rhsExpr,
							...castRhs,
							0x21, tmpIdx,
							0x20, tmpIdx,
							...storeOp,
							0x20, tmpIdx
							];
							this.lastParsedType = v.type;
							return result;
							} else {
							let loadOp;
							if (v.type === 'int1' || v.type === 'uint1' || v.type === 'bool' || v.type === 'char') {
							loadOp = v.type.startsWith('uint') || v.type === 'char'
							? [0x2c, 0x00, 0x00]
							: [0x2d, 0x00, 0x00];
							} else if (v.type === 'int2' || v.type === 'uint2') {
							loadOp = v.type.startsWith('uint')
							? [0x2e, 0x01, 0x00]
							: [0x2f, 0x01, 0x00];
							} else if (v.type === 'int4' || v.type === 'uint4') {
							loadOp = [0x28, 0x02, 0x00];
							} else if (v.type === 'int8' || v.type === 'uint8') {
							loadOp = [0x29, 0x03, 0x00];
							} else if (v.type === 'float4') {
							loadOp = [0x2a, 0x02, 0x00];
							} else if (v.type === 'float8') {
							loadOp = [0x2b, 0x03, 0x00];
							} else {
							loadOp = [0x28, 0x02, 0x00];
							}
							this.lastParsedType = v.type;
							return [...addrOps, ...loadOp];
							}
							}
							// General identifier handling (non-indexed)
							if (/^[a-zA-Z_$]/.test(currentToken)) {
							const globalIdx = this.getGlobalIdx(currentToken);
							if (globalIdx >= 0) {
							this.lastParsedType = 'int4';
							return [0x23, globalIdx];
							}
							if (this.peek() === '(') {
								const v = this.findVar(currentToken);
								if (v && v.isFuncPtr) {
								this.consume('(');
									const args = [];
									const argTypes = [];
									while (this.peek() !== ')') {
								const expr = this.parseExpression();
								args.push(...expr);
								argTypes.push(this.lastParsedType);
								if (this.peek() === ',') this.consume(',');
								}
								this.consume(')');
							const sig = v.funcSig;
							if (argTypes.length !== sig.params.length) {
							throw new Error(`Argument count mismatch for function pointer call`);
							}
							const sigKey = JSON.stringify({
							params: sig.params,
							returns: sig.returns
							});
							let sigIndex = this.signatureRegistry.get(sigKey);
							if (sigIndex === undefined) {
							sigIndex = this.signatureRegistry.size;
							this.signatureRegistry.set(sigKey, sigIndex);
							}
							const loadFp = [0x20, v.idx];
							const retBase = sig.returns.endsWith('@') ? sig.returns.slice(0, -1) : sig.returns;
							this.lastParsedType = retBase;
							return [...loadFp, ...args, 0x11, ...this.uleb(sigIndex), 0x00];
							}
							const func = this.functions.get(currentToken);
							if (!func) throw new Error(`Function "${currentToken}" not found`);
							this.consume('(');
								let callOps = [];
								let argIndex = 0;
								while (this.peek() !== ')') {
							const fullParamType = func.paramTypes[argIndex];
							const isParamPointer = fullParamType.endsWith('@');
							const baseType = isParamPointer ? fullParamType.slice(0, -1) : fullParamType;
							callOps.push(...this.parseExpression());
							callOps.push(...this.cast(this.lastParsedType, baseType));
							argIndex++;
							if (this.peek() === ',') this.consume(',');
							}
							this.consume(')');
						this.lastParsedType = func.retStr;
						return [...callOps, 0x10, func.idx];
						} else {
						const v = this.findVar(currentToken);
						if (v !== undefined) {
						// ✅ FIXED: Compound assignment operators (+=, -=, *=, etc.)
						const compoundOps = ['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='];
						const nextToken = this.peek();  // ✅ Check only the next single token
						if (compoundOps.includes(nextToken)) {
						const compoundOp = this.consume();  // ✅ Consume ONE token (e.g., '+=')
						const baseOp = compoundOp.slice(0, -1);  // Extract base operator: '+=' → '+'
						const varInfo = this.findVar(currentToken);
						if (!varInfo) {
						throw new Error(`Error: Variable '${currentToken}' not found`);
						}
						// Parse RHS expression
						const rhsExpr = this.parseExpression();
						const rhsType = this.lastParsedType;
						// Determine effective type for the operation
						let effectiveType = this.resolveEffectiveType(varInfo.type, rhsType);
						// Cast operands to effective type
						const castLhs = this.cast(varInfo.type, effectiveType);
						const castRhs = this.cast(rhsType, effectiveType);
						// Get binary op code
						const binOpCode = this.getBinOp(effectiveType, baseOp);
						if (binOpCode === undefined) {
						throw new Error(`Unsupported operation '${baseOp}' for type '${effectiveType}'`);
						}
						// Cast result back to variable's type for storage
						const castResult = this.cast(effectiveType, varInfo.type);
						if (varInfo.isPointer) {
							// Pointer: load address, load value, compute, store back
							const addrOps = [0x20, varInfo.idx]; // load pointer address
							// Load current value from address
							let loadOp;
							if (varInfo.type === 'int1' || varInfo.type === 'uint1' || varInfo.type === 'bool' || varInfo.type === 'char') {
								loadOp = varInfo.type.startsWith('uint') || varInfo.type === 'char' ? [0x2c, 0x00, 0x00] : [0x2d, 0x00, 0x00];
							} else if (varInfo.type === 'int2' || varInfo.type === 'uint2') {
								loadOp = varInfo.type.startsWith('uint') ? [0x2e, 0x01, 0x00] : [0x2f, 0x01, 0x00];
							} else if (varInfo.type === 'int4' || varInfo.type === 'uint4') {
								loadOp = [0x28, 0x02, 0x00];
							} else if (varInfo.type === 'int8' || varInfo.type === 'uint8') {
								loadOp = [0x29, 0x03, 0x00];
							} else if (varInfo.type === 'float4') {
								loadOp = [0x2a, 0x02, 0x00];
							} else if (varInfo.type === 'float8') {
								loadOp = [0x2b, 0x03, 0x00];
							} else {
								loadOp = [0x28, 0x02, 0x00];
							}
							// Store op (same logic as load)
							let storeOp;
							if (varInfo.type === 'bool' || varInfo.type === 'char' || varInfo.type === 'int1' || varInfo.type === 'uint1') {
								storeOp = [0x3a, 0x00, 0x00];
							} else if (varInfo.type === 'int2' || varInfo.type === 'uint2') {
								storeOp = [0x3b, 0x01, 0x00];
							} else if (varInfo.type === 'int4' || varInfo.type === 'uint4') {
								storeOp = [0x36, 0x02, 0x00];
							} else if (varInfo.type === 'float4') {
								storeOp = [0x38, 0x02, 0x00];
							} else if (varInfo.type === 'int8' || varInfo.type === 'uint8') {
								storeOp = [0x37, 0x03, 0x00];
							} else if (varInfo.type === 'float8') {
								storeOp = [0x39, 0x03, 0x00];
							} else {
								storeOp = [0x36, 0x02, 0x00];
							}
							this.lastParsedType = varInfo.type;
							return [...addrOps, ...loadOp, ...castLhs, ...rhsExpr, ...castRhs, binOpCode, ...castResult, ...storeOp];
						} else {
							// Local variable: get, compute, set
							this.lastParsedType = varInfo.type;
							return [0x20, varInfo.idx, ...castLhs, ...rhsExpr, ...castRhs, binOpCode, ...castResult, 0x21, varInfo.idx];
						}
					}
					// ✅ END compound assignment handling
					if (this.peek() === '=') {
						this.consume('=');
						const targetVar = this.findVar(currentToken);
						const targetVarType = targetVar ? targetVar.type : 'int4';
						const isPointerAssignment = targetVar.isPointer;
						if (isPointerAssignment) {
							const expr = this.parseExpression();
							const exprType = this.lastParsedType;
							const addrOps = [0x20, v.idx];
							let storeOp;
							if (v.type === 'int4' || v.type === 'uint4' || v.type === 'char' || v.type === 'bool') {
								storeOp = [0x36, 0x02, 0x00];
							} else if (v.type === 'int8' || v.type === 'uint8') {
								storeOp = [0x37, 0x03, 0x00];
							} else if (v.type === 'float4') {
								storeOp = [0x38, 0x02, 0x00];
							} else if (v.type === 'float8') {
								storeOp = [0x39, 0x03, 0x00];
							} else {
								storeOp = [0x36, 0x02, 0x00];
							}
							const castOps = this.cast(exprType, v.type);
							return [...addrOps, ...expr, ...castOps, ...storeOp];
						} else {
							const expr = this.parseExpression();
							const castOps = this.cast(this.lastParsedType, targetVarType);
							return [...expr, ...castOps, 0x21, v.idx];
						}
					} else {
						const isPointer = v.isPointer;
						if (isPointer) {
							const addrOps = [0x20, v.idx];
							let loadOp;
							if (v.type === 'int4' || v.type === 'uint4' || v.type === 'char' || v.type === 'bool') {
								loadOp = [0x28, 0x02, 0x00];
							} else if (v.type === 'int8' || v.type === 'uint8') {
								loadOp = [0x29, 0x03, 0x00];
							} else if (v.type === 'float4') {
								loadOp = [0x2a, 0x02, 0x00];
							} else if (v.type === 'float8') {
								loadOp = [0x2b, 0x03, 0x00];
							} else {
								loadOp = [0x28, 0x02, 0x00];
							}
							this.lastParsedType = v.type;
							return [...addrOps, ...loadOp];
						} else {
							this.lastParsedType = v.type;
							return [0x20, v.idx];
						}
					}
				}
			}
		}
		// ✅ FIX 2: Numeric literals with proper float conversion
		if (
			!isNaN(currentToken) ||
			currentToken.startsWith('0b') ||
			currentToken.startsWith('0x') ||
			currentToken === 'inf' ||
			currentToken === 'infinity' ||
			currentToken === '-inf' ||
			currentToken === '-infinity'
		) {
			const isFloatLiteral =
			currentToken.includes('.') ||
			currentToken.includes('e') ||
			currentToken.includes('p') ||
			currentToken === 'inf' ||
			currentToken === 'infinity' ||
			currentToken === '-inf' ||
			currentToken === '-infinity';
			if (isFloatLiteral) {
				let value;
				if (currentToken === 'inf' || currentToken === 'infinity') {
					value = Infinity;
				} else if (currentToken === '-inf' || currentToken === '-infinity') {
					value = -Infinity;
				} else {
					value = parseFloat(currentToken);
				}
				this.lastParsedType = 'float4';
				// Use DataView for consistent little-endian byte order
				const buffer = new ArrayBuffer(4);
				const view = new DataView(buffer);
				view.setFloat32(0, value, true);
				return [0x43, ...new Uint8Array(buffer)];
			}
			let val;
			if (currentToken.startsWith('0b')) {
				val = BigInt('0b' + currentToken.slice(2));
			} else if (currentToken.startsWith('0x')) {
				val = BigInt(currentToken);
			} else {
				const cleanToken = currentToken.replace(/[uU][lL]?[lL]?|[lL][lL]?[uU]?/, '');
				val = BigInt(cleanToken);
			}
			const MAX_I32 = 2n ** 31n - 1n;
			const MIN_I32 = -(2n ** 31n);
			let needs64Bit = val > MAX_I32 || val < MIN_I32;
			if (needs64Bit) {
				let truncatedVal;
				if (val >= 0n && val <= (2n ** 64n - 1n)) {
					if (val <= (2n ** 63n - 1n)) {
						this.lastParsedType = 'int8';
						truncatedVal = BigInt.asIntN(64, val);
					} else {
						this.lastParsedType = 'uint8';
						truncatedVal = BigInt.asIntN(64, val);
					}
				} else {
					this.lastParsedType = 'int8';
					truncatedVal = BigInt.asIntN(64, val);
				}
				return [0x42, ...this.sleb(truncatedVal)];
			} else {
				this.lastParsedType = 'int4';
				const twoPow32 = 1n << 32n;
				val = val % twoPow32;
				const maxSignedI32 = (1n << 31n) - 1n;
				if (val > maxSignedI32) val = val - twoPow32;
				return [0x41, ...this.sleb(val)];
			}
		}
		throw new Error(`Unexpected token or unknown identifier: ${currentToken}`);
	}
	parseStatement() {
		const t = this.peek();
		if (!t) {
			throw new Error("Unexpected end of input");
		}
		const lowerT = t;
		// --- ISWITCH IMPLEMENTATION (FALL-THROUGH FIX) ---
		if (lowerT === 'iswitch') {
			this.consume('iswitch');
			this.consume('(');
			const condExpr = this.parseExpression();
			const condType = this.lastParsedType;
			this.consume(')');
			if (!['int1', 'uint1', 'int2', 'uint2', 'int4', 'uint4', 'char', 'bool'].includes(condType)) {
				throw new Error(`iswitch condition must be integer type, got ${condType}`);
			}
			if (this.peek() !== '{') throw new Error('Expected "{" after iswitch condition');
			this.consume('{');
			let switchCode = [...condExpr];
			const tempCond = this.localCount++;
			this.localTypes.push(this.typeMap[condType]);
			switchCode.push(0x21, tempCond);
			// ✅ ADD: hit flag local variable for fall-through tracking
			const hitFlagIdx = this.localCount++;
			this.localTypes.push(0x7f); // i32 for bool flag
			const switchDepth = this.controlDepth;
			this.switchDepthStack.push(switchDepth);
			this.controlDepth += 1;
			let hasDefault = false;
			let defaultCode = [];
			let caseBlocks = [];
			const seenValues = new Set();
			while (this.peek() !== '}') {
				if (this.peek() === 'case') {
					this.consume('case');
					const caseToken = this.peek();
					if (!/^-?\d+$/.test(caseToken) && !/^0x[0-9a-fA-F]+$/i.test(caseToken)) {
						throw new Error(`Case value must be integer constant, got: ${caseToken}`);
					}
					const caseVal = parseInt(this.consume(), 10);
					if (seenValues.has(caseVal)) {
						throw new Error(`Duplicate case value: ${caseVal}`);
					}
					seenValues.add(caseVal);
					this.consume(':');
					let bodyOps = [];
					while (this.peek() !== 'case' && this.peek() !== 'default' && this.peek() !== '}') {
						bodyOps.push(...this.parseStatement());
					}
					caseBlocks.push({ value: caseVal, body: bodyOps });
				} else if (this.peek() === 'default') {
					if (hasDefault) throw new Error('Duplicate default clause');
					hasDefault = true;
					this.consume('default');
					this.consume(':');
					while (this.peek() !== '}') {
						defaultCode.push(...this.parseStatement());
					}
				} else {
					throw new Error(`Unexpected token in iswitch: ${this.peek()}`);
				}
			}
			this.consume('}');
			this.switchDepthStack.pop();
			let genCode = [
				0x02, 0x40,              // block $switch
				0x41, ...this.sleb(0),   // i32.const 0
				0x21, hitFlagIdx         // local.set $hitFlag = false
			];
			// ✅ FIX: Case blocks use (hitFlag || condition) for fall-through
			for (const { value, body } of caseBlocks) {
				genCode.push(
					// if (hitFlag || (tempCond == caseValue))
					0x20, hitFlagIdx,           // local.get $hitFlag
					0x20, tempCond,             // local.get $tempCond
					0x41, ...this.sleb(BigInt(value)),
					0x46,                       // i32.eq
					0x6a,                       // i32.or
					0x04, 0x40,                 // if void
					...body,                    // case body
					0x41, ...this.sleb(1),      // i32.const 1
					0x21, hitFlagIdx,           // local.set $hitFlag = true
					0x0b                        // end if
				);
			}
			// Default block: only executes if hit, then breaks
			if (hasDefault) {
				genCode.push(
					0x20, hitFlagIdx,           // local.get $hitFlag
					0x04, 0x40,                 // if void
					...defaultCode,
					0x0c, 0x01,                 // br 1 (exit switch block)
					0x0b                        // end if
				);
			}
			genCode.push(0x0b); // end block $switch
			return [...switchCode, ...genCode];
		}
		// --- FSWITCH IMPLEMENTATION (FALL-THROUGH FIX) ---
		if (lowerT === 'fswitch') {
			this.consume('fswitch');
			this.consume('(');
			const condExpr = this.parseExpression();
			const condType = this.lastParsedType;
			this.consume(')');
			if (condType !== 'float4') {
				throw new Error(`fswitch condition must be float4, got ${condType}`);
			}
			if (this.peek() !== '{') throw new Error('Expected "{" after fswitch condition');
			this.consume('{');
			let switchCode = [...condExpr];
			const tempCond = this.localCount++;
			this.localTypes.push(this.typeMap['float4']);
			switchCode.push(0x21, tempCond);
			// ✅ ADD: hit flag local variable for fall-through tracking
			const hitFlagIdx = this.localCount++;
			this.localTypes.push(0x7f); // i32 for bool flag
			const switchDepth = this.controlDepth;
			this.switchDepthStack.push(switchDepth);
			this.controlDepth += 1;
			let hasDefault = false;
			let defaultCode = [];
			let caseBlocks = [];
			const seenBitPatterns = new Set();
			while (this.peek() !== '}') {
				if (this.peek() === 'case') {
					this.consume('case');
					const caseToken = this.peek();
					if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(caseToken)) {
						throw new Error(`Case value must be float literal, got: ${caseToken}`);
					}
					const caseStr = this.consume();
					const caseBits = floatLiteralToBits(caseStr);
					if (seenBitPatterns.has(caseBits)) {
						throw new Error(`Duplicate case value: ${caseStr}`);
					}
					seenBitPatterns.add(caseBits);
					this.consume(':');
					let bodyOps = [];
					while (this.peek() !== 'case' && this.peek() !== 'default' && this.peek() !== '}') {
						bodyOps.push(...this.parseStatement());
					}
					caseBlocks.push({ bits: caseBits, body: bodyOps });
				} else if (this.peek() === 'default') {
					if (hasDefault) throw new Error('Duplicate default clause');
					hasDefault = true;
					this.consume('default');
					this.consume(':');
					while (this.peek() !== '}') {
						defaultCode.push(...this.parseStatement());
					}
				} else {
					throw new Error(`Unexpected token in fswitch: ${this.peek()}`);
				}
			}
			this.consume('}');
			this.switchDepthStack.pop();
			let genCode = [
				0x02, 0x40,              // block $switch
				0x41, ...this.sleb(0),   // i32.const 0
				0x21, hitFlagIdx         // local.set $hitFlag = false
			];
			// ✅ FIX: Case blocks use (hitFlag || condition) for fall-through
			for (const { bits, body } of caseBlocks) {
				genCode.push(
					// if (hitFlag || (tempCond == caseBits))
					0x20, hitFlagIdx,           // local.get $hitFlag
					0x20, tempCond,             // local.get $tempCond
					0xbc,                       // i32.reinterpret_f32
					0x41, ...this.sleb(BigInt(bits)),
					0x46,                       // i32.eq
					0x6a,                       // i32.or
					0x04, 0x40,                 // if void
					...body,                    // case body
					0x41, ...this.sleb(1),      // i32.const 1
					0x21, hitFlagIdx,           // local.set $hitFlag = true
					0x0b                        // end if
				);
			}
			// Default block: only executes if hit, then breaks
			if (hasDefault) {
				genCode.push(
					0x20, hitFlagIdx,           // local.get $hitFlag
					0x04, 0x40,                 // if void
					...defaultCode,
					0x0c, 0x01,                 // br 1 (exit switch block)
					0x0b                        // end if
				);
			}
			genCode.push(0x0b); // end block $switch
			return [...switchCode, ...genCode];
		}
		// try/catch implementation
		if (lowerT === 'try') {
			this.consume('try');
			if (this.peek() !== '{') throw new Error('Expected "{" after "try"');
			const thrownIdx = this.localCount++;
			const errIdx = this.localCount++;
			this.localTypes.push(this.typeMap['bool']);
			this.localTypes.push(this.typeMap['int4']);
			this.scopeStack[0].set(`_thrown_${thrownIdx}`, { idx: thrownIdx, type: 'bool' });
			this.scopeStack[0].set(`_err_${errIdx}`, { idx: errIdx, type: 'int4' });
			const init = [0x41, ...this.sleb(0), 0x21, thrownIdx];
			this.consume('{');
			const tryOps = [];
			while (this.peek() !== '}') {
				const next = this.peek();
				if (next === 'throw') {
					this.consume('throw');
					const expr = this.parseExpression();
					this.consume(';');
					tryOps.push(...expr, 0x21, errIdx, 0x41, ...this.sleb(1), 0x21, thrownIdx);
				} else {
					tryOps.push(...this.parseStatement());
				}
			}
			this.consume('}');
			if (this.peek() !== 'catch') {
				throw new Error('Expected "catch" after "try" block');
			}
			this.consume('catch');
			this.consume('(');
			let errVarName;
			if (this.isType(this.peek())) {
				this.consume();
				errVarName = this.consume();
			} else {
				errVarName = this.consume();
			}
			this.consume(')');
			if (this.peek() !== '{') throw new Error('Expected "{" after catch clause');
			const catchScope = new Map();
			catchScope.set(errVarName, { idx: errIdx, type: 'int4' });
			this.scopeStack.push(catchScope);
			this.consume('{');
			const catchOps = [];
			while (this.peek() !== '}') {
				catchOps.push(...this.parseStatement());
			}
			this.consume('}');
			this.scopeStack.pop();
			const ifCatch = [
				0x20, thrownIdx,
				0x41, ...this.sleb(0),
				0x47,
				0x04, 0x40,
				...catchOps,
				0x0b
			];
			return [...init, ...tryOps, ...ifCatch];
		}
		if (lowerT === 'throw') {
			throw new Error('"throw" used outside of a try block');
		}
		// Function pointer declaration
		if (this.peek() === '(') {
			let pos = this.pos;
			if (
				this.tokens[pos] === '(' &&
				pos + 1 < this.tokens.length &&
				this.tokens[pos + 1] === 'func' &&
				pos + 2 < this.tokens.length &&
				this.tokens[pos + 2] === '('
			) {
				this.consume('(');
				this.consume('func');
				this.consume('(');
				const paramTypes = [];
				while (this.peek() !== ')') {
					const p = this.parseTypeWithPointer();
					paramTypes.push(p.isPtr ? p.base + '@' : p.base);
					if (this.peek() === ',') this.consume(',');
				}
				this.consume(')');
				this.consume('->');
				const ret = this.parseTypeWithPointer();
				const retType = ret.isPtr ? ret.base + '@' : ret.base;
				this.consume(')');
				this.consume('@');
				const varName = this.consume();
				let initializer = null;
				if (this.peek() === '=') {
					this.consume('=');
					initializer = this.parseExpression();
				}
				this.consume(';');
				const idx = this.localCount++;
				this.localTypes.push(this.typeMap['int4']);
				this.scopeStack[this.scopeStack.length - 1].set(varName, {
						idx,
						type: 'int4',
						isPointer: false,
						isFuncPtr: true,
						funcSig: { params: paramTypes, returns: retType }
					});
				if (initializer) {
					return [...initializer, 0x21, idx];
				} else {
					return [0x41, ...this.sleb(0), 0x21, idx];
				}
			}
		}
		// Variable declaration
		if (this.isType(lowerT)) {
			const type = this.consume();
			let isPointer = false;
			let varName;
			if (this.peek() === '@') {
				this.consume('@');
				isPointer = true;
				varName = this.consume();
			} else {
				varName = this.consume();
			}
			if (this.peek() === '=') {
				this.consume('=');
				const currentTargetType = type;
				const expr = this.parseExpression();
				let castOps = [];
				if (isPointer) {
					castOps = this.cast(this.lastParsedType, 'int4');
				} else {
					castOps = this.cast(this.lastParsedType, currentTargetType);
				}
				this.consume(';');
				const idx = this.localCount++;
				this.localTypes.push(this.typeMap[isPointer ? 'int4' : currentTargetType]);
				this.scopeStack[this.scopeStack.length - 1].set(varName, {
						idx,
						type: currentTargetType,
						isPointer: isPointer
					});
				this.lastParsedType = isPointer ? 'int4' : currentTargetType;
				return [...expr, ...castOps, 0x21, idx];
			} else {
				const currentTargetType = type;
				const idx = this.localCount++;
				const localWasmType = isPointer ? this.typeMap['int4'] : this.typeMap[currentTargetType];
				this.localTypes.push(localWasmType);
				this.scopeStack[this.scopeStack.length - 1].set(varName, {
						idx,
						type: currentTargetType,
						isPointer: isPointer
					});
				this.consume(';');
				this.lastParsedType = currentTargetType;
				return [0x41, ...this.sleb(0), 0x21, idx];
			}
		}
		// Control flow
		if (lowerT === 'loop') {
			this.consume('loop');
			this.breakTargetStack.push(this.controlDepth);
			this.controlDepth += 2;
			const body = this.parseStatement();
			this.controlDepth -= 2;
			this.breakTargetStack.pop();
			return [0x02, 0x40, 0x03, 0x40, ...body, 0x0c, 0x00, 0x0b, 0x0b];
		}
		if (lowerT === 'if') {
			this.consume('if');
			this.consume('(');
			const cond = this.parseExpression();
			this.consume(')');
			this.controlDepth++;
			const body = this.parseStatement();
			this.controlDepth--;
			return [...cond, 0x04, 0x40, ...body, 0x0b];
		}
		if (lowerT === 'break') {
			this.consume('break');
			if (this.peek() === ';') this.consume(';');
			let breakLevel = 0;
			// ✅ FIX: Simplified switch check - just check if we're in a switch context
			if (this.switchDepthStack.length > 0) {
				breakLevel = 1;
			} else if (this.breakTargetStack.length > 0) {
				breakLevel = this.controlDepth - this.breakTargetStack[this.breakTargetStack.length - 1] - 1;
			} else {
				throw new Error('break not inside loop or switch');
			}
			return [0x0c, ...this.uleb(breakLevel)];
		}
		if (lowerT === 'return') {
			this.consume('return');
			const expr = this.parseExpression();
			let castOps = [];
			if (this.currentRetType.endsWith('@')) {
				this.lastParsedType = 'int4';
			} else {
				castOps = this.cast(this.lastParsedType, this.currentRetType);
			}
			if (this.peek() === ';') this.consume(';');
			// ✅ FIX: Use 0x0F for return, not 0x0C,0x00 (br 0)
			return [...expr, ...castOps, 0x0F];
		}
		if (lowerT === '{') {
			this.consume('{');
			this.scopeStack.push(new Map());
			let ops = [];
			while (this.peek() !== '}') ops.push(...this.parseStatement());
			this.consume('}');
			this.scopeStack.pop();
			return ops;
		}
		const expr = this.parseExpression();
		if (this.peek() === ';') this.consume(';');
		return expr;
	}
	sleb(n) {
		n = BigInt(n);
		let b = [];
		let more = true;
		let negative = n < 0n;
		while (more) {
			let byte = Number(n & 0x7fn);
			n >>= 7n;
			let done = false;
			if (negative) {
				done = (n === -1n && (byte & 0x40) !== 0);
			} else {
				done = (n === 0n && (byte & 0x40) === 0);
			}
			if (!done) {
				byte |= 0x80;
			}
			b.push(byte);
			if (done) {
				more = false;
			}
		}
		return b;
	}
	uleb(n) {
		n = BigInt(n);
		let b = [];
		do {
			let byte = Number(n & 0x7fn);
			n >>= 7n;
			if (n !== 0n) byte |= 0x80;
			b.push(byte);
		} while (n !== 0n);
		return b;
	}
	withLen(d) {
		return [...this.uleb(d.length), ...d];
	}
}
class TopsWasmGen {
	constructor(functions, typeMap, initialHeapPtr = 0, stringData = []) {
		this.functions = functions;
		this.typeMap = typeMap;
		this.initialHeapPtr = initialHeapPtr;
		this.stringData = stringData;
	}
	generateWasm(bodies, funcMetadata) {
		const types = Array.from(this.functions.values()).map(f => [
				0x60,
				...this.uleb(f.paramTypes.length),
				...f.paramTypes.map(pt => {
						const base = pt.endsWith('@') ? pt.slice(0, -1) : pt;
						return this.typeMap[base];
					}),
				...(f.ret === 0x40 ? [0x00] : [0x01, f.ret])
			]);
		const funcSectionContent = [];
		funcSectionContent.push(...this.uleb(bodies.length));
		for (let i = 0; i < bodies.length; i++) {
			funcSectionContent.push(...this.uleb(i));
		}
		const tableSectionContent = [
			0x01,
			0x70,
			0x00,
			...this.uleb(BigInt(this.functions.size))
		];
		const elementSectionContent = [
			0x01,
			0x00,
			0x41, ...this.sleb(0n),
			0x0b,
			...this.uleb(BigInt(this.functions.size)),
			...Array.from(this.functions.values()).map(f => this.uleb(f.idx)).flat()
		];
		const memorySectionContent = [0x01, 0x00, 0x01];
		const exported = Array.from(this.functions.entries()).filter(
			([name, info]) => info.isPublic || name === 'main'
		);
		const allExports = [...exported];
		allExports.push(['memory', { idx: 0, isMemory: true }]);
		const exportSectionContent = [];
		exportSectionContent.push(...this.uleb(allExports.length));
		for (const [name, info] of allExports) {
			if (info.isMemory) {
				const nameBytes = Array.from('memory').map(c => c.charCodeAt(0));
				exportSectionContent.push(...this.uleb(nameBytes.length));
				exportSectionContent.push(...nameBytes);
				exportSectionContent.push(0x02);
				exportSectionContent.push(...this.uleb(0));
			} else {
				const nameBytes = Array.from(name).map(c => c.charCodeAt(0));
				exportSectionContent.push(...this.uleb(nameBytes.length));
				exportSectionContent.push(...nameBytes);
				exportSectionContent.push(0x00);
				exportSectionContent.push(...this.uleb(info.idx));
			}
		}
		const globalsSectionContent = [
			0x01,
			0x7f,
			0x01,
			0x41,
			...this.sleb(BigInt(this.initialHeapPtr)),
			0x0b
		];
		let dataSectionContent = [];
		if (this.stringData.length > 0) {
			const dataSegment = [
				...this.uleb(1),
				0x00,
				0x41, ...this.sleb(0n),
				0x0b,
				...this.uleb(this.stringData.length),
				...this.stringData
			];
			dataSectionContent = [0x0b, ...this.withLen(dataSegment)];
		} else {
			dataSectionContent = [0x0b, 0x01, 0x00];
		}
		return new Uint8Array([
				0x00, 0x61, 0x73, 0x6d,
				0x01, 0x00, 0x00, 0x00,
				0x01, ...this.withLen([types.length, ...types.flat()]),
				0x03, ...this.withLen(funcSectionContent),
				0x04, ...this.withLen(tableSectionContent),
				0x05, ...this.withLen(memorySectionContent),
				0x06, ...this.withLen(globalsSectionContent),
				0x07, ...this.withLen(exportSectionContent),
				0x09, ...this.withLen(elementSectionContent),
				0x0a, ...this.withLen([bodies.length, ...bodies.flatMap(b => this.withLen(b))]),
				...dataSectionContent
			]);
	}
	uleb(n) {
		n = BigInt(n);
		let b = [];
		do {
			let byte = Number(n & 0x7fn);
			n >>= 7n;
			if (n !== 0n) byte |= 0x80;
			b.push(byte);
		} while (n !== 0n);
		return b;
	}
	sleb(n) {
		n = BigInt(n);
		let b = [];
		let more = true;
		let negative = n < 0n;
		while (more) {
			let byte = Number(n & 0x7fn);
			n >>= 7n;
			let done = false;
			if (negative) {
				done = (n === -1n && (byte & 0x40) !== 0);
			} else {
				done = (n === 0n && (byte & 0x40) === 0);
			}
			if (!done) {
				byte |= 0x80;
			}
			b.push(byte);
			if (done) {
				more = false;
			}
		}
		return b;
	}
	withLen(d) {
		return [...this.uleb(d.length), ...d];
	}
}
class TopsCompiler {
	constructor(source) {
		this.source = source;
		this.tokens = [];
		this.functions = new Map();
		this.typeMap = TYPE_MAP;
		this.stringData = [];
		this.nextStringOffset = 0;
		this.preprocess();
	}
	preprocess() {
		this.source = this.source.replace(/\/\/.*/g, '');
		this.tokens = TopsTokenizer.tokenize(this.source);
	}
	registerString(str) {
		const addr = this.nextStringOffset;
		const bytes = Array.from(str).map(c => c.charCodeAt(0));
		this.stringData.push(...bytes);
		this.nextStringOffset += bytes.length;
		return addr;
	}
	compile() {
		this.functions.clear();
		this.stringData = [];
		this.nextStringOffset = 0;
		let pos = 0;
		const tokens = this.tokens;
		let fIdx = 0;
		const funcMetadata = new Map();
		while (pos < tokens.length) {
			let isPublic = false;
			if (tokens[pos] === 'public') {
				isPublic = true;
				pos++;
			}
			if (tokens[pos] !== 'func') {
				throw new Error(`Top-level Error: Unexpected token "${tokens[pos]}"`);
			}
			pos++;
			const name = tokens[pos++];
			if (tokens[pos++] !== '(') throw new Error('Expected "(" after function name');
			const paramTypes = [];
			const paramNames = [];
			if (tokens[pos] !== ')') {
				while (true) {
					let pType = tokens[pos++];
					if (!this.isType(pType)) {
						throw new Error(`Invalid parameter type: ${pType}`);
					}
					let isParamPointer = false;
					if (tokens[pos] === '@') {
						pos++;
						isParamPointer = true;
					}
					paramTypes.push({ type: pType, isPointer: isParamPointer });
					let paramName = tokens[pos++];
					paramNames.push(paramName);
					if (tokens[pos] === ',') {
						pos++;
					} else if (tokens[pos] === ')') {
						break;
					} else {
						throw new Error(`Expected ',' or ')' after parameter, got: ${tokens[pos]}`);
					}
				}
			}
			pos++;
			if (tokens[pos] !== '->') {
				throw new Error('Expected "->" after function parameters');
			}
			pos++;
			let ret = tokens[pos++];
			let retIsPointer = false;
			if (tokens[pos] === '@') {
				pos++;
				retIsPointer = true;
			}
			let retStr = ret;
			if (retIsPointer) {
				retStr = ret + '@';
			}
			let wasmRetType = this.typeMap[ret];
			if (retIsPointer) {
				wasmRetType = this.typeMap['int4'];
			}
			if (tokens[pos] !== '{') throw new Error('Expected "{" for function body');
			const bodyStart = pos;
			let braceDepth = 0;
			let bodyPos = pos;
			while (bodyPos < tokens.length) {
				if (tokens[bodyPos] === '{') braceDepth++;
				else if (tokens[bodyPos] === '}') {
					braceDepth--;
					if (braceDepth === 0) {
						bodyPos++;
						break;
					}
				}
				bodyPos++;
			}
			pos = bodyPos;
			funcMetadata.set(name, {
					idx: fIdx++,
					paramTypes: paramTypes.map(p => p.type),
					paramNames,
					ret: wasmRetType,
					retStr: retStr,
					isPublic,
					bodyStart
				});
			const fullParamTypes = paramTypes.map(p => p.isPointer ? `${p.type}@` : p.type);
			this.functions.set(name, {
					idx: funcMetadata.get(name).idx,
					paramTypes: fullParamTypes,
					ret: wasmRetType,
					retStr: funcMetadata.get(name).retStr,
					isPublic: funcMetadata.get(name).isPublic
				});
		}
		const bodies = [];
		pos = 0;
		while (pos < tokens.length) {
			if (tokens[pos] === 'public') pos++;
			if (tokens[pos] !== 'func') {
				pos++;
				continue;
			}
			pos++;
			const name = tokens[pos++];
			const meta = funcMetadata.get(name);
			if (!meta) throw new Error(`Function ${name} missing metadata`);
			const parser = new TopsParser(tokens, this.functions, this.typeMap, this);
			parser.currentRetType = meta.retStr;
			parser.scopeStack = [new Map()];
			for (let i = 0; i < meta.paramTypes.length; i++) {
				const paramName = meta.paramNames[i];
				const fullParamTypeString = this.functions.get(name).paramTypes[i];
				const isPointer = fullParamTypeString.endsWith('@');
				const baseType = isPointer ? fullParamTypeString.slice(0, -1) : fullParamTypeString;
				parser.scopeStack[0].set(paramName, { idx: i, type: baseType, isPointer: isPointer });
			}
			parser.localCount = meta.paramTypes.length;
			parser.localTypes = [];
			parser.pos = meta.bodyStart;
			const code = parser.parseStatement();
			const localsData = parser.localTypes.flatMap(t => [...parser.uleb(1), t]);
			bodies.push([...parser.uleb(parser.localTypes.length), ...localsData, ...code, 0x0b]);
		}
		const wasmGenerator = new TopsWasmGen(this.functions, this.typeMap, this.nextStringOffset, this.stringData);
		return wasmGenerator.generateWasm(bodies, funcMetadata);
	}
	isType(t) {
		if (t && this.typeMap[t] !== undefined) {
			return true;
		}
		return false;
	}
}
export default TopsCompiler;