namespace ForgeModApi.Models;

public class ModList
{
    public string Name { get; set; } = "";
    public string SelectedSptVersion { get; set; } = "unknown";
    public List<Mod> Mods { get; set; } = new();
}