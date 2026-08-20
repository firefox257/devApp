#include <iostream>
#include <string>
#include <atomic>
#include <cstdlib>
#include <vector>
#include <queue>

// ==========================================
// JS IMPORTS (The "Kernel" API)
// ==========================================
extern "C" {
	__attribute__((import_module("env"), import_name("jsCreateWorker")))
	void jsCreateWorker(int workerId);

	__attribute__((import_module("env"), import_name("jsExecuteOnWorker")))
	void jsExecuteOnWorker(int workerId, void* taskPtr, int threadIndex, int totalThreads);

	__attribute__((import_module("env"), import_name("jsDestroyWorker")))
	void jsDestroyWorker(int workerId);

	__attribute__((import_module("env"), import_name("jsCout")))
	void jsCout(const char* str);

	__attribute__((import_module("sys"), import_name("jstry")))
	void jstry(int i);
}

// ==========================================
// TASK BASE CLASS (Must be defined BEFORE callWorker)
// ==========================================
class Task {
	public:
	virtual ~Task() {}
	virtual void run(int threadIndex = 0, int totalThreads = 1) = 0;
};

// ==========================================
// C++ EXPORTS
// ==========================================
extern "C" __attribute__((export_name("callWorker")))
void callWorker(void* taskPtr, int threadIndex, int totalThreads) {
	Task* task = static_cast<Task*>(taskPtr);
	task->run(threadIndex, totalThreads);
}

extern "C" __attribute__((export_name("ctry")))
void ctry() {
	std::cout<<"there";
}


// 🚨 FIX: This is just a FORWARD DECLARATION.
// The actual definition is at the bottom of the file.
extern "C" __attribute__((export_name("onWorkerDone")))
void onWorkerDone(int workerId);

extern "C" __attribute__((export_name("malloc")))
void* wasm_malloc(size_t size) { return std::malloc(size); }

extern "C" __attribute__((export_name("free")))
void wasm_free(void* ptr) { std::free(ptr); }

extern "C" __attribute__((export_name("realloc")))
void* wasm_realloc(void* ptr, std::size_t size) { return std::realloc(ptr, size); }


// ==========================================
// LOGGING
// ==========================================
namespace wasm {
	class logImplement {
		public:
		logImplement() {}
		logImplement & operator << (bool v) { jsCout(v ? "true" : "false"); return *this; }
		logImplement & operator << (int v) { jsCout(std::to_string(v).c_str()); return *this; }
		logImplement & operator << (long v) { jsCout(std::to_string(v).c_str()); return *this; }
		logImplement & operator << (float v) { jsCout(std::to_string(v).c_str()); return *this; }
		logImplement & operator << (double v) { jsCout(std::to_string(v).c_str()); return *this; }
		logImplement & operator << (char v) { char buf[2] = {v, '\0'}; jsCout(buf); return *this; }
		logImplement & operator << (const char* v) { jsCout(v); return *this; }
		logImplement & operator << (char* v) { jsCout(v); return *this; }
		logImplement & operator << (const std::string& v) { jsCout(v.c_str()); return *this; }
	};
}
wasm::logImplement info;

// ==========================================
// pWorker = 1 Web Worker Thread
// ==========================================
class pWorker {
	static int nextId;
	int workerId;
	bool busy;

	public:
	pWorker() : workerId(nextId++), busy(false) {
		jsCreateWorker(workerId);
	}

	~pWorker() {
		jsDestroyWorker(workerId);
	}

	void execute(Task* task, int threadIndex = 0, int totalThreads = 1) {
		busy = true;
		jsExecuteOnWorker(workerId, task, threadIndex, totalThreads);
	}

	bool isBusy() const { return busy; }
	void setFree() { busy = false; }
	int getId() const { return workerId; }
};
int pWorker::nextId = 0;

// ==========================================
// WORKER POOL BASE CLASS
// ==========================================
// ==========================================
// WORKER POOL BASE CLASS
// ==========================================
class WorkerPool {
	protected:
	std::vector<pWorker*> workers;
	std::queue<Task*> taskQueue;

	pWorker* findFreeWorker() {
		for (auto w : workers) {
			if (!w->isBusy()) return w;
		}
		return nullptr;
	}

	void processQueue() {
		while (!taskQueue.empty()) {
			pWorker* free = findFreeWorker();
			if (!free) break;
			Task* task = taskQueue.front();
			taskQueue.pop();
			free->execute(task, 0, 1);
		}
	}

	public:
	WorkerPool(int size) {
		for (int i = 0; i < size; i++) {
			workers.push_back(new pWorker());
		}
	}

	virtual ~WorkerPool() {
		for (auto w : workers) delete w;
	}

	virtual void dispatch(Task* task, int requestedThreads = 1) = 0;

	// 🚨 ADD 'virtual' HERE:
	virtual void onWorkerDone(int workerId) {
		for (auto w : workers) {
			if (w->getId() == workerId) {
				w->setFree();
				break;
			}
		}
		processQueue();
	}

	int size() const { return workers.size(); }
};

// ==========================================
// TYPE 1: Dedicated Pool (FIFO)
// ==========================================
class DedicatedPool : public WorkerPool {
	public:
	DedicatedPool(int size = 1) : WorkerPool(size) {
		info << "[C++] Created DedicatedPool with " << size << " worker(s)\r\n";
	}

	void dispatch(Task* task, int requestedThreads = 1) override {
		taskQueue.push(task);
		processQueue();
	}
};

// ==========================================
// TYPE 2: Round-Robin Pool
// ==========================================
class RoundRobinPool : public WorkerPool {
	int nextIndex;

	public:
	RoundRobinPool(int size = 4) : WorkerPool(size), nextIndex(0) {
		info << "[C++] Created RoundRobinPool with " << size << " worker(s)\r\n";
	}

	void dispatch(Task* task, int requestedThreads = 1) override {
		taskQueue.push(task);
		processQueueRR();
	}

	void processQueueRR() {
		while (!taskQueue.empty()) {
			bool assigned = false;
			for (int i = 0; i < (int)workers.size(); i++) {
				int idx = (nextIndex + i) % workers.size();
				if (!workers[idx]->isBusy()) {
					Task* task = taskQueue.front();
					taskQueue.pop();
					workers[idx]->execute(task, 0, 1);
					nextIndex = (idx + 1) % workers.size();
					assigned = true;
					break;
				}
			}
			if (!assigned) break;
		}
	}

	void onWorkerDone(int workerId) override {
		WorkerPool::onWorkerDone(workerId);
		processQueueRR();
	}
};

// ==========================================
// TYPE 3: Parallel Pool (Fan-out)
// ==========================================
class ParallelPool : public WorkerPool {
	int activeSlices;
	Task* activeTask;

	public:
	ParallelPool(int size = 4) : WorkerPool(size), activeSlices(0), activeTask(nullptr) {
		info << "[C++] Created ParallelPool with " << size << " worker(s)\r\n";
	}

	void dispatch(Task* task, int requestedThreads = 1) override {
		int threadsToUse = requestedThreads;
		if (threadsToUse > (int)workers.size()) {
			threadsToUse = workers.size();
		}

		info << "[C++] ParallelPool fanning out to " << threadsToUse << " workers\r\n";
		activeTask = task;
		activeSlices = threadsToUse;

		for (int i = 0; i < threadsToUse; i++) {
			workers[i]->execute(task, i, threadsToUse);
		}
	}

	void onWorkerDone(int workerId) override {
		for (auto w : workers) {
			if (w->getId() == workerId) {
				w->setFree();
				break;
			}
		}
		activeSlices--;
		if (activeSlices <= 0) {
			info << "[C++] ParallelPool task fully completed\r\n";
			activeTask = nullptr;
		}
	}
};

// ==========================================
// GLOBAL POOL REGISTRY (C++ owns everything)
// ==========================================
#define POOL_AUDIO      10
#define POOL_BACKGROUND 20
#define POOL_HEAVY_RR   30
#define POOL_PHYSICS    40

std::vector<WorkerPool*> allPools;

WorkerPool* getPool(int poolId) {
	if (poolId == POOL_AUDIO && allPools.size() > 0) return allPools[0];
	if (poolId == POOL_BACKGROUND && allPools.size() > 1) return allPools[1];
	if (poolId == POOL_HEAVY_RR && allPools.size() > 2) return allPools[2];
	if (poolId == POOL_PHYSICS && allPools.size() > 3) return allPools[3];
	return nullptr;
}

// Called by JS when any worker finishes
extern "C" void onWorkerDone(int workerId) {
	for (auto pool : allPools) {
		pool->onWorkerDone(workerId);
	}
}

// ==========================================
// EXAMPLE TASKS
// ==========================================
class AudioTask : public Task {
	public:
	void run(int threadIndex, int totalThreads) override {
		info << "[AudioTask] Processing on thread " << threadIndex << "\r\n";
	}
};

class BackgroundTask : public Task {
	int taskId;
	public:
	BackgroundTask(int id) : taskId(id) {}
	void run(int threadIndex, int totalThreads) override {
		info << "[BackgroundTask " << taskId << "] Running on thread " << threadIndex << "\r\n";
	}
};

class PhysicsTask : public Task {
	int totalItems;
	public:
	PhysicsTask(int items) : totalItems(items) {}
	void run(int threadIndex, int totalThreads) override {
		int chunkSize = totalItems / totalThreads;
		int remainder = totalItems % totalThreads;
		int startIdx = threadIndex * chunkSize + (threadIndex < remainder ? threadIndex : remainder);
		int endIdx = startIdx + chunkSize + (threadIndex < remainder ? 1 : 0);
		info << "[Physics Thread " << threadIndex << "/" << totalThreads << "] ";
		info << "Items " << startIdx << " to " << endIdx - 1 << "\r\n";
	}
};

// ==========================================
// MAIN
// ==========================================
int main() {
	jstry(123);

	// C++ creates all pools
	allPools.push_back(new DedicatedPool(1));    // POOL_AUDIO
	allPools.push_back(new RoundRobinPool(3));   // POOL_BACKGROUND
	allPools.push_back(new RoundRobinPool(10));  // POOL_HEAVY_RR
	allPools.push_back(new ParallelPool(4));     // POOL_PHYSICS

	// C++ dispatches tasks
	getPool(POOL_AUDIO)->dispatch(new AudioTask());
	getPool(POOL_BACKGROUND)->dispatch(new BackgroundTask(1));
	getPool(POOL_BACKGROUND)->dispatch(new BackgroundTask(2));
	getPool(POOL_HEAVY_RR)->dispatch(new BackgroundTask(3));
	getPool(POOL_PHYSICS)->dispatch(new PhysicsTask(1000), 4);

	return 0;
}