param(
  [string]$DbHost = "localhost",
  [int]$Port = 5432,
  [string]$AdminUser = "postgres",
  [string]$AdminPassword = "postgres",
  [string]$DbName = "realtimechat",
  [string]$AppUser = "realtimechat",
  [string]$AppPassword = "realtimechat",
  [switch]$NoAlterPassword = $false,
  [switch]$WriteAppSettings = $true
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[info] $msg" -ForegroundColor Cyan }
function Write-Err($msg)  { Write-Host "[err ] $msg" -ForegroundColor Red }

# Locate psql (compatible with Windows PowerShell 5.x)
$psqlCmd = $null
try {
  $cmd = Get-Command psql -ErrorAction Stop
  if ($cmd -and $cmd.Source) { $psqlCmd = $cmd.Source }
} catch { $psqlCmd = $null }

if (-not $psqlCmd) {
  $fallback = "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe"
  if (Test-Path $fallback) { $psqlCmd = $fallback }
}
if (-not $psqlCmd) {
  Write-Err "psql not found in PATH. Please install PostgreSQL client tools."
  Write-Info "Windows (winget): winget install -e --id PostgreSQL.PostgreSQL"
  exit 1
}

Write-Info "Connecting to ${DbHost}:${Port} as admin '${AdminUser}'"
$env:PGPASSWORD = $AdminPassword
& $psqlCmd -h $DbHost -p $Port -U $AdminUser -d postgres -tAc "select 1" | Out-Null

# Build DO block with literals (no PowerShell expansion)
function Escape-SqlLiteral([string]$s) { return $s -replace "'", "''" }
$u = Escape-SqlLiteral $AppUser
$p = Escape-SqlLiteral $AppPassword
$db = Escape-SqlLiteral $DbName

$alter = if ($NoAlterPassword) { '' } else { "  EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', v_user, v_pass);" }

$template = @'
DO $do$
DECLARE
  v_user text := '%USER%';
  v_pass text := '%PASS%';
  v_db   text := '%DB%';
BEGIN
  -- Ensure role exists
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = v_user) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', v_user, v_pass);
  END IF;

%ALTER%

  -- Create DB if missing
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = v_db) THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', v_db, v_user);
  END IF;

  -- Ensure ownership
  EXECUTE format('ALTER DATABASE %I OWNER TO %I', v_db, v_user);
END;
$do$ LANGUAGE plpgsql;
'@

$sql = $template.Replace('%USER%', $u).Replace('%PASS%', $p).Replace('%DB%', $db).Replace('%ALTER%', $alter)

$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value $sql -NoNewline

Write-Info "Creating role '$AppUser' and database '$DbName' if missing"
& $psqlCmd -h $DbHost -p $Port -U $AdminUser -d postgres -f $tmp

Remove-Item $tmp -ErrorAction SilentlyContinue

# Ensure required extensions (as admin on target DB)
Write-Info "Ensuring extension uuid-ossp on database '$DbName'"
& $psqlCmd -h $DbHost -p $Port -U $AdminUser -d $DbName -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" | Out-Null

# Fix schema/object ownership and grants inside target DB
$fix = @'
DO $do$
DECLARE
  v_user text := '%USER%';
  r record;
BEGIN
  -- Schema ownership and privileges
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', v_user);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', v_user);

  -- Tables
  FOR r IN SELECT format('%I.%I', schemaname, tablename) AS obj
           FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO %I', r.obj, v_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO %I', r.obj, v_user);
  END LOOP;

  -- Sequences
  FOR r IN SELECT format('%I.%I', schemaname, sequencename) AS obj
           FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO %I', r.obj, v_user);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO %I', r.obj, v_user);
  END LOOP;

  -- Views
  FOR r IN SELECT format('%I.%I', schemaname, viewname) AS obj
           FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW %s OWNER TO %I', r.obj, v_user);
  END LOOP;

  -- Default privileges for future objects
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', v_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', v_user);
END;
$do$ LANGUAGE plpgsql;
'@
$fix = $fix.Replace('%USER%', $u)

$tmp2 = New-TemporaryFile
Set-Content -Path $tmp2 -Value $fix -NoNewline
& $psqlCmd -h $DbHost -p $Port -U $AdminUser -d $DbName -f $tmp2
Remove-Item $tmp2 -ErrorAction SilentlyContinue

# Verify app user can connect
Write-Info "Verifying credentials for user '$AppUser'"
$env:PGPASSWORD = $AppPassword
& $psqlCmd -h $DbHost -p $Port -U $AppUser -d $DbName -tAc "select 1" | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Err "App user failed to connect. Check password or pg_hba.conf rules."
  Write-Info "If needed, try restarting PostgreSQL after role changes."
}

if ($WriteAppSettings) {
  $appSettingsPath = Join-Path $PSScriptRoot "..\server\RealtimeChat.Api\appsettings.Development.json"
  $conn = "Host=$DbHost;Port=$Port;Database=$DbName;Username=$AppUser;Password=$AppPassword"
  Write-Info "Writing ConnectionStrings:Default to $appSettingsPath"

  $json = $null
  if (Test-Path $appSettingsPath) {
    try { $json = Get-Content $appSettingsPath -Raw | ConvertFrom-Json } catch { $json = $null }
  }
  if (-not $json) {
    $json = [pscustomobject]@{
      Logging = [pscustomobject]@{ LogLevel = [pscustomobject]@{ Default = "Information"; "Microsoft.AspNetCore" = "Warning" } }
    }
  }
  if (-not ($json.PSObject.Properties.Name -contains 'ConnectionStrings')) {
    $json | Add-Member -NotePropertyName ConnectionStrings -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not ($json.ConnectionStrings -is [pscustomobject])) {
    $json.ConnectionStrings = [pscustomobject]@{}
  }
  if (-not ($json.ConnectionStrings.PSObject.Properties.Name -contains 'Default')) {
    $json.ConnectionStrings | Add-Member -NotePropertyName Default -NotePropertyValue $conn
  } else {
    $json.ConnectionStrings.Default = $conn
  }

  $json | ConvertTo-Json -Depth 8 | Set-Content -Path $appSettingsPath -Encoding UTF8
  Write-Info "Updated connection string."
}

Write-Host ""
Write-Host "✅ Done. Connection string:" -ForegroundColor Green
Write-Host "Host=$DbHost;Port=$Port;Database=$DbName;Username=$AppUser;Password=$AppPassword" -ForegroundColor Green
Write-Host ""
