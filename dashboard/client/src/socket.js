import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function joinGuild(guildId) {
  const s = getSocket();
  s.emit('join:guild', guildId);
}

export function leaveGuild(guildId) {
  const s = getSocket();
  s.emit('leave:guild', guildId);
}

export default getSocket;
