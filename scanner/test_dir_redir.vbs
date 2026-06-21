Set objFSO = CreateObject("Scripting.FileSystemObject")
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c dir > scanner_dir.log 2>&1", 0, true
WScript.Echo "Executed cmd /c dir redirection in CWD: " & scriptDir
