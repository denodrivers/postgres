FROM hayd/alpine-deno:1.7.1
WORKDIR /app

USER root
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.8.0/wait /wait
RUN chmod +x /wait

USER deno
COPY deps.ts .
RUN deno cache deps.ts
ADD . .

# Code health checks
RUN deno lint --unstable
RUN deno fmt --check

# Run tests
CMD /wait && deno test --unstable -A

