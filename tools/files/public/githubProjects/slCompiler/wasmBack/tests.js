// ./tests.js
// ==========================================
// SECTION 1: Basic Arithmetic & Variables
// ==========================================
export const tests = [
    {
        name: "Basic Arithmetic and Return",
        slCode: `int32 main() {
    int32 a = 10;
    int32 b = 20;
    int32 c = a + b;
    return c;
}`,
        expectedOutput: "Return value: 30"
    },
    {
        name: "Hex and Binary Literals",
        slCode: `int32 main() {
    int32 hexVal = 0xFF;
    int32 binVal = 0b1010;
    return hexVal + binVal;
}`,
        expectedOutput: "Return value: 265"
    }
];
// ==========================================
// END SECTION 1
// ==========================================

// ==========================================
// SECTION 2: Control Flow (If/Else, While)
// ==========================================
tests.push(
    {
        name: "If / Else Control Flow",
        slCode: `int32 main() {
    int32 x = 15;
    if (x > 10) {
        print(x);
    } else {
        print(0);
    }
    return 0;
}`,
        expectedOutput: "print: 15\nReturn value: 0"
    },
    {
        name: "While Loop & Console Capture",
        slCode: `int32 main() {
    int32 i = 3;
    while (i > 0) {
        print(i);
        i = i - 1;
    }
    return 0;
}`,
        expectedOutput: "print: 3\nprint: 2\nprint: 1\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 2
// ==========================================

// ==========================================
// SECTION 3: Logical & Bitwise Operations
// ==========================================
tests.push(
    {
        name: "Bitwise Operations",
        slCode: `int32 main() {
    int32 a = 0b1100;
    int32 b = 0b1010;
    print(a & b);
    print(a | b);
    print(a ^ b);
    return 0;
}`,
        expectedOutput: "print: 8\nprint: 14\nprint: 6\nReturn value: 0"
    },
    {
        name: "Logical Operations",
        slCode: `int32 main() {
    int32 t = 1;
    int32 f = 0;
    if (t && !f) {
        print(100);
    }
    return 0;
}`,
        expectedOutput: "print: 100\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 3
// ==========================================

// ==========================================
// SECTION 4: Advanced Loops & Assignments
// ==========================================
tests.push(
    {
        name: "For Loop Sum",
        slCode: `int32 main() {
    int32 sum = 0;
    for (int32 i = 1; i <= 5; i = i + 1) {
        sum += i;
    }
    print(sum);
    return 0;
}`,
        expectedOutput: "print: 15\nReturn value: 0"
    },
    {
        name: "Nested Loops and Modulo",
        slCode: `int32 main() {
    int32 count = 0;
    for (int32 i = 0; i < 3; i = i + 1) {
        for (int32 j = 0; j < 3; j = j + 1) {
            if ((i + j) % 2 == 0) {
                count += 1;
            }
        }
    }
    print(count);
    return 0;
}`,
        expectedOutput: "print: 5\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 4
// ==========================================

// ==========================================
// SECTION 5: Functions and Recursion
// ==========================================
tests.push(
    {
        name: "Function Call and Return",
        slCode: `int32 add(int32 a, int32 b) {
    return a + b;
}

int32 main() {
    int32 result = add(15, 25);
    print(result);
    return 0;
}`,
        expectedOutput: "print: 40\nReturn value: 0"
    },
    {
        name: "Recursive Factorial",
        slCode: `int32 factorial(int32 n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int32 main() {
    print(factorial(5));
    return 0;
}`,
        expectedOutput: "print: 120\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 5
// ==========================================

// ==========================================
// SECTION 6: Advanced Types & Casting
// ==========================================
tests.push(
    {
        name: "SizeOf Operator",
        slCode: `int32 main() {
    int32 size1 = sizeof<int32>;
    int32 size2 = sizeof<float64>;
    print(size1);
    print(size2);
    return size1 + size2;
}`,
        expectedOutput: "print: 4\nprint: 8\nReturn value: 12"
    },
    {
        name: "Float Operations",
        slCode: `int32 main() {
    float32 a = 3.14f;
    float32 b = 1.5f;
    float32 c = a + b;
    print(c);
    return 0;
}`,
        expectedOutput: "print: 4.640000343322754\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 6
// ==========================================

// ==========================================
// SECTION 7: Complex Expressions & Safety
// ==========================================
tests.push(
    {
        name: "Ternary Operator",
        slCode: `int32 main() {
    int32 x = 10;
    int32 y = x > 5 ? 100 : 200;
    print(y);
    
    int32 z = x < 5 ? 100 : 200;
    print(z);
    
    return 0;
}`,
        expectedOutput: "print: 100\nprint: 200\nReturn value: 0"
    },
    {
        name: "Assert Statement",
        slCode: `int32 main() {
    int32 x = 10;
    assert(x == 10);
    print(1);
    return 0;
}`,
        expectedOutput: "print: 1\nReturn value: 0"
    },
    {
        name: "Compound Assignment in Loop",
        slCode: `int32 main() {
    int32 val = 1;
    for (int32 i = 0; i < 4; i = i + 1) {
        val *= 2;
    }
    print(val);
    return 0;
}`,
        expectedOutput: "print: 16\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 7
// ==========================================

// ==========================================
// SECTION 8: Pointers and Memory
// ==========================================
tests.push(
    {
        name: "Pointer Type Declaration and SizeOf",
        slCode: `int32 main() {
    int32 size = sizeof<int32*>;
    print(size);
    return size;
}`,
        expectedOutput: "print: 4\nReturn value: 4"
    }
);
// ==========================================
// END SECTION 8
// ==========================================

// ==========================================
// SECTION 9: Structs and Classes
// ==========================================
tests.push(
    {
        name: "Class and Struct Parsing",
        slCode: `class MyClass {
    public:
        int32 value;
};

struct MyStruct {
    int32 a;
    int32 b;
};

int32 main() {
    return 0;
}`,
        expectedOutput: "Return value: 0"
    }
);
// ==========================================
// END SECTION 9
// ==========================================

// ==========================================
// SECTION 10: Enums and Typedefs
// ==========================================
tests.push(
    {
        name: "Enum and Typedef Parsing",
        slCode: `typedef int32 Score;
enum Color {
    RED,
    GREEN,
    BLUE
};

int32 main() {
    Score s = 100;
    print(s);
    return s;
}`,
        expectedOutput: "print: 100\nReturn value: 100"
    }
);
// ==========================================
// END SECTION 10
// ==========================================

// ==========================================
// SECTION 11: Break and Continue
// ==========================================
tests.push(
    {
        name: "Break and Continue in Loops",
        slCode: `int32 main() {
    int32 sum = 0;
    for (int32 i = 0; i < 10; i = i + 1) {
        if (i == 3) {
            continue;
        }
        if (i == 7) {
            break;
        }
        sum = sum + i;
    }
    print(sum);
    return sum;
}`,
        expectedOutput: "print: 18\nReturn value: 18"
    }
);
// ==========================================
// END SECTION 11
// ==========================================

// ==========================================
// SECTION 12: Arrays & Dynamic Memory
// ==========================================
tests.push(
    {
        name: "Dynamic Array Allocation and Indexing",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* arr = (int32*)malloc(12);
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    print(arr[1]);
    free(arr);
    return arr[2];
}`,
        expectedOutput: "print: 20\nReturn value: 30"
    },
    {
        name: "Array Indexing in Expressions",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* arr = (int32*)malloc(8);
    arr[0] = 5;
    arr[1] = 15;
    print(arr[0] + arr[1]);
    free(arr);
    return 0;
}`,
        expectedOutput: "print: 20\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 12
// ==========================================

// ==========================================
// SECTION 13: Postfix Operators
// ==========================================
tests.push(
    {
        name: "Postfix Increment and Decrement",
        slCode: `int32 main() {
    int32 x = 10;
    print(x++);
    print(x);
    print(x--);
    print(x);
    return 0;
}`,
        expectedOutput: "print: 10\nprint: 11\nprint: 11\nprint: 10\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 13
// ==========================================

// ==========================================
// SECTION 14: Dynamic Memory (malloc/free)
// ==========================================
tests.push(
    {
        name: "Malloc and Free Basic",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* ptr1 = malloc(20);
    ptr1[0] = 42;
    print(ptr1[0]);
    free(ptr1);
    return 0;
}`,
        expectedOutput: "print: 42\nReturn value: 0"
    },
    {
        name: "Malloc Coalescing",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* a = malloc(16);
    int32* b = malloc(16);
    free(a);
    free(b);
    
    // a and b should have coalesced into a single 48+ byte free chunk
    int32* c = malloc(40); 
    c[0] = 99;
    print(c[0]);
    free(c);
    return 0;
}`,
        expectedOutput: "print: 99\nReturn value: 0"
    },
    {
        name: "Multiple Allocations and Pointer Arithmetic",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* arr = malloc(24);
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    
    print(arr[0]);
    print(arr[1]);
    print(arr[2]);
    
    free(arr);
    return 0;
}`,
        expectedOutput: "print: 10\nprint: 20\nprint: 30\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 14
// ==========================================

// ==========================================
// SECTION 15: Global Variables
// ==========================================
tests.push(
    {
        name: "Global Variable Initialization and Mutation",
        slCode: `int32 globalVal = 42;

int32 main() {
    print(globalVal);
    globalVal = 100;
    print(globalVal);
    return globalVal;
}`,
        expectedOutput: "print: 42\nprint: 100\nReturn value: 100"
    },
    {
        name: "Const Global Variable",
        slCode: `const int32 MAX_LIMIT = 999;

int32 main() {
    print(MAX_LIMIT);
    return MAX_LIMIT;
}`,
        expectedOutput: "print: 999\nReturn value: 999"
    }
);
// ==========================================
// END SECTION 15
// ==========================================

// ==========================================
// SECTION 16: Do-While Loops
// ==========================================
tests.push(
    {
        name: "Basic Do-While Loop",
        slCode: `int32 main() {
    int32 i = 3;
    do {
        print(i);
        i = i - 1;
    } while (i > 0);
    return 0;
}`,
        expectedOutput: "print: 3\nprint: 2\nprint: 1\nReturn value: 0"
    },
    {
        name: "Do-While Loop with Break",
        slCode: `int32 main() {
    int32 i = 0;
    do {
        if (i == 2) {
            break;
        }
        print(i);
        i = i + 1;
    } while (i < 5);
    return 0;
}`,
        expectedOutput: "print: 0\nprint: 1\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 16
// ==========================================

// ==========================================
// SECTION 17: Complex Expressions & Precedence
// ==========================================
tests.push(
    {
        name: "Complex Arithmetic Precedence",
        slCode: `int32 main() {
    int32 a = 2 + 3 * 4 - 8 / 2;
    print(a);
    return a;
}`,
        expectedOutput: "print: 10\nReturn value: 10"
    },
    {
        name: "Nested Function Calls",
        slCode: `int32 doubleVal(int32 x) {
    return x * 2;
}

int32 addVal(int32 x, int32 y) {
    return x + y;
}

int32 main() {
    int32 res = addVal(doubleVal(5), doubleVal(3));
    print(res);
    return res;
}`,
        expectedOutput: "print: 16\nReturn value: 16"
    }
);
// ==========================================
// END SECTION 17
// ==========================================

// ==========================================
// SECTION 18: New and Delete Operators
// ==========================================
tests.push(
    {
        name: "New and Delete Single Object",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* ptr = new int32;
    ptr[0] = 42;
    print(ptr[0]);
    delete ptr;
    return 0;
}`,
        expectedOutput: "print: 42\nReturn value: 0"
    },
    {
        name: "New and Delete Array",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* arr = new int32[3];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    print(arr[1]);
    delete[] arr;
    return 0;
}`,
        expectedOutput: "print: 20\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 18
// ==========================================

// ==========================================
// SECTION 19: Exception Handling (Basic)
// ==========================================
tests.push(
    {
        name: "Try Catch Block Execution",
        slCode: `int32 main() {
    int32 x = 10;
    try {
        print(x);
        x = 20;
    } catch (int32 err) {
        print(err);
    }
    print(x);
    return 0;
}`,
        expectedOutput: "print: 10\nprint: 20\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 19
// ==========================================

// ==========================================
// SECTION 20: Casting and Advanced Pointers
// ==========================================
tests.push(
    {
        name: "Explicit Cast",
        slCode: `int32 main() {
    int32 val = 100;
    int32 result = cast<int32>(val);
    print(result);
    return 0;
}`,
        expectedOutput: "print: 100\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 20
// ==========================================

// ==========================================
// SECTION 21: Classes, Structs, and Methods
// ==========================================
tests.push(
    {
        name: "Struct Member Access and Pointers",
        slCode: `import "stdlib.sl";

struct Point {
    int32 x;
    int32 y;
};

int32 main() {
    Point p;
    p.x = 10;
    p.y = 20;
    
    Point* ptr = &p;
    ptr->x = 30;
    
    print(p.x);
    print(ptr->y);
    return 0;
}`,
        expectedOutput: "print: 30\nprint: 20\nReturn value: 0"
    },
    {
        name: "Class Methods and Explicit This",
        slCode: `import "stdlib.sl";

class Counter {
    public:
        int32 count;
};

public void Counter::increment(Counter* this, int32 amount) {
    this->count = this->count + amount;
}

public int32 Counter::getCount(Counter* this) {
    return this->count;
}

int32 main() {
    Counter c;
    c.count = 5;
    c.increment(10);
    print(c.getCount());
    return 0;
}`,
        expectedOutput: "print: 15\nReturn value: 0"
    },
    {
        name: "New and Delete with Classes",
        slCode: `import "stdlib.sl";

class Box {
    public:
        int32 value;
};

public void Box::set(Box* this, int32 v) {
    this->value = v;
}

int32 main() {
    Box* b = new Box;
    b->set(42);
    print(b->value);
    delete b;
    return 0;
}`,
        expectedOutput: "print: 42\nReturn value: 0"
    },
    {
        name: "Pointer Dereference and AddressOf",
        slCode: `import "stdlib.sl";

int32 main() {
    int32* ptr = (int32*)malloc(4);
    *ptr = 99;
    print(*ptr);
    free(ptr);
    return 0;
}`,
        expectedOutput: "print: 99\nReturn value: 0"
    }
);
// ==========================================
// END SECTION 21
// ==========================================