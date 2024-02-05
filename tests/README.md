# Testing

To run tests, first prepare your configuration file by copying
`config.example.json` into `config.json` and updating it appropriately based on
your environment. If you use the Docker based configuration below there's no
need to modify the configuration.

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

```
docker run --rm --env POSTGRES_USER=test --env POSTGRES_PASSWORD=test \
  --env POSTGRES_DB=deno_postgres -p 5432:5432 postgres:12-alpine
```
