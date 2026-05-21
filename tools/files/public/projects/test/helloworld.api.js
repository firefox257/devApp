// Simple HTTP API handler
module.exports.handler = async function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        message: "Hello from API!",
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        note: "Loaded dynamically from files/helloworld.api.js"
    }));
};