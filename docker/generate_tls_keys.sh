# Generate CA certificate and key
openssl req -x509 -nodes -new -sha256 -days 36135 -newkey rsa:2048 -keyout ./postgres_tls/data/ca.key -out ./postgres_tls/data/ca.pem -subj "/C=US/CN=Example-Root-CA"
openssl x509 -outform pem -in ./postgres_tls/data/ca.pem -out ./postgres_tls/data/ca.crt

# Generate leaf certificate
openssl req -new -nodes -newkey rsa:2048 -keyout ./postgres_tls/data/server.key -out ./postgres_tls/data/server.csr -subj "/C=US/ST=YourState/L=YourCity/O=Example-Certificates/CN=localhost"
openssl x509 -req -sha256 -days 36135 -in ./postgres_tls/data/server.csr -CA ./postgres_tls/data/ca.pem -CAkey ./postgres_tls/data/ca.key -CAcreateserial -extfile ./postgres_tls/data/domains.txt -out ./postgres_tls/data/server.crt

rm ./postgres_tls/data/ca.pem
rm ./postgres_tls/data/server.csr
rm ./.srl