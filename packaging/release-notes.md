## Download and install

Pick the file for your system under **Assets** below. The packages include everything the
app needs, so there's nothing else to install first.

| Your system | Download |
|---|---|
| Ubuntu, Debian, Linux Mint (typical PC) | `tablowatcherservice_@VERSION@_amd64.deb` |
| Raspberry Pi OS, 64-bit | `tablowatcherservice_@VERSION@_arm64.deb` |
| Fedora, openSUSE (typical PC) | `tablowatcherservice-@VERSION@-1.x86_64.rpm` |
| Fedora, openSUSE (ARM) | `tablowatcherservice-@VERSION@-1.aarch64.rpm` |

`SHA256SUMS` is for checking the download, and GitHub adds the "Source code" archives
automatically - you don't need either to install.

Then install it from the folder you downloaded it to (keep the `./`), for example:

```bash
cd ~/Downloads
sudo apt install ./tablowatcherservice_@VERSION@_amd64.deb
```

On Fedora or openSUSE, use `sudo dnf install ./…rpm` (or `sudo zypper install ./…rpm`)
instead.

Tablo Watcher then runs in the background and starts with your computer. Open
**http://localhost:8080**, or **Tablo Watcher** in your app menu. To reach it from another
device on your network, use this computer's address on port 8080.

**Updating:** download the newer package from a later release and install it the same way. It
upgrades in place and keeps your settings.

**Uninstalling:** `sudo apt remove tablowatcherservice` (or `sudo dnf remove tablowatcherservice`).

More details are in the [README](https://github.com/Alfetta159/TabloWatcherService#installing-on-linux).
