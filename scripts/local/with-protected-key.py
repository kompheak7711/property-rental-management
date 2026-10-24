#!/usr/bin/python3
"""Open the protected TOTP key as root, then run one command as the person who ran sudo.

Login sub-slice L7c (owner answers (a) to Q-2026-10-21-155 and Q-2026-10-21-159; technical
points Q-2026-10-24-189). The key file is root-owned with mode 0600, so only root can open it;
the API and the first-Owner bootstrap must not run as root. This helper:

1. runs only as root under sudo (it needs SUDO_UID and SUDO_GID);
2. opens the key file read-only and checks it is a root-owned regular file that neither the
   group nor others can read (the same check as `read_root_controlled_totp_key`);
3. places it on the descriptor number given with --fd, the only descriptor it passes on;
4. drops to the sudo user's user id, group id and groups for good, and checks that root cannot
   be taken back;
5. runs the command with HOME, USER and LOGNAME of that person.

It prints no key, no path content and no secret. It uses only the Python standard library.
Install it once as root (the L7 runbook in README.md), so the copy that sudo runs cannot be
changed without root:

    sudo install -d -o root -g wheel -m 0755 /usr/local/libexec/prm
    sudo install -o root -g wheel -m 0755 scripts/local/with-protected-key.py \
        /usr/local/libexec/prm/with-protected-key.py
"""

import argparse
import os
import pwd
import stat
import sys
from typing import NoReturn

DEFAULT_KEY_PATH = "/usr/local/etc/prm/totp_protection_key"
LOWEST_FD = 3
HIGHEST_FD = 9


def fail(message: str) -> NoReturn:
    sys.stderr.write(f"with-protected-key: {message}\n")
    raise SystemExit(1)


def parse(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="with-protected-key",
        description="Open the protected TOTP key as root, then run a command as the sudo user.",
    )
    parser.add_argument("--key", default=DEFAULT_KEY_PATH)
    parser.add_argument("--fd", type=int, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    parsed = parser.parse_args(arguments)
    if parsed.command[:1] == ["--"]:
        parsed.command = parsed.command[1:]
    if not parsed.command:
        fail("no command was given")
    if not LOWEST_FD <= parsed.fd <= HIGHEST_FD:
        fail(f"--fd must be between {LOWEST_FD} and {HIGHEST_FD}")
    return parsed


def sudo_user() -> pwd.struct_passwd:
    if os.geteuid() != 0:
        fail("run it with sudo")
    try:
        uid = int(os.environ["SUDO_UID"])
        gid = int(os.environ["SUDO_GID"])
    except (KeyError, ValueError):
        fail("run it with sudo from your own account")
    if uid == 0:
        fail("run it with sudo from your own account, not from root")
    try:
        person = pwd.getpwuid(uid)
    except KeyError:
        fail("the sudo user is unknown")
    if person.pw_gid != gid:
        fail("the sudo user's group does not match")
    return person


def open_key(path: str, fd: int) -> None:
    try:
        opened = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_NOCTTY)
    except OSError:
        fail("the protected key file cannot be opened")
    metadata = os.fstat(opened)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        os.close(opened)
        fail("the protected key file must be a root-owned file that only root can read")
    if opened != fd:
        os.dup2(opened, fd, inheritable=True)
        os.close(opened)
    else:
        os.set_inheritable(fd, True)


def drop_to(person: pwd.struct_passwd) -> None:
    os.setgroups(os.getgrouplist(person.pw_name, person.pw_gid))
    os.setgid(person.pw_gid)
    os.setuid(person.pw_uid)
    try:
        os.setuid(0)
    except PermissionError:
        pass
    else:
        fail("root could be taken back; stopping")
    if os.getuid() == 0 or os.geteuid() == 0:
        fail("the user could not be changed; stopping")


def main(arguments: list[str]) -> None:
    parsed = parse(arguments)
    person = sudo_user()
    open_key(parsed.key, parsed.fd)
    drop_to(person)
    environment = {
        name: value for name, value in os.environ.items() if not name.startswith("SUDO_")
    }
    environment.update(
        HOME=person.pw_dir,
        USER=person.pw_name,
        LOGNAME=person.pw_name,
        PRM_PROTECTED_KEY_FD=str(parsed.fd),
    )
    try:
        os.execvpe(parsed.command[0], parsed.command, environment)
    except OSError:
        fail("the command could not be started")


if __name__ == "__main__":
    main(sys.argv[1:])
