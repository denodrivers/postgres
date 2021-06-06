cat /var/lib/postgresql/host/postgresql.conf >> /var/lib/postgresql/data/postgresql.conf
cp /var/lib/postgresql/host/pg_hba.conf /var/lib/postgresql/data
openssl genrsa -out /var/lib/postgresql/data/server.key 2048
openssl req -new -key /var/lib/postgresql/data/server.key -out /var/lib/postgresql/data/server.csr -subj "/C=CO/ST=Cundinamarca/L=Bogota/O=deno-postgres.com/CN=deno-postgres.com"
openssl rsa -in /var/lib/postgresql/data/server.key -out /var/lib/postgresql/data/server.key
openssl x509 -req -days 365 -in /var/lib/postgresql/data/server.csr -signkey /var/lib/postgresql/data/server.key -out /var/lib/postgresql/data/server.crt -sha256
chmod 600 /var/lib/postgresql/data/server.crt
chmod 600 /var/lib/postgresql/data/server.key
