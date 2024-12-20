// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Initialize Express App
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // For development purposes; restrict in production
    methods: ["GET", "POST"]
  }
});

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Storage for Rooms and Users
const rooms = {}; // { roomID: { users: { socketID: username }, streamURL: string } }

// Handle Socket Connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle Joining a Room
  socket.on('join-room', ({ roomID, username }) => {
    if (!roomID || !username) {
      socket.emit('error-message', 'Room ID and Username are required.');
      return;
    }

    // Create Room if it doesn't exist
    if (!rooms[roomID]) {
      rooms[roomID] = {
        users: {},
        streamURL: `https://${socket.handshake.headers.host}/hls/movienight.m3u8` // Adjust 'movienight' as needed
//        streamURL: `https://${socket.handshake.headers.host}:8888/live/movienight.m3u8`
      };
    }

    // Join the Room
    socket.join(roomID);
    rooms[roomID].users[socket.id] = username;

    console.log(`${username} joined room ${roomID}`);

    // Notify Existing Users in the Room
    socket.to(roomID).emit('user-joined', { socketID: socket.id, username: username });

    // Send the Stream URL to the Newly Joined User
    socket.emit('stream-url', { streamURL: rooms[roomID].streamURL });

    // Update Users List in the Room
    io.to(roomID).emit('update-users', Object.values(rooms[roomID].users));

    // Handle Signaling Data for WebRTC (If Applicable)
    socket.on('signal-data', ({ to, signal }) => {
      io.to(to).emit('signal-data', { from: socket.id, signal: signal });
    });

    // Handle Playback Synchronization Events
    socket.on('playback', (data) => {
      // Broadcast to all other users in the room
      socket.to(roomID).emit('playback', data);
    });

    // Handle Chat Messages
    socket.on('chat-message', ({ message, username }) => {
      // Broadcast the message to all users in the room
      io.to(roomID).emit('chat-message', { message: message, username: username });
    });

    // Handle Disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      // Remove User from the Room
      if (rooms[roomID] && rooms[roomID].users[socket.id]) {
        const departedUsername = rooms[roomID].users[socket.id];
        delete rooms[roomID].users[socket.id];

        // Notify Remaining Users
        socket.to(roomID).emit('user-disconnected', { socketID: socket.id, username: departedUsername });

        // Update Users List
        io.to(roomID).emit('update-users', Object.values(rooms[roomID].users));

        // Delete Room if Empty
        if (Object.keys(rooms[roomID].users).length === 0) {
          delete rooms[roomID];
          console.log(`Room ${roomID} deleted as it became empty.`);
        }
      }
    });
  });
});

// Start the Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
