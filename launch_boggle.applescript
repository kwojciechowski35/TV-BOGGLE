on run
	set boggleDir to "/Users/kamil/Documents/Wynalazki/TV-BOGGLE"
	
	-- Kill existing server on port 3000
	try
		do shell script "lsof -t -i:3000 | xargs kill -9"
	on error
		-- Ignore if no process found
	end try
	
	delay 0.5
	
	-- Start Node server
	do shell script "export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd " & quoted form of boggleDir & "; node server.js > /tmp/boggle_server.log 2>&1 &"
	
	-- Wait for server to be ready
	set serverReady to false
	repeat 20 times
		try
			do shell script "curl -s -o /dev/null http://localhost:3000/host/"
			set serverReady to true
			exit repeat
		end try
		delay 0.5
	end repeat
	
	if serverReady then
		-- Open in Safari
		tell application "Safari"
			activate
			make new document with properties {URL:"http://localhost:3000/host"}
		end tell
		
		delay 1.5
		
		-- Try fullscreen (needs Accessibility permissions)
		try
			tell application "System Events"
				tell process "Safari"
					set frontmost to true
					keystroke "f" using {control down, command down}
				end tell
			end tell
		on error
			-- Silently continue if no permissions — user can click ⛶ button on page
		end try
	else
		display dialog "Serwer Boggle nie uruchomił się. Sprawdź /tmp/boggle_server.log" buttons {"OK"} default button "OK" with icon caution
	end if
end run
