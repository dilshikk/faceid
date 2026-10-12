"""Collects CPU/RAM/disk/uptime metrics for the dashboard (TZ 4.1)."""
import time

import psutil


class ServerMetrics:
    def __init__(self, cpu_percent: float, ram_percent: float, disk_percent: float, uptime_seconds: int):
        self.cpu_percent = cpu_percent
        self.ram_percent = ram_percent
        self.disk_percent = disk_percent
        self.uptime_seconds = uptime_seconds


def collect_server_metrics() -> ServerMetrics:
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory().percent
    disk = psutil.disk_usage("/").percent
    uptime = int(time.time() - psutil.boot_time())
    return ServerMetrics(cpu, ram, disk, uptime)
