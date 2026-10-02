#include <iostream>
#include <memory>
#include <tuple>
#include <utility>
#include <type_traits>
#include <string>

// ==========================================
// STEP 1: Create heap arguments, return void*
// ==========================================
template<typename... Args>
void* createHeapArgs(Args&&... args) {
    // std::decay_t ensures we store arguments by VALUE on the heap.
    // This prevents dangling references if the original local variables go out of scope.
    using ArgTuple = std::tuple<std::decay_t<Args>...>;
    
    // Allocate the tuple on the heap
    ArgTuple* heapArgs = new ArgTuple(std::forward<Args>(args)...);
    
    // Return as a type-erased void pointer
    return static_cast<void*>(heapArgs);
}

// ==========================================
// STEP 2: Take void*, apply args to class function
// ==========================================
template<typename T, typename Ret, typename... Args>
Ret callClassFunctionWithArgs(T* obj, Ret (T::*func)(Args...), void* heapArgsPtr) {
    // Reconstruct the exact tuple type expected by the function signature
    using ArgTuple = std::tuple<std::decay_t<Args>...>;
    
    // Cast the void* back to the specific tuple type
    ArgTuple* heapArgs = static_cast<ArgTuple*>(heapArgsPtr);
    
    // Wrap in a unique_ptr to guarantee the heap memory is freed, 
    // even if the called function throws an exception.
    std::unique_ptr<ArgTuple> safeArgs(heapArgs);
    
    // Unpack the tuple and call the member function
    return std::apply([obj, func](auto&&... unpackedArgs) {
        return (obj->*func)(std::forward<decltype(unpackedArgs)>(unpackedArgs)...);
    }, *safeArgs);
}

// ==========================================
// Example Usage
// ==========================================
class MyClass {
public:
    void printValues(int a, double b, const std::string& c) {
        std::cout << "Values: " << a << ", " << b << ", " << c << "\n";
    }
    
    int addNumbers(int x, int y) {
        return x + y;
    }
};

int main() {
    MyClass obj;
    
    // --- Example 1: Void returning function ---
    // 1. Create the arguments on the heap and get the void*
    void* args1 = createHeapArgs(42, 3.1415, std::string("Hello Heap"));
    
    // 2. Pass the void* to execute the function (memory is automatically freed inside)
    callClassFunctionWithArgs(&obj, &MyClass::printValues, args1);


    // --- Example 2: Function with a return value ---
    // 1. Create arguments
    void* args2 = createHeapArgs(100, 250);
    
    // 2. Execute and capture the return value
    int result = callClassFunctionWithArgs(&obj, &MyClass::addNumbers, args2);
    std::cout << "Sum returned: " << result << "\n";

    return 0;
}