#include <iostream>
#include <string>
#include "slp.cpp"

using namespace std;

int main() {

	SLP slp;

	slp.define(R"(
		#token var hi=(x, y)->
		{
			return "${x}:${y}";
		};
		
    )");
	cout << slp.get("hi")<<"\r\n";

	return 0;
}