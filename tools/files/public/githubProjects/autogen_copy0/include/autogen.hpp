// ./include/autogen.hpp
#ifndef AUTOGEN_HPP
#define AUTOGEN_HPP
#include "wyhash.hpp"
#include <wasisys/AtomicMalloc.cpp>
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <string>
#include <string_view>
#include <new>
#include <type_traits>
#include <tuple>
#include <utility>
#include <functional>
#include <coroutine>
#include <vector>

#define ag_dedicated_thread_count(C) extern "C" __attribute__((export_name("get_dedicated_count"))) uint32_t get_dedicated_count() { return C; }
#define ag_undedicated_thread_count(C) extern "C" __attribute__((export_name("get_undedicated_count"))) uint32_t get_undedicated_count() { return C; }
#define ag_return co_return

enum ag_status : uint32_t {
	AG_SUCCESS = 0, AG_ERR_INVALID_NAME = 1, AG_ERR_INVALID_WORKER = 2,
	AG_ERR_CAPACITY_EXHAUSTED = 3, AG_ERR_INVALID_CALL_STATE = 4,
	AG_ERR_INVALID_MEMORY = 5, AG_ERR_UNKNOWN = 0xDEADBEEF
};

struct ag_sync_req {
	uint32_t status; uint32_t dispatcher_ptr; uint32_t this_ptr;
	uint32_t args_ptr; uint32_t result; uint32_t error_code;
};

struct AutogenContext {
	uint32_t magic;
	uint32_t current_worker_id;
	uint32_t sync_req_pool[64];
	volatile uint32_t sync_req_pool_top;
};

inline uint32_t g_ctx_ptr = 0;

extern "C" __attribute__((export_name("ag_alloc_context")))
uint32_t ag_alloc_context() {
	uint32_t ptr = (uint32_t)(uintptr_t)malloc(sizeof(AutogenContext));
	if (ptr) memset((void*)(uintptr_t)ptr, 0, sizeof(AutogenContext));
	return ptr;
}

extern "C" __attribute__((export_name("set_autogen_context")))
void set_autogen_context(uint32_t ptr) { g_ctx_ptr = ptr; }

extern "C" __attribute__((export_name("ag_ensure_context")))
uint32_t ag_ensure_context() {
	if (g_ctx_ptr) return g_ctx_ptr;
	g_ctx_ptr = ag_alloc_context();
	return g_ctx_ptr;
}

inline AutogenContext* get_context() {
	if (!g_ctx_ptr) ag_ensure_context();
	return (AutogenContext*)(uintptr_t)g_ctx_ptr;
}

extern "C" __attribute__((export_name("ag_set_worker_id")))
void ag_set_worker_id(uint32_t id) {
	AutogenContext* ctx = get_context();
	if (ctx) ctx->current_worker_id = id;
}

struct ag_global_name_node {
	const char* name;
	ag_global_name_node* next;
};

inline ag_global_name_node*& _get_global_names_head() {
	static ag_global_name_node* head = nullptr; return head;
}

#if defined(__wasm__)
extern "C" void __wasm_call_ctors();
extern "C" __attribute__((export_name("ag_call_ctors")))
void ag_call_ctors() {
	static uint32_t _ag_ctor_lock = 0; static uint32_t _ag_ctor_done = 0;
	while (__atomic_exchange_n(&_ag_ctor_lock, 1, __ATOMIC_ACQUIRE)) {}
	if (_ag_ctor_done == 0) {
		_get_global_names_head() = nullptr;
		__wasm_call_ctors(); _ag_ctor_done = 1;
	}
	__atomic_store_n(&_ag_ctor_lock, 0, __ATOMIC_RELEASE);
}
#else
extern "C" void ag_call_ctors() {}
#endif

#define ag_export(func_name) extern "C" __attribute__((export_name(#func_name)))

#define registerGlobal(type, name) \
inline type* name = nullptr; \
extern "C" __attribute__((export_name("init_" #name))) \
uint32_t init_##name() { \
	return (uint32_t)(uintptr_t)new type(); \
} \
extern "C" __attribute__((export_name("set_" #name))) \
void set_##name(uint32_t ptr) { \
	name = (type*)(uintptr_t)ptr; \
} \
static ag_global_name_node _ag_global_name_node_##name = { #name, nullptr }; \
__attribute__((constructor, used, retain)) void _ag_register_global_##name() { \
	_ag_global_name_node_##name.next = _get_global_names_head(); \
	_get_global_names_head() = &_ag_global_name_node_##name; \
}

extern "C" {
	void js_msginfo(const char* msg); void js_msgwarn(const char* msg); void js_msgerr(const char* msg);
	void js_report_test_result(const char* test_name, uint32_t passed, const char* message);
	void js_post_async_task(uint32_t target_worker_id, uint32_t dispatcher_ptr, uint32_t this_ptr, uint32_t args_ptr, uint32_t future_ptr);
	void js_sync_call(uint32_t target_worker_id, uint32_t dispatcher_ptr, uint32_t this_ptr, uint32_t args_ptr, uint32_t sync_req_ptr);
	void js_yield_coroutine(uint32_t coro_handle_ptr);
	void js_ext_call_async(uint32_t context, const char* name, uint32_t args_ptr, uint32_t future_ptr);
	void js_ext_call_sync(uint32_t context, const char* name, uint32_t args_ptr, uint32_t sync_req_ptr);
	void js_ext_call_fire_and_forget(uint32_t context, const char* name, uint32_t args_ptr);
}

// ==========================================
// STREAM-LIKE LOGGING SYSTEM
// ==========================================
enum class ag_log_level { info, warn, err };

struct ag_log_stream {
	ag_log_level level;
	char* buffer;
	uint32_t capacity;
	uint32_t size;
	ag_log_stream(ag_log_level lvl) : level(lvl), buffer(nullptr), capacity(256), size(0) {
		buffer = (char*)malloc(capacity);
		if (buffer) buffer[0] = '\0';
	}
	~ag_log_stream() {
		if (buffer) {
			if (level == ag_log_level::info) js_msginfo(buffer);
			else if (level == ag_log_level::warn) js_msgwarn(buffer);
			else if (level == ag_log_level::err) js_msgerr(buffer);
			free(buffer);
		}
	}
	ag_log_stream(const ag_log_stream&) = delete;
	ag_log_stream& operator=(const ag_log_stream&) = delete;
	void ensure_capacity(uint32_t extra) {
		if (size + extra + 1 > capacity) {
			capacity = (size + extra + 1) * 2;
			buffer = (char*)realloc(buffer, capacity);
		}
	}
	ag_log_stream& operator<<(const char* str) {
		if (!str) return *this;
		uint32_t len = 0; while (str[len]) len++;
		ensure_capacity(len);
		for (uint32_t i = 0; i <= len; i++) buffer[size + i] = str[i];
		size += len;
		return *this;
	}
	ag_log_stream& operator<<(const std::string& str) { return *this << str.c_str(); }
	ag_log_stream& operator<<(std::string_view str) {
		ensure_capacity(str.size());
		for (size_t i = 0; i < str.size(); i++) buffer[size + i] = str[i];
		size += str.size();
		buffer[size] = '\0';
		return *this;
	}
	ag_log_stream& operator<<(char c) {
		ensure_capacity(1);
		buffer[size++] = c;
		buffer[size] = '\0';
		return *this;
	}
	ag_log_stream& operator<<(int32_t val) {
		char tmp[16]; int i = 0;
		if (val == 0) { tmp[i++] = '0'; }
		else {
			bool neg = val < 0;
			uint32_t v = neg ? (uint32_t)(-val) : (uint32_t)val;
			while (v > 0) { tmp[i++] = '0' + (v % 10); v /= 10; }
			if (neg) tmp[i++] = '-';
		}
		tmp[i] = '\0';
		for (int j = 0, k = i - 1; j < k; j++, k--) { char t = tmp[j]; tmp[j] = tmp[k]; tmp[k] = t; }
		return *this << tmp;
	}
	ag_log_stream& operator<<(uint32_t val) {
		char tmp[16]; int i = 0;
		if (val == 0) { tmp[i++] = '0'; }
		else { while (val > 0) { tmp[i++] = '0' + (val % 10); val /= 10; } }
		tmp[i] = '\0';
		for (int j = 0, k = i - 1; j < k; j++, k--) { char t = tmp[j]; tmp[j] = tmp[k]; tmp[k] = t; }
		return *this << tmp;
	}
	ag_log_stream& operator<<(int64_t val) {
		char tmp[32]; int i = 0;
		if (val == 0) { tmp[i++] = '0'; }
		else {
			bool neg = val < 0;
			uint64_t v = neg ? (uint64_t)(-(val + 1)) + 1 : (uint64_t)val;
			while (v > 0) { tmp[i++] = '0' + (v % 10); v /= 10; }
			if (neg) tmp[i++] = '-';
		}
		tmp[i] = '\0';
		for (int j = 0, k = i - 1; j < k; j++, k--) { char t = tmp[j]; tmp[j] = tmp[k]; tmp[k] = t; }
		return *this << tmp;
	}
	ag_log_stream& operator<<(uint64_t val) {
		char tmp[32]; int i = 0;
		if (val == 0) { tmp[i++] = '0'; }
		else { while (val > 0) { tmp[i++] = '0' + (val % 10); val /= 10; } }
		tmp[i] = '\0';
		for (int j = 0, k = i - 1; j < k; j++, k--) { char t = tmp[j]; tmp[j] = tmp[k]; tmp[k] = t; }
		return *this << tmp;
	}
	ag_log_stream& operator<<(double val) {
		char tmp[64];
		int n = snprintf(tmp, sizeof(tmp), "%g", val);
		if (n > 0) {
			ensure_capacity(n);
			for (int j = 0; j < n; j++) buffer[size + j] = tmp[j];
			size += n;
			buffer[size] = '\0';
		}
		return *this;
	}
	ag_log_stream& operator<<(bool val) { return *this << (val ? "true" : "false"); }
	ag_log_stream& operator<<(void* val) {
		char tmp[32];
		int n = snprintf(tmp, sizeof(tmp), "%p", val);
		if (n > 0) {
			ensure_capacity(n);
			for (int j = 0; j < n; j++) buffer[size + j] = tmp[j];
			size += n;
			buffer[size] = '\0';
		}
		return *this;
	}
	template <typename T>
	typename std::enable_if<std::is_integral<T>::value && !std::is_same<T, bool>::value && !std::is_same<T, char>::value, ag_log_stream&>::type
	operator<<(const T& val) {
		return *this << static_cast<uint64_t>(val);
	}
};

#define msginfo ag_log_stream(ag_log_level::info)
#define msgwarn ag_log_stream(ag_log_level::warn)
#define msgerr ag_log_stream(ag_log_level::err)

struct ag_spinlock {
	volatile uint32_t* lock_ptr;
	ag_spinlock() { lock_ptr = (volatile uint32_t*)malloc(sizeof(uint32_t)); if (lock_ptr) *lock_ptr = 0; }
	~ag_spinlock() { if (lock_ptr) { free((void*)lock_ptr); lock_ptr = nullptr; } }
	ag_spinlock(const ag_spinlock&) = delete; ag_spinlock& operator=(const ag_spinlock&) = delete;
	void lock() { if (!lock_ptr) return; while (__atomic_exchange_n((uint32_t*)lock_ptr, 1, __ATOMIC_ACQUIRE)) {} }
	void unlock() { if (!lock_ptr) return; __atomic_store_n((uint32_t*)lock_ptr, 0, __ATOMIC_RELEASE); }
};

struct ag_future {
	volatile uint32_t status;
	uint32_t result_ptr;
	uint32_t error_code;
	void* coro_handle;
};

inline ag_future* ag_create_future() {
	ag_future* f = (ag_future*)malloc(sizeof(ag_future));
	f->status = 0; f->result_ptr = 0; f->error_code = 0; f->coro_handle = nullptr;
	return f;
}

inline void ag_resolve_future(ag_future* f, uint32_t result_ptr) {
	f->result_ptr = result_ptr; __atomic_store_n(&f->status, 1, __ATOMIC_RELEASE);
}

inline void ag_reject_future(ag_future* f, uint32_t error_code) {
	f->error_code = error_code; __atomic_store_n(&f->status, 2, __ATOMIC_RELEASE);
}

extern "C" uint32_t get_undedicated_count(); extern "C" uint32_t get_dedicated_count();

inline uint32_t& ag_undedicated_round_robin() {
	static uint32_t* ptr = nullptr;
	if (!ptr) {
		uint32_t new_ptr = (uint32_t)(uintptr_t)malloc(sizeof(uint32_t));
		memset((void*)(uintptr_t)new_ptr, 0, sizeof(uint32_t)); uint32_t expected = 0;
		if (!__atomic_compare_exchange_n((uint32_t*)&ptr, &expected, new_ptr, false, __ATOMIC_RELEASE, __ATOMIC_RELAXED)) free((void*)(uintptr_t)new_ptr);
	}
	return *ptr;
}

inline uint32_t ag_get_next_undedicated_worker() {
	uint32_t count = get_undedicated_count();
	if (count == 0) return 0;
	AutogenContext* ctx = get_context();
	uint32_t current_worker = ctx ? ctx->current_worker_id : 0;
	uint32_t offset = __atomic_fetch_add(&ag_undedicated_round_robin(), 1, __ATOMIC_RELAXED);
	for (uint32_t i = 0; i < count; i++) {
		uint32_t target_offset = (offset + i) % count;
		uint32_t base_id = get_dedicated_count() + 1 + target_offset;
		if (base_id != current_worker) { return base_id; }
	}
	return 0;
}

inline ag_future* ag_async_dispatch(uint32_t dispatcher_ptr, uint32_t this_ptr, uint32_t args_ptr, uint32_t target_worker_id = 0) {
	ag_future* f = ag_create_future();
	if (target_worker_id == 0) target_worker_id = ag_get_next_undedicated_worker();
	js_post_async_task(target_worker_id, dispatcher_ptr, this_ptr, args_ptr, (uint32_t)(uintptr_t)f); return f;
}

template <typename F, typename = void> struct ag_callable_traits_impl;
template <typename R, typename... Args> struct ag_callable_traits_impl<R(*)(Args...)> { using return_type = R; };
template <typename C, typename R, typename... Args> struct ag_callable_traits_impl<R(C::*)(Args...) const> { using return_type = R; };
template <typename C, typename R, typename... Args> struct ag_callable_traits_impl<R(C::*)(Args...)> { using return_type = R; };
template <typename F> struct ag_callable_traits_impl<F, std::void_t<decltype(&std::decay_t<F>::operator())>> : ag_callable_traits_impl<decltype(&std::decay_t<F>::operator())> {};
template <typename F> struct ag_callable_traits : ag_callable_traits_impl<std::decay_t<F>> {};

template <typename F, typename ArgsTuple>
uint32_t ag_callable_trampoline(uint32_t this_ptr, uint32_t args_ptr) {
	using DecayF = std::decay_t<F>;
	using ReturnType = typename ag_callable_traits<DecayF>::return_type;
	DecayF* func_ptr = reinterpret_cast<DecayF*>((uintptr_t)this_ptr);
	ArgsTuple* packed_args = reinterpret_cast<ArgsTuple*>((uintptr_t)args_ptr);
	if constexpr (std::is_void_v<ReturnType>) {
		std::apply(*func_ptr, *packed_args);
		free((void*)(uintptr_t)args_ptr);
		free((void*)(uintptr_t)this_ptr);
		return 0;
	} else {
		ReturnType* ret_ptr = (ReturnType*)malloc(sizeof(ReturnType));
		if (!ret_ptr) {
			free((void*)(uintptr_t)args_ptr);
			free((void*)(uintptr_t)this_ptr);
			return 0;
		}
		new (ret_ptr) ReturnType(std::apply(*func_ptr, *packed_args));
		free((void*)(uintptr_t)args_ptr);
		free((void*)(uintptr_t)this_ptr);
		return (uint32_t)(uintptr_t)ret_ptr;
	}
}

template <typename F, typename... CallArgs>
ag_future* ag_async_impl_raw(F&& func, CallArgs&&... call_args) {
	using DecayF = std::decay_t<F>;
	using ArgsTuple = std::tuple<std::decay_t<CallArgs>...>;
	DecayF* func_ptr = (DecayF*)malloc(sizeof(DecayF));
	new (func_ptr) DecayF(std::forward<F>(func));
	uint32_t args_ptr = (uint32_t)(uintptr_t)malloc(sizeof(ArgsTuple));
	new ((void*)(uintptr_t)args_ptr) ArgsTuple(std::forward<CallArgs>(call_args)...);
	uintptr_t dispatcher_ptr = (uintptr_t)&ag_callable_trampoline<DecayF, ArgsTuple>;
	return ag_async_dispatch((uint32_t)dispatcher_ptr, (uint32_t)(uintptr_t)func_ptr, args_ptr);
}

template <typename F, typename... CallArgs>
ag_future* ag_async_impl_target_raw(uint32_t target_worker_id, F&& func, CallArgs&&... call_args) {
	using DecayF = std::decay_t<F>;
	using ArgsTuple = std::tuple<std::decay_t<CallArgs>...>;
	DecayF* func_ptr = (DecayF*)malloc(sizeof(DecayF));
	new (func_ptr) DecayF(std::forward<F>(func));
	uint32_t args_ptr = (uint32_t)(uintptr_t)malloc(sizeof(ArgsTuple));
	new ((void*)(uintptr_t)args_ptr) ArgsTuple(std::forward<CallArgs>(call_args)...);
	uintptr_t dispatcher_ptr = (uintptr_t)&ag_callable_trampoline<DecayF, ArgsTuple>;
	return ag_async_dispatch((uint32_t)dispatcher_ptr, (uint32_t)(uintptr_t)func_ptr, args_ptr, target_worker_id);
}

template <typename F, typename... Args>
auto ag_async_impl(F&& func, Args&&... args) {
	using ReturnType = typename ag_callable_traits<std::decay_t<F>>::return_type;
	ag_future* f = ag_async_impl_raw(std::forward<F>(func), std::forward<Args>(args)...);
	return f;
}

template <typename F, typename... Args>
auto ag_async_impl_target(uint32_t target_worker_id, F&& func, Args&&... args) {
	using ReturnType = typename ag_callable_traits<std::decay_t<F>>::return_type;
	ag_future* f = ag_async_impl_target_raw(target_worker_id, std::forward<F>(func), std::forward<Args>(args)...);
	return f;
}

#define ag_async(func, ...) ag_async_impl(func, ##__VA_ARGS__)
#define ag_async_on(target_id, func, ...) ag_async_impl_target(target_id, func, ##__VA_ARGS__)

inline ag_sync_req* ag_get_sync_req() {
	AutogenContext* ctx = get_context();
	if (!ctx || ctx->sync_req_pool_top == 0) return nullptr;
	uint32_t top = __atomic_fetch_sub(&ctx->sync_req_pool_top, 1, __ATOMIC_ACQUIRE);
	if (top == 0) { __atomic_fetch_add(&ctx->sync_req_pool_top, 1, __ATOMIC_RELEASE); return nullptr; }
	return (ag_sync_req*)(uintptr_t)ctx->sync_req_pool[top - 1];
}

inline void ag_release_sync_req(ag_sync_req* req) {
	AutogenContext* ctx = get_context(); if (!ctx) return;
	uint32_t top = __atomic_fetch_add(&ctx->sync_req_pool_top, 1, __ATOMIC_RELEASE);
	ctx->sync_req_pool[top] = (uint32_t)(uintptr_t)req;
}

template <typename F, typename... Args>
auto ag_sync_impl(uint32_t target_worker_id, F&& func, Args&&... args) {
	using DecayF = std::decay_t<F>;
	using ReturnType = typename ag_callable_traits<DecayF>::return_type;
	using ArgsTuple = std::tuple<std::decay_t<Args>...>;
	DecayF* func_ptr = (DecayF*)malloc(sizeof(DecayF));
	new (func_ptr) DecayF(std::forward<F>(func));
	uint32_t args_ptr = (uint32_t)(uintptr_t)malloc(sizeof(ArgsTuple));
	new ((void*)(uintptr_t)args_ptr) ArgsTuple(std::forward<Args>(args)...);
	uintptr_t dispatcher_ptr = (uintptr_t)&ag_callable_trampoline<DecayF, ArgsTuple>;
	AutogenContext* ctx = get_context();
	if (!ctx || ctx->sync_req_pool_top == 0) {
		msgerr << "ag_sync: No sync requests available!";
		free((void*)(uintptr_t)args_ptr); free((void*)(uintptr_t)func_ptr);
		if constexpr (std::is_void_v<ReturnType>) return; else return ReturnType{};
	}
	uint32_t top = __atomic_fetch_sub(&ctx->sync_req_pool_top, 1, __ATOMIC_ACQUIRE);
	if (top == 0) {
		__atomic_fetch_add(&ctx->sync_req_pool_top, 1, __ATOMIC_RELEASE);
		free((void*)(uintptr_t)args_ptr); free((void*)(uintptr_t)func_ptr);
		if constexpr (std::is_void_v<ReturnType>) return; else return ReturnType{};
	}
	ag_sync_req* req = (ag_sync_req*)(uintptr_t)ctx->sync_req_pool[top - 1];
	req->status = 0; req->dispatcher_ptr = (uint32_t)dispatcher_ptr; req->this_ptr = (uint32_t)(uintptr_t)func_ptr;
	req->args_ptr = args_ptr; req->result = 0; req->error_code = 0;
	js_sync_call(target_worker_id, (uint32_t)dispatcher_ptr, (uint32_t)(uintptr_t)func_ptr, args_ptr, (uint32_t)(uintptr_t)req);
	int32_t expected = 0;
	while (__atomic_load_n(&req->status, __ATOMIC_ACQUIRE) == 0) {
		int32_t result = __builtin_wasm_memory_atomic_wait32((int32_t*)&req->status, expected, -1);
		if (result == 1) {
			msgerr << "ag_sync: Timeout waiting for sync response.";
			req->error_code = 0xDEADBEEF;
			__atomic_store_n(&req->status, 2, __ATOMIC_RELEASE);
			break;
		}
	}
	uint32_t error = req->error_code; uint32_t result_val = req->result;
	ag_release_sync_req(req);
	if (error != 0) {
		free((void*)(uintptr_t)func_ptr); free((void*)(uintptr_t)args_ptr);
		if constexpr (std::is_void_v<ReturnType>) return; else return ReturnType{};
	}
	if constexpr (std::is_void_v<ReturnType>) {
		return;
	} else {
		ReturnType* ptr = reinterpret_cast<ReturnType*>((uintptr_t)result_val);
		ReturnType val = std::move(*ptr); ptr->~ReturnType(); free(ptr); return val;
	}
}

#define ag_sync(target_id, func, ...) ag_sync_impl(target_id, func, ##__VA_ARGS__)

inline uint32_t ag_sync_call(uint32_t target_worker_id, uint32_t dispatcher_ptr, uint32_t this_ptr, uint32_t args_ptr, int64_t timeout_ns = -1) {
	ag_sync_req* req = ag_get_sync_req();
	if (!req) {
		msgerr << "ag_sync_call: No sync requests available!";
		if (args_ptr) free((void*)(uintptr_t)args_ptr);
		return 0;
	}
	req->status = 0; req->dispatcher_ptr = dispatcher_ptr; req->this_ptr = this_ptr; req->args_ptr = args_ptr; req->result = 0; req->error_code = 0;
	js_sync_call(target_worker_id, dispatcher_ptr, this_ptr, args_ptr, (uint32_t)(uintptr_t)req);
	int32_t expected = 0;
	while (__atomic_load_n(&req->status, __ATOMIC_ACQUIRE) == 0) {
		int32_t result = __builtin_wasm_memory_atomic_wait32((int32_t*)&req->status, expected, timeout_ns);
		if (result == 1) {
			msgerr << "ag_sync_call: Timeout waiting for sync response.";
			req->error_code = 0xDEADBEEF;
			__atomic_store_n(&req->status, 2, __ATOMIC_RELEASE);
			break;
		}
	}
	uint32_t result_val = req->result;
	uint32_t error = req->error_code;
	ag_release_sync_req(req);
	if (error != 0) {
		msgerr << "ag_sync_call: Remote execution failed or timed out";
		return 0;
	}
	return result_val;
}

extern "C" __attribute__((export_name("agresume_future")))
void agresume_future(uint32_t future_ptr) {
	ag_future* f = (ag_future*)(uintptr_t)future_ptr;
	if (f && f->coro_handle) {
		auto handle = std::coroutine_handle<>::from_address(f->coro_handle);
		if (handle) { handle.resume(); }
	}
}

extern "C" __attribute__((export_name("ag_get_globals_count")))
uint32_t ag_get_globals_count() {
	uint32_t count = 0;
	for (ag_global_name_node* n = _get_global_names_head(); n; n = n->next) count++;
	return count;
}

extern "C" __attribute__((export_name("ag_get_global_name")))
const char* ag_get_global_name(uint32_t index) {
	uint32_t count = 0;
	for (ag_global_name_node* n = _get_global_names_head(); n; n = n->next) {
		if (count == index) return n->name;
		count++;
	}
	return nullptr;
}

extern "C" __attribute__((export_name("init_shared_globals"))) void init_shared_globals() {
	ag_undedicated_round_robin();
	AutogenContext* ctx = get_context();
	if (ctx && __atomic_load_n(&ctx->sync_req_pool_top, __ATOMIC_ACQUIRE) == 0) {
		for (int i = 0; i < 64; i++) {
			uint32_t ptr = (uint32_t)(uintptr_t)malloc(sizeof(ag_sync_req));
			if (ptr) ctx->sync_req_pool[i] = ptr;
		}
		__atomic_store_n(&ctx->sync_req_pool_top, 64, __ATOMIC_RELEASE);
	}
}

extern "C" __attribute__((used, export_name("autogen_dispatch")))
uint32_t autogen_dispatch(uint32_t dispatcher_ptr, uint32_t hash_id, uint32_t this_ptr, uint32_t args_ptr) {
	if (dispatcher_ptr != 0) {
		return ((uint32_t(*)(uint32_t, uint32_t))(uintptr_t)dispatcher_ptr)(this_ptr, args_ptr);
	}
	return 0xBADF00D;
}

// ==========================================
// COROUTINE YIELD SUPPORT (UNCONDITIONAL)
// ==========================================
struct ag_yield_awaitable {
	bool await_ready() const noexcept { return false; }
	void await_suspend(std::coroutine_handle<> handle) {
		uint32_t ptr = (uint32_t)(uintptr_t)handle.address();
		js_yield_coroutine(ptr);
	}
	void await_resume() const noexcept {}
};

inline ag_yield_awaitable _ag_yield_impl() { return {}; }
#define ag_yield() co_await _ag_yield_impl()

extern "C" __attribute__((export_name("ag_resume_coroutine")))
void ag_resume_coroutine(uint32_t coro_handle_ptr) {
	auto handle = std::coroutine_handle<>::from_address((void*)(uintptr_t)coro_handle_ptr);
	if (handle) { handle.resume(); }
}

struct ag_task_promise {
	ag_future* future;
	ag_task_promise() { future = ag_create_future(); }
	~ag_task_promise() {}
	ag_future* get_return_object() { return future; }
	std::suspend_never initial_suspend() { return {}; }
	std::suspend_always final_suspend() noexcept {
		if (future) {
			if (__atomic_load_n(&future->status, __ATOMIC_ACQUIRE) == 0) {
				ag_resolve_future(future, 0);
			}
		}
		return {};
	}
	template <typename T>
	void return_value(T value) {
		if (future) {
			using ValueType = std::decay_t<T>;
			ValueType* ptr = (ValueType*)malloc(sizeof(ValueType));
			new (ptr) ValueType(std::move(value));
			ag_resolve_future(future, (uint32_t)(uintptr_t)ptr);
		}
	}
	void unhandled_exception() {
		if (future) { ag_reject_future(future, AG_ERR_UNKNOWN); }
	}
};

namespace std {
	template<typename... Args>
	struct coroutine_traits<ag_future*, Args...> {
		using promise_type = ag_task_promise;
	};
}

// ==========================================
// NON-BLOCKING AWAIT FACILITATION
// ==========================================
inline ag_future* _ag_poll_and_resume(ag_future* f, std::coroutine_handle<> h) {
	while (__atomic_load_n(&f->status, __ATOMIC_ACQUIRE) == 0) {
		co_await _ag_yield_impl();
	}
	h.resume();
	co_return nullptr;
}

template <typename T>
struct ag_awaitable_nonblocking {
	ag_future* f;
	int64_t timeout_ns;

	bool await_ready() {
		return __atomic_load_n(&f->status, __ATOMIC_ACQUIRE) != 0;
	}

	void await_suspend(std::coroutine_handle<> h) {
		_ag_poll_and_resume(f, h);
	}

	T await_resume() {
		if (f->status == 2) {
			uint32_t err = f->error_code;
			free(f);
			if constexpr (std::is_void_v<T>) return;
			else return T{};
		}

		if constexpr (std::is_void_v<T>) {
			free(f);
			return;
		} else {
			T* ptr = reinterpret_cast<T*>((uintptr_t)f->result_ptr);
			T val = std::move(*ptr);
			ptr->~T();
			free((void*)(uintptr_t)f->result_ptr);
			free(f);
			return val;
		}
	}
};

template <typename T>
inline ag_awaitable_nonblocking<T> _ag_await_impl(ag_future* f, int64_t timeout_ns = -1) {
	return ag_awaitable_nonblocking<T>{f, timeout_ns};
}

#define ag_await(T, f) co_await _ag_await_impl<T>(f)

// ==========================================
// AG_AWAIT_ALL FACILITATION (HETEROGENEOUS)
// ==========================================
inline ag_future* _ag_poll_all_and_resume(const std::vector<ag_future*>& futures, std::coroutine_handle<> h) {
	bool all_done = false;
	while (!all_done) {
		all_done = true;
		for (auto f : futures) {
			if (__atomic_load_n(&f->status, __ATOMIC_ACQUIRE) == 0) {
				all_done = false;
				break;
			}
		}
		if (!all_done) {
			co_await _ag_yield_impl();
		}
	}
	h.resume();
	co_return nullptr;
}

struct ag_await_all_result {
	std::vector<ag_future*> futures;

	ag_await_all_result(std::vector<ag_future*> f) : futures(std::move(f)) {}

	~ag_await_all_result() {
		for (auto& f : futures) {
			if (f) {
				// Note: If the user didn't extract the result, result_ptr will leak
				// because we don't know its type. We only free the future struct.
				free(f);
				f = nullptr;
			}
		}
	}

	ag_await_all_result(const ag_await_all_result&) = delete;
	ag_await_all_result& operator=(const ag_await_all_result&) = delete;

	ag_await_all_result(ag_await_all_result&& other) noexcept : futures(std::move(other.futures)) {
		other.futures.clear();
	}

	template <typename T>
	T get(uint32_t index) {
		if (index >= futures.size()) return T{};
		ag_future* f = futures[index];
		if (!f) return T{};

		if (f->status == 2) {
			free(f);
			futures[index] = nullptr;
			if constexpr (std::is_void_v<T>) return;
			else return T{};
		}

		if constexpr (std::is_void_v<T>) {
			free(f);
			futures[index] = nullptr;
			return;
		} else {
			T* ptr = reinterpret_cast<T*>((uintptr_t)f->result_ptr);
			T val = std::move(*ptr);
			ptr->~T();
			free((void*)(uintptr_t)f->result_ptr);
			free(f);
			futures[index] = nullptr;
			return val;
		}
	}
};

struct ag_await_all_awaitable {
	std::vector<ag_future*> futures;

	bool await_ready() {
		for (auto f : futures) {
			if (__atomic_load_n(&f->status, __ATOMIC_ACQUIRE) == 0) return false;
		}
		return true;
	}

	void await_suspend(std::coroutine_handle<> h) {
		_ag_poll_all_and_resume(futures, h);
	}

	ag_await_all_result await_resume() {
		return ag_await_all_result{std::move(futures)};
	}
};

inline ag_await_all_awaitable _ag_await_all_impl(std::vector<ag_future*> futures) {
	return ag_await_all_awaitable{std::move(futures)};
}

#define ag_await_all(futures_vec) co_await _ag_await_all_impl(futures_vec)

// ==========================================
// EXTENSIBILITY AND EXTERNAL CALLS
// ==========================================
enum class ag_ext : uint32_t { main = 0, worker = 1 };

inline uint32_t ag_json_u64_to_str(uint64_t v, char* buf) {
	int i = 0;
	if (v == 0) { buf[i++] = '0'; buf[i] = 0; return i; }
	char digits[20]; int d = 0;
	while (v > 0) { digits[d++] = '0' + (v % 10); v /= 10; }
	for (int j = d - 1; j >= 0; j--) buf[i++] = digits[j];
	buf[i] = 0;
	return i;
}

inline void ag_json_append_escaped(char*& buf, uint32_t& pos, uint32_t cap, const char* s) {
	while (*s) {
		char c = *s++;
		if (pos + 2 >= cap) break;
		if (c == '"' || c == '\\') { buf[pos++] = '\\'; buf[pos++] = c; }
		else if (c == '\n') { buf[pos++] = '\\'; buf[pos++] = 'n'; }
		else if (c == '\r') { buf[pos++] = '\\'; buf[pos++] = 'r'; }
		else if (c == '\t') { buf[pos++] = '\\'; buf[pos++] = 't'; }
		else { buf[pos++] = c; }
	}
}

template<typename T>
inline void ag_json_serialize_value(char*& buf, uint32_t& pos, uint32_t cap, const T& val) {
	using DT = std::decay_t<T>;
	if constexpr (std::is_same_v<DT, bool>) {
		const char* s = val ? "true" : "false";
		while (*s && pos < cap) buf[pos++] = *s++;
	} else if constexpr (std::is_integral_v<DT>) {
		char tmp[32]; ag_json_u64_to_str((uint64_t)(int64_t)val, tmp);
		for (int i = 0; tmp[i] && pos < cap; i++) buf[pos++] = tmp[i];
	} else if constexpr (std::is_floating_point_v<DT>) {
		char tmp[64]; int n = snprintf(tmp, sizeof(tmp), "%.17g", (double)val);
		if (n > 0) for (int i = 0; i < n && pos < cap; i++) buf[pos++] = tmp[i];
	} else if constexpr (std::is_same_v<DT, const char*> || std::is_same_v<DT, char*>) {
		if (pos < cap) buf[pos++] = '"';
		ag_json_append_escaped(buf, pos, cap, val);
		if (pos < cap) buf[pos++] = '"';
	} else if constexpr (std::is_pointer_v<DT>) {
		char tmp[32]; ag_json_u64_to_str((uint64_t)(uintptr_t)val, tmp);
		for (int i = 0; tmp[i] && pos < cap; i++) buf[pos++] = tmp[i];
	} else {
		char tmp[32]; ag_json_u64_to_str((uint64_t)(uintptr_t)val, tmp);
		for (int i = 0; tmp[i] && pos < cap; i++) buf[pos++] = tmp[i];
	}
}

template<typename Tuple, size_t... Is>
inline uint32_t ag_json_pack_tuple_impl(const Tuple& t, std::index_sequence<Is...>) {
	uint32_t cap = 8192;
	char* buf = (char*)malloc(cap);
	if (!buf) return 0;
	uint32_t pos = 0;
	buf[pos++] = '[';
	bool first = true;
	auto process = [&](const auto& val) {
		if (!first && pos < cap) buf[pos++] = ',';
		first = false;
		ag_json_serialize_value(buf, pos, cap, val);
	};
	(process(std::get<Is>(t)), ...);
	if (pos < cap) buf[pos++] = ']';
	if (pos < cap) buf[pos] = 0; else buf[cap - 1] = 0;
	return (uint32_t)(uintptr_t)buf;
}

template<typename... Args>
inline uint32_t ag_ext_pack_args(Args&&... args) {
	using Tuple = std::tuple<std::decay_t<Args>...>;
	Tuple t(std::forward<Args>(args)...);
	return ag_json_pack_tuple_impl(t, std::index_sequence_for<Args...>{});
}

template<typename Ret, typename... Args>
inline ag_future* ag_ext_call_async(ag_ext ctx, const char* name, Args&&... args) {
	uint32_t args_ptr = ag_ext_pack_args(std::forward<Args>(args)...);
	ag_future* f = ag_create_future();
	js_ext_call_async((uint32_t)ctx, name, args_ptr, (uint32_t)(uintptr_t)f);
	return f;
}

template<typename Ret, typename... Args>
inline Ret ag_ext_call_sync(ag_ext ctx, const char* name, Args&&... args) {
	uint32_t args_ptr = ag_ext_pack_args(std::forward<Args>(args)...);
	ag_sync_req* req = ag_get_sync_req();
	if (!req) {
		if (args_ptr) free((void*)(uintptr_t)args_ptr);
		if constexpr (!std::is_void_v<Ret>) return Ret{}; else return;
	}
	req->status = 0; req->dispatcher_ptr = 0; req->this_ptr = 0;
	req->args_ptr = args_ptr; req->result = 0; req->error_code = 0;
	js_ext_call_sync((uint32_t)ctx, name, args_ptr, (uint32_t)(uintptr_t)req);
	int32_t expected = 0;
	while (__atomic_load_n(&req->status, __ATOMIC_ACQUIRE) == 0) {
		__builtin_wasm_memory_atomic_wait32((int32_t*)&req->status, expected, -1);
	}
	uint32_t error = req->error_code;
	uint32_t result_val = req->result;
	ag_release_sync_req(req);
	if (error != 0) {
		if (args_ptr) free((void*)(uintptr_t)args_ptr);
		if constexpr (!std::is_void_v<Ret>) return Ret{}; else return;
	}
	if constexpr (std::is_void_v<Ret>) {
		if (result_val) free((void*)(uintptr_t)result_val);
		return;
	} else {
		Ret* ptr = reinterpret_cast<Ret*>((uintptr_t)result_val);
		Ret val = std::move(*ptr);
		ptr->~Ret();
		free(ptr);
		return val;
	}
}

template<typename... Args>
inline void ag_ext_call_fire_and_forget(ag_ext ctx, const char* name, Args&&... args) {
	uint32_t args_ptr = ag_ext_pack_args(std::forward<Args>(args)...);
	js_ext_call_fire_and_forget((uint32_t)ctx, name, args_ptr);
}

#define ag_ext_async(ret_type, ctx, name, ...) ag_ext_call_async<ret_type>(ctx, name, ##__VA_ARGS__)
#define ag_ext_sync(ret_type, ctx, name, ...) ag_ext_call_sync<ret_type>(ctx, name, ##__VA_ARGS__)
#define ag_ext_fire(ctx, name, ...) ag_ext_call_fire_and_forget(ctx, name, ##__VA_ARGS__)

#endif // AUTOGEN_HPP