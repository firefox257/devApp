//test1.cpp

#include <iostream>
#include <string>
#include <cstdlib>
#include <cstring> // Required for std::strlen
#include <cstddef> // Required for size_t
#include <cstdint>



using namespace std;

class ServiceHandler
{
	
	
};



 enum class ServiceType
 {
 	textures,
 	meshes,
 	
 	
 	__size
 };

void (*ServiceCalls[(int)ServiceType::__size])(void*)={};




int main()
{
	
	cout << "sercice type: "<< (int)ServiceType::__size << "\r\n";

	return 0;
}

