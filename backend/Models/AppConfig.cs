namespace ForgeModApi.Models;

public class AppConfig
{
    public string BaseUrl { get; set; } = "https://localhost:6969";
    public bool IsBehindProxy { get; set; } = false;
}