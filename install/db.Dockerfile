# syntax=docker/dockerfile:1
# The installed V1 app's database: the same PostgreSQL as compose.yaml, with the same identity
# set-up script (scripts/postgres-init.sh) built in, so no file is mounted from the computer.
FROM postgres:17.6
COPY scripts/postgres-init.sh /docker-entrypoint-initdb.d/10-identities.sh
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/10-identities.sh \
    && chmod 0755 /docker-entrypoint-initdb.d/10-identities.sh
