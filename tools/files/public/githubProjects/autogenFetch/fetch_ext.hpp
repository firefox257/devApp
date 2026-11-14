#ifndef FETCH_EXT_HPP
#define FETCH_EXT_HPP

#include <autogen.hpp>
#include <cstdint>
#include <cstdlib>

// Struct definition for C++ to read the 16-byte payload from shared memory
struct FetchResult {
    uint64_t data_ptr;
    uint32_t size;
    uint32_t status_code;
};

// Asynchronous fetch worker extension
inline ag_future* fetch(const char* url) {
    return ag_ext_async(uint32_t, ag_ext::worker, "fetch", url);
}

#endif // FETCH_EXT_HPP