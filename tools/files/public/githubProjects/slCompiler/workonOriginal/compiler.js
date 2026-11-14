// compiler.js
import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { generateLLVMIR } from './llvm-generator.js';
import { toHex } from './utils.js';

export function compileSL(slCode) {
    try {
        const tokens = tokenize(slCode);
        const ast = parse(tokens);
        const llvmIR = generateLLVMIR(ast);
        
        return {
            success: true,
            llvmIR: llvmIR,
            llvmIRHex: toHex(llvmIR),
            error: null
        };
    } catch (err) {
        return { success: false, error: err.message, llvmIR: '', llvmIRHex: '' };
    }
}