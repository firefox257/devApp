
//podo.cpp

#include<iostream>
#include<string>
#include<cstdint>
using namespace std;

#define endl "\r\n"

/*
// Compile-time FNV-1a hash function
constexpr uint32_t hashString(const char* str, uint32_t hash = 2166136261u) {
	return (*str == 0) ? hash : hashString(str + 1, (hash ^ static_cast<uint32_t>(*str)) * 16777619u);
}
//*/


/**
 * FNV-1a 64-bit hash function (JavaScript)
 * @param {string} str - The string to hash
 * @param {bigint} [hash=14695981039346656037n] - Initial 64-bit FNV offset basis
 * @returns {bigint} The 64-bit unsigned integer hash
 */
 /*
function hashString64(str, hash = 14695981039346656037n) {
    const bytes = new TextEncoder().encode(str);
    const prime = 1099511628211n; // 64-bit FNV prime
    const mask = 0xFFFFFFFFFFFFFFFFn; // Keep it within 64 bits

    for (let i = 0; i < bytes.length; i++) {
        hash ^= BigInt(bytes[i]);
        hash = (hash * prime) & mask;
    }
    
    return hash;
}

// Example:
console.log(hashString64("hello").toString()); // "15541046443520025775"
//*/




// Compile-time 64-bit FNV-1a
constexpr uint64_t hashString(const char* str, uint64_t hash = 14695981039346656037ull) {
    return (*str == '\0') ? hash : hashString(str + 1, (hash ^ static_cast<uint64_t>(*str)) * 1099511628211ull);
}

// Runtime 64-bit FNV-1a
uint64_t hashString64Runtime(const char* str, uint64_t hash = 14695981039346656037ull) {
    while (*str != '\0') {
        hash ^= static_cast<uint64_t>(*str);
        hash *= 1099511628211ull;
        str++;
    }
    return hash;
}

// Example:
// static_assert(hashString64CompileTime("hello") == 15541046443520025775ull, "Hash mismatch");

// Example:
// static_assert(hashStringCompileTime("hello") == 1335831723u, "Hash mismatch");



/**
 * @brief Macro to generate a packed PODO (Plain Old Data Object) class 
 * with automatic JS layout string generation.
 * 
 * @param NAME  The name of the class.
 * @param PROPS The properties (variables) of the class.
 */

// Helper macro to strip parentheses.
// This is REQUIRED if your PROPS contain commas (e.g., "int a, b;")
#define STRIP_PARENS(x) x

// ---------------------------------------------------------
// 1. The 2-argument version
// ---------------------------------------------------------
#define PODO_CLASS_2(NAME, PROPS) \
class NAME \
{ \
	public: \
	STRIP_PARENS(PROPS) \
	inline static uint64_t ClassId() { return hashString(#NAME); } \
	static const char* cppLayout() { static const char* l = #PROPS; return l; } \
} __attribute__((packed));

// ---------------------------------------------------------
// 2. The 3-argument version
// ---------------------------------------------------------
#define PODO_CLASS_3(NAME, PROPS, CODESEG) \
class NAME \
{ \
	public: \
	STRIP_PARENS(PROPS) \
	inline static uint64_t ClassId() { return hashString(#NAME); } \
	static const char* cppLayout() { static const char* l = #PROPS; return l; } \
	CODESEG \
} __attribute__((packed));

// ---------------------------------------------------------
// 3. The Dispatcher: Counts arguments and routes to _2 or _3
// ---------------------------------------------------------
#define GET_PODO_MACRO(_1, _2, _3, NAME, ...) NAME
#define PodoClass(...) GET_PODO_MACRO(__VA_ARGS__, PODO_CLASS_3, PODO_CLASS_2, UNUSED)(__VA_ARGS__)


PodoClass(data1,
	double x;
	double y;
	bool show;
	char t;
	char title[100];
);


int main()
{
	data1 d1;
	cout << d1.ClassId()<<endl<<d1.cppLayout() << endl;
	return 0;
}




