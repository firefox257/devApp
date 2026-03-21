




/*

for the pointers need to add indexing
so int4 @ a=0;
a[0] = 123;
a[1] = 124;

return a[1];


this will be the same for all the pointer types.
int1, int2, int8, uint1, uint2, uint4, uint8, float4, float8, bool, char.



*/



/*

For the tops compiler we eneed to add sizeof function to get the size of data types in bytes.


*/




/*
right now pointers is not fully implemented.

the tokenizer will seperate out int4 @a as ['int4', '@', 'a']
there is code that thinks itnis together ['int4', '@a'] which thisnis wrong


the pointers neednto work like this
int4 @a;
int4 @a=4885;// which this assigna the pointer address

a= 123;// thisnactually will dereference the pointer and assign 123 vaule
@a=333:// this assignes the pointer address

also this functiin returns a pointer
func try1()-> int4 @ {
	
	
}

also this function has pointer paramaters

func try(int4 @b)

this needs to happen for all types

int1 @v;
int2 @v
int8 @v;
char @s;
float4 @f;
and so  on and so on.

there needs to be  a a typel

void @v; // which thisnis the genereic pointer.



*/





