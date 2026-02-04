# PR Preview Deployments

Automated per-PR preview environments on a NixOS droplet. Each PR gets a subdomain (`pr-123.preview.opencouncil.gr`), a systemd service, and Caddy reverse proxy entry. All previews share a staging database.

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
- **URL**: `https://pr-123.preview.opencouncil.gr`

## Repository Files

| File | Purpose |
|------|---------|
| `flake.nix` → `opencouncil-prod` | `buildNpmPackage` producing a Next.js standalone build |
| `flake.nix` → `nixosModules.opencouncil-preview` | Self-contained NixOS module: systemd service, Caddy, sudo rules, management scripts, garbage collection |
| `.github/workflows/preview-deploy.yml` | Build + deploy on PR open/sync (includes health check) |
| `.github/workflows/preview-cleanup.yml` | Teardown on PR close |

## Nix Build Details

The `opencouncil-prod` package in `flake.nix` uses `buildNpmPackage` with these key considerations:

- **`npmDepsHash`**: Must be updated when `package-lock.json` changes. Regenerate with:
  ```bash
  nix run nixpkgs#prefetch-npm-deps package-lock.json
  ```
- **`--ignore-scripts` during install**: The `canvas` npm package requires native libraries (cairo, pango, libjpeg, giflib, librsvg, pixman). Scripts are skipped during the dependency fetch phase, then `npm rebuild canvas` runs in `preBuild` with all native deps available.
- **`SKIP_ENV_VALIDATION=1`**: The app uses `@t3-oss/env-nextjs` which validates env vars at build time. Since secrets aren't available in the Nix sandbox, this flag (checked via `skipValidation` in `src/env.mjs`) skips validation during build.
- **Prisma**: Engines are provided by `pkgs.prisma-engines`. `npx prisma generate` runs in `preBuild`.
- **Output**: Next.js standalone build at `$out/` with `server.js`, `.next/static`, `public/`, and `prisma/`.

## Droplet Setup

### Requirements

- NixOS droplet
- Minimum: 2 GB RAM, 20 GB disk
- DNS: `A preview → <ip>` and `A *.preview → <ip>` for `opencouncil.gr`

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
- `NEXT_PUBLIC_BASE_URL` — `https://pr-<N>.preview.opencouncil.gr` (set by the start script)
- `NEXTAUTH_URL` — `https://pr-<N>.preview.opencouncil.gr` (required for NextAuth magic link callbacks)

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

**`NEXT_PUBLIC_*` note:** Most `NEXT_PUBLIC_BASE_URL` usage in this codebase is server-side (via the t3-env `env` object), so it works at runtime. The only edge case is client-side JavaScript (e.g., admin QR page), where the value is baked at build time. Since the build uses `SKIP_ENV_VALIDATION=1` without a base URL, these client-side references will be empty. For most preview testing this is acceptable.

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

If `package-lock.json` changed, update `npmDepsHash` first:
```bash
nix run nixpkgs#prefetch-npm-deps package-lock.json
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
curl -sI https://pr-999.preview.opencouncil.gr | head -20
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
curl -I https://pr-9999.preview.opencouncil.gr

# 6. Check logs if needed
ssh root@<droplet-ip> "journalctl -u opencouncil-preview@12999 -n 50"
ssh root@<droplet-ip> "journalctl -u opencouncil-preview-db@9999 -n 50"

# 7. Clean up
ssh root@<droplet-ip> "sudo opencouncil-preview-destroy 9999"
```

### Debugging

```bash
# Check DB service status
systemctl status opencouncil-preview-db@<pr-num>

# Check if isolated DB marker exists
ls -la /var/lib/opencouncil-previews/pr-<num>/.has-local-db

# Connect to isolated DB
psql postgresql://opencouncil@127.0.0.1:$((5432 + PR_NUM))/opencouncil

# View postgres data directory
ls -la /var/lib/opencouncil-previews/pr-<num>/postgres/
```

## Troubleshooting

**Preview not accessible:**
1. DNS: `dig pr-123.preview.opencouncil.gr` should resolve to droplet IP
2. Caddy: `systemctl status caddy` + check `/etc/caddy/conf.d/pr-123.conf` exists
3. Service: `systemctl status opencouncil-preview@3123` should be active
4. Logs: `journalctl -u opencouncil-preview@3123 -n 100`

**Build failures:**
1. Check GitHub Actions logs
2. Test locally: `nix build .#opencouncil-prod`
3. If `package-lock.json` changed, update `npmDepsHash` (see [Nix Build Details](#nix-build-details))

**Disk space:**
```bash
df -h
nix-collect-garbage -d   # remove old builds (also runs weekly via systemd timer)
```

## Related Files

- [Cachix Setup](./cachix-setup.md)
- [GitHub Secrets Reference](../../.github/SECRETS.md)
- `flake.nix` — production build package + self-contained NixOS module
