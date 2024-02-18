# Testing

To run tests, we recommend using Docker. With Docker, there is no
need to modify any configuration, just run the build and test commands.

If running tests on your host, prepare your configuration file by copying
`config.example.json` into `config.json` and updating it appropriately based on
your environment.

## Running the Tests

From within the project directory, run:

```sh
# run on host
deno test --allow-read --allow-net --allow-env

# run in docker container
docker-compose build --no-cache
docker-compose run tests
```

## Docker Configuration

If you have Docker installed then you can run the following to set up a running
container that is compatible with the tests:

```sh
docker run --rm --env POSTGRES_USER=test --env POSTGRES_PASSWORD=test \
  --env POSTGRES_DB=deno_postgres -p 5432:5432 postgres:12-alpine
```
