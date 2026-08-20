

//try1.cpp

#include <iostream>
#include <string>
#include <cstdlib>
#include <cstring> // Required for std::strlen
#include <cstddef> // Required for size_t
#include <cstdint>

using namespace std;



// Declare the external JS functions (Synchronous imports)
extern "C"
__attribute__((import_module("env"), import_name("jsCout")))
void jsCout(const char* str);

extern "C"
// 🚀 JS bridge for sending data to peers
__attribute__((import_module("sys"), import_name("jsSendToPeer")))
void jsSendToPeer(int targetId, int targetSectionId, const void* srcPtr, size_t size);


// Standard memory management exports
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

class Factory
{
	private:
	static int _atid;
	
	public:
	
	
};






// Custom synchronous logger
namespace std {
	class logImplement {
		public:
		logImplement() {}

		logImplement & operator << (bool v) {
			jsCout(v ? "true" : "false");
			return *this;
		}
		logImplement & operator << (int8_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (int16_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (int32_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (int64_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (uint8_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (uint16_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (uint32_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (uint64_t v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		
		logImplement & operator << (float v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (double v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (char v) {
			jsCout(std::to_string(v).c_str());
			return *this;
		}
		logImplement & operator << (const char* v) {
			jsCout(v ? v : "null");
			return *this;
		}
		logImplement & operator << (char* v) {
			jsCout(v ? v : "null");
			return *this;
		}
		logImplement & operator << (const std::string & v) {
			jsCout(v.c_str());
			return *this;
		}
	};
	
	logImplement info;
	
}
#ifdef WASM
#define cout info
#endif
//*/





class MsgBase 
{
	public:
	MsgBase()
	{
		
	}
	virtual void func()
	{
		cout << "MsgBase\r\n";
	}
	virtual int size() {
		return sizeof(MsgBase);
	}
	
	
};


class try1Msg : public MsgBase
{
	public:
	try1Msg()
	{
		
	}
	int size() {
		return sizeof(try1Msg);
	}
	virtual void func()
	{
		cout << "try1Msg\r\n";
	}
};

class try2Msg : public MsgBase
{
	public:
	try2Msg()
	{
		
	}
	int size() {
		return sizeof(try2Msg);
	}
	virtual void func()
	{
		cout << "****try2Msg\r\n";
		cout <<"blaqwe";
	}
};


// 🚀 Called by JS when a P2P message arrives and memory is copied
extern "C" __attribute__((export_name("onJsPeerMessage")))
void onJsPeerMessage(int srcId, int secId, const void* destPtr, size_t size) {
	
	
	MsgBase* ptr = (MsgBase*)destPtr;
	ptr->func();
	delete(ptr);
	
}




// 🚀 Called by JS to trigger a P2P send
extern "C" __attribute__((export_name("testSend")))
void testSend(int targetId, int targetSectionId, const char* msg) {
	//size_t len = std::strlen(msg) + 1; // +1 for null terminator
	//info << "📤 [P2P] Sending to peer " << targetId << ": " << msg << "\n";
	//jsSendToPeer(targetId, msg, len);
	
	MsgBase * d = new try2Msg();
	jsSendToPeer(targetId,targetSectionId, d, d->size());
	delete(d);
}








int main() {
	
	
	cout << "@@@@@Main execution finished.\r\n";
	//testSend(2, 0,  "hhh");
	
	return 0;
}