// ./include/extensions/example_ext.hpp
#ifndef EXAMPLE_EXT_HPP
#define EXAMPLE_EXT_HPP
#include "autogen.hpp"
namespace ext {
inline ag_future* add_async(int a, int b) {
    return ag_ext_async(int, ag_ext::main, "test_main_ext_add", a, b);
}
inline int add_sync(int a, int b) {
    return ag_ext_sync(int, ag_ext::main, "test_main_ext_add", a, b);
}
inline ag_future* add_async_promise(int a, int b) {
    return ag_ext_async(int, ag_ext::main, "test_main_ext_async_add", a, b);
}
inline ag_future* mul_async(int a, int b) {
    return ag_ext_async(int, ag_ext::worker, "test_worker_ext_mul", a, b);
}
inline int mul_sync(int a, int b) {
    return ag_ext_sync(int, ag_ext::worker, "test_worker_ext_mul", a, b);
}
// NEW: Async Promise-returning worker extension
inline ag_future* mul_async_promise(int a, int b) {
    return ag_ext_async(int, ag_ext::worker, "test_worker_ext_async_mul", a, b);
}
inline void fnf_increment(uint32_t* counter_ptr) {
    ag_ext_fire(ag_ext::worker, "test_worker_ext_fnf", (uint32_t)(uintptr_t)counter_ptr);
}
} // namespace ext
#endif // EXAMPLE_EXT_HPP