// files/api/hello.ws.js
// Simple WebSocket handler that echoes messages with a greeting

module.exports.handler = function(ws, request) {
  const clientIp = request.socket.remoteAddress;
  const url = new URL(request.url, `http://${request.headers.host}`);
  const queryParams = url.searchParams;
  
  console.log(`[hello] New WebSocket connection from ${clientIp}`);
  console.log(`[hello] Query params:`, Object.fromEntries(queryParams.entries()));
  
  // Track connection state
  let connectionId = Math.random().toString(36).substr(2, 9);
  let messageCount = 0;
  
  // Return lifecycle methods
  return {
    onOpen: () => {
      console.log(`[hello] Connection ${connectionId} opened`);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        connectionId: connectionId,
        message: 'Hello! WebSocket connection established.',
        timestamp: new Date().toISOString()
      }));
      
      // Send server info
      ws.send(JSON.stringify({
        type: 'server_info',
        serverTime: new Date().toISOString(),
        protocol: request.headers['x-forwarded-proto'] || (request.socket.encrypted ? 'https' : 'http')
      }));
    },
    
    onMessage: (msg) => {
      messageCount++;
      console.log(`[hello] Connection ${connectionId} received message #${messageCount}:`, msg);
      
      try {
        // Try to parse as JSON
        const data = JSON.parse(msg);
        
        // Echo back with server processing
        ws.send(JSON.stringify({
          type: 'echo',
          original: data,
          serverResponse: {
            receivedAt: new Date().toISOString(),
            connectionId: connectionId,
            messageNumber: messageCount,
            status: 'processed'
          }
        }));
        
      } catch (e) {
        // Not JSON, just echo as text
        ws.send(JSON.stringify({
          type: 'echo',
          original: msg,
          serverResponse: {
            receivedAt: new Date().toISOString(),
            connectionId: connectionId,
            messageNumber: messageCount,
            status: 'text_message'
          }
        }));
      }
    },
    
    onClose: () => {
      console.log(`[hello] Connection ${connectionId} closed (exchanged ${messageCount} messages)`);
    }
  };
};