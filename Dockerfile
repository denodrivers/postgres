FROM hayd/alpine-deno:1.9.0
WORKDIR /app

# Install wait utility
USER root
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.8.0/wait /wait
RUN chmod +x /wait

# Cache external libraries
USER deno
ADD . .
# Test deps caches all main dependencies as well
RUN deno cache tests/test_deps.ts

# Code health checks
RUN deno lint --unstable
RUN deno fmt --check

# Run tests
CMD /wait && deno test --unstable -A

