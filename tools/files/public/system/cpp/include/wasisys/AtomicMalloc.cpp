//AtomicMalloc.cpp
#pragma once

// ==========================================
// 1. dlmalloc Configuration & Inclusion
// ==========================================

#include <atomic>
#include <stdint.h>
#include <stddef.h>
#include <new>
#include <cstdlib>
#include <cstring>
#include <cstddef>
#include <cstdint>

#define USE_DL_PREFIX
#define USE_MALLOC_LOCK 1
#define HAVE_MMAP 0
#define HAVE_MREMAP 0
#define HAVE_MORECORE 1
#define LACKS_SYS_MMAN_H 1
#define LACKS_UNISTD_H 1
#define LACKS_STDLIB_H 1
#define LACKS_STRING_H 1
#define LACKS_ERRNO_H 1
#define NO_MALLOC_STATS 1
#define ABORT __builtin_trap
#define MALLOC_FAILURE_ACTION ((void)0)

// ==========================================
// 1. Shared Metadata Addresses (In SharedArrayBuffer)
// ==========================================
// We use 300kb (0xf8000) to safely avoid any Wasm data segment overwrites.
#define SHARED_META_BASE         0xf8000
#define SHARED_INIT_FLAG_ADDR    (SHARED_META_BASE)
#define SHARED_BRK_ADDR          (SHARED_META_BASE + 0x1000)
#define SHARED_MALLOC_STATE_ADDR (SHARED_META_BASE + 0x2000)
#define SHARED_LOCK_ADDR         (SHARED_META_BASE + 0x3000) // <--- CRITICAL: Shared Lock

// ==========================================
// 2. Custom Wasm Spinlock (Pointing to Shared Memory)
// ==========================================
#define WASM_LOCK_PTR ((volatile int*)SHARED_LOCK_ADDR)

static inline void wasm_lock_acquire(void) {
    while (__atomic_exchange_n(WASM_LOCK_PTR, 1, __ATOMIC_ACQUIRE)) {
        // Sleep until the lock word stops being 1. wait32 re-checks the value
        // atomically, so a release between the exchange and the wait just
        // returns "not-equal" and we retry — no lost wakeups.
        __builtin_wasm_memory_atomic_wait32((int32_t*)WASM_LOCK_PTR, 1, -1);
    }
}
static inline void wasm_lock_release(void) {
    __atomic_store_n(WASM_LOCK_PTR, 0, __ATOMIC_RELEASE);
    __builtin_wasm_memory_atomic_notify((int32_t*)WASM_LOCK_PTR, 1);
}

#define MALLOC_PREACTION   (wasm_lock_acquire(), 0)
#define MALLOC_POSTACTION  (wasm_lock_release(), 0)

// ==========================================
// 3. Thread-Safe Shared sbrk_custom
// ==========================================
extern char __heap_base;
#define MORECORE sbrk_custom
#define MORECORE_FAILURE ((void*)-1)

static void* sbrk_custom(ptrdiff_t increment) {
	uintptr_t* shared_brk = (uintptr_t*)SHARED_BRK_ADDR;

	uintptr_t expected = 0;
	uintptr_t safe_start = (uintptr_t)&__heap_base;
	// Ensure we start safely above our shared metadata region (0x3000 + some padding)
	if (safe_start < (SHARED_META_BASE + 0x4000)) {
		safe_start = SHARED_META_BASE + 0x4000;
	}

	// Atomically set to safe_start if it's currently 0
	__atomic_compare_exchange_n(shared_brk, &expected, safe_start, false, __ATOMIC_SEQ_CST, __ATOMIC_SEQ_CST);

	// Atomically reserve the requested increment
	uintptr_t old_brk = __atomic_load_n(shared_brk, __ATOMIC_RELAXED);
	uintptr_t new_brk;
	do {
		new_brk = old_brk + increment;
	} while (!__atomic_compare_exchange_n(shared_brk, &old_brk, new_brk, false, __ATOMIC_SEQ_CST, __ATOMIC_RELAXED));

	// Grow Wasm memory if needed
	uintptr_t current_pages = __builtin_wasm_memory_size(0);
	uintptr_t current_memory_end = current_pages * 65536;

	if (new_brk > current_memory_end) {
		size_t pages_needed = (new_brk - current_memory_end + 65535) / 65536;
		if (__builtin_wasm_memory_grow(0, pages_needed) == (uintptr_t)-1) {
			__atomic_fetch_sub(shared_brk, increment, __ATOMIC_SEQ_CST); // Rollback
			return (void*)-1;
		}
	}

	return (void*)old_brk;
}

// ==========================================
// 4. Force dlmalloc to use the Shared State
// ==========================================
#undef get_malloc_state
#define get_malloc_state() ((mstate)(SHARED_MALLOC_STATE_ADDR))


//this is dlmalloc
extern "C" {
	#include <wasisys/malloc.c> // Include AFTER all overrides
}

// ==========================================
// 5. One-Time Global Initialization
// ==========================================

extern "C" __attribute__((export_name("__initSharedAllocator")))
void __initSharedAllocator() {
	uint32_t* init_flag = (uint32_t*)SHARED_INIT_FLAG_ADDR;

	// If we are the first to set the flag to 1, we initialize the memory
	if (__atomic_exchange_n(init_flag, 1, __ATOMIC_SEQ_CST) == 0) {
		// Zero out the shared malloc state
		memset((void*)SHARED_MALLOC_STATE_ADDR, 0, sizeof(struct malloc_state));
		// Zero out the shared brk pointer
		__atomic_store_n((uintptr_t*)SHARED_BRK_ADDR, 0, __ATOMIC_SEQ_CST);
		// Zero out the shared lock
		__atomic_store_n(WASM_LOCK_PTR, 0, __ATOMIC_SEQ_CST);
	}
}


int *  __workerProcessId;

extern "C" __attribute__((export_name("__initProcess")))
void __initProcess(int processId)
{
	__workerProcessId=new int;

	*__workerProcessId=processId;
}

// ==========================================
// 7. Linker Wrappers & C++ Operators (Keep your existing ones)
// ==========================================
extern "C" void* __wrap_malloc(size_t size) { return dlmalloc(size); }
extern "C" void __wrap_free(void* ptr) { if (ptr) dlfree(ptr); }
extern "C" void* __wrap_realloc(void* ptr, size_t size) { return dlrealloc(ptr, size); }
extern "C" void* __wrap_calloc(size_t num, size_t size) { return dlcalloc(num, size); }
extern "C" void* __wrap_aligned_alloc(size_t alignment, size_t size) { return dlmemalign(alignment, size); }
extern "C" int __wrap_posix_memalign(void** memptr, size_t alignment, size_t size) {
	void* ptr = dlmemalign(alignment, size);
	if (!ptr) return 12;
	*memptr = ptr;
	return 0;
}

// ... [Keep your C++ new/delete overrides, JS imports/exports, and logger exactly as you had them] ...

// ==========================================
// 3. C++ Global operator new and delete
// ==========================================
// These intercept C++ 'new' and 'delete' keywords directly and bypass the wrapper for speed.

void* operator new(size_t size) { return dlmalloc(size); }
void* operator new[](size_t size) { return dlmalloc(size); }
void operator delete(void* ptr) noexcept { if (ptr) dlfree(ptr); }
void operator delete[](void* ptr) noexcept { if (ptr) dlfree(ptr); }

// C++14 sized deallocation
void operator delete(void* ptr, size_t) noexcept { if (ptr) dlfree(ptr); }
void operator delete[](void* ptr, size_t) noexcept { if (ptr) dlfree(ptr); }

// C++17 Aligned new/delete
void* operator new(size_t size, std::align_val_t) { return dlmalloc(size); }
void* operator new[](size_t size, std::align_val_t) { return dlmalloc(size); }
void operator delete(void* ptr, std::align_val_t) noexcept { if (ptr) dlfree(ptr); }
void operator delete[](void* ptr, std::align_val_t) noexcept { if (ptr) dlfree(ptr); }
void operator delete(void* ptr, size_t, std::align_val_t) noexcept { if (ptr) dlfree(ptr); }
void operator delete[](void* ptr, size_t, std::align_val_t) noexcept { if (ptr) dlfree(ptr); }

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