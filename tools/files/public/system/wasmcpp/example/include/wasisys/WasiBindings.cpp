//WasmBimsings
#pragma once

#include <wasisys/AtomicMalloc.cpp>




// ==========================================
// 4. JS Imports / Exports & Custom Logger
// ==========================================

// Declare the external JS functions (Synchronous imports)
extern "C" __attribute__((import_module("__jssys"), import_name("jsCout")))
void jsCout(const char* str);

extern "C" __attribute__((import_module("__jssys"), import_name("jsSendToPeer")))
void jsSendToPeer(int targetId, int targetSectionId, const void* srcPtr);



//Need to have a custim defined
// 🚀 Called by JS when a P2P message arrives and memory is copied
extern "C" __attribute__((export_name("onJsPeerMessage")))
void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size);



/// not Required anymore for messaging
/*
extern "C" __attribute__((export_name("__cppAllocateMsg")))
void* __cppAllocateMsg(int targetSectionId, size_t size) {
	// Stubbed in malloc for now, but can be upgraded to a memory pool later
	void* ptr = malloc(size);
	if (ptr) ((bool*)ptr)[0] = true;
	return ptr;
}
//*/

// Standard memory management exports (routed through wrappers automatically)
extern "C" __attribute__((export_name("cppmalloc")))
void* wasm_malloc(size_t size) {
	return malloc(size);
}

extern "C" __attribute__((export_name("cppfree")))
void wasm_free(void* ptr) {
	free(ptr);
}

extern "C" __attribute__((export_name("cpprealloc")))
void* wasm_realloc(void* ptr, std::size_t size) {
	return realloc(ptr, size);
}

// Helper functions for number to string conversion without stdlib bloat
static void uint64_to_cstr(uint64_t v, char* buf) {
	if (v == 0) { buf[0] = '0'; buf[1] = '\0'; return; }
	int i = 0;
	while (v > 0) { buf[i++] = (v % 10) + '0'; v /= 10; }
	buf[i] = '\0';
	for (int j = 0, k = i - 1; j < k; j++, k--) {
		char temp = buf[j]; buf[j] = buf[k]; buf[k] = temp;
	}
}

static void int64_to_cstr(int64_t v, char* buf) {
	if (v < 0) {
		buf[0] = '-';
		uint64_to_cstr(-(uint64_t)v, buf + 1);
	} else {
		uint64_to_cstr((uint64_t)v, buf);
	}
}

// Custom synchronous logger
namespace std
{
	class logImplement {
		public:
		logImplement() {}

		logImplement& operator << (bool v) {
			jsCout(v ? "true" : "false");
			return *this;
		}

		logImplement& operator << (int8_t v)   { char b[24]; int64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (int16_t v)  { char b[24]; int64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (int32_t v)  { char b[24]; int64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (int64_t v)  { char b[24]; int64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (uint8_t v)  { char b[24]; uint64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (uint16_t v) { char b[24]; uint64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (uint32_t v) { char b[24]; uint64_to_cstr(v, b); jsCout(b); return *this; }
		logImplement& operator << (uint64_t v) { char b[24]; uint64_to_cstr(v, b); jsCout(b); return *this; }

		logImplement& operator << (float v)    { char b[24]; int64_to_cstr((int64_t)v, b); jsCout(b); return *this; }
		logImplement& operator << (double v)   { char b[24]; int64_to_cstr((int64_t)v, b); jsCout(b); return *this; }

		logImplement& operator << (char v) {
			char b[2] = {v, '\0'};
			jsCout(b);
			return *this;
		}

		logImplement& operator << (const char* v) {
			jsCout(v ? v : "null");
			return *this;
		}
		logImplement& operator << (char* v) {
			jsCout(v ? v : "null");
			return *this;
		}
	};
	extern "C" logImplement __wrap_cout;

}



#ifdef WASM
#define cout __wrap_cout
#endif
