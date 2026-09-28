#!/usr/bin/python3
"""Write a believable, fictitious C411 history for screenshots.

45 days of hourly readings ending at the current hour: ~118 GB/day of upload
with a weekly swing and busier evenings, plus seven one-off downloads.
Deterministic (fixed seed) apart from the end time.

    docs/demo/fake-history.py OUTPUT.jsonl
"""
import json
import math
import random
import sys
import time

random.seed(411)
TiB, GiB = 1024 ** 4, 1024 ** 3
DAYS = 45

now = int(time.time()) // 3600 * 3600
start = now - DAYS * 86400
up, down = 9.62 * TiB, 3.18 * TiB
bursts = set(random.sample(range(DAYS), 7))

with open(sys.argv[1], "w") as fh:
    for h in range(DAYS * 24 + 1):
        d, hour = divmod(h, 24)
        day_rate = 118 * GiB * (1 + 0.3 * math.sin(2 * math.pi * d / 7)) * random.uniform(0.75, 1.25)
        weight = 0.55 + 0.9 * math.exp(-(((hour - 21) % 24) ** 2) / 18) + 0.25 * math.sin(math.pi * hour / 24)
        up += day_rate / 24 * weight / 1.02
        if d in bursts and hour in (19, 20):
            down += random.uniform(12, 38) * GiB
        sample = {"t": start + h * 3600, "up": round(up), "down": round(down), "ratio": up / down, "credit": 0}
        fh.write(json.dumps(sample, separators=(",", ":")) + "\n")
