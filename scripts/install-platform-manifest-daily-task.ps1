# Install or update an ordinary-user task. No admin, restart, deploy or OAuth change.
$ErrorActionPreference='Stop'
$name='Jarvis V142 Manifiesto Diario'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$js=Join-Path $root 'scripts\platform-manifest-daily-v142.mjs'
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(!(Test-Path -LiteralPath $js -PathType Leaf)){throw 'DAILY_MANIFEST_SCRIPT_MISSING'}
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$who=New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+$js+'"') -WorkingDirectory $root
$daily=New-ScheduledTaskTrigger -Daily -At '08:30'
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $name -Principal $who -Action $action -Trigger $daily -Settings $settings -Description 'Daily read-only platform manifest in Documents; no repo writes or credential changes' -Force | Out-Null
$task=Get-ScheduledTask -TaskName $name -ErrorAction Stop
$info=Get-ScheduledTaskInfo -TaskName $name
Write-Output ('MANIFEST_TASK_INSTALLED='+$task.TaskName)
Write-Output ('RUN_AS='+$account+' RUN_LEVEL='+$task.Principal.RunLevel)
Write-Output ('TRIGGER='+$task.Triggers[0].StartBoundary)
Write-Output ('START_WHEN_AVAILABLE='+$task.Settings.StartWhenAvailable)
Write-Output ('NEXT_RUN='+$info.NextRunTime)
Write-Output ('MANIFEST_OUTPUT='+ (Join-Path $env:USERPROFILE 'Documents\Jarvis-V142-Manifiestos'))
