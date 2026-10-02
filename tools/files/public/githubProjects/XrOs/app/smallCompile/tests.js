//tests.js
import { compileToWasm, STDLIB } from './compiler.js';

// Helper to convert Uint8Array to a continuous hex string
function toHexString(byteArray) {
    return Array.from(byteArray, byte => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('').toUpperCase();
}

export const tests = [
    { name: "Basic Addition (i32)", code: "int32 main() { return 2 + 3; }", expected: 5 },
    { name: "Float Arithmetic (f32)", code: "float main() { float a = 3.5; float b = 1.5; return a + b; }", expected: 5.0 },
    { name: "Double Precision (f64)", code: "double main() { double x = 10.125; double y = 2.0; return x / y; }", expected: 5.0625 },
    { name: "Int64 Math (i64)", code: "int64 main() { int64 big = 10000000000; int64 small = 2; return big + small; }", expected: 10000000002 },
    { name: "Bool Logic", code: "int32 main() { bool a = true; bool b = false; if (a) { return 1; } else { return 0; } }", expected: 1 },
    { name: "Char Literals", code: "int32 main() { char c = 'A'; return c + 1; }", expected: 66 },
    { name: "Mixed Type Promotion (i32 + i64)", code: "int64 main() { int32 a = 10; int64 b = 20; return a + b; }", expected: 30 },
    { name: "Mixed Type Promotion (i32 to f64)", code: "double main() { int32 x = 5; double y = 2.5; return x + y; }", expected: 7.5 },
    { name: "While Loop (i32)", code: `int32 main() { int32 i = 0; int32 sum = 0; while (i < 5) { sum = sum + i; i = i + 1; } return sum; }`, expected: 10 },
    { name: "Compiler Error (Missing Semicolon)", code: "int32 main() { return 5 }", expectedError: true },
    { name: "Multiple Functions (Add)", code: `int32 add(int32 a, int32 b) { return a + b; } int32 main() { return add(10, 20); }`, expected: 30 },
    { name: "Recursion (Factorial)", code: `int32 factorial(int32 n) { if (n <= 1) { return 1; } return n * factorial(n - 1); } int32 main() { return factorial(5); }`, expected: 120 },
    { name: "Standalone Expression Statement (Drop Opcode)", code: `int32 dummy(int32 x) { return x * 2; } int32 main() { dummy(5); return 42; }`, expected: 42 },
    { name: "Array Allocation and Access", code: "int32 main() { int32 arr[3]; arr[0] = 10; arr[1] = 20; arr[2] = arr[0] + arr[1]; return arr[2]; }", expected: 30 },
    { name: "Pointer to Array & Dereference", code: "int32 main() { int32 arr[2]; arr[0] = 5; arr[1] = 15; int32* p = arr; return *p + *(p + 1); }", expected: 20 },
    { name: "Array in Loop", code: "int32 main() { int32 arr[5]; int32 i = 0; while (i < 5) { arr[i] = i * 2; i = i + 1; } return arr[4]; }", expected: 8 },
    { name: "Deref Assignment", code: "int32 main() { int32 arr[1]; int32* p = arr; *p = 99; return arr[0]; }", expected: 99 },
    { name: "String Literal and Print", code: "void print(int32 ptr); int32 main() { print(\"Hello iPhone!\\n\"); return 42; }", expected: 42 },
    { name: "Multiple Prints", code: "void print(int32 ptr); int32 main() { print(\"Line 1\\n\"); print(\"Line 2\\n\"); return 0; }", expected: 0 },
    { name: "Sizeof Basic Type", code: "int32 main() { return sizeof(int32); }", expected: 4 },
    { name: "Sizeof Pointer", code: "int32 main() { return sizeof(int32*); }", expected: 4 },
    { name: "Sizeof Double", code: "int32 main() { return sizeof(double); }", expected: 8 },
    { name: "Sizeof in Expression", code: "int32 main() { int32 x = sizeof(char) * 10; return x; }", expected: 10 },
    { name: "Malloc and Free", code: `#include <malloc.c>\nint32 main() { int32* p = (int32*)malloc(16); p[0] = 42; int32 v = p[0]; free(p); return v; }`, expected: 42 },
    { name: "Realloc Expansion", code: `#include <malloc.c>\nint32 main() { int32* p = (int32*)malloc(8); p[0] = 10; p = (int32*)realloc(p, 16); p[1] = 20; int32 v = p[0] + p[1]; free(p); return v; }`, expected: 30 }
];

export async function runTests() {
    const btn = document.getElementById('runBtn');
    const output = document.getElementById('output');
    const consoleDiv = document.getElementById('console-output');
    
    if (!btn || !output || !consoleDiv) {
        console.error("Missing DOM elements.");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Running...";
    output.innerHTML = '';
    consoleDiv.textContent = ''; 
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    let passed = 0;
    let failed = 0;

    const escapeHtml = (str) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    for (const test of tests) {
        const testDiv = document.createElement('div');
        testDiv.className = 'test-case';
        
        let actualResult = null;
        let errorMsg = null;
        let isPass = false;
        let displayText = "";
        let wasmHex = "N/A";

        try {
            const wasmBytes = compileToWasm(test.code);
            wasmHex = toHexString(wasmBytes); // Generate hex string
            
            let memory = null;
            const importObject = {
                env: {
                    print: (ptr) => {
                        if (!memory) return;
                        const memArray = new Uint8Array(memory.buffer);
                        let end = ptr;
                        while (memArray[end] !== 0) end++;
                        const str = new TextDecoder().decode(memArray.subarray(ptr, end));
                        consoleDiv.textContent += str;
                        consoleDiv.scrollTop = consoleDiv.scrollHeight;
                    }
                }
            };

            const wasmModule = await WebAssembly.instantiate(wasmBytes, importObject);
            memory = wasmModule.instance.exports.memory; 
            
            actualResult = wasmModule.instance.exports.main();
            
            if (typeof actualResult === 'bigint') {
                actualResult = Number(actualResult);
            }
            
            if (typeof test.expected === 'number') {
                isPass = Math.abs(actualResult - test.expected) < 0.0001;
            } else {
                isPass = actualResult === test.expected;
            }
            
            if (test.expectedError) {
                isPass = false;
                errorMsg = "Expected compilation error, but it succeeded.";
                displayText = errorMsg;
            } else if (!isPass) {
                errorMsg = `Expected ${test.expected}, got ${actualResult}`;
                displayText = String(actualResult);
            } else {
                displayText = String(actualResult);
            }
        } catch (e) {
            if (test.expectedError) {
                isPass = true;
                displayText = "Compilation Error (Expected)";
            } else {
                isPass = false;
                errorMsg = e.message;
                displayText = errorMsg;
            }
        }

        if (isPass) passed++; else failed++;

        // Build the labeled clipboard text
        const clipboardText = `=== Test: ${test.name} ===\n\n` +
            `[Source Code]\n${test.code}\n\n` +
            `[Expected Result]\n${test.expectedError ? 'Compilation Error' : test.expected}\n\n` +
            `[Actual Result]\n${isPass ? displayText : (errorMsg || displayText)}\n\n` +
            `[WASM Hex Code]\n${wasmHex}`;

        testDiv.innerHTML = `
            <div class="test-header ${isPass ? 'pass' : 'fail'}">
                ${isPass ? '✅ PASS' : '❌ FAIL'}: ${escapeHtml(test.name)}
            </div>
            <div class="test-body">
                <div class="test-code">
                    <pre>${escapeHtml(test.code)}</pre>
                </div>
                <div class="test-results">
                    <div class="result-row">
                        <span class="label">Expected:</span> 
                        <span class="result-value">${test.expectedError ? 'Compilation Error' : escapeHtml(test.expected)}</span>
                    </div>
                    <div class="result-row">
                        <span class="label">Actual:</span> 
                        <span class="result-value ${isPass ? '' : 'error-text'}">${escapeHtml(displayText)}</span>
                    </div>
                    <div class="result-row" style="flex-direction: column; align-items: stretch;">
                        <span class="label" style="margin-bottom: 5px;">WASM Hex:</span> 
                        <pre class="wasm-hex">${escapeHtml(wasmHex)}</pre>
                    </div>
                    <div class="result-row" style="margin-top: 10px; justify-content: flex-end;">
                        <button class="copy-btn" data-copy="${escapeHtml(clipboardText).replace(/'/g, "&#39;")}">📋 Copy Full Report</button>
                    </div>
                </div>
            </div>
        `;
        
        output.appendChild(testDiv);

        const copyBtn = testDiv.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            // Retrieve the raw, unescaped text from the data attribute
            const textToCopy = copyBtn.getAttribute('data-copy').replace(/&#39;/g, "'");
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅ Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                copyBtn.innerHTML = '❌ Failed';
                setTimeout(() => { copyBtn.innerHTML = '📋 Copy Full Report'; }, 2000);
            });
        });
    }

    const summaryDiv = document.createElement('div');
    summaryDiv.className = `summary ${failed === 0 ? 'all-pass' : 'has-fail'}`;
    summaryDiv.innerHTML = `<h2>Test Summary: ${passed} Passed, ${failed} Failed</h2>`;
    output.prepend(summaryDiv);

    btn.disabled = false;
    btn.textContent = "▶ Run All Tests";
}