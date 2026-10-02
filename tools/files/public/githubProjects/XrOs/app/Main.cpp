//Main.cpp
#include <wasisys/WasiBindings.cpp>
#define endl "\r\n"
using namespace std;

//extern "C" __attribute__((import_module("myfuncs"), import_name("jsalert")))
//void jsalert(const char* str);






enum class tryMsgType {
	tryMsg1_t,
	tryMsg2_t,
	endSize
};

void (*Handlers[])(void*) = {};

void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) {
	if (secId >= 0 && secId < (int)(sizeof(Handlers) / sizeof(Handlers[0]))) {
		Handlers[secId](destPtr);
	}
}


extern "C" __attribute__((export_name("initMain")))
int initMain()
{
	cout << "at cpp initMain" << endl;
	
	
	return 0;
}




/*
// 🚀 Called by JS to trigger a P2P send
extern "C" __attribute__((export_name("testSend")))
void testSend(int targetId, int targetSectionId, const char* msg) {
	jsalert("sending example");

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
//*/
