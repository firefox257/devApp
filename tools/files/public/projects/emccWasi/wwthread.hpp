#pragma once
#include <string>
#include <iostream>

// JS Imports
extern "C" {
    int ww_spawn_js(const char* js_code);
    int ww_spawn_cpp_func(const char* func_name, const char* args_json);
    int ww_join(int thread_id);
}

namespace wwthread {
    // ==========================================
    // Minimal JSON Serializer for WASM
    // ==========================================
    inline std::string to_json(int v) { return std::to_string(v); }
    inline std::string to_json(double v) { return std::to_string(v); }
    inline std::string to_json(const std::string& v) { return "\"" + v + "\""; }
    inline std::string to_json(const char* v) { return to_json(std::string(v)); }

    inline void append_json(std::string& json, const std::string& val) {
        if (!json.empty()) json += ",";
        json += val;
    }

    template<typename T>
    void serialize_args(std::string& json, T arg) { append_json(json, to_json(arg)); }

    template<typename T, typename... Args>
    void serialize_args(std::string& json, T first, Args... rest) {
        append_json(json, to_json(first));
        serialize_args(json, rest...);
    }

    // ==========================================
    // The Thread Class
    // ==========================================
    class thread {
        int id;
    public:
        thread() : id(0) {}

        // 1. Spawn a JS Thread (Async JS code)
        explicit thread(const std::string& js_code) { 
            id = ww_spawn_js(js_code.c_str()); 
        }

        // 2. Spawn a C++ Thread (Function Name + Arguments)
        // The C++ function MUST be extern "C" and exported.
        template<typename... Args>
        thread(const char* func_name, Args... args) {
            std::string json_args = "[";
            serialize_args(json_args, args...);
            json_args += "]";
            
            // Tell JS to spawn a new WASM instance and call this function
            id = ww_spawn_cpp_func(func_name, json_args.c_str());
        }

        // Blocks until the thread finishes and returns the integer result
        int join() { 
            if (id == 0) return -1; 
            int res = ww_join(id); 
            id = 0; 
            return res; 
        }

        int get_id() const { return id; }
    };
}