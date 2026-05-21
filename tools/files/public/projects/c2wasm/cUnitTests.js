// cUnitTests.js
export const cTests = [
  // --- VALUE PASS TESTS ---
  {
    name: "Basic Integer Return",
    code: `int main() { return 42; }`,
    expected: 42,
    test: (exports) => exports.main()
  },
  {
    name: "Arithmetic Operations",
    code: `int main() { return (10 * 3) + (20 / 2) - 5; }`,
    expected: 35,
    test: (exports) => exports.main()
  },
  {
    name: "Function with Parameters",
    code: `int add(int a, int b) { return a + b; } int main() { return add(15, 27); }`,
    expected: 42,
    test: (exports) => exports.main()
  },
  {
    name: "If/Else Control Flow",
    code: `int main() { int x = 5; if (x > 10) { return 0; } else { return 1; } }`,
    expected: 1,
    test: (exports) => exports.main()
  },
  {
    name: "While Loop & Break",
    code: `int main() { int i = 0; while (i < 10) { i = i + 1; if (i == 4) { break; } } return i; }`,
    expected: 4,
    test: (exports) => exports.main()
  },
  {
    name: "For Loop Accumulation",
    code: `int main() { int sum = 0; for (int i = 0; i < 5; i = i + 1) { sum = sum + i; } return sum; }`,
    expected: 10,
    test: (exports) => exports.main()
  },
  {
    name: "Variable Shadowing",
    code: `int main() { int x = 10; { int x = 20; x = x + 5; } return x; }`,
    expected: 10,
    test: (exports) => exports.main()
  },
  {
    name: "Floating Point Calculation",
    code: `float main() { float a = 3.14; float b = 2.0; return a * b; }`,
    expected: 6.28000020980835,
    test: (exports) => exports.main()
  },
  {
    name: "Boolean Logic & Comparison",
    code: `int main() { int a = 5; int b = 10; if (a < b && b != 5) { return 1; } return 0; }`,
    expected: 1,
    test: (exports) => exports.main()
  },
  {
    name: "String Literal Address (Non-Zero)",
    code: `int main() { char *s = "Hello"; return s != 0; }`,
    expected: 1,
    test: (exports) => exports.main()
  },
  {
    name: "Modulo Operator",
    code: `int main() { return 17 % 5; }`,
    expected: 2,
    test: (exports) => exports.main()
  },
  {
    name: "Bitwise Operations",
    code: `int main() { return (12 & 10) | (5 ^ 3); }`,
    expected: 14,
    test: (exports) => exports.main()
  },
  {
    name: "Void Function Call",
    code: `void doNothing() { return; } int main() { doNothing(); return 42; }`,
    expected: 42,
    test: (exports) => exports.main()
  },

  // --- ERROR HANDLING TESTS ---
  {
    name: "Compile Error: Undefined Variable",
    code: `int main() { return undefinedVar; }`,
    expected: "error",
    test: () => {}
  },
  {
    name: "Compile Error: Argument Mismatch",
    code: `int foo(int a) { return a; } int main() { return foo(1, 2); }`,
    expected: "error",
    test: () => {}
  },
  {
    name: "Compile Error: Unknown Keyword",
    code: `funcc main() { return 1; }`,
    expected: "error",
    test: () => {}
  },
  {
    name: "Compile Error: Missing Type in Declaration",
    code: `int main() { x = 5; return x; }`,
    expected: "error",
    test: () => {}
  }
];