//try1.cpp
#include <wasisys/WasiBindings.cpp>
#include <string>
using namespace std;

extern "C" __attribute__((import_module("myfuncs"), import_name("jsalert")))
void jsalert(const char* str);

extern "C" __attribute__((import_module("myfuncs"), import_name("trybigint")))
void trybigint(uint64_t bignum);



void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) {
//notnused	
}


class try1
{
	public:
	string msg ="";
	int id=-1;
	try1()
	{
		
	}
	
	
	
	void sendFunc(int)
	{
		
	}
	
	
}__attribute__((packed));





extern "C" __attribute__((export_name("1066299120799672598")))
void tryfunc()
{
	cout << " start test at id: "<<*__workerProcessId<< "\n";;
	uint64_t i =1066299120799672598l;
	
	
	trybigint(i);
	
	
}



