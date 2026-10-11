sudo journalctl -u tablowatcherservice -f
# last 200 lines, then follow
sudo journalctl -u tablowatcherservice -n 200 -f

# only today
sudo journalctl -u tablowatcherservice --since today

# grep for Tablo request/response logs
sudo journalctl -u tablowatcherservice -f | grep -E "Tablo request|Tablo response"