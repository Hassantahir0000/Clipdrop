# Next.js standalone server plus the yt-dlp and ffmpeg binaries it shells out to.
# Works on any host that runs a long-lived container (Railway, Fly.io, Render, a VPS).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so GA needs to be passed as a build arg.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# ffmpeg merges separate video/audio streams and extracts MP3s.
# yt-dlp is the self-contained release binary (no Python needed); rebuild the image to update it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 # YouTube needs a JS runtime to unlock all formats (4K is missing without one). yt-dlp only
 # looks for deno by default, so point it at the Node that's already in this image.
 && printf -- '--js-runtimes node\n' > /etc/yt-dlp.conf

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
# Next's standalone server binds to $HOSTNAME. Hosts like Railway overwrite it with the
# container's hostname at runtime, which makes the app unreachable, so force all interfaces.
# PORT defaults to 3000 above; the host's PORT variable overrides it.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
