// example1.cpp
// Autogen Phase 2 Boilerplate Example
//
// NOTE: cppmalloc, cppfree, and cpprealloc are reserved EXCLUSIVELY for JavaScript usage.
// In C++ code, we use standard malloc, free, realloc, new, delete, new[], delete[] as normal.
#include <autogen.hpp>
#include <cstdint>
#include "example1_ext.hpp"

// ============================================================================
// 1. THREAD CONFIGURATION
// ============================================================================
ag_dedicated_thread_count(1);  // Dedicated worker ID 1
ag_undedicated_thread_count(2); // Undedicated worker IDs 2, 3

// ============================================================================
// 2. BASIC EXPORTED FUNCTION
// ============================================================================
ag_export(add_numbers)
uint32_t add_numbers(uint32_t a, uint32_t b) {
	return a + b;
}

// ============================================================================
// 3. ag_async + ag_future + ag_await  (UNDEDICATED POOL)
// ============================================================================
uint32_t heavy_computation(uint32_t iterations) {
	uint32_t result = 0;
	for (uint32_t i = 0; i < iterations; i++) {
		result += i;
	}
	return result;
}

// Example A: Return the future pointer to JS (JS polls / wraps it)
ag_export(run_async_computation)
uint32_t run_async_computation(uint32_t iterations) {
	return (uint32_t)(uintptr_t)ag_async(heavy_computation, iterations);
}

// Example B: Non-blocking C++ wait with ag_await, return the final result via ag_future*
ag_export(run_async_computation_blocking)
ag_future* run_async_computation_blocking(uint32_t iterations) {
	ag_future* fut = ag_async(heavy_computation, iterations);
	uint32_t result = ag_await(uint32_t, fut);
	ag_return result;
}

// Example C: ag_async with a lambda (captureless)
ag_export(run_async_lambda)
ag_future* run_async_lambda(uint32_t a, uint32_t b) {
	ag_future* fut = ag_async([](uint32_t x, uint32_t y) {
			return x * y + 1;
		}, a, b);
	uint32_t result = ag_await(uint32_t, fut);
	ag_return result;
}

// Example D: ag_async with a capturing lambda
ag_export(run_async_capturing_lambda)
ag_future* run_async_capturing_lambda(uint32_t base) {
	uint32_t multiplier = 3;
	ag_future* fut = ag_async([multiplier](uint32_t val) {
			return val * multiplier;
		}, base);
	uint32_t result = ag_await(uint32_t, fut);
	ag_return result;
}

// ============================================================================
// 4. ag_async_on + ag_future + ag_await  (DEDICATED WORKER TARGETING)
// ============================================================================
uint32_t dedicated_task(uint32_t value) {
	return value * 100 + 7;
}

// Example E: Target dedicated worker 1, return future to JS
ag_export(run_dedicated_async)
uint32_t run_dedicated_async(uint32_t value) {
	return (uint32_t)(uintptr_t)ag_async_on(1, dedicated_task, value);
}

// Example F: Target dedicated worker 1, non-blocking wait with ag_await
ag_export(run_dedicated_async_blocking)
ag_future* run_dedicated_async_blocking(uint32_t value) {
	ag_future* fut = ag_async_on(1, dedicated_task, value);
	uint32_t result = ag_await(uint32_t, fut);
	ag_return result;
}

// Example G: ag_async_on with a lambda on dedicated worker
ag_export(run_dedicated_lambda)
ag_future* run_dedicated_lambda(uint32_t a, uint32_t b) {
	ag_future* fut = ag_async_on(1, [](uint32_t x, uint32_t y) {
			return x + y + 1000;
		}, a, b);
	uint32_t result = ag_await(uint32_t, fut);
	ag_return result;
}

// ============================================================================
// 5. ag_sync  (BLOCKING WORKER-TO-WORKER)
// ============================================================================
uint32_t sync_target_function(uint32_t multiplier) {
	return multiplier * 10;
}

ag_export(test_sync_call)
uint32_t test_sync_call(uint32_t target_worker_id, uint32_t multiplier) {
	// ag_sync remains blocking and returns the value directly
	return ag_sync(target_worker_id, sync_target_function, multiplier);
}

// ============================================================================
// 6. GLOBAL SHARED STATE  (registerGlobal)
// ============================================================================
struct AppContext {
	uint32_t startup_count;
	AppContext() : startup_count(1) {}
};
registerGlobal(AppContext, g_appContext);

ag_export(get_startup_count)
uint32_t get_startup_count() {
	if (g_appContext) return g_appContext->startup_count;
	return 0;
}

ag_export(increment_startup_count)
uint32_t increment_startup_count() {
	if (g_appContext) {
		g_appContext->startup_count++;
		return g_appContext->startup_count;
	}
	return 0;
}

// ============================================================================
// 7. COOPERATIVE MULTITASKING  (ag_yield)
// ============================================================================
ag_export(run_yielding_task)
ag_future* run_yielding_task(uint32_t* progress_ptr) {
	if (progress_ptr) {
		*progress_ptr = 25;
		ag_yield();
		*progress_ptr = 50;
		ag_yield();
		*progress_ptr = 75;
		ag_yield();
		*progress_ptr = 100;
	}
	ag_return 1;
}

// ============================================================================
// 8. EXTENSIONS  (External Calls)
// ============================================================================
ag_export(test_extensions)
ag_future* test_extensions() {
	ext::ui_add_log(0, 42);
	uint32_t seed = ext::get_main_thread_seed();
	ext::ui_add_log(1, seed);
	ag_future* f = ext::worker_mock_fetch(seed);
	uint32_t result = ag_await(uint32_t, f);
	ext::ui_add_log(2, result);
	ag_return result;
}

// ============================================================================
// 9. STREAM-LIKE LOGGING
// ============================================================================
ag_export(test_stream_logging)
uint32_t test_stream_logging() {
	msginfo << "Stream logging initialized. Value: " << 42 << ", Hex: " << 0xDEADBEEF;
	msgwarn << "This is a warning with double: " << 3.14159;
	msgerr << "Critical error code: " << (int32_t)-1;
	return 1;
}