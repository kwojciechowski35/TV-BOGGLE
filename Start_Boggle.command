#!/bin/bash
# Navigate to the project directory explicitly
cd "/Users/kamil/Documents/Wynalazki/TV-BOGGLE"

# Get local IP (try Wi-Fi first, then Ethernet)
IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
    IP=$(ipconfig getifaddr en1)
fi
if [ -z "$IP" ]; then
    IP="SPRAWDŹ W USTAWIENIACH SIECI"
fi

clear
echo "==================================================="
echo "      ⛏️  BOGGLE TV SERVER - URUCHOMIONY  ⛏️"
echo "==================================================="
echo ""
echo "  1. Upewnij się, że TV i ten Mac są w tej samej sieci Wi-Fi."
echo "  2. Otwórz Boggle na Android TV."
echo "  3. Wpisz ten adres IP:"
echo ""
echo "      👉   $IP   👈"
echo ""
echo "  🇵🇱 Wersja Polska:   http://$IP:3000/host"
echo "  🏔️  Wersjo Ślōnsko:  http://$IP:3000/host-szl"
echo ""
echo "==================================================="
echo "  Nie zamykaj tego okna podczas gry!"
echo "==================================================="
echo ""

# Start Node.js server
/opt/homebrew/bin/node server.js || node server.js

