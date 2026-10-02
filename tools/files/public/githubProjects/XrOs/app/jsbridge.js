//jsBridge.js
/**
 * Parses a C++ packed struct layout string and calculates byte offsets.
 * Safely strips comments before parsing to prevent regex failures.
 */

function parseCppLayout(layoutStr) {
	// 1. Strip C++ single-line comments (// ...)
	let cleanStr = layoutStr.replace(/\/\/.*$/gm, '');
	// 2. Strip C-style multi-line comments (/* ... */)
	cleanStr = cleanStr.replace(/\/\*[\s\S]*?\*\//g, '');
	// 3. Remove raw string literal markers R"( and )" if present, then trim
	cleanStr = cleanStr.replace(/^R"\(/, '').replace(/\)"$/, '').trim();
	
	const statements = cleanStr.split(';');
	const fields = [];
	let currentOffset = 0;

	for (let stmt of statements) {
		stmt = stmt.trim();
		if (!stmt) continue;

		// Regex breakdown:
		// 1. (.+?)           : Base type (non-greedy, supports spaces like 'unsigned int')
		// 2. \s*(\*?)\s*     : Optional pointer asterisk with flexible spacing
		// 3. ([\w]+)         : Field name
		// 4. (?:\[(\d+)\])?  : Optional array size
		const match = stmt.match(/^\s*(.+?)\s*(\*?)\s*([\w]+)(?:\[(\d+)\])?\s*$/);

		if (match) {
			const baseType = match[1].trim();
			const isPointer = match[2] === '*';
			const fieldName = match[3];
			const arraySize = match[4] ? parseInt(match[4], 10) : 1;
			const isArray = !!match[4];

			let byteSize = 1;
			let viewType = 'Int8';

			if (isPointer) {
				byteSize = 4; // WASM32 pointer size (change to 8 for WASM64)
				viewType = 'Uint32';
			} else {
				switch (baseType) {
					case 'double': byteSize = 8; viewType = 'Float64'; break;
					case 'float': byteSize = 4; viewType = 'Float32'; break;
					case 'long long': case 'int64_t': byteSize = 8; viewType = 'BigInt64'; break;
					case 'unsigned long long': case 'uint64_t': byteSize = 8; viewType = 'BigUint64'; break;
					case 'int': case 'long': case 'int32_t': byteSize = 4; viewType = 'Int32'; break;
					case 'unsigned int': case 'unsigned long': case 'uint32_t': byteSize = 4; viewType = 'Uint32'; break;
					case 'short': case 'int16_t': byteSize = 2; viewType = 'Int16'; break;
					case 'uint16_t': byteSize = 2; viewType = 'Uint16'; break;
					case 'char': case 'int8_t': byteSize = 1; viewType = 'Int8'; break;
					case 'uint8_t': case 'bool': byteSize = 1; viewType = 'Uint8'; break;
					default:
						console.warn(`Unknown type: '${baseType}', defaulting to 4 bytes (Int32)`);
						byteSize = 4; viewType = 'Int32';
				}
			}

			fields.push({
				name: fieldName,
				baseType: baseType,
				isPointer: isPointer,
				isArray: isArray,
				arraySize: arraySize,
				byteSize: byteSize,
				viewType: viewType,
				size: byteSize * arraySize,
				offset: currentOffset
			});

			currentOffset += byteSize * arraySize;
		} else {
			console.warn(`Failed to parse statement: "${stmt}"`);
		}
	}
	return { fields, totalSize: currentOffset };
}

/**
 * Generates the JS wrapper class code with Proxy support for arrays and smart pointer handling.
 */
function generateWasmWrapper(className, layoutStr) {
	const { fields, totalSize } = parseCppLayout(layoutStr);
	const isLittleEndian = true;

	let classCode = `class ${className} {\n`;
	classCode += `  constructor(buffer, byteOffset = 0) {\n`;
	classCode += `    this.view = new DataView(buffer, byteOffset, ${totalSize});\n`;
	classCode += `  }\n\n`;

	for (const field of fields) {
		const { name, baseType, isPointer, isArray, arraySize, byteSize, viewType, offset } = field;

		// 1. FIXED CHAR ARRAY -> String
		if (baseType === 'char' && isArray && !isPointer) {
			classCode += `  get ${name}() {\n`;
			classCode += `    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + ${offset}, ${arraySize});\n`;
			classCode += `    const nullIdx = bytes.indexOf(0);\n`;
			classCode += `    return new TextDecoder('utf-8').decode(nullIdx === -1 ? bytes : bytes.slice(0, nullIdx));\n`;
			classCode += `  }\n`;
			classCode += `  set ${name}(value) {\n`;
			classCode += `    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + ${offset}, ${arraySize});\n`;
			classCode += `    bytes.fill(0);\n`;
			classCode += `    bytes.set(new TextEncoder().encode(value).slice(0, ${arraySize}));\n`;
			classCode += `  }\n\n`;
		}
		// 2. SINGLE CHAR -> String.fromCharCode
		else if (baseType === 'char' && !isPointer) {
			classCode += `  get ${name}() { return String.fromCharCode(this.view.getUint8(${offset}, ${isLittleEndian})); }\n`;
			classCode += `  set ${name}(v) { this.view.setUint8(${offset}, typeof v === 'string' ? v.charCodeAt(0) : v, ${isLittleEndian}); }\n\n`;
		}
		// 3. BOOL ARRAY -> Proxy
		else if (baseType === 'bool' && isArray && !isPointer) {
			classCode += `  get ${name}() {\n`;
			classCode += `    if (!this._${name}_p) this._${name}_p = new Proxy({length: ${arraySize}}, {\n`;
			classCode += `      get: (t, p) => {\n`;
			classCode += `        if (p === 'length') return ${arraySize};\n`;
			classCode += `        if (p === Symbol.iterator) return function*() { for(let i=0;i<${arraySize};i++) yield this.view.getUint8(${offset}+i,${isLittleEndian})!==0; }.bind(this);\n`;
			classCode += `        const i = parseInt(p,10); return !isNaN(i) && i>=0 && i<${arraySize} ? this.view.getUint8(${offset}+i,${isLittleEndian})!==0 : t[p];\n`;
			classCode += `      },\n`;
			classCode += `      set: (t, p, v) => { const i = parseInt(p,10); if(!isNaN(i) && i>=0 && i<${arraySize}) { this.view.setUint8(${offset}+i, v?1:0, ${isLittleEndian}); return true; } t[p]=v; return true; }\n`;
			classCode += `    });\n`;
			classCode += `    return this._${name}_p;\n`;
			classCode += `  }\n`;
			classCode += `  set ${name}(arr) { if(arr) for(let i=0;i<Math.min(arr.length,${arraySize});i++) this.view.setUint8(${offset}+i, arr[i]?1:0, ${isLittleEndian}); }\n\n`;
		}
		// 4. SINGLE BOOL
		else if (baseType === 'bool' && !isPointer) {
			classCode += `  get ${name}() { return this.view.getUint8(${offset}, ${isLittleEndian}) !== 0; }\n`;
			classCode += `  set ${name}(v) { this.view.setUint8(${offset}, v ? 1 : 0, ${isLittleEndian}); }\n\n`;
		}
		// 5. POINTER (Single or Array)
		else if (isPointer) {
			if (isArray) {
				classCode += `  get ${name}() {\n`;
				classCode += `    if (!this._${name}_p) this._${name}_p = new Proxy({length: ${arraySize}}, {\n`;
				classCode += `      get: (t, p) => {\n`;
				classCode += `        if (p === 'length') return ${arraySize};\n`;
				classCode += `        if (p === Symbol.iterator) return function*() { for(let i=0;i<${arraySize};i++) yield this.view.getUint32(${offset}+i*4,${isLittleEndian}); }.bind(this);\n`;
				classCode += `        const i = parseInt(p,10); return !isNaN(i) && i>=0 && i<${arraySize} ? this.view.getUint32(${offset}+i*4,${isLittleEndian}) : t[p];\n`;
				classCode += `      },\n`;
				classCode += `      set: (t, p, v) => {\n`;
				classCode += `        const i = parseInt(p,10);\n`;
				classCode += `        if(!isNaN(i) && i>=0 && i<${arraySize}) {\n`;
				classCode += `          const addr = typeof v === 'number' ? v : (v && (v.pointer !== undefined ? v.pointer : v.address !== undefined ? v.address : 0));\n`;
				classCode += `          this.view.setUint32(${offset}+i*4, addr || 0, ${isLittleEndian}); return true;\n`;
				classCode += `        }\n`;
				classCode += `        t[p]=v; return true;\n`;
				classCode += `      }\n`;
				classCode += `    });\n`;
				classCode += `    return this._${name}_p;\n`;
				classCode += `  }\n`;
				classCode += `  set ${name}(arr) { if(arr) for(let i=0;i<Math.min(arr.length,${arraySize});i++) { const v=arr[i]; const addr = typeof v === 'number' ? v : (v && (v.pointer !== undefined ? v.pointer : v.address !== undefined ? v.address : 0)); this.view.setUint32(${offset}+i*4, addr || 0, ${isLittleEndian}); } }\n\n`;
			} else {
				classCode += `  get ${name}() { return this.view.getUint32(${offset}, ${isLittleEndian}); }\n`;
				classCode += `  set ${name}(v) {\n`;
				classCode += `    const addr = typeof v === 'number' ? v : (v && (v.pointer !== undefined ? v.pointer : v.address !== undefined ? v.address : 0));\n`;
				classCode += `    this.view.setUint32(${offset}, addr || 0, ${isLittleEndian});\n`;
				classCode += `  }\n\n`;
			}
		}
		// 6. GENERAL PRIMITIVE ARRAY -> Proxy
		else if (isArray) {
			classCode += `  get ${name}() {\n`;
			classCode += `    if (!this._${name}_p) this._${name}_p = new Proxy({length: ${arraySize}}, {\n`;
			classCode += `      get: (t, p) => {\n`;
			classCode += `        if (p === 'length') return ${arraySize};\n`;
			classCode += `        if (p === Symbol.iterator) return function*() { for(let i=0;i<${arraySize};i++) yield this.view.get${viewType}(${offset}+i*${byteSize},${isLittleEndian}); }.bind(this);\n`;
			classCode += `        const i = parseInt(p,10); return !isNaN(i) && i>=0 && i<${arraySize} ? this.view.get${viewType}(${offset}+i*${byteSize},${isLittleEndian}) : t[p];\n`;
			classCode += `      },\n`;
			classCode += `      set: (t, p, v) => { const i = parseInt(p,10); if(!isNaN(i) && i>=0 && i<${arraySize}) { this.view.set${viewType}(${offset}+i*${byteSize}, v, ${isLittleEndian}); return true; } t[p]=v; return true; }\n`;
			classCode += `    });\n`;
			classCode += `    return this._${name}_p;\n`;
			classCode += `  }\n`;
			classCode += `  set ${name}(arr) { if(arr) for(let i=0;i<Math.min(arr.length,${arraySize});i++) this.view.set${viewType}(${offset}+i*${byteSize}, arr[i], ${isLittleEndian}); }\n\n`;
		}
		// 7. GENERAL SINGLE PRIMITIVE (Includes BigInt types via viewType)
		else {
			classCode += `  get ${name}() { return this.view.get${viewType}(${offset}, ${isLittleEndian}); }\n`;
			classCode += `  set ${name}(v) { this.view.set${viewType}(${offset}, v, ${isLittleEndian}); }\n\n`;
		}
	}

	classCode += `  static get size() { return ${totalSize}; }\n`;
	classCode += `}\n`;
	return classCode;
}

// ==========================================
// EXAMPLE USAGE
// ==========================================

const cppLayoutString = `
double x;
char title[32];
unsigned int flags;      // Multi-word type support
uint64_t large_id;       // 64-bit integer support (requires BigInt)
player* p;               // Pointer to unknown class
void* data;              // Void pointer
uint32_t* targets[4];    // Array of pointers
`;

// Use new Function instead of eval for safer dynamic class generation
const GeneratedDataClass = new Function(`return ${generateWasmWrapper('MyData', cppLayoutString)}`)();

// Allocate buffer based on the calculated total size
const buffer = new ArrayBuffer(GeneratedDataClass.size);
const obj = new GeneratedDataClass(buffer, 0);

console.log(`Total struct size: ${GeneratedDataClass.size} bytes`);

// --- 1. SCALARS & STRINGS ---
obj.x = 99.9;
obj.title = "Pointer Test";
obj.flags = 0b1010; // unsigned int

// --- 2. 64-BIT INTEGERS (BigInt) ---
// Note: DataView requires BigInt (note the 'n' suffix) for 64-bit operations
obj.large_id = 18446744073709551615n; 
console.log("Large ID (BigInt):", obj.large_id);

// --- 3. SINGLE POINTERS ---
// Option A: Assign a raw memory address (e.g., returned from C++ malloc)
obj.p = 1048576;
console.log("Player pointer address:", obj.p); // Output: 1048576

// Option B: Assign another JS wrapper object directly! (The setter extracts .pointer or .address)
const fakePlayerWrapper = { pointer: 2097152 };
obj.p = fakePlayerWrapper;
console.log("Updated player pointer:", obj.p); // Output: 2097152

// Set to null (0)
obj.data = 0;
console.log("Data pointer (null):", obj.data); // Output: 0

// --- 4. ARRAYS OF POINTERS ---
// Assign raw addresses
obj.targets[0] = 11111;
obj.targets[1] = 22222;

// Assign via wrapper objects
obj.targets[2] = { address: 33333 };
obj.targets[3] = 0; // null

console.log("Target 2 address:", obj.targets[2]); // Output: 33333

// Symbol.iterator allows spreading or for...of loops on pointer arrays!
console.log("All targets (spread):", [...obj.targets]); 

// Bulk assignment of pointer array
obj.targets = [44444, 55555, { pointer: 66666 }, 0];
console.log("Target 0 after bulk assign:", obj.targets[0]); // Output: 44444

console.log("--- ✅ All tests passed successfully! ---");