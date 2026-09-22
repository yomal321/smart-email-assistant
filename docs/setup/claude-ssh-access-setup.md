# Giving a Claude session SSH access to the n8n host

Covers: how to let a Claude Code session run commands directly on the n8n
EC2 box (`51.21.242.189`, alias `n8n-host`) — editing `docker-compose.yml`,
restarting containers, reading logs — the way this session does, instead of
you relaying manual steps back and forth.

**This is not something to set up per-conversation.** SSH access lives at
the machine/network level, not inside any one Claude chat — so whether a
*different* chat can do this depends only on where that chat's tools
actually run, never on what was said in this conversation.

## What's already true on this Windows PC

- SSH key: `D:\Personal Task\Smart Gmail Assistant\n8n-host-key.pem`
- SSH config entry (`C:\Users\HP\.ssh\config`):
  ```
  Host n8n-host
      HostName 51.21.242.189
      User ubuntu
      IdentityFile "D:/Personal Task/Smart Gmail Assistant/n8n-host-key.pem"
      IdentitiesOnly yes
  ```
- AWS security group `sg-085fd03e8ed97a2b0` (`launch-wizard-1`) has an
  inbound SSH (port 22) rule scoped to **this PC's current public IP**.

## Case A — another Claude Code window, same PC

Nothing to configure. Any Claude Code session whose Bash/PowerShell tool
executes on this same Windows machine already sees the same
`~/.ssh/config` and the same key file — they're plain OS-level files, not
tied to a conversation. It should just work: `ssh n8n-host`.

- [ ] If it doesn't: your home/office IP may have changed since the AWS
  rule was added (ISPs rotate dynamic IPs). Fix: AWS Console → EC2 →
  Security Groups → `launch-wizard-1` → Edit inbound rules → the SSH (22)
  rule → change Source to **My IP** again → Save.

## Case B — a different machine, or a cloud/remote Claude session

This needs real setup, because none of the above lives there by default:

- [ ] **Copy the key file** to that environment (`n8n-host-key.pem`).
  Keep it out of git — this repo's `.gitignore` should already exclude
  `*.pem`; confirm before committing anything from that environment.
- [ ] **Add the same SSH config entry** there, pointing `IdentityFile` at
  wherever the key landed on that machine.
- [ ] **Whitelist that environment's outbound IP** in the same security
  group (AWS Console → EC2 → Security Groups → `launch-wizard-1` →
  Inbound rules → Add rule → Type SSH → Source = that environment's public
  IP, or `My IP` if you're setting it up interactively from there).
  Without this step the connection times out before SSH even gets to
  check the key — this is the step that's easy to forget, since the key
  and config alone give no error until this is missing.
- [ ] Test: `ssh n8n-host "echo ok"` from that environment.

## Case C — claude.ai web chat, or an unknown surface

Some Claude interfaces have no shell/SSH tool at all, regardless of any
setup above — there's no key or config that fixes that. If unsure what
kind of session it is, that's the first thing to confirm, not the IP
whitelist.

## Why this matters here specifically

This host also runs the n8n instance behind the Gmail assistant / hub
bot ([`assistant-bot-setup.md`](assistant-bot-setup.md)) — editing its
`docker-compose.yml` (env vars, credentials wiring) is a recurring need
as that project grows, so it's worth more than one environment being able
to do it directly rather than funneling every change through manual
copy-pasted `nano` instructions.
