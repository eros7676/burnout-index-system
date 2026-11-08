#!/bin/sh
# Each demo company has its own database and the app user needs all of them; Nexus, the original
# demo, uses the one Compose creates by name, nexus_workload (NexusProject/nexus-project/.env.example,
# Docs/empresas-demo.md).
# MySQL runs this on the first start of an empty volume. On a volume created before, run it once:
#   docker compose exec mysql sh /docker-entrypoint-initdb.d/01-empresas.sh
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS nexus_conecta;
CREATE DATABASE IF NOT EXISTS nexus_rutas;
CREATE DATABASE IF NOT EXISTS nexus_salud;
GRANT ALL PRIVILEGES ON nexus_conecta.* TO '$MYSQL_USER'@'%';
GRANT ALL PRIVILEGES ON nexus_rutas.* TO '$MYSQL_USER'@'%';
GRANT ALL PRIVILEGES ON nexus_salud.* TO '$MYSQL_USER'@'%';
SQL
