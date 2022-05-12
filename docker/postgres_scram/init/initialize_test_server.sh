cat /var/lib/postgresql/host/postgresql.conf >> /var/lib/postgresql/data/postgresql.conf
cp /var/lib/postgresql/host/pg_hba.conf /var/lib/postgresql/data
cp /var/lib/postgresql/host/server.crt /var/lib/postgresql/data
cp /var/lib/postgresql/host/server.key /var/lib/postgresql/data
chmod 600 /var/lib/postgresql/data/server.crt
chmod 600 /var/lib/postgresql/data/server.key