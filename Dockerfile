FROM denoland/deno:alpine-1.26.1
WORKDIR /app

# Install wait utility
USER root
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.8.0/wait /wait
RUN chmod +x /wait

USER deno

# Cache external libraries
# Test deps caches all main dependencies as well
COPY tests/test_deps.ts tests/test_deps.ts
COPY deps.ts deps.ts
RUN deno cache tests/test_deps.ts

ADD . .
RUN deno cache mod.ts
