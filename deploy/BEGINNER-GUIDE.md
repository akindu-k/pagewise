# Beginner's guide: deploy md-to-pdf on AWS EC2

No prior AWS experience needed. This walks you through every click. Budget ~20 min.
An EC2 instance is just a Linux computer in the cloud that you rent and stay
connected to — it never "sleeps", so there's no cold start.

---

## Phase 0 — Which AWS account do you have?

- **A normal AWS account** (you sign up at aws.amazon.com; needs a card for
  verification even on Free Tier) + GitHub Student Pack / AWS Educate credits →
  ✅ everything below works and stays always-on.
- **AWS Academy Learner Lab** (you log in through your course portal) → the lab
  **stops your instance when the session ends**, so it won't stay online 24/7.
  You can still follow this to learn, but it's not real always-on hosting.

If unsure, tell me how you log in to AWS and I'll confirm.

---

## Phase 1 — Create the server (EC2 instance)

1. Sign in to the **AWS Management Console**.
2. In the top search bar, type **EC2** and click the EC2 service.
3. Make sure a region near you is selected (top-right corner, e.g. *Mumbai
   ap-south-1*). Remember which one — your instance lives there.
4. Click the orange **Launch instance** button.
5. Fill the form:
   - **Name:** `md-to-pdf`
   - **Application and OS Image:** click **Ubuntu**, then pick
     **Ubuntu Server 24.04 LTS** (must say *Free tier eligible*).
   - **Instance type:** `t3.micro` (or `t2.micro`) — should say *Free tier eligible*.
   - **Key pair (login):** click **Create new key pair**.
     - Name: `md-to-pdf-key`, type **RSA**, format **.pem**.
     - Click **Create** — a file `md-to-pdf-key.pem` downloads. **Keep it safe;
       you can't re-download it.** Move it somewhere you'll find it, e.g. your
       WSL home folder.
   - **Network settings** → click **Edit**, then under *Firewall (security
     groups)* make sure **Allow SSH traffic** is checked. We'll add the app's
     port right after launch.
   - **Configure storage:** change 8 GiB to **16 GiB** (Chromium needs room).
6. Click **Launch instance**. Wait ~1 minute, then click **View all instances**.
   When *Instance state* shows **Running** and status checks pass, you're set.

## Phase 2 — Open the app's port (security group)

By default only SSH (port 22) is open. The app runs on port **3000**, so open it:

1. Click your instance → bottom panel → **Security** tab → click the
   **security group** link (looks like `sg-0abc...`).
2. Click **Edit inbound rules** → **Add rule**:
   - **Type:** Custom TCP
   - **Port range:** `3000`
   - **Source:** Anywhere-IPv4 (`0.0.0.0/0`)
3. **Save rules.**

## Phase 3 — Connect to the server

**Easiest (no key file needed):** on the instance page, click the **Connect**
button (top) → **EC2 Instance Connect** tab → **Connect**. A terminal opens in
your browser. If that works, skip to Phase 4.

**If the browser button fails, use SSH from your WSL terminal:**

```bash
# go to where the key downloaded (adjust the path)
cd ~
chmod 400 md-to-pdf-key.pem          # lock down the key (required once)

# copy your instance's "Public IPv4 DNS" from the console and use it here:
ssh -i md-to-pdf-key.pem ubuntu@<PASTE_PUBLIC_DNS_HERE>
```

Type `yes` when asked about authenticity. You're now on the server (prompt shows
`ubuntu@ip-...`).

## Phase 4 — Get a GitHub token (repo is private)

The server needs permission to download your private code.

1. GitHub → your avatar → **Settings** → **Developer settings** (bottom of left
   menu) → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
2. Name: `ec2-deploy`. Expiration: your choice.
3. **Repository access:** *Only select repositories* → pick **md-to-pdf**.
4. **Permissions:** expand *Repository permissions* → set **Contents** to
   **Read-only**.
5. **Generate token** and **copy it** (starts with `github_pat_...`). You won't
   see it again.

## Phase 5 — Install and run (one command)

In the server terminal, paste this (replace the token):

```bash
export GITHUB_TOKEN=github_pat_PASTE_YOURS_HERE
curl -fsSL "https://${GITHUB_TOKEN}@raw.githubusercontent.com/akindu-k/md-to-pdf/main/deploy/ec2-setup.sh" | bash
```

It runs for a few minutes (installs Node, Chromium libraries, downloads the
browser, starts the app). When it finishes it prints your URL.

## Phase 6 — Use it

Open in your browser:

```
http://<YOUR_EC2_PUBLIC_DNS>:3000
```

(Copy *Public IPv4 DNS* from the instance page. Note **http**, not https, and the
`:3000`.) Upload a `.md` file → download the PDF. 🎉

---

## Everyday commands (on the server)

```bash
sudo systemctl status md-to-pdf     # is it running?
sudo journalctl -u md-to-pdf -f     # watch logs (Ctrl+C to exit)
sudo systemctl restart md-to-pdf    # restart it
```

Deploy code changes later: just re-run the Phase 5 command — it pulls the latest
and restarts automatically.

## Common beginner snags

| Symptom | Fix |
|---|---|
| Browser page won't load | Port 3000 not opened — redo **Phase 2**. Also check you used `http://` and `:3000`. |
| `Permissions 0644 ... key rejected` on SSH | Run `chmod 400 md-to-pdf-key.pem`. |
| `Permission denied (publickey)` | Wrong username — it's `ubuntu@...` for Ubuntu AMIs. |
| Setup script: `Repository not found` | Token missing/expired or lacks Contents:Read on `md-to-pdf`. Redo **Phase 4**. |
| Page loads but conversion fails | `sudo journalctl -u md-to-pdf -e` to see the error; usually a missing Chromium lib — re-run the Phase 5 command. |

## Don't forget: stop it when you're done experimenting

To avoid using up Free Tier hours/credits, in the console select the instance →
**Instance state** → **Stop** (you can **Start** it again later; the public DNS
may change). **Terminate** deletes it permanently.
