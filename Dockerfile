FROM node:20.9.0-alpine as base
WORKDIR /app
ENV NODE_ENV development
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base as builder

COPY . .
RUN pnpm install
CMD pnpm scrape
