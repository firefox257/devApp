// ./test.cpp
#include <autogen.hpp>
#include "extensions/example_ext.hpp"
#include <cstdint>
#include <cstring>
#include <functional>
#include <vector>

ag_dedicated_thread_count(1);
ag_undedicated_thread_count(2);

ag_export(test_alloc_4_bytes)
uint32_t test_alloc_4_bytes() { return (uint32_t)(uintptr_t)malloc(4); }

ag_export(test_alloc_8_bytes)
uint32_t test_alloc_8_bytes() { return (uint32_t)(uintptr_t)malloc(8); }

ag_export(test_alloc_12_bytes)
uint32_t test_alloc_12_bytes() { return (uint32_t)(uintptr_t)malloc(12); }

ag_export(test_read_4_bytes)
uint32_t test_read_4_bytes(uint32_t* ptr) { return ptr ? *ptr : 0xDEADBEEF; }

ag_export(test_write_4_bytes)
uint32_t test_write_4_bytes(uint32_t* ptr) {
	if (ptr) { *ptr = 0xCAFEBABE; return 1; }
	return 0;
}

ag_export(test_create_future)
uint32_t test_create_future() { return (uint32_t)(uintptr_t)ag_create_future(); }

ag_export(test_resolve_future)
uint32_t test_resolve_future(ag_future* f) { ag_resolve_future(f, 99); return 0; }

ag_export(dummy_sync_target)
uint32_t dummy_sync_target() { return 42; }

ag_export(test_trigger_logs)
uint32_t test_trigger_logs() {
	msginfo << "Test info";
	msgwarn << "Test warn";
	msgerr << "Test err";
	return 1;
}

ag_export(run_all_cpp_tests)
uint32_t run_all_cpp_tests() {
	void* ptr1 = malloc(16);
	void* ptr2 = malloc(32);
	if (ptr1 && ptr2 && ptr1 != ptr2) js_report_test_result("CPP_Shared_Allocator", 1, "malloc OK");
	else js_report_test_result("CPP_Shared_Allocator", 0, "malloc failed");
	free(ptr1); free(ptr2);

	constexpr uint32_t hash1 = (uint32_t)wyhash::hash("test_func");
	constexpr uint32_t hash2 = (uint32_t)wyhash::hash("test_func");
	if (hash1 == hash2 && hash1 != 0) js_report_test_result("CPP_WyHash_Constexpr", 1, "WyHash OK");
	else js_report_test_result("CPP_WyHash_Constexpr", 0, "WyHash failed");

	ag_future* f = ag_create_future();
	if (f && f->status == 0) { js_report_test_result("CPP_Future_Creation", 1, "Future OK"); free(f); }
	else js_report_test_result("CPP_Future_Creation", 0, "Future failed");
	return 0;
}

uint32_t test_async_add(int a, int b) { return a + b; }
float test_async_float(float a, float b) { return a + b; }

void test_async_void_func(uint32_t* counter_ptr) {
	if (counter_ptr) __atomic_fetch_add(counter_ptr, 1, __ATOMIC_SEQ_CST);
}

struct SimpleResult { uint32_t value; };
SimpleResult test_async_class() { SimpleResult c; c.value = 12345; return c; }

ag_export(test_create_ag_async_future)
uint32_t test_create_ag_async_future() { return (uint32_t)(uintptr_t)ag_async(test_async_add, 15, 25); }

ag_export(test_cpp_await_int)
ag_future* test_cpp_await_int() {
	int res = ag_await(int, ag_async(test_async_add, 10, 20));
	ag_return res == 30 ? 1 : 0;
}

ag_export(test_create_async_class_future)
uint32_t test_create_async_class_future() { return (uint32_t)(uintptr_t)ag_async(test_async_class); }

ag_export(test_create_async_class_future1)
ag_future* test_create_async_class_future1() {
	SimpleResult res = ag_await(SimpleResult, ag_async(test_async_class));
	ag_return res.value == 12345 ? 1 : 0;
}

ag_export(test_create_dedicated_future)
uint32_t test_create_dedicated_future(uint32_t target_id, int a, int b) {
	return (uint32_t)(uintptr_t)ag_async_on(target_id, test_async_add, a, b);
}

ag_export(test_create_async_dedicated_class_future)
ag_future* test_create_async_dedicated_class_future(uint32_t target_id) {
	SimpleResult res = ag_await(SimpleResult, ag_async_on(target_id, test_async_class));
	ag_return res.value == 12345 ? 1 : 0;
}

ag_export(test_multi_param)
uint32_t test_multi_param(uint32_t a, uint32_t b, uint32_t c) { return a + b + c; }

ag_export(test_async_void_execution)
ag_future* test_async_void_execution() {
	uint32_t* counter = (uint32_t*)malloc(sizeof(uint32_t));
	*counter = 0;
	ag_await(void, ag_async(test_async_void_func, counter));
	uint32_t result = *counter;
	free(counter);
	ag_return result == 1 ? 1 : 0;
}

uint32_t sync_target_add(int a, int b) { return a + b; }

ag_export(test_sync_call)
uint32_t test_sync_call(uint32_t target_id, int a, int b) {
	return ag_sync(target_id, sync_target_add, a, b);
}

ag_export(test_lambda_async)
ag_future* test_lambda_async() {
	auto my_lambda = [](int a, int b) { return a * b; };
	ag_future* f = ag_async(my_lambda, 6, 7);
	int res = ag_await(int, f);
	ag_return res == 42 ? 1 : 0;
}

ag_export(test_lambda_async_on)
ag_future* test_lambda_async_on(uint32_t target_id) {
	auto my_lambda = [](int a, int b) { return a + b + 10; };
	ag_future* f = ag_async_on(target_id, my_lambda, 5, 5);
	int res = ag_await(int, f);
	ag_return res == 20 ? 1 : 0;
}

ag_export(test_lambda_capture_async)
ag_future* test_lambda_capture_async() {
	int multiplier = 7;
	auto my_lambda = [multiplier](int a, int b) { return a * b * multiplier; };
	ag_future* f = ag_async(my_lambda, 2, 3);
	int res = ag_await(int, f);
	ag_return res == 42 ? 1 : 0;
}

ag_export(test_lambda_val_to_ref_async)
ag_future* test_lambda_val_to_ref_async() {
	int val = 10;
	auto my_lambda = [](int& ref) { ref = 99; return ref + 1; };
	ag_future* f = ag_async(my_lambda, val);
	int res = ag_await(int, f);
	ag_return (res == 100 && val == 10) ? 1 : 0;
}

ag_export(test_lambda_std_ref_async)
ag_future* test_lambda_std_ref_async() {
	int val = 10;
	auto my_lambda = [](int& ref) { ref = 99; return ref + 1; };
	ag_future* f = ag_async(my_lambda, std::ref(val));
	int res = ag_await(int, f);
	ag_return (res == 100 && val == 99) ? 1 : 0;
}

ag_export(test_lambda_capture_ref_async)
ag_future* test_lambda_capture_ref_async() {
	int multiplier = 5;
	int val = 10;
	auto my_lambda = [multiplier](int& ref) { ref = ref * multiplier; return ref; };
	ag_future* f = ag_async(my_lambda, std::ref(val));
	int res = ag_await(int, f);
	ag_return (res == 50 && val == 50) ? 1 : 0;
}

class try1 {
	public:
	uint32_t value;
	try1() : value(0xABCDEF00) {}
};
registerGlobal(try1, globalTry1);

ag_export(test)
uint32_t test() {
	return globalTry1 && globalTry1->value == 0xABCDEF00 ? 1 : 0;
}

void test_global_async_set() { globalTry1->value = 123; }

ag_export(testthread)
ag_future* testthread() {
	ag_await(void, ag_async(test_global_async_set));
	bool testb = globalTry1->value == 123;
	globalTry1->value = 0xABCDEF00;
	ag_return (uint32_t)testb;
}

ag_export(test_yield_task_js)
ag_future* test_yield_task_js(uint32_t* counter_ptr) {
	if (counter_ptr) {
		*counter_ptr += 1;
		ag_yield();
		*counter_ptr += 2;
		ag_yield();
		*counter_ptr += 4;
	}
	ag_return 7;
}

ag_export(test_ext_main_async)
ag_future* test_ext_main_async() {
	ag_future* f = ext::add_async(10, 25);
	int res = ag_await(int, f);
	ag_return res == 35 ? 1 : 0;
}

ag_export(test_ext_main_sync)
uint32_t test_ext_main_sync() {
	int res = ext::add_sync(100, 200);
	return res == 300 ? 1 : 0;
}

ag_export(test_ext_main_async_promise)
ag_future* test_ext_main_async_promise() {
	ag_future* f = ext::add_async_promise(10, 25);
	int res = ag_await(int, f);
	ag_return res == 135 ? 1 : 0;
}

ag_export(test_ext_worker_async)
ag_future* test_ext_worker_async() {
	ag_future* f = ext::mul_async(6, 7);
	int res = ag_await(int, f);
	ag_return res == 42 ? 1 : 0;
}

ag_export(test_ext_worker_sync)
uint32_t test_ext_worker_sync() {
	int res = ext::mul_sync(5, 8);
	return res == 40 ? 1 : 0;
}

ag_export(test_ext_worker_async_promise)
ag_future* test_ext_worker_async_promise() {
	ag_future* f = ext::mul_async_promise(6, 7);
	int res = ag_await(int, f);
	ag_return (res == 42) ? 1u : 0u;
}

ag_export(test_ext_fire_and_forget)
uint32_t test_ext_fire_and_forget() {
	uint32_t* counter = (uint32_t*)malloc(sizeof(uint32_t));
	*counter = 0;
	ext::fnf_increment(counter);
	return 1;
}

// ==========================================
// HETEROGENEOUS AG_AWAIT_ALL TEST
// ==========================================
ag_export(test_await_all_heterogeneous)
ag_future* test_await_all_heterogeneous() {
	std::vector<ag_future*> futures;
	futures.push_back(ag_async(test_async_add, 10, 20));       // returns int (30)
	futures.push_back(ag_async(test_async_float, 1.5f, 2.5f)); // returns float (4.0)
	futures.push_back(ag_async(test_async_add, 100, 200));     // returns int (300)

	auto results = ag_await_all(futures);

	int i1 = results.get<int>(0);
	float f1 = results.get<float>(1);
	int i2 = results.get<int>(2);

	bool pass = (i1 == 30 && f1 == 4.0f && i2 == 300);
	ag_return pass ? 1 : 0;
}