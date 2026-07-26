#include <iostream>
#include <string>
// Declare the external JS function.
// It will be imported from the "env" module.
extern "C" {
	__attribute__((import_module("env"), import_name("jsalert")))
	int jsalert(const char* str);


	__attribute__((import_module("env"), import_name("jsWriteStr")))
	void jsWriteStr(const char* str);
	
	__attribute__((import_module("env"), import_name("jsAsync")))
	void jsAsync(void * ptr);

}


extern "C" __attribute__((export_name("malloc")))
void* wasm_malloc(size_t size) {
	return std::malloc(size);
}

extern "C" __attribute__((export_name("free")))
void wasm_free(void* ptr) {
	std::free(ptr);
}

extern "C" __attribute__((export_name("cRunAsync")))
void cRunAsync(void* ptr) {
	//jsalert("running");
	((void(*)())ptr)();
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
			if(v) jsWriteStr("true");
			else jsWriteStr("false");

			return *this;
		}
		logImplement & operator << (int v)
		{
			std::string str = std::to_string(v);
			jsWriteStr(str.c_str());

			return *this;
		}
		logImplement & operator << (long v)
		{
			std::string str = std::to_string(v);
			jsWriteStr(str.c_str());

			return *this;
		}
		logImplement & operator << (float v)
		{
			std::string str = std::to_string(v);
			jsWriteStr(str.c_str());

			return *this;
		}
		logImplement & operator << (double v)
		{
			std::string str = std::to_string(v);
			jsWriteStr(str.c_str());

			return *this;
		}
		logImplement & operator << (char v)
		{
			std::string str = std::to_string(v);
			jsWriteStr(str.c_str());

			return *this;
		}
		logImplement & operator << (const char*  v)
		{
			jsWriteStr(v);

			return *this;
		}
		logImplement & operator << (char*  v)
		{
			jsWriteStr(v);

			return *this;
		}
		logImplement & operator << (std::string & v)
		{
			jsWriteStr(v.c_str());

			return *this;
		}


	};

}
wasm::logImplement info;

extern "C" __attribute__((export_name("greet")))
const char* greet(const char* name) {
	// C++ receives a pointer to a null-terminated string
	info << "C++ received name: " << name << "\n";

	// Return a static string pointer back to JS
	// (In a real app, you might malloc() a new string here)
	return "Hello from C++!";
}
void hiAsync()
{
	//info<<"hi from async\r\n";
	
	int v= 0;
	for(long long i=0;i<1;i++)
	//for(long long i=0;i<1000000000;i++)
	{
		v=v%199477741 +9;
	}
	info <<"at:"<< v <<"\r\n";
}
int main() {
	
	
	jsAsync((void*)hiAsync);
	
	bool b1= true;
	#ifdef WASM
	info<< "hi thwrr " << b1 <<" and more \r\n bla bla";
	#endif

	info << "C++: Preparing to call JS alert...\n";

	// Call the JS function, passing a C-string (const char*)
	//int i=jsalert("Hello from WebAssembly! 🚀");

	//std::cout << "blaaa C++: Alert dismissed, continuing execution.\n"
	//<< "i:" << i;
	
	
	return 0;
}