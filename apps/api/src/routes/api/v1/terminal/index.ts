import { FastifyPluginAsync } from 'fastify';
import { getApplicationContainers, getDatabaseContainer, getServiceContainers } from './handlers';

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
	fastify.addHook('onRequest', async (request) => {
		return await request.jwtVerify();
	});

	// Get running containers so the UI can list them in the terminal picker
	fastify.get('/application/:id/containers', async (request: any) =>
		getApplicationContainers(request)
	);
	fastify.get('/service/:id/containers', async (request: any) =>
		getServiceContainers(request)
	);
	fastify.get('/database/:id/container', async (request: any) =>
		getDatabaseContainer(request)
	);
};

export default root;
