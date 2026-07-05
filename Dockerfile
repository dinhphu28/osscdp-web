# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Use the pinned pnpm (from package.json "packageManager") via corepack.
RUN corepack enable

# Install deps first for layer caching. pnpm-workspace.yaml carries the
# build-script allowlist (esbuild/msw) that pnpm 11 requires.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build. VITE_API_BASE_URL is baked at build time; operators can additionally
# override the API base URL at runtime on the /connect screen, so one image can
# still point at a different backend without a rebuild.
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# nginx:alpine's default CMD runs `nginx -g 'daemon off;'`.
