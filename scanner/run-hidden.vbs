Set objFSO = CreateObject("Scripting.FileSystemObject")
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir
' Run node scanner.js in a completely hidden window (0) and redirect output to a log file
WshShell.Run "cmd /c node scanner.js > scanner_init.log 2>&1", 0, false


