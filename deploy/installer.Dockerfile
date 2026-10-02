FROM docker:29.7.2-cli@sha256:3f4743208d2338c934d7b8bcfbe1bb54c0b2355c510ad5e0f31c0c4a54bd704e AS dockercli
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS web-build
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.19.0 && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
WORKDIR /release
COPY global.json ./
COPY deploy/ ./deploy/
COPY src/ ./src/
COPY tests/M02.FoundationSmoke/ ./tests/M02.FoundationSmoke/
COPY web/ ./web/
COPY --from=web-build /web/dist/ ./web/dist/
COPY .dockerignore ./
ENV CONTROL_ORIGIN=http://127.0.0.1:8740 DOCKER_CONFIG=/control/docker-config
EXPOSE 8740
ENTRYPOINT ["node","/release/deploy/control/server.mjs"]
