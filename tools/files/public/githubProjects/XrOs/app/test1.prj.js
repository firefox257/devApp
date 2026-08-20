{
	"main": "test1.cpp",
	"output": "test1.wasm",
	"args": [
		'clang++',
		'-std=c++20',
		'-O2',
		'-I', '@/public/githubProjects/XrOs/app/CppApp',
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
		'-D','WASM',
		//'-Wl,--export-all'
	]
}