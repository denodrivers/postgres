# Set CWD relative to script location
cd "$(dirname "$0")"

# Generate CA certificate and key
openssl req -x509 -nodes -new -sha256 -days 36135 -newkey rsa:2048 -keyout ./certs/ca.key -out ./certs/ca.pem -subj "/C=US/CN=Example-Root-CA"
openssl x509 -outform pem -in ./certs/ca.pem -out ./certs/ca.crt

# Generate leaf certificate
openssl req -new -nodes -newkey rsa:2048 -keyout ./certs/server.key -out ./certs/server.csr -subj "/C=US/ST=YourState/L=YourCity/O=Example-Certificates/CN=localhost"
openssl x509 -req -sha256 -days 36135 -in ./certs/server.csr -CA ./certs/ca.pem -CAkey ./certs/ca.key -CAcreateserial -extfile ./certs/domains.txt -out ./certs/server.crt

cp -f certs/server.crt postgres_tls/data/
cp -f certs/server.key postgres_tls/data/
