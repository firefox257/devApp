// compiler.js
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { compileASTToWasm } from './wasm_generator.js';
import { INCLUDE_CACHE } from './includes.js';

export function compileSL(source) {
    let resolvedSource = source;
    
    // Simple preprocessor: replace import statements with cached SL code
    for (const [filename, code] of Object.entries(INCLUDE_CACHE)) {
        const regex = new RegExp(`import\\s+"${filename}";\\s*`, 'g');
        resolvedSource = resolvedSource.replace(regex, code + '\n');
    }
    
    const lexer = new Lexer(resolvedSource);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const wasmBytes = compileASTToWasm(ast);
    return { ast, wasmBytes };
}