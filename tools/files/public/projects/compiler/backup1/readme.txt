Tops Compiler - Modular WebAssembly Compiler

A JavaScript-based compiler that translates a custom programming language into WebAssembly bytecode. The compiler is modularized into six distinct components for better maintainability and separation of concerns.

-------------------------------------------------------------------------------
ARCHITECTURE OVERVIEW
-------------------------------------------------------------------------------

The Tops compiler follows a traditional compilation pipeline:
1. Tokenization -> Converts source code to tokens
2. Parsing -> Converts tokens to WebAssembly bytecode
3. Code Generation -> Assembles final WASM binary

-------------------------------------------------------------------------------
FILE STRUCTURE
-------------------------------------------------------------------------------

tops-compiler/
├── compiler.js                 # Main compiler entry point
├── tokenizer.js            # Lexical analysis
├── parser.js               # Syntax analysis and bytecode generation
├── type-system.js          # Type management and casting
├── wasm-generator.js       # Final WebAssembly binary assembly
└── utils.js                # Shared utility functions

-------------------------------------------------------------------------------
MODULE DESCRIPTIONS
-------------------------------------------------------------------------------

compiler.js - Main Compiler Entry Point
Purpose: The main coordinator class that orchestrates the entire compilation process.

Key Responsibilities:
- Initialization: Takes source code as input and manages the overall compilation workflow
- Workflow Coordination: Calls other modules in the correct sequence (tokenization → parsing → code generation)
- Function Signature Processing: First pass through tokens to identify and catalog all function signatures
- Function Body Processing: Second pass to parse function implementations
- Final Assembly: Combines all parsed components and delegates to WASM generator
- Public API: Provides the main compile() method for external usage

Main Components:
- TopsCompiler class with constructor taking source code
- compile() method that returns WebAssembly binary
- parseFunctionSignatures() and parseFunctionBodies() helper methods

tokenizer.js - Lexical Analysis Module
Purpose: Converts raw source code text into a sequence of meaningful tokens.

Key Responsibilities:
- Comment Removal: Strips out // style comments before tokenization
- Character Literal Handling: Processes single-quoted characters with escape sequences (\n, \t, \\, etc.)
- Number Recognition: Identifies integers, floats, binary numbers (0b prefix), and special values (inf, -inf)
- Operator Recognition: Handles multi-character operators (<=, >=, ==, !=, &&, ||, etc.)
- Whitespace Handling: Properly separates tokens while ignoring irrelevant whitespace
- Token Classification: Distinguishes between identifiers, keywords, literals, and operators

Main Components:
- Tokenizer class with preprocess() and tokenize() methods
- State management for character position and token building
- Special handling for negative numbers and scientific notation

type-system.js - Type Management System
Purpose: Manages all type-related operations including type mapping, casting, and binary operations.

Key Responsibilities:
- Type Mapping: Maps language types (int4, float8, etc.) to WebAssembly type codes
- Type Resolution: Determines effective types for mixed-type expressions (e.g., int4 + float4 = float4)
- Cast Generation: Creates WebAssembly opcodes for type conversions between different types
- Binary Operation Mapping: Provides correct opcodes for operations based on type (signed vs unsigned, 32-bit vs 64-bit)
- Type Promotion: Handles implicit type conversions and promotions

Main Components:
- typeMap: Object mapping type names to WASM type codes
- resolveEffectiveType(): Function for type inference in expressions
- generateCastOps(): Function creating conversion opcodes
- getBinOp(): Function mapping operators to WASM opcodes based on type

parser.js - Syntax Analysis and AST Generation
Purpose: Parses tokens into WebAssembly bytecode, handling all language constructs and expressions.

Key Responsibilities:
- Expression Parsing: Recursive descent parsing of mathematical, logical, and comparison expressions
- Statement Parsing: Handles control flow (if, loop, break), variable declarations, assignments, and try/catch blocks
- Scope Management: Tracks variable declarations across nested scopes and function parameters
- Type Tracking: Maintains type information through expression trees
- Control Flow: Manages break targets, exception handling locals, and control depth
- Variable Resolution: Finds variable locations in current and parent scopes

Main Components:
- Parser class with token stream and scope management
- Expression parsing methods: parseExpression(), parseLogicalOr(), parseComparison(), etc.
- Statement parsing: parseStatement() with cases for all statement types
- Scope stack for variable lookup and management

wasm-generator.js - WebAssembly Binary Generation
Purpose: Creates the final WebAssembly binary format from parsed function bodies.

Key Responsibilities:
- Binary Format Assembly: Constructs the proper WebAssembly binary format with all required sections
- Section Generation: Creates type, function, export, and code sections
- Function Export: Determines which functions to export based on public keyword or main function
- Length Encoding: Properly encodes section sizes using LEB128 format
- Magic Bytes: Adds the required WASM header (0x00 0x61 0x73 0x6D)

Main Components:
- WasmGenerator class with generate() method
- Section construction logic for all WASM sections
- Export filtering based on visibility rules
- Proper binary format compliance

utils.js - Utility Functions
Purpose: Provides common utility functions used across multiple modules.

Key Responsibilities:
- Integer Casting: uintCast utility for converting to unsigned integers
- LEB128 Encoding: Variable-length encoding for integers in WebAssembly format
  - sleb(): Signed LEB128 encoding for signed integers
  - uleb(): Unsigned LEB128 encoding for unsigned integers
- Length Prefixing: withLen() function to add length prefixes to data sections
- Cross-Module Utilities: Functions used by other components

Main Components:
- uintCast object with casting utilities
- sleb() and uleb() encoding functions
- withLen() helper for section creation
- Exported for use by other modules

-------------------------------------------------------------------------------
USAGE
-------------------------------------------------------------------------------

import TopsCompiler from './tops-compiler/index.js';

const sourceCode = `
public func add(float8 a, float8 b) -> float8 {
    return a + b;
}
`;

const compiler = new TopsCompiler(sourceCode);
const wasmBinary = compiler.compile();

-------------------------------------------------------------------------------
SUPPORTED LANGUAGE FEATURES
-------------------------------------------------------------------------------

- Data Types: bool, int1/int2/int4/int8, uint1/uint2/uint4/uint8, char, float4/float8
- Control Flow: if statements, loops, break statements, try/catch/throw exception handling
- Functions: with parameter types and return types, public/private visibility
- Operators: Arithmetic, comparison, logical, and bitwise operations
- Literals: Integer, floating-point, character, and boolean literals

-------------------------------------------------------------------------------
BENEFITS OF MODULARIZATION
-------------------------------------------------------------------------------

1. Separation of Concerns: Each file handles one specific aspect of compilation
2. Maintainability: Easier to locate and modify specific functionality
3. Testability: Individual modules can be tested independently
4. Reusability: Type system and utilities can be used by other components
5. Readability: Each file is focused and easier to understand
6. Team Development: Multiple developers can work on different modules simultaneously
7. Debugging: Issues can be isolated to specific modules more easily

-------------------------------------------------------------------------------
DEPENDENCIES
-------------------------------------------------------------------------------

- Modern JavaScript environment supporting ES6 modules
- BigInt support for integer operations
- Float32Array/Float64Array for floating-point operations

-------------------------------------------------------------------------------
LICENSE
-------------------------------------------------------------------------------

[Add your license information here]