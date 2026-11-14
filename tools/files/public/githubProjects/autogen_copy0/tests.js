// ./tests.js
class AutogenTestSuite {
	constructor(runtime) {
		this.runtime = runtime;
		this.results = [];
		this.seenTests = new Set();
		this.runtime.onTestResult = (result) => {
			this._log(result);
		};
	}

	_log(result) {
		if (this.seenTests.has(result.testName)) {
			console.warn(`[WARN] Duplicate test result ignored: ${result.testName}`);
			return;
		}
		this.seenTests.add(result.testName);
		this.results.push(result);
		const status = result.passed ? "✅ PASS" : "❌ FAIL";
		console.log(`  [${status}] ${result.testName}: ${result.message}`);
	}

	async runAll() {
		this.results = [];
		this.seenTests.clear();
		console.log("🚀 Starting Autogen Test Suite...");
		try {
			await this.runtime.callExport(0, 'run_all_cpp_tests', 0, 0);
			await new Promise(r => setTimeout(r, 500));

			await runAsyncTests(this.runtime, this._log.bind(this));
			await runMeshTests(this.runtime, this._log.bind(this));
			await runErrorTests(this.runtime, this._log.bind(this));
			await runExtensionTests(this.runtime, this._log.bind(this));
			await runGlobalTests(this.runtime, this._log.bind(this));
			await runLifecycleTests(this.runtime, this._log.bind(this));
		} catch (err) {
			console.error("Test suite crashed:", err);
			this._log({ workerId: 0, testName: 'Suite_Crash', passed: false, message: err.message });
		}
		const total = this.results.length;
		const passed = this.results.filter(r => r.passed).length;
		console.log("📊 Test Suite Summary:");
		console.log(`  Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
		return { total, passed, failed: total - passed, failedTests: this.results.filter(r => !r.passed), allResults: this.results };
	}
}