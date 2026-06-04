import { FastifyRequest } from 'fastify';
import { errorHandler, executeCommand, prisma } from '../../../../lib/common';

// GET /api/v1/terminal/application/:id/containers
// Returns running containers for an application so the UI can pick one
export async function getApplicationContainers(request: FastifyRequest<{ Params: { id: string } }>) {
	try {
		const { teamId } = request.user;
		const { id } = request.params;

		const application = await prisma.application.findFirst({
			where: { id, teams: { some: { id: teamId === '0' ? undefined : teamId } } },
			include: { destinationDocker: true }
		});
		if (!application || !application.destinationDockerId) {
			return { containers: [] };
		}

		const { stdout } = await executeCommand({
			dockerId: application.destinationDocker.id,
			command: `docker ps --filter "label=coolify.applicationId=${id}" --format '{{.Names}}'`
		});

		const containers = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((name) => ({ name, destinationId: application.destinationDocker.id }));

		return { containers };
	} catch ({ status, message }: any) {
		return errorHandler({ status, message });
	}
}

// GET /api/v1/terminal/service/:id/containers
export async function getServiceContainers(request: FastifyRequest<{ Params: { id: string } }>) {
	try {
		const { teamId } = request.user;
		const { id } = request.params;

		const service = await prisma.service.findFirst({
			where: { id, teams: { some: { id: teamId === '0' ? undefined : teamId } } },
			include: { destinationDocker: true }
		});
		if (!service || !service.destinationDockerId) {
			return { containers: [] };
		}

		const { stdout } = await executeCommand({
			dockerId: service.destinationDocker.id,
			command: `docker ps --filter "label=coolify.serviceId=${id}" --format '{{.Names}}'`
		});

		const containers = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((name) => ({ name, destinationId: service.destinationDocker.id }));

		return { containers };
	} catch ({ status, message }: any) {
		return errorHandler({ status, message });
	}
}

// GET /api/v1/terminal/database/:id/container
export async function getDatabaseContainer(request: FastifyRequest<{ Params: { id: string } }>) {
	try {
		const { teamId } = request.user;
		const { id } = request.params;

		const database = await prisma.database.findFirst({
			where: { id, teams: { some: { id: teamId === '0' ? undefined : teamId } } },
			include: { destinationDocker: true }
		});
		if (!database || !database.destinationDockerId) {
			return { containers: [] };
		}

		const { stdout } = await executeCommand({
			dockerId: database.destinationDocker.id,
			command: `docker ps --filter "name=${id}" --format '{{.Names}}'`
		});

		const containers = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((name) => ({ name, destinationId: database.destinationDocker.id }));

		return { containers };
	} catch ({ status, message }: any) {
		return errorHandler({ status, message });
	}
}
