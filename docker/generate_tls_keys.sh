# Generate CA certificate and key
openssl genrsa -out ./postgres_tls/data/ca.key 2048
openssl req -new -x509 -nodes -days 365 \
   -key ./postgres_tls/data/ca.key \
   -out ./postgres_tls/data/ca.crt \
   -subj "/C=CO/ST=Cundinamarca/L=Bogota/O=deno-postgres.com/CN=deno-postgres.com"

# Generate leaf certificate
openssl req -newkey rsa:2048 -nodes -days 365 \
   -keyout ./postgres_tls/data/server.key \
   -out ./postgres_tls/data/server.csr \
   -subj "/C=CO/ST=Cundinamarca/L=Bogota/O=deno-postgres.com/CN=deno-postgres.com"
openssl x509 -req -days 365 -set_serial 01 \
   -in ./postgres_tls/data/server.csr \
   -out ./postgres_tls/data/server.crt \
   -CA ./postgres_tls/data/ca.crt \
   -CAkey ./postgres_tls/data/ca.key

rm ./postgres_tls/data/server.csr