cat /var/lib/postgresql/host/postgresql.conf >> /var/lib/postgresql/data/postgresql.conf
cp /var/lib/postgresql/host/pg_hba.conf /var/lib/postgresql/data
openssl genrsa -out /var/lib/postgresql/host/server.key 2048
openssl req -new -key /var/lib/postgresql/host/server.key -out /var/lib/postgresql/host/server.csr -subj "/C=CO/ST=Cundinamarca/L=Bogota/O=deno-postgres.com/CN=deno-postgres.com"
openssl rsa -in /var/lib/postgresql/host/server.key -out /var/lib/postgresql/host/server.key
openssl x509 -req -days 365 -in /var/lib/postgresql/host/server.csr -signkey /var/lib/postgresql/host/server.key -out /var/lib/postgresql/host/server.crt -sha256
rm /var/lib/postgresql/host/server.csr
cp /var/lib/postgresql/host/server.crt /var/lib/postgresql/data/server.crt
cp /var/lib/postgresql/host/server.key /var/lib/postgresql/data/server.key
chmod 600 /var/lib/postgresql/data/server.crt
chmod 600 /var/lib/postgresql/data/server.key