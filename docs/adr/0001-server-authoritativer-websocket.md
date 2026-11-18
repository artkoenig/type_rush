# Server-authoritativer WebSocket, host-gestartet, kein Cloud

Ein Spieler (Host) betreibt den Spiel-Server; alle Spieler verbinden sich per Browser via
WebSocket. Der Server ist autoritativ: er erhält jeden Keystroke und berechnet den Zustand.
Kein Cloud, keine Accounts, kein NAT-Traversal.

**Considered Options**: WebRTC peer-to-peer (ein Client als Host). Abgelehnt: auf dem LAN
bietet P2P kaum Gewinn, aber deutlich mehr Komplexität (Offer/Answer, ICE, kein zentraler
autoritativer Zustand).

**Consequences**: Ein Host muss erreichbar sein; die Spielerzahl ist an die Host-Maschine
gebunden. Kein Internet nötig.
