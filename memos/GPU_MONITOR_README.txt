Nib GPU Monitor Update

GPU model text replaced with GPU temperature, GPU usage, VRAM, power and fan speed. Choose the metrics in Settings > System. The resting island GPU slot shows temperature.

Telemetry uses NVIDIA nvidia-smi, polled every 4 seconds asynchronously (never blocks the Electron main event loop). The NVIDIA driver provides nvidia-smi for many desktop cards, including GTX 1660 Super. If unavailable, values show Not available instead of fabricated readings. AMD and Intel support requires separate backends.

This is a source replacement update. Back up your Nib directory and copy the files over the previous version. Verify running on Windows.
