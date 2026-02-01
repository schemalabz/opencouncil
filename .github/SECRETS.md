# GitHub Secrets for Preview Deployments

Add these in: **Settings** > **Secrets and variables** > **Actions** > **New repository secret**

| Secret | Description | How to get |
|--------|-------------|------------|
| `CACHIX_AUTH_TOKEN` | Auth token for pushing builds to Cachix | [app.cachix.org/personal-auth-tokens](https://app.cachix.org/personal-auth-tokens) |
| `CACHIX_CACHE_NAME` | Cachix cache name | The name chosen when creating the cache (e.g., `opencouncil`) |
| `PREVIEW_DEPLOY_SSH_KEY` | Ed25519 private key for SSH to droplet | Generated on droplet — see [preview-deployments.md](../docs/guides/preview-deployments.md#ssh-key-for-github-actions) |
| `PREVIEW_HOST` | Droplet IP address | e.g., `113.54.65.12` |
| `PREVIEW_USER` | SSH user on droplet | `opencouncil` (created by the NixOS module) |

The SSH private key must include the full content with `-----BEGIN/END OPENSSH PRIVATE KEY-----` headers.

For complete setup context, see [Preview Deployments](../docs/guides/preview-deployments.md).
