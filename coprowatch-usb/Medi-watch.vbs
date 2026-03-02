Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "server.exe --index index.html -p 8080 .", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:8080"