# Infrastructure

## Recommended VPS

**4 vCPU / 8 GB RAM / 100 GB NVMe** — e.g. Hetzner CX32 or equivalent (~€15–25/mo).
Room for Postgres + Redis + the app + Caddy + Umami + Prometheus/Grafana/Loki without
starving any of them. Ubuntu 24.04 LTS.

## Local development

```bash
docker compose -f infra/docker-compose.dev.yml up -d
cp .env.example .env   # fill in real values
pnpm install
pnpm dev
```

Postgres on `localhost:5432`, Redis on `localhost:6379`, Umami on `localhost:3001`.

## Server provisioning runbook (run once, on a fresh VPS)

Everything below assumes you're `root` over a fresh Ubuntu 24.04 install and have
already added your SSH public key when the VPS was created.

### 1. Base hardening

```bash
apt update && apt -y upgrade
adduser deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

```bash
systemctl restart sshd
```

**Verify the `deploy` user can SSH in from a second terminal before closing the first**
— a typo here locks you out of a fresh box with no console access on some providers.

### 2. Firewall + intrusion prevention

```bash
apt -y install ufw fail2ban unattended-upgrades
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

dpkg-reconfigure -plow unattended-upgrades   # enable automatic security updates
systemctl enable fail2ban --now
```

### 3. Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable docker --now
```

### 4. Deploy

```bash
su - deploy
mkdir -p /opt/porphyra && cd /opt/porphyra
git clone <this-repo-url> .
cp .env.example .env   # fill in real production secrets — see "Secrets" below
docker compose -f infra/docker-compose.prod.yml up -d
```

### 5. DNS + TLS

Point `porphyra.example` and `app.porphyra.example` (A/AAAA records) at the VPS IP.
Caddy handles ACME + auto-renewal on its own — no manual certbot step. Confirm with:

```bash
curl -sI https://porphyra.example | head -5
```

## Secrets

No secret ever gets committed or baked into an image. Production `.env` lives only on
the VPS (`chmod 600`, owned by `deploy`), pulled from SOPS/age-encrypted storage in CI
for the deploy step. `.env.example` documents every key with no real values.

## Backups

```bash
# infra/scripts/backup.sh — pg_dump, age-encrypt, ship offsite. Run via cron.
0 3 * * * /opt/porphyra/infra/scripts/backup.sh
```

**A backup you haven't restored is a hypothesis, not a backup.** Run the restore drill
in `infra/scripts/restore-drill.md` at least once before launch, and log the result —
this is a hard gate in Phase 6, not optional polish.

## What's still open

- Domain not yet chosen — `Caddyfile` and this runbook use `porphyra.example` as a
  placeholder throughout; find/replace once decided.
- `infra/scripts/backup.sh`, `restore-drill.md`, and the CI deploy pipeline land in
  Phase 6 (Hardening), alongside Prometheus/Grafana/Loki for ops telemetry.
