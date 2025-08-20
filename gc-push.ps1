[CmdletBinding()]
param(
  [string]$Message = $(Get-Date -Format "auto: GameCast update yyyy-MM-dd HH:mm:ss"),
  [string]$RemoteUrl = "https://github.com/chandlermoore25/gamecast-3d.git",
  [string]$Branch = "main",
  [switch]$AllowEmpty,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
function Log([string]$msg){ Write-Host ("[gc-push] " + $msg) }

# Resolve git.exe explicitly to avoid recursion/collision with functions/aliases
try {
  $GitExe = (Get-Command git.exe -ErrorAction Stop).Source
} catch {
  throw "[git not found] Install Git for Windows: https://git-scm.com/download/win"
}
function RunGit {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args = @())
  if (-not $Args -or $Args.Count -eq 0){
    throw "internal: RunGit called without arguments"
  }
  Log ("git " + ($Args -join " "))
  if ($DryRun) { return }
  & $GitExe @Args
  if ($LASTEXITCODE -ne 0) {
    throw ("git " + ($Args -join " ") + " failed with exit code " + $LASTEXITCODE)
  }
}

# Move to the script folder (repo root expected)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# Start transcript log
$logFile = Join-Path $here ("gc-push_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")
try { Start-Transcript -Path $logFile -Force | Out-Null } catch {}

Log ("start " + (Get-Date -Format "u") + " in " + $here)
RunGit --version | Out-Null

# Are we in a git repo?
$inside = $false
try { $inside = ((& $GitExe rev-parse --is-inside-work-tree) -eq "true") } catch { $inside = $false }
if (-not $inside){
  Log "not inside a git repository -> initializing"
  $inited = $false
  try { RunGit init -b $Branch; $inited = $true } catch { $inited = $false }
  if (-not $inited){
    RunGit init
    RunGit checkout -B $Branch
  }
  try { RunGit remote add origin $RemoteUrl } catch { Log "origin already exists or could not be added (non-blocking)" }
  Log ("initialized repo and set origin to " + $RemoteUrl)
} else {
  Log "already inside a git repo"
  # Ensure origin remote exists & points where we expect
  $hasOrigin = $false
  try {
    $remotes = (& $GitExe remote) -split "`n"
    $hasOrigin = $remotes -contains "origin"
  } catch { $hasOrigin = $false }
  if (-not $hasOrigin){
    RunGit remote add origin $RemoteUrl
    Log ("added origin " + $RemoteUrl)
  } else {
    try {
      $cur = & $GitExe remote get-url origin
      if ($cur -ne $RemoteUrl -and $RemoteUrl) {
        RunGit remote set-url origin $RemoteUrl
        Log ("updated origin to " + $RemoteUrl)
      } else {
        Log "origin already set correctly"
      }
    } catch {
      Log "origin url check failed, proceeding"
    }
  }
}

# Configure identity locally if missing (repo-only)
try {
  $uname = & $GitExe config user.name
  $uemail = & $GitExe config user.email
  if (-not $uname) { & $GitExe config user.name "GameCast Local" | Out-Null; Log "set repo user.name to 'GameCast Local'" }
  if (-not $uemail){ & $GitExe config user.email "local@gc" | Out-Null; Log "set repo user.email to 'local@gc'" }
} catch { Log "could not set user.name/email (non-blocking)" }

# Ensure target branch
try {
  $branchNow = & $GitExe branch --show-current
  if (-not $branchNow) { RunGit checkout -B $Branch }
  elseif ($branchNow -ne $Branch) { RunGit checkout $Branch }
} catch {
  RunGit checkout -B $Branch
}

# Fetch & attempt rebase; auto-handle unstaged changes by stashing
RunGit fetch origin
$pulled = $false
try {
  RunGit pull --rebase origin $Branch
  $pulled = $true
} catch {
  $msg = $_.Exception.Message
  if ($msg -match 'You have unstaged changes' -or $msg -match 'Please commit or stash them') {
    Log "detected unstaged changes during pull -- rebase: stashing"
    & $GitExe stash push -u -k -m "auto: pre-pull stash $(Get-Date -Format u)" | Out-Null
    try {
      RunGit pull --rebase origin $Branch
      $pulled = $true
    } finally {
      # try to pop stash back
      $stashes = & $GitExe stash list
      if ($stashes) {
        Log "restoring stashed changes"
        & $GitExe stash pop | Out-Null
      }
    }
  } else {
    Log "pull --rebase failed, continuing with local-first push flow"
  }
}

# Stage & commit
RunGit add -A
$status = & $GitExe status --porcelain
if (-not $status){
  if ($AllowEmpty) {
    Log "working tree clean, creating an empty commit to trigger deploy"
    RunGit commit --allow-empty -m $Message
  } else {
    Log "nothing to commit - working tree clean"
    try {
      RunGit push -u origin $Branch
    } catch {
      throw "push failed - check your GitHub remote permissions (HTTPS token or SSH)"
    }
    Log "done."
    try { Stop-Transcript | Out-Null } catch {}
    if (-not $DryRun) { exit 0 }
  }
} else {
  RunGit commit -m $Message
}

# Push
try {
  RunGit push -u origin $Branch
} catch {
  throw "push failed - check your GitHub remote permissions (HTTPS token or SSH)"
}
Log "done."
try { Stop-Transcript | Out-Null } catch {}
