//XrGui.cpp
#include <wasisys/WasiBindings.cpp>

using namespace std;


extern "C" __attribute__((import_module("jsSystem"), import_name("jsGetFile")))
void* jsGetFile(const char* str);




extern "C" __attribute__((import_module("myfuncs"), import_name("jsalert")))
void jsalert(const char* str);


class Rgb 
{
	public:
	uint8_t r;
	uint8_t g;
	uint8_t b;
}__attribute__((packed));

class Rgba
{
	public:
	uint8_t r;
	uint8_t g;
	uint8_t b;
	uint8_t a;
}__attribute__((packed));

class Vec3d
{
	public:
	
	double x;
	double y;
	double z;
}__attribute__((packed));
	

class XrImage
{
	public:
	uint64_t id=0;
	uint32_t pixelw=0;
	uint32_t pixelh=0;
	
	double w;
	double h; 
	
	Vec3d v[4];
	Vec3d n[4];
	Rgba * image=0;
	XrImage()
	{
		
	}
	~XrImage()
	{
		if(image !=0)
		{
			delete(image);
			image=0;
		}
	}
	
	
}__attribute__((packed));




enum class XrMessageType {
	loadImage,
	endSize
};

void (*Handlers[])(void*) = {};

void onJsPeerMessage(int srcId, int secId, void* destPtr, size_t size) {
	if (secId >= 0 && secId < (int)(sizeof(Handlers) / sizeof(Handlers[0]))) {
		Handlers[secId](destPtr);
	}
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
