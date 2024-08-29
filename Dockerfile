FROM denoland/deno:alpine
WORKDIR /app

# Install wait utility
USER root
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.12.1/wait /wait
RUN chmod +x /wait

USER deno

# Cache external libraries
RUN deno cache deno.json

ADD . .
RUN deno cache mod.ts
