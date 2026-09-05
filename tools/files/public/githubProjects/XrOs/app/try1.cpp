

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
__attribute__((import_module("__jssys"), import_name("jsCout")))
void jsCout(const char* str);

extern "C"
// 🚀 JS bridge for sending data to peers
__attribute__((import_module("__jssys"), import_name("jsSendToPeer")))
void jsSendToPeer(int targetId, int targetSectionId, const void* srcPtr, size_t size);











///required for messaging
extern "C" 
__attribute__((export_name("__cppAllocateMsg")))
void* __cppAllocateMsg(int targetSectionId, size_t size) {
	
	// used to effecintly allocate or reuse message memory.
	//stubbed in malloc for now  but this need to change for an more effecient allocation like reusing
	
	void * ptr= std::malloc(size);
	//set used to true
	((bool*)ptr)[0]=true;
	
	return ptr;
}




// Standard memory management exports
//__attribute__((import_module("__jssys"), import_name("jsCout")))
extern "C" 
__attribute__((export_name("malloc")))
void* wasm_malloc(size_t size) {
	return std::malloc(size);
}

extern "C"
 __attribute__((export_name("free")))
void wasm_free(void* ptr) {
	std::free(ptr);
} 

extern "C" 
__attribute__((export_name("realloc")))
void * wasm_realloc(void* ptr, std::size_t size) {
	return std::realloc(ptr, size);
}









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




class tryMsg1
{
	public:
	bool used = true;
	
	private:
	
	char _msg[255];
	
	
	public:
	tryMsg1()
	{
		
	}
	
	
	tryMsg1 & msg(char * m)
	{
		int i= 0;
		
		do
		{
			_msg[i]= m[i];
			i++;
		}
		while(m[i]!=0);
		_msg[i]=0;
		return *this;
		
	}
	void msg(const char * m)
	{
		int i= 0;
		
		do
		{
			_msg[i]= m[i];
			i++;
		}
		while(m[i]!=0);
		_msg[i]=0;
		
	}
	char * msg()
	{
		return _msg;
	}
	
}__attribute__((packed));


class tryMsg2
{
	public:
	bool used=true;
	private:
	
	char _msg[255];
	
	
	public:
	tryMsg2()
	{
		
	}
	
	
	tryMsg2 & msg(char * m)
	{
		int i= 0;
		
		do
		{
			_msg[i]= m[i];
			i++;
		}
		while(m[i]!=0);
		_msg[i]=0;
		return *this;
		
	}
	void msg(const char * m)
	{
		int i= 0;
		
		do
		{
			_msg[i]= m[i];
			i++;
		}
		while(m[i]!=0);
		_msg[i]=0;
		
	}
	char * msg()
	{
		return _msg;
	}
	
}__attribute__((packed));


void tryMsg1Handler(void *d)
{
	tryMsg1 * at = (tryMsg1*)d;
	
	cout <<"tryMsg1:" << at->msg()<<" used: " << at->used << "\r\n";
	delete(at);
}

void tryMsg2Handler(void *d)
{
	tryMsg2 * at = (tryMsg2*)d;
	
	cout <<"tryMsg2:" << at->msg()<<" used: " << at->used <<"\r\n";
	delete(at);
}




enum class tryMsgType
{
	tryMsg1_t,
	tryMsg2_t,
	endSize
};

void (*Handlers[])(void*) = {tryMsg1Handler,tryMsg2Handler};



// 🚀 Called by JS when a P2P message arrives and memory is copied
extern "C" __attribute__((export_name("onJsPeerMessage")))
void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) {
	
	
	
	Handlers[secId](destPtr);

	
}




// 🚀 Called by JS to trigger a P2P send
extern "C" __attribute__((export_name("testSend")))
void testSend(int targetId, int targetSectionId, const char* msg) {
	tryMsg1 * m1 = new tryMsg1();
	m1->msg("blaa hi there at@ 1234\r\n");
	jsSendToPeer(targetId, (int)tryMsgType::tryMsg1_t, m1, sizeof(*m1));
	
	
	tryMsg2 * m2 = new tryMsg2();
	m2->msg("hi and more at@ 1234\r\n");
	jsSendToPeer(targetId, (int)tryMsgType::tryMsg2_t, m2, sizeof(*m2));
	
	
	//delete(m1);
	//delete(m2);
	
	
	
}








int main() {
	
	
	cout << "@@@@@Main execution finished.\r\n";
	//testSend(2, 0,  "hhh");
	
	return 0;
}