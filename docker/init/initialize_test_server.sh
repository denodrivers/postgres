# Prepend old postgresql.conf to new before copying everything
cat /var/lib/postgresql/host/postgresql.conf >> /var/lib/postgresql/data/postgresql.conf
cp /var/lib/postgresql/data/postgresql.conf /var/lib/postgresql/host/postgresql.conf

cp /var/lib/postgresql/host/* /var/lib/postgresql/data
chmod 600 /var/lib/postgresql/data/server.crt
chmod 600 /var/lib/postgresql/data/server.key