# Deploying md-to-pdf on AWS EC2 (always-on, no cold start)

This runs the app 24/7 on a small EC2 instance, so there is **no idle spin-down**
like a free PaaS tier. Covered by the AWS Free Tier (`t3.micro`, 750 hrs/month for
12 months) or your student credits.

> **Heads-up:** if your "student package" is the **AWS Academy Learner Lab**
> sandbox, instances are auto-stopped when the lab session ends — that reintroduces
> downtime. This guide assumes a normal AWS account (GitHub Student Pack / AWS
> Educate credits or the standard Free Tier).

## 1. Launch the instance

1. EC2 Console → **Launch instance**.
2. **AMI:** Ubuntu Server 24.04 LTS.
3. **Type:** `t3.micro` (Free Tier eligible) — `t2.micro` also fine.
4. **Key pair:** create/download one so you can SSH in.
5. **Network / security group — add inbound rules:**
   | Type | Port | Source | Why |
   |------|------|--------|-----|
   | SSH | 22 | My IP | admin access |
   | Custom TCP | 3000 | 0.0.0.0/0 | the app |
   | HTTP | 80 | 0.0.0.0/0 | only if you add a domain + HTTPS (step 4) |
6. **Storage:** 12–16 GB (Chromium + deps need a bit of room). Launch.

## 2. Run the setup script

SSH in, then run the one-shot installer (installs Node 20, Chromium libs, clones
the repo, and registers a `systemd` service):

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_DNS>

# The repo is PRIVATE, so provide a GitHub token with read access.
# Create one at: GitHub → Settings → Developer settings →
#   Fine-grained tokens → repo md-to-pdf → Contents: Read-only
export GITHUB_TOKEN=github_pat_xxxxx

curl -fsSL "https://${GITHUB_TOKEN}@raw.githubusercontent.com/akindu-k/md-to-pdf/main/deploy/ec2-setup.sh" | bash
```

When it finishes it prints the URL. Open **`http://<EC2_PUBLIC_DNS>:3000`**.

## 3. Managing the service

```bash
sudo systemctl status md-to-pdf     # health
sudo journalctl -u md-to-pdf -f     # live logs
sudo systemctl restart md-to-pdf    # restart
```

To deploy new commits later, just re-run the setup command — it pulls latest,
reinstalls, and restarts.

## 4. (Optional) A real domain + HTTPS

Accessing `http://<ip>:3000` works but is plain HTTP. For `https://` you need a
domain you control (Let's Encrypt won't issue certs for `*.amazonaws.com`).

1. Point an A record (e.g. `mdpdf.yourdomain.com`) at the instance's public IP.
2. Open port 80 and 443 in the security group.
3. Install Caddy (automatic HTTPS) and reverse-proxy to the app:

   ```bash
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt-get update && sudo apt-get install -y caddy

   echo 'mdpdf.yourdomain.com {
     reverse_proxy localhost:3000
   }' | sudo tee /etc/caddy/Caddyfile
   sudo systemctl restart caddy
   ```

Caddy fetches a TLS cert automatically. Your app is now at `https://mdpdf.yourdomain.com`.

## Cost / sizing notes

- `t3.micro` = 1 GB RAM. Fine for typical Markdown docs; very large docs with many
  images could pressure memory. If you see Chromium OOM in the logs, resize to
  `t3.small`.
- Always-on within Free Tier limits is $0 for 12 months; afterward a `t3.micro`
  is a few dollars/month (covered by student credits).
