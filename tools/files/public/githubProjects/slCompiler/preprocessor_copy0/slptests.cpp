#include <iostream>
#include <string>
#include <vector>
#include "slp.cpp"

struct TestResult {
    std::string name;
    std::vector<std::string> expected;
    std::vector<std::string> actual;
    bool passed;
};

int main() {
    std::vector<TestResult> results;
    SLP slp;

    auto vec_to_str = [](const std::vector<std::string>& v) {
        if (v.empty()) return std::string("[]");
        std::string res = "[";
        for (size_t i = 0; i < v.size(); ++i) {
            res += "\"" + v[i] + "\"";
            if (i + 1 < v.size()) res += ", ";
        }
        return res + "]";
    };

    auto run_test = [&](const std::string& name, const std::vector<std::string>& expected, const std::vector<std::string>& actual) {
        bool passed = (expected == actual);
        results.push_back({name, expected, actual, passed});
    };

    auto run_test_str = [&](const std::string& name, const std::string& expected, const std::string& actual) {
        bool passed = (expected == actual);
        results.push_back({name, {expected}, {actual}, passed});
    };

    // =========================================================================
    // Tests 1-3: Intentionally global to test state persistence across define()
    // =========================================================================
    std::vector<std::string> def1 = slp.define(R"(
        var globalmsg = 123;
        var func1 = (x, y) -> { return x + " " + y; }
        #token func1;
    )");
    run_test("define 1", {"func1"}, def1);
    run_test_str("func1 basic", "123 124", slp.get("func1", 123, 124));

    std::vector<std::string> def2 = slp.define(R"(
        globalmsg += "hi";
        var func2 = (a, b, c) -> { return "msg: " + globalmsg + ", args: " + a + "," + b + "," + c; }
        #token func2;
    )");
    run_test("define 2", {"func2"}, def2);
    run_test_str("func2 state persistence", "msg: 123hi, args: 10,20,30", slp.get("func2", 10, 20, 30));

    std::vector<std::string> def3 = slp.define(R"(
        var func3 = () -> { return "no args"; }
        #token func3;
    )");
    run_test("define 3", {"func3"}, def3);
    run_test_str("func3 no args", "no args", slp.get("func3"));

    // =========================================================================
    // Tests 4-25: Scoped with { } to prevent global namespace pollution
    // =========================================================================
    std::vector<std::string> def4 = slp.define(R"({
        var arr = [1, 2, 3];
        arr.push(4); arr.unshift(0);
        var popped = arr.pop(); var shifted = arr.shift();
        var arrTest = () -> { return "len:" + arr.length + ", pop:" + popped + ", shift:" + shifted; }
        #token arrTest;
    })");
    run_test("define 4", {"arrTest"}, def4);
    run_test_str("arrTest operations", "len:3, pop:4, shift:0", slp.get("arrTest"));

    std::vector<std::string> def5 = slp.define(R"({
        var typeTest = (x) -> { return typeof x; }
        #token typeTest;
    })");
    run_test("define 5", {"typeTest"}, def5);
    run_test_str("typeTest integer", "integer", slp.get("typeTest", 42));
    run_test_str("typeTest string", "string", slp.get("typeTest", "test"));
    run_test_str("typeTest float", "float", slp.get("typeTest", 3.14));
    run_test_str("typeTest boolean", "boolean", slp.get("typeTest", true));
    run_test_str("typeTest undefined", "undefined", slp.get("typeTest"));

    std::vector<std::string> def7 = slp.define(R"({
        var templateTest = (name) -> { return `Hello ${name}!`; }
        #token templateTest;
    })");
    run_test("define 7", {"templateTest"}, def7);
    run_test_str("templateTest literal", "Hello SLP!", slp.get("templateTest", "SLP"));

    std::vector<std::string> def8 = slp.define(R"({
        var sum = 0;
        for (var i = 1; i <= 5; i++) { sum += i; }
        var forTest = () -> { return sum; }
        #token forTest;
    })");
    run_test("define 8", {"forTest"}, def8);
    run_test_str("for loop", "15", slp.get("forTest"));

    std::vector<std::string> def9 = slp.define(R"({
        var count = 0; var x = 10;
        while (x > 0) { count++; x -= 2; }
        var whileTest = () -> { return count; }
        #token whileTest;
    })");
    run_test("define 9", {"whileTest"}, def9);
    run_test_str("while loop", "5", slp.get("whileTest"));

    std::vector<std::string> def10 = slp.define(R"({
        var switchTest = (val) -> {
            switch (val) {
                case 1: return "one";
                case 2: return "two";
                default: return "other";
            }
        }
        #token switchTest;
    })");
    run_test("define 10", {"switchTest"}, def10);
    run_test_str("switch statement 1", "one", slp.get("switchTest", 1));
    run_test_str("switch statement 2", "two", slp.get("switchTest", 2));
    run_test_str("switch statement default", "other", slp.get("switchTest", 99));

    std::vector<std::string> def11 = slp.define(R"({
        var factorial = (n) -> {
            if (n <= 1) return 1;
            return n * factorial(n - 1);
        }
        #token factorial;
    })");
    run_test("define 11", {"factorial"}, def11);
    run_test_str("factorial 5", "120", slp.get("factorial", 5));

    std::vector<std::string> def12 = slp.define(R"({
        var makeCounter = () -> {
            var count = 0;
            var counter = () -> { count += 1; return count; }
            return counter;
        }
        var myCounter = makeCounter();
        var closureTest = () -> { return myCounter() + "," + myCounter(); }
        #token closureTest;
    })");
    run_test("define 12", {"closureTest"}, def12);
    run_test_str("closure test", "1,2", slp.get("closureTest"));

    std::vector<std::string> def13 = slp.define(R"({
        var argsTest = () -> { return "len:" + args.length + ",0:" + args[0] + ",1:" + args[1]; }
        #token argsTest;
    })");
    run_test("define 13", {"argsTest"}, def13);
    run_test_str("args array", "len:2,0:hello,1:world", slp.get("argsTest", "hello", "world"));

    std::vector<std::string> def14 = slp.define(R"({
        var ternaryTest = (x) -> { return x > 5 ? "big" : "small"; }
        #token ternaryTest;
    })");
    run_test("define 14", {"ternaryTest"}, def14);
    run_test_str("ternary big", "big", slp.get("ternaryTest", 10));
    run_test_str("ternary small", "small", slp.get("ternaryTest", 3));

    std::vector<std::string> def15 = slp.define(R"({
        var bitwiseTest = () -> {
            var a = 5; var b = 3;
            var and = a & b; var or = a | b; var xor = a ^ b;
            var lshift = a << 1; var rshift = 10 >> 1;
            return and + "," + or + "," + xor + "," + lshift + "," + rshift;
        }
        #token bitwiseTest;
    })");
    run_test("define 15", {"bitwiseTest"}, def15);
    run_test_str("bitwise operations", "1,7,6,10,5", slp.get("bitwiseTest"));

    std::vector<std::string> def16 = slp.define(R"({
        var objTest = () -> {
            var obj = { name: "SLP", version: 1 };
            obj.version = 2; obj["newProp"] = "added";
            return obj.name + "," + obj.version + "," + obj.newProp;
        }
        #token objTest;
    })");
    run_test("define 16", {"objTest"}, def16);
    run_test_str("object operations", "SLP,2,added", slp.get("objTest"));

    std::vector<std::string> def18 = slp.define(R"({
        var compTest = () -> {
            var x = 10; x += 5; x -= 3; x *= 2; x /= 4; return x;
        }
        #token compTest;
    })");
    run_test("define 18", {"compTest"}, def18);
    run_test_str("compound assignment", "6", slp.get("compTest"));

    std::vector<std::string> def19 = slp.define(R"({
        var doWhileTest = () -> {
            var i = 0; do { i++; } while (i < 3); return i;
        }
        #token doWhileTest;
    })");
    run_test("define 19", {"doWhileTest"}, def19);
    run_test_str("do-while loop", "3", slp.get("doWhileTest"));

    std::vector<std::string> def20 = slp.define(R"({
        var forInObjTest = () -> {
            var obj = { a: 10, b: 20 }; var sum = 0;
            for (var k in obj) { sum += obj[k]; }
            return sum;
        }
        #token forInObjTest;
    })");
    run_test("define 20", {"forInObjTest"}, def20);
    run_test_str("for-in object loop", "30", slp.get("forInObjTest"));

    std::vector<std::string> def21 = slp.define(R"({
        var forInArrayTest = () -> {
            var arr = ["x", "y", "z"]; var res = "";
            for (var i in arr) { res += arr[i]; }
            return res;
        }
        #token forInArrayTest;
    })");
    run_test("define 21", {"forInArrayTest"}, def21);
    run_test_str("for-in array loop", "xyz", slp.get("forInArrayTest"));

    std::vector<std::string> def22 = slp.define(R"({
        var divTest = () -> { return 10 / 0; }
        #token divTest;
    })");
    run_test("define 22", {"divTest"}, def22);
    run_test_str("division by zero error", "Error: Division by zero", slp.get("divTest"));

    std::vector<std::string> def23 = slp.define(R"({
        var nestedTest = () -> {
            var data = { users: [{ name: "Alice" }, { name: "Bob" }] };
            return data.users[1].name;
        }
        #token nestedTest;
    })");
    run_test("define 23", {"nestedTest"}, def23);
    run_test_str("nested object/array access", "Bob", slp.get("nestedTest"));

    std::vector<std::string> def24 = slp.define(R"({
        var complexTemplate = (a, b) -> { return "Sum of ${a} and ${b} is ${a + b}"; }
        #token complexTemplate;
    })");
    run_test("define 24", {"complexTemplate"}, def24);
    run_test_str("complex template literal", "Sum of 5 and 7 is 12", slp.get("complexTemplate", 5, 7));

    std::vector<std::string> def25 = slp.define(R"({
        var typeofFunc = () -> { return typeof typeofFunc; }
        #token typeofFunc;
    })");
    run_test("define 25", {"typeofFunc"}, def25);
    run_test_str("typeof function", "function", slp.get("typeofFunc"));

    // =========================================================================
    // Tests 26-33: Edge Cases, BigInt, and Control Flow Enhancements
    // =========================================================================
    std::vector<std::string> def26 = slp.define(R"({
        var x = 99;
        var sqTest = () -> { return '${x}'; }
        #token sqTest;
    })");
    run_test("define 26", {"sqTest"}, def26);
    run_test_str("single-quote no interpolation", "${x}", slp.get("sqTest"));

    std::vector<std::string> def27 = slp.define(R"({
        var oobTest = () -> { var a = [1, 2]; return a[5]; }
        #token oobTest;
    })");
    run_test("define 27", {"oobTest"}, def27);
    run_test_str("out-of-bounds array access", "Error: Out-of-bounds array access at index 5", slp.get("oobTest"));

    std::vector<std::string> def28 = slp.define(R"({
        var bigIntTest = () -> { var max = 18446744073709551615; return max - 1; }
        #token bigIntTest;
    })");
    run_test("define 28", {"bigIntTest"}, def28);
    run_test_str("BigInt precision", "18446744073709551614", slp.get("bigIntTest"));

    std::vector<std::string> def29 = slp.define(R"({
        var argsZeroTest = () -> { return "len:" + args.length; }
        #token argsZeroTest;
    })");
    run_test("define 29", {"argsZeroTest"}, def29);
    run_test_str("args length zero", "len:0", slp.get("argsZeroTest"));

    std::vector<std::string> def30 = slp.define(R"({
        var objAssignTest = () -> { var o = { val: 10 }; o.val += 5; return o.val; }
        #token objAssignTest;
    })");
    run_test("define 30", {"objAssignTest"}, def30);
    run_test_str("compound assignment on object", "15", slp.get("objAssignTest"));

    std::vector<std::string> def31 = slp.define(R"({
        var breakTest = () -> { 
            var res = ""; 
            for (var i = 1; i <= 5; i++) { 
                if (i == 3) break; 
                res += i; 
            } 
            return res; 
        }
        #token breakTest;
    })");
    run_test("define 31", {"breakTest"}, def31);
    run_test_str("break in loop", "12", slp.get("breakTest"));

    std::vector<std::string> def32 = slp.define(R"({
        var continueTest = () -> { 
            var res = ""; 
            for (var i = 1; i <= 4; i++) { 
                if (i == 2) continue; 
                res += i; 
            } 
            return res; 
        }
        #token continueTest;
    })");
    run_test("define 32", {"continueTest"}, def32);
    run_test_str("continue in loop", "134", slp.get("continueTest"));

    std::vector<std::string> def33 = slp.define(R"({
        var switchBreakTest = (val) -> {
            var res = "";
            switch (val) {
                case 1: res += "A"; break;
                case 2: res += "B"; break;
                default: res += "C";
            }
            return res;
        }
        #token switchBreakTest;
    })");
    run_test("define 33", {"switchBreakTest"}, def33);
    run_test_str("switch break prevents fallthrough", "A", slp.get("switchBreakTest", 1));

    // =========================================================================
    // Tests 34-40: #token inline definitions and variable updates
    // =========================================================================
    std::vector<std::string> def34 = slp.define(R"({
        #token var inlineVar = 42;
    })");
    run_test("define 34", {"inlineVar"}, def34);
    run_test_str("inline var token", "42", slp.get("inlineVar"));

    std::vector<std::string> def35 = slp.define(R"({
        #token var inlineFunc = (x) -> { return x * 2; };
    })");
    run_test("define 35", {"inlineFunc"}, def35);
    run_test_str("inline func token", "84", slp.get("inlineFunc", 42));

    std::vector<std::string> def36 = slp.define(R"({
        inlineVar = 99;
    })");
    run_test("define 36", {}, def36);
    run_test_str("updated var token", "99", slp.get("inlineVar"));

    std::vector<std::string> def37 = slp.define(R"({
        var dynamicToken = 100;
        #token dynamicToken;
    })");
    run_test("define 37", {"dynamicToken"}, def37);
    run_test_str("post-declared var token", "100", slp.get("dynamicToken"));

    std::vector<std::string> def38 = slp.define(R"({
        dynamicToken = 200;
    })");
    run_test("define 38", {}, def38);
    run_test_str("updated post-declared var token", "200", slp.get("dynamicToken"));

    std::vector<std::string> def39 = slp.define(R"({
        #token var multiArgFunc = (a, b, c, d) -> { return a + b + c + d; };
    })");
    run_test("define 39", {"multiArgFunc"}, def39);
    run_test_str("inline multi-arg func token", "10", slp.get("multiArgFunc", 1, 2, 3, 4));

    std::vector<std::string> def40 = slp.define(R"({
        #token var missingTest = 1;
    })");
    run_test("define 40", {"missingTest"}, def40);
    run_test_str("missing token error", "Error: Token not found: nonexistent", slp.get("nonexistent"));


    // =========================================================================
    // Test 41: Inline #token var function with backtick interpolation
    // =========================================================================
    std::vector<std::string> def41 = slp.define(R"({
        #token var inlineInterpFunc = (a, b) -> { return `${a}:${b}`; };
    })");
    run_test("define 41", {"inlineInterpFunc"}, def41);
    run_test_str("inline token func with backtick interpolation", "1:2", slp.get("inlineInterpFunc", 1, 2));

    // =========================================================================
    // Summary Calculation
    // =========================================================================
    int passed_count = 0;
    for (const auto& res : results) {
        if (res.passed) passed_count++;
    }

    // Output Results
    if (passed_count < results.size()) {
        std::cout << "Failed Tests:\n";
        for (const auto& res : results) {
            if (!res.passed) {
                std::cout << "- " << res.name << "\n";
                std::cout << "  Expected: " << vec_to_str(res.expected) << "\n";
                std::cout << "  Actual:   " << vec_to_str(res.actual) << "\n";
            }
        }
    }

    std::cout << passed_count << " tests passed out of " << results.size() << " tests.\n";
    return passed_count == results.size() ? 0 : 1;
}