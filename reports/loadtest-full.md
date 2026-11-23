# type-rush Load Test

Generated: 2026-11-23T10:40:15.548Z

Participant counts: 10, 25, 50, 100, 200

Each scenario spawns a fresh server and connects N real WebSocket users (8 players + N-8 spectators). Players type during the round; the server broadcasts a full snapshot to **all** N users on every event. Latency is measured from a user's send until the next snapshot that reflects it.

## Summary

| N | players | spectators | round ack p50 | round ack p95 | round ack max | round snapshots/s | round peak CPU% | round peak RSS | completed |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 8 | 2 | 1.0ms | 2.0ms | 15.0ms | 77.9 | 7.9 | 82.4 MB | yes |
| 25 | 8 | 17 | 1.0ms | 4.0ms | 20.0ms | 75.0 | 9.9 | 83.2 MB | yes |
| 50 | 8 | 42 | 1.0ms | 5.0ms | 35.0ms | 77.0 | 13.8 | 83.3 MB | yes |
| 100 | 8 | 92 | 4.0ms | 13.0ms | 35.0ms | 75.5 | 22.8 | 85.8 MB | yes |
| 200 | 8 | 192 | 16.0ms | 34.0ms | 63.0ms | 77.4 | 42.8 | 86.6 MB | yes |

## N = 10 (8 players, 2 spectators)

Total scenario duration: 10.70s · completed round: yes · peak CPU 7.9% · peak RSS 82.4 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.10s | 1.0ms | 3.3ms | 3.9ms | 4.0ms | 15 | 13.2 | 145 | 18 | 938 | 2070 | 2.0 | 81.1 MB |
| countdown | 2.97s | 4.0ms | 4.0ms | 4.0ms | 4.0ms | 1 | 1.0 | 30 | 0 | 1410 | 1416 | 2.0 | 81.2 MB |
| round | 7.65s | 1.0ms | 2.0ms | 7.6ms | 15.0ms | 588 | 77.9 | 5960 | 589 | 1501 | 1508 | 7.9 | 82.4 MB |

## N = 25 (8 players, 17 spectators)

Total scenario duration: 10.91s · completed round: yes · peak CPU 9.9% · peak RSS 83.2 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.13s | 1.0ms | 7.3ms | 7.9ms | 8.0ms | 15 | 19.5 | 550 | 33 | 1609 | 3074 | 4.0 | 80.2 MB |
| countdown | 2.94s | 9.0ms | 9.0ms | 9.0ms | 9.0ms | 1 | 1.0 | 75 | 0 | 2415 | 2421 | 4.0 | 80.8 MB |
| round | 7.90s | 1.0ms | 4.0ms | 8.2ms | 20.0ms | 585 | 75.0 | 14825 | 586 | 2506 | 2514 | 9.9 | 83.2 MB |

## N = 50 (8 players, 42 spectators)

Total scenario duration: 10.70s · completed round: yes · peak CPU 13.8% · peak RSS 83.3 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.24s | 1.0ms | 14.6ms | 15.7ms | 16.0ms | 15 | 27.8 | 1725 | 58 | 2727 | 4751 | 8.1 | 81.6 MB |
| countdown | 2.86s | 17.0ms | 17.0ms | 17.0ms | 17.0ms | 1 | 1.0 | 150 | 0 | 4090 | 4096 | 5.9 | 82.1 MB |
| round | 7.74s | 1.0ms | 5.0ms | 19.0ms | 35.0ms | 588 | 77.0 | 29800 | 589 | 4181 | 4189 | 13.8 | 83.3 MB |

## N = 100 (8 players, 92 spectators)

Total scenario duration: 10.62s · completed round: yes · peak CPU 22.8% · peak RSS 85.8 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.33s | 1.0ms | 18.9ms | 20.6ms | 21.0ms | 15 | 44.6 | 5950 | 108 | 4961 | 8099 | 14.1 | 84.4 MB |
| countdown | 2.75s | 24.0ms | 24.0ms | 24.0ms | 24.0ms | 1 | 1.1 | 300 | 0 | 7440 | 7446 | 14.0 | 85.0 MB |
| round | 7.76s | 4.0ms | 13.0ms | 21.7ms | 35.0ms | 578 | 75.5 | 58600 | 579 | 7530 | 7538 | 22.8 | 85.8 MB |

## N = 200 (8 players, 192 spectators)

Total scenario duration: 10.37s · completed round: yes · peak CPU 42.8% · peak RSS 86.6 MB

| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lobby | 1.31s | 1.0ms | 27.7ms | 32.7ms | 34.0ms | 15 | 83.3 | 21900 | 208 | 9475 | 14900 | 38.1 | 84.8 MB |
| countdown | 2.70s | 34.0ms | 34.0ms | 34.0ms | 34.0ms | 1 | 1.1 | 600 | 0 | 14240 | 14246 | 41.6 | 85.6 MB |
| round | 7.63s | 16.0ms | 34.0ms | 46.0ms | 63.0ms | 583 | 77.4 | 118200 | 584 | 14331 | 14341 | 42.8 | 86.6 MB |

## Trends

Round phase, from N=10 to N=200:
- ack p95: 2.0ms → 34.0ms (17.0×)
- ack max: 15.0ms → 63.0ms
- peak CPU: 7.9% → 42.8% (5.4×)
- peak RSS: 82.4 MB → 86.6 MB
- snapshot size (avg): 1501 → 14331 chars (9.6×)
