# GitHub Secrets for Preview Deployments

## Setup

1. Create a **`preview`** environment: **Settings** > **Environments** > **New environment**
2. Enable **Required reviewers** and add maintainers who should approve fork PR deployments
3. Add the secrets below as **environment secrets** (not repository secrets) under the `preview` environment

| Secret | Description | How to get |
|--------|-------------|------------|
| `CACHIX_AUTH_TOKEN` | Auth token for pushing builds to Cachix | [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens) |
| `CACHIX_CACHE_NAME` | Cachix cache name | The name chosen when creating the cache (e.g., `opencouncil`) |
| `PREVIEW_DEPLOY_SSH_KEY` | Ed25519 private key for SSH to droplet | Generated on droplet — see [preview-deployments.md](../docs/guides/preview-deployments.md#ssh-key-for-github-actions) |
| `PREVIEW_HOST` | Droplet IP address | e.g., `113.54.65.12` |
| `PREVIEW_USER` | SSH user on droplet | `opencouncil` (created by the NixOS module) |

The SSH private key must include the full content with `-----BEGIN/END OPENSSH PRIVATE KEY-----` headers.

## Repository vs environment secrets

GitHub has two levels of secrets:

- **Repository secrets** (`Settings > Secrets > Actions`): Available to all workflows and jobs. Use for non-sensitive config like `CACHIX_CACHE_NAME`.
- **Environment secrets** (`Settings > Environments > preview > Secrets`): Only available to jobs that declare `environment: preview`. Combined with required reviewers, this prevents fork PRs from accessing sensitive secrets without maintainer approval.

Sensitive secrets (SSH keys, auth tokens) must be **environment secrets** so that fork PR workflows require approval before accessing them.

For complete setup context, see [Preview Deployments](../docs/guides/preview-deployments.md).
