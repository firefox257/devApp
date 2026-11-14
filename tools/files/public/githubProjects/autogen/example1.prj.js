
{
	"main": "example1.cpp",
	"output": "example1.wasm",
	"args": [
		'clang++',
		'-std=c++20',
		'-O2',
		'-I', '/githubProjects/autogen/include',
		'-pthread',
		'-fno-exceptions',
		'-fno-rtti',
		'-matomics',
		'-mbulk-memory',
		
		'-Wl,--no-entry',
		'-Wl,--shared-memory',
		'-Wl,--import-memory',
		'-Wl,--max-memory=268435456',
		'-Wl,--no-check-features',
		'-Wl,--allow-undefined',

		//ADD THESE WRAPPER FLAGS:
		"-Wl,--wrap=malloc",
		"-Wl,--wrap=free",
		"-Wl,--wrap=realloc",
		"-Wl,--wrap=calloc",
		"-Wl,--wrap=aligned_alloc",     // <-- ADD THIS
		"-Wl,--wrap=posix_memalign",     // <-- ADD THIS
		//"-Wl,--wrap=cout",  

		'-D','WASM',
		//'-Wl,--export-all'
	]
}