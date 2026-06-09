const { io } = require('socket.io-client');
const socket = io('http://localhost:8000/ws/jobs/123/stream', { path: '/ws/socket.io' });
socket.on('connect', () => {
  console.log('Connected to namespace');
  socket.disconnect();
});
socket.on('connect_error', (err) => {
  console.log('Connection error:', err.message);
  socket.disconnect();
});
