//try1.cpp
#include <wasisys/WasiBindings.cpp>

using namespace std;

extern "C" __attribute__((import_module("myfuncs"), import_name("jsalert")))
void jsalert(const char* str);

class tryMsg1 {
	public:
	bool used = true;
	char* _msg;

	tryMsg1() {
		_msg = new char[255];
		_msg[0] = '\0';
	}

	~tryMsg1() {
		delete[] _msg;
	}

	// FIXED: Added bounds checking to prevent buffer overflow
	tryMsg1& msg(const char* m) {
		int i = 0;
		while (m[i] != '\0' && i < 254) {
			_msg[i] = m[i];
			i++;
		}
		_msg[i] = '\0';
		return *this;
	}

	char* msg() {
		return _msg;
	}
};


class tryMsg2 {
	public:
	bool used = true;
	int atit=0;
	char * _msg; // Inline data: SAFE for cross-boundary memory copying

	tryMsg2() {
		_msg = new char[100];
		_msg[0] = '\0';
	}

	// FIXED: Added bounds checking to prevent buffer overflow
	void msg(const char* m) {
		int i = 0;
		while (m[i] != '\0' && i < 254) {
			_msg[i] = m[i];
			i++;
		}
		_msg[i] = '\0';
	}

	char* msg() {
		return _msg;
	}
};


void tryMsg1Handler(void* d) {
	tryMsg1* at = (tryMsg1*)d;
	cout << "tryMsg1 ptr: " << (uint64_t)(void*)at->_msg << "\r\n";
	cout << "tryMsg1: "  << at->msg() << " used: " << at->used << "\r\n";
	delete at;
}

void tryMsg2Handler(void* d) {
	tryMsg2* at = (tryMsg2*)d;
	cout << "tryMsg2: atit:" << at->atit<< "  "<< at->msg() << " used: " << at->used << "\r\n";
	delete at;
}

enum class tryMsgType {
	tryMsg1_t = 0,
	tryMsg2_t = 1,
	endSize = 2
};

void (*Handlers[])(void*) = {tryMsg1Handler, tryMsg2Handler};

void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) {
	if (secId >= 0 && secId < (int)(sizeof(Handlers) / sizeof(Handlers[0]))) {
		Handlers[secId](destPtr);
	}
}

// 🚀 Called by JS to trigger a P2P send
extern "C" __attribute__((export_name("testSend")))
void testSend(int targetId, int targetSectionId, const char* msg) {
	
	
	jsalert("sending example");
	cout << "workerProcessId:" << workerProcessId<<"\r\n";

	// CORRECT USAGE: tryMsg2 uses inline data, so sizeof(*m2) copies the entire string safely.

	for(int i= 0; i< 100;i++)
	{

		tryMsg2* m2 = new tryMsg2();
		m2->msg("hi and more at@ 1234\r\n");
		m2->atit=i;
		cout << "Sending tryMsg2, size: " << (uint64_t)sizeof(*m2) << "\r\n";

		jsSendToPeer(targetId, (int)tryMsgType::tryMsg2_t, m2);
	}

}


#define myfunc

extern "C" __attribute__((export_name("1234566")))
void tryfunc()
{
	int i = 123;
}
