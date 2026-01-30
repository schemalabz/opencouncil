# NixOS configuration for OpenCouncil preview deployment host
#
# This configuration should be imported on the droplet that will host PR previews.
# It requires the opencouncil-preview module to also be imported (from flake.nix
# or as a standalone module file).
#
# Example /etc/nixos/configuration.nix:
#
#   imports = [
#     ./hardware-configuration.nix
#     ./opencouncil-preview-module.nix   # The NixOS module defining the service
#     ./preview-host.nix                 # This file (host-level config)
#   ];
#
#   services.opencouncil-preview = {
#     enable = true;
#     databaseUrl = "postgresql://user:pass@staging-db:5432/opencouncil";
#     basePort = 3000;
#   };
#
#   # Cachix binary cache (configure in configuration.nix, not here)
#   nix.settings.substituters = [
#     "https://cache.nixos.org"
#     "https://opencouncil.cachix.org"
#   ];
#   nix.settings.trusted-public-keys = [
#     "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
#     "opencouncil.cachix.org-1:D6DC/9ZvVTQ8OJkdXM86jny5dQWjGofNq9p6XqeCWwI="
#   ];

{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.opencouncil-preview;
  previewDomain = "preview.opencouncil.gr";
in

{
  config = mkIf cfg.enable {
    # Networking
    networking.firewall.allowedTCPPorts = [ 80 443 ];

    # Caddy reverse proxy with automatic HTTPS
    # Caddy config is dynamically managed by deployment scripts.
    # Each PR deployment adds its own subdomain config via /etc/caddy/conf.d/.
    services.caddy = {
      enable = true;

      # Main preview host page
      virtualHosts."${previewDomain}" = {
        extraConfig = ''
          respond "OpenCouncil PR Preview Host - Active previews managed dynamically" 200
        '';
      };

      # Import per-PR configs from /etc/caddy/conf.d/
      # Each PR deployment drops a Caddyfile snippet there via caddy-add-preview.
      extraConfig = ''
        import /etc/caddy/conf.d/*
      '';
    };

    # Create directory for Caddy drop-in configs
    systemd.tmpfiles.rules = [
      "d /etc/caddy/conf.d 0755 caddy caddy -"
    ];

    # SSH configuration for GitHub Actions deployments
    security.sudo.extraRules = [
      {
        users = [ cfg.user ];
        commands = [
          {
            command = "${pkgs.systemd}/bin/systemctl start opencouncil-preview@*";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${pkgs.systemd}/bin/systemctl stop opencouncil-preview@*";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${pkgs.systemd}/bin/systemctl enable opencouncil-preview@*";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${pkgs.systemd}/bin/systemctl disable opencouncil-preview@*";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${pkgs.systemd}/bin/systemctl status opencouncil-preview@*";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${pkgs.systemd}/bin/systemctl reload caddy";
            options = [ "NOPASSWD" ];
          }
          {
            command = "/run/current-system/sw/bin/caddy-add-preview";
            options = [ "NOPASSWD" ];
          }
          {
            command = "/run/current-system/sw/bin/caddy-remove-preview";
            options = [ "NOPASSWD" ];
          }
          {
            command = "/run/current-system/sw/bin/opencouncil-preview-create";
            options = [ "NOPASSWD" ];
          }
          {
            command = "/run/current-system/sw/bin/opencouncil-preview-destroy";
            options = [ "NOPASSWD" ];
          }
        ];
      }
    ];

    # Deployment scripts and tools
    environment.systemPackages = with pkgs; [
      git
      cachix
      htop
      curl
      jq

      # Caddy helper scripts
      (pkgs.writeShellScriptBin "caddy-add-preview" ''
        set -euo pipefail

        if [ $# -ne 1 ]; then
          echo "Usage: caddy-add-preview <pr-number>" >&2
          exit 1
        fi

        pr_num="$1"
        port=$((${toString cfg.basePort} + pr_num))
        config_file="/etc/caddy/conf.d/pr-$pr_num.conf"

        mkdir -p /etc/caddy/conf.d

        cat > "$config_file" <<CADDYEOF
pr-$pr_num.${previewDomain} {
  reverse_proxy localhost:$port {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
}
CADDYEOF

        echo "Added Caddy config for PR #$pr_num at $config_file"

        # Reload Caddy using caddy reload command
        ${pkgs.caddy}/bin/caddy reload --config /etc/caddy/caddy_config --adapter caddyfile 2>&1 || {
          echo "Warning: Caddy reload may have failed, trying systemctl reload"
          systemctl reload caddy
        }
      '')

      (pkgs.writeShellScriptBin "caddy-remove-preview" ''
        set -euo pipefail

        if [ $# -ne 1 ]; then
          echo "Usage: caddy-remove-preview <pr-number>" >&2
          exit 1
        fi

        pr_num="$1"
        config_file="/etc/caddy/conf.d/pr-$pr_num.conf"

        if [ -f "$config_file" ]; then
          rm "$config_file"
          echo "Removed Caddy config for PR #$pr_num"

          # Reload Caddy
          ${pkgs.caddy}/bin/caddy reload --config /etc/caddy/caddy_config --adapter caddyfile 2>&1 || {
            echo "Warning: Caddy reload may have failed, trying systemctl reload"
            systemctl reload caddy
          }
        else
          echo "No Caddy config found for PR #$pr_num"
        fi
      '')
    ];

    # Automatic garbage collection
    nix.gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
  };
}
