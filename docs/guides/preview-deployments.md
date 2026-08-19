# PR Preview Deployments

Automated per-PR preview environments on a NixOS droplet. Each PR gets a subdomain (`pr-123.opencouncil.dev`), a systemd service, and Caddy reverse proxy entry. All previews share a staging database.

## How It Works

```
GitHub Actions (on PR open/push)
  1. Detect prisma/migrations/ changes → block if found (override: [skip-migration-check] in PR body)
  2. nix build .#opencouncil-prod
  3. cachix push opencouncil ./result
  4. SSH to droplet → nix-store --realise from cache → opencouncil-preview-create <pr>
  5. Health check (curl preview URL, retry up to 10×)
  6. Post preview URL + health status as PR comment

GitHub Actions (on PR close)
  → SSH to droplet → opencouncil-preview-destroy <pr>
```

On the droplet, each PR maps to:
- **Port**: `3000 + PR_NUMBER` (PR #123 → port 3123)
- **Service**: `opencouncil-preview@3123.service`
- **Caddy config**: `/etc/caddy/conf.d/pr-123.conf` → reverse proxy to `localhost:3123`
- **URL**: `https://pr-123.opencouncil.dev`

## Repository Files

| File | Purpose |
|------|---------|
| `flake.nix` → `opencouncil-prod` | `buildNpmPackage` producing a Next.js standalone build |
| `flake.nix` → `nixosModules.opencouncil-preview` | Self-contained NixOS module: systemd service, Caddy, sudo rules, management scripts, garbage collection |
| `.github/workflows/preview-deploy.yml` | Build + deploy on PR open/sync (includes health check) |
| `.github/workflows/preview-cleanup.yml` | Teardown on PR close |

## Nix Build Details

The `opencouncil-prod` package in `flake.nix` uses `buildNpmPackage` with these key considerations:

- **npm dependencies via `importNpmLock`**: Each package is fetched using the integrity hashes already in `package-lock.json`, so lockfile changes (including dependabot bumps) need no manual hash update.
- **`--ignore-scripts` during install**: The `canvas` npm package requires native libraries (cairo, pango, libjpeg, giflib, librsvg, pixman). Scripts are skipped during the dependency fetch phase, then `npm rebuild canvas` runs in `preBuild` with all native deps available.
- **`SKIP_ENV_VALIDATION=1`**: The app uses `@t3-oss/env-nextjs` which validates env vars at build time. Since secrets aren't available in the Nix sandbox, this flag (checked via `skipValidation` in `src/env.mjs`) skips validation during build.
- **Prisma**: Engines are provided by `pkgs.prisma-engines`. `npx prisma generate` runs in `preBuild`.
- **Output**: Next.js standalone build at `$out/` with `server.js`, `.next/static`, `public/`, and `prisma/`.

## Droplet Setup

### Requirements

- NixOS droplet
- Minimum: 2 GB RAM, 20 GB disk
- DNS. `opencouncil.dev` is delegated to the DigitalOcean nameservers, the same
  as `opencouncil.gr`. Add the domain under **Networking → Domains**, then add
  two records that point at the droplet IP:

  | Type | Hostname | Value |
  |------|----------|-------|
  | A | `@` | `<droplet-ip>` |
  | A | `*` | `<droplet-ip>` |

  A DNS wildcard matches one label only. A preview host must therefore stay one
  label deep: `pr-123.opencouncil.dev` resolves, `pr-123.preview.opencouncil.dev`
  does not. Do not put a TLS-terminating proxy in front of these records. Caddy
  answers the ACME challenge itself, and a proxy in front of it blocks the
  challenge.

  `.dev` is on the HSTS preload list, so browsers force HTTPS on every preview.
  Caddy issues one certificate per hostname on demand, which satisfies that.
  Previews also stop consuming the Let's Encrypt certificate quota of
  `opencouncil.gr`.

### Configuration

The droplet consumes the NixOS module directly from the flake. You need two files in `/etc/nixos/`:

**`/etc/nixos/flake.nix`** — points at the repo:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    opencouncil.url = "github:schemalabz/opencouncil";
  };

  outputs = { self, nixpkgs, opencouncil, ... }: {
    nixosConfigurations.preview = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        (nixpkgs + "/nixos/modules/virtualisation/digital-ocean-config.nix")
        opencouncil.nixosModules.opencouncil-preview
        ./configuration.nix
      ];
    };
  };
}
```

**`/etc/nixos/configuration.nix`** — host-specific settings only:

```nix
{ lib, ... }:

{
  imports = lib.optional (builtins.pathExists ./do-userdata.nix) ./do-userdata.nix;

  networking.hostName = "opencouncil-preview";

  services.opencouncil-preview = {
    enable = true;
    envFile = "/var/lib/opencouncil-previews/.env";
    cachix.enable = true;
  };

  services.openssh = {
    enable = true;
    settings.PasswordAuthentication = false;
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAA... you@host"
  ];

  system.stateVersion = "24.11";
}
```

Apply with:
```bash
nixos-rebuild switch --flake /etc/nixos#preview
```

The module is self-contained — it includes Caddy, firewall rules, sudo rules, helper scripts, garbage collection, and Cachix configuration. No separate files to sync.

### Updating the Module

When `nixosModules.opencouncil-preview` changes in the repo, pull the update on the droplet:

```bash
# Update the opencouncil flake input to latest commit
nix flake update opencouncil --flake /etc/nixos

# Apply
nixos-rebuild switch --flake /etc/nixos#preview
```

### Changing the Preview Domain

The domain lives in three places. Change all three together:

1. `services.opencouncil-preview.previewDomain` in the module (`flake.nix`). It
   sets the Caddy vhost of each preview and the `NEXTAUTH_URL` of each instance.
2. `PREVIEW_DOMAIN` in `.github/workflows/preview-deploy.yml`. It sets the
   health-check URL and the URL in the PR comment.
3. `PREVIEW_DOMAIN` in `src/lib/realm.ts`. `isKnownRealmHost` gates the SEO
   redirects and the magic-link host rewrite on it. A preview on a host that
   this constant does not cover stops reproducing production.

To keep the old hostnames alive during the move, set `legacyPreviewDomain` to
the previous domain. Each preview then gets a second vhost,
`pr-<N>.<legacyPreviewDomain>`, that 301s to the new URL. Old DNS must stay in
place while this option is set. Set the option back to `null` after every open
PR redeploys.

An open PR keeps its old Caddy config until its next deployment. To move the
existing previews immediately, regenerate their configs on the droplet:

```bash
for f in /etc/caddy/conf.d/pr-*.conf; do
  n=$(basename "$f" .conf)
  n=${n#pr-}
  port=$((3000 + n))
  caddy-add-preview "$n"
  systemctl is-active --quiet "opencouncil-preview@$port" && systemctl restart "opencouncil-preview@$port"
done
```

`nixos-rebuild switch` normally restarts the instances itself, because the new
`NEXTAUTH_URL` changes the unit. The explicit restart makes that certain. A
preview that keeps the old `NEXTAUTH_URL` serves on the new host but still mails
magic links that point at the old one.

### SSH Key for GitHub Actions

Generate on the droplet. Note: the `opencouncil` user's home is `/var/lib/opencouncil-previews` (set by the NixOS module), so `authorized_keys` must go there:

```bash
OHOME=/var/lib/opencouncil-previews
mkdir -p $OHOME/.ssh
ssh-keygen -t ed25519 -f $OHOME/.ssh/github_actions -N "" -C "github-actions-deploy"
cat $OHOME/.ssh/github_actions.pub >> $OHOME/.ssh/authorized_keys
chown -R opencouncil:opencouncil $OHOME/.ssh
chmod 700 $OHOME/.ssh
chmod 600 $OHOME/.ssh/authorized_keys
```

Copy the private key (`cat /var/lib/opencouncil-previews/.ssh/github_actions`) to the `PREVIEW_DEPLOY_SSH_KEY` GitHub secret.

### Environment Variables

The app requires many env vars at runtime (API keys, storage config, etc.). These are split into three categories:

**Per-instance (set by the NixOS module automatically):**
- `PORT` — `basePort + PR_NUMBER`
- `NODE_ENV=production`
- `HOSTNAME=0.0.0.0`
- `NEXTAUTH_URL` — `https://pr-<N>.opencouncil.dev` (used for all URL construction: callbacks, emails, etc.)

**Shared (env file at `/var/lib/opencouncil-previews/.env`):**

All secrets and shared env vars, including `DATABASE_URL`. This file is `chmod 600` and never ends up in the Nix store. Create it on the droplet:

```bash
ssh root@<droplet-ip>
nano /var/lib/opencouncil-previews/.env
```

Required contents (replace values with real staging credentials):

```env
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Auth
RESEND_API_KEY=...
NEXTAUTH_SECRET=...

# Services
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...

# Storage (DigitalOcean Spaces)
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
CDN_URL=https://...

# Task Server
TASK_API_URL=https://...
TASK_API_KEY=...

# Search
ELASTICSEARCH_URL=https://...
ELASTICSEARCH_API_KEY=...

# Client-side
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=...
```

Set permissions:
```bash
chown opencouncil:opencouncil /var/lib/opencouncil-previews/.env
chmod 600 /var/lib/opencouncil-previews/.env
```

The NixOS module loads this file via systemd `EnvironmentFile=`. Optional vars (Discord, Bird, Google Calendar, etc.) can be added to the same file — see `src/env.mjs` for the full list.

**Base URL note:** All base URL usage in this codebase now uses `NEXTAUTH_URL` (server-side, read at runtime), so previews work correctly without build-time URL injection. Client-side code that needs the base URL uses `window.location.origin` instead.

### GitHub Secrets

| Secret | Value |
|--------|-------|
| `CACHIX_AUTH_TOKEN` | Personal auth token from [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens) |
| `CACHIX_CACHE_NAME` | `opencouncil` |
| `PREVIEW_DEPLOY_SSH_KEY` | SSH private key (full content including headers) |
| `PREVIEW_HOST` | Droplet IP (e.g., `113.54.65.12`) |
| `PREVIEW_USER` | `opencouncil` |

## Manual Management

SSH to the droplet, then:

```bash
# List active previews
opencouncil-preview-list

# Create/destroy a preview
sudo opencouncil-preview-create 123    # starts service on port 3123, adds Caddy config
sudo opencouncil-preview-destroy 123   # stops service, removes Caddy config

# Check a specific service
systemctl status opencouncil-preview@3123
journalctl -u opencouncil-preview@3123 -f

# Caddy helpers (called automatically by create/destroy)
sudo caddy-add-preview 123
sudo caddy-remove-preview 123
```

## Manual Testing (without GitHub Actions)

Before the full CI pipeline is configured, you can test the build and deploy flow manually. This uses PR number `999` as a placeholder.

### 1. Build locally

```bash
# Load env vars (needed for NEXT_PUBLIC_* values baked into client JS)
set -a; source .env; set +a

# Build the production package (--impure required for builtins.getEnv)
nix build --impure .#opencouncil-prod
```

### 2. Push to Cachix

```bash
cachix push opencouncil ./result
```

### 3. Deploy to droplet

```bash
DROPLET=<DROPLET-IP>

# The create script automatically fetches the store path from Cachix
ssh root@$DROPLET "sudo opencouncil-preview-create 999 $(readlink ./result)"
```

### 4. Verify

```bash
curl -sI https://pr-999.opencouncil.dev | head -20
```

### 5. Teardown

```bash
ssh root@$DROPLET "sudo opencouncil-preview-destroy 999"
```

## Migration Handling

PRs with database migrations are automatically deployed with **isolated databases**:

- Each migration PR gets its own PostgreSQL instance (PostGIS 3.3.5)
- Migrations are applied automatically, followed by seed data
- The isolated DB is destroyed when the PR closes
- Non-migration PRs continue to use the shared staging database

### How It Works

When `prisma/migrations/` changes are detected:
1. The workflow passes `--with-db` to `opencouncil-preview-create`
2. A dedicated PostgreSQL service starts (`opencouncil-preview-db@<pr-num>`)
3. Migrations run via `prisma migrate deploy`, then `prisma db seed`
4. The app connects to the isolated DB instead of staging

### Resource Usage

Each isolated database uses ~80-100MB RAM (tuned settings: `shared_buffers=48MB`). The 4GB droplet can comfortably handle 2-3 concurrent migration PRs.

### Manual Testing (before CI)

To test isolated DB deployment manually before merging workflow changes:

```bash
# 1. Update the NixOS module on the droplet
ssh root@<droplet-ip>
nix flake update opencouncil --flake /etc/nixos
nixos-rebuild switch --flake /etc/nixos#preview

# 2. Build your migration branch locally
cd /path/to/opencouncil
git checkout your-migration-branch
set -a; source .env; set +a
nix build --impure .#opencouncil-prod

# 3. Push to Cachix
cachix push opencouncil ./result

# 4. Deploy with --with-db (use a test PR number like 9999)
STORE_PATH=$(readlink ./result)
ssh root@<droplet-ip> "sudo opencouncil-preview-create 9999 '$STORE_PATH' --with-db"

# 5. Test the preview
curl -I https://pr-9999.opencouncil.dev

# 6. Check logs if needed
ssh root@<droplet-ip> "journalctl -u opencouncil-preview@12999 -n 50"
ssh root@<droplet-ip> "journalctl -u opencouncil-preview-db@9999 -n 50"

# 7. Clean up
ssh root@<droplet-ip> "sudo opencouncil-preview-destroy 9999"
```

### Development & Debugging

SSH to the droplet (`ssh root@159.89.98.26`), then:

**Service inspection:**
```bash
# Check app service
systemctl status opencouncil-preview@$((3000 + PR_NUM))
journalctl -u opencouncil-preview@$((3000 + PR_NUM)) -f

# Check DB service (migration PRs only)
systemctl status opencouncil-preview-db@<pr-num>

# Check if isolated DB marker exists
ls -la /var/lib/opencouncil-previews/pr-<num>/.has-local-db

# View postgres data directory
ls -la /var/lib/opencouncil-previews/pr-<num>/postgres/
```

**Direct database access (migration PRs with isolated DBs):**

Each isolated DB runs on port `5432 + PR_NUMBER` (e.g., PR 288 → port 5720), user/db both `opencouncil`, trust auth (no password). `psql` is available on the system PATH.

```bash
psql -h 127.0.0.1 -p $((5432 + PR_NUM)) -U opencouncil -d opencouncil
```

## Testing Other Realms

`opencouncil.dev` belongs to no realm, so every preview resolves to the
**greece** realm by Host header — and some realm domains (e.g.
`opencouncil.rs`) have no DNS at all yet. To review another realm, append
`?realm=<realm>` to any preview URL:

```
https://pr-288.opencouncil.dev/?realm=serbia
```

The proxy stores the realm in an `oc-realm` cookie (30 days) and redirects to
the clean URL; from then on the whole app — landing page city list, realm
guards, default locale, locale redirects, script switcher — behaves as that
realm. Switch back with `?realm=greece`, or clear the cookie.

The override works on any non-production host (previews, localhost) and is
ignored on the production apex domains. See `realmOverride` in
`src/lib/realm.ts`.

## Troubleshooting

**Amended migration files (schema mismatch after force-push):**

`prisma migrate deploy` tracks applied migrations by name. If you amend a migration file that was already applied (e.g., rename a column from `diavgeiaUnitId` to `diavgeiaUnitIds`), the isolated DB keeps the old schema — Prisma sees the migration name as already applied and skips it. Symptoms: `The column X does not exist in the current database` errors at runtime.

Fix: destroy and recreate the preview to get a fresh DB with the updated migration:
```bash
ssh root@<droplet-ip>
STORE_PATH=$(readlink /var/lib/opencouncil-previews/pr-<num>/app)
sudo opencouncil-preview-destroy <num>
sudo opencouncil-preview-create <num> "$STORE_PATH" --with-db
```

To avoid this, prefer creating additive migrations instead of amending existing ones. If you must amend, remember to reset the preview DB afterwards.

**Preview not accessible:**
1. DNS: `dig pr-123.opencouncil.dev` should resolve to droplet IP
2. Caddy: `systemctl status caddy` + check `/etc/caddy/conf.d/pr-123.conf` exists
3. Service: `systemctl status opencouncil-preview@3123` should be active
4. Logs: `journalctl -u opencouncil-preview@3123 -n 100`

**Build failures:**
1. Check GitHub Actions logs
2. Test locally: `nix build .#opencouncil-prod`

**Disk space:**
```bash
df -h
nix-collect-garbage -d   # remove old builds (also runs weekly via systemd timer)
```

## Related Files

- [Cachix Setup](./cachix-setup.md)
- [GitHub Secrets Reference](../../.github/SECRETS.md)
- `flake.nix` — production build package + self-contained NixOS module
