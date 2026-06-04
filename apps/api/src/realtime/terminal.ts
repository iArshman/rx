/**
 * Terminal support via socket.io + node-pty
 *
 * To enable: pnpm add node-pty   (in apps/api)
 *
 * Socket events (client → server):
 *   terminal:connect   { containerName, destinationId }  – start a shell in a container
 *   terminal:input     { data: string }                  – keystrokes
 *   terminal:resize    { cols: number, rows: number }
 *   terminal:kill                                        – close the session
 *
 * Socket events (server → client):
 *   terminal:ready                  – PTY spawned, terminal is open
 *   terminal:data   { data }        – output to render
 *   terminal:exit   { exitCode }    – session ended
 *   terminal:error  { message }     – something went wrong
 */

import { prisma, executeCommand } from '../lib/common';

let pty: any = null;
try {
	pty = require('node-pty');
} catch (_) {
	console.warn('[terminal] node-pty not installed. Run: cd apps/api && pnpm add node-pty');
}

interface Session {
	teamId: string;
	ptyProcess: any | null;
	isActive: boolean;
	lastActivityAt: number;
}

const sessions = new Map<string, Session>();
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

setInterval(() => {
	const now = Date.now();
	for (const [socketId, session] of sessions.entries()) {
		if (session.isActive && now - session.lastActivityAt > IDLE_TIMEOUT_MS) {
			killSession(socketId);
		}
	}
}, 60_000);

function killSession(socketId: string) {
	const s = sessions.get(socketId);
	if (!s?.ptyProcess) return;
	try {
		s.ptyProcess.write('exit\n');
		setTimeout(() => {
			try { s.ptyProcess?.kill(); } catch (_) {}
		}, 500);
	} catch (_) {}
	s.ptyProcess = null;
	s.isActive = false;
}

/**
 * Verify the requested container belongs to the authenticated team
 * by looking up the destination and doing a docker ps.
 */
async function verifyContainer(
	teamId: string,
	containerName: string,
	destinationId: string
): Promise<boolean> {
	try {
		const dest = await prisma.destinationDocker.findFirst({
			where: {
				id: destinationId,
				teams: { some: { id: teamId === '0' ? undefined : teamId } }
			}
		});
		if (!dest) return false;

		const { stdout } = await executeCommand({
			dockerId: destinationId,
			command: `docker ps --filter "name=^/${containerName}$" --format '{{.Names}}'`
		});
		return stdout.trim().split('\n').includes(containerName);
	} catch (_) {
		return false;
	}
}

export function registerTerminalSocket(fastify: any) {
	// Hook into the existing socket.io server (already auth-guarded in realtime/index.ts)
	fastify.io.on('connection', (socket: any) => {
		let teamId = '';
		try {
			const decoded: any = fastify.jwt.decode(socket.handshake.auth.token);
			teamId = decoded?.teamId ?? '';
		} catch (_) { return; }

		const session: Session = {
			teamId,
			ptyProcess: null,
			isActive: false,
			lastActivityAt: Date.now()
		};
		sessions.set(socket.id, session);

		// ── Connect ──────────────────────────────────────────────────────
		socket.on('terminal:connect', async ({
			containerName,
			destinationId
		}: { containerName: string; destinationId: string }) => {
			if (!pty) {
				socket.emit('terminal:error', { message: 'node-pty not installed on server.' });
				return;
			}
			if (session.isActive) killSession(socket.id);

			const allowed = await verifyContainer(teamId, containerName, destinationId);
			if (!allowed) {
				socket.emit('terminal:error', { message: 'Container not found or access denied.' });
				return;
			}

			const dest = await prisma.destinationDocker.findUnique({ where: { id: destinationId } });
			if (!dest) {
				socket.emit('terminal:error', { message: 'Destination not found.' });
				return;
			}

			// Build the docker exec command
			const dockerHostEnv = dest.remoteEngine
				? `DOCKER_HOST=ssh://${dest.remoteIpAddress}-remote`
				: 'DOCKER_HOST=unix:///var/run/docker.sock';

			const shellCmd =
				`${dockerHostEnv} docker exec -it ${containerName} ` +
				`sh -c 'bash 2>/dev/null || sh'`;

			try {
				const ptyProcess = pty.spawn('sh', ['-c', shellCmd], {
					name: 'xterm-256color',
					cols: 80,
					rows: 30,
					cwd: process.env.HOME || '/',
					env: { ...process.env, TERM: 'xterm-256color' }
				});

				session.ptyProcess = ptyProcess;
				session.isActive = true;
				session.lastActivityAt = Date.now();

				ptyProcess.onData((data: string) => {
					session.lastActivityAt = Date.now();
					socket.emit('terminal:data', { data });
				});

				ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
					session.isActive = false;
					session.ptyProcess = null;
					socket.emit('terminal:exit', { exitCode });
				});

				socket.emit('terminal:ready');
			} catch (err: any) {
				socket.emit('terminal:error', { message: err?.message ?? 'Failed to spawn PTY.' });
			}
		});

		// ── Input ────────────────────────────────────────────────────────
		socket.on('terminal:input', ({ data }: { data: string }) => {
			if (!session.isActive || !session.ptyProcess) return;
			session.lastActivityAt = Date.now();
			session.ptyProcess.write(data);
		});

		// ── Resize ───────────────────────────────────────────────────────
		socket.on('terminal:resize', ({ cols, rows }: { cols: number; rows: number }) => {
			if (!session.isActive || !session.ptyProcess) return;
			session.ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1));
		});

		// ── Kill ─────────────────────────────────────────────────────────
		socket.on('terminal:kill', () => {
			killSession(socket.id);
			socket.emit('terminal:exit', { exitCode: 0 });
		});

		// ── Disconnect ───────────────────────────────────────────────────
		socket.on('disconnect', () => {
			killSession(socket.id);
			sessions.delete(socket.id);
		});
	});
}
