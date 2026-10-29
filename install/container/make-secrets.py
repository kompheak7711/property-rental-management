"""Make the installed app's missing secrets inside its Docker volumes (install/compose.yaml).

Runs as root in the one-shot "secrets" service on every start; a file that is already there is
kept as it is, so starting again never changes a password or the key. It prints nothing secret.
The same files as scripts/local/make-secrets.sh and README step 2 of the Mac test app:

- /run/prm-db-passwords: the eight database passwords, readable by the database container's
  postgres user (0444, as on the Mac), mounted only into the database and this service;
- /run/prm-secrets: the four database addresses, owned by the app user 10001 with mode 0400;
- /run/prm-key/totp_protection_key: the sign-in code protection key, root-owned 0600 in a
  root-only folder, refused if it would replace a key (a new key locks every account out).
"""

import os
import secrets
import sys
from urllib.parse import quote

PASSWORDS = "/run/prm-db-passwords"
ADDRESSES = "/run/prm-secrets"
KEY_FOLDER = "/run/prm-key"
KEY_FILE = os.path.join(KEY_FOLDER, "totp_protection_key")
APP_UID = APP_GID = 10001
NAMES = ("admin", "migration", "runtime", "financial", "backup", "restore", "human_admin", "bootstrap")
ADDRESS_FILES = {
    "migration_database_url": ("prm_migrator", "migration"),
    "runtime_database_url": ("prm_runtime", "runtime"),
    "financial_database_url": ("prm_financial", "financial"),
    "bootstrap_database_url": ("prm_bootstrap", "bootstrap"),
}


def write_new(path: str, text: str, mode: int) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, "w", encoding="utf-8") as target:
        target.write(text + "\n")


def main() -> int:
    if os.geteuid() != 0:
        sys.exit("make-secrets must run as root")
    os.umask(0o077)
    for folder, mode in ((PASSWORDS, 0o755), (ADDRESSES, 0o755), (KEY_FOLDER, 0o700)):
        os.makedirs(folder, exist_ok=True)
        os.chown(folder, 0, 0)
        os.chmod(folder, mode)

    made = 0
    for name in NAMES:
        path = os.path.join(PASSWORDS, f"postgres_{name}_password")
        if not os.path.exists(path):
            write_new(path, secrets.token_hex(24), 0o444)
            made += 1
        os.chown(path, 0, 0)
        os.chmod(path, 0o444)

    for file_name, (role, password_name) in ADDRESS_FILES.items():
        path = os.path.join(ADDRESSES, file_name)
        if not os.path.exists(path):
            with open(os.path.join(PASSWORDS, f"postgres_{password_name}_password"), encoding="utf-8") as source:
                password = source.read().strip()
            if not password:
                sys.exit(f"the {password_name} password file is empty")
            write_new(path, f"postgresql://{role}:{quote(password, safe='')}@postgres:5432/prm", 0o400)
        os.chown(path, APP_UID, APP_GID)
        os.chmod(path, 0o400)

    if not os.path.exists(KEY_FILE):
        write_new(KEY_FILE, secrets.token_hex(32), 0o600)
    os.chown(KEY_FILE, 0, 0)
    os.chmod(KEY_FILE, 0o600)

    print(f"Secrets ready ({made} new database passwords; the others were already there).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
