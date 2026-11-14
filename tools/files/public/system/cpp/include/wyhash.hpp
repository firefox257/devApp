
#ifndef WY_HASH_HPP
#define WY_HASH_HPP


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
	constexpr uint64_t _wymum(uint64_t A, uint64_t B) {
		#ifdef __SIZEOF_INT128__
		__uint128_t r = A;
		r *= B;
		return (uint64_t)(r ^ (r >> 64));
		#elif defined(_MSC_VER) && defined(_M_X64)
		uint64_t hi;
		uint64_t lo = _umul128(A, B, &hi);
		return hi ^ lo;
		#else
		uint64_t ha = A >> 32, hb = B >> 32, la = (uint32_t)A, lb = (uint32_t)B, hi, lo;
		uint64_t rh = ha * hb, rm0 = ha * lb, rm1 = hb * la, rl = la * lb, t = rl + (rm0 << 32), c = t < rl;
		lo = t + (rm1 << 32); c += lo < t; hi = rh + (rm0 >> 32) + (rm1 >> 32) + c;
		return hi ^ lo;
		#endif
	}

	// Runtime unaligned reads
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

	// ==========================================
	// C++14/17 Constexpr helpers for compile-time hashing
	// ==========================================
	constexpr size_t constexpr_strlen(const char* str) {
		size_t len = 0;
		while (str[len] != '\0') ++len;
		return len;
	}

	// Constexpr-safe reads using integer conversion instead of pointer casting
	constexpr uint64_t wyr8_ce(const char* p) {
		return (uint64_t)(uint8_t)p[0] | ((uint64_t)(uint8_t)p[1] << 8) | ((uint64_t)(uint8_t)p[2] << 16) | ((uint64_t)(uint8_t)p[3] << 24) |
		((uint64_t)(uint8_t)p[4] << 32) | ((uint64_t)(uint8_t)p[5] << 40) | ((uint64_t)(uint8_t)p[6] << 48) | ((uint64_t)(uint8_t)p[7] << 56);
	}

	constexpr uint64_t wyr4_ce(const char* p) {
		return (uint64_t)(uint8_t)p[0] | ((uint64_t)(uint8_t)p[1] << 8) | ((uint64_t)(uint8_t)p[2] << 16) | ((uint64_t)(uint8_t)p[3] << 24);
	}

	constexpr uint64_t wyr3_ce(const char* p, size_t k) {
		return (((uint64_t)(uint8_t)p[0]) << 16) | (((uint64_t)(uint8_t)p[k >> 1]) << 8) | (uint8_t)p[k - 1];
	}

	constexpr uint64_t hash_constexpr(const char* key, size_t len, uint64_t seed = 0, const uint64_t* secret = _wyp) {
		seed ^= secret[0];
		uint64_t a = 0, b = 0; // Explicitly initialized for C++17 constexpr compliance

		if (len <= 16) {
			if (len >= 4) {
				a = (wyr4_ce(key) << 32) | wyr4_ce(key + ((len >> 3) << 2));
				b = (wyr4_ce(key + len - 4) << 32) | wyr4_ce(key + len - 4 - ((len >> 3) << 2));
			} else if (len > 0) {
				a = wyr3_ce(key, len);
				b = 0;
			} else {
				a = 0;
				b = 0;
			}
		} else {
			size_t i = len;
			if (i > 48) {
				uint64_t see1 = seed, see2 = seed;
				size_t p = 0;
				do {
					seed = _wymum(wyr8_ce(key + p) ^ secret[1], wyr8_ce(key + p + 8) ^ seed);
					see1 = _wymum(wyr8_ce(key + p + 16) ^ secret[2], wyr8_ce(key + p + 24) ^ see1);
					see2 = _wymum(wyr8_ce(key + p + 32) ^ secret[3], wyr8_ce(key + p + 40) ^ see2);
					p += 48;
					i -= 48;
				} while (i > 48);
				seed ^= see1 ^ see2;
			}
			while (i > 16) {
				size_t p = len - i;
				seed = _wymum(wyr8_ce(key + p) ^ secret[1], wyr8_ce(key + p + 8) ^ seed);
				i -= 16;
			}
			a = wyr8_ce(key + len - 16);
			b = wyr8_ce(key + len - 8);
		}

		return _wymum(secret[1] ^ len, _wymum(a ^ secret[1], b ^ seed));
	}

	// Core WyHash function (runtime)
	inline uint64_t hash(const void* key, size_t len, uint64_t seed = 0, const uint64_t* secret = _wyp) {
		const uint8_t* p = (const uint8_t*)key;
		seed ^= secret[0];
		uint64_t a = 0, b = 0; // Explicitly initialized to prevent any warnings

		if (len <= 16) {
			if (len >= 4) {
				a = (_wyr4(p) << 32) | _wyr4(p + ((len >> 3) << 2));
				b = (_wyr4(p + len - 4) << 32) | _wyr4(p + len - 4 - ((len >> 3) << 2));
			} else if (len > 0) {
				a = _wyr3(p, len);
				b = 0;
			} else {
				a = 0;
				b = 0;
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

	// Constexpr overload for string literals (enables compile-time hashing)
	constexpr uint64_t hash(const char* str, uint64_t seed = 0) {
		return hash_constexpr(str, constexpr_strlen(str), seed, _wyp);
	}

} // namespace wyhash

#endif