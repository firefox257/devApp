{
	"main": "try2.cpp",
	"output": "try2.wasm",
	"args": [
		'clang++',
		'-std=c++17',
		'-O1',
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
		'--target=wasm32-wasi-threads',
		'-D', 'WASM',
		//'-Wl,--export-all'
	]
}