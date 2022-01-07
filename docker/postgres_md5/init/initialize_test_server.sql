-- Create MD5 user and ensure password is stored as md5
-- They get created as SCRAM-SHA-256 in newer versions
CREATE USER MD5 WITH ENCRYPTED PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE POSTGRES TO MD5;

UPDATE PG_AUTHID
SET ROLPASSWORD = 'md5'||MD5('postgres'||'md5')
WHERE ROLNAME ILIKE 'MD5';

