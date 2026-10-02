#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <string_view>

namespace wyhash {

// Standard WyHash secret keys
static constexpr uint64_t _wyp[4] = {
    0xa0761d6478bd642full, 0xe7037ed1a0b428dbull,
    0x8ebc6af09c88c6e3ull, 0x589965cc75374cc3ull
};

// 64-bit multiply and mix
inline uint64_t _wymum(uint64_t A, uint64_t B) {
#ifdef __SIZEOF_INT128__
    __uint128_t r = A; 
    r *= B;
    return (uint64_t)(r ^ (r >> 64));
#elif defined(_MSC_VER) && defined(_M_X64)
    uint64_t hi;
    uint64_t lo = _umul128(A, B, &hi);
    return hi ^ lo;
#else
    // Fallback for platforms without 128-bit int or MSVC intrinsic
    uint64_t ha = A >> 32, hb = B >> 32, la = (uint32_t)A, lb = (uint32_t)B, hi, lo;
    uint64_t rh = ha * hb, rm0 = ha * lb, rm1 = hb * la, rl = la * lb, t = rl + (rm0 << 32), c = t < rl;
    lo = t + (rm1 << 32); c += lo < t; hi = rh + (rm0 >> 32) + (rm1 >> 32) + c;
    return hi ^ lo;
#endif
}

// Safe unaligned reads using std::memcpy
inline uint64_t _wyr8(const uint8_t* p) {
    uint64_t v;
    std::memcpy(&v, p, 8);
    return v;
}

inline uint64_t _wyr4(const uint8_t* p) {
    uint32_t v;
    std::memcpy(&v, p, 4);
    return v;
}

inline uint64_t _wyr3(const uint8_t* p, size_t k) {
    return (((uint64_t)p[0]) << 16) | (((uint64_t)p[k >> 1]) << 8) | p[k - 1];
}

// Core WyHash function
inline uint64_t hash(const void* key, size_t len, uint64_t seed = 0, const uint64_t* secret = _wyp) {
    const uint8_t* p = (const uint8_t*)key;
    seed ^= secret[0];
    uint64_t a, b;
    
    if (len <= 16) {
        if (len >= 4) {
            a = (_wyr4(p) << 32) | _wyr4(p + ((len >> 3) << 2));
            b = (_wyr4(p + len - 4) << 32) | _wyr4(p + len - 4 - ((len >> 3) << 2));
        } else if (len > 0) {
            a = _wyr3(p, len);
            b = 0;
        } else {
            a = b = 0;
        }
    } else {
        size_t i = len;
        if (i > 48) {
            uint64_t see1 = seed, see2 = seed;
            do {
                seed = _wymum(_wyr8(p) ^ secret[1], _wyr8(p + 8) ^ seed);
                see1 = _wymum(_wyr8(p + 16) ^ secret[2], _wyr8(p + 24) ^ see1);
                see2 = _wymum(_wyr8(p + 32) ^ secret[3], _wyr8(p + 40) ^ see2);
                p += 48; 
                i -= 48;
            } while (i > 48);
            seed ^= see1 ^ see2;
        }
        while (i > 16) {
            seed = _wymum(_wyr8(p) ^ secret[1], _wyr8(p + 8) ^ seed);
            p += 16; 
            i -= 16;
        }
        a = _wyr8(p + i - 16);
        b = _wyr8(p + i - 8);
    }
    
    return _wymum(secret[1] ^ len, _wymum(a ^ secret[1], b ^ seed));
}

// --- Modern C++ Overloads ---

inline uint64_t hash(std::string_view str, uint64_t seed = 0) {
    return hash(str.data(), str.size(), seed, _wyp);
}

inline uint64_t hash(const std::string& str, uint64_t seed = 0) {
    return hash(str.data(), str.size(), seed, _wyp);
}

inline uint64_t hash(const char* str, uint64_t seed = 0) {
    return hash(str, std::strlen(str), seed, _wyp);
}

} // namespace wyhash

/* how to use
//wyhash v4
#include <iostream>
#include <unordered_map>
#include "wyhash.hpp"

// Example: A custom hash function for std::unordered_map using WyHash
struct WyHashStringView {
    size_t operator()(std::string_view sv) const noexcept {
        return wyhash::hash(sv);
    }
};

int main() {
    // 1. Hashing standard strings
    std::string func1 = "Engine::Physics::Update";
    std::string func2 = "Engine::Physics::Render";
    
    uint64_t h1 = wyhash::hash(func1);
    uint64_t h2 = wyhash::hash(func2);
    
    std::cout << "Hash 1: " << h1 << "\n";
    std::cout << "Hash 2: " << h2 << "\n\n";

    // 2. Hashing string literals directly (Zero allocation!)
    uint64_t h3 = wyhash::hash("int32");
    uint64_t h4 = wyhash::hash("int64");
    
    std::cout << "int32 hash: " << h3 << "\n";
    std::cout << "int64 hash: " << h4 << "\n\n";

    // 3. Using it in an unordered_map (Perfect for your use case)
    std::unordered_map<std::string_view, int, WyHashStringView> type_sizes;
    
    // No memory allocation for the keys here!
    type_sizes["int32"] = 4;
    type_sizes["int64"] = 8;
    type_sizes["std::vector"] = 24;
    
    std::cout << "Size of int64: " << type_sizes["int64"] << "\n";

    return 0;
}
//*/