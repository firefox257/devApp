
#include <iostream>

using namespace std;

#define endl "\r\n"


class PodoString
{
	
	
}__attribute__((packed));



class try1
{
	public:
	
	private:
	struct func_args
	{
		int x=0;
		bool y=false;
	}__attribute__((packed));
	
	public:
	void func(func_args args)
	{
		cout << "x: "<<args.x
		<< " y: " << args.y <<endl;
		
	}
	
};

int main()
{
	try1 t1;
	t1.func({.y=true});
	//cout << "size: " << sizeof(try1::func_args);
	
	return 0;
}
