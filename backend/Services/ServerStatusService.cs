using ForgeModApi.Models;
using System.Diagnostics;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Server Status

    public async Task<ServerStatus> GetServerStatusAsync()
    {
        try
        {
            var sptVersion = GetCurrentSptVersion();
            var isRunning = IsSptServerRunning();
            var uptime = GetContainerUptime();
            var players = await GetConnectedPlayersSimpleAsync();

            return new ServerStatus
            {
                SptVersion = sptVersion,
                IsRunning = isRunning,
                Players = players,
                Uptime = uptime,
                Timestamp = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting server status");
            return new ServerStatus
            {
                SptVersion = "unknown",
                IsRunning = false,
                Players = "0/0",
                Uptime = "0s",
                Timestamp = DateTime.UtcNow
            };
        }
    }

    private async Task<string> GetConnectedPlayersSimpleAsync()
    {
        try
        {
            var profilesPath = Path.Combine(_sptServerDir, "SPT", "user", "profiles");
            if (!Directory.Exists(profilesPath))
            {
                _logger.LogWarning("Profiles directory not found: {ProfilesPath}", profilesPath);
                return "0/0";
            }

            var profileFiles = Directory.GetFiles(profilesPath, "*.json", SearchOption.TopDirectoryOnly)
                                    .Where(f => 
                                    {
                                        var fileName = Path.GetFileNameWithoutExtension(f);
                                        return System.Text.RegularExpressions.Regex.IsMatch(fileName, @"^[a-f0-9]+$");
                                    })
                                    .ToArray();

            var maxPlayers = profileFiles.Length;
            var connectedCount = await CountWebsocketConnectionsAsync();
            
            return $"{connectedCount}/{maxPlayers}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error counting players");
            return "0/0";
        }
    }

    private async Task<int> CountWebsocketConnectionsAsync()
    {
        try
        {
            var logBasePath = Path.Combine(_sptServerDir, "SPT", "user", "logs");
            if (!Directory.Exists(logBasePath))
                return 0;

            var recentLogFile = Directory.GetFiles(logBasePath, "spt*.log", SearchOption.AllDirectories)
                                    .OrderByDescending(f => File.GetLastWriteTime(f))
                                    .FirstOrDefault();

            if (recentLogFile == null)
                return 0;

            var lines = await File.ReadAllLinesAsync(recentLogFile);
            var recentLines = lines.TakeLast(50).ToArray();

            var connectionEvents = new List<string>();
            var logoutEvents = new List<string>();

            foreach (var line in recentLines)
            {
                if (line.Contains("/notifierServer/getwebsocket/"))
                {
                    var pattern = @"/notifierServer/getwebsocket/([a-f0-9]{20,})";
                    var match = System.Text.RegularExpressions.Regex.Match(line, pattern);
                    if (match.Success)
                    {
                        connectionEvents.Add(match.Groups[1].Value);
                    }
                }

                if (line.Contains("/client/game/logout"))
                {
                    logoutEvents.Add("logout");
                }
            }

            if (logoutEvents.Count > 0)
            {
                return 0;
            }
            else if (connectionEvents.Count > 0)
            {
                return 1;
            }
            else
            {
                return 0;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing websocket connections");
            return 0;
        }
    }

    private bool IsSptServerRunning()
    {
        try
        {
            var processes = Process.GetProcessesByName("SPT.Server.Linux");
            return processes.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static readonly DateTime _appStartTime = DateTime.UtcNow;

    private string GetContainerUptime()
    {
        try
        {
            var uptime = DateTime.UtcNow - _appStartTime;
            
            if (uptime.TotalHours >= 24)
            {
                var days = (int)uptime.TotalDays;
                var hours = (int)(uptime.TotalHours % 24);
                return $"{days}d {hours}h";
            }
            else if (uptime.TotalHours >= 1)
            {
                return $"{(int)uptime.TotalHours}h {uptime.Minutes}m";
            }
            else if (uptime.TotalMinutes >= 1)
            {
                return $"{uptime.Minutes}m {uptime.Seconds}s";
            }
            else
            {
                return $"{uptime.Seconds}s";
            }
        }
        catch
        {
            return "unknown";
        }
    }

    #endregion
}