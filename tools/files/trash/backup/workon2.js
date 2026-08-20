function wait(ms) {
	return new Promise((resolve, reject) => {
			if (ms < 0) {
				reject(new Error("Time cannot be negative"));
				return;
			}

			setTimeout(() => {
					resolve(`Waited ${ms} milliseconds`);
				}, ms);
		});
}

// Usage:
wait(1000).then(msg => console.log(msg));
