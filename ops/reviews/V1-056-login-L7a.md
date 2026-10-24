# V1-056 login sub-slice L7a — recovery codes a person can copy by hand — review record

Sub-slice L7a of the login slice (ops/V1_056_PLAN.md section 7.3, L7; the L6 decision
Q-2026-10-24-187 point 15 left the easier format as an L7 item). No migration. Base commit:
5296730 (L6). Built on 2026-10-24 in the cloud session. Technical points in Q-2026-10-24-188,
decided by Claude under the owner's 2026-10-23 22:30 rule. The commit hash is in `git log`.

## Built

- `recovery_code_security.py`: a new code is 12 symbols of Crockford's Base32 (60 random bits
  from 8 bytes of `secrets.token_bytes`), shown `XXXX-XXXX-XXXX`. `canonical_recovery_code`
  turns a code of this shape, typed in ASCII in any case with or without dashes and spaces,
  into its 12 capitals (I and L read as 1, O as 0); any other text stays as given. `encode`
  hashes the canonical form; `matches` removes white space around the candidate and checks its
  canonical form.
- The screen's example is 7KQ4-M2XD-9PRT (`signInText.ts`).
- Tests in `test_recovery_code_security.py` (three new, two changed; docs/010 "Updated tests
  (login sub-slice L7a)").

## Review round 1 (one independent agent, read-only, no files written)

- No blocker. The generator was checked against an independent reference on 2,000 random
  inputs; no modulo bias (32 symbols, 5 bits each); the expected values are right; no input
  raises; two issued codes cannot collide (issued codes never hold I, L or O); 60 bits are
  ample with salted Argon2id verifiers and counted wrong tries; no caller, API model or screen
  depends on the old 43-sign shape.
- Should-fix, both done: (1) the docs/005 amendment said recovery codes are also checked as the
  reauthentication factor, which takes only `totp`: corrected; (2) a comment in `auth_flow.py`
  still said 256 bits: now 60.
- Note taken: `str.upper()` turned a dotless i or a long s into I or S, so non-ASCII letters
  were read as a code: the canonical form now needs ASCII text (test added). Notes kept: every
  caller of `matches` now removes white space around the candidate (the Owner's account recovery
  and the code lifecycle too; harmless, documented in docs/005); `encode` still refuses spaces
  inside its input, which only generated codes reach; the generator test keeps its locked name
  and note (256 bits) with a docstring saying 60 bits.

## Runs

- Static checks: ruff, format and mypy (backend); prettier, eslint and tsc (frontend): clean.
- Unit: the recovery-code, issuance, regeneration, auth flow, API and bootstrap modules passed;
  the traceability audit 29 passed.
- Frontend: `SignInScreens.test.tsx` and `App.test.tsx` 79 passed.
- T1 (targeted PostgreSQL: the recovery-code flow, sign-in, issuance and regeneration modules
  and the bootstrap): 100 passed.
