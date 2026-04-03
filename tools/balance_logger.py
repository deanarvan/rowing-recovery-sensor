#!/usr/bin/env python3
"""
balance_logger.py — Balance Board Data Logger & Visualizer

Connects to the balance board over USB serial, parses the human-readable
output, and optionally logs to CSV for later analysis.

Usage:
    python balance_logger.py                    # Auto-detect port
    python balance_logger.py /dev/ttyACM0       # Specify port
    python balance_logger.py --log session.csv   # Log to CSV file

Requirements:
    pip install pyserial

Press Ctrl+C to exit. CSV is flushed on exit.
"""

import sys
import time
import csv
import re
import serial
import serial.tools.list_ports
from datetime import datetime

BAUD = 115200

def find_port():
    """Auto-detect ESP32 serial port."""
    ports = serial.tools.list_ports.comports()
    for p in ports:
        vid = p.vid or 0
        desc = (p.description or "").lower()
        if vid == 0x303A or "esp32" in desc or "usb jtag" in desc or "usb serial" in desc:
            return p.device
    for p in ports:
        if "usb" in (p.description or "").lower():
            return p.device
    return None

def parse_data_line(line):
    """Try to extract 4 force values and metrics from a data line."""
    # Match lines like: "  123   456   78    90   | 55.2  44.8  | -0.12  0.34"
    nums = re.findall(r'[-+]?\d+\.?\d*', line)
    if len(nums) >= 8:
        return {
            'fl': float(nums[0]),
            'fr': float(nums[1]),
            'rl': float(nums[2]),
            'rr': float(nums[3]),
            'left_pct': float(nums[4]),
            'right_pct': float(nums[5]),
            'left_ap': float(nums[6]),
            'right_ap': float(nums[7]),
        }
    return None

def main():
    port = None
    log_file = None

    # Parse args
    args = sys.argv[1:]
    skip_next = False
    for i, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        if arg == '--log' and i + 1 < len(args):
            log_file = args[i + 1]
            skip_next = True
        elif not arg.startswith('--'):
            port = arg

    if not port:
        port = find_port()
        if not port:
            print("ERROR: No serial port found.")
            print("  Try: python balance_logger.py /dev/ttyACM0")
            sys.exit(1)

    print(f"Connecting to {port} at {BAUD} baud...")
    try:
        ser = serial.Serial(port, BAUD, timeout=1)
    except serial.SerialException as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    csv_writer = None
    csv_file = None
    if log_file:
        csv_file = open(log_file, 'w', newline='')
        csv_writer = csv.writer(csv_file)
        csv_writer.writerow(['timestamp', 'elapsed_s', 'fl', 'fr', 'rl', 'rr',
                            'left_pct', 'right_pct', 'left_ap', 'right_ap'])
        print(f"Logging to {log_file}")

    print("Connected. Listening...\n")
    start_time = time.time()
    samples = 0

    try:
        while True:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if not line:
                continue

            # Print everything from the board
            print(line)

            # Try to parse data lines for CSV logging
            if csv_writer:
                data = parse_data_line(line)
                if data:
                    elapsed = time.time() - start_time
                    csv_writer.writerow([
                        datetime.now().isoformat(),
                        f"{elapsed:.3f}",
                        data['fl'], data['fr'], data['rl'], data['rr'],
                        data['left_pct'], data['right_pct'],
                        data['left_ap'], data['right_ap'],
                    ])
                    samples += 1

                    # Flush every 50 samples
                    if samples % 50 == 0:
                        csv_file.flush()

    except KeyboardInterrupt:
        print(f"\n\nStopped. {samples} samples logged.")
    finally:
        ser.close()
        if csv_file:
            csv_file.close()
            print(f"CSV saved to {log_file}")

if __name__ == "__main__":
    main()
