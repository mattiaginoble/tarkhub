namespace ForgeModApi.Models;

public class ServerStatus
{
    public string SptVersion { get; set; } = "";
    public bool IsRunning { get; set; }
    public string Players { get; set; } = "0/0";
    public string Uptime { get; set; } = "0s";
    public DateTime Timestamp { get; set; }
}
