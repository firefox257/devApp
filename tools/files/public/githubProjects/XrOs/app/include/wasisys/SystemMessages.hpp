
#pragma once


#include <string>
#include <cstdlib>
#include <cstring> // Required for std::strlen
#include <cstddef> // Required for size_t
#include <cstdint>
#include <vector>




class SimpleMsgMemoryManager
{
	private:
	struct Chunk {
		char* memory;
		size_t item_size;
		size_t scan_hint; // Optimizes scanning by remembering where we left off
	};

	struct Pool {
		std::vector<Chunk> chunks;
	};

	Pool pools[(int)MsgType::endSize];

	// Power of 2 capacity allows us to use bitwise AND instead of slow modulo (%)
	static constexpr size_t CHUNK_CAPACITY = 1024;
	static constexpr size_t CAPACITY_MASK = CHUNK_CAPACITY - 1;

	public:
	~SimpleMsgMemoryManager()
	{
		for (auto& pool : pools) {
			for (auto& chunk : pool.chunks) {
				std::free(chunk.memory);
			}
		}
	}

	void* alloc(int msgType, int size)
	{
		if (msgType < 0 || msgType >= (int)MsgType::endSize) return nullptr;

		// Align size to 8 bytes for optimal memory access and atomic alignment
		size_t aligned_size = (size + 7) & ~7;

		Pool& pool = pools[msgType];

		// 1. Scan existing chunks for a free slot
		for (auto& chunk : pool.chunks) {
			for (size_t i = 0; i < CHUNK_CAPACITY; ++i) {
				// Fast bitwise modulo for wrap-around
				size_t idx = (chunk.scan_hint + i) & CAPACITY_MASK;
				char* ptr = chunk.memory + (idx * chunk.item_size);

				// Hardware prefetch: load next items into CPU cache to hide memory latency
				if (i + 4 < CHUNK_CAPACITY) {
					size_t next_idx = (idx + 4) & CAPACITY_MASK;
					__builtin_prefetch(chunk.memory + (next_idx * chunk.item_size), 0, 1);
				}

				SimpleMsgBase* msg = reinterpret_cast<SimpleMsgBase*>(ptr);

				// Fast atomic read
				if (!msg->used) {
					msg->used = true;
					chunk.scan_hint = (idx + 1) & CAPACITY_MASK;
					return msg;
				}
			}
		}

		// 2. No free slots found. Allocate a new chunk.
		Chunk new_chunk;
		new_chunk.item_size = aligned_size;
		new_chunk.scan_hint = 0;

		size_t chunk_bytes = aligned_size * CHUNK_CAPACITY;
		new_chunk.memory = static_cast<char*>(std::malloc(chunk_bytes));
		if (!new_chunk.memory) return nullptr;

		// Initialize the first item as used
		SimpleMsgBase* first_msg = reinterpret_cast<SimpleMsgBase*>(new_chunk.memory);
		first_msg->used = true;

		// Initialize the rest as unused
		char* ptr = new_chunk.memory + aligned_size;
		for (size_t i = 1; i < CHUNK_CAPACITY; ++i) {
			SimpleMsgBase* msg = reinterpret_cast<SimpleMsgBase*>(ptr);
			msg->used=false;
			ptr += aligned_size;
		}

		pool.chunks.push_back(new_chunk);

		// Set hint to 1 since index 0 is already used
		pool.chunks.back().scan_hint = 1;

		return first_msg;
	}
};

SimpleMsgMemoryManager simpleMsgMemoryManager;


///required for messaging
extern "C"
__attribute__((export_name("__cppAllocateMsg")))
void* __cppAllocateMsg(int targetSectionId, size_t size) 
{
	return simpleMsgMemoryManager.alloc(targetSectionId, size);
}


// 🚀 Called by JS when a P2P message arrives and memory is copied
extern "C" __attribute__((export_name("onJsPeerMessage")))
void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) 
{
	Handlers[secId](destPtr);
}

#ifdef WASM




#endif

