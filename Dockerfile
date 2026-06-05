ARG PNPM_VERSION=7.11.0

FROM node:18-slim as build
WORKDIR /app

# node-pty requires python3, make, g++ and cmake to compile its native addon
RUN apt update && apt -y install --no-install-recommends curl python3 make g++ cmake
RUN npm --no-update-notifier --no-fund --global install pnpm@${PNPM_VERSION}

COPY . .
RUN pnpm install
# pnpm moves the compiled node-pty native addon to .ignored/ when it finds
# prebuilds for other platforms. Copy the linux build into the correct location
# so it survives into the production image.
RUN mkdir -p /app/apps/api/node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/build/Release && \
    cp /app/apps/api/node_modules/.ignored/node-pty/build/Release/pty.node \
       /app/apps/api/node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/build/Release/pty.node
RUN pnpm build

# Production build
FROM node:18-slim
WORKDIR /app
ENV NODE_ENV production
ARG TARGETPLATFORM

# https://download.docker.com/linux/static/stable/
ARG DOCKER_VERSION=20.10.18
# https://github.com/docker/compose/releases
# Reverted to 2.6.1 because of this https://github.com/docker/compose/issues/9704. 2.9.0 still has a bug.
ARG DOCKER_COMPOSE_VERSION=2.6.1
# https://github.com/buildpacks/pack/releases
ARG PACK_VERSION=0.27.0

RUN apt update && apt -y install --no-install-recommends ca-certificates git git-lfs openssh-client curl jq cmake sqlite3 openssl psmisc python3 vim
RUN apt-get clean autoclean && apt-get autoremove --yes && rm -rf /var/lib/{apt,dpkg,cache,log}/
RUN npm --no-update-notifier --no-fund --global install pnpm@${PNPM_VERSION}
RUN npm install -g npm@${PNPM_VERSION}

RUN mkdir -p ~/.docker/cli-plugins/

RUN curl -SL https://cdn.coollabs.io/bin/$TARGETPLATFORM/docker-$DOCKER_VERSION -o /usr/bin/docker
RUN curl -SL https://cdn.coollabs.io/bin/$TARGETPLATFORM/docker-compose-linux-$DOCKER_COMPOSE_VERSION -o ~/.docker/cli-plugins/docker-compose
RUN curl -SL https://cdn.coollabs.io/bin/$TARGETPLATFORM/pack-$PACK_VERSION -o /usr/local/bin/pack 

RUN chmod +x ~/.docker/cli-plugins/docker-compose /usr/bin/docker /usr/local/bin/pack

COPY --from=build /app/apps/api/build/ .
# COPY --from=build /app/others/fluentbit/ ./fluentbit
COPY --from=build /app/apps/ui/build/ ./public
COPY --from=build /app/apps/api/prisma/ ./prisma
COPY --from=build /app/apps/api/package.json .
COPY --from=build /app/docker-compose.yaml .
COPY --from=build /app/apps/api/tags.json .
COPY --from=build /app/apps/api/templates.json .
# Copy pre-built node_modules from build stage.
# node-pty is a native addon compiled during build — must be copied, not reinstalled.
COPY --from=build /app/apps/api/node_modules/ ./node_modules
COPY --from=build /app/node_modules/.pnpm/prisma@4.8.1/node_modules/prisma/ ./node_modules/prisma/
COPY --from=build /app/node_modules/.pnpm/@prisma+client@4.8.1_prisma@4.8.1/node_modules/@prisma/ ./node_modules/@prisma/

EXPOSE 3000
ENV CHECKPOINT_DISABLE=1
CMD pnpm start
