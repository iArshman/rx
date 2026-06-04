import { registerTerminalSocket } from './terminal';

export default async (fastify) => {
    fastify.io.use((socket, next) => {
        const { token } = socket.handshake.auth;
        if (token && fastify.jwt.verify(token)) {
            next();
        } else {
            return next(new Error("unauthorized event"));
        }
    });

    // Register terminal socket.io events (attaches its own 'connection' listener)
    registerTerminalSocket(fastify);

    fastify.io.on('connection', (socket: any) => {
        const { token } = socket.handshake.auth;
        const { teamId } = fastify.jwt.decode(token);
        socket.join(teamId);
    });
}
