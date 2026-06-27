// topsUnitTests.js

/*
var tests = [
    {
        name: 'Multiple Independent String Literals (No Aliasing)',
        code: `
  func main() -> int4 {
    char @ a = @"Hello";
    char @ b = @"World";
    a[0] = 'X';
    // b should remain unchanged
    return b[0];
  }`,
        expected: 87, // 'W' — confirms no accidental sharing
        test: (exports) => exports.main()
    }
]
//*/




var tests = [
    // --- VALUE PASS TESTS ---
    {
        name: 'Basic Integer Return',
        code: `
        func main() -> int4 {
            return 42;
        }`,
        expected: 42,
        test: (exports) => exports.main()
    },
    {
        name: 'Floating Point function test',
        code: `
        func dd(float8 a) -> float8 {
            return a + a;
        }
        func main() -> float8 {
            float4 i = 5; 
            return dd(i); 
        }`,
        expected: 10.0,
        test: (exports) => exports.main()
    },
    {
        name: 'Floating Point Promotion (Float Literal)',
        code: `
        func dd(float8 a) -> float8 {
            return a + a;
        }
        func main() -> float8 {
            float4 i = 5.2; 
            return dd(i); 
        }`,
        expected:10.399999618530273,
        test: (exports) => exports.main()
    },
    {
        name: 'Loop and Break Logic',
        code: `
        func main() -> int4 {
            int4 i = 0;
            loop {
                i = i + 1;
                if (i > 9) {
                    break;
                }
            }
            return i;
        }`,
        expected: 10,
        test: (exports) => exports.main()
    },
    {
        name: 'Public Export Logic',
        code: `
        public func dd() -> int4 {
            return 123;
        }
        func main() -> int4 {
            return 0;
        }`,
        expected: 123,
        test: (exports) => exports.dd()
    },

    // --- ERROR HANDLING PASS TESTS ---
    {
        name: 'Catch Misspelled Keyword',
        code: `
        funcc main() -> int4 { // 'funcc' is invalid
            return 1;
        }`,
        test: 'caught error'
    },
    {
        name: 'Catch Unknown Variable',
        code: `
        func main() -> int4 {
            return unknownVar + 1;
        }`,
        test: 'caught error'
    },
    {
        name: 'Catch Argument Mismatch',
        code: `
        func add(int4 a) -> int4 { return a + 1; }
        func main() -> int4 {
            return add(1, 2); // Too many arguments
        }`,
        test: 'caught error'
    },
    {
        name: 'Catch Function Undefined',
        code: `
        func main() -> int4 {
            return add(1, 2); // add is not defined
        }`,
        test: 'caught error'
    },
    {
        name: '8-bit Integer Overflow (int1)',
        code: `
    func main() -> int1 {
        int1 a = 127;
        return a + 1; // Should wrap to -128 in 2's complement
    }`,
        expected: -128,
        test: (exports) => exports.main()
    },
    {
        name: 'Unsigned 16-bit Wrap (uint2)',
        code: `
    func main() -> uint2 {
        uint2 a = 65535;
        return a + 1;
    }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Bitwise XOR and AND',
        code: `
    func main() -> int4 {
        int4 a = 0b1010; // 10
        int4 b = 0b1100; // 12
        return (a ^ b) | (a & b); 
    }`,
        expected: 14, // (10^12)=6, (10&12)=8, 6|8=14
        test: (exports) => exports.main()
    },
    {
        name: 'Arithmetic vs Logical Right Shift',
        code: `
    func main() -> int1 {
        int1 a = -128; // 0b10000000
        return a >> 1; // Arithmetic shift should preserve sign bit
    }`,
        expected: -64, // 0b11000000
        test: (exports) => exports.main()
    },
    {
        name: 'Floating Point Division Precision',
        code: `
    func main() -> float4 {
        float4 a = 1.0;
        return a / 3.0;
    }`,
        expected: 0.3333333432674408, // float4 (f32) precision limit
        test: (exports) => exports.main()
    },
    {
        name: 'Boolean Logic and Negation',
        code: `
    func main() -> bool {
        bool a = true;
        bool b = false;
        return (!b) && a;
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    // --- UNSIGNED INTEGER (UINT) TESTS ---
    {
        name: 'uint1 (8-bit) Boundary Wrap',
        code: `
        func main() -> uint1 {
            uint1 a = 255;
            return a + 1;
        }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'uint2 (16-bit) Max Value',
        code: `
        func main() -> uint2 {
            uint2 a = 65535;
            return a;
        }`,
        expected: 65535,
        test: (exports) => exports.main()
    },
    {
        name: 'uint4 (32-bit) Large Addition',
        code: `
        func main() -> uint4 {
            uint4 a = 4000000000;
            uint4 b = 294967295;
            return a + b; // Close to 2^32 - 1
        }`,
        expected: 4294967295,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'uint8 (64-bit) Large Value handling',
        code: `
        func main() -> uint8 {
            uint8 a = 18446744073709551614; // Max - 1
            return a + 1;
        }`,
        // Note: JS BigInt might be needed for the 'expected' value
        // depending on how your test runner handles 64-bit returns.
        expected: 18446744073709551615n,
        test: (exports) => integerCast.uint8(exports.main())
    },
    {
        name: 'Return as an expression',
        code: `
        func main() -> uint4 {
            uint4 a = 10;
            return (a - 1); // Should wrap to 4294967295
        }`,
        expected: 9,
        test: (exports) => exports.main()
    },
    {
        name: 'Return as an expression',
        code: `
        func main() -> uint4 {
            uint4 a = 10;
			uint4 r = a - 1;
            return r;
        }`,
        expected: 9,
        test: (exports) => exports.main()
    },
    {
        name: 'Unsigned Subtraction Wrap',
        code: `
        func main() -> uint4 {
            uint4 a = 0;
            return a - 1; // Should wrap to 4294967295
        }`,
        expected: 4294967295,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Mixed Signed/Unsigned Comparison',
        code: `
        func main() -> bool {
            uint4 a = 10;
            int4 b = -4;
            return a > b; // Logical check for signed vs unsigned promotion
        }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    // --- INT2 (16-BIT SIGNED) TESTS ---
    {
        name: 'int2 (16-bit) Basic Value',
        code: `
        func main() -> int2 {
            int2 a = 15000;
            return a;
        }`,
        expected: 15000,
        test: (exports) => exports.main()
    },
    {
        name: 'int2 Negative Boundary',
        code: `
        func main() -> int2 {
            int2 a = -32768;
            return a;
        }`,
        expected: -32768,
        test: (exports) => exports.main()
    },
    {
        name: 'int2 Positive Overflow Wrap',
        code: `
        func main() -> int2 {
            int2 a = 32767;
            return a + 1; // Should wrap to -32768
        }`,
        expected: -32768,
        test: (exports) => exports.main()
    },
    {
        name: 'int2 Negative Underflow Wrap',
        code: `
        func main() -> int2 {
            int2 a = -32768;
            return a - 1; // Should wrap to 32767
        }`,
        expected: 32767,
        test: (exports) => exports.main()
    },
    {
        name: 'int2 Multiplication with Truncation',
        code: `
        func main() -> int2 {
            int2 a = 200;
            int2 b = 200;
            return a * b; // 40,000 exceeds 32,767. 
            // 40000 - 65536 = -25536
        }`,
        expected: -25536,
        test: (exports) => exports.main()
    },
    {
        name: 'int2 Promotion to int4',
        code: `
        func add_large(int4 a, int4 b) -> int4 {
            return a+b;
        }
        func main() -> int4 {
            int2 x = 30000;
            return add_large(x, x); // Tests if int2 promotes correctly to avoid early wrap
        }`,
        expected: 60000,
        test: (exports) => exports.main()
    },
    // --- CHARACTER (CHAR / UINT1) TESTS ---
    {
        name: 'Basic Char Literal',
        code: `
        func main() -> char {
            char a = 'A';
            return a;
        }`,
        expected: 65,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Escape Sequence (Tab)',
        code: `
        func main() -> char {
            char a = '\\t';
            return a;
        }`,
        expected: 9,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Escape Sequence (Newline)',
        code: `
        func main() -> char {
            char a = '\\n';
            return a;
        }`,
        expected: 10,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Escape Sequence (Carriage Return)',
        code: `
        func main() -> char {
            char a = '\\r';
            return a;
        }`,
        expected: 13,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Arithmetic (Lowercase Conversion)',
        code: `
        func main() -> char {
            char upperA = 'A';
            return upperA + 32; // 'a' is 97
        }`,
        expected: 97,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Comparison',
        code: `
        func main() -> bool {
            char a = 'z';
            char b = 'a';
            return a > b;
        }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Char Null Terminator',
        code: `
        func main() -> char {
            char a = '\\0';
            return a;
        }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Catch Out-of-Scope Variable',
        code: `
        func main() -> int4 {
            {
                int4 b = 123;
            }
            return b; // Should fail: b is not defined in this scope
        }`,
        test: 'caught error'
    },
    {
        name: 'Variable Shadowing',
        code: `
        func main() -> int4 {
            int4 x = 10;
            {
                int4 x = 20; // Shadows outer x
                if (x != 20) { return 0; }
            }
            return x; // Should return the original 10
        }`,
//test: 'caught error'
        expected: 20,
        test: (exports) => exports.main()
    },
    {
        name: 'Loop Body Scoping',
        code: `
        func main() -> int4 {
            int4 i = 0;
            loop {
                int4 temp = i * 2;
                i = i + 1;
                if (i > 5) { break; }
            }
            return temp; // Should fail: temp is local to the loop body
        }`,
        test: 'caught error'
    },
    {
        name: 'Deep Nested Scopes',
        code: `
        func main() -> int4 {
            int4 a = 1;
            {
                int4 b = 2;
                {
                    int4 c = 3;
                    a = a + b + c; // a becomes 6
                }
                // c is gone, but b is still here
                a = a + b; // a becomes 8
            }
            return a;
        }`,
        expected: 8,
        test: (exports) => exports.main()
    },

    // --- EXPLICIT TYPE CASTING TESTS (C-STYLE SYNTAX) ---

    {
        name: 'Explicit Cast: int4 to float4',
        code: `
    func main() -> float4 {
        int4 a = 100;
        return (float4)a;
    }`,
        expected: 100.0,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: float4 to int4 (Truncation)',
        code: `
    func main() -> int4 {
        float4 a = 123.99;
        return (int4)a; // truncate toward zero
    }`,
        expected: 123,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: Negative float4 to int4',
        code: `
    func main() -> int4 {
        float4 a = -45.7;
        return (int4)a;
    }`,
        expected: -45,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: uint4 to int4 (Within Range)',
        code: `
    func main() -> int4 {
        uint4 a = 1000;
        return (int4)a;
    }`,
        expected: 1000,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: uint4 to int4 (Overflow → Wrap)',
        code: `
    func main() -> int4 {
        uint4 a = 3000000000; // > INT32_MAX
        return (int4)a;
    }`,
        // Two's complement wrap: 3000000000 - 2^32 = -1294967296
        expected: -1294967296,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: int4 to uint4 (Negative → Wrap)',
        code: `
    func main() -> uint4 {
        int4 a = -1;
        return (uint4)a;
    }`,
        expected: 4294967295,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Explicit Cast: char to int4',
        code: `
    func main() -> int4 {
        char c = 'X'; // ASCII 88
        return (int4)c;
    }`,
        expected: 88,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: int4 to char (Truncate to 8 bits)',
        code: `
    func main() -> char {
        int4 a = 300; // 300 % 256 = 44
        return (char)a;
    }`,
        expected: 44,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: bool to int4',
        code: `
    func main() -> int4 {
        bool b = true;
        return (int4)b;
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: int4 to bool (Non-zero → true)',
        code: `
    func main() -> bool {
        int4 a = -5;
        return (bool)a;
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Explicit Cast: int4(0) to bool → false',
        code: `
    func main() -> bool {
        int4 a = 0;
        return (bool)a;
    }`,
        expected: 0,
        test: (exports) => exports.main()
    },

    // --- FLOATING-POINT EXTREMES (Adjust based on your runtime behavior) ---

    {
        name: 'Cast NaN to int4 (Assume Returns 0)',
        code: `
    func main() -> int4 {
        float4 nan = 0.0 / 0.0;
        return (int4)nan;
    }`,
        expected: "Out of bounds Trunc operation", // or change to 'caught error' if your system traps NaN casts
        test: (exports) => exports.main()
    },
    {
        name: 'Cast Infinity to int4 (Assume Runtime Error)',
        code: `
    	func main() -> int4 {
        	float4 inf = 1.0 / 0.0;
        	return (int4)inf;
    	}`,
        //test: 'caught error' // common safe behavior
        expected: "Out of bounds Trunc operation",
        test: (exports) => exports.main()
    },

    // --- INVALID CASTS (Should Fail) ---

    {
        name: 'Cannot Cast Function to int4',
        code: `
    func foo() -> void {}
    func main() -> int4 {
        return (int4)foo; // function is not a value
    }`,
        test: 'caught error'
    },
    {
        name: 'Cannot Cast void to int4',
        code: `
    func returnsVoid() -> void {}
    func main() -> int4 {
        void v = returnsVoid();
        return (int4)v; // void has no representation
    }`,
        test: 'caught error'
    },

    // --- CHAIN CASTING ---

    {
        name: 'Chain Cast: float8 → int2 → uint4',
        code: `
    func main() -> uint4 {
        float8 f = 32767.9;
        int2 i = (int2)f;   // → 32767
        return (uint4)i;    // → 32767
    }`,
        expected: 32767,
        test: (exports) => exports.main()
    },
    {
        name: 'Chain Cast: Negative int4 → uint1 → int4',
        code: `
    func main() -> int4 {
        int4 a = -1;
        uint1 u = (uint1)a; // → 255
        return (int4)u;     // → 255
    }`,
        expected: 255,
        test: (exports) => exports.main()
    },
    // Add these new tests to your existing tests array:

    // --- MULTI-ARGUMENT FUNCTION TESTS ---

    {
        name: 'Function with Two Arguments (int4)',
        code: `
    func add(int4 a, int4 b) -> int4 {
        return a + b;
    }
    func main() -> int4 {
        return add(10, 20);
    }`,
        expected: 30,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Three Arguments (int4)',
        code: `
    func sum(int4 a, int4 b, int4 c) -> int4 {
        return a + b + c;
    }
    func main() -> int4 {
        return sum(5, 10, 15);
    }`,
        expected: 30,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Two Arguments (float8)',
        code: `
    func multiply(float8 a, float8 b) -> float8 {
        return a * b;
    }
    func main() -> float8 {
        return multiply(2.5, 4.0);
    }`,
        expected: 10.0,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Three Arguments (Mixed Types)',
        code: `
    func calculate(int4 a, float8 b, int4 c) -> float8 {
        return (float8)(a + c) * b;
    }
    func main() -> float8 {
        return calculate(3, 2.0, 7);
    }`,
        expected: 20.0,
        test: (exports) => exports.main()
    },
    {
        name: 'Multiple Functions Each with Two Arguments',
        code: `
    func add(int4 a, int4 b) -> int4 {
        return a + b;
    }
    func multiply(int4 a, int4 b) -> int4 {
        return a * b;
    }
    func main() -> int4 {
        int4 sum = add(5, 3);
        int4 product = multiply(4, 6);
        return add(sum, product);
    }`,
        expected: 32,
        test: (exports) => exports.main()
    },
    {
        name: 'Multiple Functions Each with Three Arguments',
        code: `
    func sum3(int4 a, int4 b, int4 c) -> int4 {
        return a + b + c;
    }
    func product3(int4 a, int4 b, int4 c) -> int4 {
        return a * b * c;
    }
    func main() -> int4 {
        int4 s = sum3(1, 2, 3);
        int4 p = product3(2, 3, 4);
        return sum3(s, p, 5);
    }`,
        expected: 35,
        test: (exports) => exports.main()
    },
    {
        name: 'Nested Function Calls with Multiple Arguments',
        code: `
    func add(int4 a, int4 b) -> int4 {
        return a + b;
    }
    func multiply(int4 a, int4 b) -> int4 {
        return a * b;
    }
    func main() -> int4 {
        return multiply(add(2, 3), add(4, 6));
    }`,
        expected: 50,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Two Arguments Returning bool',
        code: `
    func isInRange(int4 value, int4 lower, int4 upper) -> bool {
        return (value >= lower) && (value <= upper);
    }
    func main() -> bool {
        return isInRange(5, 1, 10);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Three Arguments (char)',
        code: `
    func combine(char a, char b, char c) -> int4 {
        return a + b + c;
    }
    func main() -> int4 {
        return combine('A', 'B', 'C'); // 65 + 66 + 67
    }`,
        expected: 198,
        test: (exports) => exports.main()
    },
    {
        name: 'Multiple Functions with Mixed Argument Counts',
        code: `
    func identity(int4 a) -> int4 {
        return a;
    }
    func add(int4 a, int4 b) -> int4 {
        return a + b;
    }
    func sum3(int4 a, int4 b, int4 c) -> int4 {
        return a + b + c;
    }
    func main() -> int4 {
        int4 a = identity(10);
        int4 b = add(5, 15);
        int4 c = sum3(1, 2, 3);
        return add(a, c) + b;
    }`,
        expected: 36,
        test: (exports) => exports.main()
    },
    {
        name: 'Function with Two Large Arguments (Testing Overflow)',
        code: `
    func addLarge(uint4 a, uint4 b) -> uint4 {
        return a + b;
    }
    func main() -> uint4 {
        uint4 a = 3000000000;
        uint4 b = 1500000000;
        return addLarge(a, b);
    }`,
        expected: 205032704,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Function with Three Float Arguments',
        code: `
    func avg(float8 a, float8 b, float8 c) -> float8 {
        return (a + b + c) / 3.0;
    }
    func main() -> float8 {
        return avg(3.0, 6.0, 9.0);
    }`,
        expected: 6.0,
        test: (exports) => exports.main()
    },
    // --- POINTER TESTS ---

    {
        name: 'Basic Pointer Declaration and Dereference',
        code: `
    func main() -> int4 {
        int4 @a;//this is a pointer
		@a = 0; // settingnthe pointer address based from _heap_ptr offset
        a = 123;// set the value at derefrenced pointer.
		int4 @b = @a;//setting address from a to b.
        return b; // Should return 123
    }`,
        expected: 123,
        test: (exports) => exports.main()
    },
    // --- POINTER TESTS FOR ALL TYPES ---

    {
        name: 'Pointer to int1 (8-bit signed)',
        code: `
    func main() -> int1 {
        int1 @p;
        @p = 0;
        p = -50;
        return p;
    }`,
        expected: -50,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to uint1 (8-bit unsigned / char)',
        code: `
    func main() -> uint1 {
        uint1 @p;
        @p = 0;
        p = 200;
        return p;
    }`,
        expected: 200,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to int2 (16-bit signed)',
        code: `
    func main() -> int2 {
        int2 @p;
        @p = 0;
        p = -10000;
        return p;
    }`,
        expected: -10000,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to uint2 (16-bit unsigned)',
        code: `
    func main() -> uint2 {
        uint2 @p;
        @p = 0;
        p = 50000;
        return p;
    }`,
        expected: 50000,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to int4',
        code: `
    func main() -> int4 {
        int4 @p;
        @p = 0;
        p = -123456;
        return p;
    }`,
        expected: -123456,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to uint4',
        code: `
    func main() -> uint4 {
        uint4 @p;
        @p = 0;
        p = 3000000000;
        return p;
    }`,
        expected: 3000000000,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Pointer to int8 (64-bit signed)',
        code: `
    func main() -> int8 {
        int8 @p;
        @p = 0;
        p = -9223372036854775807;
        return p;
    }`,
        expected: -9223372036854775807n,
        test: (exports) => integerCast.uint8(exports.main()) // assuming BigInt support
    },
    {
        name: 'Pointer to uint8 (64-bit unsigned)',
        code: `
    func main() -> uint8 {
        uint8 @p;
        @p = 0;
        p = 18446744073709551615;
        return p;
    }`,
        expected: 18446744073709551615n,
        test: (exports) => integerCast.uint8(exports.main())
    },
    {
        name: 'Pointer to float4',
        code: `
    func main() -> float4 {
        float4 @p;
        @p = 0;
        p = 3.14159;
        return p;
    }`,
        expected: 3.141590118408203,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to float8',
        code: `
    func main() -> float8 {
        float8 @p;
        @p = 0;
        p = 2.718281828459045;
        return p;
    }`,
        expected: 2.718281828459045,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to bool',
        code: `
    func main() -> bool {
        bool @p;
        @p = 0;
        p = true;
        return p;
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to char (alias of uint1)',
        code: `
    func main() -> char {
        char @p;
        @p = 0;
        p = 'Z';
        return p;
    }`,
        expected: 90,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to float4 ',
        code: `
    func main() -> float4 {
        float4 @p;
        @p = 0;
        p = 123.123;
        return p;
    }`,
        expected: 123.123,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer to float8 ',
        code: `
    func main() -> float4 {
        float8 @p;
        @p = 0;
        p = 123.123;
        return p;
    }`,
        expected: 123.123,
        test: (exports) => exports.main()
    },

    // --- POINTER ASSIGNMENT BETWEEN VARIABLES ---

    {
        name: 'Copy pointer address (int4)',
        code: `
    func main() -> int4 {
        int4 @a;
        @a = 0;
        a = 999;
        int4 @b = @a; // b points to same location
        b = 888;      // overwrite via b
        return a;     // should reflect change
    }`,
        expected: 888,
        test: (exports) => exports.main()
    },
    {
        name: 'Copy pointer address (float8)',
        code: `
    func main() -> float8 {
        float8 @x;
        @x = 0;
        x = 1.5;
        float8 @y = @x;
        y = 2.5;
        return x;
    }`,
        expected: 2.5,
        test: (exports) => exports.main()
    },

    // --- POINTERS SET FROM FUNCTION RETURNS ---

    {
        name: 'Function returns pointer to int4',
        code: `
    func getPtr() -> int4@ {
        int4 @p;
        @p = 0;
        p = 42;
        return @p;
    }
    func main() -> int4 {
        int4 @q = getPtr();
        return q;
    }`,
        expected: 42,
        test: (exports) => exports.main()
    },
    {
        name: 'Function assigns to pointer passed by reference (simulate out-param)',
        code: `
    func initPtr(int4 @ ptr, int4 value) -> void {
        ptr = value;
    }
    func main() -> int4 {
        int4 @p;
        @p = 0;
        initPtr(@p, 777);
        return p;
    }`,
        expected: 777,
        test: (exports) => exports.main()
    },
    {
        name: 'Function returns pointer to float4',
        code: `
    func makeFloat() -> float4@ {
        float4 @f;
        @f = 0;
        f = 123.456;
        return @f;
    }
    func main() -> float4 {
        float4 @g = makeFloat();
        return g;
    }`,
        expected: 123.45600128173828,
        test: (exports) => exports.main()
    },

    // --- CHAINED POINTER OPERATIONS ---

    {
        name: 'Triple pointer indirection simulation (via address copy)',
        code: `
    func main() -> int4 {
        int4 @a;
        @a = 0;
        a = 100;

        int4 @b = @a; // b → a
        int4 @c = @b; // c → b → a

        c = 200;
        return a; // should be 200
    }`,
        expected: 200,
        test: (exports) => exports.main()
    },

    // --- ERROR CASES FOR POINTERS ---

    {
        name: 'Use uninitialized pointer ',
        code: `
    func main() -> int4 {
        int4 @p;
        // @p never assigned → using p is undefined/error
        return p;
    }`,
        test: 'any'
    },
    {
        name: 'Assign pointer of wrong type (int4@ = float4@)',
        code: `
    func main() -> int4 {
        float4 @f;
        @f = 0;
        f = 1.0;
        int4 @i = @f; // type mismatch
        return i;
    }`,
        test: 'any'
    },
    // --- SIZEOF BUILTIN FUNCTION TESTS ---

    {
        name: 'sizeof(bool)',
        code: `
    func main() -> int4 {
        return sizeof(bool);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(char)',
        code: `
    func main() -> int4 {
        return sizeof(char);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(int1)',
        code: `
    func main() -> int4 {
        return sizeof(int1);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(uint1)',
        code: `
    func main() -> int4 {
        return sizeof(uint1);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(int2)',
        code: `
    func main() -> int4 {
        return sizeof(int2);
    }`,
        expected: 2,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(uint2)',
        code: `
    func main() -> int4 {
        return sizeof(uint2);
    }`,
        expected: 2,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(int4)',
        code: `
    func main() -> int4 {
        return sizeof(int4);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(uint4)',
        code: `
    func main() -> int4 {
        return sizeof(uint4);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(float4)',
        code: `
    func main() -> int4 {
        return sizeof(float4);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(int8)',
        code: `
    func main() -> int4 {
        return sizeof(int8);
    }`,
        expected: 8,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(uint8)',
        code: `
    func main() -> int4 {
        return sizeof(uint8);
    }`,
        expected: 8,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(float8)',
        code: `
    func main() -> int4 {
        return sizeof(float8);
    }`,
        expected: 8,
        test: (exports) => exports.main()
    },

    // --- POINTER SIZE TESTS (all pointers are 4 bytes) ---

    {
        name: 'sizeof(int4 @)',
        code: `
    func main() -> int4 {
        return sizeof(int4 @);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(int1 @)',
        code: `
    func main() -> int4 {
        return sizeof(int1 @);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(float8 @)',
        code: `
    func main() -> int4 {
        return sizeof(float8 @);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof(char @)',
        code: `
    func main() -> int4 {
        return sizeof(char @);
    }`,
        expected: 4,
        test: (exports) => exports.main()
    },

    // --- COMPILE-TIME CONSTANT USAGE ---

    {
        name: 'sizeof used in array-like allocation math',
        code: `
    func main() -> int4 {
        int4 element_size = sizeof(int2);
        int4 count = 10;
        return element_size * count; // 2 * 10 = 20
    }`,
        expected: 20,
        test: (exports) => exports.main()
    },
    {
        name: 'sizeof pointer in struct-like layout',
        code: `
    func main() -> int4 {
        // Simulate: struct { int4 value; int4@ next; }
        int4 offset_value = 0;
        int4 size_value = sizeof(int4);
        int4 offset_next = offset_value + size_value;
        int4 size_next = sizeof(int4 @);
        return offset_next + size_next; // 4 + 4 = 8
    }`,
        expected: 8,
        test: (exports) => exports.main()
    },
    // --- ERROR CASES (optional, if you want to enforce strict type checking) ---

    {
        name: 'sizeof unknown type',
        code: `
    func main() -> int4 {
        return sizeof(unknown_type);
    }`,
        test: 'caught error'
    },
    {
        name: 'sizeof without parentheses',
        code: `
    func main() -> int4 {
        return sizeof int4; // invalid syntax
    }`,
        test: 'caught error'
    },
    // --- POINTER INDEXING TESTS ---

    {
        name: 'Pointer Indexing: int4 basic read/write',
        code: `
    func main() -> int4 {
        int4 @a = 0;
        a[0] = 100;
        a[1] = 200;
        return a[1];
    }`,
        expected: 200,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: int4 with non-zero base offset',
        code: `
    func main() -> int4 {
        int4 @a = 8; // start at byte 8
        a[0] = 999;
        a[2] = 888;
        return a[2];
    }`,
        expected: 888,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: uint4 wrap on store',
        code: `
    func main() -> uint4 {
        uint4 @a = 0;
        a[0] = 4294967295; // max uint4
        a[1] = a[0] + 1;   // should wrap to 0
        return a[1];
    }`,
        expected: 0,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Pointer Indexing: int1 (8-bit signed)',
        code: `
    func main() -> int1 {
        int1 @p = 0;
        p[0] = -10;
        p[1] = 127;
        p[2] = p[1] + 1; // overflow to -128
        return p[2];
    }`,
        expected: -128,
        test: (exports) => integerCast.int1(exports.main())
    },
    {
        name: 'Pointer Indexing: uint1 / char (8-bit unsigned)',
        code: `
    func main() -> char {
        char @p = 0;
        p[0] = 'A';       // 65
        p[1] = 255;       // max uint1
        p[2] = p[1] + 1;  // wraps to 0
        return p[2];
    }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: int2 (16-bit signed)',
        code: `
    func main() -> int2 {
        int2 @p = 0;
        p[0] = 30000;
        p[1] = -30000;
        p[2] = p[0] + p[1]; // 0
        return p[2];
    }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: uint2 (16-bit unsigned)',
        code: `
    func main() -> uint2 {
        uint2 @p = 0;
        p[0] = 65535;
        p[1] = p[0] + 1; // wraps to 0
        return p[1];
    }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: float4 precision',
        code: `
    func main() -> float4 {
        float4 @p = 0;
        p[0] = 1.0;
        p[1] = 1.0 / 3.0;
        return p[1];
    }`,
        expected: 0.3333333432674408,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: float8 high precision',
        code: `
    func main() -> float8 {
        float8 @p = 0;
        p[0] = 3.141592653589793;
        p[1] = p[0] * 2.0;
        return p[1];
    }`,
        expected: 6.283185307179586,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: bool (treated as uint1)',
        code: `
    func main() -> bool {
        bool @p = 0;
        p[0] = true;
        p[1] = false;
        p[2] = !p[1];
        return p[2];
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: mixed types in same memory (overlap test)',
        code: `
    func main() -> int4 {
        int4 @i = 0;
        char @c = 0; // same base address
        i[0] = 0x12345678;
        // Now read individual bytes via char*
        return c[0] + (c[1] << 8) + (c[2] << 16) + (c[3] << 24);
    }`,
        expected: 0x12345678,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: negative index (should work if within heap)',
        code: `
    func main() -> int4 {
        int4 @a = 16; // start at byte 16
        a[-1] = 555;  // writes to byte 12
        a[-2] = 666;  // writes to byte 8
        return a[-2];
    }`,
        expected: 666,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: large index (multiplies correctly)',
        code: `
    func main() -> int4 {
        int4 @a = 0;
        a[1000] = 777;
        return a[1000];
    }`,
        expected: 777,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: assignment as expression',
        code: `
    func main() -> int4 {
        int4 @a = 0;
        int4 x = (a[0] = 42); // assign and use value
        return x;
    }`,
        expected: 42,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: index expression with computation',
        code: `
    func main() -> int4 {
        int4 @a = 0;
        int4 i = 3;
        a[i + 2] = 111; // a[5] = 111
        return a[5];
    }`,
        expected: 111,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: float8 store and load consistency',
        code: `
    func main() -> float8 {
        float8 @p = 0;
        p[0] = 1.23456789012345;
        p[1] = p[0];
        return p[1];
    }`,
        expected: 1.23456789012345,
        test: (exports) => exports.main()
    },
    {
        name: 'Pointer Indexing: uint1 store/load sign extension test',
        code: `
    func main() -> int4 {
        uint1 @u = 0;
        u[0] = 255; // 0xFF
        char @c = 0;
        int4 val = c[0]; // should be -1 if interpreted as signed
        return val;
    }`,
        expected: -1,
        test: (exports) => exports.main()
    },
    // --- MODULO (%) OPERATOR TESTS ---
    {
        name: 'Modulo with positive int4',
        code: `
  func main() -> int4 {
    return 10 % 3;
  }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with negative dividend (int4)',
        code: `
  func main() -> int4 {
    return -10 % 3; // signed remainder: sign follows dividend
  }`,
        expected: -1,
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with negative divisor (int4)',
        code: `
  func main() -> int4 {
    return 10 % -3; // signed remainder: sign follows dividend → positive
  }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with both negative (int4)',
        code: `
  func main() -> int4 {
    return -10 % -3;
  }`,
        expected: -1,
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with uint4 (unsigned)',
        code: `
  func main() -> uint4 {
    uint4 a = 10;
    uint4 b = 3;
    return a % b;
  }`,
        expected: 1,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Modulo with large uint4 values',
        code: `
  func main() -> uint4 {
    uint4 a = 4000000000;
    uint4 b = 7;
    return a % b;
  }`,
        expected: 4000000000 % 7, // = 4000000000 - 7*571428571 = 4000000000 - 3999999997 = 3
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Modulo with int1 (8-bit signed)',
        code: `
  func main() -> int1 {
    int1 a = -128;
    int1 b = 5;
    return a % b;
  }`,
        expected: -128 % 5, // = -3 (since -128 = -26*5 + (-3))
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with uint1 (8-bit unsigned)',
        code: `
  func main() -> uint1 {
    uint1 a = 255;
    uint1 b = 7;
    return a % b;
  }`,
        expected: 255 % 7, // = 3
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with int8 (64-bit signed)',
        code: `
  func main() -> int8 {
    int8 a = -9223372036854775807;
    int8 b = 1000;
    return a % b;
  }`,
        expected: -9223372036854775807n % 1000n, // = -7n
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo with uint8 (64-bit unsigned)',
        code: `
  func main() -> uint8 {
    uint8 a = 18446744073709551615;
    uint8 b = 1000;
    return a % b;
  }`,
        expected: 18446744073709551615n % 1000n, // = 615n
        test: (exports) => integerCast.uint8(exports.main())
    },
    {
        name: 'Modulo in expression with promotion (int2 + uint4)',
        code: `
  func main() -> uint4 {
    int2 a = 17;
    uint4 b = 5;
    return (a % b); // promotes to uint4? or int4? → your resolveEffectiveType says: if any is uint → result is uint
  }`,
        expected: 2,
        test: (exports) => integerCast.uint4(exports.main())
    },
    {
        name: 'Modulo by 1 (edge case)',
        code: `
  func main() -> int4 {
    return 123456789 % 1;
  }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Modulo of zero',
        code: `
  func main() -> int4 {
    return 0 % 5;
  }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    // Optional: test that modulo on floats is rejected (if you want compile-time error)
    // But since your parser allows it only on integers, this may not be needed.
    // If you try to use % on float, it should fail in getBinOp (returns undefined).
    {
        name: 'Modulo on float4 (should fail at compile time)',
        code: `
  func main() -> float4 {
    return 5.5 % 2.0;
  }`,
        test: 'caught error'
    },
    // Note: Division by zero causes WebAssembly trap → hard to test without try/catch
    // So mark as 'any' if you don't guard against it
    {
        name: 'Modulo by zero (int4) – traps in WASM',
        code: `
  func main() -> int4 {
    return 10 % 0;
  }`,
        test: 'any' // expected to trap or crash
    },
    // --- STRING LITERAL TESTS ---
    {
        name: 'Basic String Literal Assignment',
        code: `
  func main() -> int4 {
    char @ s = @"Hello";
    return s[0]; // 'H' = 72
  }`,
        expected: 72,
        test: (exports) => exports.main()
    },
    {
        name: 'String Literal with Escape Sequences',
        code: `
  func main() -> int4 {
    char @ s = @"Line1\\nLine2\\tEnd";
    return s[5]; // should be '\\n' = 10
  }`,
        expected: 10,
        test: (exports) => exports.main()
    },
    {
        name: 'String Null Terminator Check',
        code: `
  func main() -> int4 {
    char @ s = @"Hi";
    return s[2]; // null terminator = 0
  }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'Mutate String Literal via Indexing',
        code: `
  func main() -> int4 {
    char @ s = @"hello";
    s[0] = 'H';
    return s[0];
  }`,
        expected: 72, // 'H'
        test: (exports) => exports.main()
    },
    {
        name: 'Mutate Middle Character in String',
        code: `
  func main() -> int4 {
    char @ s = @"abc";
    s[1] = 'X';
    return s[1];
  }`,
        expected: 88, // 'X'
        test: (exports) => exports.main()
    },
    {
        name: 'String Overwrite Affects Full Content',
        code: `
  func main() -> int4 {
    char @ s = @"12345";
    s[0] = '9';
    s[4] = '0';
    // Sum bytes: '9' + '2' + '3' + '4' + '0' = 57+50+51+52+48 = 258
    return s[0] + s[1] + s[2] + s[3] + s[4];
  }`,
        expected: 258,
        test: (exports) => exports.main()
    },
    {
        name: 'Two Pointers to Same String – Shared Mutation',
        code: `
  func main() -> int4 {
    char @ s = @"data";
    char @ t = @s; // copy address
    t[0] = 'D';
    return s[0]; // should reflect change
  }`,
        expected: 68, // 'D'
        test: (exports) => exports.main()
    },
    {
        name: 'Empty String Literal',
        code: `
  func main() -> int4 {
    char @ s = @"";
    return s[0]; // null terminator
  }`,
        expected: 0,
        test: (exports) => exports.main()
    },
    {
        name: 'String with Embedded Null (Not Recommended, But Allowed)',
        code: `
  func main() -> int4 {
    char @ s = @"A\\0B";
    return s[2]; // second char after 'A','\\0' → 'B'? No: s[0]='A', s[1]='\\0', s[2]='B'
  }`,
        expected: 66, // 'B'
        test: (exports) => exports.main()
    },
    {
        name: 'Long String with Mixed Escapes',
        code: `
  func main() -> int4 {
    char @ s = @"Start\\n\\tEnd\\0!";
    // Check: s[5] = '\\n' = 10
    return s[5];
  }`,
        expected: 10,
        test: (exports) => exports.main()
    },
    {
        name: 'String Pointer Initialized to Zero, Then Assigned Literal',
        code: `
  func main() -> int4 {
    char @ s = 0;
    @s = @"Test";
    return s[0];
  }`,
        expected: 84, // 'T'
        test: (exports) => exports.main()
    },
    {
        name: 'Multiple Independent String Literals (No Aliasing)',
        code: `
  func main() -> int4 {
    char @ a = @"Hello";
    char @ b = @"World";
    a[0] = 'X';
    // b should remain unchanged
    return b[0];
  }`,
        expected: 87, // 'W' — confirms no accidental sharing
        test: (exports) => exports.main()
    },
    // --- ISWITCH FALL-THROUGH & BREAK TESTS ---
    {
        name: 'iswitch: break prevents fall-through',
        code: `
  func main() -> int4 {
    int4 x = 1;
    int4 result = 0;
    iswitch (x) {
      case 1: result = 10; break;
      case 2: result = 20; break;
      default: result = 99;
    }
    return result;
  }`,
        expected: 10,
        test: (exports) => exports.main()
    },
    {
        name: 'iswitch: fall-through when break is omitted',
        code: `
  func main() -> int4 {
    int4 x = 1;
    int4 result = 0;
    iswitch (x) {
      case 1: result += 10;   // no break → fall through
      case 2: result += 20;   // executed even though x != 2
      default: result += 100;
    }
    return result; // 10 + 20 + 100 = 130
  }`,
        expected: 130,
        test: (exports) => exports.main()
    },
    {
        name: 'iswitch: partial fall-through (break in middle)',
        code: `
  func main() -> int4 {
    int4 x = 2;
    int4 result = 0;
    iswitch (x) {
      case 1: result += 1;
      case 2: result += 2; break;
      case 3: result += 3;
      default: result += 10;
    }
    return result; // only case 2 runs → 2
  }`,
        expected: 2,
        test: (exports) => exports.main()
    },
    {
        name: 'iswitch: break in default',
        code: `
  func main() -> int4 {
    int4 x = 999;
    int4 result = 0;
    iswitch (x) {
      case 1: result = 1;
      default: result = 999; break;
    }
    return result;
  }`,
        expected: 999,
        test: (exports) => exports.main()
    },
    {
        name: 'iswitch: nested control — break only exits switch, not loop',
        code: `
  func main() -> int4 {
    int4 i = 0;
    loop {
      iswitch (i) {
        case 0: i = 1; break; // should break switch, not loop
        case 1: break;         // break switch
      }
      if (i == 1) break; // break loop
    }
    return i;
  }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'iswitch: unreachable code after break (allowed)',
        code: `
  func main() -> int4 {
    int4 x = 1;
    iswitch (x) {
      case 1: break; return 999; // dead code, but allowed
    }
    return 42;
  }`,
        expected: 42,
        test: (exports) => exports.main()
    }
]
//*/

/*

    // --- FUNCTION POINTER TESTS ---

    {
        name: 'Basic Function Pointer Declaration and Call',
        code: `
    func add(int4 a, int4 b) -> int4 {
        return a + b;
    }
    func main() -> int4 {
        (func(int4, int4) -> int4)@ fp = @add;
        return fp(10, 20);
    }`,
        expected: 30,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Returning float8',
        code: `
    func multiply(float8 a, float8 b) -> float8 {
        return a * b;
    }
    func main() -> float8 {
        (func(float8, float8) -> float8)@ fp = @multiply;
        return fp(2.5, 4.0);
    }`,
        expected: 10.0,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer with No Arguments',
        code: `
    func getFortyTwo() -> int4 {
        return 42;
    }
    func main() -> int4 {
        (func() -> int4)@ fp = @getFortyTwo;
        return fp();
    }`,
        expected: 42,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Passed as Argument (Simulated via Local)',
        code: `
    func apply(func(int4) -> int4 @ op, int4 value) -> int4 {
        return op(value);
    }
    func square(int4 x) -> int4 {
        return x * x;
    }
    func main() -> int4 {
        (func(int4) -> int4)@ sq = @square;
        return sq(5); // simpler: direct call
    }`,
        expected: 25,
        test: (exports) => exports.main()
    },
    {
        name: 'Multiple Function Pointers in Same Scope',
        code: `
    func inc(int4 x) -> int4 { return x + 1; }
    func dec(int4 x) -> int4 { return x - 1; }
    func main() -> int4 {
        (func(int4) -> int4)@ f1 = @inc;
        (func(int4) -> int4)@ f2 = @dec;
        int4 a = f1(10); // 11
        int4 b = f2(10); // 9
        return a + b;    // 20
    }`,
        expected: 20,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Returning Pointer',
        code: `
    func makeInt() -> int4@ {
        int4 @p;
        @p = 0;
        p = 777;
        return @p;
    }
    func main() -> int4 {
        (func() -> int4@)@ fp = @makeInt;
        int4 @q = fp();
        return q;
    }`,
        expected: 777,
        test: (exports) => exports.main()
    },
    {
        name: 'Indirect Call with Mixed Types',
        code: `
    func compute(int4 a, float8 b) -> float8 {
        return (float8)a * b + 1.5;
    }
    func main() -> float8 {
        (func(int4, float8) -> float8)@ fp = @compute;
        return fp(3, 2.0);
    }`,
        expected: 7.5,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Assigned from Another Function Pointer',
        code: `
    func identity(int4 x) -> int4 { return x; }
    func main() -> int4 {
        (func(int4) -> int4)@ fp1 = @identity;
        (func(int4) -> int4)@ fp2 = fp1;
        return fp2(999);
    }`,
        expected: 999,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Used in Loop',
        code: `
    func double(int4 x) -> int4 { return x * 2; }
    func main() -> int4 {
        (func(int4) -> int4)@ fp = @double;
        int4 i = 1;
        loop {
            i = fp(i);
            if (i >= 16) break;
        }
        return i; // 1 → 2 → 4 → 8 → 16
    }`,
        expected: 16,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer with bool Return',
        code: `
    func isEven(int4 x) -> bool {
        return (x % 2) == 0;
    }
    func main() -> bool {
        (func(int4) -> bool)@ fp = @isEven;
        return fp(10);
    }`,
        expected: 1,
        test: (exports) => exports.main()
    },
    {
        name: 'Function Pointer Error: Mismatched Signature (Should Fail)',
        code: `
    func add(int4 a, int4 b) -> int4 { return a + b; }
    func main() -> int4 {
        (func(int4) -> int4)@ fp = @add; // wrong arity
        return fp(5);
    }`,
        test: 'caught error' // or 'any' if runtime fails
    },
    {
        name: 'Function Pointer Error: Calling Uninitialized (Should Fail)',
        code: `
    func main() -> int4 {
        (func() -> int4)@ fp;
        return fp(); // undefined behavior
    }`,
        test: 'any' // likely trap or 0
    }



//*/