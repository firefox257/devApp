// tests.js

//### Basic Printing Tests
export const tests = [
    {
        id: 1,
        name: "Simple Print String",
        slCode: `int32 main() {
    print('Hello, World!');
    return 0;
}`,
        expectedOutput: "Hello, World!\n"
    },
    {
        id: 2,
        name: "Print Integer",
        slCode: `int32 main() {
    print(42);
    return 0;
}`,
        expectedOutput: "42\n"
    }
];
//####

//### Variables and Arithmetic Tests
const variableTests = [
    {
        id: 3,
        name: "Variable Declaration and Arithmetic",
        slCode: `int32 main() {
    int32 a = 10;
    int32 b = 20;
    int32 c = a + b;
    print(c);
    return 0;
}`,
        expectedOutput: "30\n"
    },
    {
        id: 4,
        name: "Complex Arithmetic",
        slCode: `int32 main() {
    int32 x = 5;
    int32 y = 3;
    int32 z = (x * y) + 2;
    print(z);
    return 0;
}`,
        expectedOutput: "17\n"
    },
    {
        id: 5,
        name: "Compound Assignment",
        slCode: `int32 main() {
    int32 a = 10;
    a += 5;
    a *= 2;
    print(a);
    return 0;
}`,
        expectedOutput: "30\n"
    }
];
//####

//### Control Flow Tests
const controlFlowTests = [
    {
        id: 6,
        name: "If Else Statement",
        slCode: `int32 main() {
    int32 x = 5;
    if (x > 3) {
        print(1);
    } else {
        print(0);
    }
    return 0;
}`,
        expectedOutput: "1\n"
    },
    {
        id: 7,
        name: "While Loop",
        slCode: `int32 main() {
    int32 i = 0;
    while (i < 3) {
        print(i);
        i = i + 1;
    }
    return 0;
}`,
        expectedOutput: "0\n1\n2\n"
    },
    {
        id: 8,
        name: "For Loop",
        slCode: `int32 main() {
    int32 sum = 0;
    for (int32 i = 1; i <= 3; i = i + 1) {
        sum = sum + i;
    }
    print(sum);
    return 0;
}`,
        expectedOutput: "6\n"
    }
];
//####

//### Logical and Bitwise Operators Tests
const logicalTests = [
    {
        id: 9,
        name: "Logical AND",
        slCode: `int32 main() {
    int32 a = 1;
    int32 b = 1;
    if (a == 1 && b == 1) {
        print(1);
    } else {
        print(0);
    }
    return 0;
}`,
        expectedOutput: "1\n"
    },
    {
        id: 10,
        name: "Logical OR",
        slCode: `int32 main() {
    int32 a = 0;
    int32 b = 1;
    if (a == 1 || b == 1) {
        print(1);
    } else {
        print(0);
    }
    return 0;
}`,
        expectedOutput: "1\n"
    },
    {
        id: 11,
        name: "Bitwise Operations",
        slCode: `int32 main() {
    int32 a = 5;
    int32 b = 3;
    int32 c = a & b;
    int32 d = a | b;
    print(c);
    print(d);
    return 0;
}`,
        expectedOutput: "1\n7\n"
    }
];
//####

//### Array Tests
const arrayTests = [
    {
        id: 12,
        name: "Array Declaration and Access",
        slCode: `int32 main() {
    int32 arr[3];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    print(arr[1]);
    return 0;
}`,
        expectedOutput: "20\n"
    },
    {
        id: 13,
        name: "Array in Loop",
        slCode: `int32 main() {
    int32 nums[4];
    nums[0] = 2;
    nums[1] = 4;
    nums[2] = 6;
    nums[3] = 8;
    int32 i = 0;
    while (i < 4) {
        print(nums[i]);
        i = i + 1;
    }
    return 0;
}`,
        expectedOutput: "2\n4\n6\n8\n"
    }
];
//####

//### Casting and Sizeof Tests
const castSizeofTests = [
    {
        id: 14,
        name: "Sizeof Primitive Types",
        slCode: `int32 main() {
    print(sizeof(int8));
    print(sizeof(int16));
    print(sizeof(int32));
    print(sizeof(int64));
    return 0;
}`,
        expectedOutput: "1\n2\n4\n8\n"
    },
    {
        id: 15,
        name: "Explicit Integer Casting",
        slCode: `int32 main() {
    int64 big = 300;
    int32 small = (int32)big;
    print(small);
    return 0;
}`,
        expectedOutput: "300\n"
    },
    {
        id: 16,
        name: "Float to Int Casting",
        slCode: `int32 main() {
    float32 f = 9.7;
    int32 i = (int32)f;
    print(i);
    return 0;
}`,
        expectedOutput: "9\n"
    }
];
//####

//### Enum Tests
const enumTests = [
    {
        id: 17,
        name: "Basic Enum Usage",
        slCode: `enum Color {
    RED,
    GREEN,
    BLUE
};

int32 main() {
    int32 c = GREEN;
    print(c);
    return 0;
}`,
        expectedOutput: "1\n"
    },
    {
        id: 18,
        name: "Enum Class with Custom Underlying Type",
        slCode: `enum class Status : int8 {
    OK = 0,
    ERROR = 5,
    PENDING = 10
};

int32 main() {
    int32 s = (int32)Status::ERROR;
    print(s);
    return 0;
}`,
        // Note: Parser currently treats enum class variants as global for simplicity in this baseline, 
        // but the test validates the underlying type mapping and explicit casting.
        expectedOutput: "5\n"
    }
];
//####

//### Struct and Class Tests
const structClassTests = [
    {
        id: 19,
        name: "Struct Data Layout and Sizeof",
        slCode: `struct Point {
    public:
        int32 x;
        int32 y;
};

int32 main() {
    print(sizeof(Point));
    return 0;
}`,
        expectedOutput: "8\n"
    },
    {
        id: 20,
        name: "Class Default Private Access",
        slCode: `class Box {
    int32 width;
    public:
        int32 height;
};

int32 main() {
    print(sizeof(Box));
    return 0;
}`,
        expectedOutput: "8\n"
    }
];
//####

//### Increment and Decrement Tests
const incDecTests = [
    {
        id: 21,
        name: "Prefix Increment",
        slCode: `int32 main() {
    int32 a = 5;
    ++a;
    print(a);
    return 0;
}`,
        expectedOutput: "6\n"
    },
    {
        id: 22,
        name: "Prefix Decrement in Expression",
        slCode: `int32 main() {
    int32 b = 10;
    int32 c = --b;
    print(c);
    return 0;
}`,
        expectedOutput: "9\n"
    }
];
//####

//### Dynamic Memory (New/Delete) Tests
const memoryTests = [
    {
        id: 23,
        name: "New and Delete Primitive",
        slCode: `int32 main() {
    int32* ptr = new int32;
    *ptr = 42;
    print(*ptr);
    delete ptr;
    return 0;
}`,
        expectedOutput: "42\n"
    },
    {
        id: 24,
        name: "New Struct Instance",
        slCode: `struct Node {
    public:
        int32 value;
};

int32 main() {
    Node* n = new Node;
    n->value = 99;
    print(n->value);
    delete n;
    return 0;
}`,
        expectedOutput: "99\n"
    }
];
//####

// Combine all tests for the runner
export const allTestsList = [
    ...tests,
    ...variableTests,
    ...controlFlowTests,
    ...logicalTests,
    ...arrayTests,
    ...castSizeofTests,
    ...enumTests,
    ...structClassTests,
    ...incDecTests,
    ...memoryTests
];