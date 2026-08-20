
//workon.cpp
#include <iostream>
#include <string>
#include <atomic>


class pWorker
{
	protected:
	std::atomic<uint32_t> __refCount{1};
	void __addRef()
	{
		__refCount.fetch_add(1, std::memory_order_relaxed);
	}

	void __aubRef()
	{
		if (__refCount.fetch_sub(1, std::memory_order_acq_rel) == 1)
		{
			delete this;
		}
	}
	public:
	pWorker(){}
	virtual ~pWorker(){}
	virtual void run(){}
	void start();
};
extern "C" __attribute__((export_name("callWorker")))
void callWorker(pWorker * ptr)
{
	ptr->run();
}




// Declare the external JS function.
// It will be imported from the "env" module.
extern "C" {
	//keep
	__attribute__((import_module("env"), import_name("jsSendToWorker")))
	void jsSendToWorker(int wpId, pWorker * ptr);

	__attribute__((import_module("env"), import_name("jsCout")))
	void jsCout(const char* str);
	
	__attribute__((import_module("sys"), import_name("jstry")))
	void jstry(int i);


}








// do not need to put on worker calls
extern "C" __attribute__((export_name("malloc")))
void* wasm_malloc(size_t size) {
	return std::malloc(size);
}

extern "C" __attribute__((export_name("free")))
void wasm_free(void* ptr) {
	std::free(ptr);
}

extern "C" __attribute__((export_name("realloc")))
void * wasm_realloc(void* ptr, std::size_t size) {
	return std::realloc(ptr, size);
}

namespace wasm {
	class logImplement
	{
		public:
		logImplement()
		{
		}

		logImplement & operator << (bool v)
		{
			if(v) jsCout("true");
			else jsCout("false");

			return *this;
		}
		logImplement & operator << (int v)
		{
			std::string str = std::to_string(v);
			jsCout(str.c_str());

			return *this;
		}
		logImplement & operator << (long v)
		{
			std::string str = std::to_string(v);
			jsCout(str.c_str());

			return *this;
		}
		logImplement & operator << (float v)
		{
			std::string str = std::to_string(v);
			jsCout(str.c_str());

			return *this;
		}
		logImplement & operator << (double v)
		{
			std::string str = std::to_string(v);
			jsCout(str.c_str());

			return *this;
		}
		logImplement & operator << (char v)
		{
			std::string str = std::to_string(v);
			jsCout(str.c_str());

			return *this;
		}
		logImplement & operator << (const char*  v)
		{
			jsCout(v);

			return *this;
		}
		logImplement & operator << (char*  v)
		{
			jsCout(v);

			return *this;
		}
		logImplement & operator << (std::string & v)
		{
			jsCout(v.c_str());

			return *this;
		}


	};

}
wasm::logImplement info;

void pWorker::start()
{
	//info <<"at pWorker start\r\n";
	jsSendToWorker(-1,this);
}


extern "C" __attribute__((export_name("greet")))
const char* greet(const char* name) {
	// C++ receives a pointer to a null-terminated string
	info << "C++ received name: " << name << "\n";

	// Return a static string pointer back to JS
	// (In a real app, you might malloc() a new string here)
	return "Hello from C++!";
}


//callable for worker threads



class try1:public pWorker
{
	public:
	try1()
	{

	}
	~try1()
	{
		info << "at try1 destructor\r\n";
	}
	void run()
	{
		info << "at try1 run\r\n";
	}
};

class try2:public pWorker
{
	public:
	try2()
	{

	}
	~try2()
	{
		info << "at try2 destructor\r\n";
	}
	void run()
	{
		info << "at try2 run\r\n";
	}
};

int main()
{
	jstry(123);
	pWorker * p1 = new try1();
	pWorker * p2 = new try2();

	p2->start();
	p1->start();
	delete(p1);
	delete(p2);




	return 0;
}