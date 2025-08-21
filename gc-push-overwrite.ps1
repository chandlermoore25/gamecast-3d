<# 
gc-push-overwrite.ps1
Purpose: BACK UP current remote main, then OVERWRITE origin/main with your LOCAL working tree (all files & subfolders).

Usage (from your project root):
  powershell -ExecutionPolicy Bypass -File .\gc-push-overwrite.ps1 -Remote "https://github.com/USER/REPO.git"
  (omit -Remote if 'origin' is already set)

What it does:
- Creates remote backup branch + tag of origin/main (if it exists)
- Stages EVERYTHING in your local folder
- Commits (even if empty) and pushes to origin/main with --force-with-lease
- LFS-safe (runs git lfs install/checkout)
- Verbose logs for each step
#>

param(
  [string]$Remote,                        # e.g., https://github.com/USER/REPO.git
  [string]$RepoRoot = (Get-Location).Path,
  [string]$CommitMessage = "Force overwrite main from local snapshot",
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"
function Say($m,$c='Gray'){ Write-Host $m -ForegroundColor $c }
function Run($cmd){ Say "[CMD] $cmd" 'Cyan'; & powershell -NoProfile -Command $cmd }

Say "[gc-overwrite] START $(Get-Date -Format o)" 'Green'
Say "[gc-overwrite] RepoRoot = $RepoRoot"

if (-not (Test-Path $RepoRoot)) { throw "[gc-overwrite] RepoRoot not found: $RepoRoot" }
Set-Location $RepoRoot

# Ensure git exists
try { & git --version | Out-Null } catch { throw "[gc-overwrite] 'git' not found in PATH." }

# Init repo if needed
$inside = $false
try { $inside = [bool](git rev-parse --is-inside-work-tree 2>$null) } catch { $inside = $false }
if (-not $inside) {
  Say "[gc-overwrite] Not a git repo. Initializing..." 'Yellow'
  Run "git init"
}

# Ensure local branch 'main'
$currentBranch = ""
try { $currentBranch = (git symbolic-ref --short -q HEAD).Trim() } catch { $currentBranch = "" }
if ($currentBranch -ne "main") {
  Say "[gc-overwrite] Switching to local 'main' (create/reset as needed)" 'Yellow'
  Run "git checkout -B main"
} else {
  Say "[gc-overwrite] On local branch 'main'"
}

# Ensure remote 'origin'
$origin = ""
try { $origin = (git remote get-url origin).Trim() } catch { $origin = "" }
if (-not $origin) {
  if (-not $Remote) {
    $Remote = Read-Host "Enter remote URL for 'origin' (e.g., https://github.com/USER/REPO.git)"
    if (-not $Remote) { throw "[gc-overwrite] No remote provided. Aborting." }
  }
  Say "[gc-overwrite] Setting remote 'origin' => $Remote" 'Yellow'
  Run "git remote add origin `"$Remote`""
} else {
  Say "[gc-overwrite] origin = $origin"
  if ($Remote -and ($origin -ne $Remote)) {
    Say "[gc-overwrite] Updating remote 'origin' to $Remote" 'Yellow'
    Run "git remote set-url origin `"$Remote`""
  }
}

# LFS safety (no-op if LFS not installed)
try {
  Run "git lfs install --local"
  Run "git lfs checkout"
} catch {
  Say "[gc-overwrite] Git LFS not installed or not required; continuing." 'DarkYellow'
}

# Snapshot remote main (backup) if it exists
Run "git fetch origin --prune" | Out-Null
$remoteMain = ""
try { $remoteMain = (git rev-parse --verify origin/main).Trim() } catch { $remoteMain = "" }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupBranch = "backup/$timestamp"
$backupTag    = "backup-pre-overwrite-$timestamp"

if ($remoteMain -and -not $NoBackup) {
  Say "[gc-overwrite] origin/main found at $remoteMain; creating remote backup..." 'Yellow'
  Run "git branch -f `"$backupBranch`" origin/main"
  Run "git push origin `"$backupBranch`":`"$backupBranch`""
  Run "git tag -f `"$backupTag`" origin/main"
  Run "git push origin `"$backupTag`""
  Say "[gc-overwrite] Backup created -> branch=$backupBranch, tag=$backupTag" 'Yellow'
} else {
  Say "[gc-overwrite] No remote main to back up OR backup disabled." 'DarkYellow'
}

# Stage & commit EVERYTHING from local folder
Run "git add -A"
try {
  Run "git commit --allow-empty -m `"$CommitMessage`""
} catch {
  Say "[gc-overwrite] Nothing to commit; proceeding." 'DarkYellow'
}

# Force-push local main to origin/main (safe force)
Run "git push -u origin main --force-with-lease"

# Diagnostics
Run "git ls-remote --heads origin"
try { Run "git lfs ls-files -l" } catch { }

Say "[gc-overwrite] DONE $(Get-Date -Format o)" 'Green'
