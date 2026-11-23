# type-rush Load Test

Generated: 2026-11-23T11:13:01.230Z

Participant counts: 10, 25, 50, 100, 200

Each scenario spawns a fresh server and connects N real WebSocket users (8 players + N-8 spectators). Players type during the round; the server broadcasts a full snapshot to **all** N users on every event. Latency is measured from a user's send until the next snapshot that reflects it.

## Summary

| N | players | spectators | round ack p50 | round ack p95 | round ack max | round snapshots/s | round peak CPU% | round peak RSS | completed |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 8 | 2 | 1.0ms | 2.0ms | 14.0ms | 77.4 | 8.0 | 83.3 MB | yes |
| 25 | 8 | 17 | 2.0ms | 6.0ms | 30.0ms | 74.3 | 8.1 | 82.3 MB | yes |
| 50 | 8 | 42 | 1.0ms | 8.0ms | 23.0ms | 73.1 | 12.1 | 83.6 MB | yes |
| 100 | 8 | 92 | 1.0ms | 8.0ms | 23.0ms | 76.9 | 20.3 | 85.0 MB | yes |
| 200 | 8 | 192 | 16.0ms | 26.0ms | 54.0ms | 75.5 | 26.1 | 85.3 MB | yes |

## N = 10 (8 players, 2 spectators)

Total scenario duration: 10.50s · completed round: yes · peak CPU 8.0% · peak RSS 83.3 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.10s | 1.0ms | 7.0ms | 7.0ms | 7.0ms | 15 | 13.1 | 145 | 18 | 511 | 1413 | 2.0 | 81.6 MB |
| countdown | 2.94s | 8.0ms | 8.0ms | 8.0ms | 8.0ms | 1 | 1.0 | 30 | 0 | 1283 | 1289 | 2.0 | 81.9 MB |
| round | 7.52s | 1.0ms | 2.0ms | 11.0ms | 14.0ms | 574 | 77.4 | 5820 | 575 | 1372 | 1381 | 8.0 | 83.3 MB |

## N = 25 (8 players, 17 spectators)

Total scenario duration: 10.79s · completed round: yes · peak CPU 8.1% · peak RSS 82.3 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.11s | 0.0ms | 8.3ms | 8.9ms | 9.0ms | 15 | 19.8 | 550 | 33 | 390 | 1414 | 3.9 | 79.2 MB |
| countdown | 2.93s | 10.0ms | 10.0ms | 10.0ms | 10.0ms | 1 | 1.0 | 75 | 0 | 1284 | 1290 | 4.0 | 79.8 MB |
| round | 7.81s | 2.0ms | 6.0ms | 27.3ms | 30.0ms | 572 | 74.3 | 14500 | 573 | 1373 | 1382 | 8.1 | 82.3 MB |

## N = 50 (8 players, 42 spectators)

Total scenario duration: 10.80s · completed round: yes · peak CPU 12.1% · peak RSS 83.6 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.26s | 0.0ms | 14.3ms | 14.9ms | 15.0ms | 15 | 27.3 | 1725 | 58 | 305 | 1413 | 8.0 | 79.9 MB |
| countdown | 2.84s | 16.0ms | 16.0ms | 16.0ms | 16.0ms | 1 | 1.1 | 150 | 0 | 1284 | 1290 | 6.0 | 81.1 MB |
| round | 7.85s | 1.0ms | 8.0ms | 17.0ms | 23.0ms | 566 | 73.1 | 28700 | 567 | 1372 | 1382 | 12.1 | 83.6 MB |

## N = 100 (8 players, 92 spectators)

Total scenario duration: 9.89s · completed round: yes · peak CPU 20.3% · peak RSS 85.0 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.32s | 0.0ms | 20.9ms | 22.6ms | 23.0ms | 15 | 44.9 | 5950 | 108 | 242 | 1410 | 14.1 | 83.8 MB |
| countdown | 2.75s | 25.0ms | 25.0ms | 25.0ms | 25.0ms | 1 | 1.1 | 300 | 0 | 1284 | 1290 | 11.8 | 84.2 MB |
| round | 7.04s | 1.0ms | 8.0ms | 14.7ms | 23.0ms | 534 | 76.9 | 54200 | 535 | 1369 | 1378 | 20.3 | 85.0 MB |

## N = 200 (8 players, 192 spectators)

Total scenario duration: 10.83s · completed round: yes · peak CPU 32.1% · peak RSS 85.3 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.40s | 0.0ms | 17.6ms | 18.7ms | 19.0ms | 15 | 78.1 | 21900 | 208 | 203 | 1418 | 32.1 | 84.0 MB |
| countdown | 2.69s | 21.0ms | 21.0ms | 21.0ms | 21.0ms | 1 | 1.1 | 600 | 0 | 1285 | 1291 | 25.7 | 85.2 MB |
| round | 8.04s | 16.0ms | 26.0ms | 29.0ms | 54.0ms | 599 | 75.5 | 121400 | 600 | 1376 | 1384 | 26.1 | 85.3 MB |

## Trends

Round phase, from N=10 to N=200:
- ack p95: 2.0ms → 26.0ms (13.0×)
- ack max: 14.0ms → 54.0ms
- peak CPU: 8.0% → 26.1% (3.3×)
- peak RSS: 83.3 MB → 85.3 MB
- snapshot size (avg): 1372 → 1376 chars (1.0×)
