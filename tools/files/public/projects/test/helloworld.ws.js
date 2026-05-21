// WebSocket handler with lifecycle callbacks
module.exports.handler = function(ws, req) {
    return {
        onOpen: () => {
            ws.send(JSON.stringify({ 
                type: "welcome", 
                message: "Connected to Hello World WS!",
                serverTime: Date.now()
            }));
        },
        onMessage: (msg) => {
            try {
                const data = JSON.parse(msg);
                if (data.text !== undefined) {
                    ws.send(JSON.stringify({ 
                        type: "echo", 
                        reply: `Server received: "${data.text}"`,
                        timestamp: Date.now()
                    }));
                } else {
                    ws.send(JSON.stringify({ type: "error", message: "Missing 'text' field" }));
                }
            } catch (e) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid JSON format" }));
            }
        },
        onClose: () => {
            // Connection closed - cleanup if needed
        }
    };
};