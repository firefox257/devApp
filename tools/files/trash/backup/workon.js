#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>
#include <algorithm>


uint64_t getId() {
	static std::atomic<uint64_t> counter_;
	return counter_.fetch_add(1, std::memory_order_relaxed) + 1;
}


class TaskIdGenerator {
	public:
	// Delete copy and assignment operators to enforce Singleton
	TaskIdGenerator(const TaskIdGenerator&) = delete;
	TaskIdGenerator& operator=(const TaskIdGenerator&) = delete;

	// Get the single instance of the generator (Thread-safe in C++11+)
	static TaskIdGenerator& getInstance() {
		static TaskIdGenerator instance;
		return instance;
	}

	// Generate a new unique Task ID
	uint64_t generate() {
		// fetch_add returns the old value, so we add 1 to start IDs at 1 instead of 0.
		// memory_order_relaxed is used for maximum performance since we only
		// care about the atomicity of the counter, not its synchronization with other memory.
		return counter_.fetch_add(1, std::memory_order_relaxed) + 1;
	}

	// Optional: Reset the counter (Useful for testing)
	void reset(uint64_t start_value = 0) {
		counter_.store(start_value, std::memory_order_relaxed);
	}

	private:
	// Private constructor for Singleton
	TaskIdGenerator() : counter_(0) {}

	// 64-bit integer to prevent overflow in long-running applications
	std::atomic<uint64_t> counter_;
};

// Convenience function so you don't have to type getInstance() every time
inline uint64_t generateTaskId() {
	return TaskIdGenerator::getInstance().generate();
}