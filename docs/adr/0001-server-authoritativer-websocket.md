# Server-authoritativer WebSocket, eine Maschine, kein Cloud

Ein Server-Process läuft auf einer Maschine im LAN (z. B. dem Laptop des Vortragenden);
alle Spieler verbinden sich per Browser via WebSocket. Der Server ist autoritativ: er
erhält jeden Keystroke und berechnet den Zustand. Kein Cloud, keine Accounts, kein
NAT-Traversal. Es gibt keinen Host-Spieler: Jeder, der die URL öffnet, ist Zuschauer und
kann sich für Runden anmelden; das Spiel startet und zirkuliert von allein.

**Considered Options**: WebRTC peer-to-peer (ein Client als Host). Abgelehnt: auf dem LAN
bietet P2P kaum Gewinn, aber deutlich mehr Komplexität (Offer/Answer, ICE, kein zentraler
autoritativer Zustand).

**Consequences**: Eine Maschine muss erreichbar sein; die Spielerzahl ist an diese
Maschine gebunden. Kein Internet nötig.
