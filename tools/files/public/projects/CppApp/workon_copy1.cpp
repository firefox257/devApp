#include <iostream>
#include <string>
#include <cstdlib>

// Declare the external JS functions (Synchronous imports)
extern "C" {
    __attribute__((import_module("env"), import_name("jsCout")))
    void jsCout(const char* str);
    
    __attribute__((import_module("sys"), import_name("jstry")))
    void jstry(int i);
}

// Standard memory management exports
extern "C" __attribute__((export_name("malloc")))
void* wasm_malloc(size_t size) {
    return std::malloc(size);
}

extern "C" __attribute__((export_name("free")))
void wasm_free(void* ptr) {
    std::free(ptr);
}

extern "C" __attribute__((export_name("realloc")))
void * wasm_realloc(void* ptr, std::size_t size) {
    return std::realloc(ptr, size);
}

// Custom synchronous logger
namespace wasm {
    class logImplement {
    public:
        logImplement() {}

        logImplement & operator << (bool v) {
            jsCout(v ? "true" : "false");
            return *this;
        }
        logImplement & operator << (int v) {
            jsCout(std::to_string(v).c_str());
            return *this;
        }
        logImplement & operator << (long v) {
            jsCout(std::to_string(v).c_str());
            return *this;
        }
        logImplement & operator << (float v) {
            jsCout(std::to_string(v).c_str());
            return *this;
        }
        logImplement & operator << (double v) {
            jsCout(std::to_string(v).c_str());
            return *this;
        }
        logImplement & operator << (char v) {
            jsCout(std::to_string(v).c_str());
            return *this;
        }
        logImplement & operator << (const char* v) {
            jsCout(v ? v : "null");
            return *this;
        }
        logImplement & operator << (char* v) {
            jsCout(v ? v : "null");
            return *this;
        }
        logImplement & operator << (const std::string & v) {
            jsCout(v.c_str());
            return *this;
        }
    };
}

wasm::logImplement info;

// Simple synchronous task classes (replacing pWorker)
class Task1 {
public:
    Task1() {}
    ~Task1() { info << "at Task1 destructor\r\n"; }
    void run() { info << "at Task1 run\r\n"; }
};

class Task2 {
public:
    Task2() {}
    ~Task2() { info << "at Task2 destructor\r\n"; }
    void run() { info << "at Task2 run\r\n"; }
};

extern "C" __attribute__((export_name("greet")))
const char* greet(const char* name) {
    info << "C++ received name: " << name << "\n";
    return "Hello from C++!";
}

int main() {
    jstry(123);
    info << "Starting main execution...\r\n";
    
    // Synchronous instantiation and execution
    Task1 t1;
    Task2 t2;
    
    t1.run();
    t2.run();
    
    info << "Main execution finished.\r\n";
    return 0;
}