#!/bin/sh
# Makes the local HTTPS certificate of the screens (owner answer (a) to Q-2026-10-21-159, with
# the owner's addition: it covers localhost and the Mac mini's local network name, so an iPad on
# the same Wi-Fi can open the app). Login sub-slice L7c.
#
# It makes a small local certificate authority (kept only on this Mac, in .local/https) and a
# server certificate signed by it. You trust the authority once on the Mac and once on the iPad
# (README, "Local run on the Mac mini"). Nothing is downloaded; macOS's openssl does the work.
set -eu
. "$(dirname -- "$0")/common.sh"

command -v openssl >/dev/null 2>&1 || prm_fail "openssl is needed (it comes with macOS)."
name=$(prm_local_hostname)
case "$name" in
  ''|*[!A-Za-z0-9-]*) prm_fail "The local network name '$name' is not usable; set PRM_LOCAL_HOSTNAME." ;;
esac

umask 077
mkdir -p "$PRM_HTTPS"
chmod 700 "$PRM_LOCAL" "$PRM_HTTPS"
cd "$PRM_HTTPS"

if [ ! -e local-ca.pem ]; then
  cat > local-ca.cnf <<CONFIG
[req]
distinguished_name = subject
prompt = no
x509_extensions = authority
[subject]
CN = CHETANA local development authority ($name)
[authority]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
CONFIG
  openssl req -x509 -newkey rsa:3072 -sha256 -days 825 -nodes \
    -keyout local-ca-key.pem -out local-ca.pem -config local-ca.cnf 2>/dev/null
fi

cat > server.cnf <<CONFIG
[req]
distinguished_name = subject
prompt = no
[subject]
CN = $name.local
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:$name.local,DNS:localhost,IP:127.0.0.1
authorityKeyIdentifier = keyid
CONFIG

openssl req -new -newkey rsa:2048 -nodes -keyout server-key.pem -out server.csr \
  -config server.cnf 2>/dev/null
openssl x509 -req -in server.csr -CA local-ca.pem -CAkey local-ca-key.pem -CAcreateserial \
  -out server.pem -days 365 -sha256 -extfile server.cnf -extensions server 2>/dev/null
rm -f server.csr

printf 'Certificate ready for https://%s.local:5173 and https://localhost:5173 (365 days).\n' "$name"
printf 'Trust this file once on the Mac and on the iPad: %s/local-ca.pem\n' "$PRM_HTTPS"
