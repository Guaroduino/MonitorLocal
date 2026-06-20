Set WshShell = CreateObject("WScript.Shell")
' Run node scanner.js in a completely hidden window (0) and do not wait for completion (false)
WshShell.Run "node scanner.js", 0, false
