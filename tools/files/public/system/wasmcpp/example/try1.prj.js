
{
	"main": "try1.cpp",
	"output": "try1.wasm",
	"args": [
		'clang++',
		'-std=c++17',
		'-O2',
		'-I', '@/public/system/wasmcpp/example/include',
		'-pthread',
		'-fno-exceptions',
		'-fno-rtti',
		'-matomics',
		'-mbulk-memory',
		//'-nostdlib',

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