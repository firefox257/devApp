{
	"main": "try1.cpp",
	"output": "try1.wasm",
	"args": [
		'clang++',
		'-std=c++17',
		'-O2',
		'-I', '@/public/projects/CppApp',
		'-pthread',
		'-fno-exceptions',
		'-fno-rtti',
		'-matomics',
		'-mbulk-memory',
		'-Wl,--shared-memory',
		'-Wl,--import-memory',
		'-Wl,--max-memory=268435456',
		'-Wl,--no-check-features',
		'-Wl,--allow-undefined',
		//'-Wl,--export-all'
	]
}