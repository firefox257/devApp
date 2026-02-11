// files/api/room.ws.js
// Room-based WebSocket handler with subscription management AND private messaging
// Protocol:
//   { action: 'subscribe', roomId: 'room1' }
//   { action: 'unsubscribe', roomId: 'room1' }
//   { action: 'send', roomId: 'room1', message: 'Hello!' }                          // Broadcast to room
//   { action: 'send', roomId: 'room1', message: 'Secret!', to: 'abc123' }           // Private to user
//   { action: 'list_users', roomId: 'room1' }                                       // Get room members

// ===== GLOBAL ROOM STORE (PERSISTS ACROSS CONNECTIONS) =====
const rooms = new Map(); // roomId -> Set of { ws, connectionId, joinedAt }

// ===== VALIDATION HELPERS =====
function isValidRoomId(roomId) {
    return typeof roomId === 'string' && 
           roomId.length > 0 && 
           roomId.length <= 50 && 
           /^[a-zA-Z0-9_-]+$/.test(roomId);
}

function isValidMessage(msg) {
    return typeof msg === 'string' && msg.length > 0 && msg.length <= 10000;
}

function isValidUserId(userId) {
    return typeof userId === 'string' && userId.length > 0 && userId.length <= 50;
}

// ===== CONNECTION MANAGEMENT =====
function broadcastToRoom(roomId, payload, excludeWs = null) {
    if (!rooms.has(roomId)) return 0;
    
    const room = rooms.get(roomId);
    let recipients = 0;
    
    // Clean up closed connections during broadcast (defensive)
    const clientsToRemove = [];
    
    for (const client of room) {
        // Skip sender and closed connections
        //if (client.ws === excludeWs || client.ws.readyState !== 1) {
		if ( client.ws.readyState !== 1) {
            if (client.ws.readyState !== 1) {
                clientsToRemove.push(client);
            }
            continue;
        }
        
        try {
            client.ws.send(JSON.stringify(payload));
            recipients++;
        } catch (e) {
            console.warn(`[room] Failed to send to ${client.connectionId} in ${roomId}:`, e.message);
            clientsToRemove.push(client);
        }
    }
    
    // Remove stale connections found during broadcast
    for (const client of clientsToRemove) {
        room.delete(client);
        console.log(`[room] Cleaned up stale connection ${client.connectionId} from ${roomId}`);
    }
    
    return recipients;
}

// Send private message to specific user in room
function sendPrivateMessage(roomId, fromId, toId, message) {
    if (!rooms.has(roomId)) return { success: false, error: 'Room not found' };
    
    const room = rooms.get(roomId);
    let targetClient = null;
    
    for (const client of room) {
        if (client.connectionId === toId) {
            targetClient = client;
            break;
        }
    }
    
    if (!targetClient) {
        return { success: false, error: `User ${toId} not found in room ${roomId}` };
    }
    
    if (targetClient.ws.readyState !== 1) {
        return { success: false, error: `User ${toId} connection closed` };
    }
    
    try {
        targetClient.ws.send(JSON.stringify({
            type: 'private_message',
            roomId,
            from: fromId,
            to: toId,
            content: message,
            timestamp: new Date().toISOString(),
            isPrivate: true
        }));
        return { success: true, recipients: 1 };
    } catch (e) {
        console.error(`[room] Private send error to ${toId}:`, e.message);
        return { success: false, error: 'Delivery failed' };
    }
}

// Get room members list with accurate join timestamps
function getRoomMembers(roomId) {
    if (!rooms.has(roomId)) return [];
    
    const room = rooms.get(roomId);
    return Array.from(room).map(client => ({
        connectionId: client.connectionId,
        joinedAt: client.joinedAt // Use stored timestamp, NOT current time
    }));
}

// Clean up connection from all subscribed rooms
function cleanupConnection(connectionId, subscribedRooms) {
    for (const roomId of subscribedRooms) {
        if (!rooms.has(roomId)) continue;
        
        const room = rooms.get(roomId);
        let found = false;
        
        // Remove client from room
        for (const client of room) {
            if (client.connectionId === connectionId) {
                room.delete(client);
                found = true;
                console.log(`[room] Removed ${connectionId} from ${roomId} (room size: ${room.size})`);
                break;
            }
        }
        
        // Broadcast departure if client was in room
        if (found) {
            broadcastToRoom(roomId, {
                type: 'system',
                event: 'user_left',
                connectionId,
                roomId,
                timestamp: new Date().toISOString()
            });
            
            // Delete empty rooms
            if (room.size === 0) {
                rooms.delete(roomId);
                console.log(`[room] Deleted empty room: ${roomId}`);
            }
        }
    }
}

module.exports.handler = function(ws, request) {
    // Generate robust unique connection ID (timestamp + random)
    const connectionId = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    const subscribedRooms = new Set();
    
    console.log(`[room] New connection: ${connectionId} from ${request.socket.remoteAddress}`);
    
    return {
        onOpen: () => {
            ws.send(JSON.stringify({
                type: 'system',
                event: 'welcome',
                connectionId,
                message: 'Connected to room server. Subscribe to a room to start chatting!',
                timestamp: new Date().toISOString()
            }));
        },
        
        onMessage: (msg) => {
            try {
				console.log("============•••")
				console.log(msg)
                const data = JSON.parse(msg);
                const { action, roomId, message, to } = data;
                
                if (!action || typeof action !== 'string') {
                    return ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Missing or invalid "action" field'
                    }));
                }
                
                switch (action.toLowerCase()) {
                    case 'subscribe':
                        if (!roomId || !isValidRoomId(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid roomId (alphanumeric, 1-50 chars)'
                            }));
                        }
                        
                        if (subscribedRooms.has(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: `Already subscribed to room "${roomId}"`
                            }));
                        }
                        
                        if (!rooms.has(roomId)) {
                            rooms.set(roomId, new Set());
                            console.log(`[room] Created new room: ${roomId}`);
                        }
                        
                        const room = rooms.get(roomId);
                        const joinedAt = new Date().toISOString();
                        room.add({ ws, connectionId, joinedAt }); // Store actual join time
                        subscribedRooms.add(roomId);
                        
                        console.log(`[room] ${connectionId} subscribed to ${roomId} (size: ${room.size})`);
                        
                        // Notify others (exclude self)
                        broadcastToRoom(roomId, {
                            type: 'system',
                            event: 'user_joined',
                            connectionId,
                            roomId,
                            timestamp: joinedAt
                        }, ws);
                        
                        // Confirm subscription to client with accurate member list
                        ws.send(JSON.stringify({
                            type: 'system',
                            event: 'subscribed',
                            roomId,
                            roomSize: room.size,
                            members: getRoomMembers(roomId),
                            message: `Joined room "${roomId}"`,
                            timestamp: joinedAt
                        }));
                        break;
                    
                    case 'unsubscribe':
                        if (!roomId || !isValidRoomId(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid roomId'
                            }));
                        }
                        
                        if (!subscribedRooms.has(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: `Not subscribed to room "${roomId}"`
                            }));
                        }
                        
                        if (rooms.has(roomId)) {
                            const room = rooms.get(roomId);
                            let found = false;
                            
                            for (const client of room) {
                                if (client.connectionId === connectionId) {
                                    room.delete(client);
                                    found = true;
                                    break;
                                }
                            }
                            
                            if (found) {
                                broadcastToRoom(roomId, {
                                    type: 'system',
                                    event: 'user_left',
                                    connectionId,
                                    roomId,
                                    timestamp: new Date().toISOString()
                                }, ws);
                                
                                if (room.size === 0) {
                                    rooms.delete(roomId);
                                    console.log(`[room] Deleted empty room: ${roomId}`);
                                }
                            }
                        }
                        
                        subscribedRooms.delete(roomId);
                        console.log(`[room] ${connectionId} unsubscribed from ${roomId}`);
                        
                        ws.send(JSON.stringify({
                            type: 'system',
                            event: 'unsubscribed',
                            roomId,
                            message: `Left room "${roomId}"`,
                            timestamp: new Date().toISOString()
                        }));
                        break;
                    
                    case 'send':
						console.log("========•=======")
						console.log("roomId:"+roomId)
						console.log("========•=======")
						console.log("to:"+to)
					
					
					
                        if (!roomId || !isValidRoomId(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid roomId'
                            }));
                        }
						console.log("here1")
                        /*
                        if (!subscribedRooms.has(roomId)) {
							console.log("error1")
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: `Must be subscribed to room "${roomId}" to send messages`
                            }));
                        }
						//*/
						
                        console.log("here2")
                        if (!message || !isValidMessage(message)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid message (1-10000 characters)'
                            }));
                        }
                        
						console.log("here3")
                        // PRIVATE MESSAGE
                        if (to && isValidUserId(to)) {
                            if (to === connectionId) {
                                return ws.send(JSON.stringify({
                                    type: 'error',
                                    message: 'Cannot send private message to yourself'
                                }));
                            }
                            
                            const result = sendPrivateMessage(roomId, connectionId, to, message);
                            
                            if (result.success) {
                                console.log(`[room] ${connectionId} sent PRIVATE to ${to} in ${roomId}`);
                                ws.send(JSON.stringify({
                                    type: 'system',
                                    event: 'private_message_sent',
                                    roomId,
                                    to,
                                    timestamp: new Date().toISOString()
                                }));
                            } else {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: result.error
                                }));
                            }
                        } 
                        // ROOM BROADCAST
                        else {
							console.log("here4")
                            const recipients = broadcastToRoom(roomId, {
                                type: 'message',
                                roomId,
                                from: connectionId,
                                content: message,
                                timestamp: new Date().toISOString()
                            }, ws);
                            
                            console.log(`[room] ${connectionId} sent to ${roomId} (recipients: ${recipients})`);
                            ws.send(JSON.stringify({
                                type: 'system',
                                event: 'message_sent',
                                roomId,
                                recipients,
                                timestamp: new Date().toISOString()
                            }));
                        }
                        break;
                    
                    case 'list_users':
                        if (!roomId || !isValidRoomId(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid roomId'
                            }));
                        }
                        
                        if (!subscribedRooms.has(roomId)) {
                            return ws.send(JSON.stringify({
                                type: 'error',
                                message: `Must be subscribed to room "${roomId}" to list users`
                            }));
                        }
                        
                        ws.send(JSON.stringify({
                            type: 'user_list',
                            roomId,
                            users: getRoomMembers(roomId),
                            timestamp: new Date().toISOString()
                        }));
                        break;
                    
                    case 'list_rooms':
                        const roomList = Array.from(rooms.entries()).map(([id, members]) => ({
                            roomId: id,
                            memberCount: members.size
                        }));
                        
                        ws.send(JSON.stringify({
                            type: 'room_list',
                            rooms: roomList,
                            timestamp: new Date().toISOString()
                        }));
                        break;
                    
                    default:
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `Unknown action: "${action}". Valid: subscribe, unsubscribe, send, list_users, list_rooms`
                        }));
                }
            } catch (error) {
                console.error(`[room] Message error for ${connectionId}:`, error.message);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid JSON format. Send: {action, roomId, message?, to?}'
                }));
            }
        },
        
        onClose: () => {
            console.log(`[room] Connection closed: ${connectionId} (was in ${subscribedRooms.size} rooms)`);
            cleanupConnection(connectionId, subscribedRooms);
        },
        
        // Critical: Handle errors to prevent server crashes
        onError: (err) => {
            console.error(`[room] WebSocket error for ${connectionId}:`, err.message);
        }
    };
};