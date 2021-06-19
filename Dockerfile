FROM denoland/deno:alpine-1.11.0
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

# Code health checks
RUN deno lint
RUN deno fmt --check

# Run tests
CMD /wait && deno test --unstable -A
