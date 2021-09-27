openssl genrsa -out ./postgres_tls/data/server.key 2048
openssl req -new -key ./postgres_tls/data/server.key -out ./postgres_tls/data/server.csr -subj "/C=CO/ST=Cundinamarca/L=Bogota/O=deno-postgres.com/CN=deno-postgres.com"
openssl rsa -in ./postgres_tls/data/server.key -out ./postgres_tls/data/server.key
openssl x509 -req -days 365 -in ./postgres_tls/data/server.csr -signkey ./postgres_tls/data/server.key -out ./postgres_tls/data/server.crt -sha256
rm ./postgres_tls/data/server.csr