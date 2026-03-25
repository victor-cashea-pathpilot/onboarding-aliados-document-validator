# GitHub Setup for Cashea Repository

## Current Local State

This workspace is now initialized as a local git repository.

Important current machine settings:

- global git user is currently set to your PathPilot identity
- `gh` is already logged into GitHub as your PathPilot account
- git operations are currently using SSH

For the Cashea repository, do not reuse the global identity. Use repo-local git config and a separate SSH identity.

## Recommended Approach

Use:

- a separate SSH key for the Cashea GitHub account
- an SSH host alias in `~/.ssh/config`
- repo-local `git config user.name` and `git config user.email`

This avoids breaking your existing GitHub setup.

## Step 1: Create a Dedicated SSH Key

Run:

```bash
ssh-keygen -t ed25519 -C "your-cashea-email@example.com" -f ~/.ssh/id_ed25519_cashea
```

## Step 2: Add the Key to the SSH Agent

Run:

```bash
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_cashea
```

## Step 3: Add an SSH Host Alias

Append this to `~/.ssh/config`:

```sshconfig
Host github-cashea
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_cashea
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
```

## Step 4: Add the Public Key to the Cashea GitHub Account

Copy the public key:

```bash
cat ~/.ssh/id_ed25519_cashea.pub
```

Then add it to the Cashea GitHub account under SSH keys.

## Step 5: Test the Cashea SSH Identity

Run:

```bash
ssh -T git@github-cashea
```

Expected result:

- GitHub should identify the Cashea account, not your PathPilot account

## Step 6: Set Repo-Local Git Identity

From this repository:

```bash
git config user.name "Cashea GitHub Name"
git config user.email "your-cashea-email@example.com"
```

This affects only this repository.

Verify:

```bash
git config --get user.name
git config --get user.email
```

## Step 7: Add the Cashea Remote

Use the SSH host alias in the remote URL:

```bash
git remote add origin git@github-cashea:CASHEA_ORG/CASHEA_REPO.git
```

Verify:

```bash
git remote -v
```

## Step 8: First Commit and Push

```bash
git add .
git commit -m "Add v2 planning and architecture docs"
git push -u origin main
```

## Optional: Use `gh` With a Separate Account

If you want to use the GitHub CLI with the Cashea account too, the cleanest option is to log in with a second account and switch when needed.

Example:

```bash
gh auth login
gh auth status
gh auth switch
```

If your main use case is git push and pull, the SSH alias approach is usually enough and avoids changing the active `gh` account for unrelated repositories.

## What I Still Need From You To Finish Setup Here

To complete the repo wiring directly in this workspace, I need:

- the Cashea repo SSH URL or `org/repo`
- the Cashea git author name
- the Cashea git author email

Once you give me those, I can set the local git config and remote for this repo.
